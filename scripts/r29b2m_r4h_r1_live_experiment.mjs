#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDeepSeekRequest, HybridAdapterError } from "../src/hybrid_runtime/deepseek_adapter.ts";
import { LiveDeepSeekAdapter } from "../src/hybrid_runtime/live_deepseek_adapter.ts";
import { compileStylePolicy, compileStylePolicyAblation } from "../src/hybrid_runtime/style_policy_compiler.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).map((value, index, all) => value.startsWith("--") ? [value, all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : true] : ["", value]));
const PHASE = String(args.get("--phase") || "smoke");
const ARTIFACT_ROOT = resolve(ROOT, String(args.get("--artifact-root") || "artifacts/r29b2m_r4h_r1"));
const REPORT_ROOT = join(ARTIFACT_ROOT, "reports");
const RAW_ROOT = join(ARTIFACT_ROOT, "raw");
const RECORDS_PATH = join(RAW_ROOT, "live_records.json");
const STATE_PATH = join(ARTIFACT_ROOT, "live_state.json");
const POLICY = JSON.parse(await readFile(join(ROOT, "config/r29b2m_r4h_live_policy.json"), "utf8"));
const PRICING = JSON.parse(await readFile(join(ROOT, "config/deepseek_pricing_snapshot.json"), "utf8"));
const SYSTEM_PROMPT = await readFile(join(ROOT, "prompts/hybrid_dialogue_system_v1.txt"), "utf8");
const FIXTURES = (await readFile(join(ROOT, POLICY.public_fixture_path), "utf8")).trim().split(/\n/).map((line) => JSON.parse(line));
const BY_FAMILY = Map.groupBy(FIXTURES, (row) => row.family);
const ADAPTER = new LiveDeepSeekAdapter();
const CNY_PER_USD_GUARD = 10;

if (!process.env.DEEPSEEK_API_KEY) throw new Error("deepseek_api_key_unavailable");
if (!['smoke', 'ablation'].includes(PHASE)) throw new Error("invalid_live_phase");
if (POLICY.maximum_total_requests !== 90 || POLICY.maximum_input_tokens !== 300000 || POLICY.maximum_output_tokens !== 30000 || POLICY.maximum_estimated_cost_cny !== 5 || POLICY.concurrency !== 1) {
  throw new Error("live_policy_hard_limit_mismatch");
}

await mkdir(REPORT_ROOT, { recursive: true });
await mkdir(RAW_ROOT, { recursive: true });

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

function percentile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

function requestCostUsd(record) {
  return (
    record.cache_hit_tokens * PRICING.input_cache_hit +
    record.cache_miss_tokens * PRICING.input_cache_miss +
    record.output_tokens * PRICING.output
  ) / PRICING.unit_tokens;
}

function aggregate(records) {
  const completed = records.filter((record) => record.request_started);
  const totals = completed.reduce((sum, record) => ({
    requests: sum.requests + 1,
    input: sum.input + Number(record.input_tokens || 0),
    output: sum.output + Number(record.output_tokens || 0),
    cacheHit: sum.cacheHit + Number(record.cache_hit_tokens || 0),
    cacheMiss: sum.cacheMiss + Number(record.cache_miss_tokens || 0),
    usd: sum.usd + Number(record.estimated_cost_usd || 0),
  }), { requests: 0, input: 0, output: 0, cacheHit: 0, cacheMiss: 0, usd: 0 });
  return { ...totals, cnyGuard: totals.usd * CNY_PER_USD_GUARD };
}

function enforceBeforeStart(records, request) {
  const totals = aggregate(records);
  const conservativeInputTokenUpperBound = Buffer.byteLength(JSON.stringify(request), "utf8");
  const conservativeUsdAfter = totals.usd + (
    conservativeInputTokenUpperBound * PRICING.input_cache_miss + request.max_tokens * PRICING.output
  ) / PRICING.unit_tokens;
  if (totals.requests >= POLICY.maximum_total_requests) throw new Error("maximum_total_requests_reached");
  if (totals.input + conservativeInputTokenUpperBound > POLICY.maximum_input_tokens) throw new Error("maximum_input_tokens_reached");
  if (totals.output + request.max_tokens > POLICY.maximum_output_tokens) throw new Error("maximum_output_tokens_reached");
  if (conservativeUsdAfter * CNY_PER_USD_GUARD > POLICY.maximum_estimated_cost_cny) throw new Error("maximum_estimated_cost_cny_reached");
}

