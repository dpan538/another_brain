#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HybridAdapterError } from "../src/hybrid_runtime/deepseek_adapter.ts";
import {
  assertControlledRequest,
  buildCanonicalAnswerRequest,
  buildConstrainedRewriteRequest,
  buildControlledOneCallRequest,
  controlledRequestInvariant,
  CONTROL_GUIDANCE,
} from "../src/hybrid_runtime/controlled_deepseek_request.ts";
import { LiveDeepSeekAdapter } from "../src/hybrid_runtime/live_deepseek_adapter.ts";
import { compileLocalSignalPacketV2 } from "../src/hybrid_runtime/local_signal_packet_v2_compiler.ts";
import { materializeOracleCriticPacket } from "../src/hybrid_runtime/oracle_local_critic.ts";
import { semanticPreservationGuard } from "../src/hybrid_runtime/semantic_preservation_guard.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).map((value, index, all) => value.startsWith("--") ? [value, all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : true] : ["", value]));
const PHASE = String(args.get("--phase") || "provider-baseline");
const ARTIFACT_ROOT = resolve(ROOT, String(args.get("--artifact-root") || "artifacts/r29b2m_r4h_r3"));
const RAW_ROOT = join(ARTIFACT_ROOT, "raw");
const REPORT_ROOT = join(ARTIFACT_ROOT, "reports");
const RECORDS_PATH = join(RAW_ROOT, "live_records.json");
const STATE_PATH = join(ARTIFACT_ROOT, "live_state.json");
const POLICY = JSON.parse(await readFile(join(ROOT, "config/r29b2m_r4h_r3_live_policy.json"), "utf8"));
const PRICING = JSON.parse(await readFile(join(ROOT, "config/deepseek_pricing_snapshot.json"), "utf8"));
const MANIFEST = JSON.parse(await readFile(join(ROOT, POLICY.manifest_path), "utf8"));
const FIXTURES = (await readFile(join(ROOT, POLICY.public_fixture_path), "utf8")).trim().split(/\r?\n/u).map((line) => JSON.parse(line));
const BY_ID = new Map(FIXTURES.map((row) => [row.case_id, row]));
const ONE_CALL_TEMPLATE = await readFile(join(ROOT, POLICY.controlled_one_call_template_path), "utf8");
const CANONICAL_SYSTEM = await readFile(join(ROOT, POLICY.canonical_system_path), "utf8");
const REWRITE_TEMPLATE = await readFile(join(ROOT, POLICY.rewrite_template_path), "utf8");
const ADAPTER = new LiveDeepSeekAdapter();
const PHASES = new Set(["provider-baseline", "one-call-diagnostic", "one-call-expansion", "two-stage"]);

if (!process.env.DEEPSEEK_API_KEY) throw new Error("deepseek_api_key_unavailable");
if (!PHASES.has(PHASE)) throw new Error("invalid_live_phase");
if (POLICY.maximum_total_requests !== 200 || POLICY.maximum_estimated_cost_cny !== 2 || POLICY.concurrency !== 1 ||
    POLICY.temperature !== 0 || POLICY.top_p_present !== false || POLICY.max_tokens > 160 || POLICY.training_started !== false) {
  throw new Error("live_policy_hard_limit_mismatch");
}
if (MANIFEST.paired_30_case_ids.length !== 30 || MANIFEST.provider_baseline_12_case_ids.length !== 12 || MANIFEST.two_stage_24_case_ids.length !== 24) {
  throw new Error("fixture_manifest_count_mismatch");
}

await mkdir(RAW_ROOT, { recursive: true });
await mkdir(REPORT_ROOT, { recursive: true });

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1))];
}

function requestCostUsd(record) {
  return (
    Number(record.cache_hit_tokens || 0) * PRICING.input_cache_hit +
    Number(record.cache_miss_tokens || 0) * PRICING.input_cache_miss +
    Number(record.output_tokens || 0) * PRICING.output
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
    concurrency: 1,
    temperature: 0,
    top_p_sent: false,
    thinking_disabled: true,
    key_present: true,
    key_value_logged: false,
    training_started: false,
    optimizer_tokens: 0,
    assistant_target_tokens: 0,
    actual_efish_critic_model_trained: false,
    oracle_critic: true,
    production_modified: false,
  });
}

