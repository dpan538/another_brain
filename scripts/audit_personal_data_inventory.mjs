#!/usr/bin/env node
import { execFile as execFileCb } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

const execFile = promisify(execFileCb);
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const REPORT_PATH = "artifacts/training_os/personal_inventory/r25ae/personal_data_inventory.json";
const SUMMARY_PATH = "docs/R25AE_PERSONAL_DATA_INVENTORY_SUMMARY.md";
const OVERVIEW_PATH = "docs/R25AE_PERSONAL_DATA_INVENTORY.md";
const POLICY_PATH = "training/from_scratch/personal_data_inventory_policy.r25ae.json";
const DOC_EXT_RE = /\.(pdf|docx|doc)$/i;
const ROOT_DOC_RE = /^[^/]+\.(pdf|docx|doc)$/i;
const TEXT_SUMMARY_EXT_RE = /\.(jsonl|json|md)$/i;
const LEGACY_HINT_RE = /(drive[-_ ]?inventory|source[-_ ]?inventory|public_ingestion|ingestion[-_ ]?manifest|file[-_ ]?inventory|disk[-_ ]?scan|hard[-_ ]?drive|source_material|personal[-_ ]?import|identity[-_ ]?interview|raw[-_ ]?answers|extracted[-_ ]?text)/i;

function toRepoPath(absPath) {
  return relative(ROOT, absPath).split(sep).join("/");
}

function insideRepo(absPath) {
  const resolved = resolve(absPath);
  return resolved === ROOT || resolved.startsWith(`${ROOT}${sep}`);
}

function assertRepoPath(repoPath) {
  const abs = resolve(ROOT, repoPath);
  if (!insideRepo(abs)) throw new Error(`Refusing path outside repo: ${repoPath}`);
  return abs;
}

async function runGit(args) {
  const { stdout } = await execFile("git", args, { cwd: ROOT, maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

function parseGitStatusZ(stdout) {
  const entries = [];
  const parts = stdout.split("\0").filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    const raw = parts[index];
    const status = raw.slice(0, 2);
    const path = raw.slice(3);
    if (!path) continue;
    entries.push({ status, path });
    if (status.includes("R") || status.includes("C")) index += 1;
  }
  return entries;
}

function addDist(dist, key, amount = 1) {
  const normalized = key || "unknown";
  dist[normalized] = (dist[normalized] || 0) + amount;
}

function summarizeFiles(files) {
  const extension_distribution = {};
  const status_distribution = {};
  let total_bytes = 0;
  for (const file of files) {
    total_bytes += file.bytes || 0;
    addDist(extension_distribution, file.extension || "(none)");
    addDist(status_distribution, file.git_status || "unknown");
  }
  return {
    file_count: files.length,
    total_bytes,
    extension_distribution,
    status_distribution
  };
}

async function metadataForPath(repoPath, gitStatus, options = {}) {
  const abs = assertRepoPath(repoPath);
  const st = await stat(abs).catch(() => null);
  if (!st || !st.isFile()) return null;
  const metadata = {
    path: repoPath,
    extension: extname(repoPath).toLowerCase() || "(none)",
    bytes: st.size,
    git_status: gitStatus || "unknown"
  };
  if (options.sha256 === true) {
    const bytes = await readFile(abs);
    metadata.sha256 = createHash("sha256").update(bytes).digest("hex");
  }
  return metadata;
}

async function walkFiles(repoDir, options = {}) {
  const absDir = assertRepoPath(repoDir);
  const out = [];
  async function visit(abs) {
    if (!insideRepo(abs)) throw new Error(`Refusing walk outside repo: ${abs}`);
    const entries = await readdir(abs, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const child = resolve(abs, entry.name);
      const repoPath = toRepoPath(child);
      if (options.skip && options.skip(repoPath)) continue;
      if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile()) {
        out.push(repoPath);
      }
    }
  }
  await visit(absDir);
  return out;
}

async function summarizeStructuredFile(repoPath) {
  if (!TEXT_SUMMARY_EXT_RE.test(repoPath)) return null;
  const text = await readFile(assertRepoPath(repoPath), "utf8").catch(() => null);
  if (text == null) return null;
  const summary = {
    path: repoPath,
    bytes: Buffer.byteLength(text, "utf8"),
    fields: {},
    row_count: 0
  };
  if (repoPath.endsWith(".jsonl")) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      summary.row_count += 1;
      try {
        const row = JSON.parse(line);
        if (row && typeof row === "object" && !Array.isArray(row)) {
          for (const key of Object.keys(row)) addDist(summary.fields, key);
        }
      } catch {
        addDist(summary.fields, "__parse_error__");
      }
    }
    return summary;
  }
  if (repoPath.endsWith(".json")) {
    try {
      const parsed = JSON.parse(text);
      const records = Array.isArray(parsed) ? parsed : [parsed];
      summary.row_count = records.length;
      for (const row of records) {
        if (row && typeof row === "object" && !Array.isArray(row)) {
          for (const key of Object.keys(row)) addDist(summary.fields, key);
        }
      }
    } catch {
      addDist(summary.fields, "__parse_error__");
    }
    return summary;
  }
  summary.line_count = text.split(/\r?\n/).length;
  return summary;
}

