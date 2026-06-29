#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

import { CULTURE_CARDS } from "../../web/culture_cards.generated.js";
import {
  FORBIDDEN_VISIBLE_RE,
  buildSemanticVariationPlan,
  generateControlledVariationCandidates,
  normalizeSurfaceSkeleton
} from "../../web/controlled_surface_variation.js";
import { ROOT } from "../r18_utils.mjs";

const SEED = 26061921;
const OUT = resolve(ROOT, "artifacts/surface_variation/quality_reset_targeted_matrix.json");
const PROMPT_VALIDITY_OUT = resolve(ROOT, "artifacts/surface_variation/diagnostic_prompt_validity_report.json");
const RECLASSIFICATION_OUT = resolve(ROOT, "artifacts/surface_variation/one_candidate_reclassification_report.json");
const REVIEW_OUT = resolve(ROOT, "artifacts/surface_variation/human_review_packet.json");
const PRIVATE_OUT = resolve(ROOT, "artifacts/surface_variation/human_review_mapping_private.json");
const FROZEN_BASELINE = resolve(ROOT, "artifacts/surface_variation/one_candidate_baseline_frozen.json");

const RAW_INTERNAL_RE = /\b(rural|urban|gender|war|mandopop|hongkong|factual_core|source_only|pack|runtime|schema|Q[1-9][0-9]*|P[1-9][0-9]*)\b/i;
const RAW_ENGLISH_FRAGMENT_RE = /[A-Za-z][A-Za-z _.,;:()/-]{8,}/;
const VAGUE_COMPARISON_RE = /另一种创作面向|自身风格|差别会更具体|某种特点|另一条线|更突出另一种/;
const METHOD_POLICY_RE = /边界|安全|隐私|版权|医疗|法律|金融|应该|如何提问|怎么问|训练|评审|测试|runtime|policy/i;

function clean(value) {
  return String(value || "").trim();
}

function compact(value) {
  return clean(value).replace(/\s+/g, "");
}

function stableHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleStable(items, seed) {
  const rand = lcg(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rand() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function label(card = {}) {
  return clean((card.names || []).find((name) => /[\u3400-\u9fff]/.test(String(name))) || card.names?.[0] || card.id);
}

function cardById(id = "") {
  return CULTURE_CARDS.find((card) => card.id === id) || null;
}

function entityKind(card = {}) {
  if (card.entity_type === "person") return "person";
  if (card.entity_type === "work") return "work";
  if (["movement", "period", "genre"].includes(card.entity_type)) return "domain_movement_period";
  if (["concept", "theme"].includes(card.entity_type)) return "concept";
  return card.entity_type || "unknown";
}

function domainBucket(card = {}) {
  const domain = String(card.domain || "");
  if (/music/.test(domain)) return "music";
  if (/literature|poetry/.test(domain)) return "literature";
  if (/film|cinema/.test(domain)) return "film";
  if (/art|design/.test(domain)) return "art_design";
  if (/science|technology/.test(domain)) return "science_technology";
  return "daily_world_or_social_thought";
}

function hasWorks(card = {}) {
  return Boolean((card.representative_works || card.works || []).length);
}

function hasVisibleSupport(card = {}) {
  return [...(card.definition_units || []), ...(card.themes || []), ...(card.style_axes || []), ...(card.comparison_axes || []), card.factual_core || ""].some(
    (value) => /[\u3400-\u9fff]/.test(String(value || "")) && !/[A-Za-z]/.test(String(value || ""))
  );
}

function isQuestionLikeLabel(name = "") {
  return /(吗|呢|什么|哪里|为何|为什么|怎么|如何|应该|？|\?)$/.test(clean(name));
}

function isMethodPolicyCard(card = {}) {
  return METHOD_POLICY_RE.test(`${card.id || ""} ${label(card)} ${card.domain || ""}`);
}

function expectedOperationFor(card = {}, requested = "") {
  const kind = entityKind(card);
  if (kind === "person") {
    if (/work|representative/.test(requested) && hasWorks(card)) return "list_representative_works";
    if (/open/.test(requested)) return "open_entity_topic";
    return "identify_person";
  }
  if (kind === "work") {
    if (/compare/.test(requested)) return "simple_comparison";
    return "identify_entity";
  }
  if (kind === "concept") {
    if (/compare/.test(requested)) return "simple_comparison";
    return "define_concept";
  }
  if (kind === "domain_movement_period") {
    if (/compare/.test(requested)) return "simple_comparison";
    return "define_concept";
  }
  return requested || "identify_entity";
}

function promptFor(card = {}, operation = "") {
  const name = label(card);
  const kind = entityKind(card);
  if (kind === "person") {
    if (operation === "list_representative_works") return `${name}有哪些代表作？`;
    if (operation === "open_entity_topic") return `和我聊聊${name}`;
    return `${name}是谁？`;
  }
  if (kind === "work") {
    return `${name}是什么作品？`;
  }
  if (kind === "domain_movement_period") {
    return `${name}是什么？`;
  }
  return `什么是${name}？`;
}

function validatePromptCase(testCase = {}) {
  const card = cardById(testCase.expected_subject_ids?.[0]);
  const reasons = [];
  if (!card) reasons.push("missing_subject_card");
  const name = card ? label(card) : "";
  const kind = card ? entityKind(card) : "unknown";
  if (card && isMethodPolicyCard(card)) reasons.push("method_policy_card_included");
  if (card && kind === "person" && testCase.expected_operation === "define_concept") reasons.push("person_define_concept_mismatch");
  if (card && kind === "work" && testCase.expected_operation === "identify_person") reasons.push("work_person_operation_mismatch");
  if (card && isQuestionLikeLabel(name) && /(是什么意思|是什么)$/.test(testCase.prompt)) reasons.push("malformed_double_question_prompt");
  if (/是什么意思是什么意思|吗是什么意思|呢是什么意思|哪里是什么意思|为什么是什么意思|什么是什么意思/.test(testCase.prompt)) reasons.push("malformed_double_question_prompt");
  if (card && kind === "concept" && !hasVisibleSupport(card)) reasons.push("concept_without_visible_support");
  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    entity_type: kind,
    label: name
  };
}

function correctedReplacement(testCase = {}) {
  const card = cardById(testCase.expected_subject_ids?.[0]);
  if (!card || isMethodPolicyCard(card)) return null;
  if (isQuestionLikeLabel(label(card))) return null;
  const operation = expectedOperationFor(card, testCase.expected_operation);
  return {
    ...testCase,
    source_group: "corrected_replacement",
    original_prompt: testCase.prompt,
    prompt: promptFor(card, operation),
    expected_operation: operation,
    expected_subject_ids: operation === "simple_comparison" ? testCase.expected_subject_ids : [card.id],
    domain: domainBucket(card)
  };
}

function publicCards(predicate) {
  return CULTURE_CARDS.filter((card) => card.approved_for_public_runtime !== false && /[\u3400-\u9fff]/.test(label(card)) && !isMethodPolicyCard(card) && predicate(card));
}

function buildControls() {
  const people = shuffleStable(publicCards((card) => card.entity_type === "person"), SEED).slice(0, 5).map((card) => ({
    source_group: "type_balanced_control",
    group: "control_person",
    prompt: promptFor(card, "identify_person"),
    expected_operation: "identify_person",
    expected_subject_ids: [card.id],
    domain: domainBucket(card)
  }));
  const concepts = shuffleStable(publicCards((card) => ["concept", "movement", "genre", "theme"].includes(card.entity_type) && hasVisibleSupport(card)), SEED + 1)
    .slice(0, 5)
    .map((card) => ({
      source_group: "type_balanced_control",
      group: "control_concept",
      prompt: promptFor(card, "define_concept"),
      expected_operation: "define_concept",
      expected_subject_ids: [card.id],
      domain: domainBucket(card)
    }));
  const works = shuffleStable(publicCards((card) => card.entity_type === "work"), SEED + 2).slice(0, 5).map((card) => ({
    source_group: "type_balanced_control",
    group: "control_work",
    prompt: promptFor(card, "identify_entity"),
    expected_operation: "identify_entity",
    expected_subject_ids: [card.id],
    domain: domainBucket(card)
  }));
  const comparisons = [];
  const pool = shuffleStable(publicCards((card) => card.entity_type === "person" && hasWorks(card)), SEED + 3);
  for (const left of pool) {
    const right = pool.find((card) => card.id !== left.id && card.domain === left.domain);
    if (!right) continue;
    comparisons.push({
      source_group: "type_balanced_control",
      group: "control_comparison",
      prompt: `${label(left)}和${label(right)}有什么不同？`,
      expected_operation: "simple_comparison",
      expected_subject_ids: [left.id, right.id],
      domain: domainBucket(left)
    });
    if (comparisons.length >= 5) break;
  }
  return [...people, ...concepts, ...works, ...comparisons];
}

async function buildMatrix() {
  const frozen = JSON.parse(await readFile(FROZEN_BASELINE, "utf8"));
  const original = frozen.rows.map((row) => ({
    source_group: "original_one_candidate_baseline",
    group: "original_one_candidate",
    prompt: row.original_prompt,
    expected_operation: row.original_operation,
    expected_subject_ids: row.original_operation === "simple_comparison" ? row.entity_or_concept_ids || [] : (row.entity_or_concept_ids || []).slice(0, 1),
    original_entity_or_concept_ids: row.entity_or_concept_ids || [],
    domain: domainBucket(cardById(row.entity_or_concept_ids?.[0]) || {}),
    original_classification: row.original_classification,
    original_sole_candidate: row.sole_candidate,
    original_semantic_plan: row.semantic_plan
  }));
  const replacements = original.filter((row) => !validatePromptCase(row).ok).map(correctedReplacement).filter(Boolean);
  return {
    seed: SEED,
    generated_at: new Date().toISOString(),
    hidden_prompts_used: false,
    cases: [...original, ...replacements, ...buildControls()]
  };
}

function meaningfulPairFailures(candidates = []) {
  const failures = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const left = candidates[i];
      const right = candidates[j];
      const sameMeaning =
        left.focus_id === right.focus_id &&
        JSON.stringify(left.meaningful_axes || []) === JSON.stringify(right.meaningful_axes || []);
      const onlyPunctuation =
        normalizeSurfaceSkeleton(left.text) === normalizeSurfaceSkeleton(right.text) ||
        clean(left.text).replace(/[，,；;：:。！？!?\s]/g, "") === clean(right.text).replace(/[，,；;：:。！？!?\s]/g, "");
      if (sameMeaning || onlyPunctuation) failures.push({ pair: [left.id, right.id], reason: "punctuation_only_difference" });
    }
  }
  return failures;
}