function latestUser(row) {
  return [...row.messages].reverse().find((message) => message.role === "user")?.content || "";
}

function safeError(error) {
  if (error instanceof HybridAdapterError) return {
    category: error.category,
    http_status: error.httpStatus,
    authentication_failed: error.httpStatus === 401,
    insufficient_balance: error.httpStatus === 402,
    timeout: error.category === "network_timeout" && error.httpStatus === null,
  };
  return { category: "live_harness_error", http_status: null, authentication_failed: false, insufficient_balance: false, timeout: false };
}

async function runRequest(records, spec) {
  const existing = records.find((record) => record.request_key === spec.requestKey);
  if (existing) return existing;
  const request = buildDeepSeekRequest(SYSTEM_PROMPT, spec.fixture.messages, spec.compiledSignal ?? null);
  assertRequestContract(request);
  enforceBeforeStart(records, request);
  const requestStart = performance.now();
  let firstMeaningfulAt = null;
  let content = "";
  let finishReason = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheHitTokens = 0;
  let cacheMissTokens = 0;
  let usagePresent = false;
  let validSse = false;
  let reasoningPresent = false;
  let toolCallCount = 0;
  let errorInfo = null;
  const abort = new AbortController();
  try {
    for await (const event of ADAPTER.stream(request, { turnId: spec.requestKey, signal: abort.signal, scenario: spec.phase })) {
      if (event.type === "content") {
        content += event.content;
        if (firstMeaningfulAt === null && /\S/u.test(event.content)) firstMeaningfulAt = performance.now();
      } else if (event.type === "reasoning_present") {
        reasoningPresent = true;
      } else if (event.type === "usage") {
        usagePresent = true;
        inputTokens = event.input_tokens;
        outputTokens = event.output_tokens;
        cacheHitTokens = event.cache_hit_tokens ?? 0;
        cacheMissTokens = event.cache_miss_tokens ?? Math.max(0, inputTokens - cacheHitTokens);
      } else if (event.type === "finish") {
        finishReason = event.finish_reason;
      } else if (event.type === "done") {
        validSse = true;
      }
    }
  } catch (error) {
    errorInfo = safeError(error);
    if (errorInfo.category === "tool_calls") toolCallCount = 1;
  }
  const streamEnd = performance.now();
  const record = {
    request_key: spec.requestKey,
    phase: spec.phase,
    case_id: spec.fixture.case_id,
    family: spec.fixture.family,
    pair_id: spec.pairId ?? null,
    arm: spec.arm ?? null,
    field_variant: spec.fieldVariant ?? null,
    order_index: spec.orderIndex ?? null,
    request_started: true,
    http_status: errorInfo === null ? 200 : errorInfo.http_status,
    api_success: errorInfo === null,
    valid_sse: validSse,
    non_empty_final_content: content.trim().length > 0,
    meaningful_first_token: firstMeaningfulAt !== null,
    tool_call_count: toolCallCount,
    unexpected_reasoning_content: reasoningPresent,
    timeout: errorInfo?.timeout ?? false,
    authentication_failed: errorInfo?.authentication_failed ?? false,
    insufficient_balance: errorInfo?.insufficient_balance ?? false,
    error_category: errorInfo?.category ?? null,
    request_count: 1,
    signal_latency_ms: spec.signalLatencyMs ?? 0,
    deepseek_ttft_ms: firstMeaningfulAt === null ? null : firstMeaningfulAt - requestStart,
    hybrid_ttft_ms: firstMeaningfulAt === null ? null : (spec.signalLatencyMs ?? 0) + firstMeaningfulAt - requestStart,
    completion_latency_ms: streamEnd - requestStart,
    hybrid_completion_latency_ms: (spec.signalLatencyMs ?? 0) + streamEnd - requestStart,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_hit_tokens: cacheHitTokens,
    cache_miss_tokens: cacheMissTokens,
    usage_present: usagePresent,
    finish_reason: finishReason,
    response: content,
    headers_recorded: false,
    authorization_recorded: false,
    raw_env_recorded: false,
  };
  record.estimated_cost_usd = requestCostUsd(record);
  records.push(record);
  await atomicJson(RECORDS_PATH, records);
  await writeState(records, `${spec.phase}:${spec.requestKey}`);
  console.log(JSON.stringify({ phase: spec.phase, request_key: spec.requestKey, completed_request_count: aggregate(records).requests, ok: requestPassed(record) }));
  return record;
}

