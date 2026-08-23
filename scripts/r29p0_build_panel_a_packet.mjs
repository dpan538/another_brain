#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPanelABlindRecord } from "../src/hybrid_runtime/r29p0_blinding.ts";
import { evaluateProtectedPair } from "../src/hybrid_runtime/protected_feature_signature.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).flatMap((value, index, all) =>
  value.startsWith("--") ? [[value, all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : true]] : []));
const SCOPE = String(args.get("--scope") || "batch1");
const REVIEWER = String(args.get("--reviewer") || "codex");
const ARTIFACT_ROOT = resolve(ROOT, String(args.get("--artifact-root") || "artifacts/r29p0_pairwise_oracle"));
const REVIEWS_ROOT = join(ARTIFACT_ROOT, "reviews");
if (!["batch1", "full"].includes(SCOPE) || !["codex", "human"].includes(REVIEWER)) throw new Error("r29p0_invalid_panel_a_packet_mode");

function parseJsonl(value) {
  return value.split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line));
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function atomicWrite(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, value, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

const cases = parseJsonl(await readFile(join(ROOT, "evals/r29p0_pairwise_oracle_v1/cases.jsonl"), "utf8"));
const caseById = new Map(cases.map((fixture) => [fixture.case_id, fixture]));
const manifest = JSON.parse(await readFile(join(ROOT, "evals/r29p0_pairwise_oracle_v1/manifest.json"), "utf8"));
const records = JSON.parse(await readFile(join(ARTIFACT_ROOT, "raw/live_records.json"), "utf8"));
const sourceLock = JSON.parse(await readFile(join(ARTIFACT_ROOT, "source_lock.json"), "utf8"));
const caseIds = SCOPE === "batch1" ? manifest.batches.batch_1 : manifest.case_ids;
const seedKey = REVIEWER === "human" ? `human_panel_a_${SCOPE}` : `codex_panel_a_${SCOPE}`;
const seed = manifest.review_seeds[seedKey];
if (!Array.isArray(caseIds) || (SCOPE === "batch1" ? caseIds.length !== 20 : caseIds.length !== 60) || !seed) {
  throw new Error("r29p0_panel_a_manifest_mismatch");
}
const reviewerClass = REVIEWER === "human" ? "human_owner_panel_a" : "codex_agent_provisional_panel_a_not_human";
const packets = [];
const privateMaps = [];
const guards = [];
for (const caseId of caseIds) {
  const fixture = caseById.get(caseId);
  const recordA = records.find((record) => record.case_id === caseId && record.arm === "A" && record.phase.startsWith("batch"));
  const recordB = records.find((record) => record.case_id === caseId && record.arm === "B" && record.phase.startsWith("batch"));
  if (!fixture || !recordA || !recordB) throw new Error(`r29p0_missing_panel_a_source:${caseId}`);
  if (recordA.source_lock_sha256 !== sourceLock.combined_sha256 || recordB.source_lock_sha256 !== sourceLock.combined_sha256) {
    throw new Error(`r29p0_panel_a_source_lock_mismatch:${caseId}`);
  }
  const sourceText = fixture.messages.map((message) => message.content).join("\n");
  const guard = evaluateProtectedPair(sourceText, recordA.result.response, recordB.result.response, fixture);
  const blinded = buildPanelABlindRecord(fixture, recordA.result.response, recordB.result.response, seed, reviewerClass);
  packets.push({
    blind_id: sha256(`${seed}:${caseId}`).slice(0, 20),
    ...blinded.packet,
    allowed_equivalence_decisions: ["EQUIVALENT", "INEQUIVALENT", "UNCERTAIN"],
    allowed_preference_decisions_if_equivalent: ["X", "Y", "TIE"],
    semantic_difference_tags: [
      "number_difference", "date_time_difference", "entity_difference", "negation_difference",
      "condition_modality_difference", "privacy_refusal_difference", "logic_conclusion_difference",
      "user_constraint_difference", "other_semantic_difference",
    ],
  });
  privateMaps.push({ case_id: caseId, blind_id: packets.at(-1).blind_id, ...blinded.private_map });
  guards.push({
    case_id: caseId,
    exact_text_equal: recordA.result.response === recordB.result.response,
    passed: guard.passed,
    mismatch_fields: guard.mismatch_fields,
    candidate_a_sha256: recordA.result.response_sha256,
    candidate_b_sha256: recordB.result.response_sha256,
  });
}
await mkdir(REVIEWS_ROOT, { recursive: true, mode: 0o700 });
const stem = `panel_a_${REVIEWER}_${SCOPE}`;
const packetText = `${packets.map((row) => JSON.stringify(row)).join("\n")}\n`;
await atomicWrite(join(REVIEWS_ROOT, `${stem}_blind_packet.jsonl`), packetText);
await atomicWrite(join(REVIEWS_ROOT, `${stem}_private_map.json`), `${JSON.stringify(privateMaps, null, 2)}\n`);
await atomicWrite(join(REVIEWS_ROOT, `${stem}_guard_results.json`), `${JSON.stringify(guards, null, 2)}\n`);
await atomicWrite(join(REVIEWS_ROOT, `${stem}_manifest.json`), `${JSON.stringify({
  schema_version: "r29p0.panel_a_blind_manifest.v1",
  campaign_id: manifest.campaign_id,
  scope: SCOPE,
  reviewer_class: reviewerClass,
  case_count: packets.length,
  source_lock_sha256: sourceLock.combined_sha256,
  blind_packet_sha256: sha256(packetText),
  private_map_sha256: sha256(JSON.stringify(privateMaps)),
  original_identity_visible_in_packet: false,
  canonical_identity_visible_in_packet: false,
  deterministic_output_visible_in_packet: false,
  raw_api_metadata_visible_in_packet: false,
}, null, 2)}\n`);
console.log(JSON.stringify({ scope: SCOPE, reviewer_class: reviewerClass, cases: packets.length, blind_packet_sha256: sha256(packetText) }));