async function runRequest(records, spec) {
  const existing = records.find((record) => record.request_key === spec.requestKey);
  if (existing) return existing;
  assertControlledRequest(spec.request);
  enforceBeforeStart(records, spec.request);
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
    for await (const event of ADAPTER.stream(spec.request, { turnId: spec.requestKey, signal: abort.signal, scenario: spec.phase })) {
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
    repetition: spec.repetition ?? null,
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
    deepseek_ttft_ms: firstMeaningfulAt === null ? null : firstMeaningfulAt - requestStart,
    completion_latency_ms: streamEnd - requestStart,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_hit_tokens: cacheHitTokens,
    cache_miss_tokens: cacheMissTokens,
    usage_present: usagePresent,
    finish_reason: finishReason,
    response: content.trim(),
    request_invariant: controlledRequestInvariant(spec.request),
    unvalidated_stream_exposed: false,
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

function fixture(caseId) {
  const row = BY_ID.get(caseId);
  if (!row) throw new Error(`missing_fixture:${caseId}`);
  return row;
}

function randomized(specs, seed) {
  return specs.map((spec) => {
    const orderHash = createHash("sha256").update(`${seed}:${spec.requestKey}`).digest("hex");
    return { ...spec, orderHash };
  }).sort((left, right) => left.orderHash.localeCompare(right.orderHash)).map((spec, index) => ({ ...spec, orderIndex: index }));
}

function systemOutsideGuidance(request) {
  const system = request.messages[0]?.content ?? "";
  const match = system.match(/^([\s\S]*?<LOCAL_GUIDANCE>\s*)([\s\S]*?)(\s*<\/LOCAL_GUIDANCE>[\s\S]*)$/u);
  if (!match) throw new Error("local_guidance_slot_missing");
  return `${match[1]}{{GUIDANCE}}${match[3]}`;
}

function assertOneCallPairControl(control, treatment) {
  const left = controlledRequestInvariant(control);
  const right = controlledRequestInvariant(treatment);
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error("one_call_invariant_mismatch");
  if (systemOutsideGuidance(control) !== systemOutsideGuidance(treatment)) throw new Error("one_call_structure_outside_guidance_mismatch");
  if (control.messages[0].content.includes(`<LOCAL_GUIDANCE>\n${CONTROL_GUIDANCE}\n</LOCAL_GUIDANCE>`) !== true) throw new Error("control_guidance_none_missing");
  for (let index = 1; index < control.messages.length; index += 1) {
    if (JSON.stringify(control.messages[index]) !== JSON.stringify(treatment.messages[index])) throw new Error("one_call_context_mismatch");
  }
}

function compileGuidance(row) {
  return compileLocalSignalPacketV2(row.oracle_local_signal_packet_v2, [...row.messages].reverse().find((message) => message.role === "user")?.content || "").instruction;
}

async function requireReport(name, predicate) {
  const report = await readJson(join(REPORT_ROOT, name), null);
  if (!report || !predicate(report)) throw new Error(`required_phase_report_missing_or_failed:${name}`);
  return report;
}

async function runProviderBaseline(records) {
  const specs = [];
  for (const caseId of MANIFEST.provider_baseline_12_case_ids) {
    const row = fixture(caseId);
    const requestA = buildControlledOneCallRequest(ONE_CALL_TEMPLATE, row.messages, CONTROL_GUIDANCE);
    const requestB = buildControlledOneCallRequest(ONE_CALL_TEMPLATE, row.messages, CONTROL_GUIDANCE);
    if (JSON.stringify(requestA) !== JSON.stringify(requestB)) throw new Error("provider_replicate_request_mismatch");
    for (const repetition of ["A", "B"]) specs.push({
      requestKey: `provider-baseline:${caseId}:${repetition}`,
      phase: "controlled_provider_baseline",
      fixture: row,
      pairId: caseId,
      arm: "deepseek_only_controlled_none",
      repetition,
      request: repetition === "A" ? requestA : requestB,
    });
  }
  const ordered = randomized(specs, "r29b2m-r4h-r3-provider-baseline");
  if (ordered.length !== 24) throw new Error("provider_baseline_request_count_not_24");
  const phaseRecords = [];
  for (const spec of ordered) {
    const record = await runRequest(records, spec);
    phaseRecords.push(record);
    if (!requestPassed(record)) throw new Error("provider_baseline_live_configuration_failure");
  }
  const pairs = MANIFEST.provider_baseline_12_case_ids.map((caseId) => {
    const row = fixture(caseId);
    const pair = phaseRecords.filter((record) => record.case_id === caseId).sort((left, right) => left.repetition.localeCompare(right.repetition));
    if (pair.length !== 2 || JSON.stringify(pair[0].request_invariant) !== JSON.stringify(pair[1].request_invariant)) throw new Error(`provider_pair_mismatch:${caseId}`);
    return { pair_id: caseId, family: row.family, messages: row.messages, replicate_A: pair[0].response, replicate_B: pair[1].response, response_quality_rubric: row.response_quality_rubric };
  });
  await atomicJson(join(RAW_ROOT, "provider_replicate_pairs.json"), pairs);
  await atomicJson(join(REPORT_ROOT, "provider_baseline_completion.json"), {
    phase: "CONTROLLED_BASELINE",
    case_count: 12,
    request_count: 24,
    identical_request_per_replicate: true,
    temperature: 0,
    top_p_sent: false,
    exact_text_match_count: pairs.filter((pair) => pair.replicate_A === pair.replicate_B).length,
    exact_text_match_rate: pairs.filter((pair) => pair.replicate_A === pair.replicate_B).length / pairs.length,
    semantic_review_required: true,
    completion_latency_p50_ms: percentile(phaseRecords.map((record) => record.completion_latency_ms), 0.5),
    completion_latency_p95_ms: percentile(phaseRecords.map((record) => record.completion_latency_ms), 0.95),
  });
  await writeState(records, "CONTROLLED_BASELINE_COMPLETE_AWAITING_VARIANCE_REVIEW");
}

function oneCallSpecs(caseIds, repetitions, phase, seed) {
  const specs = [];
  for (const caseId of caseIds) {
    const row = fixture(caseId);
    const guidance = compileGuidance(row);
    const control = buildControlledOneCallRequest(ONE_CALL_TEMPLATE, row.messages, CONTROL_GUIDANCE);
    const treatment = buildControlledOneCallRequest(ONE_CALL_TEMPLATE, row.messages, guidance);
    assertOneCallPairControl(control, treatment);
    for (const repetition of repetitions) {
      for (const arm of ["controlled_none", "v2_anchors_style"]) specs.push({
        requestKey: `${phase}:${caseId}:${repetition}:${arm}`,
        phase,
        fixture: row,
        pairId: `${caseId}:${repetition}`,
        arm,
        repetition,
        request: arm === "controlled_none" ? control : treatment,
      });
    }
  }
  return randomized(specs, seed);
}

async function buildOneCallBlind(records, phase, caseIds, repetitions, prefix) {
  const blindPairs = [];
  const armMap = [];
  for (const caseId of caseIds) {
    const row = fixture(caseId);
    for (const repetition of repetitions) {
      const pairId = `${caseId}:${repetition}`;
      const pair = records.filter((record) => record.phase === phase && record.pair_id === pairId);
      if (pair.length !== 2) throw new Error(`one_call_pair_count_mismatch:${pairId}`);
      const blindHash = createHash("sha256").update(`r3-blind:${phase}:${pairId}`).digest("hex");
      const arranged = blindHash[0] < "8" ? pair : [...pair].reverse();
      blindPairs.push({
        pair_id: pairId,
        case_id: caseId,
        repetition,
        family: row.family,
        messages: row.messages,
        response_A: arranged[0].response,
        response_B: arranged[1].response,
        response_quality_rubric: row.response_quality_rubric,
        maximum_answer_characters: row.maximum_answer_characters,
      });
      armMap.push({ pair_id: pairId, response_A: arranged[0].arm, response_B: arranged[1].arm });
    }
  }
  await atomicJson(join(RAW_ROOT, `${prefix}_blind_pairs.json`), blindPairs);
  await atomicJson(join(RAW_ROOT, `${prefix}_arm_map.json`), armMap);
  await atomicJson(join(REPORT_ROOT, `${prefix}_completion.json`), {
    case_count: caseIds.length,
    repetition_count: repetitions.length,
    pair_count: blindPairs.length,
    request_count: blindPairs.length * 2,
    temperature: 0,
    top_p_sent: false,
    one_system_message_all_arms: true,
    same_message_structure_all_arms: true,
    only_local_guidance_slot_differs: true,
    globally_randomized_request_order: true,
    arm_identity_hidden_from_blind_packet: true,
  });
}

async function runOneCallDiagnostic(records) {
  await requireReport("provider_variance_review.json", (report) => report.review_complete === true && report.request_count === 24);
  const specs = oneCallSpecs(MANIFEST.one_call_diagnostic_12_case_ids, ["A", "B"], "one_call_diagnostic", "r29b2m-r4h-r3-one-call-diagnostic");
  if (specs.length !== 48) throw new Error("one_call_diagnostic_request_count_not_48");
  for (const spec of specs) {
    const record = await runRequest(records, spec);
    if (!requestPassed(record)) throw new Error("one_call_diagnostic_live_configuration_failure");
  }
  await buildOneCallBlind(records, "one_call_diagnostic", MANIFEST.one_call_diagnostic_12_case_ids, ["A", "B"], "one_call_diagnostic");
  await writeState(records, "ONE_CALL_CAUSAL_REPLAY_COMPLETE_AWAITING_BLIND_REVIEW");
}

async function runOneCallExpansion(records) {
  await requireReport("one_call_diagnostic_decision.json", (report) => report.passes_diagnostic_gate === true);
  const specs = oneCallSpecs(MANIFEST.paired_30_case_ids, ["A"], "one_call_expansion", "r29b2m-r4h-r3-one-call-expansion");
  if (specs.length !== 60) throw new Error("one_call_expansion_request_count_not_60");
  for (const spec of specs) {
    const record = await runRequest(records, spec);
    if (!requestPassed(record)) throw new Error("one_call_expansion_live_configuration_failure");
  }
  await buildOneCallBlind(records, "one_call_expansion", MANIFEST.paired_30_case_ids, ["A"], "one_call_expansion");
  await writeState(records, "ONE_CALL_EXPANSION_COMPLETE_AWAITING_BLIND_REVIEW");
}

async function runTwoStage(records) {
  await requireReport("one_call_decision.json", (report) => report.proceed_to_two_stage === true);
  const specs = [];
  for (const caseId of MANIFEST.two_stage_24_case_ids) {
    const row = fixture(caseId);
    const orderHash = createHash("sha256").update(`r29b2m-r4h-r3-two-stage:${caseId}`).digest("hex");
    specs.push({ row, orderHash });
  }
  specs.sort((left, right) => left.orderHash.localeCompare(right.orderHash));
  const results = [];
  for (let orderIndex = 0; orderIndex < specs.length; orderIndex += 1) {
    const { row, orderHash } = specs[orderIndex];
    const chainStarted = performance.now();
    const canonicalRequestKey = `two-stage:${row.case_id}:canonical`;
    const canonical = await runRequest(records, {
      requestKey: canonicalRequestKey,
      phase: "two_stage_canonical",
      fixture: row,
      pairId: row.case_id,
      arm: "canonical_source",
      orderIndex,
      orderHash,
      request: buildCanonicalAnswerRequest(CANONICAL_SYSTEM, row.messages),
    });
    if (!requestPassed(canonical)) throw new Error("two_stage_canonical_live_configuration_failure");

    const criticStarted = performance.now();
    const criticPacket = materializeOracleCriticPacket(row.oracle_critic_fixture, canonical.response, row.semantic_guard_metadata.protected_named_values);
    const criticLatency = performance.now() - criticStarted;
    const rewrite = await runRequest(records, {
      requestKey: `two-stage:${row.case_id}:rewrite`,
      phase: "two_stage_rewrite",
      fixture: row,
      pairId: row.case_id,
      arm: "constrained_rewrite_candidate",
      orderIndex,
      orderHash,
      request: buildConstrainedRewriteRequest(REWRITE_TEMPLATE, row.messages, canonical.response, criticPacket),
    });
    if (!requestPassed(rewrite)) throw new Error("two_stage_rewrite_live_configuration_failure");
    const guard = semanticPreservationGuard(canonical.response, rewrite.response, row.semantic_guard_metadata);
    const finalReady = performance.now() - chainStarted;
    results.push({
      pair_id: row.case_id,
      case_id: row.case_id,
      family: row.family,
      messages: row.messages,
      canonical_answer: canonical.response,
      oracle_critic_packet: criticPacket,
      rewrite_candidate: rewrite.response,
      semantic_guard: guard,
      final_answer: guard.final_answer,
      product_source_label: guard.source_label,
      control_output_is_exact_canonical: true,
      control_api_request_count: 0,
      canonical_request_key: canonicalRequestKey,
      critic_execution_count: 1,
      rewrite_attempt_count: 1,
      critic_latency_ms: criticLatency,
      call1_completion_latency_ms: canonical.completion_latency_ms,
      call2_completion_latency_ms: rewrite.completion_latency_ms,
      semantic_guard_latency_ms: guard.guard_latency_ms,
      final_answer_ready_latency_ms: finalReady,
      unvalidated_stream_exposed: false,
      response_quality_rubric: row.response_quality_rubric,
      maximum_answer_characters: row.maximum_answer_characters,
    });
    await atomicJson(join(RAW_ROOT, "two_stage_chains.json"), results);
    console.log(JSON.stringify({ phase: "two_stage_chain", case_id: row.case_id, completed_chains: results.length, rewrite_accepted: guard.accepted, final_answer_ready_ms: finalReady }));
  }

  const blindPairs = [];
  const armMap = [];
  for (const result of results) {
    const blindHash = createHash("sha256").update(`r3-two-stage-blind:${result.case_id}`).digest("hex");
    const controlFirst = blindHash[0] < "8";
    const responseA = controlFirst ? result.canonical_answer : result.final_answer;
    const responseB = controlFirst ? result.final_answer : result.canonical_answer;
    blindPairs.push({
      pair_id: result.case_id,
      family: result.family,
      messages: result.messages,
      response_A: responseA,
      response_B: responseB,
      response_quality_rubric: result.response_quality_rubric,
      maximum_answer_characters: result.maximum_answer_characters,
    });
    armMap.push({ pair_id: result.case_id, response_A: controlFirst ? "canonical_control" : result.product_source_label, response_B: controlFirst ? result.product_source_label : "canonical_control" });
  }
  await atomicJson(join(RAW_ROOT, "two_stage_blind_pairs.json"), blindPairs);
  await atomicJson(join(RAW_ROOT, "two_stage_arm_map.json"), armMap);
  const finalReady = results.map((row) => row.final_answer_ready_latency_ms);
  await atomicJson(join(REPORT_ROOT, "two_stage_completion.json"), {
    phase: "TWO_STAGE_LIVE_EVAL",
    case_count: results.length,
    live_request_count: results.length * 2,
    control_extra_api_requests: 0,
    control_reuses_exact_canonical: results.every((row) => row.control_output_is_exact_canonical),
    critic_execution_rate: results.filter((row) => row.critic_execution_count === 1).length / results.length,
    rewrite_attempt_rate: results.filter((row) => row.rewrite_attempt_count === 1).length / results.length,
    safe_rewrite_accept_count: results.filter((row) => row.semantic_guard.accepted).length,
    safe_rewrite_accept_rate: results.filter((row) => row.semantic_guard.accepted).length / results.length,
    canonical_fallback_count: results.filter((row) => !row.semantic_guard.accepted).length,
    canonical_fallback_rate: results.filter((row) => !row.semantic_guard.accepted).length / results.length,
    unvalidated_stream_exposed: results.some((row) => row.unvalidated_stream_exposed),
    final_answer_ready_p50_ms: percentile(finalReady, 0.5),
    final_answer_ready_p95_ms: percentile(finalReady, 0.95),
    final_answer_ready_max_ms: Math.max(...finalReady),
    critic_latency_p95_ms: percentile(results.map((row) => row.critic_latency_ms), 0.95),
    arm_identity_hidden_from_blind_packet: true,
  });
  await writeState(records, "TWO_STAGE_LIVE_EVAL_COMPLETE_AWAITING_BLIND_REVIEW");
}

const records = await readJson(RECORDS_PATH, []);
await writeState(records, PHASE.toUpperCase().replaceAll("-", "_"));
if (PHASE === "provider-baseline") await runProviderBaseline(records);
else if (PHASE === "one-call-diagnostic") await runOneCallDiagnostic(records);
else if (PHASE === "one-call-expansion") await runOneCallExpansion(records);
else await runTwoStage(records);