function assertRequestContract(request) {
  if (request.model !== "deepseek-v4-flash") throw new Error("live_model_contract_mismatch");
  if (request.thinking?.type !== "disabled") throw new Error("thinking_not_disabled");
  if (request.stream !== true || request.stream_options?.include_usage !== true) throw new Error("stream_contract_mismatch");
  if (request.max_tokens > 192) throw new Error("max_tokens_too_high");
  if (Object.hasOwn(request, "tools") || Object.hasOwn(request, "tool_choice")) throw new Error("tools_not_allowed");
}

function requestPassed(record) {
  return record.api_success && record.valid_sse && record.non_empty_final_content && record.meaningful_first_token &&
    record.tool_call_count === 0 && record.request_count === 1 && !record.authentication_failed && !record.insufficient_balance &&
    !record.unexpected_reasoning_content && !record.timeout && record.usage_present && ["stop", "length"].includes(record.finish_reason);
}

async function writeState(records, state) {
  const totals = aggregate(records);
  await atomicJson(STATE_PATH, {
    campaign_id: "r29b2m_r4h_r1_secure_live_validation_v1",
    state,
    live_request_count: totals.requests,
    input_tokens: totals.input,
    output_tokens: totals.output,
    cache_hit_tokens: totals.cacheHit,
    cache_miss_tokens: totals.cacheMiss,
    estimated_cost_usd: totals.usd,
    estimated_cost_cny_conservative_upper_bound: totals.cnyGuard,
    maximum_total_requests: POLICY.maximum_total_requests,
    maximum_estimated_cost_cny: POLICY.maximum_estimated_cost_cny,
    key_present: true,
    key_value_logged: false,
    concurrency: 1,
  });
}

function familyRows(family, count, offset = 0) {
  const rows = BY_FAMILY.get(family) || [];
  if (rows.length < offset + count) throw new Error(`insufficient_fixture_family:${family}`);
  return rows.slice(offset, offset + count);
}

function pairSelection() {
  return [
    ...familyRows("ordinary_daily_conversation", 4, 1),
    ...familyRows("emotional_acknowledgement", 4, 1),
    ...familyRows("practical_daily_question", 5, 1),
    ...familyRows("rewrite_summary", 2, 1),
    ...familyRows("comparison_opinion", 2, 1),
    ...familyRows("logic_question", 5, 1),
    ...familyRows("philosophical_question", 5, 1),
    ...familyRows("uncertainty_clarification", 2, 1),
    ...familyRows("identity_privacy_boundary", 1, 1),
  ];
}

function randomizedArmOrder(caseId) {
  const first = createHash("sha256").update(caseId).digest()[0] % 2 === 0 ? "deepseek_only" : "hybrid_full";
  return first === "deepseek_only" ? ["deepseek_only", "hybrid_full"] : ["hybrid_full", "deepseek_only"];
}

async function runSmoke(records) {
  const smokeRows = [
    familyRows("ordinary_daily_conversation", 1)[0],
    familyRows("emotional_acknowledgement", 1)[0],
    familyRows("practical_daily_question", 1)[0],
    familyRows("logic_question", 1)[0],
    familyRows("philosophical_question", 1)[0],
    familyRows("identity_privacy_boundary", 1)[0],
  ];
  const phaseRecords = [];
  for (const fixture of smokeRows) {
    const signalStarted = performance.now();
    const compiled = compileStylePolicy(fixture.oracle_local_signal_packet, latestUser(fixture));
    const signalLatencyMs = performance.now() - signalStarted;
    const record = await runRequest(records, {
      requestKey: `smoke:${fixture.case_id}`,
      phase: "smoke",
      fixture,
      compiledSignal: compiled.instruction,
      signalLatencyMs,
    });
    phaseRecords.push(record);
    if (!requestPassed(record)) break;
  }
  const report = smokeReport(phaseRecords);
  await atomicJson(join(REPORT_ROOT, "live_smoke.json"), report);
  await atomicJson(join(REPORT_ROOT, "phase_boundary_after_smoke.json"), {
    phase: "LIVE_SMOKE",
    decision: report.passed ? "CONTINUE_TO_PAIRED_ABLATION" : "STOP_LIVE_VALIDATION",
    live_request_count: aggregate(records).requests,
    key_present: true,
    key_value_logged: false,
  });
  await writeState(records, report.passed ? "SMOKE_PASSED_AWAITING_ABLATION" : "BLOCKED_LIVE_API_CONFIGURATION");
  console.log(JSON.stringify({ phase: "LIVE_SMOKE_STATUS", passed: report.passed, request_count: report.request_count, decision: report.decision }));
  if (!report.passed) process.exitCode = 2;
}

