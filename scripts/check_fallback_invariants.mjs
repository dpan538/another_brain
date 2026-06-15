#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";
import { bareFallbackId, classifyFallbackShape, mentionsGenericFallback } from "../web/generic_fallback_classifier.js?v=1";

const OUT = resolve(ROOT, "artifacts/training_os/fallback_invariant_report.json");
const GENERIC = ["你需要提问。", "你要问哪一边？", "也许发生过，不在我眼前。", "你应该去问百度。", "我只是个对话框。"];

async function exists(path) {
  try {
    await readFile(resolve(ROOT, path), "utf8");
    return true;
  } catch {
    return false;
  }
}

async function readJsonlRows(dir) {
  const rows = [];
  try {
    const files = (await readdir(resolve(ROOT, dir))).filter((file) => file.endsWith(".jsonl"));
    for (const file of files) {
      const text = await readFile(resolve(ROOT, dir, file), "utf8");
      for (const [index, line] of text.split(/\r?\n/).filter(Boolean).entries()) {
        rows.push({ file: join(dir, file), index: index + 1, row: JSON.parse(line) });
      }
    }
  } catch {
    return rows;
  }
  return rows;
}

function evalRowsMisuse(rows) {
  const failures = [];
  for (const { file, index, row } of rows) {
    for (const field of ["must_include_any", "expected_answer", "final_answer"]) {
      const value = row[field];
      const items = Array.isArray(value) ? value : value ? [value] : [];
      for (const item of items) {
        if (GENERIC.some((text) => String(item || "").trim() === text)) {
          failures.push(`${file}:${index}:generic_fallback_as_expected:${field}`);
        }
      }
    }
  }
  return failures;
}

async function runtimeSmoke() {
  const prompts = [
    "罗大佑是谁？",
    "罗大佑你知道吗？",
    "日本文学是什么？",
    "你读过日本文学吗？",
    "我需要怎么提问？",
    "你知道我要干什么吗？",
    "A比B高，B比C高，谁最高？"
  ];
  const failures = [];
  for (const prompt of prompts) {
    const runtime = createDialogRuntime();
    const turn = await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false });
    const shape = classifyFallbackShape({ answer: turn.answer, questionType: turn.trace?.question_type || "", operation: turn.trace?.operation || "" });
    const bareId = bareFallbackId(turn.answer);
    if (bareId || (mentionsGenericFallback(turn.answer).length && !["repair_quote", "specific_clarification"].includes(shape.kind))) {
      failures.push({ prompt, answer: turn.answer, shape, bareId });
    }
  }
  return failures;
}

async function main() {
  const failures = [];
  const required = ["web/fallback_registry.js", "web/generic_fallback_classifier.js", "web/fallback_firewall.js"];
  for (const path of required) if (!(await exists(path))) failures.push(`missing:${path}`);

  const firewall = await readFile(resolve(ROOT, "web/fallback_firewall.js"), "utf8");
  const app = await readFile(resolve(ROOT, "web/app.js"), "utf8");
  const dialog = await readFile(resolve(ROOT, "scripts/dialog_runtime.mjs"), "utf8");
  if (!/classifyFallbackShape/.test(firewall)) failures.push("firewall_not_shape_based");
  if (!/finalizeWithFallbackFirewall/.test(app)) failures.push("web_app_missing_finalizer");
  if (!/finalizeWithFallbackFirewall/.test(dialog)) failures.push("dialog_runtime_missing_finalizer");

  const evalRows = [...(await readJsonlRows("evals/p0_lobotomy")), ...(await readJsonlRows("evals/canary_anti_lobotomy"))];
  failures.push(...evalRowsMisuse(evalRows));
  const runtimeFailures = await runtimeSmoke();
  for (const failure of runtimeFailures) failures.push(`runtime_illegal_fallback:${failure.prompt}`);

  const report = {
    ok: failures.length === 0,
    generated_at: new Date().toISOString(),
    central_registry_present: await exists("web/fallback_registry.js"),
    checked_eval_rows: evalRows.length,
    runtime_smoke_failures: runtimeFailures,
    failures
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, failures: failures.length, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
