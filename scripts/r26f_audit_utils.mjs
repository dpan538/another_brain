#!/usr/bin/env node
import { dirname } from "node:path";
import {
  exists,
  gitLines,
  readJson,
  readJsonIfPresent,
  readJsonlRows,
  stagedFiles,
  trackedFiles,
  writeJson,
  writeText
} from "./r26a_project_utils.mjs";
import {
  R26D_SOURCE,
  readQuestionPack
} from "./r26d_question_pack_utils.mjs";
import {
  R26D_CANDIDATES,
  R26E_FILES,
  R26E_PACK_ID,
  R26E_PROMOTION_REPORT,
  loadPromotedRows,
  normalizeTarget,
  reviewCandidate,
  splitForCandidate
} from "./r26e_user_answer_promotion_utils.mjs";

export const R26F_PHASE = "R26F";
export const R26F_REPORT_DIR = "artifacts/training_os/user_answer_intake/r26f";
export const R26F_TRACE_REPORT = `${R26F_REPORT_DIR}/r26f_r26e_promotion_trace.json`;
export const R26F_DUPLICATE_REPORT = `${R26F_REPORT_DIR}/r26f_duplicate_rejection_audit.json`;
export const R26F_PROJECT_META_REPORT = `${R26F_REPORT_DIR}/r26f_project_meta_rejection_audit.json`;
export const R26F_SHOULD_ANSWER_REPORT = `${R26F_REPORT_DIR}/r26f_should_answer_semantics_audit.json`;
export const R26F_NEXT_STEP_REPORT = `${R26F_REPORT_DIR}/r26f_next_step_recommendation.json`;
export const R26F_CHECK_REPORT = `${R26F_REPORT_DIR}/r26f_checker_report.json`;

export const R26F_DOCS = {
  trace: "docs/R26F_R26E_PROMOTION_TRACE_AUDIT.md",
  duplicate: "docs/R26F_DUPLICATE_REJECTION_AUDIT.md",
  projectMeta: "docs/R26F_PROJECT_META_REJECTION_AUDIT.md",
  shouldAnswer: "docs/R26F_SHOULD_ANSWER_SEMANTICS_AUDIT.md",
  nextStep: "docs/R26F_NEXT_STEP_RECOMMENDATION.md"
};

export const R26F_SCRIPTS = [
  "scripts/audit_r26f_r26e_promotion_trace.mjs",
  "scripts/audit_r26f_duplicate_rejections.mjs",
  "scripts/audit_r26f_project_meta_rejections.mjs",
  "scripts/audit_r26f_should_answer_semantics.mjs",
  "scripts/report_r26f_next_step_recommendation.mjs",
  "scripts/check_r26f_promotion_trace_audit.mjs",
  "scripts/r26f_audit_utils.mjs"
];

export const R26G_TEMPLATE = "training/from_scratch/APPROVE_R26G_FIX_R26E_METADATA_OR_REPROMOTE.template.json";
export const SPLIT_CAPS = { train: 64, dev: 8, heldout: 8 };

export function rowIds1To50() {
  return Array.from({ length: 50 }, (_, index) => index + 1);
}

export function countBy(rows, getter) {
  const out = {};
  for (const row of rows || []) {
    const value = typeof getter === "function" ? getter(row) : row?.[getter];
    if (Array.isArray(value)) {
      for (const item of value) out[String(item)] = (out[String(item)] || 0) + 1;
    } else {
      out[String(value ?? "unknown")] = (out[String(value ?? "unknown")] || 0) + 1;
    }
  }
  return out;
}

export function sortedCounts(counts) {
  return Object.fromEntries(Object.entries(counts || {}).sort(([a], [b]) => a.localeCompare(b)));
}

