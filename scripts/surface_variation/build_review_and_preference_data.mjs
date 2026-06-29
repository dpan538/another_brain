#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

import { ROOT } from "../r18_utils.mjs";

const BROWSER_PATH = resolve(ROOT, "artifacts/surface_variation/browser_variation_transcripts.json");
const RUNTIME_PATH = resolve(ROOT, "artifacts/surface_variation/variation_matrix_report.json");
const REVIEW_OUT = resolve(ROOT, "artifacts/surface_variation/human_review_packet.json");
const PRIVATE_OUT = resolve(ROOT, "artifacts/surface_variation/human_review_mapping_private.json");
const SCHEMA_OUT = resolve(ROOT, "artifacts/surface_variation/preference_pair_schema.json");
const PAIRS_OUT = resolve(ROOT, "artifacts/surface_variation/preference_candidate_pairs.jsonl");
const READINESS_INPUT_OUT = resolve(ROOT, "artifacts/surface_variation/preference_data_inventory.json");
const REVIEW_DOC = resolve(ROOT, "docs/surface_variation_review_instructions.md");
const MAX_REVIEW_ITEMS = 80;
const MAX_PAIR_ITEMS = 240;

function stableHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function uniqueByText(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const text = String(item?.answer || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ ...item, answer: text });
  }
  return out;
}

