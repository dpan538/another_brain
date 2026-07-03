#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APPROVAL_PATH = path.join(ROOT, "training/from_scratch/APPROVE_R25AM_SECOND_CHINESE_CORPUS_EXPANSION.json");
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25am");
const CANDIDATE_PATH = path.join(OUT_DIR, "r25am_candidate_rows.jsonl");
const REPORT_PATH = path.join(OUT_DIR, "r25am_generation_report.json");
const SOURCE_COUNT = 100;

const TRANSFORMATIONS = [
  "project_continuation",
  "repair_after_weak_answer",
  "local_first_static_browser_reasoning",
  "tool_status_honesty",
  "bounded_judgment",
  "style_preference",
  "Chinese_explanation",
  "Chinese_rewrite_or_compression",
  "preference_pair",
  "repair_pair",
  "Chinese_follow_up_binding",
  "Chinese_project_decision"
];

const PERSONAL_TARGETS = [
  "project_continuation",
  "repair_after_weak_answer",
  "local_first_static_browser_reasoning",
  "style_preference",
  "tool_status_honesty",
  "bounded_judgment"
];

const TARGET_BY_TRANSFORMATION = {
  project_continuation: ["project_continuation", "bounded_judgment"],
  repair_after_weak_answer: ["repair_after_weak_answer", "bounded_judgment"],
  local_first_static_browser_reasoning: ["local_first_static_browser_reasoning", "tool_status_honesty"],
  tool_status_honesty: ["tool_status_honesty", "bounded_judgment"],
  bounded_judgment: ["bounded_judgment", "project_continuation"],
  style_preference: ["style_preference", "project_continuation"],
  Chinese_explanation: ["style_preference", "bounded_judgment"],
  Chinese_rewrite_or_compression: ["style_preference", "repair_after_weak_answer"],
  preference_pair: ["style_preference", "bounded_judgment"],
  repair_pair: ["repair_after_weak_answer", "tool_status_honesty"],
  Chinese_follow_up_binding: ["project_continuation", "tool_status_honesty"],
  Chinese_project_decision: ["bounded_judgment", "project_continuation"]
};

const CATEGORY_LABELS = {
  project_meaning_docs: "项目意义文档",
  r25_chinese_personal_cycle_docs: "R25 中文个人周期文档",
  r24_r25_local_first_static_recovery_docs: "R24/R25 本地静态恢复文档",
  identity_style_scaffold: "公开身份与风格脚手架",
  long_horizon_human_seed: "长程任务人工种子",
  existing_training_scaffold: "既有训练语料结构",
  project_decision_ledgers: "项目决策配置"
};

const OBLIGATIONS = {
  project_continuation: "接住上一轮状态，说明下一步只推进语料审阅和分流",
  repair_after_weak_answer: "把急着训练的说法改成先验证、再审批、再暂停的回答",
  local_first_static_browser_reasoning: "把 same-origin static browser 约束落到候选语料边界",
  tool_status_honesty: "明确工具实际做了什么，避免把生成、验证或推广说成训练",
  bounded_judgment: "给出有边界的判断，并列出仍然禁止的动作",
  style_preference: "保留中文优先、克制、项目连续的个人色彩",
  Chinese_explanation: "解释为什么该来源适合派生候选而不是直接照搬",
  Chinese_rewrite_or_compression: "压缩成可训练的中文对话原则，不复制长段来源",
  preference_pair: "把泛化回答和项目化回答分开，说明偏好依据",
  repair_pair: "把越界回答修复成可审核的候选答案",
  Chinese_follow_up_binding: "把追问绑定到当前阶段和仓库证据，避免跳题",
  Chinese_project_decision: "记录项目决策，不把阶段推进说成模型能力完成"
};

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

