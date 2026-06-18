#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createDialogRuntime, answerDialogPrompt } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";
import { classifySurfaceHits, zhChars } from "./r22_surface_utils.mjs";
import { gitHead, jsonlRows, nowIso, R22_BASELINE_COMMIT, updateR22State } from "./r22_long_cycle_common.mjs";

const IN = resolve(ROOT, "artifacts/training_os/r22_postfreeze_holdout.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/r22_postfreeze_holdout_report.json");

function candidateOf(turn = {}) {
  return turn.trace?.conversation_controller?.surface_candidate || {};
}

function riskyHits(text = "") {
  return classifySurfaceHits(text).filter((hit) =>
    ["you_can_continue_ask", "generic_thanks", "continue_effort", "i_caught_it", "announced_bridge_skeleton"].includes(hit.id)
  );
}

function classifyTurn({ answer, candidate }) {
  const currentHits = riskyHits(answer);
  const candidateText = String(candidate.candidate_answer || "").trim();
  const fallbackReason = candidate.fallback_to_current_reason || "";
  const attempted = Boolean(candidateText && !fallbackReason && candidateText !== answer);
  const semantic = candidate.semantic_verifier || {};
  const candidateHits = attempted ? riskyHits(candidateText) : [];
  const semanticFailure = attempted && semantic.semantic_preservation_ok === false;
  const tooShort = attempted && zhChars(candidateText) > 0 && zhChars(candidateText) < 8;
  return {
    attempted,
    fallback_reason: fallbackReason,
    semantic_fallback: fallbackReason === "candidate_failed_semantic_verifier",
    current_failure: currentHits.length > 0,
    candidate_failure: attempted && (candidateHits.length > 0 || semanticFailure || tooShort),
    semantic_failure: semanticFailure,
    current_hits: currentHits,
    candidate_hits: candidateHits,
    semantic_hard_failures: semantic.hard_failures || []
  };
}

async function runSession(session) {
  const runtime = createDialogRuntime();
  const rows = [];
  const context = [];
  for (const [index, turn] of (session.turns || []).entries()) {
    const actual = await answerDialogPrompt(turn.user, runtime, { uiProfile: "mobile", withThinkingDelay: false });
    const answer = String(actual.answer || actual.output || "").trim();
    const trace = actual.trace?.conversation_controller || {};
    const candidate = candidateOf(actual);
    const outcome = classifyTurn({ answer, candidate });
    rows.push({
      source: "r22_postfreeze_holdout",
      session_id: session.id,
      turn_index: index + 1,
      user: turn.user,
      expected: turn.expected || turn.expected_turn_function || "",
      context_turns: context.slice(-4),
      response_mode: trace.response_mode || "",
      turn_function: trace.turn_function || "",
      domain: trace.active_topic?.domain || trace.domain || "",
      current_answer: answer,
      shadow_candidate_answer: candidate.candidate_answer || "",
      surface_candidate: candidate,
      ...outcome
    });
    context.push({ user: turn.user, assistant: answer });
  }
  return rows;
}

async function main() {
  await updateR22State({ current_phase: "phase8_eval_postfreeze_holdout" });
  const sessions = jsonlRows(await readFile(IN, "utf8"));
  const rows = [];
  for (const session of sessions) rows.push(...(await runSession(session)));
  const currentFailures = rows.filter((row) => row.current_failure);
  const candidateFailures = rows.filter((row) => row.candidate_failure);
  const semanticFailures = rows.filter((row) => row.semantic_failure);
  const inappropriateFallbacks = rows.filter((row) =>
    ["no_confident_candidate"].includes(row.fallback_reason) &&
    /analogy_statement|affective_disclosure|compliment|deepening_invitation|topic_reentry/.test(`${row.expected} ${row.turn_function}`)
  );
  const report = {
    execution_ok: true,
    behavior_ok: candidateFailures.length === 0,
    audit_only: false,
    baseline_commit: R22_BASELINE_COMMIT,
    evaluated_commit: gitHead(),
    generated_at: nowIso(),
    sessions: sessions.length,
    turns: rows.length,
    holdout_current_failures: currentFailures.length,
    holdout_candidate_failures: candidateFailures.length,
    semantic_failures: semanticFailures.length,
    inappropriate_fallbacks: inappropriateFallbacks.length,
    anchor_vs_holdout_delta: "requires_comparison_with_r21_anchor_report",
    sibling_vs_holdout_delta: "requires_comparison_with_r21_blind_report",
    candidate_attempted: rows.filter((row) => row.attempted).length,
    candidate_fallback: rows.filter((row) => row.fallback_reason).length,
    semantic_fallback: rows.filter((row) => row.semantic_fallback).length,
    rows,
    failures: candidateFailures.slice(0, 40),
    inappropriate_fallback_examples: inappropriateFallbacks.slice(0, 40)
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await updateR22State({
    current_phase: "phase8_eval_postfreeze_holdout_done",
    pending_failures: report.behavior_ok ? [] : [{ phase: "phase8_postfreeze_holdout", count: candidateFailures.length }]
  });
  console.log(JSON.stringify({
    behavior_ok: report.behavior_ok,
    sessions: report.sessions,
    turns: report.turns,
    candidate_attempted: report.candidate_attempted,
    candidate_fallback: report.candidate_fallback,
    candidate_failures: report.holdout_candidate_failures,
    inappropriate_fallbacks: report.inappropriate_fallbacks,
    out: OUT
  }, null, 2));
  if (!report.behavior_ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
