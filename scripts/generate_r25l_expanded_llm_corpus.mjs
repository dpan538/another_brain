#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = "training/from_scratch/r25l_corpus_expansion_config.json";
const GENERATOR = "scripts/generate_r25l_expanded_llm_corpus.mjs";

const LANGUAGES = ["en", "zh", "mixed"];
const TASK_TYPES = [
  "draft_answer",
  "verify_draft",
  "repair_draft",
  "route_plan",
  "retrieval_grounded_answer",
  "constraint_preservation",
  "no_backend_policy",
  "tokenizer_sensitive_prompt",
  "toy_training_boundary",
  "release_packaging_boundary"
];

const FAMILIES = [
  ["static_browser_runtime", "keep drafting inside same-origin static browser runtime"],
  ["r24_verifier_wrapper", "route drafts through verifier, finalizer, and fallback checks"],
  ["no_backend_policy", "reject backend inference and external storage dependencies"],
  ["from_scratch_training_direction", "preserve from-scratch project training as the product direction"],
  ["tokenizer_boundary", "separate tokenizer dry-run preparation from model training"],
  ["toy_training_boundary", "describe toy overfit as pipeline mechanics only"],
  ["release_packaging_boundary", "treat static admission as release packaging, not training"],
  ["constraint_preservation", "preserve user constraints before optimizing answer style"],
  ["retrieval_grounded_answering", "answer from provided generic evidence when it exists"],
  ["evidence_absence_unknown", "say unknown when evidence is absent"],
  ["privacy_boundary", "avoid private raw data and local source paths"],
  ["eval_split_integrity", "keep eval and heldout text out of training"],
  ["dialogue_density", "keep browser answers compact without losing constraints"],
  ["bilingual_following", "follow English, Chinese, and mixed prompts"],
  ["repair_after_rejection", "repair rejected drafts without inventing facts"],
  ["route_before_answer", "choose a route before final answer text"],
  ["fallback_firewall", "use controlled fallback for unsafe or unsupported drafts"],
  ["artifact_admission", "require manifest and hash checks before release assets"],
  ["capacity_budget", "fit later quantized artifacts inside the static envelope"],
  ["provenance_review", "keep source, generator, and review fields explicit"],
  ["no_claimed_execution", "do not claim commands or network calls were run"],
  ["runtime_worker_boundary", "separate worker loading from model quality claims"],
  ["heldout_regression", "reserve heldout rows for regression checks"],
  ["anti_answer_bank", "avoid answer-bank expansion as intelligence substitute"],
  ["static_cache_boundary", "allow browser-local cache without external storage"],
  ["approval_marker_boundary", "require explicit phase approval for training runs"],
  ["checkpoint_hygiene", "keep checkpoints ignored until release review"],
  ["small_pilot_planning", "plan a bounded small decoder pilot without running it"],
  ["training_progress_truth", "keep formal progress at zero until training starts"],
  ["product_claim_boundary", "avoid claiming a product model exists before admission"],
  ["source_license_boundary", "use only project-authored reviewed text"],
  ["rejected_answer_learning", "learn to identify bad drafts from rejected examples"],
  ["mobile_response_shape", "answer in a shape suitable for small screens"],
  ["mixed_context_followup", "bind follow-up turns to the visible context"],
  ["tokenizer_sensitive_prompt", "preserve punctuation, roles, and zh/en boundaries"],
  ["same_origin_assets", "load future assets only from same-origin static paths"],
  ["recovery_candidate_green", "keep recovery gates green before and after pilots"],
  ["no_product_toy", "do not confuse toy artifacts with product checkpoints"],
  ["reviewer_reportability", "produce reports that a reviewer can audit"],
  ["static_release_disabled", "keep browser release disabled until artifact admission"]
].map(([id, focus]) => ({ id, focus }));

const STYLE_VARIANTS = [
  "short_direct",
  "evidence_first",
  "boundary_first",
  "repair_mode",
  "reviewer_note",
  "mobile_compact"
];

