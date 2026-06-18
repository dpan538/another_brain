#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "../dialog_runtime.mjs";
import { ROOT } from "../r18_utils.mjs";

const SAMPLE_PATH = resolve(ROOT, "artifacts/recovery/direct_answer_sibling_sample.json");
const OUT = resolve(ROOT, "artifacts/recovery/direct_answer_validation.json");

const PUBLIC_CASES = [
  { group: "public", entity_id: "person.luo_dayou", operation: "identify_person", prompt: "罗大佑是谁？" },
  { group: "public", entity_id: "person.teresa_teng", operation: "identify_person", prompt: "邓丽君是谁？" },
  { group: "public", entity_id: "person.jay_chou", operation: "identify_person", prompt: "周杰伦是谁》" },
  { group: "public", entity_id: "person.faye_wong", operation: "open_entity_topic", prompt: "和我聊聊王菲" },
  { group: "public", entity_id: "person.mo_yan", operation: "identify_person", prompt: "莫言是谁？" },
  { group: "public", entity_id: "person.mo_yan", operation: "list_representative_works", prompt: "莫言有什么代表作吗？" }
];

const IMPLEMENTATION_RE = /(卡片|图谱|检索|runtime|schema|pack|覆盖还不完整|不能贴歌词|我会按|机械反问|入口|先看|这个音乐对象|这个文学对象)/i;
const RAW_ENGLISH_RE =
  /\b(rural|urban|gender|war|mandopop|hongkong|Contemporary Chinese writer|Singer whose|Singer-songwriter|producer whose|film director; period|mathematician|computer scientist|historical_position|institutional context)\b/i;

function clean(text) {
  return String(text || "").trim();
}

function promptFor(item, operation) {
  if (operation === "identify_person") return `${item.name}是谁？`;
  if (operation === "list_representative_works") return `${item.name}有什么代表作？`;
  return `和我聊聊${item.name}`;
}

function expectedOperation(operation) {
  return operation === "open_entity_topic" ? "open_entity_topic" : operation;
}

function domainFamily(domain = "") {
  const text = String(domain || "");
  if (text.includes(".")) return text.split(".")[0];
  return text;
}

async function runCase(testCase) {
  const turn = await answerDialogPrompt(testCase.prompt, createDialogRuntime(), { withThinkingDelay: false, uiProfile: "mobile" });
  const controller = turn.trace?.conversation_controller || {};
  const selectedIds = controller.binding?.target_ids || turn.trace?.state_after?.activeEntityIds || [];
  const operation = controller.operation || "";
  const failures = [];
  if (!selectedIds.includes(testCase.entity_id)) failures.push("wrong_entity");
  if (operation !== expectedOperation(testCase.operation)) failures.push("wrong_operation");
  if (!turn.trace?.state_after?.activeEntityIds?.includes(testCase.entity_id)) failures.push("person_card_not_active");
  if (testCase.operation === "list_representative_works" && !(turn.trace?.state_after?.activeWorkIds || []).length) failures.push("works_not_returned");
  if (["fallback", "fallback_firewall", "structured"].includes(turn.route || "")) failures.push("fallback_or_structured_source");
  if (/dialogic_domain|profile/.test(JSON.stringify(controller.answer_plan || {}))) failures.push("profile_answer_source");
  if (IMPLEMENTATION_RE.test(turn.answer)) failures.push("implementation_vocabulary");
  if (RAW_ENGLISH_RE.test(turn.answer)) failures.push("raw_english_schema_value");
  if (
    controller.active_topic?.domain &&
    turn.trace?.state_after?.activeDomain &&
    domainFamily(controller.active_topic.domain) !== domainFamily(turn.trace.state_after.activeDomain)
  ) {
    failures.push("wrong_domain");
  }
  return {
    group: testCase.group,
    family: testCase.family || "",
    prompt: testCase.prompt,
    expected_entity_id: testCase.entity_id,
    selected_entity_ids: selectedIds,
    expected_operation: testCase.operation,
    operation,
    answer: turn.answer,
    final_answer_source: turn.route,
    response_act: controller.response_act || controller.answer_plan?.response_act || "",
    active_work_ids: turn.trace?.state_after?.activeWorkIds || [],
    hard_invariant_failures: failures
  };
}

async function main() {
  const sample = JSON.parse(await readFile(SAMPLE_PATH, "utf8"));
  const siblingCases = sample.selected.flatMap((item) => [
    { group: "sibling", family: item.family, entity_id: item.id, operation: "identify_person", prompt: promptFor(item, "identify_person") },
    { group: "sibling", family: item.family, entity_id: item.id, operation: "list_representative_works", prompt: promptFor(item, "list_representative_works") },
    { group: "sibling", family: item.family, entity_id: item.id, operation: "open_entity_topic", prompt: promptFor(item, "open_entity_topic") }
  ]);
  const cases = [...PUBLIC_CASES, ...siblingCases];
  const results = [];
  for (const testCase of cases) results.push(await runCase(testCase));
  const summary = {
    total: results.length,
    public_count: results.filter((item) => item.group === "public").length,
    sibling_count: results.filter((item) => item.group === "sibling").length,
    correct_entity_selection_count: results.filter((item) => !item.hard_invariant_failures.includes("wrong_entity")).length,
    correct_operation_count: results.filter((item) => !item.hard_invariant_failures.includes("wrong_operation")).length,
    profile_source_usage_count: results.filter((item) => item.hard_invariant_failures.includes("profile_answer_source")).length,
    implementation_leakage_count: results.filter((item) => item.hard_invariant_failures.includes("implementation_vocabulary")).length,
    raw_english_field_leakage_count: results.filter((item) => item.hard_invariant_failures.includes("raw_english_schema_value")).length,
    wrong_domain_count: results.filter((item) => item.hard_invariant_failures.includes("wrong_domain")).length,
    remaining_failure_count: results.filter((item) => item.hard_invariant_failures.length).length
  };
  const report = {
    generated_at: new Date().toISOString(),
    sample_seed: sample.seed,
    summary,
    results
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ out: OUT, summary }, null, 2));
  if (summary.remaining_failure_count) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
