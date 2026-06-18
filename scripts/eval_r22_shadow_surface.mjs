#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { createDialogRuntime, answerDialogPrompt } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";
import { classifySurfaceHits, makeExecutionReport, zhChars } from "./r22_surface_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r22_shadow_surface_eval_report.json");
const REVIEW_OUT = resolve(ROOT, "artifacts/training_os/r22_surface_ab_review_blind.json");
const MAPPING_OUT = resolve(ROOT, "artifacts/training_os/r22_surface_ab_mapping_private.json");
const BASELINE = "56713f5192e75f068c7efac0346ff024e6d5bcc9";

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function jsonl(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function readJsonl(path) {
  return jsonl(await readFile(resolve(ROOT, path), "utf8"));
}

function candidateOf(turn = {}) {
  return turn.trace?.conversation_controller?.surface_candidate || {};
}

function currentText(turn = {}) {
  return String(turn.answer || turn.output || "").trim();
}

function candidateText(turn = {}) {
  return String(candidateOf(turn).candidate_answer || "").trim();
}

function riskyHits(text) {
  return classifySurfaceHits(text).filter((hit) =>
    [
      "you_can_continue_ask",
      "generic_thanks",
      "continue_effort",
      "i_caught_it",
      "announced_bridge_skeleton",
      "domain_profile_entry_skeleton",
      "focus_synonym_skeleton"
    ].includes(hit.id)
  );
}

function hashText(text) {
  let hash = 0;
  for (const char of String(text || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function domainHint(text = "") {
  if (/罗大佑|王菲|李宗盛|音乐|歌|专辑|单曲/.test(text)) return "music_literature";
  if (/电影|镜头|王家卫|小津/.test(text)) return "film";
  if (/饮食|烹饪|餐桌|食物|茶/.test(text)) return "food";
  if (/法律|法庭|规则|正义|判例/.test(text)) return "law";
  if (/历史|档案|史料|记忆/.test(text)) return "history";
  if (/心理|梦|情绪|精神分析/.test(text)) return "psychology";
  if (/文学|诗|小说|夏目|村上|张爱玲/.test(text)) return "music_literature";
  return "mixed";
}

function classifyCandidateOutcome({ current, candidate, surfaceCandidate }) {
  const currentHits = riskyHits(current);
  const candidateHits = riskyHits(candidate);
  const candidateIsFallback = Boolean(surfaceCandidate.fallback_to_current_reason);
  const candidateAttempted = Boolean(candidate) && !candidateIsFallback && candidate !== current;
  const semantic = surfaceCandidate.semantic_verifier || {};
  const semanticHardFailures = Array.isArray(semantic.hard_failures) ? semantic.hard_failures : [];
  const semanticFallback = surfaceCandidate.fallback_to_current_reason === "candidate_failed_semantic_verifier";
  const acceptedCandidateSemanticFailure = candidateAttempted && semantic.semantic_preservation_ok === false;
  const contextFitFailure = semantic.context_fit_ok === false;
  const boundaryFailure = semantic.boundary_ok === false;
  const lostUsefulSpecificity = zhChars(candidate) > 0 && zhChars(current) - zhChars(candidate) > 80 && !/《|：|，/.test(candidate);
  const tooShortCold = zhChars(candidate) > 0 && zhChars(candidate) < 8;
  return {
    current_failure: currentHits.length > 0,
    candidate_attempted: candidateAttempted,
    candidate_not_attempted: candidateIsFallback,
    candidate_surface_pattern_failure: candidateAttempted && candidateHits.length > 0,
    candidate_semantic_failure: acceptedCandidateSemanticFailure,
    candidate_context_fit_failure: contextFitFailure,
    candidate_boundary_failure: boundaryFailure,
    candidate_failure:
      (candidateAttempted && (candidateHits.length > 0 || lostUsefulSpecificity || tooShortCold)) ||
      acceptedCandidateSemanticFailure ||
      contextFitFailure ||
      boundaryFailure,
    current_hits: currentHits,
    candidate_hits: candidateHits,
    candidate_is_fallback: candidateIsFallback,
    candidate_semantic_fallback: semanticFallback,
    semantic_hard_failures: semanticHardFailures,
    confirmation_false_positive:
      semanticHardFailures.includes("false_confirmation") || semanticHardFailures.includes("confirmation_polarity_unknown"),
    unsupported_stance: semanticHardFailures.includes("unsupported_stance"),
    candidate_lost_useful_specificity: lostUsefulSpecificity,
    candidate_too_short_or_cold: tooShortCold,
    candidate_worse:
      candidateHits.length > currentHits.length ||
      (candidateAttempted && (lostUsefulSpecificity || tooShortCold)) ||
      acceptedCandidateSemanticFailure ||
      contextFitFailure ||
      boundaryFailure
  };
}

async function loadSessions() {
  const sessions = [];
  try {
    const anchor = await readJson("evals/r21_mixed_dialogic/gold_session.json");
    sessions.push({ source: "r21_anchor", id: anchor.id || "r21_anchor", turns: anchor.turns || [] });
  } catch {
    // Optional in old checkouts.
  }
  try {
    const blind = await readJsonl("evals/r21_mixed_dialogic/blind_sibling_sessions.jsonl");
    for (const row of blind) sessions.push({ source: "r21_blind_sibling", id: row.id || "", turns: row.turns || [] });
  } catch {
    // Optional in old checkouts.
  }
  try {
    const nonQuestion = await readJsonl("evals/r22_natural_surface/non_question_turns.jsonl");
    for (const row of nonQuestion) {
      sessions.push({
        source: "r22_non_question",
        id: row.id || "",
        turns: [...(row.context || []), { user: row.user, turn_function: row.turn_function }]
      });
    }
  } catch {
    // Optional in old checkouts.
  }
  try {
    const rhythm = await readJsonl("evals/r22_natural_surface/session_rhythm_cases.jsonl");
    for (const row of rhythm) sessions.push({ source: "r22_session_rhythm", id: row.id || "", turns: row.turns || [] });
  } catch {
    // Optional in old checkouts.
  }
  return sessions;
}

async function runSession(session) {
  const runtime = createDialogRuntime();
  const turns = [];
  const contextTurns = [];
  for (const [index, turn] of (session.turns || []).entries()) {
    if (!turn.user) continue;
    const contextForReview = contextTurns.slice(-4);
    const actual = await answerDialogPrompt(turn.user, runtime, { uiProfile: "mobile", withThinkingDelay: false });
    const trace = actual.trace?.conversation_controller || {};
    const current = currentText(actual);
    const candidate = candidateText(actual);
    const surfaceCandidate = candidateOf(actual);
    const outcome = classifyCandidateOutcome({ current, candidate, surfaceCandidate });
    turns.push({
      source: session.source,
      session_id: session.id,
      turn_index: index + 1,
      user: turn.user,
      expected_turn_function: turn.turn_function || turn.expected_turn_function || "",
      turn_function: trace.turn_function || "",
      response_mode: trace.response_mode || "",
      surface_mode: trace.surface_mode || "",
      reasoning_budget: trace.reasoning_budget || "",
      context_turns: contextForReview,
      current_answer: current,
      shadow_candidate_answer: candidate,
      surface_candidate: surfaceCandidate,
      domain_hint: domainHint(`${session.id} ${turn.user} ${current}`),
      ...outcome
    });
    contextTurns.push({ user: turn.user, assistant: current });
  }
  return turns;
}

function countHits(turns, field) {
  const counts = {};
  for (const turn of turns) {
    for (const hit of turn[field] || []) counts[hit.id] = (counts[hit.id] || 0) + hit.matches.length;
  }
  return counts;
}

function makeReviewRows(turns) {
  const blindRows = [];
  const mappingRows = [];
  for (const turn of turns
    .filter((turn) => turn.shadow_candidate_answer && turn.shadow_candidate_answer !== turn.current_answer)
    .slice(0, 120)) {
    const id = `${turn.session_id}#${turn.turn_index}`;
    const swap = hashText(id) % 2 === 0;
    blindRows.push({
      id,
      source: turn.source,
      context: {
        session_id: turn.session_id,
        turn_index: turn.turn_index,
        context_turns: turn.context_turns || []
      },
      user_turn: turn.user,
      answer_a: swap ? turn.shadow_candidate_answer : turn.current_answer,
      answer_b: swap ? turn.current_answer : turn.shadow_candidate_answer,
      randomized_order: true,
      turn_function: turn.turn_function,
      factual_support_trace: {
        evidence_ids: turn.surface_candidate?.evidence_ids || [],
        content_units_used: turn.surface_candidate?.content_units_used || {},
        primitives_used: turn.surface_candidate?.primitives_used || [],
        semantic_verifier_summary: {
          ok: turn.surface_candidate?.semantic_verifier?.ok ?? null,
          hard_failures: turn.surface_candidate?.semantic_verifier?.hard_failures || []
        }
      },
      review_dimensions: {
        factual_correctness: null,
        active_referent_correctness: null,
        turn_fit: null,
        naturalness: null,
        specificity: null,
        boundary_discipline: null,
        over_explanation: null,
        too_terse: null,
        unsupported_interpretation: null,
        preferred_answer: null,
        neither_acceptable: null
      }
    });
    mappingRows.push({
      id,
      answer_a: swap ? "shadow_candidate" : "current",
      answer_b: swap ? "current" : "shadow_candidate",
      current_answer: turn.current_answer,
      shadow_candidate_answer: turn.shadow_candidate_answer
    });
  }
  return { blindRows, mappingRows };
}

async function main() {
  const sessions = await loadSessions();
  const turns = [];
  for (const session of sessions) turns.push(...(await runSession(session)));
  const currentFailures = turns.filter((turn) => turn.current_failure);
  const candidateFailures = turns.filter((turn) => turn.candidate_failure);
  const candidateSurfaceFailures = turns.filter((turn) => turn.candidate_surface_pattern_failure);
  const candidateSemanticFailures = turns.filter((turn) => turn.candidate_semantic_failure);
  const candidateContextFitFailures = turns.filter((turn) => turn.candidate_context_fit_failure);
  const candidateBoundaryFailures = turns.filter((turn) => turn.candidate_boundary_failure);
  const candidateWorse = turns.filter((turn) => turn.candidate_worse);
  const candidateAttempted = turns.filter((turn) => turn.candidate_attempted);
  const candidateNotAttempted = turns.filter((turn) => turn.candidate_not_attempted);
  const semanticFallbacks = turns.filter((turn) => turn.candidate_semantic_fallback);
  const lostSpecificity = turns.filter((turn) => turn.candidate_lost_useful_specificity);
  const tooShortCold = turns.filter((turn) => turn.candidate_too_short_or_cold);
  const unsupportedStance = turns.filter((turn) => turn.unsupported_stance);
  const falseConfirmations = turns.filter((turn) => turn.confirmation_false_positive);
  const domains = {};
  for (const turn of turns) domains[turn.domain_hint] = (domains[turn.domain_hint] || 0) + 1;
  const anchorTurns = turns.filter((turn) => turn.source === "r21_anchor");
  const siblingTurns = turns.filter((turn) => turn.source === "r21_blind_sibling");
  const anchorImprovement =
    anchorTurns.filter((turn) => turn.current_failure).length - anchorTurns.filter((turn) => turn.candidate_failure).length;
  const siblingImprovement =
    siblingTurns.filter((turn) => turn.current_failure).length - siblingTurns.filter((turn) => turn.candidate_failure).length;
  const report = makeExecutionReport({
    behaviorOk: false,
    auditOnly: true,
    baselineCommit: BASELINE,
    evaluatedCommit: gitHead(),
    extra: {
      automated_surface_ok: candidateSurfaceFailures.length === 0,
      semantic_preservation_ok: candidateSemanticFailures.length === 0,
      human_review_status: "pending",
      promotion_ready: false,
      behavior_status: "unknown_pending_semantic_and_human_review",
      sessions: sessions.length,
      turns_total: turns.length,
      domains_covered: domains,
      current_failure_count: currentFailures.length,
      candidate_attempted_count: candidateAttempted.length,
      candidate_not_attempted_count: candidateNotAttempted.length,
      candidate_failure_count: candidateFailures.length,
      candidate_surface_pattern_failure_count: candidateSurfaceFailures.length,
      candidate_semantic_failure_count: candidateSemanticFailures.length,
      candidate_context_fit_failure_count: candidateContextFitFailures.length,
      candidate_boundary_failure_count: candidateBoundaryFailures.length,
      candidate_too_terse_count: tooShortCold.length,
      candidate_unsupported_stance_count: unsupportedStance.length,
      semantic_fallback_count: semanticFallbacks.length,
      confirmation_false_positive_count: falseConfirmations.length,
      current_pattern_counts: countHits(turns, "current_hits"),
      candidate_pattern_counts: countHits(turns, "candidate_hits"),
      current_candidate_factual_differences: candidateSemanticFailures.length ? "automated_semantic_failures_detected" : "requires_human_review",
      current_candidate_boundary_differences: candidateBoundaryFailures.length ? "automated_boundary_failures_detected" : "requires_human_review",
      anchor_improvement: anchorImprovement,
      sibling_improvement: siblingImprovement,
      anchor_vs_sibling_delta: anchorImprovement - siblingImprovement,
      candidate_worse_count: candidateWorse.length,
      candidate_lost_useful_specificity_count: lostSpecificity.length,
      candidate_too_short_or_cold_count: tooShortCold.length,
      candidate_worse_examples: candidateWorse.slice(0, 40),
      sampled_turns: turns.slice(0, 400)
    }
  });
  const reviewRows = makeReviewRows(turns);
  const review = {
    generated_at: new Date().toISOString(),
    baseline_commit: BASELINE,
    evaluated_commit: gitHead(),
    randomized: true,
    automatic_preference_label: false,
    contains_mapping: false,
    rows: reviewRows.blindRows
  };
  const mapping = {
    generated_at: review.generated_at,
    baseline_commit: BASELINE,
    evaluated_commit: gitHead(),
    private_mapping: true,
    rows: reviewRows.mappingRows
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(REVIEW_OUT, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  await writeFile(MAPPING_OUT, `${JSON.stringify(mapping, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    execution_ok: report.execution_ok,
    behavior_ok: report.behavior_ok,
    audit_only: report.audit_only,
    behavior_status: report.behavior_status,
    automated_surface_ok: report.automated_surface_ok,
    semantic_preservation_ok: report.semantic_preservation_ok,
    human_review_status: report.human_review_status,
    promotion_ready: report.promotion_ready,
    sessions: report.sessions,
    turns_total: report.turns_total,
    current_failure_count: report.current_failure_count,
    candidate_attempted_count: report.candidate_attempted_count,
    candidate_not_attempted_count: report.candidate_not_attempted_count,
    candidate_failure_count: report.candidate_failure_count,
    candidate_surface_pattern_failure_count: report.candidate_surface_pattern_failure_count,
    candidate_semantic_failure_count: report.candidate_semantic_failure_count,
    semantic_fallback_count: report.semantic_fallback_count,
    confirmation_false_positive_count: report.confirmation_false_positive_count,
    candidate_worse_count: report.candidate_worse_count,
    domains_covered: report.domains_covered,
    review_out: REVIEW_OUT,
    mapping_out: MAPPING_OUT,
    out: OUT
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