const EVIDENCE_VARIANTS = [
  "The local plan says static browser drafting must stay wrapped by verifier and fallback gates.",
  "The training plan separates tokenizer dry-runs, toy sanity checks, and later decoder pilots.",
  "The release policy requires ignored artifacts to pass review before any static asset admission.",
  "The corpus policy prefers behavior, provenance, and boundary examples over memorized answers.",
  "The deployment policy bans remote inference paths and external storage for model loading.",
  "The progress report must distinguish planning progress from formal decoder training."
];

const ZH_EVIDENCE_VARIANTS = [
  "本地计划要求浏览器端草稿始终经过验证器和兜底护栏。",
  "训练计划区分 tokenizer dry-run、玩具 sanity check 和后续小型解码器 pilot。",
  "发布策略要求忽略目录中的产物先经过审查，才能进入静态资产准入。",
  "语料策略优先训练行为、来源和边界，而不是背答案。",
  "部署策略禁止远程推理路径和外部存储承担模型加载。",
  "进度报告必须区分规划进展和正式解码器训练。"
];

function sentence(language, en, zh) {
  if (language === "zh") return zh;
  if (language === "mixed") return `${en} / ${zh}`;
  return en;
}

function splitForIndex(index) {
  if (index < 40) return "train";
  if (index < 50) return "dev";
  return "heldout";
}

function splitOrdinal(index) {
  if (index < 40) return index + 1;
  if (index < 50) return index - 39;
  return index - 49;
}

function evidenceText(language, family, globalIndex) {
  const index = globalIndex % EVIDENCE_VARIANTS.length;
  const en = `R25L generic evidence ${globalIndex + 1}: ${EVIDENCE_VARIANTS[index]} Focus: ${family.focus}.`;
  const zh = `R25L 通用证据 ${globalIndex + 1}：${ZH_EVIDENCE_VARIANTS[index]} 重点：${family.focus}。`;
  return sentence(language, en, zh);
}

function makeMessages(language, family, taskType, index, style) {
  const opening = sentence(
    language,
    `Prepare a ${taskType} response for the R25L ${family.id} boundary.`,
    `请为 R25L 的 ${family.id} 边界准备一个 ${taskType} 响应。`
  );
  const constraint = sentence(
    language,
    `Keep the answer project-authored, evidence-aware, and clear that this is not a training run. Style variant: ${style}.`,
    `保持项目自写、依据证据，并说明这不是训练运行。样式变体：${style}。`
  );
  if (index % 5 === 0) {
    return [
      { role: "user", content: opening },
      {
        role: "assistant",
        content: sentence(
          language,
          "I will preserve the boundary and check the provided evidence before drafting.",
          "我会先保留边界，并检查给定证据后再起草。"
        )
      },
      { role: "user", content: constraint }
    ];
  }
  return [{ role: "user", content: `${opening} ${constraint}` }];
}

function makeTarget({ language, family, split, splitIndex, taskType, style }) {
  const marker = `${family.id}/${split}/${String(splitIndex).padStart(3, "0")}/${taskType}/${style}`;
  const en = `R25L ${taskType} answer: keep ${family.focus}; use only the supplied generic evidence; preserve no-backend, no-private-data, and from-scratch boundaries; report uncertainty instead of inventing missing support. Marker ${marker}.`;
  const zh = `R25L ${taskType} 回答：保持“${family.focus}”；只使用给定通用证据；保留无后端、无私人数据、从零训练边界；缺少支持时说明不确定，而不是编造。标记 ${marker}。`;
  return sentence(language, en, zh);
}

function makeRejected(language, family, splitIndex) {
  const en = [
    `Claim that a product decoder already exists for ${family.id}. Reject ${splitIndex}.`,
    `Use remote inference or copied eval text to solve ${family.id}. Reject ${splitIndex}.`,
    `Treat ignored planning artifacts as release weights for ${family.id}. Reject ${splitIndex}.`
  ];
  const zh = [
    `声称 ${family.id} 已经有产品级解码器。拒绝 ${splitIndex}。`,
    `用远程推理或复制 eval 文本解决 ${family.id}。拒绝 ${splitIndex}。`,
    `把被忽略的规划产物当成 ${family.id} 的发布权重。拒绝 ${splitIndex}。`
  ];
  return language === "zh" ? zh : language === "mixed" ? en.map((item, i) => `${item} / ${zh[i]}`) : en;
}