function containsAny(text = "", values = []) {
  return values.some((value) => clean(value) && text.includes(clean(value)));
}

function adequacyFailures(testCase = {}, plan = null, candidate = null) {
  const failures = [];
  const text = clean(candidate?.text || "");
  if (!plan || !candidate) return ["baseline_incomplete_answer"];
  if (FORBIDDEN_VISIBLE_RE.test(text)) failures.push("baseline_profile_language");
  if (RAW_INTERNAL_RE.test(text) || RAW_ENGLISH_FRAGMENT_RE.test(text)) failures.push("baseline_unnatural_chinese");
  if (VAGUE_COMPARISON_RE.test(text)) failures.push("baseline_vague_comparison");
  const subjectLabels = (plan.mandatory_units || []).filter((unit) => unit.kind === "label").map((unit) => clean(unit.value));
  if (subjectLabels.length && !subjectLabels.every((name) => text.includes(name))) failures.push("baseline_wrong_entity");
  if (testCase.expected_operation !== plan.response_act) failures.push("baseline_wrong_operation");
  if (/^(.{1,16})指(?:的是)?\1/.test(text)) failures.push("baseline_tautological_definition");
  if (plan.response_act === "identify_person" || plan.response_act === "identify_entity") {
    const roles = (plan.mandatory_units || []).filter((unit) => unit.kind === "role").map((unit) => unit.value);
    if (roles.length && !containsAny(text, roles)) failures.push("baseline_incomplete_answer");
    if ((plan.optional_focus_groups || []).length && !/(《|作品|特征|位置|现代|风格|历史|社会|声音|思想|叙述|设计|科学|技术)/.test(text)) failures.push("baseline_incomplete_answer");
  }
  if (plan.response_act === "list_representative_works") {
    const works = (plan.mandatory_units || []).find((unit) => unit.id === "core_works")?.value || [];
    if (!works.length || !works.every((work) => text.includes(work))) failures.push("baseline_incomplete_answer");
  }
  if (plan.response_act === "define_concept") {
    if (!/(指|是一种|可以理解为|通常指|关注|说的是)/.test(text)) failures.push("baseline_incomplete_answer");
    if (/指的是.{0,6}指的是|是一种.{0,6}是一种/.test(text)) failures.push("baseline_tautological_definition");
  }
  if (plan.response_act === "simple_comparison") {
    if (subjectLabels.length < 2 || !subjectLabels.every((name) => text.includes(name))) failures.push("baseline_wrong_entity");
    if (!/(区别|不同|偏向|相比|强调|处理的问题不同|差别是)/.test(text)) failures.push("baseline_vague_comparison");
    if (!/(；|，).+(；|，)/.test(text)) failures.push("baseline_incomplete_answer");
  }
  if (/可以先明确|泛泛贴标签|更清楚/.test(text)) failures.push("baseline_profile_language");
  return [...new Set(failures)];
}

