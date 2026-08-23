#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildR29P0CandidatePair,
  buildR29P0DeterministicRequest,
  dispatchR29P0Pair,
} from "../src/hybrid_runtime/r29p0_candidate_request.ts";
import { collectR29P0LiveResponse, r29p0LiveResultPassed } from "../src/hybrid_runtime/r29p0_live_client.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).flatMap((value, index, all) =>
  value.startsWith("--") ? [[value, all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : true]] : []));
const PHASE = String(args.get("--phase") || "smoke");
const ARTIFACT_ROOT = resolve(ROOT, String(args.get("--artifact-root") || "artifacts/r29p0_pairwise_oracle"));
const RAW_ROOT = join(ARTIFACT_ROOT, "raw");
const REPORT_ROOT = join(ARTIFACT_ROOT, "reports");
const RECORDS_PATH = join(RAW_ROOT, "live_records.json");
const STATE_PATH = join(ARTIFACT_ROOT, "live_state.json");
const SOURCE_LOCK_PATH = join(ARTIFACT_ROOT, "source_lock.json");
const PHASES = new Set(["smoke", "batch1", "batch2", "batch3"]);

const SOURCE_FILES = [
  "config/r29p0_live_policy.json",
  "config/r29p0_official_api_contract.json",
  "config/r29p0_deepseek_pricing_snapshot.json",
  "config/r29p0_protocol_freeze.json",
  "config/r29p0_deterministic_controller_v1.json",
  "prompts/r29p0_candidate_system_v1.txt",
  "evals/r29p0_pairwise_oracle_v1/cases.jsonl",
  "evals/r29p0_pairwise_oracle_v1/smoke_cases.jsonl",
  "evals/r29p0_pairwise_oracle_v1/manifest.json",
  "evals/r29p0_pairwise_oracle_v1/schema.json",
  "evals/r29p0_pairwise_oracle_v1/contamination_report.json",
  "evals/r29p0_pairwise_oracle_v1/semantic_audit.json",
  "src/hybrid_runtime/r29p0_candidate_request.ts",
  "src/hybrid_runtime/r29p0_live_client.ts",
  "scripts/r29p0_live_experiment.mjs",
];

if (!PHASES.has(PHASE)) throw new Error("r29p0_invalid_live_phase");
if (!process.env.DEEPSEEK_API_KEY) throw new Error("deepseek_api_key_unavailable");

const POLICY = JSON.parse(await readFile(join(ROOT, "config/r29p0_live_policy.json"), "utf8"));
const CONTROLLER = JSON.parse(await readFile(join(ROOT, "config/r29p0_deterministic_controller_v1.json"), "utf8"));
const PRICING = JSON.parse(await readFile(join(ROOT, "config/r29p0_deepseek_pricing_snapshot.json"), "utf8"));
const SYSTEM_PROMPT = await readFile(join(ROOT, "prompts/r29p0_candidate_system_v1.txt"), "utf8");
const MANIFEST = JSON.parse(await readFile(join(ROOT, "evals/r29p0_pairwise_oracle_v1/manifest.json"), "utf8"));
const PROTOCOL_FREEZE = JSON.parse(await readFile(join(ROOT, "config/r29p0_protocol_freeze.json"), "utf8"));

