#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildInternalSessionMemory,
  buildModelRuntimePacket,
  internalRuntimeTurnsFromSession,
  modelUsableTurnsFromSession,
  SESSION_MEMORY_WINDOWS,
  visibleUiTurnsFromSession
} from "../web/internal_session_memory.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVAL_DIR = resolve(ROOT, "evals/r17_memory");
const REPORT = resolve(ROOT, "artifacts/training_os/r17_memory_contract_report.json");

function parseJsonl(text, file) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${file}:${index + 1}: ${error.message}`);
      }
    });
}

async function loadCases() {
  const files = (await readdir(EVAL_DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const rows = [];
  for (const file of files) {
    rows.push(...parseJsonl(await readFile(resolve(EVAL_DIR, file), "utf8"), file).map((row) => ({ ...row, file })));
  }
  return rows;
}

function containsAny(text, items) {
  return (items || []).some((item) => item && text.includes(item));
}

function checkCase(row) {
  const failures = [];
  const session = { contextTurns: row.turns || [] };
  const visible = visibleUiTurnsFromSession(session);
  const internal = internalRuntimeTurnsFromSession(session);
  const modelUsable = modelUsableTurnsFromSession(session);
  const memory = buildInternalSessionMemory(session);
  const packet = buildModelRuntimePacket({
    query: row.prompt,
    session,
    compactState: row.compact_state || {},
    cards: Array.from({ length: 20 }, (_, index) => ({ id: `card_${index}` })),
    solvers: { deterministic: true },
    verifierRules: { privacy: "hard", copyright: "hard", source: "hard" }
  });
  const serialized = JSON.stringify({ visible, internal, modelUsable, memory, packet });

  if (visible.length > SESSION_MEMORY_WINDOWS.visibleUiExchangeTurns) failures.push("visible_turns_exceed_4");
  if (internal.length > SESSION_MEMORY_WINDOWS.internalRuntimeExchangeTurns) failures.push("internal_turns_exceed_16");
  if (modelUsable.length > SESSION_MEMORY_WINDOWS.modelUsableSessionExchangeTurns) failures.push("model_usable_turns_exceed_16");
  if (packet.visible_turns.length > 4) failures.push("packet_visible_exceeds_4");
  if (packet.internal_session_memory.turn_count_window > 16) failures.push("packet_internal_exceeds_16");
  if (!packet.verifier_rules?.privacy || !packet.verifier_rules?.copyright) failures.push("packet_dropped_verifier_rules");
  if (!packet.solvers?.deterministic) failures.push("packet_dropped_solvers");

  if (row.file === "visible_4_turn_ui.jsonl" && row.expected_visible_exchange_turns_max !== 4) {
    failures.push("visible_eval_wrong_limit");
  }
  if (row.file === "internal_16_turn_runtime_memory.jsonl") {
    if (row.expected_internal_runtime_exchange_turns_max !== 16) failures.push("internal_eval_wrong_limit");
    if (row.expected_model_usable_exchange_turns_max !== 16) failures.push("model_usable_eval_wrong_limit");
    if (row.expected_visible_exchange_turns_max !== 4) failures.push("visible_eval_wrong_limit");
  }
  const visibleSerialized = JSON.stringify({ visible, packet_visible_turns: packet.visible_turns });
  if (row.file === "visible_4_turn_ui.jsonl" && containsAny(visibleSerialized, row.must_not_include || [])) {
    failures.push("must_not_include_in_visible_surface");
  }
  if (/\/Users\/|fake@example\.com|12345678901/.test(serialized)) failures.push("sensitive_value_leak");

  return {
    id: row.id,
    file: row.file,
    passed: failures.length === 0,
    failures,
    observed: {
      visible_turns: visible.length,
      internal_turns: internal.length,
      model_usable_turns: modelUsable.length,
      entities: memory.entities,
      works: memory.works,
      domains: memory.domains,
      corrections: memory.corrections.length,
      boundaries: memory.boundaries.length,
      redactions: memory.redaction_count
    }
  };
}

async function main() {
  const rows = await loadCases();
  const results = rows.map(checkCase);
  const failed = results.filter((row) => !row.passed);
  const report = {
    ok: failed.length === 0,
    total: rows.length,
    passed: rows.length - failed.length,
    failed: failed.length,
    constants: SESSION_MEMORY_WINDOWS,
    failures: failed.slice(0, 50),
    by_file: results.reduce((acc, row) => {
      acc[row.file] ||= { total: 0, failed: 0 };
      acc[row.file].total += 1;
      if (!row.passed) acc[row.file].failed += 1;
      return acc;
    }, {})
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
