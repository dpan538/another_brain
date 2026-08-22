#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertControlledRequest,
  buildCanonicalAnswerRequest,
  buildConstrainedRewriteRequest,
  buildControlledOneCallRequest,
  controlledRequestInvariant,
  CONTROL_GUIDANCE,
} from "../src/hybrid_runtime/controlled_deepseek_request.ts";
import { decideHybridR3Terminal } from "../src/hybrid_runtime/hybrid_r3_quality_gate.ts";
import { validateLocalCriticPacketV1 } from "../src/hybrid_runtime/local_critic_packet_v1_validator.ts";
import { compileLocalSignalPacketV2 } from "../src/hybrid_runtime/local_signal_packet_v2_compiler.ts";
import { materializeOracleCriticPacket } from "../src/hybrid_runtime/oracle_local_critic.ts";
import { providerVarianceMetrics } from "../src/hybrid_runtime/r3_review_metrics.ts";
import { semanticPreservationGuard } from "../src/hybrid_runtime/semantic_preservation_guard.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = await readFile(join(ROOT, "prompts/hybrid_controlled_one_call_system_v3.txt"), "utf8");
const CANONICAL = await readFile(join(ROOT, "prompts/hybrid_canonical_answer_system_v3.txt"), "utf8");
const REWRITE = await readFile(join(ROOT, "prompts/hybrid_constrained_rewrite_system_v3.txt"), "utf8");
const MANIFEST = JSON.parse(await readFile(join(ROOT, "evals/r29b2m_hybrid_critic_v1/manifest.json"), "utf8"));
const ROWS = (await readFile(join(ROOT, "evals/r29b2m_hybrid_critic_v1/cases.jsonl"), "utf8")).trim().split(/\r?\n/u).map((line) => JSON.parse(line));
const AUDIT = JSON.parse(await readFile(join(ROOT, "reports/r3_request_config_audit.json"), "utf8"));

function firstRow() {
  return ROWS[0];
}

function guidance(row = firstRow()) {
  const user = [...row.messages].reverse().find((message) => message.role === "user").content;
  return compileLocalSignalPacketV2(row.oracle_local_signal_packet_v2, user).instruction;
}

function critic(canonical = "结论是甲比乙先到。") {
  return { version: "local-critic.v1", style_target: "concise_direct", issues: ["too_verbose"], preferred_spans: [{ text: canonical }] };
}

function changedPaths() {
  const tracked = execFileSync("git", ["diff", "--name-only", "0691d284f64770f7f35baeac1e7110eda9dfa05c"], { cwd: ROOT, encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" });
  return [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/u).filter(Boolean))];
}

function passingTwoStageMetrics() {
  return {
    unsupported_facts: 0,
    factual_relevance_nonregression: 1,
    overall_preference: 0.60,
    brand_preference: 0.65,
    semantic_guard_false_negative_critical_cases: 0,
    critical_regressions: 0,
    natural_voice_preference: 0.65,
    customer_service_tone_reduction: 0.30,
    over_explanation_reduction: 0.25,
    safe_rewrite_accept_rate: 0.40,
    final_answer_ready_p50_ms: 3_000,
    final_answer_ready_p95_ms: 5_000,
    final_answer_ready_max_ms: 8_000,
  };
}

