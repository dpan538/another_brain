#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCompactStateFromTurns,
  buildRuntimePacket,
  compactExtractionTurnsFromState,
  compactStateContainsPrivateValue,
  compactStateContainsRawText,
  CONTEXT_WINDOWS,
  rawRuntimeTurnsFromState,
  visibleTurnsFromState
} from "../web/compact_context.js?v=1";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = resolve(ROOT, "artifacts/training_os/short_context_contract_report.json");
const EVAL_DIR = resolve(ROOT, "evals/r16_short_context");
const DOC_PATH = resolve(ROOT, "docs/short_context_runtime_design.md");

function failure(list, code, detail = {}) {
  list.push({ code, ...detail });
}

function parseJsonl(text, file, failures) {
  return text
    .split(/\n/)
    .map((line, index) => ({ line, index: index + 1 }))
    .filter((entry) => entry.line.trim())
    .map((entry) => {
      try {
        return JSON.parse(entry.line);
      } catch (error) {
        failure(failures, "jsonl_parse_error", { file, line: entry.index, message: error.message });
        return null;
      }
    })
    .filter(Boolean);
}

function hasAnyGuard(row) {
  return (
    (Array.isArray(row.must_not_include) && row.must_not_include.length > 0) ||
    (Array.isArray(row.unacceptable_answers) && row.unacceptable_answers.length > 0) ||
    (Array.isArray(row.forbidden_compact_fields) && row.forbidden_compact_fields.length > 0)
  );
}

function makeSyntheticTurns(count = 20) {
  return Array.from({ length: count }, (_, index) => ({
    question: `raw question ${index + 1}`,
    answer: `raw answer ${index + 1}`,
    intent: index % 2 ? "culture_awareness" : "operation_arithmetic",
    topic: index % 2 ? "literature.japanese" : "reasoning",
    domain: index % 2 ? "literature.japanese" : "reasoning",
    question_type: index % 2 ? "author_list" : "solve",
    operation: index % 2 ? "culture_list_authors_from_cards" : "word_arithmetic",
    answer_policy: "short_direct",
    focus_entity_id: index % 2 ? "natsume-soseki" : "",
    entity_ids: index % 2 ? ["natsume-soseki"] : ["A", "B"],
    work_ids: index % 2 ? ["kokoro"] : [],
    correction: index === 14 ? "entry_work:kokoro" : "",
    boundary: index === 8 ? "copyright:no_lyrics" : ""
  }));
}

