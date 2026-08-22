#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDeepSeekRequest, HybridAdapterError } from "../src/hybrid_runtime/deepseek_adapter.ts";
import { deterministicLengthPolicy } from "../src/hybrid_runtime/dialogue_act_heuristic.ts";
import { LiveDeepSeekAdapter } from "../src/hybrid_runtime/live_deepseek_adapter.ts";
import { compileLocalSignalPacketV2 } from "../src/hybrid_runtime/local_signal_packet_v2_compiler.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).map((value, index, all) => value.startsWith("--") ? [value, all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : true] : ["", value]));
const PHASE = String(args.get("--phase") || "smoke");
const ARTIFACT_ROOT = resolve(ROOT, String(args.get("--artifact-root") || "artifacts/r29b2m_r4h_r2"));
const REPORT_ROOT = join(ARTIFACT_ROOT, "reports");
const RAW_ROOT = join(ARTIFACT_ROOT, "raw");
const RECORDS_PATH = join(RAW_ROOT, "live_records.json");
const STATE_PATH = join(ARTIFACT_ROOT, "live_state.json");
const POLICY = JSON.parse(await readFile(join(ROOT, "config/r29b2m_r4h_r2_live_policy.json"), "utf8"));
const PRICING = JSON.parse(await readFile(join(ROOT, "config/deepseek_pricing_snapshot.json"), "utf8"));
const SYSTEM_PROMPT = await readFile(join(ROOT, POLICY.system_prompt_path), "utf8");
const MANIFEST = JSON.parse(await readFile(join(ROOT, POLICY.manifest_path), "utf8"));
const FIXTURES = (await readFile(join(ROOT, POLICY.public_fixture_path), "utf8")).trim().split(/\r?\n/u).map((line) => JSON.parse(line));
const BY_ID = new Map(FIXTURES.map((row) => [row.case_id, row]));
const BY_FAMILY = Map.groupBy(FIXTURES, (row) => row.family);
const ADAPTER = new LiveDeepSeekAdapter();

if (!process.env.DEEPSEEK_API_KEY) throw new Error("deepseek_api_key_unavailable");
if (!["smoke", "paired"].includes(PHASE)) throw new Error("invalid_live_phase");
if (POLICY.maximum_total_requests !== 70 || POLICY.maximum_estimated_cost_cny !== 2 || POLICY.concurrency !== 1 || POLICY.field_ablation_requests !== 0) {
  throw new Error("live_policy_hard_limit_mismatch");
}
if (MANIFEST.paired_case_count !== 30 || MANIFEST.paired_case_ids.length !== 30) throw new Error("paired_manifest_not_30");

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

function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1))];
}

function requestCostUsd(record) {
  return (
    record.cache_hit_tokens * PRICING.input_cache_hit +
    record.cache_miss_tokens * PRICING.input_cache_miss +
    record.output_tokens * PRICING.output
  ) / PRICING.unit_tokens;
}

function aggregate(records) {
  return records.filter((record) => record.request_started).reduce((sum, record) => ({
    requests: sum.requests + 1,
    input: sum.input + Number(record.input_tokens || 0),
    output: sum.output + Number(record.output_tokens || 0),
    cacheHit: sum.cacheHit + Number(record.cache_hit_tokens || 0),
    cacheMiss: sum.cacheMiss + Number(record.cache_miss_tokens || 0),
    usd: sum.usd + Number(record.estimated_cost_usd || 0),
  }), { requests: 0, input: 0, output: 0, cacheHit: 0, cacheMiss: 0, usd: 0 });
}

function enforceBeforeStart(records, request) {
  const totals = aggregate(records);
  const conservativeInputUpperBound = Buffer.byteLength(JSON.stringify(request), "utf8");
  const conservativeUsdAfter = totals.usd + (
    conservativeInputUpperBound * PRICING.input_cache_miss + request.max_tokens * PRICING.output
  ) / PRICING.unit_tokens;
  if (totals.requests >= POLICY.maximum_total_requests) throw new Error("maximum_total_requests_reached");
  if (totals.input + conservativeInputUpperBound > POLICY.maximum_input_tokens) throw new Error("maximum_input_tokens_reached");
  if (totals.output + request.max_tokens > POLICY.maximum_output_tokens) throw new Error("maximum_output_tokens_reached");
  if (conservativeUsdAfter * POLICY.cny_per_usd_guard > POLICY.maximum_estimated_cost_cny) throw new Error("maximum_estimated_cost_cny_reached");
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

function buildRequest(fixture, compiledSignal) {
  const length = deterministicLengthPolicy(latestUser(fixture));
  return {
    request: buildDeepSeekRequest(`${SYSTEM_PROMPT.trim()}\n\n${length.instruction}`, fixture.messages, compiledSignal),
    deterministic_length_class: length.dialogue_class,
    deterministic_maximum_chinese_characters: length.maximum_chinese_characters,
  };
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
    campaign_id: POLICY.campaign_id,
    state,
    live_request_count: totals.requests,
    input_tokens: totals.input,
    output_tokens: totals.output,
    cache_hit_tokens: totals.cacheHit,
    cache_miss_tokens: totals.cacheMiss,
    estimated_cost_usd: totals.usd,
    estimated_cost_cny_conservative_upper_bound: totals.usd * POLICY.cny_per_usd_guard,
    maximum_total_requests: POLICY.maximum_total_requests,
    maximum_estimated_cost_cny: POLICY.maximum_estimated_cost_cny,
    key_present: true,
    key_value_logged: false,
    concurrency: 1,
    field_ablation_requests: 0,
    signal_training_performed: false,
  });
}

