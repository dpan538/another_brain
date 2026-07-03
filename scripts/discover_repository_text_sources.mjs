#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "artifacts/training_os/repo_text_discovery/r25ag");
const REPORT_PATH = path.join(REPORT_DIR, "repository_text_sources.json");
const SUMMARY_PATH = path.join(ROOT, "docs/R25AG_REPOSITORY_TEXT_SOURCE_SUMMARY.md");

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".jsonl", ".js", ".mjs", ".py"]);
const DOC_EXTENSIONS = new Set([".pdf", ".doc", ".docx"]);
const KEYWORDS = [
  "中文",
  "个人",
  "风格",
  "诗",
  "写作",
  "修复",
  "项目",
  "continuation",
  "repair",
  "style",
  "preference",
  "bounded judgment",
  "local-first",
  "static browser",
  "tool honesty"
];

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

function parseStatusZ(output) {
  const entries = [];
  const parts = output.split("\0").filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    const raw = parts[i];
    const code = raw.slice(0, 2);
    const file = raw.slice(3);
    if (!file) continue;
    entries.push({ code, path: file });
    if (code.startsWith("R") || code.startsWith("C")) i += 1;
  }
  return entries;
}

function walkFiles(relativeDir) {
  const start = repoPath(relativeDir);
  if (!fs.existsSync(start)) return [];
  const out = [];
  const stack = [start];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (!full.startsWith(ROOT + path.sep)) continue;
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(rel(full));
      }
    }
  }
  return out.sort();
}

function isRootDocument(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  return !relativePath.includes("/") && DOC_EXTENSIONS.has(ext);
}

function statusFor(relativePath, trackedSet, statusEntries) {
  if (trackedSet.has(relativePath)) return "tracked";
  for (const entry of statusEntries) {
    const normalized = entry.path.replace(/\/$/, "");
    if (relativePath === normalized || relativePath.startsWith(normalized + "/")) {
      if (entry.code === "!!") return "ignored";
      if (entry.code === "??") return "untracked";
      return "modified_or_unmerged";
    }
  }
  return "untracked";
}

function categoryFor(relativePath, status) {
  if (relativePath === "README.md" || relativePath === "DATA_CARD.md" || relativePath === "DEPLOYMENT.md" || relativePath.startsWith("docs/")) {
    return "tracked_project_docs";
  }
  if (relativePath.startsWith("training/llm_corpus/")) return "tracked_training_corpus";
  if (relativePath.startsWith("training/long_horizon/")) return "tracked_long_horizon";
  if (relativePath.startsWith("identity_pack/")) return "tracked_identity_pack";
  if (relativePath.startsWith("knowledge_sources/")) return "tracked_knowledge_sources";
  if (relativePath.startsWith("evals/")) return "tracked_eval_only";
  if (isRootDocument(relativePath)) return "untracked_root_documents";
  if (relativePath.startsWith("data/public_ingestion/")) return "data_public_ingestion";
  if (relativePath.startsWith("artifacts/")) return "ignored_artifact_reports";
  if (status === "untracked" && TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) return "untracked_text_files";
  if (/inventory|manifest|source|scan|ingestion/i.test(relativePath)) return "possible_legacy_scan_outputs";
  return status === "ignored" ? "ignored_artifact_reports" : "other_repo_file";
}

function canReadContent(relativePath, status) {
  const ext = path.extname(relativePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) return false;
  if (isRootDocument(relativePath)) return false;
  if (relativePath.startsWith("data/public_ingestion/")) return false;
  if (relativePath.startsWith("artifacts/")) return false;
  if (status !== "tracked") return false;
  return true;
}

function languageSignal(text) {
  const zh = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (zh === 0 && latin === 0) return "unknown";
  if (zh > 0 && latin > 0) return "mixed";
  if (zh > 0) return "zh";
  return "en";
}

function keywordHits(text) {
  const lower = text.toLowerCase();
  const hits = {};
  for (const keyword of KEYWORDS) {
    const needle = /[\u3400-\u9fff]/.test(keyword) ? keyword : keyword.toLowerCase();
    const count = needle ? lower.split(needle).length - 1 : 0;
    if (count > 0) hits[keyword] = count;
  }
  return hits;
}

function sha256File(relativePath) {
  const full = repoPath(relativePath);
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(full));
  return hash.digest("hex");
}

