#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { semanticPreservationGuard } from "../src/hybrid_runtime/semantic_preservation_guard.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_ROOT = resolve(ROOT, process.argv[2] || "artifacts/r29b2m_r4h_r3");
const RAW = join(ARTIFACT_ROOT, "raw");
const REPORTS = join(ARTIFACT_ROOT, "reports");
const fixtures = (await readFile(join(ROOT, "evals/r29b2m_hybrid_critic_v1/cases.jsonl"), "utf8")).trim().split(/\r?\n/u).map((line) => JSON.parse(line));
const byId = new Map(fixtures.map((row) => [row.case_id, row]));
const chains = JSON.parse(await readFile(join(RAW, "two_stage_chains.json"), "utf8"));

async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

const changed = [];
const originalChains = [];
const replayChains = [];
for (const chain of chains) {
  const row = byId.get(chain.case_id);
  if (!row) throw new Error(`guard_replay_fixture_missing:${chain.case_id}`);
  const originalGuard = chain.semantic_guard_initial ?? chain.semantic_guard;
  const replayed = semanticPreservationGuard(chain.canonical_answer, chain.rewrite_candidate, row.semantic_guard_metadata);
  if (replayed.accepted !== originalGuard.accepted || replayed.final_answer !== originalGuard.final_answer) {
    changed.push({
      case_id: chain.case_id,
      initial_accepted: originalGuard.accepted,
      replayed_accepted: replayed.accepted,
      new_rejection_reasons: replayed.rejection_reasons,
      fallback_is_exact_canonical: !replayed.accepted && replayed.final_answer === chain.canonical_answer,
    });
  }
  const original = structuredClone(chain);
  original.semantic_guard = originalGuard;
  original.final_answer = originalGuard.final_answer;
  original.product_source_label = originalGuard.source_label;
  delete original.semantic_guard_initial;
  delete original.semantic_guard_replayed_after_live;
  delete original.semantic_guard_replay_added_live_requests;
  originalChains.push(original);
  replayChains.push({
    ...structuredClone(original),
    semantic_guard: replayed,
    final_answer: replayed.final_answer,
    product_source_label: replayed.source_label,
    semantic_guard_replayed_after_live: true,
    semantic_guard_replay_added_live_requests: 0,
  });
}
await atomicJson(join(RAW, "two_stage_chains.json"), originalChains);
await atomicJson(join(RAW, "two_stage_chains_guard_replay.json"), replayChains);

function packetsFor(sourceChains) {
  const blindPairs = [];
  const armMap = [];
  for (const chain of sourceChains) {
    const row = byId.get(chain.case_id);
    const controlFirst = createHash("sha256").update(`r3-two-stage-blind:${chain.case_id}`).digest("hex")[0] < "8";
    blindPairs.push({
      pair_id: chain.case_id,
      family: chain.family,
      messages: chain.messages,
      response_A: controlFirst ? chain.canonical_answer : chain.final_answer,
      response_B: controlFirst ? chain.final_answer : chain.canonical_answer,
      response_quality_rubric: row.response_quality_rubric,
      maximum_answer_characters: row.maximum_answer_characters,
    });
    armMap.push({
      pair_id: chain.case_id,
      response_A: controlFirst ? "canonical_control" : chain.product_source_label,
      response_B: controlFirst ? chain.product_source_label : "canonical_control",
    });
  }
  return { blindPairs, armMap };
}
const originalPackets = packetsFor(originalChains);
const replayPackets = packetsFor(replayChains);
await atomicJson(join(RAW, "two_stage_blind_pairs.json"), originalPackets.blindPairs);
await atomicJson(join(RAW, "two_stage_arm_map.json"), originalPackets.armMap);
await atomicJson(join(RAW, "two_stage_guard_replay_pairs_unreviewed.json"), replayPackets.blindPairs);

const originalAccepted = originalChains.filter((row) => row.semantic_guard.accepted).length;
const replayAccepted = replayChains.filter((row) => row.semantic_guard.accepted).length;
const completion = JSON.parse(await readFile(join(REPORTS, "two_stage_completion.json"), "utf8"));
completion.safe_rewrite_accept_count = originalAccepted;
completion.safe_rewrite_accept_rate = originalAccepted / originalChains.length;
completion.canonical_fallback_count = originalChains.length - originalAccepted;
completion.canonical_fallback_rate = (originalChains.length - originalAccepted) / originalChains.length;
delete completion.safe_rewrite_accept_count_initial;
delete completion.safe_rewrite_accept_rate_initial;
delete completion.canonical_fallback_count_initial;
delete completion.canonical_fallback_rate_initial;
delete completion.semantic_guard_replay_added_live_requests;
delete completion.semantic_guard_replay_changed_case_count;
await atomicJson(join(REPORTS, "two_stage_completion.json"), completion);
await atomicJson(join(REPORTS, "semantic_guard_replay.json"), {
  pass: true,
  mechanism: "general exact conditional-marker preservation",
  live_requests_added: 0,
  initial_guard_results_preserved: true,
  changed_case_count: changed.length,
  original_safe_rewrite_accept_count: originalAccepted,
  original_safe_rewrite_accept_rate: originalAccepted / originalChains.length,
  replay_safe_rewrite_accept_count: replayAccepted,
  replay_safe_rewrite_accept_rate: replayAccepted / replayChains.length,
  replay_canonical_fallback_rate: (replayChains.length - replayAccepted) / replayChains.length,
  replay_blind_review_performed: false,
  original_blind_review_modified: false,
  changed,
  regression_risk: "conservative over-rejection when equivalent conditional connectives are substituted",
  policy: "when uncertain reject and fall back to canonical",
});
console.log(JSON.stringify({ pass: true, live_requests_added: 0, changed_case_count: changed.length, accepted_before: originalAccepted, accepted_after: replayAccepted, original_blind_review_modified: false }));
