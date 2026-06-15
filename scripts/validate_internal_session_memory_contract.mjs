#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SESSION_MEMORY_WINDOWS } from "../web/internal_session_memory.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = resolve(ROOT, "docs/internal_session_memory_contract.md");
const MODULE = resolve(ROOT, "web/internal_session_memory.js");
const APP = resolve(ROOT, "web/app.js");
const RUNTIME = resolve(ROOT, "scripts/dialog_runtime.mjs");
const EVAL_DIR = resolve(ROOT, "evals/r17_memory");
const REPORT = resolve(ROOT, "artifacts/training_os/internal_session_memory_contract_report.json");

function fail(failures, code, detail = {}) {
  failures.push({ code, ...detail });
}

function parseJsonl(text, file, failures) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        fail(failures, "json_parse_error", { file, line: index + 1, message: error.message });
        return null;
      }
    })
    .filter(Boolean);
}

async function checkDocs(failures) {
  const text = await readFile(DOC, "utf8");
  const required = [
    "The deployed runtime keeps a 16-exchange-turn internal session memory.",
    "The public UI displays only the latest 4 exchange turns.",
    "成品 runtime 内部保留最近 16 轮 exchange",
    "上线 UI 只展示最近 4 轮",
    "persistent_memory_requires_approval"
  ];
  for (const phrase of required) if (!text.includes(phrase)) fail(failures, "doc_missing_phrase", { phrase });
  if (
    /UI\s+(?:displays|shows|renders)\s+(?:the\s+)?(?:latest\s+)?16/i.test(text) ||
    /页面.*(?:展示|显示).*16\s*轮/.test(text)
  ) {
    fail(failures, "doc_claims_ui_displays_16");
  }
}

async function checkCode(failures) {
  if (SESSION_MEMORY_WINDOWS.visibleUiExchangeTurns !== 4) fail(failures, "visible_constant_not_4");
  if (SESSION_MEMORY_WINDOWS.internalRuntimeExchangeTurns !== 16) fail(failures, "internal_constant_not_16");
  if (SESSION_MEMORY_WINDOWS.modelUsableSessionExchangeTurns !== 16) fail(failures, "model_usable_constant_not_16");
  if (SESSION_MEMORY_WINDOWS.persistentMemoryRequiresApproval !== true) fail(failures, "persistent_approval_not_true");
  if (SESSION_MEMORY_WINDOWS.answerSlaMs !== 3000) fail(failures, "answer_sla_not_3000");

  const moduleText = await readFile(MODULE, "utf8");
  for (const fn of [
    "visibleUiTurnsFromSession",
    "internalRuntimeTurnsFromSession",
    "modelUsableTurnsFromSession",
    "truncateInternalSession",
    "redactSensitiveTurnText",
    "extractSessionEntities",
    "extractSessionWorks",
    "extractSessionCorrections",
    "extractSessionDomains",
    "buildInternalSessionMemory",
    "buildModelRuntimePacket"
  ]) {
    if (!moduleText.includes(`function ${fn}`) && !moduleText.includes(`function* ${fn}`)) {
      fail(failures, "missing_exported_function", { fn });
    }
  }

  const appText = await readFile(APP, "utf8");
  const runtimeText = await readFile(RUNTIME, "utf8");
  for (const [file, text] of [["web/app.js", appText], ["scripts/dialog_runtime.mjs", runtimeText]]) {
    if (!text.includes("buildInternalSessionMemory")) fail(failures, "runtime_not_using_internal_memory", { file });
    if (!text.includes("modelUsableSessionTurns")) fail(failures, "runtime_missing_model_usable_turns", { file });
    if (/VISIBLE_CONTEXT_TURN_LIMIT\s*=\s*16/.test(text)) fail(failures, "ui_limit_set_to_16", { file });
  }
}

async function checkEvals(failures) {
  const files = (await readdir(EVAL_DIR)).filter((file) => file.endsWith(".jsonl"));
  const minimums = {
    "visible_4_turn_ui.jsonl": 20,
    "internal_16_turn_runtime_memory.jsonl": 40,
    "persistent_memory_boundary.jsonl": 25
  };
  const counts = {};
  for (const [file, min] of Object.entries(minimums)) {
    if (!files.includes(file)) {
      fail(failures, "missing_eval_file", { file });
      continue;
    }
    const rows = parseJsonl(await readFile(resolve(EVAL_DIR, file), "utf8"), file, failures);
    counts[file] = rows.length;
    if (rows.length < min) fail(failures, "eval_under_minimum", { file, rows: rows.length, min });
    for (const row of rows) {
      if (!row.id) fail(failures, "eval_missing_id", { file });
      if (!Array.isArray(row.turns)) fail(failures, "eval_missing_turns", { file, id: row.id });
      if (!row.prompt) fail(failures, "eval_missing_prompt", { file, id: row.id });
      if (!Array.isArray(row.must_not_include)) fail(failures, "eval_missing_must_not_include", { file, id: row.id });
    }
  }
  return counts;
}

async function main() {
  const failures = [];
  await checkDocs(failures);
  await checkCode(failures);
  const eval_counts = await checkEvals(failures);
  const report = {
    ok: failures.length === 0,
    constants: SESSION_MEMORY_WINDOWS,
    eval_counts,
    failures
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
