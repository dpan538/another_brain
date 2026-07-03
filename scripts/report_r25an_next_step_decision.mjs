#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const QUALITY_PATH = "artifacts/training_os/corpus_review/r25an/r25an_expanded_corpus_quality.json";
const SAMPLER_PATH = "artifacts/training_os/corpus_review/r25an/r25an_chinese_sampler_feasibility.json";
const TOKENIZER_PATH = "artifacts/training_os/tokenizer_dryrun/r25an/r25an_tokenizer_readiness_report.json";
const DECISION_PATH = "artifacts/training_os/corpus_review/r25an/r25an_next_step_decision.json";
const DOC_PATH = "docs/R25AN_NEXT_STEP_BOUNDARY.md";
const APPROVAL_PATH = "training/from_scratch/APPROVE_R25AN_POST_R25AM_TOKENIZER_REVIEW.json";

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
    consumed_by_phase: "R25AN",
    consumed_by_commit: "pending_r25an_commit",
    consumed_reason: "one-shot approval used or attempted for r25an_post_r25am_tokenizer_review; future tokenizer dry-run or training requires a new approval marker; future runs require a new approval marker"
  };
  await writeJson(APPROVAL_PATH, consumed);
  return consumed;
}

async function main() {
  const quality = await readJson(QUALITY_PATH);
  const sampler = await readJson(SAMPLER_PATH);
  const tokenizer = await readJson(TOKENIZER_PATH);
  const reasons = [];
  const risks = [];

  if (quality.ok) reasons.push("R25AM-expanded tracked corpus passed boundary audit");
  if (sampler.ok) reasons.push("zh-first sampler can satisfy 70/20/10 plans without replacement for reviewed plan sizes");
  if (tokenizer.ok) reasons.push("R25AN tokenizer dry-run artifacts validated structurally");
  if ((quality.chinese_first_gap?.combined_zh_share || 0) < 0.7) risks.push("uniform full-corpus use remains below zh >= 70%; future micro-cycle must use a zh-first sampler or add more Chinese rows");
  if ((quality.chinese_first_gap?.combined_en_share || 0) > 0.1) risks.push("uniform full-corpus use remains above en <= 10%; future micro-cycle must cap English rows");
  if (tokenizer.recommendation === "tokenizer_risk_review_needed") risks.push("tokenizer metrics need review before a micro-cycle");
  if (sampler.recommendation !== "sampler_ready_for_bounded_microcycle") risks.push("sampler needs a cap or more zh rows before a micro-cycle");

  let recommendation = "pause";
  if (!quality.ok || !sampler.ok || !tokenizer.ok) recommendation = "pause";
  else if (tokenizer.recommendation === "tokenizer_risk_review_needed") recommendation = "tokenizer_risk_review_needed";
  else if (sampler.recommendation !== "sampler_ready_for_bounded_microcycle") recommendation = "sampler_risk_review_needed";
  else recommendation = "ready_for_r25ao_bounded_microcycle_review";

  const decision = {
    ok: quality.ok === true && sampler.ok === true && tokenizer.ok === true,
    recommendation,
    decoder_training_approved: false,
    phase4_approved: false,
    product_training_progress_percent: 0,
    best_next_step: recommendation === "ready_for_r25ao_bounded_microcycle_review"
      ? "Reviewer may consider R25AO bounded Chinese-personal micro-cycle approval using the R25AM-expanded corpus and zh-first sampler; training is still not approved."
      : "Pause and resolve corpus, sampler, or tokenizer review risks before any future micro-cycle approval.",
    reasons,
    risks,
    required_before_training: [
      "fresh explicit R25AO approval",
      "review R25AN corpus, sampler, tokenizer, contamination, and provenance reports",
      "preserve train/dev/heldout split integrity",
      "use zh-first sampling target zh >= 70%, mixed around 20%, en <= 10%",
      "keep phase_4 blocked unless a later readiness review and approval passes"
    ],
    must_not_do: [
      "do not run decoder training from R25AN",
      "do not run small-pilot training from R25AN",
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
  const doc = `# R25AN Next-Step Boundary

R25AN completed post-R25AM corpus, sampler, and tokenizer readiness review without approving decoder training.

## Decision

- Recommendation: ${decision.recommendation}
- Decoder training approved: false
- Small-pilot training approved: false
- Phase_4 approved: false
- Product training progress: 0%

## Reasons

${reasons.map((reason) => `- ${reason}`).join("\n")}

## Risks

${risks.length ? risks.map((risk) => `- ${risk}`).join("\n") : "- No hard tokenizer or sampler risk found."}

## Boundary

R25AO remains a future approval-only step. Any bounded Chinese-personal micro-cycle needs fresh explicit approval, must use the R25AM-expanded corpus with split integrity, and must not automatically follow from this tokenizer dry-run. Tokenizer artifacts and weights remain uncommitted.
`;
  await writeText(DOC_PATH, doc);
  console.log(JSON.stringify(decision, null, 2));
  if (!decision.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
