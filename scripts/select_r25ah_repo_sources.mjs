#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "artifacts/training_os/corpus_expansion/r25ah");
const SELECTION_PATH = path.join(OUT_DIR, "r25ah_selected_repo_sources.json");
const SUMMARY_PATH = path.join(ROOT, "docs/R25AH_SELECTED_REPO_SOURCE_SUMMARY.md");
const RANKING_PATH = path.join(ROOT, "artifacts/training_os/repo_text_discovery/r25ag/personal_corpus_source_ranking.json");
const POLICY_PATH = path.join(ROOT, "training/from_scratch/repo_derived_source_selection.r25ah.json");

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".jsonl"]);
const MAX_SELECTED = 140;

const CATEGORY_PREFIXES = [
  ["project_meaning_docs", /^docs\/R25AB_(PROJECT_MEANING|CHINESE_FIRST_TRAINING_DOCTRINE|PERSONAL_COLOR_BOUNDARY|HEALTHY_TRAINING_CYCLE)\.md$/],
  ["phase3_decision_docs", /^docs\/R25(AD_CHINESE_PERSONAL_CORPUS_GAP|AA_PHASE3_PAUSE_AND_REVIEW|AA_PHASE4_READINESS_REVIEW|Z_PHASE3_DECISION_REVIEW|W_DATA_FIRST_VS_ARCHITECTURE_ABLATION|W_R25V_ANALYSIS_AND_DECISION)\.md$/],
  ["existing_training_scaffold", /^training\/llm_corpus\/.*\.jsonl$/],
  ["long_horizon_human_seed", /^training\/long_horizon\/.*\.jsonl$/],
  ["identity_style_scaffold", /^identity_pack\/.*\.(md|json|jsonl)$/],
  ["knowledge_source_metadata", /^knowledge_sources\/(README\.md|schema\.json|registry\.json|cards\/domains_manifest\.json)$/],
  ["repo_docs_for_local_first_static_reasoning", /^(README\.md|DATA_CARD\.md|DEPLOYMENT\.md|docs\/(R24E_RECOVERY_CANDIDATE|R24G_KNOWLEDGE_SOURCE_DERIVATION|R25I_FROM_SCRATCH_LLM_TRAINING_DOCTRINE|R25I_TRAINING_PHASE_PLAN|R25AF_WRITING_TO_DIALOGUE_TRANSFORMATION|R25AG_REPOSITORY_TEXT_DISCOVERY|R25AG_PERSONAL_CORPUS_SOURCE_RANKING)\.md)$/]
];

const PERSONAL_TARGET_KEYWORDS = {
  project_continuation: [/continuation/i, /项目/, /phase/i, /R25/, /R24/],
  repair_after_weak_answer: [/repair/i, /修复/, /weak answer/i],
  local_first_static_browser_reasoning: [/local-first/i, /static browser/i, /browser/i, /浏览器/, /本地/],
  style_preference: [/style/i, /preference/i, /风格/, /偏好/, /personal/i, /个人/],
  tool_status_honesty: [/tool honesty/i, /runtime/i, /status/i, /honest/i, /工具/],
  bounded_judgment: [/bounded judgment/i, /boundary/i, /approval/i, /blocked/i, /边界/]
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

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function trackedFiles() {
  return git(["ls-files"]).split(/\r?\n/).filter(Boolean).sort();
}

function forbiddenPath(relativePath) {
  if (relativePath.startsWith("evals/")) return "eval_only";
  if (relativePath.startsWith("data/public_ingestion/")) return "data_public_ingestion_metadata_only";
  if (relativePath.startsWith("private_sources/")) return "private_sources_forbidden";
  if (relativePath.startsWith("artifacts/")) return "ignored_artifact_forbidden";
  if (!relativePath.includes("/") && /\.(pdf|PDF|docx|DOCX|doc|DOC)$/.test(relativePath)) return "root_document_metadata_only";
  if (/r25ag_.*candidate|r25ah_.*candidate/i.test(relativePath) && relativePath.startsWith("artifacts/")) return "previous_candidate_artifact";
  return null;
}

function sourceCategory(relativePath) {
  for (const [category, pattern] of CATEGORY_PREFIXES) {
    if (pattern.test(relativePath)) return category;
  }
  return null;
}

function languageSignal(text) {
  const zh = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (zh > 0 && latin > 0) return "mixed";
  if (zh > 0) return "zh";
  if (latin > 0) return "en";
  return "unknown";
}

function lineCount(text) {
  return text.length ? text.split(/\r?\n/).length : 0;
}

function shortDigest(text) {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 120);
}

function personalTargets(text) {
  const out = [];
  for (const [target, patterns] of Object.entries(PERSONAL_TARGET_KEYWORDS)) {
    if (patterns.some((pattern) => pattern.test(text))) out.push(target);
  }
  return out;
}

