#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DISCOVERY_PATH = path.join(ROOT, "artifacts/training_os/repo_text_discovery/r25ag/repository_text_sources.json");
const REPORT_DIR = path.join(ROOT, "artifacts/training_os/repo_text_discovery/r25ag");
const REPORT_PATH = path.join(REPORT_DIR, "personal_corpus_source_ranking.json");
const SUMMARY_PATH = path.join(ROOT, "docs/R25AG_PERSONAL_CORPUS_SOURCE_RANKING.md");

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function valueRank(file) {
  const p = file.path;
  if (file.forbidden_for_training || file.eval_only || p.startsWith("evals/") || p.startsWith("artifacts/") || p.startsWith("data/public_ingestion/")) {
    return "not_for_training";
  }
  if (!file.candidate_source) return "not_for_training";
  if (/^docs\/R25(AB|AD|AE|AF|AG)_/.test(p) || p === "README.md" || p === "DATA_CARD.md") {
    return "high_value";
  }
  if (p.startsWith("training/long_horizon/") || p.startsWith("identity_pack/")) {
    return "high_value";
  }
  if (file.keyword_hits && Object.keys(file.keyword_hits).some((k) => /中文|个人|风格|写作|修复|项目|repair|style|preference|bounded judgment|local-first|static browser|tool honesty/i.test(k))) {
    return "high_value";
  }
  if (p.startsWith("training/llm_corpus/") || /^docs\/R2[45]/.test(p) || p.startsWith("knowledge_sources/")) {
    return "medium_value";
  }
  if (p.startsWith("docs/") || p === "DEPLOYMENT.md") return "medium_value";
  return "low_value";
}

function reasonFor(file, rank) {
  const p = file.path;
  if (rank === "not_for_training") {
    if (p.startsWith("evals/")) return "eval-only source";
    if (p.startsWith("artifacts/")) return "ignored generated artifact/report";
    if (p.startsWith("data/public_ingestion/")) return "metadata-only public ingestion surface";
    if (file.category === "untracked_root_documents") return "root document metadata only";
    return "not approved as training source";
  }
  if (/^docs\/R25(AB|AD|AE|AF|AG)_/.test(p)) return "recent Chinese-personal project doctrine or boundary document";
  if (p.startsWith("training/long_horizon/")) return "behavioral continuity rows";
  if (p.startsWith("identity_pack/")) return "identity and style scaffold";
  if (p.startsWith("training/llm_corpus/")) return "existing balanced training scaffold";
  if (p.startsWith("knowledge_sources/")) return "retrieval evidence, not style by default";
  if (p === "README.md" || p === "DATA_CARD.md") return "project-facing summary and corpus boundary context";
  if (p.startsWith("docs/")) return "project history and constraints";
  return "repo text candidate";
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function estimateSignal(ranked) {
  const high = ranked.filter((r) => r.value_rank === "high_value").length;
  const medium = ranked.filter((r) => r.value_rank === "medium_value").length;
  if (high >= 20) return "moderate";
  if (high >= 5 || medium >= 30) return "weak_to_moderate";
  if (high > 0 || medium > 0) return "weak";
  return "unknown";
}

function markdownSummary(report) {
  const lines = [];
  lines.push("# R25AG Personal Corpus Source Ranking");
  lines.push("");
  lines.push("R25AG ranked existing repository text surfaces for future Chinese-personal corpus review. It did not generate training rows, promote rows, modify `training/llm_corpus`, parse root PDF/DOCX content, or parse `data/public_ingestion` content.");
  lines.push("");
  lines.push("## Value Counts");
  lines.push("");
  for (const [rank, count] of Object.entries(report.summary.value_rank_counts)) {
    lines.push(`- ${rank}: ${count}`);
  }
  lines.push("");
  lines.push("## High-Value Categories");
  lines.push("");
  for (const item of report.summary.high_value_categories) {
    lines.push(`- ${item.category}: ${item.count}`);
  }
  lines.push("");
  lines.push("## Recommendation");
  lines.push("");
  lines.push(`- Estimated existing personal signal: ${report.summary.estimated_existing_personal_signal_level}`);
  lines.push(`- Recommended next action: ${report.summary.recommended_next_action}`);
  lines.push("");
  lines.push("Tracked summaries include counts and categories only. Source-specific promotion or derived-row generation still needs a later explicit approval.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

if (!fs.existsSync(DISCOVERY_PATH)) {
  throw new Error(`Missing discovery report: ${rel(DISCOVERY_PATH)}`);
}

fs.mkdirSync(REPORT_DIR, { recursive: true });
const discovery = readJson(DISCOVERY_PATH);
const ranked = discovery.files.map((file) => {
  const rank = valueRank(file);
  return {
    path: file.path,
    category: file.category,
    tracked_status: file.tracked_status,
    value_rank: rank,
    reason: reasonFor(file, rank),
    language_signal: file.language_signal || "metadata_only",
    keyword_hit_count: Object.values(file.keyword_hits || {}).reduce((sum, n) => sum + n, 0)
  };
});

const valueCounts = countBy(ranked, (r) => r.value_rank);
const highByCategory = Object.entries(countBy(ranked.filter((r) => r.value_rank === "high_value"), (r) => r.category))
  .map(([category, count]) => ({ category, count }))
  .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
const signal = estimateSignal(ranked);
const report = {
  report_id: "r25ag_personal_corpus_source_ranking",
  ok: true,
  generated_at: new Date().toISOString(),
  safety: {
    training_ran: false,
    corpus_rows_generated: false,
    training_llm_corpus_modified: false,
    root_pdf_docx_content_parsed: false,
    data_public_ingestion_content_parsed: false,
    external_api_used: false
  },
  summary: {
    total_sources_ranked: ranked.length,
    value_rank_counts: {
      high_value: valueCounts.high_value || 0,
      medium_value: valueCounts.medium_value || 0,
      low_value: valueCounts.low_value || 0,
      not_for_training: valueCounts.not_for_training || 0
    },
    high_value_categories: highByCategory,
    estimated_existing_personal_signal_level: signal,
    recommended_next_action: signal === "unknown"
      ? "pause or request reviewed private_sources"
      : "review high-value tracked project docs and long-horizon/style scaffolds before approving any derived-row generation"
  },
  ranked_sources: ranked
};

fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(SUMMARY_PATH, markdownSummary(report));
console.log(JSON.stringify({
  ok: true,
  report: rel(REPORT_PATH),
  summary: rel(SUMMARY_PATH),
  value_rank_counts: report.summary.value_rank_counts,
  estimated_existing_personal_signal_level: signal
}, null, 2));