function promptValiditySummary(rows) {
  return {
    total: rows.length,
    type_mismatches: rows.filter((row) => row.prompt_validity.reasons.some((reason) => /mismatch/.test(reason))).length,
    malformed_double_question_prompts: rows.filter((row) => row.prompt_validity.reasons.includes("malformed_double_question_prompt")).length,
    method_policy_cards_included: rows.filter((row) => row.prompt_validity.reasons.includes("method_policy_card_included")).length,
    invalid_prompt_rows: rows.filter((row) => !row.prompt_validity.ok).length
  };
}

function reclassify(row = {}) {
  if (!row.prompt_validity.ok) return "invalid_diagnostic_prompt";
  if (row.baseline_adequacy_failures.length) return "baseline_answer_invalid";
  const lifecycle = row.candidate_lifecycle || {};
  if ((lifecycle.verifier_rejections || []).some((item) => (item.reasons || []).some((reason) => /missing_mandatory_unit|unsupported_fact|wrong_entity|wrong_operation|vague_comparison|tautological_definition|unnatural_language|boundary_drift|verifier_internal_error/.test(reason)))) return "verifier_over_rejection";
  if ((lifecycle.effective_dedup_groups || []).length) return "effective_candidate_deduplication";
  if (row.expected_operation === "simple_comparison") return "candidate_generator_gap";
  if ((row.semantic_plan?.optional_focus_group_count || 0) > 1 || (row.semantic_plan?.optional_relation_ids || []).length > 1) return "candidate_generator_gap";
  if (row.expected_operation === "list_representative_works" && (row.semantic_plan?.optional_work_ids || []).length <= 2) return "current_retrieval_missing_support";
  if (row.expected_operation === "define_concept" && (row.semantic_plan?.optional_focus_group_count || 0) <= 1) return "semantic_plan_extraction_gap";
  if ((row.semantic_plan?.optional_work_ids || []).length === 1 && !(row.semantic_plan?.optional_example_ids || []).length) return "intrinsically_single_anchor";
  return "unknown";
}

function compactPlan(plan) {
  return plan
    ? {
        semantic_signature: plan.semantic_signature,
        response_act: plan.response_act,
        subject_ids: plan.subject_ids,
        mandatory_units: plan.mandatory_units,
        optional_focus_groups: plan.optional_focus_groups,
        optional_work_ids: plan.optional_work_ids,
        optional_example_ids: plan.optional_example_ids,
        optional_relation_ids: plan.optional_relation_ids,
        optional_contrast_ids: plan.optional_contrast_ids,
        evidence_ids: plan.evidence_ids,
        language: plan.language
      }
    : null;
}

function validateCase(testCase, plan, generated, promptValidity) {
  const candidates = generated.candidates || [];
  const failures = [];
  if (!promptValidity.ok) failures.push("invalid_diagnostic_prompt");
  if (!plan) failures.push("missing_semantic_plan");
  if (plan && plan.response_act !== testCase.expected_operation) failures.push("wrong_operation");
  for (const id of testCase.expected_subject_ids || []) {
    if (!plan?.subject_ids?.includes(id)) failures.push("wrong_entity");
  }
  for (const candidate of candidates) {
    if (FORBIDDEN_VISIBLE_RE.test(candidate.text)) failures.push("forbidden_template_hit");
    if (RAW_INTERNAL_RE.test(candidate.text) || RAW_ENGLISH_FRAGMENT_RE.test(candidate.text)) failures.push("raw_english_schema_leakage");
  }
  if (meaningfulPairFailures(candidates).length) failures.push("punctuation_only_candidate_pair");
  if (!generated.lifecycle) failures.push("missing_candidate_lifecycle_trace");
  return [...new Set(failures)];
}

function reviewDimensions(kind) {
  if (kind === "one_candidate") {
    return {
      answer_acceptable: null,
      second_answer_actually_necessary: null,
      reason: null
    };
  }
  return {
    factual_consistency: null,
    operation_satisfaction: null,
    genuinely_different_focus: null,
    natural_chinese: null,
    useful_difference: null,
    template_feel: null,
    preferred_candidate: null,
    acceptability: null
  };
}