function smokeReport(records) {
  const ttft = records.map((record) => record.deepseek_ttft_ms).filter(Number.isFinite);
  const completion = records.map((record) => record.completion_latency_ms).filter(Number.isFinite);
  const passed = records.length === 6 && records.every(requestPassed);
  return {
    LIVE_SMOKE_STATUS: passed ? "PASSED" : "FAILED",
    passed,
    key_present: true,
    key_value_logged: false,
    request_count: records.length,
    success_count: records.filter(requestPassed).length,
    failure_count: records.filter((record) => !requestPassed(record)).length,
    categories: records.map((record) => ({
      category: record.family,
      status: requestPassed(record) ? "PASSED" : "FAILED",
      TTFT_ms: record.deepseek_ttft_ms,
      completion_latency_ms: record.completion_latency_ms,
      input_tokens: record.input_tokens,
      output_tokens: record.output_tokens,
      finish_reason: record.finish_reason,
    })),
    aggregate: {
      TTFT_p50_ms: percentile(ttft, 0.5),
      TTFT_max_ms: ttft.length ? Math.max(...ttft) : null,
      completion_p50_ms: percentile(completion, 0.5),
      completion_max_ms: completion.length ? Math.max(...completion) : null,
      estimated_spend_usd: records.reduce((sum, record) => sum + record.estimated_cost_usd, 0),
      estimated_spend_cny_conservative_upper_bound: records.reduce((sum, record) => sum + record.estimated_cost_usd, 0) * CNY_PER_USD_GUARD,
    },
    authentication_failed: records.some((record) => record.authentication_failed),
    insufficient_balance: records.some((record) => record.insufficient_balance),
    secret_exposure: 0,
    unexpected_reasoning_content: records.filter((record) => record.unexpected_reasoning_content).length,
    timeout: records.filter((record) => record.timeout).length,
    decision: passed ? "CONTINUE_TO_PAIRED_ABLATION" : "STOP_LIVE_VALIDATION",
  };
}

