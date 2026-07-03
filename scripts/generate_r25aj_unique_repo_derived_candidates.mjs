#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const R25AH_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25ah");
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25aj");
const SELECTION_PATH = path.join(R25AH_DIR, "r25ah_selected_repo_sources.json");
const R25AH_CANDIDATES = path.join(R25AH_DIR, "r25ah_repo_derived_candidate_rows.jsonl");
const CANDIDATE_PATH = path.join(OUT_DIR, "r25aj_repo_derived_candidate_rows.jsonl");
const REPORT_PATH = path.join(OUT_DIR, "r25aj_generation_report.json");

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

function readJsonlIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function safeSource(source) {
  const ref = source.path || "";
  if (ref.startsWith("evals/")) return false;
  if (ref.startsWith("data/public_ingestion/")) return false;
  if (ref.startsWith("private_sources/")) return false;
  if (ref.startsWith("artifacts/")) return false;
  if (!ref.includes("/") && /\.(pdf|PDF|docx|DOCX|doc|DOC)$/.test(ref)) return false;
  return source.tracked_status === "tracked" && source.allowed_use;
}

function sourceKind(source) {
  const category = source.source_category;
  if (category === "project_meaning_docs") return "项目意义与个人边界";
  if (category === "phase3_decision_docs") return "Phase 3 决策与暂停依据";
  if (category === "repo_docs_for_local_first_static_reasoning") return "本地优先与静态浏览器约束";
  if (category === "long_horizon_human_seed") return "长程连续性行为种子";
  if (category === "identity_style_scaffold") return "公开身份与风格脚手架";
  if (category === "existing_training_scaffold") return "既有语料结构脚手架";
  if (category === "knowledge_source_metadata") return "知识来源元数据边界";
  return "项目治理文本";
}