function buildReviewPacket(results) {
  const valid = results.filter((row) => row.prompt_validity.ok && row.hard_failures.length === 0 && row.baseline_adequacy_failures.length === 0);
  const multi = shuffleStable(valid.filter((row) => row.candidates.length >= 2), SEED + 4).slice(0, 20);
  const one = shuffleStable(valid.filter((row) => row.candidates.length === 1), SEED + 5).slice(0, 5);
  const items = [];
  const mappings = [];
  for (const row of [...multi, ...one]) {
    const kind = row.candidates.length === 1 ? "one_candidate" : "multi_candidate";
    const reviewId = `sv_semantic_reset_${String(items.length + 1).padStart(4, "0")}`;
    const candidates = shuffleStable(row.candidates, Number.parseInt(stableHash(row.prompt).slice(0, 8), 16)).slice(0, 3);
    items.push({
      review_id: reviewId,
      item_type: kind,
      context: `${row.group} / ${row.domain}`,
      user_turn: row.prompt,
      candidates: candidates.map((candidate, index) => ({ label: ["A", "B", "C"][index], answer: candidate.text })),
      review_dimensions: reviewDimensions(kind)
    });
    mappings.push({
      review_id: reviewId,
      prompt: row.prompt,
      semantic_signature: row.semantic_plan.semantic_signature,
      subject_ids: row.semantic_plan.subject_ids,
      candidate_sources: candidates.map((candidate, index) => ({
        label: ["A", "B", "C"][index],
        candidate_id: candidate.id,
        focus_id: candidate.focus_id,
        shape_id: candidate.shape_id,
        meaningful_axes: candidate.meaningful_axes
      })),
      automated_preference: null,
      human_preference: null
    });
  }
  return { items, mappings, multi_count: multi.length, one_count: one.length };
}

