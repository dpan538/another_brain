#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { constructR29P0Oracle } from "../src/hybrid_runtime/r29p0_oracle.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).flatMap((value, index, all) =>
  value.startsWith("--") ? [[value, all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : true]] : []));
const SCOPE = String(args.get("--scope") || "batch1");
const REVIEWER = String(args.get("--reviewer") || "codex");
const ARTIFACT_ROOT = resolve(ROOT, String(args.get("--artifact-root") || "artifacts/r29p0_pairwise_oracle"));
const REVIEW_PATH = resolve(ROOT, String(args.get("--review-file") || join(ARTIFACT_ROOT, "reviews", `panel_a_${REVIEWER}_${SCOPE}_review.jsonl`)));
const REVIEWS_ROOT = join(ARTIFACT_ROOT, "reviews");
const REPORTS_ROOT = join(ARTIFACT_ROOT, "reports");
if (!["batch1", "full"].includes(SCOPE) || !["codex", "human"].includes(REVIEWER)) throw new Error("r29p0_invalid_panel_a_evaluation_mode");

function parseJsonl(value) { return value.split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line)); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

const prefix = `panel_a_${REVIEWER}_${SCOPE}`;
const packets = parseJsonl(await readFile(join(REVIEWS_ROOT, `${prefix}_blind_packet.jsonl`), "utf8"));
const maps = JSON.parse(await readFile(join(REVIEWS_ROOT, `${prefix}_private_map.json`), "utf8"));
const guards = JSON.parse(await readFile(join(REVIEWS_ROOT, `${prefix}_guard_results.json`), "utf8"));
const packetManifest = JSON.parse(await readFile(join(REVIEWS_ROOT, `${prefix}_manifest.json`), "utf8"));
const reviewText = await readFile(REVIEW_PATH, "utf8");
const reviews = parseJsonl(reviewText);
const records = JSON.parse(await readFile(join(ARTIFACT_ROOT, "raw/live_records.json"), "utf8"));
if (reviews.length !== packets.length || new Set(reviews.map((row) => row.case_id)).size !== packets.length) {
  throw new Error("r29p0_panel_a_review_count_mismatch");
}
if (REVIEWER === "human" && packets.length !== 60) throw new Error("r29p0_human_panel_a_requires_60");
const allowedTags = new Set(packets[0].semantic_difference_tags);
const oracleRows = [];
for (const packet of packets) {
  const review = reviews.find((row) => row.case_id === packet.case_id);
  const map = maps.find((row) => row.case_id === packet.case_id);
  const guard = guards.find((row) => row.case_id === packet.case_id);
  if (!review || !map || !guard || review.blind_id !== packet.blind_id) throw new Error(`r29p0_panel_a_binding_mismatch:${packet.case_id}`);
  if (!["EQUIVALENT", "INEQUIVALENT", "UNCERTAIN"].includes(review.equivalence)) throw new Error(`r29p0_invalid_equivalence:${packet.case_id}`);
  if (review.equivalence === "EQUIVALENT" && !["X", "Y", "TIE"].includes(review.preference)) throw new Error(`r29p0_missing_equivalent_preference:${packet.case_id}`);
  if (review.equivalence !== "EQUIVALENT" && review.preference !== null) throw new Error(`r29p0_preference_on_nonequivalent:${packet.case_id}`);
  if (!Array.isArray(review.difference_tags) || review.difference_tags.some((tag) => !allowedTags.has(tag))) throw new Error(`r29p0_invalid_difference_tag:${packet.case_id}`);
  const recordA = records.find((record) => record.case_id === packet.case_id && record.arm === "A" && record.phase.startsWith("batch"));
  const recordB = records.find((record) => record.case_id === packet.case_id && record.arm === "B" && record.phase.startsWith("batch"));
  const preference = review.preference === "TIE" || review.preference === null ? review.preference : map[review.preference];
  const oracle = constructR29P0Oracle(recordA.result.response, recordB.result.response, guard.passed, {
    equivalence: review.equivalence,
    preference,
  });
  if (![recordA.result.response, recordB.result.response].includes(oracle.output)) throw new Error("r29p0_oracle_rewrite_detected");
  oracleRows.push({
    case_id: packet.case_id,
    reviewer_class: packet.reviewer_class,
    guard_passed: guard.passed,
    exact_text_equal: guard.exact_text_equal,
    equivalence: review.equivalence,
    preference,
    difference_tags: review.difference_tags,
    oracle_selected: oracle.selected,
    oracle_reason: oracle.reason,
    oracle_output_sha256: sha256(oracle.output),
    canonical_a_sha256: recordA.result.response_sha256,
    candidate_b_sha256: recordB.result.response_sha256,
  });
}
const count = oracleRows.length;
const headroomCount = oracleRows.filter((row) => !row.exact_text_equal && row.guard_passed && row.equivalence === "EQUIVALENT").length;
const changeCount = oracleRows.filter((row) => row.oracle_selected === "B").length;
const exactDuplicateCount = oracleRows.filter((row) => row.exact_text_equal).length;
const guardFailureCount = oracleRows.filter((row) => !row.guard_passed).length;
const summary = {
  schema_version: "r29p0.panel_a_summary.v1",
  scope: SCOPE,
  reviewer_class: packets[0]?.reviewer_class,
  review_count: count,
  review_sha256: sha256(reviewText),
  blind_packet_sha256: packetManifest.blind_packet_sha256,
  equivalent_nonidentical_headroom_count: headroomCount,
  equivalent_nonidentical_headroom_rate: headroomCount / count,
  oracle_a_to_b_count: changeCount,
  oracle_a_to_b_rate: changeCount / count,
  exact_duplicate_count: exactDuplicateCount,
  exact_duplicate_rate: exactDuplicateCount / count,
  protected_guard_failure_count: guardFailureCount,
  protected_guard_failure_rate: guardFailureCount / count,
  futility_thresholds: SCOPE === "batch1" ? { headroom_minimum_rate: 0.25, a_to_b_minimum_rate: 0.15 } : null,
  futility_decision: SCOPE === "batch1" ? (headroomCount / count < 0.25 || changeCount / count < 0.15 ? "STOP" : "CONTINUE") : null,
  human_panel_a_completed: REVIEWER === "human" && count === 60,
  agent_review_is_human: false,
  ranker_training_authorized: false,
};
await mkdir(REPORTS_ROOT, { recursive: true, mode: 0o700 });
await atomicJson(join(REVIEWS_ROOT, `${prefix}_oracle.json`), oracleRows);
await atomicJson(join(REPORTS_ROOT, `${prefix}_summary.json`), summary);
console.log(JSON.stringify(summary));
