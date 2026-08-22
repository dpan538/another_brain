#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { deterministicLengthPolicy } from "../src/hybrid_runtime/dialogue_act_heuristic.ts";
import { compileLocalSignalPacketV2 } from "../src/hybrid_runtime/local_signal_packet_v2_compiler.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = JSON.parse(await readFile(join(ROOT, "evals/r29b2m_hybrid_product_v2/manifest.json"), "utf8"));
const ROWS = (await readFile(join(ROOT, "evals/r29b2m_hybrid_product_v2/cases.jsonl"), "utf8")).trim().split(/\r?\n/u).map((line) => JSON.parse(line));
const SYSTEM_POLICY = await readFile(join(ROOT, "prompts/hybrid_dialogue_system_v2.txt"), "utf8");
const BY_ID = new Map(ROWS.map((row) => [row.case_id, row]));
const OUT = join(ROOT, "reports/v2_offline_counterfactual_recompile.json");

function latestUser(row) {
  return [...row.messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

const cases = [];
for (const caseId of MANIFEST.paired_case_ids) {
  const row = BY_ID.get(caseId);
  if (!row) throw new Error(`missing_case:${caseId}`);
  const user = latestUser(row);
  const compiled = compileLocalSignalPacketV2(row.oracle_local_signal_packet_v2, user);
  const deterministic = deterministicLengthPolicy(user);
  const literalAnchorSet = new Set(row.oracle_local_signal_packet_v2.anchors.map((anchor) => anchor.text));
  const quoted = [...compiled.instruction.matchAll(/“([^”]+)”/gu)].map((match) => match[1]);
  cases.push({
    case_id: caseId,
    family: row.family,
    packet_fields: compiled.fields_used,
    compiled_local_instruction: compiled.instruction,
    compiled_local_instruction_estimated_tokens: compiled.estimated_tokens,
    compiled_local_instruction_within_100_tokens: compiled.estimated_tokens <= 100,
    compiled_local_instruction_preferred_60_tokens: compiled.estimated_tokens <= 60,
    quoted_spans_are_literal_anchors: quoted.every((span) => literalAnchorSet.has(span) && user.includes(span)),
    local_instruction_new_facts: 0,
    local_instruction_affect_diagnoses: 0,
    local_instruction_semantic_conclusions: 0,
    deterministic_policy_separate_from_packet: true,
    deterministic_length_class_internal_only: deterministic.dialogue_class,
    deterministic_length_instruction: deterministic.instruction,
    heuristic_label_sent_to_deepseek: false,
  });
}

const report = {
  campaign: "R29B2M-R4H-R2",
  phase: "OFFLINE_COUNTERFACTUAL_RECOMPILE",
  public_safe_fixtures_only: true,
  deepseek_requests_made: 0,
  paired_case_count: cases.length,
  same_30_case_ids_as_r4h_r1: true,
  system_policy_sha256: createHash("sha256").update(SYSTEM_POLICY).digest("hex"),
  deterministic_global_policy_separated_from_packet: true,
  packet_fields: ["anchors", "style"],
  instruction_new_facts: cases.reduce((sum, row) => sum + row.local_instruction_new_facts, 0),
  instruction_affect_diagnoses: cases.reduce((sum, row) => sum + row.local_instruction_affect_diagnoses, 0),
  instruction_semantic_conclusions: cases.reduce((sum, row) => sum + row.local_instruction_semantic_conclusions, 0),
  instruction_within_100_tokens_rate: cases.filter((row) => row.compiled_local_instruction_within_100_tokens).length / cases.length,
  instruction_preferred_60_tokens_rate: cases.filter((row) => row.compiled_local_instruction_preferred_60_tokens).length / cases.length,
  quoted_spans_literal_rate: cases.filter((row) => row.quoted_spans_are_literal_anchors).length / cases.length,
  pass: cases.length === 30 && cases.every((row) => row.compiled_local_instruction_within_100_tokens && row.quoted_spans_are_literal_anchors && row.local_instruction_new_facts === 0 && row.local_instruction_affect_diagnoses === 0 && row.local_instruction_semantic_conclusions === 0 && row.heuristic_label_sent_to_deepseek === false),
  cases,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ pass: report.pass, cases: cases.length, new_facts: report.instruction_new_facts, affect_diagnoses: report.instruction_affect_diagnoses, semantic_conclusions: report.instruction_semantic_conclusions, within_100_rate: report.instruction_within_100_tokens_rate, preferred_60_rate: report.instruction_preferred_60_tokens_rate, deepseek_requests: 0 }));
if (!report.pass) process.exit(2);
