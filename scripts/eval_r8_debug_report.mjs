#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDebugReport, validateDebugReport } from "../web/debug_report.js?v=1";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = resolve(ROOT, "artifacts/release/r8_debug_report_workflow.json");
const SENSITIVE_RE =
  /\/Users\/|\/Volumes\/|VERCEL_TOKEN|API_KEY|SECRET_KEY|PRIVATE_KEY|BEGIN RSA PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY|身份证|银行卡|护照|签证|住址|地址|手机号|password|token/i;

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--out") args.out = resolve(ROOT, argv[++index]);
    else if (item === "--help") {
      console.log("Usage: node scripts/eval_r8_debug_report.mjs [--out path]");
      process.exit(0);
    }
  }
  return args;
}

function checkNoSensitive(label, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return SENSITIVE_RE.test(text) ? [`${label}:sensitive_content`] : [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appJs = await readFile(resolve(ROOT, "web/app.js"), "utf8");
  const sample = buildDebugReport({
    appVersion: "0.1.0",
    commit: "local-test",
    modelVersion: "tiny-router:test",
    lastEvent: {
      route: "direct",
      intent: "help_start",
      contextAction: "ANSWER_HELP",
      answerSource: "direct",
      sanitizerChanged: false,
      latencyMs: 681.4,
      failureTag: "none"
    },
    includeTranscript: false
  });
  const validation = validateDebugReport(sample);
  const failures = [
    ...validation.failures,
    ...checkNoSensitive("sample_report", sample)
  ];

  if (!appJs.includes("window.exportAnotherBrainDebugReport")) failures.push("app_export_hook_missing");
  if (!appJs.includes("includeTranscript: Boolean(options.includeTranscript)")) failures.push("explicit_transcript_opt_in_missing");
  if (!appJs.includes("Alt") && !appJs.includes("altKey")) failures.push("hidden_keyboard_entry_missing");
  if ("transcript" in sample) failures.push("transcript_in_default_report");

  const report = {
    ok: failures.length === 0,
    summary: {
      schemaVersion: sample.schema_version,
      canGenerate: validation.ok,
      defaultIncludesTranscript: Boolean(sample.include_transcript),
      sensitiveViolations: failures.filter((item) => item.includes("sensitive")).length,
      failures: failures.length
    },
    sample,
    failures
  };
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
