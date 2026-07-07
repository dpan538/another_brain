import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { buildReasoningPlan } from "../web/reasoning_plan_runtime.js";
import { buildEvidencePacket } from "../web/rag_evidence_runtime.js";

const JSON_FILES = [
  "training/current/reasoning_plan.schema.json",
  "training/current/evidence_packet.schema.json",
  "training/current/value_profile_packet.schema.json",
  "training/current/answer_obligation.schema.json",
  "training/current/teacher_probe.schema.json",
  "training/current/distillation_candidate.schema.json",
  "training/current/teacher_distillation_policy.r27a.json",
  "training/current/relation_evidence_index.r27a.json",
  "training/current/value_aesthetic_profile.r27a.json",
  "training/from_scratch/APPROVE_R27B_P0_DISTILLED_ANSWER_AS_USER_MICROCYCLE.template.json"
];
const REQUIRED_FILES = [
  "web/reasoning_plan_runtime.js",
  "web/rag_evidence_runtime.js",
  "training/current/teacher_probe_pack.r27a.jsonl",
  "evals/r27a_p0_reasoning_rag_value/prompts.jsonl",
  "docs/R27A_P0_REASONING_RAG_VALUE_DISTILLATION_ARCHITECTURE.md",
  "docs/current/REASONING_ARCHITECTURE.md",
  "docs/current/RAG_ARCHITECTURE.md",
  "docs/current/VALUE_AESTHETIC_ARCHITECTURE.md",
  "docs/current/TEACHER_DISTILLATION_STRATEGY.md",
  "docs/current/ANTI_MALICIOUS_FALLBACK_POLICY.md",
  "docs/R27A_NEXT_BOUNDARY.md"
];
const ALLOWED_R28M1_STATIC_Q4_SHARD = /^web\/another_brain\/model_assets\/r28m1\/shards\/model-q4-\d{5}\.bin$/;

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function readJsonl(file) {
  const text = await fs.readFile(file, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function main() {
  const failures = [];
  for (const file of [...JSON_FILES, ...REQUIRED_FILES]) {
    if (!await exists(file)) failures.push({ code: "missing_file", file });
  }
  for (const file of JSON_FILES) {
    try {
      await readJson(file);
    } catch (error) {
      failures.push({ code: "invalid_json", file, message: error.message });
    }
  }

  const plan = buildReasoningPlan("如果所有会飞的都不是鱼，小鸟会飞，小鸟是鱼吗？", {});
  const packet = buildEvidencePacket("白平衡有什么用？", { ...plan, needs_retrieval: true }, { cachedCards: [] });
  if (!plan.plan_id || plan.trace_only_no_cot !== true) failures.push({ code: "reasoning_plan_runtime_invalid" });
  if (!packet.packet_id || packet.private_data_allowed !== false || packet.chain_of_thought_allowed !== false) failures.push({ code: "evidence_packet_runtime_invalid" });

  const relation = await readJson("training/current/relation_evidence_index.r27a.json");
  if (!relation.ok || !relation.counts?.knowledge_cards) failures.push({ code: "relation_index_invalid" });
  const profile = await readJson("training/current/value_aesthetic_profile.r27a.json");
  if (!profile.ok || !profile.dimensions?.non_assistant_voice) failures.push({ code: "value_profile_invalid" });
  const probes = await readJsonl("training/current/teacher_probe_pack.r27a.jsonl");
  if (probes.length !== 80) failures.push({ code: "teacher_probe_count_invalid", count: probes.length });
  if (probes.some((row) => row.contains_private_data || row.chain_of_thought_requested || row.teacher_access_mode !== "disabled")) {
    failures.push({ code: "teacher_probe_policy_invalid" });
  }
  const evals = await readJsonl("evals/r27a_p0_reasoning_rag_value/prompts.jsonl");
  if (evals.length < 72) failures.push({ code: "r27a_eval_count_invalid", count: evals.length });

  const leak = spawnSync("node", ["scripts/check_r27a_no_answer_bank_or_teacher_leak.mjs"], { encoding: "utf8" });
  if (leak.status !== 0) failures.push({ code: "no_answer_bank_or_teacher_leak_failed", stdout: leak.stdout, stderr: leak.stderr });

  const approvals = spawnSync("node", ["scripts/check_training_approval_markers.mjs"], { encoding: "utf8" });
  if (approvals.status !== 0) failures.push({ code: "training_approval_markers_failed", stdout: approvals.stdout, stderr: approvals.stderr });

  const weights = spawnSync("git", ["ls-files"], { encoding: "utf8" });
  const trackedWeights = weights.stdout
    .split(/\r?\n/)
    .filter((file) => /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i.test(file))
    .filter((file) => !ALLOWED_R28M1_STATIC_Q4_SHARD.test(file));
  if (trackedWeights.length) failures.push({ code: "tracked_weights_present", files: trackedWeights });

  const report = {
    ok: failures.length === 0,
    schemas_checked: JSON_FILES.length,
    teacher_probe_count: probes.length,
    eval_prompt_count: evals.length,
    relation_index_cards: relation.counts?.knowledge_cards || 0,
    value_profile_dimensions: Object.keys(profile.dimensions || {}),
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
