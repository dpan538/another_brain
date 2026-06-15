#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = resolve(ROOT, "artifacts/training_os/controlled_gate_model.json");
const METRICS = resolve(ROOT, "artifacts/training_os/controlled_gate_training_metrics.json");
const REPORT = resolve(ROOT, "artifacts/training_os/controlled_gate_eval_report.json");

async function main() {
  if (!existsSync(MODEL) || !existsSync(METRICS)) {
    throw new Error("Controlled gate model/metrics missing; run npm run train:controlled-gate first.");
  }
  const model = JSON.parse(await readFile(MODEL, "utf8"));
  const metrics = JSON.parse(await readFile(METRICS, "utf8"));
  const blind = metrics.blind || {};
  const targetChecks = {
    domain_accuracy_blind: blind.domain >= 0.85,
    task_type_accuracy_blind: blind.task_type >= 0.85,
    question_type_accuracy_blind: blind.question_type >= 0.8,
    operation_accuracy_blind: blind.operation >= 0.8,
    risk_label_accuracy_blind: blind.risk_label >= 0.9
  };
  const report = {
    ok: true,
    ready_for_runtime: Object.values(targetChecks).every(Boolean) && model.cycle >= 3,
    cycle: model.cycle,
    rows: metrics.rows,
    blind,
    target_checks: targetChecks,
    objective: metrics.objective,
    note: "Evaluation covers controlled label prediction only; no final-answer generation is trained."
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