async function runRequest(records, spec) {
  const existing = records.find((record) => record.request_key === spec.requestKey);
  if (existing) return existing;
  const built = buildRequest(spec.fixture, spec.compiledSignal ?? null);
  assertRequestContract(built.request);
  enforceBeforeStart(records, built.request);
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
    for await (const event of ADAPTER.stream(built.request, { turnId: spec.requestKey, signal: abort.signal, scenario: spec.phase })) {
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
    order_index: spec.orderIndex ?? null,
    randomized_order_hash: spec.orderHash ?? null,
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
    deterministic_length_class: built.deterministic_length_class,
    deterministic_maximum_chinese_characters: built.deterministic_maximum_chinese_characters,
    local_packet_fields: spec.arm === "deepseek_only" ? [] : ["anchors", "style"],
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

function smokeSelection() {
  return [
    BY_FAMILY.get("ordinary_daily_conversation")?.[0],
    BY_FAMILY.get("emotional_acknowledgement")?.[0],
    BY_FAMILY.get("practical_daily_question")?.[0],
    BY_FAMILY.get("logic_question")?.[0],
    BY_FAMILY.get("philosophical_question")?.[0],
    BY_FAMILY.get("identity_privacy_boundary")?.[0],
  ].filter(Boolean);
}

function compileFixture(fixture) {
  const started = performance.now();
  const compiled = compileLocalSignalPacketV2(fixture.oracle_local_signal_packet_v2, latestUser(fixture));
  deterministicLengthPolicy(latestUser(fixture));
  return { compiled, signalLatencyMs: performance.now() - started };
}

async function runSmoke(records) {
  const selected = smokeSelection();
  if (selected.length !== 6) throw new Error("smoke_selection_not_6");
  const phaseRecords = [];
  for (const fixture of selected) {
    const { compiled, signalLatencyMs } = compileFixture(fixture);
    const record = await runRequest(records, {
      requestKey: `v2-smoke:${fixture.case_id}`,
      phase: "v2_smoke",
      fixture,
      arm: "hybrid_v2",
      compiledSignal: compiled.instruction,
      signalLatencyMs,
    });
    phaseRecords.push(record);
    if (!requestPassed(record)) break;
  }
  const ttft = phaseRecords.map((record) => record.hybrid_ttft_ms).filter(Number.isFinite);
  const completion = phaseRecords.map((record) => record.hybrid_completion_latency_ms).filter(Number.isFinite);
  const passed = phaseRecords.length === 6 && phaseRecords.every(requestPassed);
  const report = {
    LIVE_SMOKE_V2_STATUS: passed ? "PASSED" : "FAILED",
    passed,
    request_count: phaseRecords.length,
    success_count: phaseRecords.filter(requestPassed).length,
    failure_count: phaseRecords.filter((record) => !requestPassed(record)).length,
    categories: ["ordinary", "emotional", "practical", "logic", "philosophy", "boundary"].map((category, index) => ({
      category,
      case_id: phaseRecords[index]?.case_id ?? null,
      status: phaseRecords[index] && requestPassed(phaseRecords[index]) ? "PASSED" : "FAILED",
      TTFT_ms: phaseRecords[index]?.hybrid_ttft_ms ?? null,
      completion_latency_ms: phaseRecords[index]?.hybrid_completion_latency_ms ?? null,
      input_tokens: phaseRecords[index]?.input_tokens ?? 0,
      output_tokens: phaseRecords[index]?.output_tokens ?? 0,
      finish_reason: phaseRecords[index]?.finish_reason ?? null,
    })),
    aggregate: {
      TTFT_p50_ms: percentile(ttft, 0.5),
      TTFT_max_ms: ttft.length ? Math.max(...ttft) : null,
      completion_p50_ms: percentile(completion, 0.5),
      completion_max_ms: completion.length ? Math.max(...completion) : null,
    },
    one_request_per_turn: phaseRecords.every((record) => record.request_count === 1),
    thinking_disabled: phaseRecords.every((record) => !record.unexpected_reasoning_content),
    tools_disabled: phaseRecords.every((record) => record.tool_call_count === 0),
    packet_fields: ["anchors", "style"],
    unsupported_packet_content: 0,
    secret_exposure: 0,
    decision: passed ? "CONTINUE_TO_PRIMARY_PAIRED_AB" : "BLOCKED_HYBRID_V2_CONFIGURATION",
  };
  await atomicJson(join(REPORT_ROOT, "live_smoke_v2.json"), report);
  await writeState(records, passed ? "SMOKE_V2_PASSED_AWAITING_PAIRED" : "BLOCKED_HYBRID_V2_CONFIGURATION");
  if (!passed) process.exitCode = 2;
}

function pairedSpecs() {
  const specs = [];
  for (const caseId of MANIFEST.paired_case_ids) {
    const fixture = BY_ID.get(caseId);
    if (!fixture) throw new Error(`missing_paired_fixture:${caseId}`);
    const { compiled, signalLatencyMs } = compileFixture(fixture);
    for (const arm of ["deepseek_only", "hybrid_v2"]) {
      const requestKey = `v2-paired:${caseId}:${arm}`;
      const orderHash = createHash("sha256").update(`r29b2m-r4h-r2-order:${requestKey}`).digest("hex");
      specs.push({
        requestKey,
        phase: "v2_paired_ab",
        fixture,
        pairId: caseId,
        arm,
        compiledSignal: arm === "hybrid_v2" ? compiled.instruction : null,
        signalLatencyMs: arm === "hybrid_v2" ? signalLatencyMs : 0,
        orderHash,
      });
    }
  }
  return specs.sort((left, right) => left.orderHash.localeCompare(right.orderHash)).map((spec, index) => ({ ...spec, orderIndex: index }));
}

async function buildBlindPackets(records) {
  const blindPairs = [];
  const armMap = [];
  for (const caseId of MANIFEST.paired_case_ids) {
    const fixture = BY_ID.get(caseId);
    const pairRecords = records.filter((record) => record.phase === "v2_paired_ab" && record.pair_id === caseId).sort((left, right) => left.randomized_order_hash.localeCompare(right.randomized_order_hash));
    if (pairRecords.length !== 2) throw new Error(`paired_record_count_mismatch:${caseId}`);
    blindPairs.push({
      pair_id: caseId,
      family: fixture.family,
      messages: fixture.messages,
      response_A: pairRecords[0].response,
      response_B: pairRecords[1].response,
      maximum_answer_characters: fixture.maximum_answer_characters,
      response_quality_rubric: fixture.response_quality_rubric,
    });
    armMap.push({ pair_id: caseId, response_A: pairRecords[0].arm, response_B: pairRecords[1].arm });
  }
  await atomicJson(join(RAW_ROOT, "blind_pairs.json"), blindPairs);
  await atomicJson(join(RAW_ROOT, "arm_map.json"), armMap);
  await atomicJson(join(REPORT_ROOT, "paired_completion.json"), {
    paired_case_count: blindPairs.length,
    paired_request_count: blindPairs.length * 2,
    field_ablation_request_count: 0,
    request_order_randomized_globally: true,
    arm_identity_hidden_from_blind_packet: true,
    reviewer_class_required: "codex_agent_packet_v2_review_not_human",
    raw_outputs_ignored: true,
  });
}

async function runPaired(records) {
  const smoke = await readJson(join(REPORT_ROOT, "live_smoke_v2.json"), {});
  if (smoke.passed !== true || aggregate(records).requests < 6) throw new Error("v2_smoke_pass_required_before_paired");
  const specs = pairedSpecs();
  if (specs.length !== 60) throw new Error("paired_request_selection_not_60");
  for (const spec of specs) {
    const record = await runRequest(records, spec);
    if (!requestPassed(record)) {
      await writeState(records, "BLOCKED_HYBRID_V2_CONFIGURATION");
      process.exitCode = 2;
      return;
    }
  }
  await buildBlindPackets(records);
  await writeState(records, "PAIRED_V2_COMPLETE_AWAITING_BLIND_REVIEW");
  console.log(JSON.stringify({ phase: "PAIRED_V2_COMPLETE", paired_cases: 30, paired_requests: 60, field_ablation_requests: 0, live_request_count: aggregate(records).requests }));
}

const records = await readJson(RECORDS_PATH, []);
await writeState(records, PHASE === "smoke" ? "LIVE_SMOKE_V2" : "PRIMARY_PAIRED_AB_V2");
if (PHASE === "smoke") await runSmoke(records);
else await runPaired(records);
