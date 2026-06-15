#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createDialogRuntime, answerDialogPrompt } from "./dialog_runtime.mjs";
import {
  buildInternalSessionMemory,
  buildModelRuntimePacket,
  internalRuntimeTurnsFromSession,
  modelUsableTurnsFromSession,
  visibleUiTurnsFromSession
} from "../web/internal_session_memory.js";
import { clampThinkingProfile, selectThinkingProfile } from "../web/thinking_profile.js";
import { selectInferenceBackend } from "../web/webgpu_capability.js";
import { createBrowserInferenceAdapter } from "../web/browser_inference_adapters.js";
import { verifyDraft } from "../web/draft_verifier.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVAL_DIR = resolve(ROOT, "evals/r17_webgpu_memory");
const REPORT = resolve(ROOT, "artifacts/training_os/r17_webgpu_memory_runtime_report.json");
const FORBIDDEN = /日本文学不要只读情节|城市、青春和历史|你要问哪一边|你需要提问|\/Users\/|完整歌词如下|根据你的文件|according to your/i;

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

async function loadRows() {
  const files = (await readdir(EVAL_DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const rows = [];
  for (const file of files) {
    const parsed = parseJsonl(await readFile(resolve(EVAL_DIR, file), "utf8"), file);
    for (const row of parsed) rows.push({ ...row, file });
  }
  return rows;
}

function includesAny(text, patterns = []) {
  return patterns.some((item) => item && String(text).includes(item));
}

async function checkBlackbox(row) {
  const runtime = createDialogRuntime();
  const result = await answerDialogPrompt(row.prompt, runtime, { withThinkingDelay: false });
  const failures = [];
  if (result.answerMs > row.max_answer_ms) failures.push("answer_sla_violation");
  if (FORBIDDEN.test(result.answer) || includesAny(result.answer, row.must_not_include || [])) failures.push("forbidden_answer_surface");
  if (result.answer.length > 520) failures.push("answer_too_long");
  return { observed: { answer: result.answer, answer_ms: result.answerMs, route: result.route, intent: result.intent }, failures };
}

async function checkWebgpuFallback(row) {
  const selection = selectInferenceBackend({
    preferWebGpu: true,
    runtimeProfile: row.runtime_profile,
    answerSlaMs: row.answer_sla_ms,
    capabilities: row.capabilities
  });
  const adapter = await createBrowserInferenceAdapter({
    preferWebGpu: true,
    runtimeProfile: row.runtime_profile,
    capabilities: row.capabilities
  });
  const classified = await adapter.classify({ query: "罗大佑和李宗盛差在哪？" });
  const failures = [];
  if (selection.recommendedBackend !== row.expected_backend) failures.push("wrong_backend_selection");
  if (!row.capabilities.webgpu.available && selection.recommendedProfile !== row.expected_profile_when_no_webgpu) {
    failures.push("wrong_profile_degradation");
  }
  if (adapter.metrics().cloudCalls !== 0) failures.push("cloud_call_detected");
  if (!classified.ok && row.expected_backend !== "none") failures.push("adapter_classification_failed");
  return { observed: { selection, adapter: adapter.metrics(), classified }, failures };
}

function checkInternalMemory(row) {
  const session = { contextTurns: row.turns || [] };
  const visible = visibleUiTurnsFromSession(session);
  const internal = internalRuntimeTurnsFromSession(session);
  const modelUsable = modelUsableTurnsFromSession(session);
  const memory = buildInternalSessionMemory(session);
  const packet = buildModelRuntimePacket({
    query: row.prompt,
    session,
    compactState: {},
    cards: [],
    solvers: { deterministic: true },
    verifierRules: { privacy: "hard", copyright: "hard", source: "hard" }
  });
  const surface = JSON.stringify({ visible, packet_visible: packet.visible_turns, memory, packet });
  const failures = [];
  if (visible.length > row.expected_visible_exchange_turns_max) failures.push("visible_ui_leak");
  if (internal.length > row.expected_internal_exchange_turns_max) failures.push("internal_memory_exceeds_16");
  if (modelUsable.length > row.expected_model_usable_exchange_turns_max) failures.push("model_context_exceeds_16");
  if (!packet.verifier_rules?.privacy || !packet.verifier_rules?.copyright) failures.push("verifier_rules_dropped");
  if (includesAny(surface, row.must_not_include || [])) failures.push("sensitive_internal_memory_leak");
  return { observed: { visible: visible.length, internal: internal.length, model_usable: modelUsable.length, turn_count_window: memory.turn_count_window }, failures };
}

function checkSla(row) {
  const profile = clampThinkingProfile(
    selectThinkingProfile({
      query: row.query,
      taskType: row.task_type,
      runtimeProfile: row.runtime_profile,
      webgpuAvailable: row.webgpu_available
    })
  );
  const failures = [];
  if (profile.delayMs > row.max_delay_ms) failures.push("delay_exceeds_sla");
  if (profile.targetMs > row.max_target_ms) failures.push("target_exceeds_sla");
  if ((row.runtime_profile === "personal_200m" || row.runtime_profile === "full") && !row.webgpu_available && !profile.fallbackRequired) {
    failures.push("missing_full_profile_fallback");
  }
  return { observed: profile, failures };
}

function checkGuard(row) {
  const result = verifyDraft({
    query: row.query,
    draft: row.draft,
    source: row.source,
    solverResult: row.solver_result,
    trace: { task_type: row.source, question_type: row.question_type || "" }
  });
  const failures = [];
  if (result.verdict !== row.expected_verdict) failures.push("wrong_verifier_verdict");
  if ((row.expected_reason_any || []).length > 0 && !row.expected_reason_any.some((reason) => result.reasons.includes(reason))) {
    failures.push("missing_expected_reject_reason");
  }
  return { observed: result, failures };
}

async function checkRow(row) {
  if (row.group === "blackbox_generalization") return checkBlackbox(row);
  if (row.group === "webgpu_fallback") return checkWebgpuFallback(row);
  if (row.group === "internal_memory_binding") return checkInternalMemory(row);
  if (row.group === "personal_profile_sla") return checkSla(row);
  if (row.group === "source_privacy_guard") return checkGuard(row);
  return { observed: {}, failures: ["unknown_group"] };
}

async function main() {
  const rows = await loadRows();
  const results = [];
  for (const row of rows) {
    const result = await checkRow(row);
    results.push({ id: row.id, file: row.file, group: row.group, passed: result.failures.length === 0, ...result });
  }
  const failed = results.filter((row) => !row.passed);
  const report = {
    ok: failed.length === 0,
    total: rows.length,
    passed: rows.length - failed.length,
    failed: failed.length,
    by_group: results.reduce((acc, row) => {
      acc[row.group] ||= { total: 0, failed: 0 };
      acc[row.group].total += 1;
      if (!row.passed) acc[row.group].failed += 1;
      return acc;
    }, {}),
    failures: failed.slice(0, 60)
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
