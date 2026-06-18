#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";
import { gitHead, nowIso, R22_BASELINE_COMMIT, updateR22State } from "./r22_long_cycle_common.mjs";

const IN = resolve(ROOT, "artifacts/training_os/r22_shadow_surface_eval_report.json");
const OUT = resolve(ROOT, "artifacts/training_os/r22_shadow_session_rhythm_report.json");

function skeleton(text = "") {
  return String(text || "")
    .replace(/[《“"][^》”"]+[》”"]/g, "《X》")
    .replace(/[A-Za-z0-9_.-]+/g, "X")
    .replace(/[\u4e00-\u9fff]{2,}/g, (chunk) => (chunk.length > 8 ? `${chunk.slice(0, 3)}…${chunk.slice(-2)}` : chunk))
    .replace(/\s+/g, " ")
    .trim();
}

function opener(text = "") {
  return String(text || "").trim().slice(0, 4);
}

function inc(map, key) {
  map[key || "unknown"] = (map[key || "unknown"] || 0) + 1;
}

function maxStreak(items, keyFn) {
  let max = 0;
  let current = 0;
  let previous = "";
  for (const item of items) {
    const key = keyFn(item);
    if (!key) {
      current = 0;
      previous = "";
      continue;
    }
    if (key === previous) current += 1;
    else current = 1;
    previous = key;
    max = Math.max(max, current);
  }
  return max;
}

function groupBySession(turns = []) {
  const sessions = new Map();
  for (const turn of turns) {
    const key = `${turn.source}:${turn.session_id}`;
    if (!sessions.has(key)) sessions.set(key, []);
    sessions.get(key).push(turn);
  }
  for (const rows of sessions.values()) rows.sort((a, b) => a.turn_index - b.turn_index);
  return sessions;
}

function rhythmFor(turns = []) {
  const skeletonCounts = {};
  const openerCounts = {};
  const clausePlanCounts = {};
  const fallbackStreaks = [];
  const clausePlanStreaks = [];
  const openerStreaks = [];
  const examples = [];

  for (const turn of turns) {
    const currentSkeleton = skeleton(turn.current_answer);
    inc(skeletonCounts, currentSkeleton);
    inc(openerCounts, opener(turn.current_answer));
    const clausePlan = turn.surface_candidate?.clause_plan?.skeleton_id || "";
    if (clausePlan) inc(clausePlanCounts, clausePlan);
  }

  for (const [sessionId, rows] of groupBySession(turns)) {
    fallbackStreaks.push({
      session_id: sessionId,
      max: maxStreak(rows, (turn) => (turn.candidate_is_fallback ? "fallback" : ""))
    });
    clausePlanStreaks.push({
      session_id: sessionId,
      max: maxStreak(rows, (turn) => turn.surface_candidate?.clause_plan?.skeleton_id || "")
    });
    openerStreaks.push({
      session_id: sessionId,
      max: maxStreak(rows, (turn) => opener(turn.shadow_candidate_answer || turn.current_answer))
    });
    const repeated = rows.filter((turn, index) => index > 0 && skeleton(turn.current_answer) === skeleton(rows[index - 1].current_answer));
    if (repeated.length) examples.push({ session_id: sessionId, repeated: repeated.slice(0, 3) });
  }

  const repeatedSkeletons = Object.entries(skeletonCounts)
    .filter(([key, count]) => key && count >= 3)
    .map(([surface_skeleton, count]) => ({ surface_skeleton, count }))
    .slice(0, 40);
  const repeatedOpeners = Object.entries(openerCounts)
    .filter(([key, count]) => key && count >= 6)
    .map(([answer_opener, count]) => ({ answer_opener, count }))
    .slice(0, 40);
  return {
    repeated_skeletons: repeatedSkeletons,
    repeated_openers: repeatedOpeners,
    clause_plan_counts: clausePlanCounts,
    fallback_streak_max: Math.max(0, ...fallbackStreaks.map((row) => row.max)),
    clause_plan_streak_max: Math.max(0, ...clausePlanStreaks.map((row) => row.max)),
    opener_streak_max: Math.max(0, ...openerStreaks.map((row) => row.max)),
    fallback_streak_examples: fallbackStreaks.filter((row) => row.max >= 4).slice(0, 20),
    clause_plan_streak_examples: clausePlanStreaks.filter((row) => row.max >= 2).slice(0, 20),
    repeated_transcript_examples: examples.slice(0, 20)
  };
}

async function main() {
  await updateR22State({ current_phase: "phase7_session_rhythm" });
  const input = JSON.parse(await readFile(IN, "utf8"));
  const turns = input.sampled_turns || [];
  const anchor = turns.filter((turn) => turn.source === "r21_anchor");
  const blind = turns.filter((turn) => turn.source === "r21_blind_sibling");
  const byDomain = {};
  const byTurnFunction = {};
  for (const turn of turns) {
    byDomain[turn.domain_hint] ||= [];
    byDomain[turn.domain_hint].push(turn);
    byTurnFunction[turn.turn_function || "unknown"] ||= [];
    byTurnFunction[turn.turn_function || "unknown"].push(turn);
  }
  const report = {
    execution_ok: true,
    behavior_ok: true,
    audit_only: false,
    baseline_commit: R22_BASELINE_COMMIT,
    evaluated_commit: gitHead(),
    generated_at: nowIso(),
    total_turns: turns.length,
    current_runtime: rhythmFor(turns),
    shadow_candidate: rhythmFor(turns.filter((turn) => turn.shadow_candidate_answer && turn.shadow_candidate_answer !== turn.current_answer)),
    anchor: rhythmFor(anchor),
    blind_siblings: rhythmFor(blind),
    by_domain: Object.fromEntries(Object.entries(byDomain).map(([domain, rows]) => [domain, rhythmFor(rows)])),
    by_turn_function: Object.fromEntries(Object.entries(byTurnFunction).map(([fn, rows]) => [fn, rhythmFor(rows)])),
    late_session_descriptive_drift_examples: turns
      .filter((turn) => turn.turn_index >= 12 && /这体现|本质|复杂关系|可以继续问|我接住/.test(turn.current_answer))
      .slice(0, 20),
    topic_reentry_failures: turns
      .filter((turn) => /reentry|回到/.test(`${turn.turn_function} ${turn.user}`) && turn.candidate_context_fit_failure)
      .slice(0, 20),
    unnecessary_fallback_streak: Math.max(0, ...rhythmFor(turns).fallback_streak_examples.map((row) => row.max || 0))
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await updateR22State({ current_phase: "phase7_session_rhythm_done" });
  console.log(JSON.stringify({
    behavior_ok: report.behavior_ok,
    total_turns: report.total_turns,
    current_repeated_skeletons: report.current_runtime.repeated_skeletons.length,
    shadow_clause_plan_streak_max: report.shadow_candidate.clause_plan_streak_max,
    fallback_streak_max: report.current_runtime.fallback_streak_max,
    out: OUT
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