async function validateEvalFiles(failures) {
  const files = (await readdir(EVAL_DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const expected = new Set([
    "visible_four_turn_ui.jsonl",
    "internal_sixteen_turn_compact_state.jsonl",
    "memory_promotion_boundary.jsonl"
  ]);
  for (const file of expected) {
    if (!files.includes(file)) failure(failures, "missing_eval_file", { file });
  }

  const counts = {};
  for (const file of files) {
    const text = await readFile(resolve(EVAL_DIR, file), "utf8");
    const rows = parseJsonl(text, file, failures);
    counts[file] = rows.length;
    if (rows.length < 10) failure(failures, "eval_file_under_minimum", { file, rows: rows.length });
    for (const row of rows) {
      if (!row.id) failure(failures, "eval_missing_id", { file });
      if (!Array.isArray(row.turns)) failure(failures, "eval_missing_turns", { file, id: row.id });
      if (!row.prompt) failure(failures, "eval_missing_prompt", { file, id: row.id });
      if (!hasAnyGuard(row)) failure(failures, "eval_missing_negative_guard", { file, id: row.id });
      if (file === "visible_four_turn_ui.jsonl" && row.expected_visible_exchange_turns_max !== 4) {
        failure(failures, "visible_eval_wrong_limit", { file, id: row.id });
      }
      if (
        file === "internal_sixteen_turn_compact_state.jsonl" &&
        (row.expected_internal_compact_exchange_turns_max !== 16 || row.expected_raw_runtime_exchange_turns_max !== 4)
      ) {
        failure(failures, "compact_eval_wrong_limits", { file, id: row.id });
      }
      if (/逐字复原第?1轮|第17轮仍能绑定第1轮/.test(row.notes || "") && !/不能|除非/.test(row.notes || "")) {
        failure(failures, "eval_expects_raw_recall_beyond_window", { file, id: row.id });
      }
    }
  }
  return counts;
}

async function validateDocs(failures) {
  const text = await readFile(DOC_PATH, "utf8");
  const required = [
    "The public UI shows only the latest 4 exchange turns.",
    "16-turn design window is for internal compact-state extraction only",
    "上线 UI 只展示最近 4 轮对话",
    "16 轮只是内部 compact state 的设计/训练上限",
    "Visible history and usable compact state are not the same thing."
  ];
  for (const phrase of required) {
    if (!text.includes(phrase)) failure(failures, "doc_missing_required_phrase", { phrase });
  }
  const forbiddenClaims = [
    /public UI shows (?:the )?latest 16/i,
    /UI displays (?:the )?latest 16/i,
    /页面.{0,12}显示.{0,8}16\s*轮/,
    /上线 UI.{0,12}展示.{0,8}16\s*轮/
  ];
  for (const pattern of forbiddenClaims) {
    if (pattern.test(text)) failure(failures, "doc_claims_ui_shows_16", { pattern: String(pattern) });
  }
}

function validateRuntimeFunctions(failures) {
  const turns = makeSyntheticTurns(20);
  const visible = visibleTurnsFromState({ contextTurns: turns });
  const raw = rawRuntimeTurnsFromState({ contextTurns: turns });
  const extraction = compactExtractionTurnsFromState({ contextTurns: turns });
  const compact = buildCompactStateFromTurns(extraction);
  const packet = buildRuntimePacket({
    query: "测试 packet",
    visibleTurns: turns,
    compactState: compact,
    cultureCards: Array.from({ length: 30 }, (_, index) => ({ id: `culture_${index}` })),
    personaCards: Array.from({ length: 20 }, (_, index) => ({ id: `persona_${index}` })),
    methodCards: Array.from({ length: 12 }, (_, index) => ({ id: `method_${index}` })),
    memoryAtoms: Array.from({ length: 12 }, (_, index) => ({ id: `memory_${index}` })),
    reflectionCards: Array.from({ length: 12 }, (_, index) => ({ id: `reflection_${index}` })),
    solverPlan: { solver: "arithmetic" },
    verifierRules: { privacy: "hard", copyright: "hard" }
  });

  if (CONTEXT_WINDOWS.maxVisibleExchangeTurns !== 4) failure(failures, "constant_visible_not_4");
  if (CONTEXT_WINDOWS.maxRawExchangeTurnsInRuntimePacket !== 4) failure(failures, "constant_raw_not_4");
  if (CONTEXT_WINDOWS.maxInternalCompactExchangeTurns !== 16) failure(failures, "constant_compact_not_16");
  if (visible.length > 4) failure(failures, "visible_turns_exceed_4", { count: visible.length });
  if (raw.length > 4) failure(failures, "raw_turns_exceed_4", { count: raw.length });
  if (extraction.length > 16) failure(failures, "compact_extraction_exceeds_16", { count: extraction.length });
  if (compact.turn_count_window > 16) failure(failures, "compact_turn_count_exceeds_16", { count: compact.turn_count_window });
  if (compactStateContainsRawText(compact)) failure(failures, "compact_contains_raw_text_fields");
  if (compactStateContainsPrivateValue(compact)) failure(failures, "compact_contains_private_value");
  if (packet.raw_turns.length > 4) failure(failures, "packet_raw_turns_exceed_4", { count: packet.raw_turns.length });
  if (packet.compact_state.turn_count_window > 16) failure(failures, "packet_compact_turn_count_exceeds_16");
  if (!packet.verifier_rules?.privacy || !packet.verifier_rules?.copyright) failure(failures, "packet_dropped_verifier_rules");
  if (!packet.solver_plan?.solver) failure(failures, "packet_dropped_solver_plan");
  if ((packet.culture_cards || []).length > CONTEXT_WINDOWS.maxCultureCards) failure(failures, "packet_too_many_culture_cards");
}

async function validateSourceText(failures) {
  const files = [
    "web/app.js",
    "scripts/dialog_runtime.mjs",
    "web/debug_report.js",
    "web/compact_context.js"
  ];
  for (const file of files) {
    const text = await readFile(resolve(ROOT, file), "utf8");
    if (file !== "web/compact_context.js" && /REASONING_CONTEXT_TURN_LIMIT\s*=\s*12/.test(text)) {
      failure(failures, "legacy_reasoning_limit_12", { file });
    }
  }
  const debugText = await readFile(resolve(ROOT, "web/debug_report.js"), "utf8");
  if (/transcript\.slice\(-12\)/.test(debugText)) failure(failures, "debug_report_exports_12_raw_turns");
}

async function main() {
  const failures = [];
  await validateDocs(failures);
  const evalCounts = await validateEvalFiles(failures);
  validateRuntimeFunctions(failures);
  await validateSourceText(failures);

  const report = {
    ok: failures.length === 0,
    constants: CONTEXT_WINDOWS,
    eval_counts: evalCounts,
    failures
  };
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
