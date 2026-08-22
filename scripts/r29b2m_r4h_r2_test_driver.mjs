#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { deterministicLengthPolicy } from "../src/hybrid_runtime/dialogue_act_heuristic.ts";
import { decideHybridV2Terminal } from "../src/hybrid_runtime/hybrid_v2_quality_gate.ts";
import { compileLocalSignalPacketV2, LOCAL_SIGNAL_V2_PREFERRED_TOKEN_BUDGET, LOCAL_SIGNAL_V2_TOKEN_BUDGET } from "../src/hybrid_runtime/local_signal_packet_v2_compiler.ts";
import { validateLocalSignalPacketV2 } from "../src/hybrid_runtime/local_signal_packet_v2_validator.ts";
import { sanitizeTelemetryError } from "../src/hybrid_runtime/hybrid_telemetry.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rows = (await readFile(join(ROOT, "evals/r29b2m_hybrid_product_v2/cases.jsonl"), "utf8")).trim().split(/\r?\n/u).map((line) => JSON.parse(line));
const v1Rows = (await readFile(join(ROOT, "evals/r29b2m_hybrid_product_v1/cases.jsonl"), "utf8")).trim().split(/\r?\n/u).map((line) => JSON.parse(line));
const manifest = JSON.parse(await readFile(join(ROOT, "evals/r29b2m_hybrid_product_v2/manifest.json"), "utf8"));
const audit = JSON.parse(await readFile(join(ROOT, "evals/r29b2m_hybrid_product_v2/packet_audit.json"), "utf8"));
const forensics = JSON.parse(await readFile(join(ROOT, "reports/v1_failure_forensics.json"), "utf8"));

