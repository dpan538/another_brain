#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const DIR = resolve(ROOT, "evals/r19_mobile_density");
const OUT = resolve(ROOT, "artifacts/training_os/r19_mobile_answer_density_report.json");

async function rows() {
  const files = (await readdir(DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const out = [];
  for (const file of files) {
    const text = await readFile(join(DIR, file), "utf8");
    for (const line of text.split(/\r?\n/).filter(Boolean)) out.push({ ...JSON.parse(line), file });
  }
  return out;
}

function sentenceCount(text = "") {
  return String(text).split(/[。！？!?]/).filter((part) => part.trim()).length;
}

function includesAny(answer, terms = []) {
  return !terms?.length || terms.some((term) => String(answer || "").includes(term));
}

async function runCase(spec) {
  const runtime = createDialogRuntime();
  const prompts = Array.isArray(spec.turns) ? spec.turns : [spec.prompt || ""];
  const turns = [];
  for (const item of prompts) turns.push(await answerDialogPrompt(item.user || item.prompt || item, runtime, { withThinkingDelay: false, uiProfile: "mobile" }));
  const turn = turns.at(-1) || {};
  const answer = turn.answer || "";
  const failures = [];
  if (spec.max_chars_zh && answer.length > spec.max_chars_zh) failures.push(`too_long:${answer.length}`);
  if (spec.max_sentences && sentenceCount(answer) > spec.max_sentences) failures.push(`too_many_sentences:${sentenceCount(answer)}`);
  if ((answer.match(/[，、；]/g) || []).length > 8) failures.push("dense_punctuation");
  if (!includesAny(answer, spec.must_include_any || [])) failures.push("lost_required_anchor");
  return { id: spec.id, file: spec.file, ok: failures.length === 0, failures, answer };
}

async function main() {
  const specs = await rows();
  const results = [];
  for (const spec of specs) results.push(await runCase(spec));
  const failed = results.filter((row) => !row.ok);
  const report = {
    ok: failed.length === 0,
    generated_at: new Date().toISOString(),
    summary: { total: results.length, passed: results.length - failed.length, failed: failed.length, pass_rate: specs.length ? (specs.length - failed.length) / specs.length : 1 },
    failures: failed.slice(0, 80)
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, summary: report.summary, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
