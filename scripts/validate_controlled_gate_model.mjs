#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = resolve(ROOT, "artifacts/training_os/controlled_gate_model.json");
const METRICS = resolve(ROOT, "artifacts/training_os/controlled_gate_training_metrics.json");
const EXPORT_REPORT = resolve(ROOT, "artifacts/training_os/controlled_gate_export_report.json");
const WEB_MODEL = resolve(ROOT, "web/controlled_gate_model.generated.js");
const REPORT = resolve(ROOT, "artifacts/training_os/controlled_gate_validation_report.json");
const FORBIDDEN = /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\|根据你的文件|according to your file|完整歌词|歌词[:：]|passport|visa|bank account|student ID/i;

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const failures = [];
  if (!existsSync(MODEL)) failures.push({ code: "missing_model_artifact" });
  if (!existsSync(METRICS)) failures.push({ code: "missing_metrics_artifact" });
  const model = existsSync(MODEL) ? await readJson(MODEL) : {};
  const metrics = existsSync(METRICS) ? await readJson(METRICS) : {};
  if (model && FORBIDDEN.test(JSON.stringify(model))) failures.push({ code: "forbidden_content_in_model_artifact" });
  if (metrics.objective !== "controlled_gate_labels_only_no_final_answer_generation") {
    failures.push({ code: "invalid_training_objective", objective: metrics.objective });
  }
  const webModelExists = existsSync(WEB_MODEL);
  if (webModelExists) {
    const size = statSync(WEB_MODEL).size;
    if (size > 10 * 1024 * 1024) failures.push({ code: "web_model_too_large", size });
    const webText = await readFile(WEB_MODEL, "utf8");
    if (FORBIDDEN.test(webText)) failures.push({ code: "forbidden_content_in_web_model" });
  }
  const exportReport = existsSync(EXPORT_REPORT) ? await readJson(EXPORT_REPORT) : { exported: false };
  const report = {
    ok: failures.length === 0,
    ready_for_runtime: exportReport.exported === true && metrics.targets_met === true && Number(metrics.cycle || 0) >= 3,
    cycles: metrics.cycle || 0,
    rows: metrics.rows || 0,
    web_model_exists: webModelExists,
    exported: exportReport.exported === true,
    failures,
    note: "Validation checks safety and objective. Runtime readiness still requires metrics/export thresholds."
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
