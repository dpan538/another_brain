#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/finalizer_order_report.json");

async function main() {
  const app = await readFile(resolve(ROOT, "web/app.js"), "utf8");
  const dialog = await readFile(resolve(ROOT, "scripts/dialog_runtime.mjs"), "utf8");
  const failures = [];

  if (!/answerWithOperationLayer[\s\S]*detectIntent[\s\S]*answerWithTinyRouter[\s\S]*answerWithStructuredDecision[\s\S]*fallbackForIntent/.test(app)) {
    failures.push("web_app_draft_order_changed");
  }
  if (!/function commitAnswer[\s\S]*finalizeWithFallbackFirewall[\s\S]*setAnswer[\s\S]*rememberTurn/.test(app)) {
    failures.push("web_app_finalizer_not_before_render_or_store");
  }
  const legacyDialogOrder = /const resolved = resolveAnswer[\s\S]*finalizeWithFallbackFirewall[\s\S]*sanitizeSurfaceIdentity[\s\S]*runtime\.contextTurns\.push/.test(dialog);
  const controllerDialogOrder =
    /const controlled = handleConversationTurn[\s\S]*draftResolver: resolveAnswer[\s\S]*const resolved = controlled\.resolved[\s\S]*runtime\.contextTurns\.push/.test(dialog);
  if (!legacyDialogOrder && !controllerDialogOrder) {
    failures.push("dialog_runtime_finalizer_order_invalid");
  }
  if (!/lastAnswer/.test(dialog) || !/rememberTurn/.test(app)) {
    failures.push("session_state_missing_previous_assistant_answer");
  }

  const report = { ok: failures.length === 0, generated_at: new Date().toISOString(), failures };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, failures, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