function riskFlags(relativePath, text) {
  const flags = [];
  if (/\/Users\//.test(text)) flags.push("contains_absolute_path_reference");
  if (/(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/.test(text)) flags.push("contains_secret_like_string");
  if (/chain[_-]?of[_-]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data/i.test(text)) flags.push("contains_forbidden_boundary_terms");
  if (relativePath.startsWith("knowledge_sources/")) flags.push("knowledge_source_metadata_only_not_answer_bank");
  if (relativePath.startsWith("training/llm_corpus/")) flags.push("existing_training_scaffold_pattern_only_no_row_copy");
  return flags;
}

function valueScore(relativePath, category, text, rankingIndex) {
  let score = 0;
  if (category === "project_meaning_docs") score += 100;
  if (category === "phase3_decision_docs") score += 90;
  if (category === "long_horizon_human_seed") score += 80;
  if (category === "identity_style_scaffold") score += 75;
  if (category === "repo_docs_for_local_first_static_reasoning") score += 70;
  if (category === "existing_training_scaffold") score += 55;
  if (category === "knowledge_source_metadata") score += 35;
  score += personalTargets(text).length * 8;
  if (languageSignal(text) === "mixed") score += 8;
  if (languageSignal(text) === "zh") score += 10;
  if (rankingIndex?.get(relativePath)?.value_rank === "high_value") score += 15;
  if (rankingIndex?.get(relativePath)?.value_rank === "medium_value") score += 6;
  return score;
}

function rankingCandidates(trackedSet) {
  if (!fs.existsSync(RANKING_PATH)) return [];
  const ranking = readJson(RANKING_PATH);
  return (ranking.ranked_sources || [])
    .filter((item) => trackedSet.has(item.path))
    .map((item) => item.path);
}

function allowedFallbackCandidates(files) {
  return files.filter((file) => sourceCategory(file));
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

if (!fs.existsSync(POLICY_PATH)) {
  throw new Error(`Missing R25AH source policy: ${rel(POLICY_PATH)}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const tracked = trackedFiles();
const trackedSet = new Set(tracked);
const ranking = fs.existsSync(RANKING_PATH) ? readJson(RANKING_PATH) : null;
const rankingIndex = new Map((ranking?.ranked_sources || []).map((item) => [item.path, item]));
const candidatePaths = [...new Set([...rankingCandidates(trackedSet), ...allowedFallbackCandidates(tracked)])]
  .filter((file) => !forbiddenPath(file))
  .filter((file) => sourceCategory(file))
  .filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()));

const selected = [];
for (const relativePath of candidatePaths) {
  const category = sourceCategory(relativePath);
  const full = repoPath(relativePath);
  if (!fs.existsSync(full)) continue;
  const text = fs.readFileSync(full, "utf8");
  const risks = riskFlags(relativePath, text);
  const hardRisk = risks.some((flag) => flag === "contains_secret_like_string");
  if (hardRisk) continue;
  selected.push({
    source_id: `r25ah_repo_source_${String(selected.length + 1).padStart(3, "0")}`,
    path: relativePath,
    source_category: category,
    tracked_status: "tracked",
    extension: path.extname(relativePath).toLowerCase(),
    byte_size: fs.statSync(full).size,
    line_count: lineCount(text),
    language_signal: languageSignal(text),
    content_sha256: sha256(text),
    short_digest_hash: sha256(shortDigest(text)),
    value_score: valueScore(relativePath, category, text, rankingIndex),
    personal_color_targets: personalTargets(text),
    risk_flags: risks,
    allowed_use: category === "existing_training_scaffold" ? "pattern_signal_only_no_row_copy" : "repo_derived_candidate_source"
  });
}

selected.sort((a, b) => b.value_score - a.value_score || a.path.localeCompare(b.path));
const capped = selected.slice(0, MAX_SELECTED).map((item, index) => ({
  ...item,
  selection_rank: index + 1
}));

const report = {
  report_id: "r25ah_selected_repo_sources",
  ok: true,
  generated_at: new Date().toISOString(),
  safety: {
    repo_root_only: true,
    scan_outside_repo: false,
    training_ran: false,
    corpus_rows_promoted: false,
    training_llm_corpus_modified: false,
    root_pdf_docx_content_parsed: false,
    data_public_ingestion_content_parsed: false,
    private_sources_read: false,
    eval_sources_used: false,
    external_api_used: false
  },
  selection_rules: {
    max_selected: MAX_SELECTED,
    detailed_artifact_ignored: true,
    tracked_summary_aggregate_only: true,
    no_long_text_in_report: true
  },
  summary: {
    selected_source_count: capped.length,
    selected_by_category: countBy(capped, (item) => item.source_category),
    selected_by_language_signal: countBy(capped, (item) => item.language_signal),
    selected_with_risk_flags: capped.filter((item) => item.risk_flags.length).length,
    ranking_report_used: Boolean(ranking),
    forbidden_sources_excluded: true
  },
  selected_sources: capped
};

fs.writeFileSync(SELECTION_PATH, `${JSON.stringify(report, null, 2)}\n`);

const lines = [];
lines.push("# R25AH Selected Repo Source Summary");
lines.push("");
lines.push("R25AH selected tracked repository sources for deterministic candidate generation. It did not read `private_sources`, parse root PDF, DOC, or DOCX files, parse `data/public_ingestion`, use evals, train, promote rows, or modify `training/llm_corpus`.");
lines.push("");
lines.push("## Counts");
lines.push("");
lines.push(`- Selected sources: ${report.summary.selected_source_count}`);
for (const [category, count] of Object.entries(report.summary.selected_by_category)) {
  lines.push(`- ${category}: ${count}`);
}
lines.push("");
lines.push("## Language Signals");
lines.push("");
for (const [language, count] of Object.entries(report.summary.selected_by_language_signal)) {
  lines.push(`- ${language}: ${count}`);
}
lines.push("");
lines.push("R25AH source details are kept in ignored artifacts. This tracked summary intentionally avoids raw source text, private filenames outside approved tracked paths, and long excerpts.");
lines.push("");
fs.writeFileSync(SUMMARY_PATH, `${lines.join("\n")}\n`);

console.log(JSON.stringify({
  ok: true,
  report: rel(SELECTION_PATH),
  summary: rel(SUMMARY_PATH),
  selected_source_count: report.summary.selected_source_count,
  selected_by_category: report.summary.selected_by_category
}, null, 2));