function titleFromPath(filePath) {
  const base = path.basename(filePath).replace(/\.(md|jsonl?|txt|mjs|js|py)$/i, "");
  return base
    .replace(/^R25[A-Z]*_?/i, "")
    .replace(/^R24[A-Z]*_?/i, "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim() || filePath;
}

function shortDigest(source) {
  const sourceFile = repoPath(source.path);
  if (!fs.existsSync(sourceFile)) return "tracked source missing at generation time";
  const text = fs.readFileSync(sourceFile, "utf8");
  const headings = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#{1,3}\s+/.test(line))
    .map((line) => line.replace(/^#{1,3}\s+/, "").replace(/[`*_]/g, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  if (headings.length) return headings.join(" / ").slice(0, 120);

  if (/\.jsonl$/i.test(source.path)) {
    const firstLines = text.split(/\r?\n/).filter(Boolean).slice(0, 5);
    const keyCounts = {};
    for (const line of firstLines) {
      try {
        for (const key of Object.keys(JSON.parse(line))) keyCounts[key] = (keyCounts[key] || 0) + 1;
      } catch {
        // Ignore malformed historical rows here; validators handle corpus syntax elsewhere.
      }
    }
    const keys = Object.keys(keyCounts).slice(0, 8);
    return keys.length ? `JSONL fields: ${keys.join(", ")}` : "JSONL structured rows";
  }

  if (/\.json$/i.test(source.path)) {
    try {
      const keys = Object.keys(JSON.parse(text)).slice(0, 8);
      return keys.length ? `JSON fields: ${keys.join(", ")}` : "JSON structured source";
    } catch {
      return "JSON source";
    }
  }

  return titleFromPath(source.path).slice(0, 120);
}

function contextForSource(source) {
  const title = titleFromPath(source.path);
  const digest = shortDigest(source);
  const kind = sourceKind(source);
  const pathCue = source.path.replace(/^docs\//, "docs/").replace(/^training\//, "training/");
  return {
    kind,
    title,
    digest,
    pathCue,
    zh: `${kind}《${title}》（${pathCue}）`,
    mixed: `${kind}《${title}》与 ${source.source_category}`,
    en: `${kind} source ${title}`
  };
}

function languageFor(sourceIndex, transformationIndex) {
  if (transformationIndex <= 6) return "zh";
  if (transformationIndex <= 8) return "mixed";
  return "en";
}

function splitFor(sourceIndex, transformationIndex) {
  const bucket = (sourceIndex + transformationIndex) % 10;
  if (bucket === 8) return "dev";
  if (bucket === 9) return "heldout_candidate";
  return "train";
}

function messagesFor(transformation, language, ctx) {
  const userZh = {
    project_continuation: `围绕${ctx.zh}，给出下一步项目推进回答，要求延续上下文、中文优先，并明确不能训练或提升语料。`,
    repair_after_weak_answer: `把一个急着扩大训练的弱回答修复成符合${ctx.zh}边界的中文回答。`,
    local_first_static_browser_reasoning: `说明${ctx.zh}怎样约束本地优先、同源静态浏览器和后续候选生成。`,
    tool_status_honesty: `用诚实的工具状态口吻回应${ctx.zh}相关任务，避免把候选生成说成训练完成。`,
    bounded_judgment: `根据${ctx.zh}给出有边界的判断：现在能做什么，仍不能做什么。`,
    style_preference: `把${ctx.zh}转为个人/项目风格偏好说明，要求自然、克制、可审核。`,
    Chinese_explanation: `用中文解释${ctx.zh}为什么适合作为项目派生候选来源，不要引用长段原文。`,
    Chinese_rewrite_or_compression: `把${ctx.zh}压缩成一条可复用的中文对话原则。`,
    preference_pair: `比较一个泛化回答和一个更符合${ctx.zh}的回答，给出偏好理由。`,
    repair_pair: `将一个违反${ctx.zh}边界的回答修复为可审核候选。`
  };
  if (language === "en") {
    return [{
      role: "user",
      content: `In compact English, explain how the repo-derived source "${ctx.title}" should shape an unreviewed Chinese-first candidate without training or corpus promotion.`
    }];
  }
  if (language === "mixed") {
    return [{
      role: "user",
      content: `用中文为主，必要时保留 local-first / static browser / review pack 术语，说明如何把${ctx.mixed}转成未审核候选行。`
    }];
  }
  return [{ role: "user", content: userZh[transformation] }];
}

function answerFor(transformation, language, source, ctx) {
  const digestCue = ctx.digest ? `它的可用线索是“${ctx.digest}”。` : "";
  const sourceCue = `${ctx.zh}来自已跟踪仓库文本，不是私人原文，也不是评测夹具。`;
  const mixedFocus = {
    Chinese_rewrite_or_compression: "rewrite/compression 任务要把来源压成可复用原则，而不是复制段落",
    preference_pair: "preference pair 任务要区分弱回答和更合适回答",
    repair_pair: "repair pair 任务要把越界说法修回审查边界"
  };
  const englishFocus = {
    repair_pair: "repair a premature promotion claim into a review-only next step"
  };
  const zh = {
    project_continuation: `${sourceCue}下一步要把它转成未审核候选：保留“${ctx.title}”里的项目边界，写清当前只是在修复候选质量，后续仍需 R25AK 审查提升和另一次训练批准。${digestCue}`,
    repair_after_weak_answer: `弱回答的问题是把“候选生成”说成“可以训练”。修复后应回到${ctx.zh}：先承认 R25AI 因重复模板被阻塞，再生成更具体的未审核候选，不改语料、不碰 phase_4。${digestCue}`,
    local_first_static_browser_reasoning: `${ctx.zh}提醒模型把产品边界当成回答义务：同源静态浏览器、本地优先、无后端依赖都要写进判断里。候选行应训练这种边界意识的表达样式，而不是追求泛化口号。`,
    tool_status_honesty: `针对${ctx.zh}，诚实状态应分三层：已生成的是忽略目录候选，已验证的是安全与唯一性，尚未发生的是提升语料、训练和发布。回答不能把这些状态混在一起。`,
    bounded_judgment: `可以判断${ctx.zh}适合提供项目连续性和偏好边界；不能判断它已经适合直接训练。合理结论是先去重、过审、保留来源哈希，再由后续批准决定是否提升。`,
    style_preference: `${ctx.zh}给出的个人色彩不是私人记忆，而是中文表达节奏、审慎边界和修复方式。候选回答要温和、明确、有行动感，并避免把项目文档改写成空泛自我介绍。`,
    Chinese_explanation: `${ctx.zh}的价值在于把项目自己的“为什么”留给模型：为什么中文优先，为什么不重启项目，为什么好损失不能自动扩规模，为什么工具状态必须诚实。${digestCue}`,
    Chinese_rewrite_or_compression: `可压缩为：从${ctx.title}提炼行为边界；中文优先；候选未审核；不训练、不提升、不发布；用来源哈希和后续审查把项目连续性守住。`,
    preference_pair: `更好的回答会先守住${ctx.zh}的边界，再给出可执行动作：生成唯一、可审查、未训练的候选行。较弱回答只会说“资料够了就训练”，忽略来源审查和 phase_4 阻塞。`,
    repair_pair: `修复方向是把“直接提升并训练”改成“根据${ctx.title}生成未审核候选，验证唯一性与污染边界，等待 R25AK 再决定是否入库”；这样既推进项目，也不越过批准。`
  };
  if (language === "en") {
    return `Use "${ctx.title}" from ${ctx.pathCue} to ${englishFocus[transformation] || "shape a bounded candidate"}. It is repo-derived context, not proof that training happened; the row stays unreviewed and needs later promotion approval before any corpus change.`;
  }
  if (language === "mixed") {
    return `${ctx.zh}（${ctx.pathCue}）只能支持 repo-derived candidate：${mixedFocus[transformation] || "保持具体任务义务"}；中文表达要占主线，local-first、static browser、review pack 这些术语可保留，直到后续审查提升。`;
  }
  return zh[transformation];
}

function rejectedFor(transformation, ctx) {
  if (transformation === "preference_pair") {
    return [
      `既然有${ctx.title}，现在可以直接把候选提升进训练语料。`,
      "候选行已经足够像个人风格，所以可以跳过审查和批准。"
    ];
  }
  if (transformation === "repair_pair" || transformation === "repair_after_weak_answer") {
    return [
      "R25AI 的失败说明应该改用更大的训练来掩盖重复问题。",
      `把${ctx.title}直接复制成目标答案即可增加数据量。`
    ];
  }
  return [];
}

function constraintsFor(transformation, language) {
  const base = [
    "Chinese-first candidate",
    "unreviewed artifact only",
    "no training",
    "no corpus promotion",
    "no eval source",
    "no private source",
    "phase_4 blocked"
  ];
  if (language === "mixed") base.push("English terms only when technical");
  if (transformation.includes("repair")) base.push("correct the weak claim explicitly");
  if (transformation === "preference_pair") base.push("contrast weak and preferred behavior");
  return base;
}

function reviewRubricStub(transformation) {
  return {
    rubric_id: "r25aj_candidate_review_rubric",
    hard_fail_checks_required: true,
    promotion_ready_by_default: false,
    expected_focus: transformation
  };
}

function buildRow(source, sourceIndex, transformation, transformationIndex) {
  const ctx = contextForSource(source);
  const language = languageFor(sourceIndex, transformationIndex);
  const split = splitFor(sourceIndex, transformationIndex);
  const target = answerFor(transformation, language, source, ctx);
  const sourceHash = source.content_sha256 || sha256(source.path);
  const personalTargets = [...new Set([
    ...(TARGET_BY_TRANSFORMATION[transformation] || []),
    ...(source.personal_color_targets || []).filter((targetName) => PERSONAL_TARGETS.includes(targetName)).slice(0, 2)
  ])];
  return {
    sample_id: `r25aj_unique_repo_derived_${String(sourceIndex + 1).padStart(3, "0")}_${transformation}`,
    split_suggestion: split,
    language,
    transformation_type: transformation,
    source_category: source.source_category,
    source_ids: [source.source_id],
    source_file_refs: [source.path],
    source_hashes: [sourceHash],
    messages: messagesFor(transformation, language, ctx),
    target_answer: target,
    rejected_answers: rejectedFor(transformation, ctx),
    constraints: constraintsFor(transformation, language),
    personal_color_targets: personalTargets,
    review_rubric: reviewRubricStub(transformation),
    provenance: {
      source_type: "repo_derived",
      generator: "scripts/generate_r25aj_unique_repo_derived_candidates.mjs",
      external_llm_used: false,
      source_review_status: "tracked_project_source",
      seed_structure_from: "artifacts/training_os/corpus_expansion/r25ah/r25ah_repo_derived_candidate_rows.jsonl"
    },
    review_status: "candidate_unreviewed",
    contains_private_data: false,
    public_commit_allowed: false,
    training_allowed: false
  };
}

if (!fs.existsSync(SELECTION_PATH)) {
  throw new Error(`Missing selected source report: ${rel(SELECTION_PATH)}`);
}
if (!fs.existsSync(R25AH_CANDIDATES)) {
  throw new Error(`Missing R25AH candidate seed structure: ${rel(R25AH_CANDIDATES)}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const selection = readJson(SELECTION_PATH);
const oldRows = readJsonlIfPresent(R25AH_CANDIDATES);
const sources = (selection.selected_sources || []).filter(safeSource);
if (sources.length < 48) {
  const report = {
    report_id: "r25aj_generation_report",
    ok: false,
    generated_at: new Date().toISOString(),
    status: "blocked_insufficient_safe_sources",
    selected_safe_source_count: sources.length,
    training_ran: false,
    promotion_ran: false,
    training_llm_corpus_modified: false
  };
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  throw new Error(`R25AJ blocked: only ${sources.length} safe selected sources`);
}

const rows = [];
for (const [sourceIndex, source] of sources.entries()) {
  for (const [transformationIndex, transformation] of TRANSFORMATIONS.entries()) {
    rows.push(buildRow(source, sourceIndex, transformation, transformationIndex));
  }
}

fs.writeFileSync(CANDIDATE_PATH, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);

const report = {
  report_id: "r25aj_generation_report",
  ok: true,
  generated_at: new Date().toISOString(),
  candidate_rows_generated: true,
  candidate_path: rel(CANDIDATE_PATH),
  source_selection_path: rel(SELECTION_PATH),
  old_seed_candidate_path: rel(R25AH_CANDIDATES),
  old_seed_candidate_count: oldRows.length,
  row_count: rows.length,
  generation_strategy: "source-specific deterministic transformations using source category, file theme, short digest, and transformation obligation; no ID suffix uniqueness",
  safety: {
    repo_root_only: true,
    scan_outside_repo: false,
    training_ran: false,
    prior_pilot_reran: false,
    promotion_ran: false,
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
    rows_by_split_suggestion: countBy(rows, (row) => row.split_suggestion),
    rows_by_transformation_type: countBy(rows, (row) => row.transformation_type),
    rows_by_source_category: countBy(rows, (row) => row.source_category),
    personal_target_coverage: countBy(rows.flatMap((row) => row.personal_color_targets), (target) => target)
  }
};

fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  candidate_path: rel(CANDIDATE_PATH),
  row_count: rows.length,
  rows_by_language: report.summary.rows_by_language,
  rows_by_split_suggestion: report.summary.rows_by_split_suggestion
}, null, 2));
