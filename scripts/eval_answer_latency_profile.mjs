#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ANSWER_LATENCY_PROFILE,
  clampThinkingProfile,
  selectThinkingProfile
} from "../web/thinking_profile.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = resolve(ROOT, "evals/r17_latency/answer_sla.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/r17_answer_latency_report.json");

function parseJsonl(text) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`answer_sla.jsonl:${index + 1}: ${error.message}`);
      }
    });
}

function checkRow(row) {
  const failures = [];
  const profile = clampThinkingProfile(
    selectThinkingProfile({
      query: row.query,
      taskType: row.task_type,
      runtimeProfile: row.runtime_profile,
      webgpuAvailable: row.webgpu_available
    })
  );

  if (profile.name !== row.expected_profile) {
    failures.push({ code: "wrong_profile", expected: row.expected_profile, actual: profile.name });
  }
  if (profile.delayMs > row.max_delay_ms) {
    failures.push({ code: "delay_over_case_max", expected: `<=${row.max_delay_ms}`, actual: profile.delayMs });
  }
  if (profile.delayMs > row.answer_sla_ms || profile.targetMs > row.answer_sla_ms) {
    failures.push({ code: "profile_over_answer_sla", expected: `<=${row.answer_sla_ms}`, actual: { delayMs: profile.delayMs, targetMs: profile.targetMs } });
  }
  if (profile.answerSlaMs !== ANSWER_LATENCY_PROFILE.answerSlaMsLoadedPage) {
    failures.push({ code: "wrong_global_sla", expected: ANSWER_LATENCY_PROFILE.answerSlaMsLoadedPage, actual: profile.answerSlaMs });
  }
  if (row.must_not_expose_chain_of_thought && profile.thinkingNotChainOfThought !== true) {
    failures.push({ code: "thinking_cot_not_blocked" });
  }
  if (row.expected_fallback && profile.fallbackRequired !== true) {
    failures.push({ code: "missing_fallback_marker" });
  }

  return {
    id: row.id,
    passed: failures.length === 0,
    failures,
    observed: {
      profile: profile.name,
      mode: profile.mode,
      delayMs: profile.delayMs,
      targetMs: profile.targetMs,
      reason: profile.reason,
      fallbackRequired: Boolean(profile.fallbackRequired)
    }
  };
}

async function main() {
  const rows = parseJsonl(await readFile(INPUT, "utf8"));
  const results = rows.map(checkRow);
  const failed = results.filter((row) => !row.passed);
  const byProfile = results.reduce((acc, row) => {
    const key = row.observed.profile;
    acc[key] ||= { total: 0, failed: 0, maxDelayMs: 0 };
    acc[key].total += 1;
    if (!row.passed) acc[key].failed += 1;
    acc[key].maxDelayMs = Math.max(acc[key].maxDelayMs, row.observed.delayMs);
    return acc;
  }, {});
  const maxDelayMs = Math.max(...results.map((row) => row.observed.delayMs));
  const report = {
    ok: failed.length === 0,
    total: rows.length,
    passed: rows.length - failed.length,
    failed: failed.length,
    answer_sla_ms_loaded_page: ANSWER_LATENCY_PROFILE.answerSlaMsLoadedPage,
    max_observed_delay_ms: maxDelayMs,
    visible_thinking_allowed: ANSWER_LATENCY_PROFILE.visibleThinkingAllowed,
    thinking_not_chain_of_thought: ANSWER_LATENCY_PROFILE.thinkingNotChainOfThought,
    by_profile: byProfile,
    failures: failed.slice(0, 50)
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