function makeRow(config, family, familyIndex, index) {
  const split = splitForIndex(index);
  const splitIndex = splitOrdinal(index);
  const language = LANGUAGES[(familyIndex + index) % LANGUAGES.length];
  const taskType = TASK_TYPES[(familyIndex * 3 + index) % TASK_TYPES.length];
  const style = STYLE_VARIANTS[(familyIndex + index * 2) % STYLE_VARIANTS.length];
  const sampleId = `r25l_${family.id}_${split}_${String(splitIndex).padStart(3, "0")}`;
  const evidence = evidenceText(language, family, familyIndex * 60 + index);
  return {
    sample_id: sampleId,
    split,
    language,
    task_family: family.id,
    task_type: taskType,
    user_goal: sentence(
      language,
      `R25L case ${sampleId}: handle ${family.focus} with ${style} phrasing.`,
      `R25L 样例 ${sampleId}：用 ${style} 表达处理“${family.focus}”。`
    ),
    messages: makeMessages(language, family, taskType, index, style),
    retrieved_evidence: [
      {
        source_id: `r25l_generic_${family.id}_${String(index + 1).padStart(3, "0")}`,
        text: evidence,
        contains_private_data: false
      }
    ],
    constraints: [
      "R25L expands corpus and plans a pilot only",
      "formal decoder training remains disabled",
      "small decoder pilot training is skipped by default",
      "same-origin static browser release remains the target after review"
    ],
    target_answer: makeTarget({ language, family, split, splitIndex, taskType, style }),
    rejected_answers: makeRejected(language, family, splitIndex),
    policy_tags: [
      ...config.required_policy_tags,
      "r25l_expanded_corpus",
      "template_generated",
      "split_separated",
      family.id,
      taskType,
      style
    ],
    expected_behavior: [
      "Use supplied generic evidence rather than external facts.",
      "Preserve training, release, privacy, and deployment boundaries.",
      "Keep formal training progress at zero until a later approved run."
    ],
    forbidden_behavior: [
      "Do not claim a product model or release checkpoint exists.",
      "Do not copy eval prompts or heldout answers into training.",
      "Do not use remote inference, backend storage, or private raw data."
    ],
    provenance: {
      source_type: "template_generated",
      generator: GENERATOR,
      license_or_permission: "project-authored",
      contains_private_data: false,
      notes: "Deterministic R25L project-authored behavioral row; not model output."
    },
    review_status: "reviewed_template",
    contains_private_data: false
  };
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) out[row[key]] = (out[row[key]] || 0) + 1;
  return out;
}

function toJsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function writeText(path, text) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const rows = [];
  for (const [familyIndex, family] of FAMILIES.entries()) {
    for (let index = 0; index < 60; index += 1) rows.push(makeRow(config, family, familyIndex, index));
  }
  const bySplit = {
    train: rows.filter((row) => row.split === "train"),
    dev: rows.filter((row) => row.split === "dev"),
    heldout: rows.filter((row) => row.split === "heldout")
  };
  await writeText(config.outputs.train, toJsonl(bySplit.train));
  await writeText(config.outputs.dev, toJsonl(bySplit.dev));
  await writeText(config.outputs.heldout, toJsonl(bySplit.heldout));
  const report = {
    ok: rows.length >= config.target_total_rows &&
      bySplit.train.length >= config.train_rows &&
      bySplit.dev.length >= config.dev_rows &&
      bySplit.heldout.length >= config.heldout_rows,
    corpus_id: config.corpus_id,
    total_rows: rows.length,
    split_counts: countBy(rows, "split"),
    family_count: Object.keys(countBy(rows, "task_family")).length,
    language_counts: countBy(rows, "language"),
    task_type_counts: countBy(rows, "task_type"),
    output_files: Object.values(config.outputs),
    formal_training: false,
    small_decoder_pilot_training: false,
    product_model: false
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
