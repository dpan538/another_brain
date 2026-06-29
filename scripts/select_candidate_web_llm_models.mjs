#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/training_os/personal_200m_candidate_models.json");

const candidates = [
  {
    model_id: "bert-base-multilingual-cased",
    source: "Hugging Face / Google BERT family",
    parameter_count: 179000000,
    architecture: "encoder",
    runtime: ["transformers.js", "onnxruntime-web"],
    quantization_available: ["q8", "dynamic-int8", "onnx"],
    license_name: "Apache-2.0",
    license_url: "https://github.com/google-research/bert/blob/master/LICENSE",
    license_confidence: "verified",
    browser_feasibility: "medium",
    expected_artifact_size_mb: 120,
    supports_chinese: "yes",
    supports_classification: true,
    supports_generation: false,
    recommended_use: "gate",
    risks: ["large for mobile", "needs conversion/benchmark", "not a generator"],
    admission_status: "candidate"
  },
  {
    model_id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    source: "Hugging Face / Transformers.js community conversion",
    parameter_count: 118000000,
    architecture: "encoder",
    runtime: ["transformers.js", "onnxruntime-web"],
    quantization_available: ["q8", "onnx"],
    license_name: "Apache-2.0",
    license_url: "https://www.apache.org/licenses/LICENSE-2.0",
    license_confidence: "likely",
    browser_feasibility: "high",
    expected_artifact_size_mb: 85,
    supports_chinese: "partial",
    supports_classification: true,
    supports_generation: false,
    recommended_use: "embedding",
    risks: ["license must be verified at source before admission", "conversion provenance must be checked"],
    admission_status: "candidate"
  },
  {
    model_id: "intfloat/multilingual-e5-small",
    source: "Hugging Face / E5 embedding family",
    parameter_count: 118000000,
    architecture: "encoder",
    runtime: ["transformers.js", "onnxruntime-web"],
    quantization_available: ["q8", "onnx"],
    license_name: "MIT",
    license_url: "https://opensource.org/license/mit/",
    license_confidence: "likely",
    browser_feasibility: "high",
    expected_artifact_size_mb: 90,
    supports_chinese: "yes",
    supports_classification: true,
    supports_generation: false,
    recommended_use: "embedding",
    risks: ["license and model-card provenance must be verified before admission"],
    admission_status: "candidate"
  },
  {
    model_id: "HuggingFaceTB/SmolLM2-135M-Instruct",
    source: "Hugging FaceTB",
    parameter_count: 135000000,
    architecture: "decoder",
    runtime: ["webllm", "transformers.js", "unknown"],
    quantization_available: ["q4", "q8"],
    license_name: "Apache-2.0",
    license_url: "https://www.apache.org/licenses/LICENSE-2.0",
    license_confidence: "likely",
    browser_feasibility: "medium",
    expected_artifact_size_mb: 95,
    supports_chinese: "unknown",
    supports_classification: false,
    supports_generation: true,
    recommended_use: "short_generator",
    risks: ["license must be verified at source", "Chinese quality unknown", "generator must be verifier-gated"],
    admission_status: "candidate"
  },
  {
    model_id: "distilbert-base-multilingual-cased",
    source: "Hugging Face / DistilBERT family",
    parameter_count: 134000000,
    architecture: "encoder",
    runtime: ["transformers.js", "onnxruntime-web"],
    quantization_available: ["q8", "dynamic-int8", "onnx"],
    license_name: "Apache-2.0",
    license_url: "https://github.com/huggingface/transformers/blob/main/LICENSE",
    license_confidence: "likely",
    browser_feasibility: "high",
    expected_artifact_size_mb: 95,
    supports_chinese: "yes",
    supports_classification: true,
    supports_generation: false,
    recommended_use: "verifier",
    risks: ["license must be verified against exact model repo", "needs local benchmark"],
    admission_status: "candidate"
  },
  {
    model_id: "Xenova/all-MiniLM-L6-v2",
    source: "Hugging Face / Transformers.js community conversion",
    parameter_count: 23000000,
    architecture: "encoder",
    runtime: ["transformers.js", "onnxruntime-web"],
    quantization_available: ["q8", "onnx"],
    license_name: "Apache-2.0",
    license_url: "https://www.apache.org/licenses/LICENSE-2.0",
    license_confidence: "likely",
    browser_feasibility: "high",
    expected_artifact_size_mb: 25,
    supports_chinese: "partial",
    supports_classification: true,
    supports_generation: false,
    recommended_use: "embedding",
    risks: ["below 100M target; useful for standard profile, not personal_200m"],
    admission_status: "rejected"
  },
  {
    model_id: "Qwen/Qwen2.5-0.5B-Instruct",
    source: "Qwen",
    parameter_count: 500000000,
    architecture: "decoder",
    runtime: ["webllm", "transformers.js"],
    quantization_available: ["q4", "q8"],
    license_name: "Apache-2.0",
    license_url: "https://github.com/QwenLM/Qwen2.5/blob/main/LICENSE",
    license_confidence: "likely",
    browser_feasibility: "low",
    expected_artifact_size_mb: 350,
    supports_chinese: "yes",
    supports_classification: false,
    supports_generation: true,
    recommended_use: "reject",
    risks: ["above 200M target", "likely over 3s SLA on many devices", "generator risk"],
    admission_status: "rejected"
  },
  {
    model_id: "sentence-transformers/LaBSE",
    source: "Hugging Face / Sentence Transformers",
    parameter_count: 470000000,
    architecture: "encoder",
    runtime: ["transformers.js", "onnxruntime-web"],
    quantization_available: ["q8", "onnx"],
    license_name: "Apache-2.0",
    license_url: "https://www.apache.org/licenses/LICENSE-2.0",
    license_confidence: "likely",
    browser_feasibility: "low",
    expected_artifact_size_mb: 330,
    supports_chinese: "yes",
    supports_classification: true,
    supports_generation: false,
    recommended_use: "reject",
    risks: ["above 200M target", "too large for R17 browser profile"],
    admission_status: "rejected"
  }
];

async function main() {
  console.warn("[legacy] personal_200m / 100M-200M SLM candidate selection is retained for comparison only. R25 product direction is a same-origin static browser decoder LLM.");
  const report = {
    generated_at: new Date().toISOString(),
    downloaded_weights: false,
    committed_weights: false,
    candidates,
    summary: {
      total: candidates.length,
      in_range_100m_200m: candidates.filter((item) => item.parameter_count >= 100000000 && item.parameter_count <= 200000000).length,
      candidate: candidates.filter((item) => item.admission_status === "candidate").length,
      admitted: candidates.filter((item) => item.admission_status === "admitted").length,
      rejected: candidates.filter((item) => item.admission_status === "rejected").length,
      note: "R17 does not admit weights automatically; candidates require exact source-license and browser benchmark verification."
    }
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
