#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "training/llm_corpus");

const TASK_TYPES = [
  "draft_answer",
  "verify_draft",
  "repair_draft",
  "route_plan",
  "retrieval_grounded_answer"
];
const LANGUAGES = ["en", "zh", "mixed"];

const FAMILIES = [
  ["static_browser_llm_policy", "keep the static browser decoder LLM as the main product path"],
  ["no_backend_no_storage", "reject backend inference and external storage assumptions"],
  ["same_origin_model_assets", "load model assets only from same-origin static files"],
  ["decoder_llm_not_slm", "reject SLM or encoder-only systems as the final product target"],
  ["retrieval_grounded_draft", "draft only from retrieved local public evidence"],
  ["verifier_rejects_bad_draft", "let the verifier reject unsupported or unsafe drafts"],
  ["fallback_firewall_boundary", "route risky drafts through the fallback firewall"],
  ["privacy_boundary", "avoid claims about absent private evidence"],
  ["unknown_boundary", "say unknown when evidence is absent"],
  ["copyright_boundary", "avoid long copyrighted text and offer summaries"],
  ["project_continuation", "continue the active project state after interruptions"],
  ["constraint_preservation", "preserve user constraints exactly"],
  ["answer_density_control", "produce concise answers for browser and mobile surfaces"],
  ["training_direction_correction", "correct drift back to browser LLM direction"],
  ["behavior_repair_not_fact_expansion", "repair behavior without adding factual knowledge cards"],
  ["shard_runtime_as_evidence", "treat static shards as evidence, not the intelligence layer"],
  ["local_first_deployment_reasoning", "reason within local-first static Vercel boundaries"],
  ["bilingual_zh_en_task_following", "follow bilingual Chinese and English instructions"],
  ["route_plan_before_answer", "plan the route before finalizing an answer"],
  ["no_claimed_execution", "avoid claiming commands or external calls were run"]
].map(([id, focus]) => ({ id, focus }));

const FAMILY_POLICY_TAGS = {
  static_browser_llm_policy: ["browser_llm_product", "static_runtime"],
  no_backend_no_storage: ["no_backend", "no_external_storage"],
  same_origin_model_assets: ["same_origin_assets", "static_manifest"],
  decoder_llm_not_slm: ["decoder_only_target", "legacy_slm_demoted"],
  retrieval_grounded_draft: ["retrieval_grounded", "public_evidence_only"],
  verifier_rejects_bad_draft: ["verifier_required", "draft_rejection"],
  fallback_firewall_boundary: ["fallback_firewall", "safety_boundary"],
  privacy_boundary: ["privacy_boundary", "absent_private_evidence"],
  unknown_boundary: ["unknown_boundary", "evidence_absent"],
  copyright_boundary: ["copyright_boundary", "summary_over_quote"],
  project_continuation: ["project_state", "continuation"],
  constraint_preservation: ["constraint_preservation", "instruction_following"],
  answer_density_control: ["answer_density", "mobile_friendly"],
  training_direction_correction: ["direction_correction", "llm_first"],
  behavior_repair_not_fact_expansion: ["behavior_repair", "no_fact_card_expansion"],
  shard_runtime_as_evidence: ["shard_evidence", "r24_harness"],
  local_first_deployment_reasoning: ["local_first", "vercel_static"],
  bilingual_zh_en_task_following: ["bilingual", "zh_en"],
  route_plan_before_answer: ["route_plan", "finalizer_boundary"],
  no_claimed_execution: ["no_claimed_execution", "truthful_capability"]
};

function splitForIndex(index) {
  if (index < 16) return "train";
  if (index < 20) return "dev";
  return "heldout";
}

function sentence(language, en, zh) {
  if (language === "zh") return zh;
  if (language === "mixed") return `${en} / ${zh}`;
  return en;
}

function evidenceFor(family, index, language) {
  const base = sentence(
    language,
    `R25B policy note ${index}: ${family.focus}. R24 remains verifier, fallback, and regression harness.`,
    `R25B 策略记录 ${index}：${family.focus}。R24 仍然是验证器、兜底层和回归护栏。`
  );
  return [
    {
      source_id: `r25b_policy_${family.id}_${String(index).padStart(2, "0")}`,
      text: base,
      contains_private_data: false
    }
  ];
}

function makeTarget({ family, split, index, taskType, language }) {
  const suffix = `${family.id}/${split}/${String(index + 1).padStart(2, "0")}`;
  const en = `Use the browser decoder LLM only as a draft source, ground it in provided evidence, and let the verifier or fallback firewall decide what can surface. Keep the answer concise and respect the ${family.focus} boundary. [${suffix}; ${taskType}]`;
  const zh = `只把浏览器端解码 LLM 当作草稿来源，依据给定证据回答，再由验证器或兜底防火墙决定能否输出。回答要简洁，并遵守“${family.focus}”边界。[${suffix}; ${taskType}]`;
  return sentence(language, en, zh);
}