function parseJsonl(value) {
  return value.split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

const CASES = parseJsonl(await readFile(join(ROOT, "evals/r29p0_pairwise_oracle_v1/cases.jsonl"), "utf8"));
const SMOKE_CASES = parseJsonl(await readFile(join(ROOT, "evals/r29p0_pairwise_oracle_v1/smoke_cases.jsonl"), "utf8"));
const CASE_BY_ID = new Map(CASES.map((fixture) => [fixture.case_id, fixture]));
const SMOKE_BY_ID = new Map(SMOKE_CASES.map((fixture) => [fixture.case_id, fixture]));

if (POLICY.campaign_id !== "r29p0_equivalence_pairwise_oracle_v1" ||
    POLICY.request_guard.maximum_live_requests !== 190 ||
    POLICY.request_guard.maximum_estimated_cost_cny !== 2 ||
    POLICY.request_guard.case_concurrency !== 1 ||
    POLICY.request_guard.candidate_concurrency_within_case !== 2 ||
    POLICY.api.temperature !== 0 || POLICY.api.max_tokens !== 192 ||
    POLICY.api.thinking?.type !== "disabled" || POLICY.training.training_started !== false) {
  throw new Error("r29p0_live_policy_hard_limit_mismatch");
}
if (CASES.length !== 60 || SMOKE_CASES.length !== 3) throw new Error("r29p0_fixture_count_mismatch");

await mkdir(RAW_ROOT, { recursive: true, mode: 0o700 });
await mkdir(REPORT_ROOT, { recursive: true, mode: 0o700 });

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function currentSourceLock() {
  const sources = [];
  for (const relativePath of SOURCE_FILES) {
    const bytes = await readFile(join(ROOT, relativePath));
    sources.push({ path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return {
    schema_version: "r29p0.source_lock.v1",
    campaign_id: POLICY.campaign_id,
    sources,
    combined_sha256: sha256(JSON.stringify(sources)),
  };
}

async function validateProtocolFreeze() {
  if (!PROTOCOL_FREEZE.frozen_before_first_live_request || PROTOCOL_FREEZE.live_requests_at_freeze !== 0) {
    throw new Error("r29p0_protocol_not_frozen_before_live");
  }
  for (const entry of PROTOCOL_FREEZE.frozen_files) {
    const bytes = await readFile(join(ROOT, entry.path));
    if (sha256(bytes) !== entry.sha256) throw new Error(`r29p0_frozen_file_hash_mismatch:${entry.path}`);
  }
}

async function ensureSourceLock() {
  const current = await currentSourceLock();
  const prior = await readJson(SOURCE_LOCK_PATH, null);
  if (prior && JSON.stringify(prior.sources) !== JSON.stringify(current.sources)) {
    throw new Error("r29p0_source_lock_mismatch");
  }
  if (!prior) await atomicJson(SOURCE_LOCK_PATH, current);
  return current;
}

function aggregate(records) {
  return records.reduce((total, record) => ({
    requests: total.requests + 1,
    input_tokens: total.input_tokens + Number(record.result.input_tokens || 0),
    output_tokens: total.output_tokens + Number(record.result.output_tokens || 0),
    cache_hit_tokens: total.cache_hit_tokens + Number(record.result.cache_hit_tokens || 0),
    cache_miss_tokens: total.cache_miss_tokens + Number(record.result.cache_miss_tokens || 0),
    estimated_cost_usd: total.estimated_cost_usd + Number(record.estimated_cost_usd || 0),
    estimated_cost_usd_guard: total.estimated_cost_usd_guard + Number(record.estimated_cost_usd_guard || 0),
  }), { requests: 0, input_tokens: 0, output_tokens: 0, cache_hit_tokens: 0, cache_miss_tokens: 0, estimated_cost_usd: 0, estimated_cost_usd_guard: 0 });
}

function isPeakUtc(timestamp) {
  const date = new Date(timestamp);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();
  return day >= 1 && day <= 5 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
}

function requestCostUsd(result, rates) {
  return (
    Number(result.cache_hit_tokens || 0) * rates.input_cache_hit +
    Number(result.cache_miss_tokens || 0) * rates.input_cache_miss +
    Number(result.output_tokens || 0) * rates.output
  ) / PRICING.unit_tokens;
}

function conservativeRequestCostUsd(request) {
  const byteUpperBound = Buffer.byteLength(JSON.stringify(request), "utf8");
  return (byteUpperBound * PRICING.peak.input_cache_miss + request.max_tokens * PRICING.peak.output) / PRICING.unit_tokens;
}

async function writeState(state, records, sourceLock, nextState) {
  const totals = aggregate(records);
  state.state = nextState;
  state.updated_at = new Date().toISOString();
  state.completed_request_count = records.length;
  state.source_lock_sha256 = sourceLock.combined_sha256;
  state.input_tokens = totals.input_tokens;
  state.output_tokens = totals.output_tokens;
  state.cache_hit_tokens = totals.cache_hit_tokens;
  state.cache_miss_tokens = totals.cache_miss_tokens;
  state.estimated_cost_usd = totals.estimated_cost_usd;
  state.estimated_cost_usd_peak_guard = totals.estimated_cost_usd_guard;
  state.estimated_cost_cny = totals.estimated_cost_usd * 10;
  state.estimated_cost_cny_conservative = totals.estimated_cost_usd_guard * 10;
  await atomicJson(STATE_PATH, state);
}

function validateExistingRecord(record, request, sourceLock) {
  const requestHash = sha256(JSON.stringify(request));
  if (record.request_body_sha256 !== requestHash || record.source_lock_sha256 !== sourceLock.combined_sha256) {
    throw new Error(`r29p0_response_binding_mismatch:${record.request_key}`);
  }
  if (record.result.request_body_sha256 !== requestHash || sha256(record.result.response) !== record.result.response_sha256) {
    throw new Error(`r29p0_response_integrity_mismatch:${record.request_key}`);
  }
}

async function reserveRequests(state, records, sourceLock, specs) {
  if (state.pending_request_keys?.length) throw new Error("r29p0_unresolved_pending_requests");
  if (state.started_request_count + specs.length > POLICY.request_guard.maximum_live_requests) {
    throw new Error("r29p0_request_budget_exceeded");
  }
  const priorGuardUsd = aggregate(records).estimated_cost_usd_guard;
  const conservativeUsd = specs.reduce((sum, spec) => sum + conservativeRequestCostUsd(spec.request), priorGuardUsd);
  if (conservativeUsd * 10 > POLICY.request_guard.maximum_estimated_cost_cny) {
    throw new Error("r29p0_cost_budget_exceeded");
  }
  state.pending_request_keys = specs.map((spec) => spec.requestKey);
  state.started_request_count += specs.length;
  await writeState(state, records, sourceLock, `REQUESTS_RESERVED:${specs.map((spec) => spec.requestKey).join(",")}`);
}

async function commitRecords(state, records, sourceLock, newRecords, nextState) {
  records.push(...newRecords);
  await atomicJson(RECORDS_PATH, records);
  state.pending_request_keys = [];
  await writeState(state, records, sourceLock, nextState);
}

function makeRecord(spec, result, sourceLock, additional = {}) {
  const actualPricingPeriod = isPeakUtc(result.request_started_at) ? "peak" : "off_peak";
  return {
    schema_version: "r29p0.live_record.v1",
    campaign_id: POLICY.campaign_id,
    phase: PHASE,
    request_key: spec.requestKey,
    case_id: spec.fixture.case_id,
    family: spec.fixture.family,
    arm: spec.arm,
    source_lock_sha256: sourceLock.combined_sha256,
    request_body_sha256: sha256(JSON.stringify(spec.request)),
    result,
    pricing_period_utc: actualPricingPeriod,
    estimated_cost_usd: requestCostUsd(result, PRICING[actualPricingPeriod]),
    estimated_cost_usd_guard: requestCostUsd(result, PRICING.peak),
    ...additional,
  };
}

function policyFor(fixture) {
  const policy = CONTROLLER.policies[fixture.family];
  if (!policy) throw new Error(`r29p0_missing_controller_policy:${fixture.family}`);
  return policy;
}

async function runCase(fixture, state, records, sourceLock) {
  if (!fixture.public_safe || fixture.allowed_for_training !== false) throw new Error("r29p0_fixture_safety_contract_mismatch");
  const pair = buildR29P0CandidatePair(SYSTEM_PROMPT, fixture.messages);
  const deterministic = buildR29P0DeterministicRequest(SYSTEM_PROMPT, fixture.messages, policyFor(fixture));
  const pairSpecs = [
    { requestKey: `${PHASE}:${fixture.case_id}:A`, fixture, arm: "A", request: pair.candidateA },
    { requestKey: `${PHASE}:${fixture.case_id}:B`, fixture, arm: "B", request: pair.candidateB },
  ];
  const baselineSpec = { requestKey: `${PHASE}:${fixture.case_id}:D`, fixture, arm: "DETERMINISTIC", request: deterministic };
  const existingA = records.find((record) => record.request_key === pairSpecs[0].requestKey);
  const existingB = records.find((record) => record.request_key === pairSpecs[1].requestKey);
  if (Boolean(existingA) !== Boolean(existingB)) throw new Error(`r29p0_partial_pair_evidence:${fixture.case_id}`);
  let pairReadyMs = null;
  let dispatchSkewMs = null;
  if (existingA && existingB) {
    validateExistingRecord(existingA, pair.candidateA, sourceLock);
    validateExistingRecord(existingB, pair.candidateB, sourceLock);
    pairReadyMs = existingA.pair_ready_ms;
    dispatchSkewMs = existingA.dispatch_skew_ms;
  } else {
    await reserveRequests(state, records, sourceLock, pairSpecs);
    const pairStart = performance.now();
    const invocation = {};
    const results = await dispatchR29P0Pair(pair.candidateA, pair.candidateB, async (arm, request) => {
      invocation[arm] = performance.now();
      return collectR29P0LiveResponse(request);
    });
    pairReadyMs = performance.now() - pairStart;
    dispatchSkewMs = Math.abs(Number(invocation.A) - Number(invocation.B));
    const newRecords = [
      makeRecord(pairSpecs[0], results.candidateA, sourceLock, { pair_ready_ms: pairReadyMs, dispatch_skew_ms: dispatchSkewMs }),
      makeRecord(pairSpecs[1], results.candidateB, sourceLock, { pair_ready_ms: pairReadyMs, dispatch_skew_ms: dispatchSkewMs }),
    ];
    await commitRecords(state, records, sourceLock, newRecords, `${PHASE}:${fixture.case_id}:PAIR_COMPLETE`);
    if (!newRecords.every((record) => r29p0LiveResultPassed(record.result)) || dispatchSkewMs > 100 ||
        newRecords[0].request_body_sha256 !== newRecords[1].request_body_sha256) {
      throw new Error(`r29p0_candidate_pair_failed:${fixture.case_id}`);
    }
  }
  const existingBaseline = records.find((record) => record.request_key === baselineSpec.requestKey);
  if (existingBaseline) {
    validateExistingRecord(existingBaseline, deterministic, sourceLock);
  } else {
    await reserveRequests(state, records, sourceLock, [baselineSpec]);
    const result = await collectR29P0LiveResponse(deterministic);
    const newRecord = makeRecord(baselineSpec, result, sourceLock);
    await commitRecords(state, records, sourceLock, [newRecord], `${PHASE}:${fixture.case_id}:COMPLETE`);
    if (!r29p0LiveResultPassed(result)) throw new Error(`r29p0_deterministic_request_failed:${fixture.case_id}`);
  }
  const totals = aggregate(records);
  console.log(JSON.stringify({
    phase: PHASE,
    completed_case_id: fixture.case_id,
    completed_request_count: records.length,
    started_request_count: state.started_request_count,
    pair_ready_ms: Math.round(Number(pairReadyMs) * 10) / 10,
    dispatch_skew_ms: Math.round(Number(dispatchSkewMs) * 10) / 10,
    estimated_cost_cny_conservative: Math.round(totals.estimated_cost_usd_guard * 10 * 1e8) / 1e8,
  }));
}

function phaseFixtures() {
  if (PHASE === "smoke") return MANIFEST.smoke_case_ids.map((caseId) => SMOKE_BY_ID.get(caseId));
  const batchNumber = Number(PHASE.slice(-1));
  const ids = MANIFEST.batches?.[`batch_${batchNumber}`];
  if (!Array.isArray(ids) || ids.length !== 20) throw new Error(`r29p0_batch_manifest_mismatch:${PHASE}`);
  return ids.map((caseId) => CASE_BY_ID.get(caseId));
}

await validateProtocolFreeze();
const sourceLock = await ensureSourceLock();
const records = await readJson(RECORDS_PATH, []);
const state = await readJson(STATE_PATH, {
  schema_version: "r29p0.live_state.v1",
  campaign_id: POLICY.campaign_id,
  state: "API_CONTRACT",
  started_request_count: 0,
  completed_request_count: 0,
  pending_request_keys: [],
  maximum_live_requests: 190,
  maximum_estimated_cost_cny: 2,
  case_concurrency: 1,
  candidate_concurrency: 2,
  training_started: false,
  optimizer_tokens: 0,
  assistant_target_tokens: 0,
  local_ranker_trained: false,
  actual_efish_ranker_used: false,
  ranker_training_authorized: false,
  key_present: true,
  key_value_logged: false,
  secret_metadata_logged: false,
  unselected_candidate_exposed: false,
  production_modified: false,
});

if (state.campaign_id !== POLICY.campaign_id || state.pending_request_keys?.length) {
  throw new Error("r29p0_live_resume_state_invalid");
}
if (state.started_request_count !== records.length) throw new Error("r29p0_started_completed_ledger_mismatch");
for (const record of records) {
  if (record.source_lock_sha256 !== sourceLock.combined_sha256 || sha256(record.result.response) !== record.result.response_sha256) {
    throw new Error(`r29p0_existing_record_integrity_mismatch:${record.request_key}`);
  }
}

try {
  for (const fixture of phaseFixtures()) {
    if (!fixture) throw new Error("r29p0_manifest_case_missing");
    await runCase(fixture, state, records, sourceLock);
  }
  const expectedPhaseRequests = PHASE === "smoke" ? 9 : 60;
  const phaseRecords = records.filter((record) => record.phase === PHASE);
  if (phaseRecords.length !== expectedPhaseRequests) throw new Error(`r29p0_phase_request_count_mismatch:${PHASE}`);
  await writeState(state, records, sourceLock, PHASE === "smoke" ? "LIVE_SMOKE_COMPLETE" : `${PHASE.toUpperCase()}_GENERATION_COMPLETE`);
  const summary = {
    schema_version: "r29p0.generation_phase_summary.v1",
    campaign_id: POLICY.campaign_id,
    phase: PHASE,
    completed_requests: phaseRecords.length,
    all_requests_passed: phaseRecords.every((record) => r29p0LiveResultPassed(record.result)),
    source_lock_sha256: sourceLock.combined_sha256,
    candidate_pair_bodies_identical: phaseFixtures().every((fixture) => {
      const a = records.find((record) => record.request_key === `${PHASE}:${fixture.case_id}:A`);
      const b = records.find((record) => record.request_key === `${PHASE}:${fixture.case_id}:B`);
      return a?.request_body_sha256 === b?.request_body_sha256;
    }),
    key_value_logged: false,
    training_started: false,
  };
  await atomicJson(join(REPORT_ROOT, `${PHASE}_generation_summary.json`), summary);
} catch (error) {
  await writeState(state, records, sourceLock, "BLOCKED_CONFIGURATION");
  throw error;
}
