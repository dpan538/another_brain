#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = resolve(ROOT, "artifacts/training_os/personal_200m_candidate_models.json");
const OUT = resolve(ROOT, "artifacts/training_os/personal_200m_profile_budget_report.json");

function estimateQuantizedSizeMb(params, bits) {
  const bytesPerParam = bits / 8;
  const overhead = 1.18;
  return Math.round((params * bytesPerParam * overhead) / (1024 * 1024));
}

function assess(item) {
  const q4 = estimateQuantizedSizeMb(item.parameter_count, 4);
  const q8 = estimateQuantizedSizeMb(item.parameter_count, 8);
  const inRange = item.parameter_count >= 100000000 && item.parameter_count <= 200000000;
  const webgpuRequired = item.supports_generation || q4 > 80;
  const likelyUnderSla = inRange && q4 <= 130 && !item.supports_generation;
  const readiness =
    item.admission_status === "candidate" && inRange && item.supports_classification && !item.supports_generation
      ? "candidate_for_gate_or_embedding"
      : item.admission_status === "candidate" && inRange
        ? "experimental_only"
        : "reject_for_personal_200m";
  return {
    model_id: item.model_id,
    parameter_count: item.parameter_count,
    in_100m_200m_range: inRange,
    q4_estimated_mb: q4,
    q8_estimated_mb: q8,
    expected_artifact_size_mb: item.expected_artifact_size_mb,
    webgpu_required: webgpuRequired,
    likely_under_3s_loaded_page_sla: likelyUnderSla,
    supports_generation: item.supports_generation,
    recommended_use: item.recommended_use,
    admission_status: item.admission_status,
    readiness
  };
}

async function main() {
  console.warn("[legacy] personal_200m budget evaluation is retained for comparison only. It is not the R25 final product target.");
  const payload = JSON.parse(await readFile(INPUT, "utf8"));
  const assessments = (payload.candidates || []).map(assess);
  const viableControlled = assessments.filter((item) => item.readiness === "candidate_for_gate_or_embedding");
  const report = {
    ok: true,
    profile: "personal_200m",
    public_runtime_ready: false,
    reason_not_public_ready: "No exact browser benchmarked weight artifact is admitted; no weights were downloaded or committed.",
    answer_sla_ms_loaded_page: 3000,
    weights_downloaded: false,
    weights_committed: false,
    assessments,
    summary: {
      total: assessments.length,
      in_range: assessments.filter((item) => item.in_100m_200m_range).length,
      viable_controlled_candidates: viableControlled.length,
      generator_candidates: assessments.filter((item) => item.supports_generation && item.in_100m_200m_range).length,
      recommended_next_step: "Benchmark one verified encoder candidate in Transformers.js or ONNX Runtime Web before any runtime integration."
    }
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