function fileMeta(relativePath, trackedSet, statusEntries) {
  const full = repoPath(relativePath);
  const stat = fs.statSync(full);
  const ext = path.extname(relativePath).toLowerCase() || "(none)";
  const status = statusFor(relativePath, trackedSet, statusEntries);
  const category = categoryFor(relativePath, status);
  const generated = relativePath.startsWith("artifacts/");
  const evalOnly = relativePath.startsWith("evals/");
  const metadataOnly = isRootDocument(relativePath) || relativePath.startsWith("data/public_ingestion/") || relativePath.startsWith("artifacts/") || status !== "tracked";
  const forbiddenForTraining = evalOnly || isRootDocument(relativePath) || relativePath.startsWith("data/public_ingestion/") || relativePath.startsWith("artifacts/");
  const candidateSource = !forbiddenForTraining && [
    "tracked_project_docs",
    "tracked_training_corpus",
    "tracked_long_horizon",
    "tracked_identity_pack",
    "tracked_knowledge_sources"
  ].includes(category);

  const meta = {
    path: relativePath,
    extension: ext,
    byte_size: stat.size,
    tracked_status: status,
    category,
    generated,
    candidate_source: candidateSource,
    eval_only: evalOnly,
    metadata_only: metadataOnly,
    forbidden_for_training: forbiddenForTraining
  };

  if (metadataOnly && (isRootDocument(relativePath) || relativePath.startsWith("data/public_ingestion/"))) {
    meta.sha256 = sha256File(relativePath);
  }

  if (canReadContent(relativePath, status)) {
    const text = fs.readFileSync(full, "utf8");
    meta.line_count = text.length ? text.split(/\r?\n/).length : 0;
    meta.language_signal = languageSignal(text);
    meta.keyword_hits = keywordHits(text);
  }
  return meta;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function byteTotalsBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + item.byte_size;
  }
  return counts;
}

