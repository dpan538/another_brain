#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r19_conversation_controller_coverage_report.json");

async function main() {
  const files = {
    dialog_runtime: await readFile(resolve(ROOT, "scripts/dialog_runtime.mjs"), "utf8"),
    app: await readFile(resolve(ROOT, "web/app.js"), "utf8"),
    controller: await readFile(resolve(ROOT, "web/conversation_controller.js"), "utf8")
  };
  const checks = [
    ["dialog_runtime_imports_controller", files.dialog_runtime.includes("handleConversationTurn")],
    ["app_imports_controller", files.app.includes("handleConversationTurn")],
    ["controller_calls_firewall", files.controller.includes("finalizeWithFallbackFirewall")],
    ["controller_calls_density", files.controller.includes("selectAnswerDensity") && files.controller.includes("formatMobileAnswer")],
    ["controller_calls_deduper", files.controller.includes("detectRepeatAnswer") && files.controller.includes("rewriteForNonRepeat")],
    ["controller_has_final_response_object", files.controller.includes("type: \"answer\"") && files.controller.includes("type: \"ui_affordance\"")]
  ].map(([id, ok]) => ({ id, ok }));
  const failed = checks.filter((check) => !check.ok);
  const report = { ok: failed.length === 0, generated_at: new Date().toISOString(), checks, failed };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, failed: failed.map((row) => row.id), out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