async function runAblation(records) {
  const smoke = await readJson(join(REPORT_ROOT, "live_smoke.json"), {});
  if (smoke.passed !== true || aggregate(records).requests < 6) throw new Error("smoke_pass_required_before_ablation");
  const pairs = pairSelection();
  if (pairs.length !== 30) throw new Error("paired_selection_not_30");
  for (const fixture of pairs) {
    const signalStarted = performance.now();
    const compiled = compileStylePolicy(fixture.oracle_local_signal_packet, latestUser(fixture));
    const signalLatencyMs = performance.now() - signalStarted;
    const order = randomizedArmOrder(fixture.case_id);
    for (const [index, arm] of order.entries()) {
      const record = await runRequest(records, {
        requestKey: `paired:${fixture.case_id}:${arm}`,
        phase: "paired_ablation",
        fixture,
        pairId: fixture.case_id,
        arm,
        orderIndex: index,
        compiledSignal: arm === "hybrid_full" ? compiled.instruction : null,
        signalLatencyMs: arm === "hybrid_full" ? signalLatencyMs : 0,
      });
      if (!requestPassed(record)) return stopAblation(records, "paired_request_failed");
    }
  }

  const fieldCases = [
    ...pairs.filter((row) => row.family === "emotional_acknowledgement").slice(0, 2),
    pairs.find((row) => row.family === "practical_daily_question"),
    pairs.find((row) => row.family === "logic_question"),
    pairs.find((row) => row.family === "philosophical_question"),
    pairs.find((row) => row.family === "uncertainty_clarification"),
  ].filter(Boolean);
  if (fieldCases.length !== 6) throw new Error("field_ablation_selection_not_6");
  const variants = [
    { name: "minus_anchors", omit: new Set(["anchors"]) },
    { name: "minus_affect_and_emotional_rules", omit: new Set(["affect", "emotional_rules"]) },
    { name: "minus_style_and_avoid_flags", omit: new Set(["style", "avoid_flags"]) },
  ];
  for (const fixture of fieldCases) {
    for (const variant of variants) {
      const signalStarted = performance.now();
      const compiled = compileStylePolicyAblation(fixture.oracle_local_signal_packet, latestUser(fixture), variant.omit);
      const signalLatencyMs = performance.now() - signalStarted;
      const record = await runRequest(records, {
        requestKey: `field:${fixture.case_id}:${variant.name}`,
        phase: "field_ablation",
        fixture,
        pairId: fixture.case_id,
        arm: "hybrid_field_ablation",
        fieldVariant: variant.name,
        compiledSignal: compiled.instruction,
        signalLatencyMs,
      });
      if (!requestPassed(record)) return stopAblation(records, "field_request_failed");
    }
  }
  await buildBlindPackets(records, pairs, fieldCases);
  const totals = aggregate(records);
  await writeState(records, "ABLATION_COMPLETE_AWAITING_BLIND_REVIEW_AND_BROWSER");
  console.log(JSON.stringify({ phase: "ABLATION_COMPLETE", paired_cases: 30, paired_requests: 60, field_cases: 6, field_requests: 18, live_request_count: totals.requests }));
}

async function stopAblation(records, reason) {
  await writeState(records, "BLOCKED_LIVE_API_CONFIGURATION");
  await atomicJson(join(REPORT_ROOT, "ablation_stop.json"), { reason, live_request_count: aggregate(records).requests, key_value_logged: false });
  process.exitCode = 2;
}

async function buildBlindPackets(records, pairs, fieldCases) {
  const blindPairs = [];
  const armMap = [];
  for (const fixture of pairs) {
    const pairRecords = records.filter((record) => record.phase === "paired_ablation" && record.pair_id === fixture.case_id).sort((a, b) => a.order_index - b.order_index);
    if (pairRecords.length !== 2) throw new Error(`paired_record_count_mismatch:${fixture.case_id}`);
    blindPairs.push({
      pair_id: fixture.case_id,
      family: fixture.family,
      messages: fixture.messages,
      response_A: pairRecords[0].response,
      response_B: pairRecords[1].response,
      maximum_answer_characters: fixture.maximum_answer_characters,
      response_quality_rubric: fixture.response_quality_rubric,
    });
    armMap.push({ pair_id: fixture.case_id, response_A: pairRecords[0].arm, response_B: pairRecords[1].arm });
  }
  const fieldPacket = fieldCases.map((fixture) => ({
    case_id: fixture.case_id,
    family: fixture.family,
    messages: fixture.messages,
    full_packet_response: records.find((record) => record.phase === "paired_ablation" && record.pair_id === fixture.case_id && record.arm === "hybrid_full")?.response,
    variants: Object.fromEntries(records.filter((record) => record.phase === "field_ablation" && record.pair_id === fixture.case_id).map((record) => [record.field_variant, record.response])),
  }));
  await atomicJson(join(RAW_ROOT, "blind_pairs.json"), blindPairs);
  await atomicJson(join(RAW_ROOT, "arm_map.json"), armMap);
  await atomicJson(join(RAW_ROOT, "field_ablation_outputs.json"), fieldPacket);
  await atomicJson(join(REPORT_ROOT, "ablation_completion.json"), {
    paired_case_count: blindPairs.length,
    paired_request_count: blindPairs.length * 2,
    field_case_count: fieldPacket.length,
    field_request_count: fieldPacket.length * 3,
    reviewer_class: "codex_agent_live_hybrid_ablation_review_not_human",
    real_arm_identity_hidden_from_blind_packet: true,
    raw_outputs_ignored: true,
  });
}

const records = await readJson(RECORDS_PATH, []);
await writeState(records, PHASE === "smoke" ? "LIVE_SMOKE" : "PAIRED_ABLATION");
if (PHASE === "smoke") await runSmoke(records);
else await runAblation(records);
