#!/usr/bin/env node

/** Build a zero-network, local-only UI around the public-safe P2 stimuli. */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_INPUT = join(ROOT, "artifacts", "r30j0", "persona_excavation", "elicitation_pack_v2.json");
const DEFAULT_OUTPUT = join(ROOT, "artifacts", "r30j0", "persona_excavation", "owner_review_v2");
const TEMPLATE_ROOT = join(ROOT, "data", "personal_judge", "templates", "persona_review_v2");
const EXPECTED_SESSIONS = { A: 40, B: 40, C: 40, D: 40, E: 30 };
const EXPECTED_ACTIONS = ["ACCEPT", "REJECT", "EDIT", "DEPENDS", "UNSURE"];
const TARGET_REF_TYPES = ["microtrait", "mode", "antipattern", "contradiction", "grammar"];

function parseArgs(argv) {
  const values = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--input") values.input = resolve(argv[++index]);
    else if (argv[index] === "--output-dir") values.output = resolve(argv[++index]);
    else throw new Error(`unknown_argument:${argv[index]}`);
  }
  return values;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function atomicWrite(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, value, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

function countTag(items, tag) {
  return items.filter((item) => item.battery_tags.includes(tag)).length;
}

function sourceItems(pack) {
  return pack.decision_items.filter((item) => !item.blind_repeat);
}

function uniqueCases(pack, tag) {
  return new Set(sourceItems(pack).filter((item) => item.battery_tags.includes(tag)).map((item) => item.case_id)).size;
}

function targetRefCounts(items, unique = false) {
  return Object.fromEntries(TARGET_REF_TYPES.map((targetType) => {
    const values = items.flatMap((item) => item.target_refs.filter((ref) => ref.target_type === targetType).map((ref) => ref.target_id));
    return [targetType, unique ? new Set(values).size : values.length];
  }));
}

function validatePack(pack) {
  if (pack.schema_version !== "r30j0.owner_persona_elicitation_pack.v2") throw new Error("invalid_schema_version");
  if (!Array.isArray(pack.decision_items) || pack.decision_items.length !== 190) throw new Error("decision_item_count_must_equal_190");
  if (!Array.isArray(pack.optional_owner_write_prompts) || pack.optional_owner_write_prompts.length !== 40) throw new Error("owner_write_prompt_count_must_equal_40");
  if (JSON.stringify(pack.review_contract.actions) !== JSON.stringify(EXPECTED_ACTIONS)) throw new Error("review_action_contract_mismatch");
  if (pack.owner_answers_present !== false || pack.owner_labels_present !== false) throw new Error("seed_contains_owner_answer_or_label");
  if (pack.owner_review_v1_paused !== true || pack.owner_review_v1_item_count !== 174) throw new Error("previous_owner_review_must_be_paused");
  for (const key of ["owner_review_completed", "profile_frozen", "training_authorized", "training_started"]) {
    if (pack[key] !== false) throw new Error(`readiness_flag_must_be_false:${key}`);
  }
  const ids = new Set();
  const position = new Map();
  pack.decision_items.forEach((item, index) => {
    if (ids.has(item.item_id)) throw new Error("duplicate_item_id");
    ids.add(item.item_id);
    position.set(item.item_id, index);
    if (item.public_safe !== true || item.stimulus_origin !== "CODEX_SYNTHETIC_PUBLIC_SAFE") throw new Error(`non_public_safe_stimulus:${item.item_id}`);
    if (item.owner_response_present !== false || item.owner_label_present !== false || item.owner_review_required !== true || item.allowed_for_training !== false) throw new Error(`stimulus_admission_violation:${item.item_id}`);
    if (typeof item.case_id !== "string" || !item.case_id) throw new Error(`case_id_missing:${item.item_id}`);
    if (!Array.isArray(item.target_refs) || item.target_refs.length === 0) throw new Error(`target_refs_missing:${item.item_id}`);
    const targetKeys = new Set();
    for (const ref of item.target_refs) {
      if (!ref || typeof ref !== "object" || Array.isArray(ref) || JSON.stringify(Object.keys(ref).sort()) !== JSON.stringify(["target_id", "target_type"])) throw new Error(`target_ref_shape_invalid:${item.item_id}`);
      if (!TARGET_REF_TYPES.includes(ref.target_type) || typeof ref.target_id !== "string" || !/^[a-z][a-z0-9_.-]{2,127}$/.test(ref.target_id)) throw new Error(`target_ref_invalid:${item.item_id}`);
      const key = `${ref.target_type}\u0000${ref.target_id}`;
      if (targetKeys.has(key)) throw new Error(`duplicate_target_ref:${item.item_id}`);
      targetKeys.add(key);
    }
    for (const key of ["all_candidates_objectively_acceptable", "personal_fit_only", "reverse_control_plausible_less_personal_winner"]) {
      if (typeof item[key] !== "boolean") throw new Error(`battery_metadata_missing:${item.item_id}:${key}`);
    }
    if (JSON.stringify(item.review_actions) !== JSON.stringify(EXPECTED_ACTIONS)) throw new Error(`item_action_contract_mismatch:${item.item_id}`);
    if (!item.allowed_decisions.includes("NONE_OF_THESE") || !item.allowed_decisions.includes("IT_DEPENDS")) throw new Error(`conditional_choice_missing:${item.item_id}`);
    if (item.candidates) {
      const canonicalIds = item.candidates.map((candidate) => candidate.canonical_option_id);
      if (new Set(canonicalIds).size !== canonicalIds.length) throw new Error(`canonical_option_ids_invalid:${item.item_id}`);
    }
  });
  for (const [session, expected] of Object.entries(EXPECTED_SESSIONS)) {
    const actual = pack.decision_items.filter((item) => item.session === session).length;
    if (actual !== expected) throw new Error(`session_count_mismatch:${session}:${actual}`);
  }
  const repeats = pack.decision_items.filter((item) => item.blind_repeat);
  if (repeats.length / pack.decision_items.length < 0.12) throw new Error("blind_repeat_rate_below_minimum");
  for (const repeat of repeats) {
    const sourcePosition = position.get(repeat.repeat_of);
    if (sourcePosition === undefined || sourcePosition >= position.get(repeat.item_id)) throw new Error(`blind_repeat_order_invalid:${repeat.item_id}`);
    const source = pack.decision_items[sourcePosition];
    if (source.prompt === repeat.prompt || source.underlying_decision_family !== repeat.underlying_decision_family) throw new Error(`blind_repeat_not_altered_equivalent:${repeat.item_id}`);
    if (source.case_id !== repeat.case_id) throw new Error(`blind_repeat_case_mapping_changed:${repeat.item_id}`);
    if (JSON.stringify(source.target_refs) !== JSON.stringify(repeat.target_refs)) throw new Error(`blind_repeat_target_refs_changed:${repeat.item_id}`);
    if (repeat.candidates) {
      const sourceOptions = source.candidates.map((candidate) => candidate.canonical_option_id);
      const repeatOptions = repeat.candidates.map((candidate) => candidate.canonical_option_id);
      if (JSON.stringify(sourceOptions) === JSON.stringify(repeatOptions) || JSON.stringify([...sourceOptions].sort()) !== JSON.stringify([...repeatOptions].sort())) throw new Error(`blind_repeat_option_mapping_invalid:${repeat.item_id}`);
    }
    if (repeat.scenario_pair) {
      const sourceScenarios = source.scenario_pair.map((scenario) => scenario.canonical_scenario_id);
      const repeatScenarios = repeat.scenario_pair.map((scenario) => scenario.canonical_scenario_id);
      if (JSON.stringify(sourceScenarios) === JSON.stringify(repeatScenarios) || JSON.stringify([...sourceScenarios].sort()) !== JSON.stringify([...repeatScenarios].sort())) throw new Error(`blind_repeat_scenario_mapping_invalid:${repeat.item_id}`);
    }
  }
  const sources = sourceItems(pack);
  if (sources.length !== 166 || new Set(sources.map((item) => item.case_id)).size !== 166) throw new Error("source_case_count_must_equal_166");
  const ownerSeedId = String(pack.owner_asserted_mode_seed.mode_id).toLocaleLowerCase("en-US");
  if (!sources.some((item) => item.target_refs.some((ref) => ref.target_type === "mode" && ref.target_id.toLocaleLowerCase("en-US") === ownerSeedId))) throw new Error("owner_seed_mode_requires_dynamic_source_review_link");
  const sourceSectionCounts = Object.fromEntries(pack.sections.map((section) => [section, sources.filter((item) => item.section === section).length]));
  if (Object.values(sourceSectionCounts).some((count) => count === 0)) throw new Error("review_sections_require_source_items");
  const sectionMinimums = { antipatterns: 8, register_differences: 6, contradictions: 4, final_grammar_review: 2 };
  for (const [section, minimum] of Object.entries(sectionMinimums)) {
    if (sourceSectionCounts[section] < minimum) throw new Error(`specialized_section_too_small:${section}`);
  }
  const minimums = { weird_question: 40, crocodile_boundary: 24, generic_good_mismatch: 50, reverse_control: 40 };
  for (const [tag, minimum] of Object.entries(minimums)) {
    if (uniqueCases(pack, tag) < minimum) throw new Error(`unique_battery_minimum_not_met:${tag}`);
  }
  const weird = sources.filter((item) => item.battery_tags.includes("weird_question"));
  const scenarioTexts = weird.flatMap((item) => item.scenario_pair?.map((scenario) => scenario.text) || []);
  if (new Set(scenarioTexts).size !== scenarioTexts.length) throw new Error("weird_scenarios_must_be_unique");
  const generic = sources.filter((item) => item.battery_tags.includes("generic_good_mismatch"));
  if (new Set(generic.map((item) => item.prompt)).size < 50) throw new Error("generic_good_contexts_must_be_unique");
  for (const item of generic) {
    if (!item.all_candidates_objectively_acceptable || !item.personal_fit_only || item.candidates?.length !== 3) throw new Error(`generic_good_metadata_invalid:${item.item_id}`);
  }
  const reverse = sources.filter((item) => item.battery_tags.includes("reverse_control"));
  if (new Set(reverse.map((item) => item.prompt)).size < 40 || reverse.some((item) => !item.reverse_control_plausible_less_personal_winner)) throw new Error("reverse_control_unique_metadata_invalid");
  for (const item of sources.filter((entry) => entry.scenario_pair)) {
    if (JSON.stringify(item.scenario_decision_options) !== JSON.stringify(["NORMAL", "CROCODILE", "EITHER", "DEPENDS"])) throw new Error(`pair_options_invalid:${item.item_id}`);
    if (JSON.stringify(item.allowed_decisions) !== JSON.stringify(["PAIR_DECISION", "NONE_OF_THESE", "IT_DEPENDS"])) throw new Error(`pair_decision_invalid:${item.item_id}`);
    if (new Set(item.scenario_pair.map((scenario) => scenario.canonical_scenario_id)).size !== 2) throw new Error(`pair_canonical_ids_invalid:${item.item_id}`);
  }
  for (const item of sources.filter((entry) => entry.task_type === "edit_response")) {
    const target = item.response_to_edit;
    if (!target || !item.candidates.some((candidate) => candidate.canonical_option_id === target.canonical_option_id && candidate.text === target.text)) throw new Error(`edit_target_invalid:${item.item_id}`);
    if (JSON.stringify(item.allowed_decisions) !== JSON.stringify(["KEEP_AS_IS", "SUBMIT_EDIT", "NONE_OF_THESE", "IT_DEPENDS"])) throw new Error(`edit_decisions_invalid:${item.item_id}`);
  }
  const summary = pack.target_ref_summary;
  const targetRefItemCount = pack.decision_items.filter((item) => item.target_refs.length > 0).length;
  const targetRefTotalCount = pack.decision_items.reduce((total, item) => total + item.target_refs.length, 0);
  if (!summary || summary.target_ref_item_count !== targetRefItemCount || summary.target_ref_total_count !== targetRefTotalCount) throw new Error("target_ref_summary_count_mismatch");
  const uniqueCounts = targetRefCounts(pack.decision_items, true);
  for (const targetType of TARGET_REF_TYPES) {
    if (summary.unique_target_ref_counts[targetType] !== uniqueCounts[targetType]) throw new Error(`target_ref_summary_unique_count_mismatch:${targetType}`);
    if (summary.covered_high_value_target_counts[targetType] !== summary.required_high_value_target_counts[targetType]) throw new Error(`high_value_target_not_covered:${targetType}`);
    if (summary.uncovered_high_value_target_counts[targetType] !== 0) throw new Error(`high_value_target_uncovered:${targetType}`);
  }
  if (summary.uncovered_high_value_target_ref_count !== 0) throw new Error("high_value_target_ref_count_must_be_zero");
  const openCount = pack.decision_items.filter((item) => item.task_type === "open_ended_question").length;
  if (openCount < 20 || openCount > 30) throw new Error("open_ended_count_out_of_range");
  for (const prompt of pack.optional_owner_write_prompts) {
    if (prompt.public_safe !== true || prompt.owner_response_present !== false || prompt.owner_label_present !== false || prompt.owner_review_required !== true || prompt.allowed_for_training !== false) throw new Error(`owner_write_seed_violation:${prompt.prompt_id}`);
  }
  if (pack.stimuli_are_owner_preferences !== false) throw new Error("synthetic_stimulus_must_not_be_personal_claim");
}

const args = parseArgs(process.argv.slice(2));
const inputText = await readFile(args.input, "utf8");
const pack = JSON.parse(inputText);
validatePack(pack);

await mkdir(args.output, { recursive: true, mode: 0o700 });
const templateFiles = ["index.html", "review.css", "review.js"];
for (const name of templateFiles) {
  await atomicWrite(join(args.output, name), await readFile(join(TEMPLATE_ROOT, name), "utf8"));
}

const safeSeed = JSON.stringify(pack, null, 2)
  .replaceAll("<", "\\u003c")
  .replaceAll("\u2028", "\\u2028")
  .replaceAll("\u2029", "\\u2029");
await atomicWrite(join(args.output, "review_seed.js"), `"use strict";\nwindow.R30J0_P2_ELICITATION_SEED = ${safeSeed};\n`);

const initialState = {
  schema_version: "r30j0.owner_persona_elicitation_review.v2",
  pack_id: pack.pack_id,
  status: "HUMAN_PERSONA_ELICITATION_REQUIRED",
  responses: {},
  owner_written_responses: {},
  owner_review_completed: false,
  profile_frozen: false,
  training_authorized: false,
  training_started: false,
  allowed_for_training: false,
};
await atomicWrite(join(args.output, "initial_review_state.json"), `${JSON.stringify(initialState, null, 2)}\n`);

const manifest = {
  schema_version: "r30j0.owner_persona_elicitation_ui_manifest.v2",
  pack_id: pack.pack_id,
  status: "HUMAN_PERSONA_ELICITATION_REQUIRED",
  decision_item_count: pack.decision_items.length,
  optional_owner_write_prompt_count: pack.optional_owner_write_prompts.length,
  session_counts: Object.fromEntries(Object.keys(EXPECTED_SESSIONS).map((session) => [session, pack.decision_items.filter((item) => item.session === session).length])),
  section_counts: Object.fromEntries(pack.sections.map((section) => [section, pack.decision_items.filter((item) => item.section === section).length])),
  source_section_counts: Object.fromEntries(pack.sections.map((section) => [section, sourceItems(pack).filter((item) => item.section === section).length])),
  linked_decision_item_count: pack.decision_items.filter((item) => item.target_refs.length > 0).length,
  target_ref_item_count: pack.target_ref_summary.target_ref_item_count,
  target_ref_total_count: pack.target_ref_summary.target_ref_total_count,
  target_ref_counts: targetRefCounts(pack.decision_items),
  unique_target_ref_counts: targetRefCounts(pack.decision_items, true),
  required_high_value_target_counts: pack.target_ref_summary.required_high_value_target_counts,
  covered_high_value_target_counts: pack.target_ref_summary.covered_high_value_target_counts,
  uncovered_high_value_target_counts: pack.target_ref_summary.uncovered_high_value_target_counts,
  uncovered_high_value_target_ref_count: pack.target_ref_summary.uncovered_high_value_target_ref_count,
  tag_counts: {
    weird_question: countTag(pack.decision_items, "weird_question"),
    crocodile_boundary: countTag(pack.decision_items, "crocodile_boundary"),
    generic_good_mismatch: countTag(pack.decision_items, "generic_good_mismatch"),
    reverse_control: countTag(pack.decision_items, "reverse_control"),
  },
  open_ended_count: pack.decision_items.filter((item) => item.task_type === "open_ended_question").length,
  blind_repeat_count: pack.decision_items.filter((item) => item.blind_repeat).length,
  blind_repeat_rate: pack.decision_items.filter((item) => item.blind_repeat).length / pack.decision_items.length,
  unique_case_count: pack.coverage.unique_case_count,
  blind_repeat_case_count: pack.coverage.blind_repeat_case_count,
  unique_weird_case_count: pack.coverage.unique_weird_case_count,
  unique_crocodile_boundary_pair_count: pack.coverage.unique_crocodile_boundary_pair_count,
  unique_generic_good_case_count: pack.coverage.unique_generic_good_case_count,
  unique_reverse_control_case_count: pack.coverage.unique_reverse_control_case_count,
  review_action_count: EXPECTED_ACTIONS.length,
  owner_answers_present: false,
  owner_labels_present: false,
  owner_review_v1_paused: true,
  owner_review_v1_item_count: 174,
  owner_review_completed: false,
  profile_frozen: false,
  training_authorized: false,
  training_started: false,
  classification_updates: 0,
  optimizer_tokens: 0,
  checkpoint: null,
  candidate: null,
  network_required: false,
  input_sha256: sha256(inputText),
  entrypoint: "index.html",
};
await atomicWrite(join(args.output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const readme = `# R30J0-P2 owner persona elicitation\n\nOpen \`index.html\` locally. The pack contains ${manifest.decision_item_count} synthetic, public-safe decision stimuli in Sessions A–E plus ${manifest.optional_owner_write_prompt_count} optional owner-writing prompts. It contains no owner answers or owner preference labels. Progress is saved only in this browser and can be exported as a local JSON draft. All exports keep owner review, profile freeze, training authorization, and training state false.\n\nThe previous R30J0 174-item review is paused and is not imported into this pack. No network service is used.\n`;
await atomicWrite(join(args.output, "README.md"), readme);

console.log(JSON.stringify({
  status: manifest.status,
  pack_id: manifest.pack_id,
  decision_item_count: manifest.decision_item_count,
  optional_owner_write_prompt_count: manifest.optional_owner_write_prompt_count,
  owner_answers_present: false,
  owner_labels_present: false,
  network_required: false,
  output_dir: args.output,
}));
