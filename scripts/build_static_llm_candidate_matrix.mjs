#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = resolve(ROOT, "docs/R25_STATIC_LLM_CANDIDATE_MATRIX.md");
const JSON_OUT = resolve(ROOT, "artifacts/training_os/r25_static_llm_candidate_matrix.json");

const candidates = [
  {
    model_id: "local_reviewed_decoder_artifact_tbd",
    parameter_count: 0,
    architecture: "decoder_only",
    expected_quantized_size_mb: 0,
    tokenizer_size_mb: 0,
    license: "tbd_review_required",
    chinese_support: "tbd",
    browser_backend_feasibility: "awaiting local artifact metadata and browser budget review",
    profile_fit: {
      hobby_static_llm_lite: "tbd_after_artifact_review",
      pro_static_llm_full: "awaiting_reviewed_local_decoder_artifact"
    },
    risks: [
      "no named model is selected in R25G",
      "user must supply or approve a reviewed local decoder artifact later",
      "license, provenance, manifest hashes, static budget, and backend support remain required",
      "no browser performance claim before measurement"
    ],
    admission_status: "candidate_selection_reset"
  },
  {
    model_id: "browser_ready_decoder_artifact_tbd",
    parameter_count: 0,
    architecture: "decoder_only",
    expected_quantized_size_mb: 0,
    tokenizer_size_mb: 0,
    license: "tbd_review_required",
    chinese_support: "tbd",
    browser_backend_feasibility: "requires browser-ready format, same-origin assets, and reviewed local conversion",
    profile_fit: {
      hobby_static_llm_lite: "optional_fit_if_under_budget",
      pro_static_llm_full: "primary_profile_after_review"
    },
    risks: [
      "format may still need browser backend binding",
      "candidate must not be downloaded by Codex",
      "real weights remain absent until explicit approval and green gates"
    ],
    admission_status: "no_named_model_selected"
  },
  {
    model_id: "encoder_only_family_rejected",
    parameter_count: 0,
    architecture: "encoder_only",
    expected_quantized_size_mb: 0,
    tokenizer_size_mb: 0,
    license: "varies",
    chinese_support: "varies",
    browser_backend_feasibility: "comparison or verifier support only",
    profile_fit: {
      hobby_static_llm_lite: "reject_not_decoder_llm",
      pro_static_llm_full: "reject_not_decoder_llm"
    },
    risks: ["encoder-only model cannot be the primary answer-generating LLM"],
    admission_status: "rejected_primary_llm_encoder_only"
  },
  {
    model_id: "legacy_slm_family_rejected",
    parameter_count: 0,
    architecture: "decoder_only",
    expected_quantized_size_mb: 0,
    tokenizer_size_mb: 0,
    license: "varies",
    chinese_support: "varies",
    browser_backend_feasibility: "legacy comparison only",
    profile_fit: {
      hobby_static_llm_lite: "reject_as_final_target",
      pro_static_llm_full: "reject_as_final_target"
    },
    risks: ["SLM and personal_200m surfaces remain fallback or comparison only"],
    admission_status: "rejected_as_final_product_target"
  },
  {
    model_id: "server_required_family_rejected",
    parameter_count: 0,
    architecture: "decoder_only",
    expected_quantized_size_mb: 0,
    tokenizer_size_mb: 0,
    license: "varies",
    chinese_support: "varies",
    browser_backend_feasibility: "requires server inference or remote API",
    profile_fit: {
      hobby_static_llm_lite: "reject_requires_backend",
      pro_static_llm_full: "reject_requires_backend"
    },
    risks: ["requires forbidden backend or external API"],
    admission_status: "rejected_for_r25"
  },
  {
    model_id: "over_budget_decoder_family_rejected",
    parameter_count: 0,
    architecture: "decoder_only",
    expected_quantized_size_mb: 0,
    tokenizer_size_mb: 0,
    license: "varies",
    chinese_support: "varies",
    browser_backend_feasibility: "static profile budget rejection",
    profile_fit: {
      hobby_static_llm_lite: "reject_over_budget",
      pro_static_llm_full: "reject_over_budget"
    },
    risks: ["exceeds deployable static asset budget"],
    admission_status: "rejected_over_budget"
  },
  {
    model_id: "unclear_license_family_rejected",
    parameter_count: 0,
    architecture: "decoder_only",
    expected_quantized_size_mb: 0,
    tokenizer_size_mb: 0,
    license: "unclear",
    chinese_support: "varies",
    browser_backend_feasibility: "blocked until license and provenance review",
    profile_fit: {
      hobby_static_llm_lite: "reject_until_reviewed",
      pro_static_llm_full: "reject_until_reviewed"
    },
    risks: ["unclear license or conversion provenance"],
    admission_status: "rejected_unclear_license"
  },
  {
    model_id: "conversion_required_family_pending",
    parameter_count: 0,
    architecture: "decoder_only",
    expected_quantized_size_mb: 0,
    tokenizer_size_mb: 0,
    license: "tbd_review_required",
    chinese_support: "tbd",
    browser_backend_feasibility: "requires conversion path matrix review before local artifact intake",
    profile_fit: {
      hobby_static_llm_lite: "tbd_after_conversion_review",
      pro_static_llm_full: "pending_conversion_path_review"
    },
    risks: [
      "raw checkpoints are not automatically browser-runnable",
      "backend-ready format must be reviewed before first-token claims",
      "candidate decision record must precede artifact admission"
    ],
    admission_status: "awaiting_candidate_decision"
  }
];

function renderMarkdown(report) {
  const lines = [
    "# R25 Static LLM Candidate Matrix",
    "",
    "R25G keeps candidate selection model-agnostic. It does not download, train, convert, or admit model weights.",
    "",
    "The primary R25 target is a same-origin static decoder LLM that runs in the browser. No named model is selected. The next candidate must be supplied locally by the user or selected in a later reviewed decision record.",
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
    "## R25G Decision Framework",
    "",
    "R25B through R25G add training-content, loader, admission, purge, and decision scaffolding only. They do not download, convert, benchmark, or admit real weights.",
    "",
    "The current status is `candidate_selection_reset`, `no_named_model_selected`, and `awaiting_candidate_decision`. A future patch must create a reviewed candidate decision record, check `static_llm/conversion_paths/matrix.json`, use `static_llm/request_pack/`, then perform local artifact review, license/provenance review, static manifest generation with real hashes, browser budget measurement, and the full R24/R25 gate suite before any runtime answer path can use a real model.",
    "",
    "A candidate decision record does not admit weights. It only allows a later local artifact intake attempt.",
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
      primary_review_candidates: 0,
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
