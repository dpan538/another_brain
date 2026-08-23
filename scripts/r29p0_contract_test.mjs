#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  buildR29P0CandidatePair,
  buildR29P0CandidateRequest,
  dispatchR29P0Pair,
} from "../src/hybrid_runtime/r29p0_candidate_request.ts";
import { buildPanelABlindRecord, buildPanelBBlindRecord } from "../src/hybrid_runtime/r29p0_blinding.ts";
import { constructR29P0Oracle } from "../src/hybrid_runtime/r29p0_oracle.ts";
import { evaluateProtectedPair } from "../src/hybrid_runtime/protected_feature_signature.ts";

const ROOT = resolve(import.meta.dirname, "..");
const TEST = process.argv[2];
const BASE_SHA = "6cb53030d5d681f67f04636fdcf0629f8380de31";
function json(path) { return JSON.parse(readFileSync(join(ROOT, path), "utf8")); }
function jsonl(path) { return readFileSync(join(ROOT, path), "utf8").trim().split(/\r?\n/u).filter(Boolean).map(JSON.parse); }
function text(path) { return readFileSync(join(ROOT, path), "utf8"); }
function samplePair() { return buildR29P0CandidatePair("系统", [{ role: "user", content: "简单说说。" }]); }
function assertGuardFails(a, b, metadata = {}) {
  const result = evaluateProtectedPair("原始输入", a, b, metadata);
  assert.equal(result.passed, false);
  return result;
}

