#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/training_os/persona_overfit_validation_report.json");

const MIMICRY_TERMS = [/照抄/, /copy exactly/i, /完全模仿/];
const SOURCE_FRAMING_TERMS = [/根据你的文件/, /根据你的网站/, /according to your file/i, /according to your website/i, /your file says/i];

function parseArgs(argv) {
  for (const item of argv) {
    if (item === "--help" || item === "-h") {
      console.log("Usage: node scripts/validate_persona_overfit.mjs");
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

async function targetFiles() {
  return [
    resolve(ROOT, "identity_pack/approved_persona_cards.example.jsonl"),
    resolve(ROOT, "identity_pack/approved_personal_facts.example.jsonl"),
    resolve(ROOT, "identity_pack/manual_seed_persona_cards.example.jsonl"),
    resolve(ROOT, "identity_pack/rejected_persona_cards.example.jsonl"),
    ...(await existingFiles(resolve(ROOT, "evals/persona"), (name) => name.endsWith(".jsonl")))
  ];
}

async function loadRows(file) {
  const content = await readFile(file, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { row: JSON.parse(line), line: index + 1 };
      } catch (error) {
        return { error: error.message, line: index + 1, row: null };
      }
    });
}

function arr(row, key) {
  return Array.isArray(row?.[key]) ? row[key] : [];
}

function hasAnyTerm(text, terms) {
  return terms.some((pattern) => pattern.test(String(text || "")));
}

function goodBehaviorText(row) {
  return [
    row.expected_answer_policy,
    row.answer_policy,
    row.acceptable_answer_shape,
    ...arr(row, "must_include_any")
  ].join("\n");
}

function hasNegativeConstraints(row) {
  return (
    arr(row, "must_not_include").length > 0 ||
    arr(row, "forbidden_phrases_from_sources").length > 0 ||
    arr(row, "forbidden_identity_claims").length > 0 ||
    arr(row, "forbidden_source_framing").length > 0
  );
}

function validateRow(fileName, row, line, mustIncludeCounts) {
  const issues = [];
  if (!row) return issues;

  if (hasAnyTerm(goodBehaviorText(row), MIMICRY_TERMS)) {
    issues.push({ file: fileName, line, check: "mimicry_as_good_behavior" });
  }

  if (hasAnyTerm(goodBehaviorText(row), SOURCE_FRAMING_TERMS)) {
    issues.push({ file: fileName, line, check: "source_framing_as_good_behavior" });
  }

  for (const term of arr(row, "must_include_any")) {
    if (String(term).length > 60) {
      issues.push({ file: fileName, line, check: "must_include_too_long", term });
    }
    if (String(term).trim().length >= 8) {
      mustIncludeCounts.set(term, (mustIncludeCounts.get(term) || 0) + 1);
    }
  }

  for (const key of ["final_answer", "draft_answer", "answer", "acceptable_answer"]) {
    if (typeof row[key] === "string" && row[key].length > 500) {
      issues.push({ file: fileName, line, check: "final_like_answer_too_long", field: key });
    }
  }

  if ((row.privacy_risk === "high" || row.overfit_risk === "high") && !hasNegativeConstraints(row)) {
    issues.push({ file: fileName, line, check: "high_risk_without_forbidden_fields" });
  }

  if (fileName === "anti_overfit.jsonl" && !arr(row, "must_not_include").length && !arr(row, "forbidden_phrases_from_sources").length) {
    issues.push({ file: fileName, line, check: "anti_overfit_missing_negative_constraints" });
  }

  if (fileName === "source_leak.jsonl" && !arr(row, "forbidden_source_framing").length) {
    issues.push({ file: fileName, line, check: "source_leak_missing_forbidden_source_framing" });
  }

  return issues;
}

async function main() {
  parseArgs(process.argv.slice(2));
  const files = await targetFiles();
  const issues = [];
  const mustIncludeCounts = new Map();
  let totalRows = 0;

  for (const file of files) {
    const fileName = file.split("/").pop();
    const rows = await loadRows(file);
    for (const item of rows) {
      if (item.error) {
        issues.push({ file: fileName, line: item.line, check: "invalid_json", detail: item.error });
        continue;
      }
      totalRows += 1;
      issues.push(...validateRow(fileName, item.row, item.line, mustIncludeCounts));
    }
  }

  for (const [term, count] of mustIncludeCounts.entries()) {
    if (count > 8) {
      issues.push({ file: "<aggregate>", line: 0, check: "must_include_repeated_too_often", term, count });
    }
  }

  const report = {
    ok: issues.length === 0,
    generated_at: new Date().toISOString(),
    scanned_files: files,
    summary: {
      scanned_files: files.length,
      total_rows: totalRows,
      issues: issues.length,
      report_path: OUT
    },
    issues
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