function normalizeTarget(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[，。！？；：、]/g, " ")
    .replace(/[,.!?;:()[\]{}<>《》「」『』"']/g, " ")
    .replace(/\br25a[hijklm]_[a-z0-9_:-]+\b/gi, " ")
    .replace(/\bsource[_ -]?\d+\b/gi, " ")
    .replace(/\bsample[_ -]?\d+\b/gi, " ")
    .replace(/(?:^|\s)(?:第)?\d+(?:条|项|段|行)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function sourceAllowed(file) {
  if (!file) return false;
  if (file.startsWith("evals/")) return false;
  if (file.startsWith("data/public_ingestion/")) return false;
  if (file.startsWith("private_sources/")) return false;
  if (file.startsWith("artifacts/")) return false;
  if (/^[^/]+\.(pdf|PDF|docx|DOCX|doc|DOC)$/.test(file)) return false;
  if (/\.(pdf|PDF|docx|DOCX|doc|DOC|safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/.test(file)) return false;
  return /^(README\.md|DATA_CARD\.md|DEPLOYMENT\.md|docs\/.*\.md|training\/from_scratch\/.*\.json|training\/long_horizon\/.*\.jsonl|identity_pack\/.*\.jsonl|training\/llm_corpus\/.*\.jsonl)$/.test(file);
}

function classify(file) {
  if (/^docs\/R25AB_(PROJECT_MEANING|CHINESE_FIRST|PERSONAL_COLOR|HEALTHY)/.test(file)) return "project_meaning_docs";
  if (/^docs\/R25(AB|AD|AE|AF|AG|AH|AJ|AK|AL)_/.test(file)) return "r25_chinese_personal_cycle_docs";
  if (/^(README\.md|DATA_CARD\.md|DEPLOYMENT\.md|docs\/R24|docs\/R25|docs\/.*STATIC|docs\/.*RECOVERY)/i.test(file)) {
    return "r24_r25_local_first_static_recovery_docs";
  }
  if (file.startsWith("identity_pack/")) return "identity_style_scaffold";
  if (file.startsWith("training/long_horizon/")) return "long_horizon_human_seed";
  if (file.startsWith("training/llm_corpus/")) return "existing_training_scaffold";
  if (file.startsWith("training/from_scratch/")) return "project_decision_ledgers";
  return "r24_r25_local_first_static_recovery_docs";
}

function titleFromPath(file) {
  const base = path.basename(file).replace(/\.(md|jsonl?|txt)$/i, "");
  return base
    .replace(/^R25[A-Z]*_?/i, "")
    .replace(/^R24[A-Z]*_?/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || file;
}

function committedText(file) {
  return git(["show", `HEAD:${file}`]);
}

function digestFor(file, text) {
  if (/\.md$/i.test(file) || /^(README|DATA_CARD|DEPLOYMENT)\.md$/.test(file)) {
    const headings = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^#{1,3}\s+/.test(line))
      .map((line) => line.replace(/^#{1,3}\s+/, "").replace(/[`*_]/g, "").trim())
      .filter(Boolean)
      .slice(0, 3);
    if (headings.length) return headings.join(" / ").slice(0, 90);
  }
  if (/\.jsonl$/i.test(file)) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    const fields = new Set();
    for (const line of lines.slice(0, 8)) {
      try {
        Object.keys(JSON.parse(line)).slice(0, 8).forEach((key) => fields.add(key));
      } catch {
        // Field summary is best-effort; syntax validators cover corpus files.
      }
    }
    return `JSONL rows ${lines.length}; fields ${[...fields].slice(0, 6).join(", ")}`.slice(0, 90);
  }
  if (/\.json$/i.test(file)) {
    try {
      const value = JSON.parse(text);
      return `JSON fields ${Object.keys(value).slice(0, 8).join(", ")}`.slice(0, 90);
    } catch {
      return "JSON project configuration";
    }
  }
  return titleFromPath(file).slice(0, 90);
}

function selectSources() {
  const files = git(["ls-files"])
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(sourceAllowed)
    .sort();
  const entries = files.map((file) => {
    const text = committedText(file);
    const category = classify(file);
    return {
      path: file,
      source_id: `r25am_source_${sha256(file).slice(0, 12)}`,
      source_category: category,
      category_label: CATEGORY_LABELS[category] || category,
      title: titleFromPath(file),
      digest: digestFor(file, text),
      hash: sha256(text)
    };
  });
  const categoryOrder = [
    "project_meaning_docs",
    "r25_chinese_personal_cycle_docs",
    "r24_r25_local_first_static_recovery_docs",
    "identity_style_scaffold",
    "long_horizon_human_seed",
    "existing_training_scaffold",
    "project_decision_ledgers"
  ];
  const buckets = new Map(categoryOrder.map((category) => [category, entries.filter((entry) => entry.source_category === category)]));
  const selected = [];
  while (selected.length < SOURCE_COUNT) {
    let advanced = false;
    for (const category of categoryOrder) {
      const bucket = buckets.get(category) || [];
      const next = bucket.shift();
      if (!next) continue;
      selected.push(next);
      advanced = true;
      if (selected.length === SOURCE_COUNT) break;
    }
    if (!advanced) break;
  }
  if (selected.length < SOURCE_COUNT) {
    throw new Error(`R25AM needs ${SOURCE_COUNT} safe tracked sources; found ${selected.length}`);
  }
  return selected;
}

function languageFor(rowIndex) {
  const bucket = rowIndex % 20;
  if (bucket < 16) return "zh";
  if (bucket < 19) return "mixed";
  return "en";
}

function splitFor(rowIndex) {
  const bucket = rowIndex % 10;
  if (bucket < 8) return "train";
  if (bucket === 8) return "dev";
  return "heldout_candidate";
}

function messagesFor(transformation, language, source) {
  if (language === "en") {
    return [{
      role: "user",
      content: `Using the tracked source ${source.title}, write one compact reviewable boundary answer for a Chinese-first repo-derived corpus candidate.`
    }];
  }
  if (language === "mixed") {
    return [{
      role: "user",
      content: `用中文为主，保留 local-first、static browser、review pack 等必要术语，把《${source.title}》转成 ${transformation} 候选。`
    }];
  }
  return [{
    role: "user",
    content: `围绕《${source.title}》，生成一条 ${transformation} 的中文候选回答；要求项目连续、边界清楚，不训练、不跑 tokenizer。`
  }];
}

function answerFor(transformation, language, source) {
  const label = source.category_label;
  const title = source.title;
  const digest = source.digest;
  const obligation = OBLIGATIONS[transformation];
  if (language === "en") {
    return `For ${title}, keep the candidate bounded: use it as ${label} context, state that R25AM is corpus expansion only, and preserve the review path before any tokenizer or decoder step. The useful cue is ${digest}.`;
  }
  if (language === "mixed") {
    return `围绕《${title}》，这条 mixed 候选要把 ${label} 转成可审核对话：先说明 R25AM 只做 corpus expansion，再保留 local-first/static browser/tool honesty 边界。线索是“${digest}”，落点是${obligation}。`;
  }
  return `围绕《${title}》，这条候选把${label}转成中文优先的项目回答。可用线索是“${digest}”。回答应先承认 R25AM 只是第二次语料扩展与推广，不训练、不跑 tokenizer；随后${obligation}，最后把下一步限制在验证、记录和等待 R25AN/R25后续审批。`;
}

function rejectedFor(transformation) {
  return [
    `忽略 ${transformation} 的来源边界，直接把候选当成可训练结论。`,
    "只说继续推进，不说明中文优先、审核状态和禁止动作。"
  ];
}

function constraintsFor(language) {
  return [
    "Chinese-first unless the row language is explicitly mixed or en",
    "repo-derived tracked sources only",
    "no eval source text",
    "no private raw data",
    "no tokenizer dry-run or decoder training claim",
    language === "en" ? "compact English support row" : "dialogue-shaped answer"
  ];
}

function makeRow(source, sourceIndex, transformation, transformationIndex, rowIndex) {
  const language = languageFor(rowIndex);
  const split = splitFor(rowIndex);
  return {
    sample_id: `r25am_second_chinese_${String(rowIndex + 1).padStart(4, "0")}_${transformation}`,
    split_suggestion: split,
    language,
    transformation_type: transformation,
    source_category: source.source_category,
    source_ids: [source.source_id],
    source_file_refs: [source.path],
    source_hashes: [source.hash],
    messages: messagesFor(transformation, language, source),
    target_answer: answerFor(transformation, language, source),
    rejected_answers: rejectedFor(transformation),
    constraints: constraintsFor(language),
    personal_color_targets: TARGET_BY_TRANSFORMATION[transformation],
    review_rubric: {
      rubric_id: "r25aj_candidate_review_rubric",
      promotion_ready_by_default: false,
      hard_fail_checks_required: true,
      minimum_average_score_for_future_promotion: 4,
      source_specificity_required: true,
      non_template_uniqueness_required: true
    },
    provenance: {
      source_type: "repo_derived",
      generator: "scripts/generate_r25am_second_chinese_candidates.mjs",
      external_llm_used: false,
      source_review_status: "tracked_project_source",
      source_snapshot: "HEAD",
      source_index: sourceIndex,
      transformation_index: transformationIndex
    },
    review_status: "candidate_unreviewed",
    contains_private_data: false,
    public_commit_allowed: false,
    training_allowed: false,
    product_model: false,
    release_checkpoint: false,
    phase_4_scaled_training: false
  };
}

function validateApproval(marker) {
  if (marker.approved !== true) throw new Error("R25AM approval marker is not approved");
  if (marker.consumed === true) throw new Error("R25AM approval marker is already consumed");
  if (marker.run_id !== "r25am_second_chinese_personal_corpus_expansion") throw new Error("R25AM approval run_id mismatch");
  if (marker.allow_candidate_generation !== true) throw new Error("R25AM candidate generation is not approved");
  if (marker.allow_promote_derived_rows !== true) throw new Error("R25AM promotion is not approved");
  if (marker.allow_training !== false || marker.allow_tokenizer_dry_run !== false || marker.allow_decoder_training !== false) {
    throw new Error("R25AM approval contains forbidden training or tokenizer permission");
  }
  if (marker.allow_small_pilot_training !== false || marker.allow_phase_4_scaled_training !== false || marker.allow_weight_commit !== false) {
    throw new Error("R25AM approval contains forbidden pilot, phase4, or weight permission");
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const marker = readJson(APPROVAL_PATH);
  validateApproval(marker);
  const sources = selectSources();
  const rows = [];
  for (const [sourceIndex, source] of sources.entries()) {
    for (const [transformationIndex, transformation] of TRANSFORMATIONS.entries()) {
      rows.push(makeRow(source, sourceIndex, transformation, transformationIndex, rows.length));
    }
  }

  const normalizedUnique = new Set(rows.map((row) => normalizeTarget(row.target_answer)));
  const report = {
    ok: rows.length >= 1200 && normalizedUnique.size >= 1100,
    report_id: "r25am_generation_report",
    candidate_file: rel(CANDIDATE_PATH),
    row_count: rows.length,
    normalized_unique_target_answer_count: normalizedUnique.size,
    language_counts: countBy(rows, (row) => row.language),
    split_suggestion_counts: countBy(rows, (row) => row.split_suggestion),
    transformation_counts: countBy(rows, (row) => row.transformation_type),
    personal_target_counts: countBy(rows.flatMap((row) => row.personal_color_targets), (target) => target),
    source_category_counts: countBy(rows, (row) => row.source_category),
    source_count: sources.length,
    source_files_used: sources.map((source) => source.path),
    safety: {
      training_ran: false,
      tokenizer_dry_run_ran: false,
      phase4_approved: false,
      external_api_used: false,
      private_sources_read: false,
      root_pdf_docx_parsed: false,
      data_public_ingestion_parsed: false,
      artifacts_committed: false
    }
  };
  writeJsonl(CANDIDATE_PATH, rows);
  writeJson(REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main();
