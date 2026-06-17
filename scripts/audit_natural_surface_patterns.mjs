#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";
import {
  NON_QUESTION_TURN_FUNCTIONS,
  classifySurfaceHits,
  flattenStrings,
  isBadExamplePath,
  isCandidateAnswerPath,
  listFiles,
  makeExecutionReport,
  parseMaybeJsonLines,
  pathHint,
  provenanceForString,
  relativeRoot,
  responseModeFromObject,
  turnFunctionFromObject,
  zhChars
} from "./r22_surface_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r22_natural_surface_pattern_audit.json");
const SCAN_DIRS = ["artifacts/training_os", "evals", "docs"];

function skeleton(text) {
  return String(text || "")
    .replace(/[《“"][^》”"]+[》”"]/g, "《X》")
    .replace(/[A-Za-z0-9_.-]+/g, "X")
    .replace(/[\u4e00-\u9fff]{2,}/g, (chunk) => (chunk.length > 12 ? `${chunk.slice(0, 4)}…${chunk.slice(-4)}` : chunk))
    .replace(/\s+/g, " ")
    .trim();
}

function hardFailureFor({ turnFunction, responseMode, answer, hits }) {
  const ids = new Set(hits.map((hit) => hit.id));
  if (NON_QUESTION_TURN_FUNCTIONS.has(turnFunction) && ids.has("you_can_continue_ask")) return "active_non_question_escape";
  if (turnFunction === "compliment" && (ids.has("generic_thanks") || ids.has("continue_effort") || ids.has("i_caught_it"))) return "compliment_artificial_acknowledgement";
  if (turnFunction === "analogy_statement" && zhChars(answer) > 90 && /(这体现了|这是一种|跨媒介|关联|本质上)/.test(answer)) return "announced_bridge_on_analogy";
  if (["quiet_affordance", "help_how_to_ask", "bounded_unknown"].includes(responseMode) && NON_QUESTION_TURN_FUNCTIONS.has(turnFunction)) return "non_question_misrouted_surface";
  return "";
}

async function scanJsonFile(file) {
  const rows = parseMaybeJsonLines(await readFile(file, "utf8"), file);
  const examples = [];
  for (const [rowIndex, row] of rows.entries()) {
    const strings = flattenStrings(row);
    for (const item of strings) {
      const provenance = provenanceForString({ file, path: item.path });
      if (!isCandidateAnswerPath(item.path) && !["fixture_bad_answer", "fixture_better_shape", "documentation_or_contract"].includes(provenance)) continue;
      if (isBadExamplePath(item.path) && provenance !== "fixture_bad_answer") continue;
      const hits = classifySurfaceHits(item.text);
      if (!hits.length) continue;
      const turnFunction = turnFunctionFromObject(row);
      const responseMode = responseModeFromObject(row);
      examples.push({
        file: relativeRoot(file),
        row_index: rowIndex,
        path: pathHint(item.path),
        provenance,
        turn_function: turnFunction,
        response_mode: responseMode,
        text: item.text,
        hits,
        hard_failure: hardFailureFor({ turnFunction, responseMode, answer: item.text, hits })
      });
    }
  }
  return examples;
}

async function main() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    files.push(...(await listFiles(dir, (path) => [".json", ".jsonl"].includes(extname(path)))));
  }
  const allExamples = [];
  for (const file of files) {
    try {
      allExamples.push(...(await scanJsonFile(file)));
    } catch {
      // Some historical artifact JSON may be partial or tool-specific. Skip it;
      // this audit is for current visible answer surfaces, not archive repair.
    }
  }

  const patternCounts = {};
  const patternCountsByProvenance = {};
  const patternByTurnFunction = {};
  const skeletonCounts = {};
  const skeletonCountsByProvenance = {};
  for (const example of allExamples) {
    const fn = example.turn_function || "unknown";
    const provenance = example.provenance || "unknown";
    patternByTurnFunction[fn] ||= {};
    patternCountsByProvenance[provenance] ||= {};
    skeletonCountsByProvenance[provenance] ||= {};
    const skel = skeleton(example.text);
    skeletonCounts[skel] = (skeletonCounts[skel] || 0) + 1;
    skeletonCountsByProvenance[provenance][skel] = (skeletonCountsByProvenance[provenance][skel] || 0) + 1;
    for (const hit of example.hits) {
      patternCounts[hit.id] = (patternCounts[hit.id] || 0) + hit.matches.length;
      patternCountsByProvenance[provenance][hit.id] = (patternCountsByProvenance[provenance][hit.id] || 0) + hit.matches.length;
      patternByTurnFunction[fn][hit.id] = (patternByTurnFunction[fn][hit.id] || 0) + hit.matches.length;
    }
  }

  const behavioralProvenance = new Set(["current_runtime_output", "shadow_candidate_output"]);
  const hardFailures = allExamples.filter((example) => example.hard_failure && behavioralProvenance.has(example.provenance));
  const allHardFailures = allExamples.filter((example) => example.hard_failure);
  const liveHardPatternIds = new Set(["i_caught_it", "generic_thanks", "continue_effort", "you_can_continue_ask", "praise_thanks_skeleton"]);
  const liveHardPatternCount = Object.entries(patternCountsByProvenance.current_runtime_output || {})
    .filter(([id]) => liveHardPatternIds.has(id))
    .reduce((sum, [, count]) => sum + count, 0);
  const repeatedSurfaceSkeletons = Object.entries(skeletonCounts)
    .filter(([, count]) => count >= 3)
    .map(([surface_skeleton, count]) => ({ surface_skeleton, count }))
    .slice(0, 40);

  const report = makeExecutionReport({
    behaviorOk: hardFailures.length === 0 && liveHardPatternCount === 0,
    auditOnly: !process.argv.includes("--strict"),
    blocking: process.argv.includes("--strict") && hardFailures.length > 0,
    extra: {
    scanned_files: files.length,
    scanned_examples: allExamples.length,
    pattern_counts: patternCounts,
    pattern_counts_by_provenance: patternCountsByProvenance,
    live_runtime_pattern_counts: patternCountsByProvenance.current_runtime_output || {},
    shadow_candidate_pattern_counts: patternCountsByProvenance.shadow_candidate_output || {},
    fixture_pattern_counts: {
      fixture_better_shape: patternCountsByProvenance.fixture_better_shape || {},
      fixture_bad_answer: patternCountsByProvenance.fixture_bad_answer || {},
      eval_expected_answer: patternCountsByProvenance.eval_expected_answer || {}
    },
    historical_pattern_counts: patternCountsByProvenance.historical_artifact || {},
    pattern_by_turn_function: patternByTurnFunction,
    repeated_surface_skeletons: repeatedSurfaceSkeletons,
    repeated_surface_skeletons_by_provenance: Object.fromEntries(
      Object.entries(skeletonCountsByProvenance).map(([provenance, counts]) => [
        provenance,
        Object.entries(counts)
          .filter(([, count]) => count >= 3)
          .map(([surface_skeleton, count]) => ({ surface_skeleton, count }))
          .slice(0, 40)
      ])
    ),
    suspicious_must_include_leakage: allExamples.filter((example) => /我接住|更深层次|关系/.test(example.text)).slice(0, 80),
    hard_failures: hardFailures.slice(0, 80),
    live_hard_pattern_count: liveHardPatternCount,
    all_provenance_hard_failures: allHardFailures.slice(0, 80),
    examples: allExamples.slice(0, 120)
    }
  });

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    execution_ok: report.execution_ok,
    behavior_ok: report.behavior_ok,
    audit_only: report.audit_only,
    live_runtime_pattern_counts: report.live_runtime_pattern_counts,
    shadow_candidate_pattern_counts: report.shadow_candidate_pattern_counts,
    fixture_pattern_counts: report.fixture_pattern_counts,
    hard_failure_count: hardFailures.length,
    live_hard_pattern_count: report.live_hard_pattern_count,
    out: OUT
  }, null, 2));
  if (!report.behavior_ok && process.argv.includes("--strict")) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
