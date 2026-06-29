#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { gitLsFiles } from "./static_llm_artifact_utils.mjs";
import { normalizeRepoPath } from "./static_llm_policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACTIVE_RE = /^(README\.md|DEPLOYMENT\.md|DATA_CARD\.md|docs\/R25.*\.md|static_llm\/(candidate_decisions|release_decisions|request_pack|ASSET_LAYOUT\.md).+|training\/from_scratch\/.+|scripts\/(build_static_llm_candidate_matrix|report_from_scratch_training_progress|check_no_active_named_model_candidate|check_no_slm_product_target|build_tiny_decoder_toy_dataset|run_tiny_decoder_toy_overfit|eval_tiny_decoder_toy_overfit|check_tiny_decoder_toy_artifacts_untracked|check_r25k_toy_overfit_sanity)\.mjs|package\.json)$/;
const SKIP_RE = /(^|\/)(artifacts|node_modules|\.git)\//;

const q = String.fromCharCode(113);
const w = String.fromCharCode(119);
const e = String.fromCharCode(101);
const n = String.fromCharCode(110);
const removedBase = [q, w, e, n].join("");
const removedRe = new RegExp(removedBase, "i");
const vercelFunctionTerm = ["Vercel", "Function"].join(" ");
const edgeFunctionTerm = ["Edge", "Function"].join(" ");
const backendClaimPattern = new RegExp(
  `(?:external backend|external storage|remote model API|${vercelFunctionTerm}|${edgeFunctionTerm}).{0,80}(?:allowed|required for product|main path)`,
  "i"
);

const forbiddenClaims = [
  {
    code: "pretrained_final_product_claim",
    pattern: /(?:pretrained|pre-trained|external model|foundation model).{0,100}(?:final product|main product|product target|primary path|final strategy)/i
  },
  {
    code: "lora_final_strategy_claim",
    pattern: /(?:LoRA|adapter|adapters|fine[- ]?tune|fine[- ]?tuning).{0,100}(?:final product|main product|product target|primary path|final strategy)/i
  },
  {
    code: "candidate_admission_as_model_selection",
    pattern: /candidate admission.{0,100}(?:model selection|selects the model|chooses the model)/i
  },
  {
    code: "training_started_claim",
    pattern: /(?:training has started|training started|formal training progress[^0-9]{0,20}[1-9][0-9]*%|real weights admitted|production model admitted)/i
  },
  {
    code: "fixture_performance_claim",
    pattern: /fixture.{0,80}(?:real performance|production performance|real first-token success)/i
  },
  {
    code: "backend_allowed_claim",
    pattern: backendClaimPattern
  },
  {
    code: "chain_of_thought_allowed_claim",
    pattern: /chain[-_ ]?of[-_ ]?thought.{0,80}(?:allowed|training data|stored for training)/i
  },
  {
    code: "toy_output_release_artifact_claim",
    pattern: /toy.{0,80}(?:release artifact|release candidate|product checkpoint|production checkpoint)/i
  }
];

const allowContext = /not|no |never|without|forbidden|rejected|reject|comparison|compatibility|baseline|fixture|legacy|historical|do not|must not|cannot|is not|are not|only as|warning|non-goal|avoid|risk|rollback|trigger|failure|any claim|treating|toy-only|toy sanity|pipeline mechanics|ignored artifact|ignored artifacts|no tracked weights|formal_training":false|product_model":false/i;
const triggerContext = new RegExp(
  `pretrained|pre-trained|external model|foundation model|LoRA|adapter|fine[- ]?tune|fine[- ]?tuning|candidate admission|training has started|training started|formal training progress|real weights admitted|production model admitted|fixture|external backend|external storage|remote model API|${vercelFunctionTerm}|${edgeFunctionTerm}|chain[-_ ]?of[-_ ]?thought|toy.{0,80}(?:release artifact|release candidate|product checkpoint|production checkpoint)`,
  "i"
);

function context(lines, index) {
  return [
    lines[index - 4] || "",
    lines[index - 3] || "",
    lines[index - 2] || "",
    lines[index - 1] || "",
    lines[index],
    lines[index + 1] || "",
    lines[index + 2] || "",
    lines[index + 3] || "",
    lines[index + 4] || ""
  ].join(" ");
}

function nearLine(lines, index) {
  return [lines[index - 1] || "", lines[index], lines[index + 1] || ""].join(" ");
}

async function main() {
  const files = (await gitLsFiles(["ls-files", "--cached", "--others", "--exclude-standard"]))
    .map(normalizeRepoPath)
    .filter((path) => ACTIVE_RE.test(path) && !SKIP_RE.test(path));
  const failures = [];
  const allowed_matches = [];

  for (const file of files) {
    const text = await readFile(resolve(ROOT, file), "utf8").catch(() => "");
    if (!text) continue;
    if (removedRe.test(text)) failures.push({ code: "purged_candidate_string_present", path: file });
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const block = context(lines, index);
      if (!triggerContext.test(nearLine(lines, index))) continue;
      for (const rule of forbiddenClaims) {
        if (!rule.pattern.test(block)) continue;
        const item = { code: rule.code, path: file, line: index + 1, text: line.trim().slice(0, 220) };
        if (allowContext.test(block)) allowed_matches.push(item);
        else failures.push(item);
      }
    }
  }

  const requiredFiles = [
    "docs/R25I_FROM_SCRATCH_LLM_TRAINING_DOCTRINE.md",
    "docs/R25I_TRAINING_PHASE_PLAN.md",
    "training/from_scratch/architecture.schema.json",
    "training/from_scratch/architectures/browser_decoder_v0.json",
    "training/from_scratch/tokenizer_plan.md",
    "training/from_scratch/tokenizer.schema.json",
    "training/from_scratch/tokenizer_corpus_manifest.json",
    "training/from_scratch/corpus_plan.md",
    "training/from_scratch/corpus_mix.schema.json",
    "training/from_scratch/corpus_mix_v0.json",
    "training/from_scratch/tokenizer_dry_run_config.json",
    "training/from_scratch/toy_decoder_config.json",
    "training/from_scratch/toy_decoder_readme.md",
    "training/from_scratch/APPROVE_R25K_TOY_OVERFIT.json",
    "static_llm/release_decisions/schema.json",
    "static_llm/release_decisions/template.self_trained.json",
    "docs/R25J_TOKENIZER_DRY_RUN.md",
    "docs/R25J_TINY_DECODER_TOY_PIPELINE.md",
    "docs/R25K_TOY_OVERFIT_SANITY.md",
    "scripts/build_tiny_decoder_toy_dataset.mjs",
    "scripts/eval_tiny_decoder_toy_overfit.mjs",
    "scripts/check_tiny_decoder_toy_artifacts_untracked.mjs",
    "scripts/check_r25k_toy_overfit_sanity.mjs"
  ];
  for (const path of requiredFiles) {
    if (!files.includes(path)) {
      const content = await readFile(resolve(ROOT, path), "utf8").catch(() => "");
      if (!content) failures.push({ code: "required_from_scratch_file_missing", path });
    }
  }

  const report = {
    ok: failures.length === 0,
    scanned_files: files.length,
    formal_training_progress_percent: 0,
    final_strategy: "self_trained_from_scratch",
    lora_or_adapter_final_strategy_allowed: false,
    pretrained_product_target_allowed: false,
    failures,
    allowed_matches: allowed_matches.slice(0, 60)
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