function classifyStatus(repoPath, trackedSet, statusMap) {
  if (trackedSet.has(repoPath)) return "tracked";
  const direct = statusMap.get(repoPath);
  if (direct) return direct.status.trim() || direct.status;
  for (const [prefix, entry] of statusMap.entries()) {
    if (repoPath.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)) return entry.status.trim() || entry.status;
  }
  return "untracked";
}

async function main() {
  const tracked = (await runGit(["ls-files", "-z"])).split("\0").filter(Boolean);
  const trackedSet = new Set(tracked);
  const statusEntries = parseGitStatusZ(await runGit(["status", "--porcelain=v1", "-z"]));
  const ignoredEntries = parseGitStatusZ(await runGit(["status", "--ignored", "--porcelain=v1", "-z"]));
  const statusMap = new Map();
  for (const entry of [...statusEntries, ...ignoredEntries]) statusMap.set(entry.path, entry);

  const rootEntries = await readdir(ROOT, { withFileTypes: true });
  const rootDocPaths = [];
  for (const entry of rootEntries) {
    if (entry.isFile() && DOC_EXT_RE.test(entry.name)) rootDocPaths.push(entry.name);
  }

  const publicIngestionFiles = await walkFiles("data/public_ingestion").catch(() => []);
  const artifactFiles = await walkFiles("artifacts").catch(() => []);

  const allKnownPaths = new Set([
    ...tracked,
    ...statusEntries.map((entry) => entry.path),
    ...ignoredEntries.map((entry) => entry.path),
    ...publicIngestionFiles,
    ...artifactFiles,
    ...rootDocPaths
  ]);

  const categoryPaths = {
    tracked_training_corpus: tracked.filter((path) => /^training\/llm_corpus\/[^/]+\.jsonl$/i.test(path)),
    tracked_long_horizon: tracked.filter((path) => /^training\/long_horizon\/[^/]+\.jsonl$/i.test(path)),
    tracked_eval_only: tracked.filter((path) => path.startsWith("evals/")),
    tracked_knowledge_sources: tracked.filter((path) => path.startsWith("knowledge_sources/")),
    tracked_identity_or_style_scaffold: tracked.filter((path) => path.startsWith("identity_pack/")),
    tracked_docs: tracked.filter((path) => path === "README.md" || path === "DATA_CARD.md" || path === "DEPLOYMENT.md" || path.startsWith("docs/")),
    untracked_root_documents: rootDocPaths.filter((path) => ROOT_DOC_RE.test(path) && !trackedSet.has(path)),
    untracked_public_ingestion: publicIngestionFiles,
    ignored_artifacts: artifactFiles,
    unknown_or_legacy_scan_outputs: [...allKnownPaths].filter((path) => LEGACY_HINT_RE.test(path))
  };

  const categories = {};
  for (const [category, paths] of Object.entries(categoryPaths)) {
    const files = [];
    for (const path of paths) {
      const metadata = await metadataForPath(path, classifyStatus(path, trackedSet, statusMap));
      if (metadata) files.push(metadata);
    }
    categories[category] = {
      ...summarizeFiles(files),
      metadata_only: category === "untracked_root_documents" || category === "untracked_public_ingestion" || category === "ignored_artifacts",
      files
    };
  }

  const structured_summaries = [];
  const structuredPaths = [
    ...categoryPaths.tracked_training_corpus,
    ...categoryPaths.tracked_long_horizon,
    ...categoryPaths.tracked_eval_only.filter((path) => /\.(jsonl|json)$/i.test(path)),
    ...categoryPaths.tracked_knowledge_sources.filter((path) => /\.(jsonl|json)$/i.test(path)),
    ...categoryPaths.tracked_identity_or_style_scaffold.filter((path) => /\.(jsonl|json)$/i.test(path))
  ];
  for (const path of structuredPaths) {
    const summary = await summarizeStructuredFile(path);
    if (summary) structured_summaries.push(summary);
  }

  const trainingRowsByFile = {};
  for (const summary of structured_summaries.filter((item) => item.path.startsWith("training/llm_corpus/"))) {
    trainingRowsByFile[summary.path] = summary.row_count;
  }

  const report = {
    ok: true,
    report_id: "r25ae_personal_data_inventory",
    generated_at: new Date().toISOString(),
    repo_root: ROOT,
    repo_root_only: true,
    scan_outside_repo: false,
    training_ran: false,
    corpus_generated: false,
    root_pdf_docx_content_parsed: false,
    data_public_ingestion_content_parsed: false,
    private_raw_data_ingested: false,
    phase_4_scaled_training_approved: false,
    product_model_training_allowed: false,
    active_training_approval_count: 0,
    policy_path: POLICY_PATH,
    categories,
    structured_summaries,
    aggregate_training_rows_by_file: trainingRowsByFile,
    notes: [
      "Root PDF/DOC/DOCX surfaces were treated as metadata-only.",
      "data/public_ingestion was counted by file metadata only.",
      "Ignored artifacts were counted as local generated material and are not commit candidates.",
      "Tracked summaries intentionally omit raw text and private file names."
    ]
  };

  await mkdir(dirname(assertRepoPath(REPORT_PATH)), { recursive: true });
  await writeFile(assertRepoPath(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const summaryLines = [
    "# R25AE Personal Data Inventory Summary",
    "",
    "R25AE is a repository-scoped inventory audit only. It does not train, does not expand corpus, does not scan outside the repo root, does not ingest root PDFs/DOCX, and does not parse `data/public_ingestion/` content.",
    "",
    "Current product and formal training progress remain 0%. Phase_4 scaled training remains blocked. No weights are committed, and detailed inventory JSON stays ignored under `artifacts/training_os/personal_inventory/r25ae/`.",
    "",
    "## Aggregate Counts",
    "",
    `- Tracked training corpus files: ${categories.tracked_training_corpus.file_count}; rows by file: ${Object.entries(trainingRowsByFile).map(([path, count]) => `${path}=${count}`).join(", ") || "none"}.`,
    `- Tracked long-horizon files: ${categories.tracked_long_horizon.file_count}; total bytes: ${categories.tracked_long_horizon.total_bytes}.`,
    `- Eval-only tracked files: ${categories.tracked_eval_only.file_count}; total bytes: ${categories.tracked_eval_only.total_bytes}.`,
    `- Knowledge-source tracked files: ${categories.tracked_knowledge_sources.file_count}; total bytes: ${categories.tracked_knowledge_sources.total_bytes}.`,
    `- Identity/style scaffold tracked files: ${categories.tracked_identity_or_style_scaffold.file_count}; total bytes: ${categories.tracked_identity_or_style_scaffold.total_bytes}.`,
    `- Tracked docs: ${categories.tracked_docs.file_count}; total bytes: ${categories.tracked_docs.total_bytes}.`,
    `- Untracked root PDF/DOC/DOCX files: ${categories.untracked_root_documents.file_count}; total bytes: ${categories.untracked_root_documents.total_bytes}.`,
    `- data/public_ingestion files: ${categories.untracked_public_ingestion.file_count}; total bytes: ${categories.untracked_public_ingestion.total_bytes}.`,
    `- Ignored artifact files: ${categories.ignored_artifacts.file_count}; total bytes: ${categories.ignored_artifacts.total_bytes}.`,
    `- Possible legacy scan footprint paths inside repo: ${categories.unknown_or_legacy_scan_outputs.file_count}.`,
    "",
    "## Boundary Result",
    "",
    "- Root personal documents are not parsed and are not training sources.",
    "- `data/public_ingestion/` is metadata-only in R25AE and is not a training source.",
    "- Detailed inventory artifacts are ignored and must not be staged.",
    "- Future corpus expansion needs fresh approval; future training needs separate fresh approval.",
    ""
  ];
  await writeFile(assertRepoPath(SUMMARY_PATH), `${summaryLines.join("\n")}\n`, "utf8");

  const overviewLines = [
    "# R25AE Personal Data Inventory",
    "",
    "R25AE inventories current personal-data surfaces inside this repository only. It preserves all R24/R25 gates and previous pilot decisions, and it does not train, expand corpus, scan outside the repo root, ingest root PDFs/DOCX, or parse `data/public_ingestion/` content.",
    "",
    "The detailed inventory is written to ignored local artifacts. Tracked R25AE docs contain aggregate counts only, with no raw private text and no private document contents.",
    "",
    "- Policy: `docs/R25AE_PERSONAL_DATA_INVENTORY_POLICY.md`",
    "- Inventory summary: `docs/R25AE_PERSONAL_DATA_INVENTORY_SUMMARY.md`",
    "- Corpus signal summary: `docs/R25AE_PERSONAL_CORPUS_SIGNAL_SUMMARY.md`",
    "- Legacy scan audit: `docs/R25AE_LEGACY_DISK_SCAN_AUDIT.md`",
    "",
    "Phase_4 remains blocked. Product and formal training progress remain 0%. No weights or generated inventory artifacts are committed.",
    ""
  ];
  await writeFile(assertRepoPath(OVERVIEW_PATH), `${overviewLines.join("\n")}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    report_path: REPORT_PATH,
    summary_path: SUMMARY_PATH,
    root_documents: categories.untracked_root_documents.file_count,
    public_ingestion_files: categories.untracked_public_ingestion.file_count,
    ignored_artifacts: categories.ignored_artifacts.file_count,
    training_rows_by_file: trainingRowsByFile,
    training_ran: false,
    corpus_generated: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
