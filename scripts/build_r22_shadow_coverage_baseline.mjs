#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createDialogRuntime, answerDialogPrompt } from "./dialog_runtime.mjs";
import { ROOT } from "./r18_utils.mjs";
import {
  compactSemanticVerifier,
  controllerTraceOf,
  gitHead,
  jsonlRows,
  nowIso,
  R22_BASELINE_COMMIT,
  surfaceCandidateOf,
  updateR22State
} from "./r22_long_cycle_common.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r22_shadow_coverage_baseline.json");

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return fallback;
  }
}

async function readJsonl(path, fallback = []) {
  try {
    return jsonlRows(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return fallback;
  }
}

async function loadSessions() {
  const sessions = [];
  const anchor = await readJson("evals/r21_mixed_dialogic/gold_session.json", null);
  if (anchor) sessions.push({ source: "r21_anchor", id: anchor.id || "r21_anchor", turns: anchor.turns || [] });
  for (const row of await readJsonl("evals/r21_mixed_dialogic/blind_sibling_sessions.jsonl")) {
    sessions.push({ source: "r21_blind_sibling", id: row.id || "", turns: row.turns || [] });
  }
  for (const row of await readJsonl("evals/r21_mixed_dialogic/paraphrase_family.jsonl")) {
    sessions.push({
      source: "r21_paraphrase",
      id: row.id || "",
      turns: [{ user: row.prompt || row.user || "", turn_function: row.expected_turn_function || row.turn_function || "" }]
    });
  }
  for (const row of await readJsonl("evals/r22_natural_surface/non_question_turns.jsonl")) {
    sessions.push({ source: "r22_non_question", id: row.id || "", turns: [...(row.context || []), { user: row.user, turn_function: row.turn_function }] });
  }
  for (const row of await readJsonl("evals/r22_natural_surface/session_rhythm_cases.jsonl")) {
    sessions.push({ source: "r22_session_rhythm", id: row.id || "", turns: row.turns || [] });
  }
  const stress = await readJsonl("evals/r20_session_stress/sessions.jsonl");
  for (const row of stress.slice(0, 80)) {
    const turns = (row.turns || []).filter((turn) =>
      /analogy|compliment|affective|confirmation|reentry|deepening|evaluation|recommendation/.test(
        `${turn.turn_function || ""} ${turn.expected_turn_function || ""} ${turn.user || ""}`
      )
    );
    if (turns.length) sessions.push({ source: "r20_session_stress_low_risk", id: row.id || "", turns });
  }
  const canary = await readJson("artifacts/training_os/production_smoke_canary_report.json", null);
  for (const [index, row] of (canary?.local_outputs || []).entries()) {
    if (row.prompt) sessions.push({ source: "production_canary_prompt", id: `production_canary_${index + 1}`, turns: [{ user: row.prompt }] });
  }
  return sessions.filter((session) => (session.turns || []).some((turn) => turn.user));
}

function classifyCurrentSurfaceFailures(answer = "") {
  const failures = [];
  if (/你可以继续问|谢谢你的认可|我会继续努力|我接住/.test(answer)) failures.push("high_risk_surface_pattern");
  if (/这体现了|跨媒介关联|复杂关系|更深的问题是/.test(answer)) failures.push("descriptive_artificial_surface");
  return failures;
}

function inc(map, key) {
  map[key || "unknown"] = (map[key || "unknown"] || 0) + 1;
}

async function runSession(session) {
  const runtime = createDialogRuntime();
  const rows = [];
  for (const [index, turn] of (session.turns || []).entries()) {
    if (!turn.user) continue;
    const actual = await answerDialogPrompt(turn.user, runtime, { uiProfile: "mobile", withThinkingDelay: false });
    const trace = controllerTraceOf(actual);
    const candidate = surfaceCandidateOf(actual);
    const content = candidate.content_units_used || {};
    rows.push({
      source: session.source,
      session_id: session.id,
      turn_index: index + 1,
      domain: trace.active_topic?.domain || trace.domain || trace.answer_style || "",
      turn_function: trace.turn_function || turn.turn_function || turn.expected_turn_function || "",
      response_mode: trace.response_mode || "",
      surface_mode: trace.surface_mode || "",
      current_answer: actual.answer || actual.output || "",
      current_surface_failures: classifyCurrentSurfaceFailures(actual.answer || actual.output || ""),
      candidate_attempted: Boolean(candidate.candidate_answer && !candidate.fallback_to_current_reason && candidate.candidate_answer !== (actual.answer || actual.output || "")),
      candidate_fallback_reason: candidate.fallback_to_current_reason || "",
      candidate_answer: candidate.candidate_answer || "",
      semantic_verifier_result: compactSemanticVerifier(candidate.semantic_verifier || {}),
      primitives_available: Boolean(candidate.primitives_used?.length || trace.answer_plan?.primitive_ids?.length || trace.answer_plan?.relation_ids?.length),
      primitives_used: candidate.primitives_used || [],
      binding_confidence: trace.binding?.confidence ?? null,
      evidence_ids: candidate.evidence_ids || trace.answer_plan?.evidence_ids || [],
      active_referent: content.active_referent || trace.binding?.target_ids?.[0] || trace.active_topic?.id || "",
      safety_or_boundary_status: /boundary|privacy|copyright|medical|legal|financial|source|self_harm/.test(
        `${trace.response_type || ""} ${trace.response_mode || ""} ${trace.question_type || ""} ${trace.operation || ""}`
      )
    });
  }
  return rows;
}

function summarize(rows) {
  const domainTurnFunction = {};
  const turnFunctionFallbackReason = {};
  const sourceAttempted = {};
  const primitiveFallback = {};
  const semanticRejection = {};
  for (const row of rows) {
    inc(domainTurnFunction, `${row.domain || "unknown"}|${row.turn_function || "unknown"}`);
    inc(turnFunctionFallbackReason, `${row.turn_function || "unknown"}|${row.candidate_fallback_reason || (row.candidate_attempted ? "attempted" : "none")}`);
    inc(sourceAttempted, `${row.source}|${row.candidate_attempted ? "attempted" : row.candidate_fallback_reason ? "fallback" : "none"}`);
    inc(primitiveFallback, `${row.primitives_available ? "primitive_available" : "primitive_unavailable"}|${row.candidate_fallback_reason || "no_fallback"}`);
    const failures = row.semantic_verifier_result?.hard_failures || [];
    inc(semanticRejection, failures.length ? failures.join("+") : row.candidate_fallback_reason ? "preflight_or_no_candidate" : "no_rejection");
  }
  return {
    total_turns: rows.length,
    candidate_attempted: rows.filter((row) => row.candidate_attempted).length,
    candidate_fallback: rows.filter((row) => row.candidate_fallback_reason).length,
    current_surface_failure_count: rows.filter((row) => row.current_surface_failures.length).length,
    by_domain_turn_function: domainTurnFunction,
    by_turn_function_fallback_reason: turnFunctionFallbackReason,
    by_source_attempted_fallback: sourceAttempted,
    primitive_available_vs_fallback: primitiveFallback,
    semantic_preflight_vs_rejection: semanticRejection,
    anchor_vs_blind: {
      anchor_attempted: rows.filter((row) => row.source === "r21_anchor" && row.candidate_attempted).length,
      anchor_fallback: rows.filter((row) => row.source === "r21_anchor" && row.candidate_fallback_reason).length,
      blind_attempted: rows.filter((row) => row.source === "r21_blind_sibling" && row.candidate_attempted).length,
      blind_fallback: rows.filter((row) => row.source === "r21_blind_sibling" && row.candidate_fallback_reason).length
    }
  };
}

async function main() {
  await updateR22State({ current_phase: "phase0_shadow_coverage_baseline" });
  const sessions = await loadSessions();
  const rows = [];
  for (const session of sessions) rows.push(...(await runSession(session)));
  const report = {
    execution_ok: true,
    behavior_ok: true,
    audit_only: false,
    baseline_commit: R22_BASELINE_COMMIT,
    evaluated_commit: gitHead(),
    generated_at: nowIso(),
    sessions: sessions.length,
    rows,
    summary: summarize(rows)
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await updateR22State({
    current_phase: "phase0_shadow_coverage_baseline_done",
    completed_phases: ["phase0_shadow_coverage_baseline"],
    last_good_commit: gitHead()
  });
  console.log(JSON.stringify({ out: OUT, ...report.summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

