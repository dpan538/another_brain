#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const DIR = resolve(ROOT, "evals/canary_anti_lobotomy");
const OUT = resolve(ROOT, "artifacts/training_os/route_trace_canary_report.json");

async function rows() {
  const files = (await readdir(DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const out = [];
  for (const file of files) {
    const text = await readFile(join(DIR, file), "utf8");
    for (const line of text.split(/\r?\n/).filter(Boolean)) out.push({ file, ...JSON.parse(line) });
  }
  return out.slice(0, 50);
}

async function main() {
  const traces = [];
  for (const spec of await rows()) {
    const runtime = createDialogRuntime();
    const prompt = spec.prompt || spec.turns?.find((turn) => !turn.assistant)?.user || "";
    const turn = await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false });
    traces.push({
      id: spec.id,
      file: spec.file,
      query: prompt,
      answer: turn.answer,
      route: turn.route,
      intent: turn.intent,
      fallback_firewall: turn.trace?.fallback_firewall || null,
      trace: turn.trace
    });
  }
  const report = {
    ok: traces.every((row) => row.fallback_firewall?.checked),
    generated_at: new Date().toISOString(),
    traces
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, traces: traces.length, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