async function main() {
  const matrix = await buildMatrix();
  const originalRows = [];
  const repairedRows = [];
  const results = [];
  for (const testCase of matrix.cases) {
    const promptValidity = validatePromptCase(testCase);
    const plan = promptValidity.ok ? buildSemanticVariationPlan({ query: testCase.prompt, subjectIds: testCase.expected_subject_ids }) : null;
    const generated = plan ? generateControlledVariationCandidates(plan) : { candidates: [], lifecycle: null, collapsed: [] };
    const candidates = generated.candidates || [];
    const baselineAdequacy = promptValidity.ok && candidates[0] ? adequacyFailures(testCase, plan, candidates[0]) : [];
    const hardFailures = validateCase(testCase, plan, generated, promptValidity);
    const row = {
      ...testCase,
      prompt_validity: promptValidity,
      semantic_plan: compactPlan(plan),
      candidate_count: Math.max(1, candidates.length),
      effective_candidate_count: Math.max(1, candidates.length),
      one_candidate_reason: generated.one_candidate_reason || "",
      candidates,
      candidate_lifecycle: generated.lifecycle || null,
      collapsed_candidates: generated.collapsed || [],
      baseline_adequacy_failures: baselineAdequacy,
      hard_failures: hardFailures
    };
    row.new_one_candidate_classification = candidates.length === 1 ? reclassify(row) : "";
    results.push(row);
    if (testCase.source_group === "original_one_candidate_baseline") originalRows.push(row);
    else repairedRows.push(row);
  }

  const validRows = results.filter((row) => row.prompt_validity.ok);
  const blockingRows = validRows.filter((row) => row.hard_failures.filter((failure) => failure !== "invalid_diagnostic_prompt").length || row.baseline_adequacy_failures.length);
  const summary = {
    total_prompts: results.length,
    original_one_candidate_rows: originalRows.length,
    corrected_replacements_and_controls: repairedRows.length,
    invalid_diagnostic_rows: results.filter((row) => !row.prompt_validity.ok).length,
    baseline_invalid_rows: results.filter((row) => row.baseline_adequacy_failures.length).length,
    valid_one_candidate_rows: validRows.filter((row) => row.candidates.length === 1 && !row.baseline_adequacy_failures.length).length,
    valid_multi_candidate_rows: validRows.filter((row) => row.candidates.length >= 2 && !row.baseline_adequacy_failures.length).length,
    prompt_validity_before: promptValiditySummary(originalRows),
    prompt_validity_after: promptValiditySummary(repairedRows),
    wrong_entity: validRows.filter((row) => row.hard_failures.includes("wrong_entity")).length,
    wrong_operation: validRows.filter((row) => row.hard_failures.includes("wrong_operation")).length,
    raw_english_schema_leakage: validRows.filter((row) => row.hard_failures.includes("raw_english_schema_leakage")).length,
    punctuation_only_candidate_pairs: validRows.filter((row) => row.hard_failures.includes("punctuation_only_candidate_pair")).length,
    missing_candidate_lifecycle_traces: validRows.filter((row) => row.hard_failures.includes("missing_candidate_lifecycle_trace")).length,
    vague_comparison_answers: results.filter((row) => row.baseline_adequacy_failures.includes("baseline_vague_comparison")).length,
    tautological_definitions: results.filter((row) => row.baseline_adequacy_failures.includes("baseline_tautological_definition")).length,
    blocking_failure_count: blockingRows.length
  };
  const classificationCounts = results
    .filter((row) => row.candidates.length === 1)
    .reduce((acc, row) => {
      const key = row.new_one_candidate_classification || "not_one_candidate";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  const report = { generated_at: new Date().toISOString(), matrix, summary, one_candidate_classification_counts: classificationCounts, results };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const promptReport = {
    generated_at: report.generated_at,
    before: summary.prompt_validity_before,
    after: summary.prompt_validity_after,
    original_invalid_rows: originalRows.filter((row) => !row.prompt_validity.ok).map((row) => ({ prompt: row.prompt, ids: row.expected_subject_ids, reasons: row.prompt_validity.reasons, entity_type: row.prompt_validity.entity_type })),
    corrected_replacements: repairedRows.filter((row) => row.source_group === "corrected_replacement").map((row) => ({ original_prompt: row.original_prompt, replacement_prompt: row.prompt, operation: row.expected_operation, ids: row.expected_subject_ids }))
  };
  await writeFile(PROMPT_VALIDITY_OUT, `${JSON.stringify(promptReport, null, 2)}\n`, "utf8");

  const reclassification = {
    generated_at: report.generated_at,
    old_source: "artifacts/surface_variation/one_candidate_audit.json",
    new_taxonomy: [
      "intrinsically_single_anchor",
      "current_retrieval_missing_support",
      "semantic_plan_extraction_gap",
      "candidate_generator_gap",
      "verifier_over_rejection",
      "effective_candidate_deduplication",
      "invalid_diagnostic_prompt",
      "baseline_answer_invalid",
      "source_conflict",
      "unknown"
    ],
    counts: classificationCounts,
    rows: results
      .filter((row) => row.source_group === "original_one_candidate_baseline")
      .map((row) => ({ prompt: row.prompt, old_label: row.original_classification || "", new_label: row.new_one_candidate_classification || (row.candidates.length > 1 ? "now_multi_candidate" : "unknown"), baseline_failures: row.baseline_adequacy_failures, prompt_validity: row.prompt_validity }))
  };
  await writeFile(RECLASSIFICATION_OUT, `${JSON.stringify(reclassification, null, 2)}\n`, "utf8");

  const canReview =
    summary.prompt_validity_after.type_mismatches === 0 &&
    summary.prompt_validity_after.malformed_double_question_prompts === 0 &&
    summary.prompt_validity_after.method_policy_cards_included === 0 &&
    summary.wrong_operation === 0 &&
    summary.raw_english_schema_leakage === 0 &&
    summary.punctuation_only_candidate_pairs === 0 &&
    summary.missing_candidate_lifecycle_traces === 0 &&
    summary.vague_comparison_answers === 0 &&
    summary.tautological_definitions === 0 &&
    summary.blocking_failure_count === 0;
  let review = { items: [], mappings: [], multi_count: 0, one_count: 0 };
  if (canReview) {
    review = buildReviewPacket(results);
    await writeFile(
      REVIEW_OUT,
      `${JSON.stringify(
        {
          generated_at: report.generated_at,
          source_report: OUT,
          review_item_count: review.items.length,
          multi_candidate_items: review.multi_count,
          intentional_one_candidate_items: review.one_count,
          hidden_prompts_used: false,
          automated_preference_labels: false,
          user_review_status: "pending",
          items: review.items
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    await writeFile(PRIVATE_OUT, `${JSON.stringify({ generated_at: report.generated_at, source_report: OUT, mappings: review.mappings }, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify({ out: OUT, prompt_validity: PROMPT_VALIDITY_OUT, reclassification: RECLASSIFICATION_OUT, review_packet: canReview ? REVIEW_OUT : null, summary, review: { multi: review.multi_count, one: review.one_count } }, null, 2));
  if (!canReview) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
