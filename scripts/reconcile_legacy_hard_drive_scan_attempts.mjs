#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "artifacts/training_os/repo_text_discovery/r25ag");
const REPORT_PATH = path.join(REPORT_DIR, "legacy_scan_reconciliation.json");
const SUMMARY_PATH = path.join(ROOT, "docs/R25AG_LEGACY_SCAN_RECONCILIATION.md");

const TERMS = [
  "public_ingestion",
  "source inventory",
  "drive inventory",
  "disk scan",
  "hard drive",
  "source_material",
  "identity interview",
  "raw answers",
  "file manifest",
  "/Users/",
  "Desktop/",
  "Documents/",
  "poem",
  "poetry",
  "essay",
  "writing",
  "docx",
  "pdf"
];
const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".jsonl", ".js", ".mjs", ".py"]);
const DOC_EXTENSIONS = new Set([".pdf", ".doc", ".docx"]);

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
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
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

function isRootDoc(relativePath) {
  return !relativePath.includes("/") && DOC_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

function canRead(relativePath, status) {
  if (status !== "tracked") return false;
  if (!TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) return false;
  if (isRootDoc(relativePath)) return false;
  if (relativePath.startsWith("data/public_ingestion/")) return false;
  if (relativePath.startsWith("artifacts/")) return false;
  return true;
}

function termHits(textOrPath) {
  const lower = textOrPath.toLowerCase();
  return TERMS.filter((term) => lower.includes(term.toLowerCase()));
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function markdownSummary(report) {
  const lines = [];
  lines.push("# R25AG Legacy Scan Reconciliation");
  lines.push("");
  lines.push("R25AG reconciled earlier hard-drive/source-scan signs inside the repository only. It did not follow external paths, parse root PDF/DOCX content, parse `data/public_ingestion` content, or generate corpus rows.");
  lines.push("");
  lines.push("## Findings");
  lines.push("");
  lines.push(`- Possible scan-output files: ${report.summary.possible_scan_output_count}`);
  lines.push(`- Path-inventory-only candidates: ${report.summary.path_inventory_only_count}`);
  lines.push(`- Imported-text signal files: ${report.summary.imported_text_signal_count}`);
  lines.push(`- Referenced by package scripts: ${report.summary.referenced_by_package_scripts_count}`);
  lines.push(`- Feed ` + "`training/llm_corpus`" + `: ${report.summary.feed_counts.training_llm_corpus}`);
  lines.push(`- Feed ` + "`identity_pack`" + `: ${report.summary.feed_counts.identity_pack}`);
  lines.push(`- Feed ` + "`knowledge_sources`" + `: ${report.summary.feed_counts.knowledge_sources}`);
  lines.push("");
  lines.push("## Conclusion");
  lines.push("");
  lines.push(`- Early hard-drive scan appears to have imported useful training material: ${report.summary.early_hard_drive_scan_imported_useful_training_material ? "yes" : "no"}`);
  lines.push(`- Root personal files currently ingested into training corpus: ${report.summary.root_personal_files_ingested_into_training_corpus ? "yes" : "no"}`);
  lines.push(`- data/public_ingestion currently ingested into training corpus: ${report.summary.data_public_ingestion_ingested_into_training_corpus ? "yes" : "no"}`);
  lines.push("");
  lines.push("Detailed path-level metadata is kept in ignored artifacts; this tracked summary avoids long path lists and raw private text.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

fs.mkdirSync(REPORT_DIR, { recursive: true });

const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const trackedSet = new Set(tracked);
const statusEntries = [
  ...parseStatusZ(git(["status", "--porcelain=v1", "-z"])),
  ...parseStatusZ(git(["status", "--ignored", "--porcelain=v1", "-z"]))
];
const roots = ["docs", "scripts", "training", "identity_pack", "knowledge_sources", "evals", "data/public_ingestion", "artifacts"];
const allPaths = new Set([...tracked]);
for (const root of roots) {
  for (const file of walkFiles(root)) allPaths.add(file);
}
for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (entry.isFile()) allPaths.add(entry.name);
}

const packageText = fs.existsSync(repoPath("package.json")) ? fs.readFileSync(repoPath("package.json"), "utf8") : "";
const findings = [];
for (const relativePath of [...allPaths].sort()) {
  const full = repoPath(relativePath);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
  const status = statusFor(relativePath, trackedSet, statusEntries);
  const pathHits = termHits(relativePath);
  let contentHits = [];
  let contentSignal = false;
  if (canRead(relativePath, status)) {
    const text = fs.readFileSync(full, "utf8");
    contentHits = termHits(text);
    contentSignal = contentHits.length > 0;
  }
  if (!pathHits.length && !contentHits.length) continue;

  const stat = fs.statSync(full);
  const isAuditOrPolicyText = /^(scripts\/audit_|scripts\/reconcile_|scripts\/check_|docs\/R25A[EFG]|training\/from_scratch\/.*policy)/.test(relativePath);
  const feedTraining = !isAuditOrPolicyText && (
    /training\/llm_corpus|r25l_train|r25l_dev|r25l_heldout/.test(relativePath) ||
    contentHits.some((hit) => /training\/llm_corpus/i.test(hit))
  );
  const feedIdentity = /identity_pack/.test(relativePath) || contentHits.some((hit) => /identity interview/i.test(hit));
  const feedKnowledge = /knowledge_sources/.test(relativePath) || /knowledge_sources/.test(packageText) && packageText.includes(relativePath);
  const importedTextSignal = !isAuditOrPolicyText && contentSignal && contentHits.some((hit) => /raw answers|source_material|identity interview|poem|poetry|essay|writing/i.test(hit));
  findings.push({
    path: relativePath,
    tracked_status: status,
    extension: path.extname(relativePath).toLowerCase() || "(none)",
    byte_size: stat.size,
    metadata_only: !canRead(relativePath, status),
    path_hits: pathHits,
    content_hit_terms: contentHits,
    appears_to_be_scan_manifest: /inventory|manifest|scan|public_ingestion|source_material/i.test(relativePath) || pathHits.length > 0,
    appears_path_inventory_only: pathHits.length > 0 && !importedTextSignal,
    appears_to_include_imported_text: importedTextSignal,
    feeds_training_llm_corpus: feedTraining && importedTextSignal,
    feeds_identity_pack: feedIdentity,
    feeds_knowledge_sources: feedKnowledge,
    referenced_by_package_scripts: packageText.includes(relativePath)
  });
}

const feedCounts = {
  training_llm_corpus: findings.filter((f) => f.feeds_training_llm_corpus).length,
  identity_pack: findings.filter((f) => f.feeds_identity_pack).length,
  knowledge_sources: findings.filter((f) => f.feeds_knowledge_sources).length
};
const importedUseful = findings.some((f) => f.feeds_training_llm_corpus && f.appears_to_include_imported_text && !f.path.startsWith("training/llm_corpus/"));
const report = {
  report_id: "r25ag_legacy_scan_reconciliation",
  ok: true,
  generated_at: new Date().toISOString(),
  safety: {
    repo_root_only: true,
    scan_outside_repo: false,
    root_pdf_docx_content_parsed: false,
    data_public_ingestion_content_parsed: false,
    training_ran: false,
    corpus_rows_generated: false,
    external_api_used: false
  },
  summary: {
    possible_scan_output_count: findings.length,
    status_counts: countBy(findings, (f) => f.tracked_status),
    path_inventory_only_count: findings.filter((f) => f.appears_path_inventory_only).length,
    imported_text_signal_count: findings.filter((f) => f.appears_to_include_imported_text).length,
    referenced_by_package_scripts_count: findings.filter((f) => f.referenced_by_package_scripts).length,
    feed_counts: feedCounts,
    early_hard_drive_scan_imported_useful_training_material: importedUseful,
    root_personal_files_ingested_into_training_corpus: false,
    data_public_ingestion_ingested_into_training_corpus: false
  },
  findings
};

fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(SUMMARY_PATH, markdownSummary(report));
console.log(JSON.stringify({
  ok: true,
  report: rel(REPORT_PATH),
  summary: rel(SUMMARY_PATH),
  possible_scan_output_count: report.summary.possible_scan_output_count,
  early_hard_drive_scan_imported_useful_training_material: report.summary.early_hard_drive_scan_imported_useful_training_material
}, null, 2));
