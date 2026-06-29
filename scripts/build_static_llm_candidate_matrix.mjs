#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = resolve(ROOT, "docs/R25_STATIC_LLM_CANDIDATE_MATRIX.md");
const JSON_OUT = resolve(ROOT, "artifacts/training_os/r25_static_llm_candidate_matrix.json");

const candidates = [
  {
    model_id: "self_trained_browser_decoder_release_tbd",
    parameter_count: 0,
    architecture: "decoder_only",
    expected_quantized_size_mb: 0,
    tokenizer_size_mb: 0,
    license: "project-authored-after-training",
    chinese_support: "planned_zh_en_mixed_tokenizer_and_corpus",
    browser_backend_feasibility: "future project-trained release must pass R25E/R25H static gates",
    profile_fit: {
      hobby_static_llm_lite: "optional_likely_rejects_scaled_release",
      pro_static_llm_full: "primary_profile_for_self_trained_release"
    },
    risks: [
      "training has not started",
      "architecture, tokenizer, corpus, checkpoint, quantization, and backend format remain pending",
      "release decision does not commit weights or bypass admission gates",
      "no browser performance claim before a real self-trained artifact passes first-token checks"
    ],
    admission_status: "from_scratch_release_planned_not_trained"
  },
  {
    model_id: "project_tiny_decoder_sanity_model_not_product",
    parameter_count: 0,
    architecture: "decoder_only",
    expected_quantized_size_mb: 0,
    tokenizer_size_mb: 0,
    license: "project-authored-after-training",
    chinese_support: "pipeline_sanity_only",
    profile_fit: {
      hobby_static_llm_lite: "may_fit_if_tiny",
      pro_static_llm_full: "fits_if_tiny"
    },
    risks: [
      "toy overfit sanity model is not the product",
      "must never be represented as capability progress beyond pipeline testing",
      "no training command is added in R25I"
    ],
    browser_backend_feasibility: "future toy pipeline check only",
    admission_status: "future_toy_sanity_not_product"
  },
  {
    model_id: "baseline_external_decoder_comparison_only",
    parameter_count: 0,
    architecture: "decoder_only",
    expected_quantized_size_mb: 0,
    tokenizer_size_mb: 0,
    license: "tbd_review_required",
    chinese_support: "comparison_only",
    browser_backend_feasibility: "compatibility or baseline only; not product selection",
    profile_fit: {
      hobby_static_llm_lite: "tbd_if_reviewed_baseline",
      pro_static_llm_full: "tbd_if_reviewed_baseline"
    },
    risks: [
      "external pretrained artifacts are not the final product target",
      "must be explicitly marked baseline_external_for_comparison_only",
      "must not imply LoRA, fine-tuning, or external model adaptation is the final strategy"
    ],
    admission_status: "baseline_only_not_product"
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
    model_id: "lora_adapter_path_rejected_as_final_strategy",
    parameter_count: 0,
    architecture: "decoder_only",
    expected_quantized_size_mb: 0,
    tokenizer_size_mb: 0,
    license: "varies",
    chinese_support: "varies",
    browser_backend_feasibility: "not final strategy",
    profile_fit: {
      hobby_static_llm_lite: "reject_as_final_strategy",
      pro_static_llm_full: "reject_as_final_strategy"
    },
    risks: ["LoRA, fine-tuning, and adapters are not the final product strategy"],
    admission_status: "rejected_as_final_strategy"
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
  },
  {
    model_id: "capacity_envelope_family_pending",
    parameter_count: 0,
    architecture: "decoder_only",
    expected_quantized_size_mb: 0,
    tokenizer_size_mb: 0,
    license: "tbd_review_required",
    chinese_support: "tbd",
    browser_backend_feasibility: "requires R25H capacity scenario and browser memory review before local artifact intake",
    profile_fit: {
      hobby_static_llm_lite: "often_rejects_larger_decoder_envelopes",
      pro_static_llm_full: "primary_capacity_profile_pending_real_artifact"
    },
    risks: [
      "capacity dry-runs are not production admission",
      "candidate must declare real total bytes, shard count, largest shard, tokenizer/config sizes, and browser memory risk",
      "no named model is selected by the capacity envelope"
    ],
    admission_status: "awaiting_capacity_reviewed_candidate"
  }
];

function renderMarkdown(report) {
  const lines = [
    "# R25 Static LLM Candidate Matrix",
    "",
    "R25G and R25H keep candidate selection model-agnostic. They do not download, train, convert, or admit model weights.",
    "",
    "R25I reorients the product path toward a project-trained decoder LLM trained from scratch, then packaged as a static browser release. No named pretrained model is selected. External artifacts are compatibility or baseline-only unless explicitly reviewed as such.",
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
    "- LoRA, fine-tuning, adapters, and external pretrained adaptation are rejected as the final product strategy.",
    "- Models that require server inference, Vercel Functions, Edge Functions, remote APIs, or external storage are rejected.",
    "- Models that exceed the selected static profile budget are rejected.",
    "- Models with unclear license or conversion provenance are rejected until reviewed.",
    "",
    "## R25I Release And Capacity Framework",
    "",
    "R25B through R25H add training-content, loader, admission, purge, decision, and capacity scaffolding only. R25I adds from-scratch training doctrine and release-decision framing. None of these patches train, download, convert, benchmark, or admit real weights.",
    "",
    "The current status is `from_scratch_release_planned_not_trained`, `no_named_model_selected`, and `awaiting_self_trained_release_decision`. R25H adds a metadata-only capacity envelope and dry-run manifests so future release artifacts can be measured before artifact intake. A future patch must create a reviewed self-trained release decision, check `static_llm/conversion_paths/matrix.json`, compare the release to `static_llm/capacity_profiles/`, then perform local artifact review, license/provenance review, static manifest generation with real hashes, browser budget measurement, and the full R24/R25 gate suite before any runtime answer path can use a real model.",
    "",
    "A release decision record does not admit weights. It only allows a later local artifact intake attempt for a future self-trained artifact.",
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