const tests = {
  async explicit_temperature_zero() {
    for (const request of [
      buildControlledOneCallRequest(TEMPLATE, firstRow().messages, CONTROL_GUIDANCE),
      buildCanonicalAnswerRequest(CANONICAL, firstRow().messages),
      buildConstrainedRewriteRequest(REWRITE, firstRow().messages, "答案保持不变。", critic("答案保持不变。")),
    ]) {
      assertControlledRequest(request);
      assert.equal(request.temperature, 0);
      assert.equal(Object.hasOwn(request, "top_p"), false);
    }
    assert.equal(AUDIT.previous_temperature_explicit, false);
    assert.equal(AUDIT.previous_effective_temperature, 1);
  },
  async same_message_structure_control() {
    const row = firstRow();
    const control = buildControlledOneCallRequest(TEMPLATE, row.messages, CONTROL_GUIDANCE);
    const treatment = buildControlledOneCallRequest(TEMPLATE, row.messages, guidance(row));
    assert.deepEqual(controlledRequestInvariant(control), controlledRequestInvariant(treatment));
    assert.equal(control.messages.filter((message) => message.role === "system").length, 1);
    assert.equal(treatment.messages.filter((message) => message.role === "system").length, 1);
    assert.match(control.messages[0].content, /<LOCAL_GUIDANCE>\s*NONE\s*<\/LOCAL_GUIDANCE>/u);
    const strip = (value) => value.replace(/(<LOCAL_GUIDANCE>)[\s\S]*?(<\/LOCAL_GUIDANCE>)/u, "$1{{GUIDANCE}}$2");
    assert.equal(strip(control.messages[0].content), strip(treatment.messages[0].content));
    const harness = await readFile(join(ROOT, "scripts/r29b2m_r4h_r3_live_experiment.mjs"), "utf8");
    assert.match(harness, /\^\(\[\\s\\S\]\*\?<LOCAL_GUIDANCE>/u);
    assert.deepEqual(control.messages.slice(1), treatment.messages.slice(1));
  },
  async provider_replicate_variance() {
    assert.equal(MANIFEST.provider_baseline_12_case_ids.length, 12);
    const reviews = MANIFEST.provider_baseline_12_case_ids.map((pair_id, index) => ({
      pair_id,
      exact_text_match: index < 6,
      semantic_equivalent: index !== 0,
      factual_equivalent: index !== 0,
      major_wording_difference: index >= 6,
      replicate_A_unsupported_facts: 0,
      replicate_B_unsupported_facts: 0,
    }));
    const metrics = providerVarianceMetrics(reviews);
    assert.equal(metrics.request_count, 24);
    assert.equal(metrics.exact_text_match_rate, 0.5);
    assert.equal(metrics.provider_residual_variance_rate, 1 / 12);
  },
  async one_call_causal_pairing() {
    assert.equal(MANIFEST.one_call_diagnostic_12_case_ids.length, 12);
    assert.equal(new Set(MANIFEST.one_call_diagnostic_12_case_ids).size, 12);
    assert.deepEqual(MANIFEST.one_call_diagnostic_12_case_ids, MANIFEST.provider_baseline_12_case_ids);
    const harness = await readFile(join(ROOT, "scripts/r29b2m_r4h_r3_live_experiment.mjs"), "utf8");
    assert.match(harness, /\["A", "B"\].*one_call_diagnostic/su);
    assert.match(harness, /specs\.length !== 48/u);
    assert.match(harness, /assertOneCallPairControl/u);
  },
  async canonical_answer_independent_of_local() {
    const request = buildCanonicalAnswerRequest(CANONICAL, firstRow().messages);
    const text = JSON.stringify(request);
    assert.ok(!text.includes("LOCAL_GUIDANCE"));
    assert.ok(!text.includes("local-signal.v2"));
    assert.ok(!text.includes("quiet_warm"));
    assert.ok(!text.includes("anchors"));
    assert.equal(request.messages.filter((message) => message.role === "system").length, 1);
  },
  async critic_packet_no_new_facts() {
    const canonical = "会议改到2026年8月22日。";
    assert.equal(validateLocalCriticPacketV1(critic(canonical), canonical).valid, true);
    const injected = { ...critic(canonical), new_fact: "会议取消" };
    assert.equal(validateLocalCriticPacketV1(injected, canonical).valid, false);
    const schema = JSON.parse(await readFile(join(ROOT, "schemas/local_critic_packet_v1.schema.json"), "utf8"));
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(Object.keys(schema.properties).sort(), ["issues", "preferred_spans", "style_target", "version"]);
  },
  async critic_preferred_span_grounding() {
    const canonical = "甲先完成。乙随后完成。";
    const fixture = { version: "oracle-critic-fixture.v1", style_target: "balanced", issues: ["too_formal"], preferred_span_policy: "protect_first_conclusion_or_named_value" };
    const packet = materializeOracleCriticPacket(fixture, canonical, ["乙"]);
    assert.equal(packet.preferred_spans.length, 1);
    assert.ok(canonical.includes(packet.preferred_spans[0].text));
    const bad = structuredClone(packet); bad.preferred_spans[0].text = "丙先完成。";
    assert.equal(validateLocalCriticPacketV1(bad, canonical).valid, false);
  },
  async rewrite_semantic_source_of_truth() {
    const request = buildConstrainedRewriteRequest(REWRITE, firstRow().messages, "结论是不成立。", critic("结论是不成立。"));
    const system = request.messages[0].content;
    assert.match(system, /CANONICAL ANSWER IS THE SEMANTIC SOURCE OF TRUTH/u);
    for (const phrase of ["不得增加事实", "不得删除事实", "不得改变结论", "不得改变否定或肯定方向", "不得增加建议"]) assert.ok(system.includes(phrase));
  },
  async semantic_guard_number_change() {
    const result = semanticPreservationGuard("价格是20元。", "价格是30元。");
    assert.equal(result.accepted, false);
    assert.ok(result.rejection_reasons.some((reason) => reason.startsWith("protected_value_change")));
  },
  async semantic_guard_date_change() {
    const result = semanticPreservationGuard("日期是2026年8月22日。", "日期是2026年8月23日。");
    assert.equal(result.accepted, false);
    assert.ok(result.rejection_reasons.some((reason) => reason.startsWith("protected_value_change")));
  },
  async semantic_guard_negation_flip() {
    const result = semanticPreservationGuard("这个结论不成立。", "这个结论成立。");
    assert.equal(result.accepted, false);
    assert.ok(result.rejection_reasons.includes("negation_change"));
  },
  async semantic_guard_condition_removal() {
    const result = semanticPreservationGuard("如果家里有吹风机，就用冷风吹。", "用吹风机冷风吹。");
    assert.equal(result.accepted, false);
    assert.ok(result.rejection_reasons.includes("conditional_change"));
  },
  async semantic_guard_new_fact() {
    const result = semanticPreservationGuard("会议结束了。", "会议结束了，而且项目已经获得批准并进入生产部署。");
    assert.equal(result.accepted, false);
    assert.ok(result.rejection_reasons.some((reason) => reason.startsWith("semantic_edit_envelope")));
  },
  async semantic_guard_privacy_change() {
    const result = semanticPreservationGuard("我不能访问你的私人数据。", "我可以访问你的私人数据。", { boundary_decision: "refuse" });
    assert.equal(result.accepted, false);
    assert.ok(result.rejection_reasons.includes("privacy_or_boundary_decision_change"));
  },
  async semantic_guard_boundary_change() {
    const result = semanticPreservationGuard("不能替你冒充他人。", "可以替你冒充他人。", { boundary_decision: "refuse" });
    assert.equal(result.accepted, false);
    assert.ok(result.rejection_reasons.includes("privacy_or_boundary_decision_change"));
  },
  async fallback_to_canonical() {
    const canonical = "答案是12%。";
    const result = semanticPreservationGuard(canonical, "答案是21%。");
    assert.equal(result.accepted, false);
    assert.equal(result.final_answer, canonical);
    assert.equal(result.source_label, "hybrid_canonical_fallback");
  },
  async no_unvalidated_stream_to_user() {
    const harness = await readFile(join(ROOT, "scripts/r29b2m_r4h_r3_live_experiment.mjs"), "utf8");
    assert.match(harness, /unvalidated_stream_exposed:\s*false/gu);
    assert.ok(!harness.includes("streamRewriteToUser"));
    assert.equal(semanticPreservationGuard("原答案。", "原答案。 ").unvalidated_stream_exposed, false);
  },
  async control_reuses_exact_canonical() {
    const harness = await readFile(join(ROOT, "scripts/r29b2m_r4h_r3_live_experiment.mjs"), "utf8");
    assert.match(harness, /control_output_is_exact_canonical:\s*true/u);
    assert.match(harness, /control_api_request_count:\s*0/u);
    assert.ok(!harness.includes("two-stage:control"));
  },
  async two_call_request_count() {
    assert.equal(MANIFEST.two_stage_24_case_ids.length, 24);
    assert.equal(new Set(MANIFEST.two_stage_24_case_ids).size, 24);
    const policy = JSON.parse(await readFile(join(ROOT, "config/r29b2m_r4h_r3_live_policy.json"), "utf8"));
    assert.equal(policy.two_stage_requests, 48);
    assert.equal(policy.maximum_total_requests, 200);
  },
  async critic_execution_rate() {
    const harness = await readFile(join(ROOT, "scripts/r29b2m_r4h_r3_live_experiment.mjs"), "utf8");
    assert.match(harness, /critic_execution_count:\s*1/u);
    assert.match(harness, /rewrite_attempt_count:\s*1/u);
    assert.match(harness, /critic_execution_rate/u);
    assert.match(harness, /actual_efish_critic_model_trained:\s*false/u);
  },
  async latency_final_answer_ready() {
    const passing = passingTwoStageMetrics();
    const decision = decideHybridR3Terminal({ configuration_pass: true, secret_scan_pass: true, no_product_deployment: true, no_training: true, all_tests_pass: true, two_stage_metrics: passing });
    assert.equal(decision.terminal, "PASSED_CANONICAL_DRAFT_CRITIC_HYBRID");
    const failed = passingTwoStageMetrics(); failed.final_answer_ready_p95_ms = 5_001;
    assert.equal(decideHybridR3Terminal({ configuration_pass: true, secret_scan_pass: true, no_product_deployment: true, no_training: true, all_tests_pass: true, two_stage_metrics: failed }).terminal, "BLOCKED_HYBRID_ARCHITECTURE");
  },
  async secret_redaction() {
    const supervisor = await readFile(join(ROOT, "scripts/r29b2m_r4h_r3_run_supervisor.py"), "utf8");
    assert.match(supervisor, /key_value_logged.*False/u);
    for (const marker of ["key_length", "hashlib", "secret_prefix", "secret_suffix"]) assert.ok(!supervisor.includes(marker));
    execFileSync("node", ["scripts/r29b2m_r4h_r3_secret_scan.mjs"], { cwd: ROOT, stdio: "pipe" });
  },
  async no_training() {
    const paths = changedPaths();
    assert.ok(paths.every((path) => !path.startsWith("training/") && !/\.(pt|pth|ckpt|safetensors|gguf|onnx|bin)$/iu.test(path)));
    const text = (await Promise.all(paths.filter((path) => /\.(?:js|mjs|ts|py|json|md|txt)$/u.test(path) && !path.endsWith("r29b2m_r4h_r3_test_driver.mjs")).map((path) => readFile(join(ROOT, path), "utf8")))).join("\n");
    for (const marker of ["optimizer.step(", "loss.backward(", "model.train(", "mlx.optimizers", "torch.optim"]) assert.ok(!text.includes(marker));
    assert.match(text, /training_started["']?\s*[:=]\s*false/u);
  },
};

const name = process.argv[2];
if (!tests[name]) throw new Error(`unknown_test_case:${name}`);
await tests[name]();
console.log(JSON.stringify({ test: name, passed: true }));