function seededShuffle(items, seedText) {
  return [...items]
    .map((item, index) => ({
      item,
      key: stableHash(`${seedText}:${index}:${item.answer}`)
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => entry.item);
}

function compactSemanticPlan(row = {}, runtimeRow = {}) {
  const firstTurn = runtimeRow.same_session_repetitions?.[0] || runtimeRow.separate_sessions?.[0] || {};
  const variation = firstTurn.variation || {};
  return {
    semantic_signature: variation.semantic_signature || stableHash(`${row.prompt}:${row.group}:${row.bucket}`).slice(0, 16),
    response_act: row.expected_operation || runtimeRow.expected_operation || "",
    entity_ids: runtimeRow.expected_entity_ids || [],
    active_referent: runtimeRow.expected_entity_ids?.[0] || null,
    active_domain: row.bucket || runtimeRow.bucket || "",
    requested_operation: row.expected_operation || runtimeRow.expected_operation || "",
    mandatory_units: ["entity_or_topic", "requested_operation"],
    optional_units: ["focus_unit", "example_or_work", "clause_order", "density"],
    alternative_focus_groups: [...new Set((runtimeRow.same_session_repetitions || []).map((turn) => turn.variation?.chosen_focus_id).filter(Boolean))],
    evidence_ids: firstTurn.variation?.evidence_ids || [],
    language: "zh",
    answer_density: "compact"
  };
}

function findRuntimeRow(runtime, row) {
  return runtime.results.find((candidate) => candidate.prompt === row.prompt && candidate.group === row.group && (candidate.bucket || "") === (row.bucket || "")) || {};
}

function reviewInstructions() {
  return `# Surface Variation Review Instructions

This packet is for human review of Chinese-first controlled response variation.

The review items are blind: Answer A/B/C are not labeled as current, previous, or preferred outputs. Automated diagnostics did not choose a winner.

For each item, judge:

- factual consistency
- semantic preservation
- correct entity or referent
- operation satisfaction
- naturalness
- useful difference
- not merely synonym substitution
- specificity
- template feel
- too repetitive
- too different or inconsistent
- preferred answer
- all acceptable, some acceptable, or none acceptable

Do not treat diversity as sufficient. A varied answer that changes the entity, fact, uncertainty, boundary, or operation should be rejected.

User review status: pending.
Hidden review status: not_run.
`;
}

async function main() {
  const browser = JSON.parse(await readFile(BROWSER_PATH, "utf8"));
  const runtime = JSON.parse(await readFile(RUNTIME_PATH, "utf8"));
  const generatedAt = new Date().toISOString();
  const runtimeRowsByPrompt = new Map(runtime.results.map((row) => [`${row.prompt}\u0000${row.group}\u0000${row.bucket || ""}`, row]));

  const reviewItems = [];
  const privateMappings = [];
  const pairRows = [];

  for (const [index, row] of browser.results.entries()) {
    if (row.hard_failures?.length) continue;
    const runtimeRow = runtimeRowsByPrompt.get(`${row.prompt}\u0000${row.group}\u0000${row.bucket || ""}`) || findRuntimeRow(runtime, row);
    const allAnswers = uniqueByText([
      ...(row.same_session_repetitions || []).map((item, turnIndex) => ({ ...item, source: "same_session", turnIndex })),
      ...(row.separate_sessions || []).map((item, turnIndex) => ({ ...item, source: "separate_session", turnIndex }))
    ]);
    if (allAnswers.length < 2) continue;

    const shuffled = seededShuffle(allAnswers, `${browser.matrix_seed}:${index}:${row.prompt}`);
    const semanticPlan = compactSemanticPlan(row, runtimeRow);

    if (reviewItems.length < MAX_REVIEW_ITEMS && shuffled.length >= 3) {
      const selected = shuffled.slice(0, 3);
      const reviewId = `sv_review_${String(reviewItems.length + 1).padStart(4, "0")}`;
      reviewItems.push({
        review_id: reviewId,
        context: `${row.group || "diagnostic"}${row.bucket ? ` / ${row.bucket}` : ""}`,
        user_turn: row.prompt,
        answer_a: selected[0].answer,
        answer_b: selected[1].answer,
        answer_c: selected[2].answer,
        review_dimensions: {
          factual_consistency: null,
          semantic_preservation: null,
          correct_entity_referent: null,
          operation_satisfaction: null,
          naturalness: null,
          useful_difference: null,
          not_merely_synonym_substitution: null,
          specificity: null,
          template_feel: null,
          too_repetitive: null,
          too_different_or_inconsistent: null,
          preferred_answer: null,
          acceptability: null
        }
      });
      privateMappings.push({
        review_id: reviewId,
        prompt_index: index,
        prompt: row.prompt,
        source_group: row.group || "",
        source_bucket: row.bucket || "",
        semantic_plan: semanticPlan,
        answer_sources: selected.map((answer, answerIndex) => ({
          blind_label: ["A", "B", "C"][answerIndex],
          source: answer.source,
          turn_index: answer.turnIndex,
          skeleton: answer.skeleton || "",
          answer_hash: stableHash(answer.answer)
        })),
        automated_diagnostic_status: {
          hard_failures: row.hard_failures || [],
          browser_summary_used: true,
          human_preference: null
        }
      });
    }

    const pairLimit = Math.min(shuffled.length, 4);
    for (let a = 0; a < pairLimit; a += 1) {
      for (let b = a + 1; b < pairLimit; b += 1) {
        if (pairRows.length >= MAX_PAIR_ITEMS) break;
        pairRows.push({
          pair_id: `sv_pair_${String(pairRows.length + 1).padStart(5, "0")}`,
          context: {
            group: row.group || "",
            bucket: row.bucket || "",
            source: "public_diagnostic_surface_variation"
          },
          user_turn: row.prompt,
          semantic_plan: semanticPlan,
          candidate_a: shuffled[a].answer,
          candidate_b: shuffled[b].answer,
          evidence_ids: semanticPlan.evidence_ids,
          factual_validity: null,
          semantic_preservation: null,
          entity_validity: null,
          operation_validity: null,
          boundary_validity: null,
          repetition_features: {
            candidate_a_skeleton: shuffled[a].skeleton || "",
            candidate_b_skeleton: shuffled[b].skeleton || "",
            same_skeleton: (shuffled[a].skeleton || "") === (shuffled[b].skeleton || "")
          },
          skeleton_features: {
            candidate_a_length: shuffled[a].answer.length,
            candidate_b_length: shuffled[b].answer.length
          },
          human_preference: null,
          rejection_reason: null,
          label_status: "pending_human_review"
        });
      }
      if (pairRows.length >= MAX_PAIR_ITEMS) break;
    }
  }

  const reviewPacket = {
    generated_at: generatedAt,
    source_transcript: BROWSER_PATH,
    source_matrix_seed: browser.matrix_seed,
    hidden_prompts_used: false,
    automated_preference_labels: false,
    user_review_status: "pending",
    hidden_review_status: "not_run",
    review_item_count: reviewItems.length,
    items: reviewItems
  };
  const privateMapping = {
    generated_at: generatedAt,
    source_transcript: BROWSER_PATH,
    source_runtime_report: RUNTIME_PATH,
    public_diagnostics_only: true,
    hidden_prompts_used: false,
    mappings: privateMappings
  };
  const schema = {
    schema_version: 1,
    purpose: "future learned surface ranker or bounded surface realization preference data",
    fields: {
      context: "public diagnostic context only",
      user_turn: "original user prompt",
      semantic_plan: "non-prose semantic answer record",
      candidate_a: "first realized answer candidate",
      candidate_b: "second realized answer candidate",
      evidence_ids: "evidence identifiers used by the semantic plan when available",
      factual_validity: "human or separately audited validity label; null until reviewed",
      semantic_preservation: "human or separately audited preservation label; null until reviewed",
      entity_validity: "human or separately audited entity label; null until reviewed",
      operation_validity: "human or separately audited operation label; null until reviewed",
      boundary_validity: "human or separately audited boundary label; null until reviewed",
      repetition_features: "diagnostic skeleton/repetition features",
      skeleton_features: "length and normalized skeleton features",
      human_preference: "must remain null until human-labeled",
      rejection_reason: "reviewer-entered reason when rejected"
    },
    hidden_prompts_allowed: false,
    heuristic_preference_as_human_preference_allowed: false,
    qlora_training_started: false
  };
  const inventory = {
    generated_at: generatedAt,
    review_item_count: reviewItems.length,
    preference_pair_count: pairRows.length,
    human_labels_available: 0,
    hidden_prompts_used: false,
    public_diagnostics_only: true,
    qlora_training_started: false,
    source_browser_summary: browser.summary,
    source_runtime_summary: runtime.summary
  };

  await mkdir(dirname(REVIEW_OUT), { recursive: true });
  await writeFile(REVIEW_OUT, `${JSON.stringify(reviewPacket, null, 2)}\n`, "utf8");
  await writeFile(PRIVATE_OUT, `${JSON.stringify(privateMapping, null, 2)}\n`, "utf8");
  await writeFile(SCHEMA_OUT, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
  await writeFile(PAIRS_OUT, `${pairRows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  await writeFile(READINESS_INPUT_OUT, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  await mkdir(dirname(REVIEW_DOC), { recursive: true });
  await writeFile(REVIEW_DOC, reviewInstructions(), "utf8");

  console.log(JSON.stringify({
    review_packet: REVIEW_OUT,
    private_mapping: PRIVATE_OUT,
    preference_schema: SCHEMA_OUT,
    preference_pairs: PAIRS_OUT,
    preference_inventory: READINESS_INPUT_OUT,
    review_instructions: REVIEW_DOC,
    review_item_count: reviewItems.length,
    preference_pair_count: pairRows.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
