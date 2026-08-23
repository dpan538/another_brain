#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPanelBBlindRecord } from "../src/hybrid_runtime/r29p0_blinding.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).flatMap((value, index, all) =>
  value.startsWith("--") ? [[value, all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : true]] : []));
const REVIEWER = String(args.get("--reviewer") || "codex");
const ARTIFACT_ROOT = resolve(ROOT, String(args.get("--artifact-root") || "artifacts/r29p0_pairwise_oracle"));
const REVIEWS_ROOT = join(ARTIFACT_ROOT, "reviews");
if (!["codex", "human"].includes(REVIEWER)) throw new Error("r29p0_invalid_panel_b_reviewer");

function parseJsonl(value) { return value.split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line)); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function atomicWrite(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, value, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

const casesText = await readFile(join(ROOT, "evals/r29p0_pairwise_oracle_v1/cases.jsonl"), "utf8");
const cases = parseJsonl(casesText);
const manifest = JSON.parse(await readFile(join(ROOT, "evals/r29p0_pairwise_oracle_v1/manifest.json"), "utf8"));
const records = JSON.parse(await readFile(join(ARTIFACT_ROOT, "raw/live_records.json"), "utf8"));
const oraclePath = join(REVIEWS_ROOT, `panel_a_${REVIEWER}_full_oracle.json`);
const oracleRows = JSON.parse(await readFile(oraclePath, "utf8"));
if (cases.length !== 60 || oracleRows.length !== 60) throw new Error("r29p0_panel_b_source_count_mismatch");
const reviewerClass = REVIEWER === "human" ? "human_owner_panel_b" : "codex_agent_provisional_panel_b_not_human";
const seed = manifest.review_seeds[`${REVIEWER}_panel_b_full`];
if (!seed) throw new Error("r29p0_panel_b_seed_missing");
const packets = [];
const maps = [];
for (const fixture of cases) {
  const oracleRow = oracleRows.find((row) => row.case_id === fixture.case_id);
  const recordA = records.find((record) => record.case_id === fixture.case_id && record.arm === "A" && record.phase.startsWith("batch"));
  const recordB = records.find((record) => record.case_id === fixture.case_id && record.arm === "B" && record.phase.startsWith("batch"));
  const deterministic = records.find((record) => record.case_id === fixture.case_id && record.arm === "DETERMINISTIC" && record.phase.startsWith("batch"));
  if (!oracleRow || !recordA || !recordB || !deterministic) throw new Error(`r29p0_panel_b_source_missing:${fixture.case_id}`);
  const oracle = oracleRow.oracle_selected === "B" ? recordB.result.response : recordA.result.response;
  for (const [kind, comparator] of [["canonical", recordA.result.response], ["deterministic", deterministic.result.response]]) {
    const blinded = buildPanelBBlindRecord(fixture, oracle, comparator, kind, seed, reviewerClass);
    const blindId = sha256(`${seed}:${fixture.case_id}:${kind}`).slice(0, 20);
    packets.push({
      blind_id: blindId,
      ...blinded.packet,
      dimensions: {
        relevance: [0, 2], factual_restraint: [0, 2], natural_voice: [0, 2], brand_fit: [0, 3],
        brevity_completeness: [0, 2], logic_clarity: [0, 2], non_customer_service: [0, 1], total: [0, 16],
      },
      allowed_preference: ["LEFT", "RIGHT", "TIE"],
      flags: ["unsupported_fact", "missing_condition", "changed_conclusion", "over_explained", "too_formal", "customer_service_tone", "cold_textbook_tone", "unnecessary_disclaimer"],
    });
    maps.push({ comparison_id: blinded.packet.comparison_id, blind_id: blindId, comparator_kind: kind, ...blinded.private_map });
  }
}
await mkdir(REVIEWS_ROOT, { recursive: true, mode: 0o700 });
const packetText = `${packets.map((row) => JSON.stringify(row)).join("\n")}\n`;
const stem = `panel_b_${REVIEWER}`;
await atomicWrite(join(REVIEWS_ROOT, `${stem}_blind_packet.jsonl`), packetText);
await atomicWrite(join(REVIEWS_ROOT, `${stem}_private_map.json`), `${JSON.stringify(maps, null, 2)}\n`);
await atomicWrite(join(REVIEWS_ROOT, `${stem}_manifest.json`), `${JSON.stringify({
  schema_version: "r29p0.panel_b_blind_manifest.v1",
  campaign_id: manifest.campaign_id,
  reviewer_class: reviewerClass,
  case_count: 60,
  comparison_count: packets.length,
  blind_packet_sha256: sha256(packetText),
  oracle_source_sha256: sha256(await readFile(oraclePath)),
  panel_a_judgments_visible: false,
  oracle_reason_visible: false,
  canonical_identity_visible: false,
  experiment_hypothesis_visible: false,
}, null, 2)}\n`);
// Stable alias consumed by the owner-review pack only after human Panel A validation.
if (REVIEWER === "human") await atomicWrite(join(REVIEWS_ROOT, "panel_b_human_blind_packet.jsonl"), packetText);
console.log(JSON.stringify({ reviewer_class: reviewerClass, cases: 60, comparisons: packets.length, blind_packet_sha256: sha256(packetText) }));
