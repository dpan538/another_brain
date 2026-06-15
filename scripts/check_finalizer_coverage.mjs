#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/finalizer_coverage_report.json");

async function text(path) {
  return readFile(resolve(ROOT, path), "utf8");
}

async function main() {
  const app = await text("web/app.js");
  const dialog = await text("scripts/dialog_runtime.mjs");
  const firewall = await text("web/fallback_firewall.js");
  const failures = [];

  if (!/import \{ finalizeWithFallbackFirewall \}/.test(app) || !/function commitAnswer[\s\S]*finalizeWithFallbackFirewall/.test(app)) {
    failures.push("web_app_commit_answer_missing_firewall");
  }
  const commitStart = app.indexOf("function commitAnswer");
  const commitEnd = app.indexOf("function setContextOpen");
  const lines = app.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!/setAnswer\(/.test(line)) return;
    const pos = app.indexOf(line);
    const inCommit = pos >= commitStart && pos <= commitEnd;
    const allowedClear = /setAnswer\(\"\"\)/.test(line);
    const allowedError = /setAnswer\(\"我卡住了/.test(line);
    if (!inCommit && !allowedClear && !allowedError && !/function setAnswer/.test(line)) {
      failures.push(`web_app_set_answer_outside_commit_answer:${index + 1}`);
    }
  });
  if (!/const resolved = resolveAnswer[\s\S]*finalizeWithFallbackFirewall[\s\S]*runtime\.contextTurns\.push/.test(dialog)) {
    failures.push("dialog_runtime_finalizer_not_between_resolve_and_store");
  }
  if (!/class FallbackFirewall/.test(firewall) || !/classifyFallbackShape/.test(firewall)) {
    failures.push("fallback_firewall_missing_shape_classifier");
  }

  const report = {
    ok: failures.length === 0,
    generated_at: new Date().toISOString(),
    answer_sources_checked: ["direct", "tiny_router", "structured", "operation", "fallback", "web_app"],
    failures
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, failures, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
