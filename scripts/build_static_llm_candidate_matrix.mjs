#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = resolve(ROOT, "docs/R25_STATIC_LLM_CANDIDATE_MATRIX.md");
const JSON_OUT = resolve(ROOT, "artifacts/training_os/r25_static_llm_candidate_matrix.json");

const candidates = [
  {
    model_id: "Qwen/Qwen2.5-0.5B-Instruct",
    parameter_count: 500000000,
    architecture: "decoder_only",
    expected_quantized_size_mb: 350,
    tokenizer_size_mb: 8,
    license: "Apache-2.0, exact source review still required",
    chinese_support: "strong repo-known candidate",
    browser_backend_feasibility: "pro_static_llm_full candidate; hobby budget unlikely",
    profile_fit: {
      hobby_static_llm_lite: "reject_over_budget",
      pro_static_llm_full: "candidate_after_review"
    },
    risks: [
      "needs reviewed conversion and real sha256 manifest",
      "browser latency and memory must be measured",
      "no server inference fallback allowed",
      "local artifact conversion and admission are R25C or later"
    ],
    admission_status: "primary_review_candidate_not_admitted"
  },
  {
    model_id: "HuggingFaceTB/SmolLM2-135M-Instruct",
    parameter_count: 135000000,
    architecture: "decoder_only",
    expected_quantized_size_mb: 95,
    tokenizer_size_mb: 4,
    license: "Apache-2.0 likely, exact source review still required",
    chinese_support: "unknown or weak",
    browser_backend_feasibility: "fits hobby only at the edge; not final product target by size alone",
    profile_fit: {
      hobby_static_llm_lite: "borderline_candidate_for_comparison",
      pro_static_llm_full: "fits_but_rejected_as_final_target"
    },
    risks: [
      "100M-200M SLM class must not become final product target",
      "Chinese quality uncertain",
      "generator must remain verifier-gated"
    ],
    admission_status: "rejected_as_final_product_target"
  },
  {
    model_id: "bert-base-multilingual-cased",
    parameter_count: 179000000,
    architecture: "encoder_only",
    expected_quantized_size_mb: 120,
    tokenizer_size_mb: 2,
    license: "Apache-2.0",
    chinese_support: "yes",
    browser_backend_feasibility: "may be useful for gate/embedding comparison only",
    profile_fit: {
      hobby_static_llm_lite: "reject_not_decoder_llm",
      pro_static_llm_full: "reject_not_decoder_llm"
    },
    risks: ["encoder-only model cannot be the primary answer-generating LLM"],
    admission_status: "rejected_primary_llm_encoder_only"
  },
  {
    model_id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    parameter_count: 118000000,
    architecture: "encoder_only",
    expected_quantized_size_mb: 85,
    tokenizer_size_mb: 2,
    license: "Apache-2.0 likely, exact source review still required",
    chinese_support: "partial",
    browser_backend_feasibility: "embedding/rerank comparison only",
    profile_fit: {
      hobby_static_llm_lite: "reject_not_decoder_llm",
      pro_static_llm_full: "reject_not_decoder_llm"
    },
    risks: ["not generative", "community conversion provenance must be reviewed"],
    admission_status: "rejected_primary_llm_encoder_only"
  },
  {
    model_id: "server-required-or-remote-api-model",
    parameter_count: 7000000000,
    architecture: "decoder_only",
    expected_quantized_size_mb: 4000,
    tokenizer_size_mb: 20,
    license: "unclear",
    chinese_support: "unknown",
    browser_backend_feasibility: "requires server inference or remote API",
    profile_fit: {
      hobby_static_llm_lite: "reject_requires_backend",
      pro_static_llm_full: "reject_requires_backend"
    },
    risks: ["exceeds static budgets", "requires forbidden backend or external API", "unclear license"],
    admission_status: "rejected_for_r25"
  }
];

function renderMarkdown(report) {
  const lines = [
    "# R25 Static LLM Candidate Matrix",
    "",
    "R25A does not download, train, convert, or admit model weights. This matrix is manually curated from repo-known candidate names and earlier local planning surfaces only.",
    "",
    "The primary R25 target is a same-origin static decoder LLM that runs in the browser. Encoder-only models, 100M-200M SLMs, server-required models, over-budget models, and unclear-license models are not accepted as the final product target.",
    "",
    "| Candidate | Params | Architecture | Est. q size | Chinese | Hobby fit | Pro fit | Admission |",
    "| --- | ---: | --- | ---: | --- | --- | --- | --- |"
  ];
  for (const item of report.candidates) {
    lines.push(
      `| ${item.model_id} | ${item.parameter_count.toLocaleString("en-US")} | ${item.architecture} | ${item.expected_quantized_size_mb} MB | ${item.chinese_support} | ${item.profile_fit.hobby_static_llm_lite} | ${item.profile_fit.pro_static_llm_full} | ${item.admission_status} |`
    );
  }
  lines.push(
    "",
    "## Explicit Rejections",
    "",
    "- Encoder-only models are rejected as the primary LLM because the R25 answer path needs a decoder draft model.",
    "- 100M-200M SLMs are rejected as the final product target, even if they remain useful fallback or comparison artifacts.",
    "- Models that require server inference, Vercel Functions, Edge Functions, remote APIs, or external storage are rejected.",
    "- Models that exceed the selected static profile budget are rejected.",
    "- Models with unclear license or conversion provenance are rejected until reviewed.",
    "",
    "## R25B/R25C Admission Work",
    "",
    "R25B adds training-content and admission scaffolding only. It does not download, convert, benchmark, or admit real weights.",
    "",
    "The primary review class remains a small decoder-only browser candidate such as `Qwen/Qwen2.5-0.5B-Instruct`, but it is not admitted. R25C or later must perform local artifact conversion, license/provenance review, static manifest generation with real hashes, browser budget measurement, and the full R24/R25 gate suite before any runtime answer path can use a real model.",
    "",
    "No candidate row claims real browser performance."
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    downloaded_weights: false,
    called_model_api: false,
    candidates,
    summary: {
      total: candidates.length,
      primary_review_candidates: candidates.filter((item) => item.admission_status === "primary_review_candidate_not_admitted").length,
      admitted_candidates: candidates.filter((item) => /admitted/.test(item.admission_status) && !/not_admitted/.test(item.admission_status)).length,
      rejected_primary_llm_encoder_only: candidates.filter((item) => /encoder_only/.test(item.admission_status)).length,
      rejected_as_final_product_target: candidates.filter((item) => item.admission_status === "rejected_as_final_product_target").length
    }
  };
  await mkdir(dirname(JSON_OUT), { recursive: true });
  await writeFile(JSON_OUT, JSON.stringify(report, null, 2), "utf8");
  await writeFile(DOC, renderMarkdown(report), "utf8");
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