function markdownSummary(report) {
  const lines = [];
  lines.push("# R25AG Repository Text Source Summary");
  lines.push("");
  lines.push("R25AG searched only inside the repository root and produced aggregate source-discovery metadata. It did not train, generate corpus rows, modify `training/llm_corpus`, parse root PDF/DOCX content, bulk-parse `data/public_ingestion`, call external APIs, or commit artifacts.");
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push(`- Repo-root-only discovery: ${report.safety.repo_root_only ? "yes" : "no"}`);
  lines.push(`- Training ran: ${report.safety.training_ran ? "yes" : "no"}`);
  lines.push(`- Corpus rows generated: ${report.safety.corpus_rows_generated ? "yes" : "no"}`);
  lines.push(`- Root PDF/DOCX content parsed: ${report.safety.root_pdf_docx_content_parsed ? "yes" : "no"}`);
  lines.push(`- data/public_ingestion content parsed: ${report.safety.data_public_ingestion_content_parsed ? "yes" : "no"}`);
  lines.push("");
  lines.push("## File Counts");
  lines.push("");
  lines.push(`- Tracked text/source files: ${report.summary.tracked_text_source_count}`);
  lines.push(`- Untracked text/source files: ${report.summary.untracked_text_source_count}`);
  lines.push(`- Ignored artifact/report files: ${report.summary.ignored_report_artifact_count}`);
  lines.push(`- Root PDF/DOC/DOCX metadata files: ${report.summary.root_pdf_docx_metadata_count}`);
  lines.push(`- data/public_ingestion metadata files: ${report.summary.data_public_ingestion_metadata_count}`);
  lines.push(`- data/public_ingestion metadata bytes: ${report.summary.data_public_ingestion_total_bytes}`);
  lines.push("");
  lines.push("## Categories");
  lines.push("");
  for (const [category, count] of Object.entries(report.summary.category_counts).sort()) {
    lines.push(`- ${category}: ${count}`);
  }
  lines.push("");
  lines.push("## Candidate Signals");
  lines.push("");
  lines.push(`- Candidate source files: ${report.summary.candidate_source_count}`);
  lines.push(`- Eval-only files: ${report.summary.eval_only_count}`);
  lines.push(`- Metadata-only files: ${report.summary.metadata_only_count}`);
  lines.push(`- Forbidden-for-training surfaces: ${report.summary.forbidden_for_training_count}`);
  lines.push("");
  lines.push("This summary intentionally excludes raw private text and long excerpts. Detailed metadata is written only to ignored artifacts.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

fs.mkdirSync(REPORT_DIR, { recursive: true });

const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean).sort();
const trackedSet = new Set(tracked);
const statusEntries = [
  ...parseStatusZ(git(["status", "--porcelain=v1", "-z"])),
  ...parseStatusZ(git(["status", "--ignored", "--porcelain=v1", "-z"]))
];

const rootsToWalk = [
  "docs",
  "training/llm_corpus",
  "training/long_horizon",
  "identity_pack",
  "knowledge_sources",
  "evals",
  "data/public_ingestion",
  "artifacts"
];
const rootFiles = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

const allPaths = new Set([...tracked, ...rootFiles]);
for (const entry of statusEntries) {
  const normalized = entry.path.replace(/\/$/, "");
  if (normalized && fs.existsSync(repoPath(normalized))) {
    const stat = fs.statSync(repoPath(normalized));
    if (stat.isFile()) allPaths.add(normalized);
  }
}
for (const root of rootsToWalk) {
  for (const file of walkFiles(root)) allPaths.add(file);
}

const files = [];
for (const relativePath of [...allPaths].sort()) {
  const full = repoPath(relativePath);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
  try {
    files.push(fileMeta(relativePath, trackedSet, statusEntries));
  } catch (error) {
    files.push({
      path: relativePath,
      tracked_status: statusFor(relativePath, trackedSet, statusEntries),
      category: "metadata_error",
      error: error.message,
      metadata_only: true,
      candidate_source: false,
      forbidden_for_training: true
    });
  }
}

const report = {
  report_id: "r25ag_repository_text_sources",
  ok: true,
  generated_at: new Date().toISOString(),
  safety: {
    repo_root_only: true,
    scan_outside_repo: false,
    training_ran: false,
    corpus_rows_generated: false,
    training_llm_corpus_modified: false,
    root_pdf_docx_content_parsed: false,
    data_public_ingestion_content_parsed: false,
    external_api_used: false,
    artifacts_committed: false
  },
  summary: {
    total_files_considered: files.length,
    tracked_text_source_count: files.filter((f) => f.tracked_status === "tracked" && TEXT_EXTENSIONS.has(f.extension)).length,
    untracked_text_source_count: files.filter((f) => f.tracked_status === "untracked" && TEXT_EXTENSIONS.has(f.extension)).length,
    ignored_report_artifact_count: files.filter((f) => f.tracked_status === "ignored" || f.path.startsWith("artifacts/")).length,
    root_pdf_docx_metadata_count: files.filter((f) => isRootDocument(f.path)).length,
    data_public_ingestion_metadata_count: files.filter((f) => f.path.startsWith("data/public_ingestion/")).length,
    data_public_ingestion_total_bytes: files.filter((f) => f.path.startsWith("data/public_ingestion/")).reduce((sum, f) => sum + (f.byte_size || 0), 0),
    category_counts: countBy(files, (f) => f.category),
    status_counts: countBy(files, (f) => f.tracked_status),
    extension_counts: countBy(files, (f) => f.extension || "(none)"),
    bytes_by_category: byteTotalsBy(files, (f) => f.category),
    language_signal_counts: countBy(files.filter((f) => f.language_signal), (f) => f.language_signal),
    candidate_source_count: files.filter((f) => f.candidate_source).length,
    eval_only_count: files.filter((f) => f.eval_only).length,
    metadata_only_count: files.filter((f) => f.metadata_only).length,
    forbidden_for_training_count: files.filter((f) => f.forbidden_for_training).length
  },
  keyword_totals: files.reduce((acc, file) => {
    for (const [keyword, count] of Object.entries(file.keyword_hits || {})) {
      acc[keyword] = (acc[keyword] || 0) + count;
    }
    return acc;
  }, {}),
  files
};

fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(SUMMARY_PATH, markdownSummary(report));
console.log(JSON.stringify({
  ok: true,
  report: rel(REPORT_PATH),
  summary: rel(SUMMARY_PATH),
  tracked_text_source_count: report.summary.tracked_text_source_count,
  untracked_text_source_count: report.summary.untracked_text_source_count,
  root_pdf_docx_metadata_count: report.summary.root_pdf_docx_metadata_count,
  data_public_ingestion_metadata_count: report.summary.data_public_ingestion_metadata_count
}, null, 2));
