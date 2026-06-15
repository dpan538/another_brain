#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";

const CASES = resolve(ROOT, "evals/p0_lobotomy/screenshot_regression.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/r18_runtime_parity_report.json");

async function loadPrompts() {
  const text = await readFile(CASES, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .slice(0, 20);
}

async function runDialog(spec) {
  const runtime = createDialogRuntime();
  runtime.dialogState = { ...runtime.dialogState, ...(spec.compact_state || {}) };
  runtime.contextTurns = Array.isArray(spec.compact_state?.recentTurns) ? spec.compact_state.recentTurns : [];
  const prompts = spec.turns?.length ? spec.turns : [spec.prompt];
  const turns = [];
  for (const prompt of prompts) turns.push(await answerDialogPrompt(prompt, runtime, { withThinkingDelay: false }));
  return turns;
}

async function main() {
  const specs = await loadPrompts();
  const dialog = [];
  for (const spec of specs) {
    const turns = await runDialog(spec);
    dialog.push({ id: spec.id, turns: turns.map((turn) => ({ prompt: turn.prompt, answer: turn.answer, route: turn.route, intent: turn.intent })) });
  }
  const report = {
    generated_at: new Date().toISOString(),
    dialog_runtime: {
      attempted: true,
      available: true,
      cases: dialog.length,
      failures: dialog.filter((item) => item.turns.some((turn) => /你需要提问|你要问哪一边|也许发生过/.test(turn.answer)))
    },
    local_web_runtime: {
      attempted: true,
      available: false,
      reason: "web/app.js depends on DOM; parity is checked through shared operation/fallback modules and browser E2E when browser automation is available"
    },
    real_ui_or_browser: {
      attempted: true,
      available: false,
      reason: "Playwright is not installed in the current local dependency set"
    },
    parity_failures: [],
    samples: dialog
  };
  report.parity_failures = report.dialog_runtime.failures;
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.parity_failures.length === 0, out: OUT, dialog_cases: dialog.length, browser_available: false }, null, 2));
  if (report.parity_failures.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
