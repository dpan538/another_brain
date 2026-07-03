#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25ah");
const SELECTION_PATH = path.join(OUT_DIR, "r25ah_selected_repo_sources.json");
const CANDIDATE_PATH = path.join(OUT_DIR, "r25ah_repo_derived_candidate_rows.jsonl");
const REPORT_PATH = path.join(OUT_DIR, "r25ah_generation_report.json");
const MAX_ROWS = 1000;

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
  "repair_pair"
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
  repair_pair: ["repair_after_weak_answer", "tool_status_honesty"]
};

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function repoPath(relativePath) {
  const resolved = path.resolve(ROOT, relativePath);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    throw new Error(`Refusing to leave repo root: ${relativePath}`);
  }
  return resolved;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function languageForIndex(index) {
  const bucket = index % 100;
  if (bucket < 72) return "zh";
  if (bucket < 92) return "mixed";
  return "en";
}

function splitForIndex(index) {
  const bucket = index % 10;
  if (bucket < 8) return "train";
  if (bucket === 8) return "dev";
  return "heldout_candidate";
}

function sourceFrame(source) {
  const category = source.source_category;
  if (category === "project_meaning_docs") return "项目意义、中文优先和个人色彩边界";
  if (category === "phase3_decision_docs") return "Phase 3 复盘、暂停、数据差距和阶段边界";
  if (category === "existing_training_scaffold") return "现有语料脚手架的结构模式";
  if (category === "long_horizon_human_seed") return "长程任务和连续性行为种子";
  if (category === "identity_style_scaffold") return "公开身份和风格脚手架";
  if (category === "knowledge_source_metadata") return "知识来源的元数据边界";
  return "本地优先、静态浏览器和项目治理文档";
}

function promptFor(transformation, language, source) {
  const frame = sourceFrame(source);
  if (language === "en") {
    return `Answer in compact English with Chinese-first project priorities: how should a repo-derived candidate use ${frame} without training or promotion?`;
  }
  if (language === "mixed") {
    return `用中文为主、必要时保留 static browser / local-first 等英文术语，说明怎样把${frame}转成候选训练样式，但不训练、不提升语料。`;
  }
  const map = {
    project_continuation: `根据${frame}，给出下一步项目推进回答，重点是延续上下文而不是重新开始。`,
    repair_after_weak_answer: `把一个急着训练或扩大规模的弱回答，修复成符合${frame}边界的中文回答。`,
    local_first_static_browser_reasoning: `解释为什么${frame}里的本地优先和静态浏览器约束要继续保留。`,
    tool_status_honesty: `用诚实的工具/运行状态口吻回应${frame}相关任务，避免假装已经训练或部署。`,
    bounded_judgment: `给出一个有边界的判断：${frame}现在能支持什么，不能支持什么。`,
    style_preference: `把${frame}转成个人色彩偏好说明，语气要中文自然、克制、可执行。`,
    Chinese_explanation: `用中文解释${frame}对个人模型训练方向的意义，不引用长段原文。`,
    Chinese_rewrite_or_compression: `把${frame}压缩成一个可复用的中文对话原则。`,
    preference_pair: `比较一个泛化、空洞的回答和一个更符合${frame}的回答。`,
    repair_pair: `将违反${frame}边界的回答修复为可审核的中文候选回答。`
  };
  return map[transformation] || `围绕${frame}写一个中文候选回答。`;
}

function answerFor(transformation, language, source) {
  const frame = sourceFrame(source);
  if (language === "en") {
    return "Treat this as an unreviewed repo-derived candidate only. Keep the answer grounded in tracked project constraints, avoid private sources and eval text, and require a later review before any corpus promotion or training.";
  }
  if (language === "mixed") {
    return `这只能作为 unreviewed candidate：保留中文主线，必要时用 local-first、static browser、tool status 这些术语；不读取 private_sources，不改 training/llm_corpus，不把候选行当成已审核语料。`;
  }
  const map = {
    project_continuation: `下一步应该沿着已有项目脉络推进：先把${frame}转成可审核的候选行，保持中文优先、边界清楚，并明确候选行还不能训练或入库。`,
    repair_after_weak_answer: `修复后的回答应先承认状态：现在没有训练、没有提升语料、phase_4 仍被阻塞；然后给出一个小而可复核的候选生成动作。`,
    local_first_static_browser_reasoning: `本地优先和静态浏览器约束不是装饰，而是产品目标的一部分。候选数据要帮助模型学会在浏览器同源静态边界内做判断。`,
    tool_status_honesty: `回答应区分“已生成候选”“已审核入库”和“已训练”。如果只生成了忽略目录里的候选，就不能说训练完成，也不能说产品模型存在。`,
    bounded_judgment: `可以判断：这些来源足够支撑候选生成；不能判断：候选已适合训练。中间还需要人工审查、去重、污染检查和单独的提升批准。`,
    style_preference: `个人色彩应表现为中文表达的节奏、偏好、修复方式和项目连续性，而不是泄露私人原文或伪造没有提供过的个人记忆。`,
    Chinese_explanation: `${frame}的价值在于提供项目自己的判断边界：模型要学会为什么暂停、为什么需要审批、为什么中文表达比通用英文流利度更重要。`,
    Chinese_rewrite_or_compression: `原则：候选行只从已跟踪、可复核的项目文本中提炼行为边界；中文优先；不训练；不入库；等待后续审查。`,
    preference_pair: `更好的回答会先保护边界，再给出下一步：我会生成忽略目录中的候选行，标记未审核，并保留后续 R25AI 审查入口。`,
    repair_pair: `正确修复是把“现在就训练”改成“先生成未审核候选并验证安全边界”；把“已可发布”改成“仍需审查、提升批准和未来训练批准”。`
  };
  return map[transformation] || `候选回答应围绕${frame}，保持中文优先、边界清楚、可审查。`;
}