const tests = {
  test_case_count_60() {
    const rows = jsonl("evals/r29p0_pairwise_oracle_v1/cases.jsonl");
    assert.equal(rows.length, 60);
    assert.equal(new Set(rows.map((row) => row.case_id)).size, 60);
    assert.ok(rows.every((row) => row.public_safe === true && row.allowed_for_training === false));
  },
  test_case_distribution() {
    const rows = jsonl("evals/r29p0_pairwise_oracle_v1/cases.jsonl");
    const count = (family) => rows.filter((row) => row.family === family).length;
    assert.deepEqual([count("everyday"), count("logic"), count("philosophy")], [36, 12, 12]);
    const manifest = json("evals/r29p0_pairwise_oracle_v1/manifest.json");
    for (const ids of Object.values(manifest.batches)) {
      const batch = rows.filter((row) => ids.includes(row.case_id));
      assert.deepEqual([batch.filter((row) => row.family === "everyday").length, batch.filter((row) => row.family === "logic").length, batch.filter((row) => row.family === "philosophy").length], [12, 4, 4]);
    }
  },
  test_no_training_contamination() {
    const report = json("evals/r29p0_pairwise_oracle_v1/contamination_report.json");
    assert.equal(report.result.contamination_gate, "pass");
    assert.equal(report.result.exact_duplicate_count, 0);
    assert.equal(report.result.near_duplicate_count, 0);
    assert.equal(report.result.reused_response_target_count, 0);
    const forbidden = new Set(["target", "preferred_wording", "oracle_decision", "old_deepseek_response"]);
    assert.ok(jsonl("evals/r29p0_pairwise_oracle_v1/cases.jsonl").every((row) => [...forbidden].every((field) => !(field in row))));
  },
  test_candidate_requests_identical() {
    const { candidateA, candidateB } = samplePair();
    assert.equal(JSON.stringify(candidateA), JSON.stringify(candidateB));
    assert.equal(createHash("sha256").update(JSON.stringify(candidateA)).digest("hex"), createHash("sha256").update(JSON.stringify(candidateB)).digest("hex"));
  },
  test_temperature_zero() { assert.equal(samplePair().candidateA.temperature, 0); },
  test_thinking_disabled() { assert.deepEqual(samplePair().candidateA.thinking, { type: "disabled" }); },
  async test_pair_requests_parallel() {
    const { candidateA, candidateB } = samplePair();
    let active = 0; let maximumActive = 0; let release;
    const barrier = new Promise((resolveBarrier) => { release = resolveBarrier; });
    const started = [];
    const result = await dispatchR29P0Pair(candidateA, candidateB, async (arm) => {
      started.push(arm); active += 1; maximumActive = Math.max(maximumActive, active);
      if (started.length === 2) release();
      await barrier; await new Promise((resolveDelay) => setTimeout(resolveDelay, 5)); active -= 1; return arm;
    });
    assert.deepEqual(started, ["A", "B"]);
    assert.equal(maximumActive, 2);
    assert.deepEqual(result, { candidateA: "A", candidateB: "B" });
  },
  test_candidate_a_canonical() {
    const policy = json("config/r29p0_live_policy.json");
    assert.equal(policy.candidate_contract.a_role, "canonical_fallback");
    assert.equal(constructR29P0Oracle("A", "B", false, { equivalence: "EQUIVALENT", preference: "B" }).output, "A");
  },
  test_candidate_b_not_conditioned_on_a() {
    const pair = samplePair();
    assert.equal(JSON.stringify(pair.candidateA.messages), JSON.stringify(pair.candidateB.messages));
    assert.equal(json("config/r29p0_live_policy.json").candidate_contract.b_conditioned_on_a, false);
  },
  test_deterministic_baseline_frozen_before_generation() {
    const controller = json("config/r29p0_deterministic_controller_v1.json");
    assert.equal(controller.frozen_before_live_generation, true);
    assert.equal(controller.learned_signal, false);
    assert.deepEqual(Object.keys(controller.policies).sort(), ["everyday", "logic", "philosophy"]);
  },
  test_protected_number_diff() {
    const result = assertGuardFails("一共有20个杯子。", "一共有30个杯子。");
    assert.ok(result.mismatch_fields.includes("arabic_numbers"));
  },
  test_protected_date_diff() { assert.ok(assertGuardFails("周一提交。", "周二提交。").mismatch_fields.includes("dates")); },
  test_protected_negation_diff() { assert.ok(assertGuardFails("这个结论成立。", "这个结论不成立。").mismatch_fields.includes("negation_polarity")); },
  test_protected_condition_diff() { assert.ok(assertGuardFails("只能在周一提交。", "可以在周一提交。").mismatch_fields.includes("conditions_modality")); },
  test_protected_privacy_diff() { assert.ok(assertGuardFails("我不能提供密码。", "我可以提供密码。").mismatch_fields.some((field) => ["privacy_refusal_state", "conditions_modality", "negation_polarity"].includes(field))); },
  test_protected_logic_diff() {
    const result = assertGuardFails("所以答案是甲。", "所以答案是乙。", { protected_values: [{ value: "甲" }, { value: "乙" }], logic_conclusion_if_applicable: "named_value:甲" });
    assert.ok(result.mismatch_fields.some((field) => ["named_explicit_values", "logic_conclusion"].includes(field)));
  },
  test_no_embedding_equivalence_proof() {
    const result = evaluateProtectedPair("输入", "同一句。", "同一句。");
    assert.equal(result.embedding_similarity_used_as_equivalence_proof, false);
    assert.doesNotMatch(text("src/hybrid_runtime/protected_feature_signature.ts"), /cosine\s*[><=]/iu);
  },
  test_blind_panel_a_order() {
    const fixtures = jsonl("evals/r29p0_pairwise_oracle_v1/cases.jsonl");
    const orientations = fixtures.map((fixture) => buildPanelABlindRecord(fixture, "A-only", "B-only", "panel-a-test-seed", "codex_agent_provisional_panel_a_not_human"));
    assert.ok(orientations.some((row) => row.private_map.X === "A") && orientations.some((row) => row.private_map.X === "B"));
    assert.ok(orientations.every((row) => !("private_map" in row.packet) && !JSON.stringify(row.packet).includes("canonical")));
  },
  test_blind_panel_b_order() {
    const fixture = jsonl("evals/r29p0_pairwise_oracle_v1/cases.jsonl")[0];
    const rows = Array.from({ length: 40 }, (_, index) => buildPanelBBlindRecord({ ...fixture, case_id: `${fixture.case_id}_${index}` }, "oracle-only", "control-only", "canonical", "panel-b-test-seed", "codex_agent_provisional_panel_b_not_human"));
    assert.ok(rows.some((row) => row.private_map.LEFT === "ORACLE") && rows.some((row) => row.private_map.LEFT === "COMPARATOR"));
    assert.ok(rows.every((row) => !("private_map" in row.packet) && !JSON.stringify(row.packet).includes("canonical")));
  },
  test_oracle_never_rewrites() {
    for (const guard of [true, false]) for (const equivalence of ["EQUIVALENT", "INEQUIVALENT", "UNCERTAIN"]) for (const preference of ["A", "B", "TIE", null]) {
      const output = constructR29P0Oracle("exact A", "exact B", guard, { equivalence, preference }).output;
      assert.ok(["exact A", "exact B"].includes(output));
    }
  },
  test_inequivalent_forces_a() { assert.equal(constructR29P0Oracle("A", "B", true, { equivalence: "INEQUIVALENT", preference: null }).selected, "A"); },
  test_uncertain_forces_a() { assert.equal(constructR29P0Oracle("A", "B", true, { equivalence: "UNCERTAIN", preference: null }).selected, "A"); },
  test_tie_forces_a() { assert.equal(constructR29P0Oracle("A", "B", true, { equivalence: "EQUIVALENT", preference: "TIE" }).selected, "A"); },
  test_context_actual_efish_tokenizer() {
    const py = "from pathlib import Path; from scripts.r29p0_context_fit import *; t=ExactRuntimeTokenizer.from_file(TOKENIZER_PATH); r=measure_pair(t,[{'role':'user','content':'简单说说。'}],'短回答。','另一种短回答。'); assert r['tokenizer']=='r28m1_exact_runtime_tokenizer' and r['eos_encoding']=='actual_tokenizer_eos_id' and r['fits']";
    const result = spawnSync("python3", ["-c", py], { cwd: ROOT, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  },
  test_no_semantic_truncation() {
    const py = "from scripts.r29p0_context_fit import *; t=ExactRuntimeTokenizer.from_file(TOKENIZER_PATH); r=measure_pair(t,[{'role':'user','content':'问题'}],'甲'*500,'乙'*500); assert not r['fits'] and r['serialized'] is None and r['semantic_truncation_performed'] is False and r['decision']=='ABSTAIN_FALLBACK_A'";
    const result = spawnSync("python3", ["-c", py], { cwd: ROOT, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  },
  async test_latency_parallel_pair() {
    const pair = samplePair(); const started = performance.now();
    await dispatchR29P0Pair(pair.candidateA, pair.candidateB, async () => { await new Promise((resolveDelay) => setTimeout(resolveDelay, 45)); return true; });
    assert.ok(performance.now() - started < 80);
    assert.match(text("scripts/r29p0_live_experiment.mjs"), /pair_ready_ms/);
  },
  test_human_review_required() {
    assert.match(text("docs/R29P0_EQUIVALENCE_PAIRWISE_ORACLE.md"), /HUMAN_REVIEW_REQUIRED/);
    assert.match(text("scripts/r29p0_build_owner_review_pack.mjs"), /human_panel_a_completed: false/);
  },
  test_agent_review_not_human() {
    const fixture = jsonl("evals/r29p0_pairwise_oracle_v1/cases.jsonl")[0];
    const row = buildPanelABlindRecord(fixture, "A", "B", "x", "codex_agent_provisional_panel_a_not_human");
    assert.equal(row.packet.reviewer_class, "codex_agent_provisional_panel_a_not_human");
  },
  test_training_not_authorized_before_human_pass() {
    const policy = json("config/r29p0_live_policy.json");
    assert.equal(policy.training.training_started, false);
    assert.equal(policy.training.ranker_training_authorized, false);
    assert.equal(policy.training.optimizer_tokens, 0);
    assert.equal(policy.training.assistant_target_tokens, 0);
  },
  test_secret_redaction() {
    const sources = [text("scripts/r29p0_run_supervisor.py"), text("scripts/r29p0_live_experiment.mjs"), text("src/hybrid_runtime/r29p0_live_client.ts")];
    assert.ok(sources.every((source) => !/console\.log\([^\n]*(?:apiKey|DEEPSEEK_API_KEY)/u.test(source)));
    assert.match(text("scripts/r29p0_secret_scan.py"), /key_value_logged/);
  },
  test_no_production_change() {
    const result = spawnSync("git", ["diff", "--name-only", BASE_SHA], { cwd: ROOT, encoding: "utf8" });
    assert.equal(result.status, 0);
    const changed = result.stdout.split(/\r?\n/u).filter(Boolean);
    const allowed = /^(config\/r29p0_|docs\/R29P0_|evals\/r29p0_|prompts\/r29p0_|scripts\/r29p0_|scripts\/(?:check_hybrid_lab_isolation|r29b2m_r4h_no_backend_production_gate)\.mjs|src\/hybrid_runtime\/r29p0_|src\/hybrid_runtime\/protected_feature_signature\.ts|tests\/r29p0\/|package\.json)/u;
    assert.ok(changed.every((path) => allowed.test(path)), changed.join("\n"));
    assert.ok(changed.every((path) => !/^(web\/|api\/|app\/api\/|pages\/api\/|vercel\.json$)/u.test(path)));
  },
};

if (!(TEST in tests)) throw new Error(`unknown_r29p0_contract_test:${TEST}`);
await tests[TEST]();
console.log(JSON.stringify({ test: TEST, passed: true }));