export function markdownTable(headers, rows) {
  const safe = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${headers.map(safe).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(safe).join(" | ")} |`)
  ].join("\n");
}

export function bullets(items) {
  return (items || []).map((item) => `- ${item}`).join("\n");
}

export async function readJsonlIfPresent(path) {
  if (!(await exists(path))) return { available: false, rows: [] };
  return { available: true, rows: (await readJsonlRows(path)).map(({ row, line }) => ({ ...row, __line: line })) };
}

export async function readFirst50SourceRows() {
  if (!(await exists(R26D_SOURCE))) {
    return {
      available: false,
      source_path: R26D_SOURCE,
      rows: [],
      first50_count: 0,
      excluded_51_100_count: null,
      raw_should_answer_counts: {},
      blank_should_answer_count: null
    };
  }
  const pack = await readQuestionPack();
  const first50 = pack.rows
    .filter((row) => row.id >= 1 && row.id <= 50)
    .map((row) => ({
      row_id: row.id,
      csv_line: row.csv_line,
      module: row.module,
      scene: row.scene,
      question: row.question,
      has_user_answer: Boolean(String(row.user_answer || "").trim()),
      user_answer_length: String(row.user_answer || "").trim().length,
      source_should_answer_raw: row.should_answer_raw
    }));
  const rawShouldAnswerCounts = countBy(first50, (row) => row.source_should_answer_raw || "[blank]");
  return {
    available: true,
    source_path: R26D_SOURCE,
    rows: first50,
    first50_count: first50.length,
    excluded_51_100_count: pack.rows.filter((row) => row.id >= 51 && row.id <= 100).length,
    raw_should_answer_counts: rawShouldAnswerCounts,
    blank_should_answer_count: first50.filter((row) => !String(row.source_should_answer_raw || "").trim()).length,
    file_sha256: pack.file_sha256,
    byte_size: pack.byte_size
  };
}

export async function loadR26FEvidence() {
  const source = await readFirst50SourceRows();
  const candidates = await readJsonlIfPresent(R26D_CANDIDATES);
  const promotedRows = await loadPromotedRows().catch(() => []);
  const promotionReport = await readJsonIfPresent(R26E_PROMOTION_REPORT);
  const replay = candidates.available ? replayR26EPromotion(candidates.rows) : emptyReplay("candidate_artifact_missing");
  return {
    source,
    candidates,
    promotedRows,
    promotionReport,
    replay,
    missing_artifacts: [
      ...(!source.available ? [R26D_SOURCE] : []),
      ...(!candidates.available ? [R26D_CANDIDATES] : []),
      ...(!promotionReport ? [R26E_PROMOTION_REPORT] : [])
    ]
  };
}

export function emptyReplay(reason) {
  return {
    available: false,
    reason,
    selected: [],
    rejected: [],
    split_counts: { train: 0, dev: 0, heldout: 0 },
    rejection_reasons: {}
  };
}

export function replayR26EPromotion(candidates) {
  const seenTargets = new Map();
  const selected = [];
  const rejected = [];
  const splitCounts = { train: 0, dev: 0, heldout: 0 };

  for (const candidate of candidates) {
    const reasons = [...reviewCandidate(candidate, new Set(seenTargets.keys()))];
    const split = splitForCandidate(candidate);
    if (splitCounts[split] >= SPLIT_CAPS[split]) reasons.push(`split_cap_reached:${split}`);
    if (selected.length >= 80) reasons.push("max_promoted_rows_reached");
    const normalizedTarget = normalizeTarget(candidate.target_answer);
    const duplicateOf = reasons.includes("duplicate_target_answer") ? seenTargets.get(normalizedTarget) : null;
    if (reasons.length) {
      rejected.push({
        candidate,
        sample_id: candidate.sample_id,
        source_row_id: Number(candidate.source_row_id),
        candidate_type: candidate.candidate_type,
        split_suggestion: candidate.split_suggestion,
        would_split: split,
        normalized_target: normalizedTarget,
        duplicate_of: duplicateOf ? candidateRef(duplicateOf) : null,
        reasons
      });
      if (!reasons.includes("duplicate_target_answer")) {
        if (normalizedTarget && !candidate.risk_flags?.length) seenTargets.set(normalizedTarget, candidate);
      }
      continue;
    }
    seenTargets.set(normalizedTarget, candidate);
    selected.push({
      candidate,
      sample_id: candidate.sample_id,
      source_row_id: Number(candidate.source_row_id),
      candidate_type: candidate.candidate_type,
      split,
      expected_promoted_sample_id: `r26e_user_answered_row_${String(candidate.source_row_id).padStart(3, "0")}`
    });
    splitCounts[split] += 1;
  }

  return {
    available: true,
    selected,
    rejected,
    split_counts: splitCounts,
    rejection_reasons: countBy(rejected.flatMap((item) => item.reasons).map((reason) => ({ reason })), "reason")
  };
}

export function candidateRef(candidate) {
  return {
    sample_id: candidate.sample_id,
    source_row_id: Number(candidate.source_row_id),
    candidate_type: candidate.candidate_type
  };
}

export function buildTraceTable(evidence) {
  const sourceById = new Map(evidence.source.rows.map((row) => [row.row_id, row]));
  const candidateRows = evidence.candidates.rows || [];
  const candidatesById = groupBy(candidateRows, (row) => Number(row.source_row_id));
  const promotedById = groupBy(evidence.promotedRows || [], (row) => Number(row.source_row_id));
  const rejectedById = groupBy(evidence.replay.rejected || [], (row) => Number(row.source_row_id));
  const selectedById = groupBy(evidence.replay.selected || [], (row) => Number(row.source_row_id));

  const rows = rowIds1To50().map((id) => {
    const source = sourceById.get(id) || {};
    const candidates = candidatesById.get(id) || [];
    const promoted = promotedById.get(id) || [];
    const rejected = rejectedById.get(id) || [];
    const selected = selectedById.get(id) || [];
    const duplicateRejections = rejected.filter((item) => item.reasons.includes("duplicate_target_answer"));
    const projectMetaRejections = rejected.filter((item) => item.reasons.some((reason) => reason === "risk_flags:project_meta_leakage" || reason.includes("project_meta_leakage")));
    const rejectedReasons = countBy(rejected.flatMap((item) => item.reasons).map((reason) => ({ reason })), "reason");
    const uniqueTargets = new Set(candidates.map((row) => normalizeTarget(row.target_answer)).filter(Boolean));
    const promotedSplits = [...new Set(promoted.map((row) => row.split || row.__expected_split).filter(Boolean))];
    const promotedSamples = promoted.map((row) => row.sample_id);
    const replaySelectedButMissing = promoted.length === 0 && selected.length > 0;
    const zeroPromotedReason = promoted.length
      ? ""
      : zeroPromotedReasonFor({ candidates, rejected, duplicateRejections, projectMetaRejections, replaySelectedButMissing, evidence });
    const auditConclusion = auditConclusionFor({ candidates, promoted, rejected, duplicateRejections, projectMetaRejections, replaySelectedButMissing, evidence });
    return {
      row_id: id,
      module: source.module || candidates[0]?.module || promoted[0]?.module || "",
      question: source.question || candidates[0]?.question || promoted[0]?.question || "",
      has_user_answer: source.has_user_answer ?? null,
      user_answer_length: source.user_answer_length ?? candidates[0]?.user_answer_raw?.length ?? promoted[0]?.user_answer_raw?.length ?? null,
      source_should_answer_raw: source.source_should_answer_raw ?? "",
      candidate_count: candidates.length,
      candidate_type_counts: sortedCounts(countBy(candidates, "candidate_type")),
      unique_candidate_target_count: uniqueTargets.size,
      promoted_count: promoted.length,
      promoted_split: promotedSplits.join(", "),
      promoted_sample_ids: promotedSamples,
      rejected_count: rejected.length,
      rejection_reasons: sortedCounts(rejectedReasons),
      duplicate_rejection_count: duplicateRejections.length,
      project_meta_rejection_count: projectMetaRejections.length,
      zero_promoted_reason: zeroPromotedReason,
      needs_review: ["rejected_project_meta_needs_review", "missing_candidate_bug", "missing_promotion_bug", "unknown"].includes(auditConclusion),
      audit_conclusion: auditConclusion
    };
  });

  const duplicateRejected = evidence.replay.rejected.filter((item) => item.reasons.includes("duplicate_target_answer"));
  const duplicateSameSourceSlice = duplicateRejected.filter((item) => item.candidate_type === "source_slice" && item.duplicate_of?.source_row_id === item.source_row_id);
  const projectMetaRejected = evidence.replay.rejected.filter((item) => item.reasons.some((reason) => reason.includes("project_meta_leakage")));
  const promotedSourceIds = new Set((evidence.promotedRows || []).map((row) => Number(row.source_row_id)));
  const zeroRows = rows.filter((row) => row.promoted_count === 0).map((row) => row.row_id);
  const representedRows = rows.filter((row) => row.promoted_count > 0).map((row) => row.row_id);
  const summary = {
    total_source_rows_1_50: 50,
    raw_csv_present: evidence.source.available,
    r26d_candidate_artifact_present: evidence.candidates.available,
    r26e_promotion_report_present: Boolean(evidence.promotionReport),
    source_rows_represented_in_promoted_corpus: representedRows.length,
    represented_source_row_ids: representedRows,
    source_rows_with_zero_promoted_candidates: zeroRows,
    promoted_candidate_count: evidence.promotedRows.length,
    promoted_unique_source_row_id_count: promotedSourceIds.size,
    r26d_candidate_count: candidateRows.length,
    replay_selected_count: evidence.replay.selected.length,
    replay_rejected_count: evidence.replay.rejected.length,
    candidates_rejected_as_duplicate: duplicateRejected.length,
    duplicate_rejections_same_source_slice_count: duplicateSameSourceSlice.length,
    duplicate_rejections_are_mostly_source_slice_duplicates: duplicateRejected.length > 0 && duplicateSameSourceSlice.length === duplicateRejected.length,
    candidates_rejected_as_project_meta: projectMetaRejected.length,
    source_rows_affected_by_project_meta: [...new Set(projectMetaRejected.map((item) => item.source_row_id))].sort((a, b) => a - b),
    rows_51_100_used: [...candidateRows, ...(evidence.promotedRows || [])].some((row) => Number(row.source_row_id) >= 51),
    why_45_rows: [
      `R26D generated ${candidateRows.length} candidates from 50 answered source rows.`,
      `R26E promoted ${evidence.promotedRows.length} candidates from ${promotedSourceIds.size} unique source rows.`,
      `${duplicateRejected.length} rejected candidates were duplicate target answers; ${duplicateSameSourceSlice.length} were same-source source_slice duplicates of an already selected primary candidate.`,
      `${projectMetaRejected.length} rejected candidates came from ${new Set(projectMetaRejected.map((item) => item.source_row_id)).size} source rows flagged as project_meta_leakage.`,
      `Therefore the 45 promoted rows are 45 unique source rows, not a statement that only 45 source answers exist or are usable.`
    ],
    missing_artifacts: evidence.missing_artifacts
  };

  return { rows, summary };
}

function zeroPromotedReasonFor({ candidates, rejected, duplicateRejections, projectMetaRejections, replaySelectedButMissing, evidence }) {
  if (!evidence.candidates.available) return "candidate_artifact_missing";
  if (!candidates.length) return "no_r26d_candidate_for_source_row";
  if (replaySelectedButMissing) return "replay_selected_candidate_missing_from_promoted_corpus";
  if (projectMetaRejections.length === rejected.length && rejected.length > 0) return "all_candidates_rejected_project_meta_risk";
  if (duplicateRejections.length === rejected.length && rejected.length > 0) return "all_candidates_rejected_as_duplicates";
  if (rejected.length) return "all_candidates_rejected_mixed_reasons";
  return "unknown_zero_promotion_reason";
}

function auditConclusionFor({ candidates, promoted, rejected, duplicateRejections, projectMetaRejections, replaySelectedButMissing, evidence }) {
  if (!evidence.candidates.available) return "unknown";
  if (!candidates.length) return "missing_candidate_bug";
  if (replaySelectedButMissing) return "missing_promotion_bug";
  if (promoted.length > 0 && rejected.length === 0) return "promoted_cleanly";
  if (promoted.length > 0 && duplicateRejections.length > 0 && projectMetaRejections.length === 0) return "promoted_after_dedup";
  if (promoted.length === 0 && duplicateRejections.length === rejected.length && rejected.length > 0) return "rejected_only_duplicate_slices";
  if (promoted.length === 0 && projectMetaRejections.length > 0) return "rejected_project_meta_needs_review";
  if (promoted.length === 0 && rejected.length > 0) return "source_row_should_remain_excluded";
  return "unknown";
}

export function groupBy(rows, getter) {
  const out = new Map();
  for (const row of rows || []) {
    const key = typeof getter === "function" ? getter(row) : row?.[getter];
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(row);
  }
  return out;
}

export function classifyDuplicateRejection(item) {
  const prior = item.duplicate_of;
  if (!prior) return "unknown_due_missing_report";
  const sameSource = Number(prior.source_row_id) === Number(item.source_row_id);
  const candidate = item.candidate || {};
  const exact = String(candidate.target_answer || "") === String(item.candidate?.target_answer || "");
  const normalizedCollision = normalizeTarget(candidate.target_answer) === item.normalized_target && !exact;
  if (sameSource && item.candidate_type === "source_slice" && prior.candidate_type !== "source_slice") return "duplicate_primary_slice_pair";
  if (sameSource && item.candidate_type === "source_slice" && prior.candidate_type === "source_slice") return "duplicate_source_slice_of_same_source_row";
  if (!sameSource && exact && item.candidate_type !== "source_slice" && prior.candidate_type !== "source_slice") return "true_duplicate_user_answer";
  if (!sameSource && exact) return "duplicate_across_different_source_rows";
  if (normalizedCollision) return "normalization_collision";
  return sameSource ? "duplicate_source_slice_of_same_source_row" : "unknown_due_missing_report";
}

export function classifyProjectMetaSourceRow(row) {
  const id = Number(row.source_row_id);
  const question = String(row.question || "");
  const target = String(row.target_answer || row.user_answer_clean || "");
  const text = `${question}\n${target}`;
  const overrides = {
    2: {
      classification: "project_identity_answer_keep_candidate",
      rejection_justified: false,
      rationale: "The prompt asks what another_brain is; it is product identity material, not a phase or implementation-control row."
    },
    9: {
      classification: "needs_user_review",
      rejection_justified: "partial",
      rationale: "The prompt uses training/model language, but the answer expresses the user's model-purpose stance rather than a concrete next-step instruction."
    },
    16: {
      classification: "true_training_meta_exclude",
      rejection_justified: true,
      rationale: "The prompt is explicitly from Codex about whether to continue training, so exclusion as training-control metadata is justified."
    },
    29: {
      classification: "product_boundary_answer_keep_candidate",
      rejection_justified: false,
      rationale: "The prompt asks for a success guarantee and the answer sets a product/life boundary; it is not a concrete training-meta instruction."
    },
    47: {
      classification: "product_boundary_answer_keep_candidate",
      rejection_justified: false,
      rationale: "The prompt asks how a model avoids客服-like behavior; it is a product boundary and behavior answer, not phase or deployment metadata."
    }
  };
  if (overrides[id]) return overrides[id];
  if (/Codex|下一步|继续训练|phase|阶段|tokenizer|语料|训练审批|approval/i.test(question)) {
    return {
      classification: "true_training_meta_exclude",
      rejection_justified: true,
      rationale: "The prompt appears to be training process metadata."
    };
  }
  if (/Vercel|API|后端|storage|部署|路径|实现细节|pipeline/i.test(text)) {
    return {
      classification: "engineering_process_exclude",
      rejection_justified: true,
      rationale: "The text appears to expose engineering process or deployment details."
    };
  }
  if (/another_brain|efish|网站|模型|自己的东西/.test(text)) {
    return {
      classification: "project_identity_answer_keep_candidate",
      rejection_justified: false,
      rationale: "The text appears to be project identity material."
    };
  }
  if (/客服|保证|边界|不像|generic assistant/i.test(text)) {
    return {
      classification: "product_boundary_answer_keep_candidate",
      rejection_justified: false,
      rationale: "The text appears to be product boundary material."
    };
  }
  return {
    classification: "needs_user_review",
    rejection_justified: "partial",
    rationale: "The row needs manual review before any later correction."
  };
}

export async function writeJsonReport(path, value) {
  await writeJson(path, value);
  return value;
}

export async function writeMarkdown(path, text) {
  await writeText(path, text);
}

export async function readR26FReportsIfPresent() {
  return {
    trace: await readJsonIfPresent(R26F_TRACE_REPORT),
    duplicate: await readJsonIfPresent(R26F_DUPLICATE_REPORT),
    projectMeta: await readJsonIfPresent(R26F_PROJECT_META_REPORT),
    shouldAnswer: await readJsonIfPresent(R26F_SHOULD_ANSWER_REPORT),
    nextStep: await readJsonIfPresent(R26F_NEXT_STEP_REPORT)
  };
}

export async function gitChangedTrainingCorpusFiles() {
  const unstaged = await gitLines(["diff", "--name-only", "--", "training/llm_corpus"]);
  const staged = await gitLines(["diff", "--cached", "--name-only", "--", "training/llm_corpus"]);
  return { unstaged, staged, all: [...new Set([...unstaged, ...staged])] };
}

export async function stagedForbiddenFiles() {
  const staged = await stagedFiles();
  return {
    artifacts: staged.filter((path) => path.startsWith("artifacts/")),
    private_sources: staged.filter((path) => path.startsWith("private_sources/")),
    public_ingestion: staged.filter((path) => path.startsWith("data/public_ingestion/")),
    raw_sources: staged.filter((path) => /\.(csv|CSV|xlsx|XLSX|pdf|PDF|docx|DOCX|doc|DOC)$/.test(path))
  };
}

export async function approvalSafetySummary() {
  const tracked = await trackedFiles();
  const approvalFiles = tracked.filter((path) => /^training\/from_scratch\/APPROVE_.*\.json$/.test(path));
  const summaries = [];
  for (const path of approvalFiles) {
    let marker = null;
    try {
      marker = await readJson(path);
    } catch {
      continue;
    }
    const active = marker?.approved === true && marker?.consumed !== true && !path.endsWith(".template.json");
    summaries.push({
      path,
      approved: marker?.approved === true,
      consumed: marker?.consumed === true,
      active_training: active && (
        marker.allow_training === true ||
        marker.allow_decoder_training === true ||
        marker.allow_small_pilot_training === true ||
        marker.allow_product_model_training === true
      ),
      active_tokenizer_dry_run: active && marker.allow_tokenizer_dry_run === true,
      active_corpus_generation: active && (
        marker.allow_candidate_generation === true ||
        marker.allow_corpus_generation === true
      ),
      active_phase4_training: active && marker.allow_phase_4_scaled_training === true,
      active_weight_commit: active && marker.allow_weight_commit === true
    });
  }
  return {
    active_training_approval_count: summaries.filter((row) => row.active_training).length,
    active_tokenizer_dry_run_approval_count: summaries.filter((row) => row.active_tokenizer_dry_run).length,
    active_corpus_generation_approval_count: summaries.filter((row) => row.active_corpus_generation).length,
    active_phase4_training_approval_count: summaries.filter((row) => row.active_phase4_training).length,
    active_weight_commit_approval_count: summaries.filter((row) => row.active_weight_commit).length,
    summaries
  };
}

export async function ensureReportParent(path) {
  await writeJson(`${dirname(path)}/.keep-check.json`, { ok: true });
}