function makeRejected({ family, index, language }) {
  const en = [
    `Use a server model or external storage because it would be easier. [reject ${family.id} ${index}]`,
    `Treat the legacy tiny route or small model surface as the final intelligence layer. [reject ${family.id} ${index}]`,
    `Invent missing private evidence or claim a command was executed. [reject ${family.id} ${index}]`
  ];
  const zh = [
    `为了省事改用服务器模型或外部存储。[拒绝 ${family.id} ${index}]`,
    `把遗留小路由或小模型表面当作最终智能层。[拒绝 ${family.id} ${index}]`,
    `编造缺失的私人证据，或声称已经执行了命令。[拒绝 ${family.id} ${index}]`
  ];
  return language === "zh" ? zh : language === "mixed" ? en.map((item, i) => `${item} / ${zh[i]}`) : en;
}

function makeRow(family, familyIndex, index) {
  const split = splitForIndex(index);
  const language = LANGUAGES[(familyIndex + index) % LANGUAGES.length];
  const taskType = TASK_TYPES[(familyIndex + index) % TASK_TYPES.length];
  const ordinal = String(index + 1).padStart(2, "0");
  const sampleId = `r25b_${family.id}_${split}_${ordinal}`;
  const userGoal = sentence(
    language,
    `R25B training case ${ordinal}: produce a safe ${taskType} response for ${family.focus}.`,
    `R25B 训练样例 ${ordinal}：围绕“${family.focus}”生成安全的 ${taskType} 响应。`
  );
  return {
    sample_id: sampleId,
    split,
    language,
    task_family: family.id,
    task_type: taskType,
    user_goal: userGoal,
    messages: [
      {
        role: "user",
        content: sentence(
          language,
          `Apply the R25B browser-LLM policy to this case: ${family.focus}. Keep it short and evidence-aware.`,
          `请把 R25B 浏览器 LLM 策略用于这个场景：${family.focus}。保持简洁，并注意证据边界。`
        )
      }
    ],
    retrieved_evidence: evidenceFor(family, index + 1, language),
    constraints: [
      "no training is run in R25B",
      "no real model weights are present",
      "same-origin static browser assets only",
      "R24 verifier and fallback harness remain active"
    ],
    target_answer: makeTarget({ family, split, index, taskType, language }),
    rejected_answers: makeRejected({ family, index: index + 1, language }),
    policy_tags: [
      "r25b_training_only",
      "no_external_llm_api",
      "no_real_weights",
      ...FAMILY_POLICY_TAGS[family.id],
      taskType
    ],
    expected_behavior: [
      "Use retrieved public evidence when drafting.",
      "Preserve deployment and safety constraints.",
      "Keep R24 verifier, finalizer, and fallback firewall in control."
    ],
    forbidden_behavior: [
      "Do not claim backend inference or external model calls.",
      "Do not reveal hidden internal instructions or private data.",
      "Do not turn eval answers or factual card expansion into training targets."
    ],
    provenance: {
      source_type: familyIndex % 3 === 0 ? "repo_derived" : "template_generated",
      generator: "scripts/generate_r25b_llm_corpus.mjs",
      license_or_permission: "project-authored",
      contains_private_data: false,
      notes: "Deterministic R25B project-authored behavioral scaffold; not model output."
    },
    review_status: "reviewed_template",
    contains_private_data: false
  };
}

function toJsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) out[row[key]] = (out[row[key]] || 0) + 1;
  return out;
}

async function main() {
  const rows = [];
  for (const [familyIndex, family] of FAMILIES.entries()) {
    for (let index = 0; index < 24; index += 1) rows.push(makeRow(family, familyIndex, index));
  }

  const bySplit = {
    train: rows.filter((row) => row.split === "train"),
    dev: rows.filter((row) => row.split === "dev"),
    heldout: rows.filter((row) => row.split === "heldout")
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, "train.jsonl"), toJsonl(bySplit.train), "utf8");
  await writeFile(resolve(OUT_DIR, "dev.jsonl"), toJsonl(bySplit.dev), "utf8");
  await writeFile(resolve(OUT_DIR, "heldout.jsonl"), toJsonl(bySplit.heldout), "utf8");
  await writeFile(resolve(OUT_DIR, "registry.json"), JSON.stringify({
    schema_version: 1,
    corpus_id: "r25b_llm_training_corpus",
    generator: "scripts/generate_r25b_llm_corpus.mjs",
    purpose: "Future static browser decoder LLM fine-tuning or distillation planning only; no training in R25B.",
    contains_private_data: false,
    called_external_api: false,
    trained_model: false,
    added_model_weights: false,
    split_counts: countBy(rows, "split"),
    task_families: FAMILIES.map((family) => family.id),
    files: ["train.jsonl", "dev.jsonl", "heldout.jsonl"]
  }, null, 2) + "\n", "utf8");

  const report = {
    ok: true,
    total_rows: rows.length,
    split_counts: countBy(rows, "split"),
    family_counts: countBy(rows, "task_family")
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