function latestUser(row) {
  return [...row.messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function basePacket() {
  return structuredClone(rows[0].oracle_local_signal_packet_v2);
}

function passingMetrics() {
  return {
    configuration_pass: true,
    unsupported_facts: 0,
    factual_relevance_nonregression: 1,
    therapy_critical_errors: 0,
    privacy_critical_errors: 0,
    identity_critical_errors: 0,
    overall_preference: 0.60,
    brand_preference: 0.65,
    packet_adherence: 0.90,
    customer_service_tone_reduction: 0.30,
    over_explanation_reduction: 0.25,
    measurable_local_influence: 0.60,
    substantive_local_influence: 0.25,
    deepseek_only_ttft_p95_ms: 1_000,
    hybrid_ttft_p95_ms: 1_100,
    hybrid_completion_p95_ms: 2_000,
    secret_scan_pass: true,
    no_production_modifications: true,
    all_tests_pass: true,
  };
}

function workingTreePaths() {
  const tracked = execFileSync("git", ["diff", "--name-only", "23fc26f25aaa6055aee4ceab62b9f67964c84c49"], { cwd: ROOT, encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" });
  return [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/u).filter(Boolean))];
}

const tests = {
  async packet_v2_schema() {
    const schema = JSON.parse(await readFile(join(ROOT, "schemas/local_signal_packet_v2.schema.json"), "utf8"));
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["version", "anchors", "style"]);
    assert.deepEqual(Object.keys(schema.properties).sort(), ["anchors", "style", "version"]);
    assert.equal(schema.properties.anchors.maxItems, 4);
    assert.deepEqual(new Set(schema.properties.anchors.items.properties.role.enum), new Set(["context", "emphasis", "question_core", "contrast", "constraint", "tone_cue"]));
    assert.deepEqual(new Set(schema.properties.style.properties.label.enum), new Set(["quiet_warm", "concise_direct", "reflective", "playful_light", "balanced", "matter_of_fact"]));
  },
  async v2_rejects_affect() {
    const packet = basePacket(); packet.affect = { label: "frustrated" };
    assert.equal(validateLocalSignalPacketV2(packet, latestUser(rows[0])).valid, false);
  },
  async v2_rejects_dialogue_act() {
    const packet = basePacket(); packet.dialogue_act = { label: "logic_question" };
    assert.equal(validateLocalSignalPacketV2(packet, latestUser(rows[0])).valid, false);
  },
  async v2_rejects_emotional_rules() {
    const packet = basePacket(); packet.emotional_rule_ids = ["frustration_acknowledge_before_advice"];
    assert.equal(validateLocalSignalPacketV2(packet, latestUser(rows[0])).valid, false);
  },
  async v2_rejects_response_shape() {
    const packet = basePacket(); packet.response_shape = { maximum_characters: 80 };
    assert.equal(validateLocalSignalPacketV2(packet, latestUser(rows[0])).valid, false);
  },
  async v2_rejects_confidence() {
    const packet = basePacket(); packet.confidence = 0.99;
    assert.equal(validateLocalSignalPacketV2(packet, latestUser(rows[0])).valid, false);
  },
  async v2_exact_anchor_grounding() {
    for (const row of rows) {
      const user = latestUser(row);
      const packet = row.oracle_local_signal_packet_v2;
      assert.deepEqual(validateLocalSignalPacketV2(packet, user).errors, []);
      for (const anchor of packet.anchors) {
        assert.equal(Array.from(user).slice(anchor.start_codepoint, anchor.end_codepoint).join(""), anchor.text);
      }
    }
    const packet = basePacket(); packet.anchors[0].text += "近义词";
    assert.equal(validateLocalSignalPacketV2(packet, latestUser(rows[0])).valid, false);
  },
  async v2_anchor_offsets() {
    const user = "🙂一直被催，有点烦";
    const packet = {
      version: "local-signal.v2",
      anchors: [
        { text: "一直被催", start_codepoint: 1, end_codepoint: 5, salience: 0.91, role: "context" },
        { text: "有点烦", start_codepoint: 6, end_codepoint: 9, salience: 0.84, role: "tone_cue" },
      ],
      style: { label: "quiet_warm" },
    };
    assert.equal(validateLocalSignalPacketV2(packet, user).valid, true);
    const bad = structuredClone(packet); bad.anchors[1].start_codepoint = 5;
    assert.equal(validateLocalSignalPacketV2(bad, user).valid, false);
    const overlap = structuredClone(packet); overlap.anchors[1] = { text: "被催，有点烦", start_codepoint: 3, end_codepoint: 9, salience: 0.8, role: "emphasis" };
    assert.equal(validateLocalSignalPacketV2(overlap, user).valid, false);
  },
  async v2_style_only_expression_control() {
    const base = basePacket();
    const user = latestUser(rows[0]);
    const instructions = [];
    for (const style of ["quiet_warm", "concise_direct", "reflective", "playful_light", "balanced", "matter_of_fact"]) {
      const packet = structuredClone(base); packet.style.label = style;
      const compiled = compileLocalSignalPacketV2(packet, user);
      instructions.push(compiled.instruction.replace(style, "STYLE"));
      assert.deepEqual(compiled.fields_used, ["anchors", "style"]);
    }
    assert.equal(new Set(instructions).size, 1);
    const prompt = await readFile(join(ROOT, "prompts/hybrid_dialogue_system_v2.txt"), "utf8");
    assert.match(prompt, /表达风格只改变说法，不得增加事实、改变结论、暗示用户情绪/);
  },
  async v2_compiler_no_new_fact() {
    for (const row of rows) {
      const user = latestUser(row);
      const packet = row.oracle_local_signal_packet_v2;
      const compiled = compileLocalSignalPacketV2(packet, user);
      const expectedAnchors = packet.anchors.map((anchor) => `“${anchor.text.replace(/[“”]/gu, "") }”`).join("、");
      assert.equal(compiled.instruction, `关注：${expectedAnchors}。风格：${packet.style.label}。只控表达；不推断含义、情绪、事实或结论`);
      assert.ok(packet.anchors.every((anchor) => user.includes(anchor.text)));
      for (const forbidden of ["frustrated", "sad", "loss of control", "用户感到", "用户认为", "应该回答", "答案是"]) assert.ok(!compiled.instruction.includes(forbidden));
    }
  },
  async v2_instruction_token_budget() {
    const compiled = rows.map((row) => compileLocalSignalPacketV2(row.oracle_local_signal_packet_v2, latestUser(row)));
    assert.ok(compiled.every((item) => item.estimated_tokens <= LOCAL_SIGNAL_V2_TOKEN_BUDGET));
    const paired = rows.filter((row) => manifest.paired_case_ids.includes(row.case_id)).map((row) => compileLocalSignalPacketV2(row.oracle_local_signal_packet_v2, latestUser(row)));
    assert.equal(paired.length, 30);
    assert.ok(paired.every((item) => item.estimated_tokens <= LOCAL_SIGNAL_V2_PREFERRED_TOKEN_BUDGET));
  },
  async v1_failure_forensics() {
    assert.equal(forensics.source_terminal_observed, "BLOCKED_HYBRID_VALUE");
    assert.equal(forensics.source_terminal_modified, false);
    assert.equal(forensics.evidence_summary.hybrid_losses, 12);
    assert.equal(forensics.evidence_summary.factual_or_relevance_regressions, 6);
    assert.equal(forensics.evidence_summary.hybrid_unsupported_facts, 3);
    assert.equal(forensics.cases.length, 14);
    const expectedFields = ["anchor", "affect", "emotional_rule", "local_angle", "style", "avoid", "response_shape"];
    for (const row of forensics.cases) {
      assert.deepEqual(Object.keys(row.field_contribution).sort(), [...expectedFields].sort());
      assert.ok(row.v1_packet_fields);
      assert.ok(row.how_v2_prevents_recurrence);
    }
    const oldTerminal = JSON.parse(await readFile(join(ROOT, "artifacts/r29b2m_r4h_r1/reports/final_terminal.json"), "utf8"));
    assert.equal(oldTerminal.terminal, "BLOCKED_HYBRID_VALUE");
  },
  async same_30_case_pairing() {
    const byFamily = Map.groupBy(v1Rows, (row) => row.family);
    const take = (family, count, offset = 0) => byFamily.get(family).slice(offset, offset + count);
    const expected = [
      ...take("ordinary_daily_conversation", 4, 1), ...take("emotional_acknowledgement", 4, 1),
      ...take("practical_daily_question", 5, 1), ...take("rewrite_summary", 2, 1),
      ...take("comparison_opinion", 2, 1), ...take("logic_question", 5, 1),
      ...take("philosophical_question", 5, 1), ...take("uncertainty_clarification", 2, 1),
      ...take("identity_privacy_boundary", 1, 1),
    ].map((row) => row.case_id);
    assert.deepEqual(manifest.paired_case_ids, expected);
    assert.equal(new Set(manifest.paired_case_ids).size, 30);
    for (const id of expected) {
      assert.deepEqual(rows.find((row) => row.case_id === id).messages, v1Rows.find((row) => row.case_id === id).messages);
    }
  },
  async quality_priority_factual_first() {
    const valueAndFactualFail = passingMetrics();
    valueAndFactualFail.unsupported_facts = 1;
    valueAndFactualFail.overall_preference = 0;
    valueAndFactualFail.brand_preference = 0;
    assert.equal(decideHybridV2Terminal(valueAndFactualFail).terminal, "BLOCKED_HYBRID_V2_FACTUAL");
    const valueFail = passingMetrics(); valueFail.overall_preference = 0.59;
    assert.equal(decideHybridV2Terminal(valueFail).terminal, "BLOCKED_HYBRID_V2_VALUE");
    const safetyFail = passingMetrics(); safetyFail.privacy_critical_errors = 1;
    assert.equal(decideHybridV2Terminal(safetyFail).terminal, "BLOCKED_HYBRID_V2_FACTUAL");
    const passed = decideHybridV2Terminal(passingMetrics());
    assert.equal(passed.terminal, "PASSED_HYBRID_V2_VALUE"); assert.equal(passed.training_authorized, true);
  },
  async no_signal_training() {
    const paths = workingTreePaths();
    assert.ok(paths.every((path) => !path.startsWith("training/") && !/\.(pt|pth|ckpt|safetensors|gguf|onnx|bin)$/iu.test(path)));
    const relevant = paths.filter((path) => /^(src\/hybrid_runtime|scripts\/r29b2m_r4h_r2|prompts\/hybrid|evals\/r29b2m_hybrid_product_v2|reports\/|schemas\/local_signal_packet_v2)/u.test(path) && !path.endsWith("_test_driver.mjs"));
    const text = (await Promise.all(relevant.map((path) => readFile(join(ROOT, path), "utf8")))).join("\n");
    for (const marker of ["optimizer.step(", "loss.backward(", "model.train(", "mlx.optimizers", "torch.optim"]) assert.ok(!text.includes(marker));
  },
  async secret_redaction() {
    const redacted = sanitizeTelemetryError(new Error("Authorization: sample-sensitive-value API key=another-sensitive-value"));
    assert.ok(!redacted.includes("sample-sensitive-value")); assert.ok(!redacted.includes("another-sensitive-value"));
    const supervisor = await readFile(join(ROOT, "scripts/r29b2m_r4h_r2_run_supervisor.py"), "utf8");
    assert.match(supervisor, /key_value_logged.*False/); assert.ok(!supervisor.includes("key_length")); assert.ok(!supervisor.includes("hashlib"));
    execFileSync("node", ["scripts/r29b2m_r4h_r2_secret_scan.mjs"], { cwd: ROOT, stdio: "pipe" });
  },
  async v2_oracle_audit() {
    assert.equal(rows.length, 120);
    assert.equal(audit.pass, true);
    assert.equal(audit.packet_valid_rate, 1);
    assert.equal(audit.anchor_exact_grounding_rate, 1);
    assert.equal(audit.unsupported_packet_facts, 0);
    assert.equal(audit.psychological_inference, 0);
    assert.equal(audit.extra_semantic_claims, 0);
    assert.equal(audit.reviewer_class, "codex_agent_packet_v2_review_not_human");
    assert.equal(audit.v1_anchor_sets_identical_after_independent_generation, 0);
    assert.ok(rows.every((row) => row.allowed_for_training === false && !Object.hasOwn(row, "target")));
  },
  async dialogue_heuristic_length_only() {
    const examples = [
      ["今天有点累。", "ordinary", 80], ["雨鞋怎么晾干？", "practical", 120],
      ["把这句压成一句话。", "rewrite_summary", null], ["如果A就B，能推出什么？", "logic", 180],
      ["选择的价值是什么？", "philosophy", 180], ["你是谁？", "boundary", 80],
    ];
    for (const [text, expectedClass, maximum] of examples) {
      const policy = deterministicLengthPolicy(text);
      assert.equal(policy.dialogue_class, expectedClass); assert.equal(policy.maximum_chinese_characters, maximum);
      assert.ok(!policy.instruction.includes(expectedClass));
    }
  },
  async no_product_modification() {
    const paths = workingTreePaths();
    assert.ok(paths.every((path) => !path.startsWith("web/") && !path.startsWith("api/") && path !== "vercel.json"));
  },
};

const name = process.argv[2];
if (!tests[name]) throw new Error(`unknown_test_case:${name}`);
await tests[name]();
console.log(JSON.stringify({ test: name, passed: true }));