function rejectedFor(transformation) {
  if (transformation === "preference_pair") {
    return ["直接把这些文本加入训练集并开始训练。", "只要来源是仓库里的文档，就可以默认发布。"];
  }
  if (transformation === "repair_pair" || transformation === "repair_after_weak_answer") {
    return ["R25AH 已经让模型学会个人风格，可以进入 phase_4。"];
  }
  return [];
}

function constraintsFor(transformation) {
  const base = [
    "Chinese-first unless a technical term requires English",
    "no training",
    "no corpus promotion",
    "no private_sources",
    "no evaluation fixture copying",
    "phase_4 blocked"
  ];
  if (transformation.includes("repair")) base.push("explicitly correct the weak claim");
  if (transformation.includes("preference")) base.push("contrast weak and preferred behavior without long source quotes");
  return base;
}

function buildRow(source, transformation, rowIndex) {
  const language = languageForIndex(rowIndex);
  return {
    sample_id: `r25ah_repo_derived_${String(rowIndex + 1).padStart(4, "0")}`,
    split_suggestion: splitForIndex(rowIndex),
    language,
    transformation_type: transformation,
    source_category: source.source_category,
    source_ids: [source.source_id],
    source_file_refs: [source.path],
    source_hashes: [source.content_sha256],
    messages: [
      {
        role: "user",
        content: promptFor(transformation, language, source)
      }
    ],
    target_answer: answerFor(transformation, language, source),
    rejected_answers: rejectedFor(transformation),
    constraints: constraintsFor(transformation),
    personal_color_targets: TARGET_BY_TRANSFORMATION[transformation] || source.personal_color_targets || [],
    provenance: {
      source_type: "repo_derived",
      generator: "scripts/generate_r25ah_repo_derived_candidates.mjs",
      external_llm_used: false,
      source_review_status: "tracked_project_source"
    },
    review_status: "candidate_unreviewed",
    contains_private_data: false,
    public_commit_allowed: false,
    training_allowed: false
  };
}

if (!fs.existsSync(SELECTION_PATH)) {
  throw new Error(`Missing selected sources: ${rel(SELECTION_PATH)}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const selection = readJson(SELECTION_PATH);
const sources = (selection.selected_sources || []).filter((source) => source.allowed_use !== "pattern_signal_only_no_row_copy" || source.source_category === "existing_training_scaffold");
if (!sources.length) {
  const report = {
    report_id: "r25ah_generation_report",
    ok: false,
    status: "blocked_no_selected_sources",
    generated_at: new Date().toISOString(),
    candidate_rows_generated: false,
    safety: {
      training_ran: false,
      corpus_rows_promoted: false,
      training_llm_corpus_modified: false,
      external_api_used: false
    }
  };
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  throw new Error("R25AH blocked: no selected repo sources");
}

const rows = [];
for (const source of sources) {
  const transformsForSource = source.source_category === "knowledge_source_metadata"
    ? ["bounded_judgment", "local_first_static_browser_reasoning"]
    : source.source_category === "existing_training_scaffold"
      ? ["Chinese_rewrite_or_compression", "repair_after_weak_answer"]
      : TRANSFORMATIONS;
  for (const transformation of transformsForSource) {
    if (rows.length >= MAX_ROWS) break;
    rows.push(buildRow(source, transformation, rows.length));
  }
  if (rows.length >= MAX_ROWS) break;
}

fs.writeFileSync(CANDIDATE_PATH, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);

const report = {
  report_id: "r25ah_generation_report",
  ok: true,
  generated_at: new Date().toISOString(),
  candidate_rows_generated: true,
  candidate_path: rel(CANDIDATE_PATH),
  max_rows: MAX_ROWS,
  row_count: rows.length,
  safety: {
    repo_root_only: true,
    scan_outside_repo: false,
    training_ran: false,
    prior_pilot_reran: false,
    corpus_rows_promoted: false,
    training_llm_corpus_modified: false,
    root_pdf_docx_content_parsed: false,
    data_public_ingestion_content_parsed: false,
    private_sources_read: false,
    eval_sources_used: false,
    external_api_used: false,
    model_downloaded: false,
    phase_4_scaled_training_approved: false
  },
  summary: {
    source_count: sources.length,
    rows_by_language: countBy(rows, (row) => row.language),
    rows_by_transformation_type: countBy(rows, (row) => row.transformation_type),
    rows_by_source_category: countBy(rows, (row) => row.source_category),
    personal_target_coverage: countBy(rows.flatMap((row) => row.personal_color_targets), (target) => target)
  }
};

fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  report: rel(REPORT_PATH),
  candidates: rel(CANDIDATE_PATH),
  row_count: rows.length,
  rows_by_language: report.summary.rows_by_language
}, null, 2));
