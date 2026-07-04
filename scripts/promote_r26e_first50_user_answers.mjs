#!/usr/bin/env node
import {
  R26D_CANDIDATES,
  R26E_APPROVAL,
  R26E_FILES,
  R26E_PHASE,
  R26E_POLICY,
  R26E_PROMOTION_REPORT,
  candidateFileHash,
  countBy,
  loadApproval,
  loadPromotedRows,
  loadR26DCandidates,
  makePromotionRow,
  normalizeTarget,
  reviewCandidate,
  splitForCandidate,
  writeJsonl,
  writePromotionLikeReport
} from "./r26e_user_answer_promotion_utils.mjs";
import { readJson, readJsonIfPresent, writeJson } from "./r26a_project_utils.mjs";

const SPLIT_CAPS = { train: 64, dev: 8, heldout: 8 };

async function existingHistoryReport(reason) {
  const existing = await readJsonIfPresent(R26E_PROMOTION_REPORT);
  if (existing?.ok === true && existing?.promoted_total > 0 && existing?.skipped !== true) {
    console.log(JSON.stringify({ ...existing, history_rerun: true, history_reason: reason }, null, 2));
    return;
  }
  const rows = await loadPromotedRows();
  const report = {
    ok: rows.length > 0,
    phase: R26E_PHASE,
    skipped: true,
    reason,
    source_candidate_file: R26D_CANDIDATES,
    promoted_total: rows.length,
    promoted_train: rows.filter((row) => row.split === "train").length,
    promoted_dev: rows.filter((row) => row.split === "dev").length,
    promoted_heldout: rows.filter((row) => row.split === "heldout").length,
    rows_51_100_used: false,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    phase4_approved: false
  };
  await writePromotionLikeReport(R26E_PROMOTION_REPORT, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

async function consumeApproval(outcome) {
  const marker = await readJson(R26E_APPROVAL);
  marker.consumed = true;
  marker.allow_additional_runs = false;
  marker.consumed_by_phase = R26E_PHASE;
  marker.consumed_by_commit = "pending_r26e_commit";
  marker.consumed_reason = "one-shot approval used or attempted for r26e_promote_first50_user_answers; future promotion requires a new approval marker; future runs require a new approval marker";
  marker.promotion_outcome = outcome;
  marker.allow_promote_derived_rows = false;
  await writeJson(R26E_APPROVAL, marker);
}

async function main() {
  const approval = await loadApproval();
  if (approval.consumed === true) return existingHistoryReport("approval_consumed_existing_promoted_files_validated_by_history");
  if (approval.approved !== true || approval.allow_promote_derived_rows !== true) throw new Error("R26E approval marker is not active for one-shot promotion");
  if (approval.allow_training !== false || approval.allow_tokenizer_dry_run !== false || approval.allow_phase_4_scaled_training !== false) {
    throw new Error("R26E approval marker contains a forbidden training/tokenizer/phase4 permission");
  }
  await readJson(R26E_POLICY);
  const candidates = await loadR26DCandidates();
  const seenTargets = new Set();
  const selected = [];
  const rejected = [];
  const splitCounts = { train: 0, dev: 0, heldout: 0 };

  for (const candidate of candidates) {
    const reasons = reviewCandidate(candidate, seenTargets);
    const split = splitForCandidate(candidate);
    if (splitCounts[split] >= SPLIT_CAPS[split]) reasons.push(`split_cap_reached:${split}`);
    if (selected.length >= 80) reasons.push("max_promoted_rows_reached");
    if (reasons.length) {
      rejected.push({ sample_id: candidate.sample_id, source_row_id: candidate.source_row_id, reasons });
      if (!reasons.some((reason) => reason === "duplicate_target_answer")) {
        const target = normalizeTarget(candidate.target_answer);
        if (target && !candidate.risk_flags?.length) seenTargets.add(target);
      }
      continue;
    }
    seenTargets.add(normalizeTarget(candidate.target_answer));
    const promoted = makePromotionRow(candidate, split);
    selected.push(promoted);
    splitCounts[split] += 1;
  }

  const bySplit = {
    train: selected.filter((row) => row.split === "train"),
    dev: selected.filter((row) => row.split === "dev"),
    heldout: selected.filter((row) => row.split === "heldout")
  };
  await writeJsonl(R26E_FILES.train, bySplit.train);
  await writeJsonl(R26E_FILES.dev, bySplit.dev);
  await writeJsonl(R26E_FILES.heldout, bySplit.heldout);

  const report = {
    ok: selected.length > 0,
    phase: R26E_PHASE,
    source_candidate_file: R26D_CANDIDATES,
    source_candidate_sha256: await candidateFileHash(),
    source_candidate_count: candidates.length,
    promotion_capable_count: selected.length,
    promoted_total: selected.length,
    promoted_train: bySplit.train.length,
    promoted_dev: bySplit.dev.length,
    promoted_heldout: bySplit.heldout.length,
    rejected_count: rejected.length,
    rejection_reasons: countBy(rejected.flatMap((item) => item.reasons).map((reason) => ({ reason })), "reason"),
    module_counts: countBy(selected, "module"),
    answer_mode_counts: countBy(selected, "answer_mode"),
    candidate_type_counts: countBy(selected, "candidate_type"),
    should_answer_counts: countBy(selected, (row) => String(row.should_answer)),
    evidence_policy_counts: countBy(selected, "evidence_policy"),
    speaker_context_counts: countBy(selected, "speaker_context"),
    source_row_id_min: Math.min(...selected.map((row) => row.source_row_id)),
    source_row_id_max: Math.max(...selected.map((row) => row.source_row_id)),
    rows_51_100_used: selected.some((row) => row.source_row_id >= 51),
    rejected_samples: rejected.slice(0, 40),
    training_ran: false,
    tokenizer_dry_run_ran: false,
    phase4_approved: false
  };
  await writePromotionLikeReport(R26E_PROMOTION_REPORT, report);
  await consumeApproval(report.ok ? "promoted_reviewed_first50_subset" : "promotion_attempt_failed_safely");
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch(async (error) => {
  try {
    await loadApproval();
    await consumeApproval("promotion_attempt_failed_safely");
  } catch {}
  console.error(error);
  process.exit(2);
});
