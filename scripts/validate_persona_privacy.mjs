#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/training_os/persona_privacy_validation_report.json");

const SOURCE_FRAMING_PATTERNS = [
  /according to your file/i,
  /according to your website/i,
  /根据你的文件/,
  /根据你的网站/,
  /你的文件里写/
];

const HIGH_RISK_PATTERNS = [
  { name: "macos_user_path", pattern: /\/Users\/[^\s"'`<>]+/ },
  { name: "macos_volume_path", pattern: /\/Volumes\/[^\s"'`<>]+/ },
  { name: "linux_home_path", pattern: /\/home\/[^\s"'`<>]+/ },
  { name: "windows_absolute_path", pattern: /\b[A-Za-z]:\\[^\s"'`<>]+/ },
  { name: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { name: "phone_like_long_digits", pattern: /(?<![A-Za-z0-9])(?:\+?\d[\d\s().-]{7,}\d)(?![A-Za-z0-9])/ },
  { name: "id_keyword_with_number", pattern: /\b(?:passport|visa|bank|account|id|身份证|护照|签证|银行|账号)[^\n]{0,24}\d{4,}/i },
  { name: "gps_coordinates", pattern: /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/ },
  { name: "docx_artifact_reference", pattern: /\.docx\b/i },
  { name: "raw_report_path_hint", pattern: /deep research report path|raw report path/i },
  ...SOURCE_FRAMING_PATTERNS.map((pattern, index) => ({ name: `source_framing_${index + 1}`, pattern }))
];

function parseArgs(argv) {
  for (const item of argv) {
    if (item === "--help" || item === "-h") {
      console.log("Usage: node scripts/validate_persona_privacy.mjs");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${item}`);
  }
}

async function existingFiles(dir, filter) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && filter(entry.name))
      .map((entry) => resolve(dir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

async function scanTargets() {
  return [
    ...(await existingFiles(resolve(ROOT, "docs"), (name) => /^persona_.*\.md$/.test(name))),
    ...(await existingFiles(resolve(ROOT, "docs"), (name) => /^personal_fact.*\.md$/.test(name))),
    ...(await existingFiles(resolve(ROOT, "identity_pack"), (name) => /\.(json|jsonl)$/.test(name))),
    ...(await existingFiles(resolve(ROOT, "evals/persona"), (name) => name.endsWith(".jsonl")))
  ];
}

function isAllowedSourceFramingContext(file, pathParts) {
  const fileName = file.split("/").pop();
  const path = pathParts.join(".");
  if (/forbidden_source_framing|must_not_include/.test(path)) return true;
  if (fileName === "source_leak.jsonl" && /(^|\.)prompt$/.test(path)) return true;
  return false;
}

function scanString(text, file, pathParts = []) {
  const findings = [];
  for (const { name, pattern } of HIGH_RISK_PATTERNS) {
    if (name === "phone_like_long_digits") {
      const phoneCandidates = [...String(text || "").matchAll(/(?<![A-Za-z0-9])(?:\+?\d[\d\s().-]{7,}\d)(?![A-Za-z0-9])/g)].filter((match) => {
        const value = match[0].trim();
        if (/^\d{4}\s*[-–]\s*\d{4}$/.test(value)) return false;
        if (/^\d{4}\s+to\s+\d{4}$/i.test(value)) return false;
        return true;
      });
      if (!phoneCandidates.length) continue;
    } else if (!pattern.test(text)) {
      continue;
    }
    if (name.startsWith("source_framing") && isAllowedSourceFramingContext(file, pathParts)) continue;
    findings.push({
      file,
      path: pathParts.join(".") || "<raw>",
      check: name,
      severity: "high"
    });
  }
  return findings;
}

function walkJson(value, file, pathParts = []) {
  if (typeof value === "string") return scanString(value, file, pathParts);
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => walkJson(item, file, [...pathParts, String(index)]));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => walkJson(item, file, [...pathParts, key]));
  }
  return [];
}

function scanJsonl(content, file) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      findings.push(...walkJson(JSON.parse(line), file, [`line_${index + 1}`]));
    } catch (error) {
      findings.push({ file, path: `line_${index + 1}`, check: "invalid_json", severity: "high", detail: error.message });
    }
  }
  return findings;
}

function scanJson(content, file) {
  try {
    return walkJson(JSON.parse(content), file);
  } catch (error) {
    return [{ file, path: "<json>", check: "invalid_json", severity: "high", detail: error.message }];
  }
}

function scanMarkdown(content, file) {
  return scanString(content, file);
}

async function main() {
  parseArgs(process.argv.slice(2));
  const targets = await scanTargets();
  const findings = [];
  for (const file of targets) {
    const content = await readFile(file, "utf8");
    if (file.endsWith(".jsonl")) findings.push(...scanJsonl(content, file));
    else if (file.endsWith(".json")) findings.push(...scanJson(content, file));
    else findings.push(...scanMarkdown(content, file));
  }

  const highRisk = findings.filter((item) => item.severity === "high");
  const report = {
    ok: highRisk.length === 0,
    generated_at: new Date().toISOString(),
    scanned_files: targets,
    summary: {
      scanned_files: targets.length,
      findings: findings.length,
      high_risk: highRisk.length,
      report_path: OUT
    },
    findings
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(report.summary, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
