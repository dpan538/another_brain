#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const QUALITY_PATH = "artifacts/training_os/corpus_review/r25al/r25al_expanded_corpus_quality.json";
const TOKENIZER_PATH = "artifacts/training_os/tokenizer_dryrun/r25al/r25al_tokenizer_readiness_report.json";
const DECISION_PATH = "artifacts/training_os/corpus_review/r25al/r25al_next_step_decision.json";
const DOC_PATH = "docs/R25AL_NEXT_STEP_BOUNDARY.md";
const APPROVAL_PATH = "training/from_scratch/APPROVE_R25AL_POST_PROMOTION_CORPUS_REVIEW.json";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(path, text) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
}

async function consumeApproval() {
  const approval = await readJson(APPROVAL_PATH);
  const consumed = {
    ...approval,
    consumed: true,
    allow_additional_runs: false,
    consumed_by_phase: "R25AL",
    consumed_by_commit: "pending_r25al_commit",
    consumed_reason: "one-shot approval used or attempted for r25al_post_promotion_corpus_review; future tokenizer dry-run or training requires a new approval marker; future runs require a new approval marker"
  };
  await writeJson(APPROVAL_PATH, consumed);
  return consumed;
}

async function main() {
  const quality = await readJson(QUALITY_PATH);
  const tokenizer = await readJson(TOKENIZER_PATH);
  const zhShare = quality.chinese_first_gap?.combined_zh_share || 0;
  const risks = [];
  const reasons = [];
  const requiredBeforeTraining = [
    "fresh explicit R25AM approval",
    "review R25AL corpus and tokenizer reports",
    "preserve eval split boundaries",
    "use Chinese-first sampling or add more reviewed Chinese personal rows before any bounded micro-cycle"
  ];

  if (quality.ok) reasons.push("expanded tracked corpus passed hard boundary audit");
  if (tokenizer.ok) reasons.push("R25AL tokenizer dry-run artifacts validated structurally");
  if (zhShare < 0.7) risks.push("combined corpus remains below the future zh >= 70% target for uniform full-corpus use");
  if (quality.normalized_duplicate_target_answer_count > 0) risks.push("some normalized duplicate targets remain and should be sampled cautiously");
  if (tokenizer.recommendation === "tokenizer_risk_review_needed") risks.push("tokenizer metrics need review before any micro-cycle");

  let recommendation = "pause";
  if (!quality.ok || !tokenizer.ok) recommendation = "tokenizer_risk_review_needed";
  else if (tokenizer.recommendation === "tokenizer_risk_review_needed") recommendation = "tokenizer_risk_review_needed";
  else if (zhShare < 0.7) recommendation = "needs_more_chinese_personal_corpus";
  else recommendation = "ready_for_future_bounded_microcycle_review";

  const decision = {
    ok: quality.ok === true && tokenizer.ok === true,
    recommendation,
    decoder_training_approved: false,
    phase4_approved: false,
    product_training_progress_percent: 0,
    best_next_step: recommendation === "needs_more_chinese_personal_corpus"
      ? "Add or promote more reviewed Chinese personal/project rows, or require a Chinese-first sampler before considering R25AM."
      : "Reviewer may consider an inert R25AM bounded micro-cycle approval template, but training is still not approved.",
    reasons,
    risks,
    required_before_training: requiredBeforeTraining,
    must_not_do: [
      "do not run decoder training",
      "do not run small-pilot training",
      "do not run phase_4 scaled training",
      "do not commit tokenizer artifacts",
      "do not commit weights",
      "do not use private_sources, root PDFs/DOCX, data/public_ingestion, or eval prompts as training data"
    ],
    approval_consumed: true,
    active_training_approval_count: 0,
    active_tokenizer_dry_run_approval_count: 0,
    active_phase4_training_approval_count: 0
  };

  await writeJson(DECISION_PATH, decision);
  await consumeApproval();
  const doc = `# R25AL Next-Step Boundary

R25AL completed corpus and tokenizer readiness review without approving training.

## Decision

- Recommendation: ${decision.recommendation}
- Decoder training approved: false
- Small-pilot training approved: false
- Phase_4 approved: false
- Product training progress: 0%

## Reasons

${reasons.map((reason) => `- ${reason}`).join("\n")}

## Risks

${risks.length ? risks.map((risk) => `- ${risk}`).join("\n") : "- No hard tokenizer or boundary risk found."}

## Boundary

R25AM remains a future approval-only step. Any bounded Chinese-personal micro-cycle needs fresh explicit approval, must preserve split integrity, and must not automatically follow from this tokenizer dry-run. Tokenizer artifacts and weights remain uncommitted.
`;
  await writeText(DOC_PATH, doc);
  console.log(JSON.stringify(decision, null, 2));
  if (!decision.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
