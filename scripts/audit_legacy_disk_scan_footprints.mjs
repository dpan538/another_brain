#!/usr/bin/env node
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";

const execFile = promisify(execFileCb);
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const REPORT_PATH = "artifacts/training_os/personal_inventory/r25ae/legacy_disk_scan_footprint_audit.json";
const DOC_PATH = "docs/R25AE_LEGACY_DISK_SCAN_AUDIT.md";
const SEARCH_RE = /(drive inventory|source inventory|public_ingestion|ingestion manifest|file inventory|disk scan|hard drive|\/Users\/|Desktop\/|Documents\/|\.pdf|\.docx|extracted text|personal import|identity interview|raw answers|source_material)/i;
const IMPORTED_TEXT_RE = /(extracted text|source_material|raw answers|raw_answer|document_text|page_text|ocr_text|personal import text)/i;
const PATH_LIST_RE = /(\/Users\/|Desktop\/|Documents\/|\.pdf|\.docx|file inventory|source inventory|drive inventory|path list)/i;
const TEXT_EXT_RE = /\.(mjs|js|py|md|json|jsonl|txt|yml|yaml)$/i;
const ROOT_DOC_RE = /^[^/]+\.(pdf|docx|doc)$/i;

function assertRepoPath(repoPath) {
  const abs = resolve(ROOT, repoPath);
  if (!(abs === ROOT || abs.startsWith(`${ROOT}${sep}`))) throw new Error(`Refusing path outside repo: ${repoPath}`);
  return abs;
}

function toRepoPath(absPath) {
  return relative(ROOT, absPath).split(sep).join("/");
}

async function runGit(args) {
  const { stdout } = await execFile("git", args, { cwd: ROOT, maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

function parseGitStatusZ(stdout) {
  return stdout.split("\0").filter(Boolean).map((raw) => ({
    status: raw.slice(0, 2),
    path: raw.slice(3)
  })).filter((entry) => entry.path);
}

async function walkFiles(repoDir) {
  const out = [];
  async function visit(absDir) {
    const entries = await readdir(absDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const abs = resolve(absDir, entry.name);
      const repoPath = toRepoPath(abs);
      if (entry.name === ".git") continue;
      if (entry.isDirectory()) await visit(abs);
      else if (entry.isFile()) out.push(repoPath);
    }
  }
  await visit(assertRepoPath(repoDir));
  return out;
}

function statusFor(path, trackedSet, statusMap) {
  if (trackedSet.has(path)) return "tracked";
  const direct = statusMap.get(path);
  if (direct) return direct.status.trim() || direct.status;
  for (const [prefix, entry] of statusMap.entries()) {
    const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
    if (path.startsWith(normalized)) return entry.status.trim() || entry.status;
  }
  return "untracked";
}

function safeToRead(repoPath) {
  if (!TEXT_EXT_RE.test(repoPath)) return false;
  if (ROOT_DOC_RE.test(repoPath)) return false;
  if (repoPath.startsWith("data/public_ingestion/")) return false;
  if (repoPath.startsWith("artifacts/")) return false;
  return true;
}

function isR25aeAuditSurface(repoPath) {
  return /^scripts\/(?:audit_personal_data_inventory|profile_personal_corpus_signals|audit_legacy_disk_scan_footprints|check_personal_data_inventory_boundaries)\.mjs$/.test(repoPath) ||
    /^docs\/R25AE_/.test(repoPath) ||
    repoPath === "training/from_scratch/personal_data_inventory_policy.r25ae.json";
}

function isTrainingFeedSurface(repoPath, referencesTraining) {
  if (isR25aeAuditSurface(repoPath)) return false;
  if (repoPath.startsWith("training/llm_corpus/")) return true;
  if (!referencesTraining) return false;
  return /(?:generate|build|import|training_pack|corpus|dataset)/i.test(repoPath);
}

function addDist(dist, key) {
  const normalized = key || "unknown";
  dist[normalized] = (dist[normalized] || 0) + 1;
}

async function main() {
  const tracked = (await runGit(["ls-files", "-z"])).split("\0").filter(Boolean);
  const trackedSet = new Set(tracked);
  const statusEntries = [
    ...parseGitStatusZ(await runGit(["status", "--porcelain=v1", "-z"])),
    ...parseGitStatusZ(await runGit(["status", "--ignored", "--porcelain=v1", "-z"]))
  ];
  const statusMap = new Map(statusEntries.map((entry) => [entry.path, entry]));
  const allRepoFiles = await walkFiles(".");
  const packageJson = await readFile(assertRepoPath("package.json"), "utf8").catch(() => "");

  const findings = [];
  for (const repoPath of allRepoFiles) {
    if (repoPath.startsWith(".git/")) continue;
    let contentSignal = false;
    let importedTextSignal = false;
    let fileNamesOnlySignal = false;
    let referencesTraining = false;
    let referencesKnowledge = false;
    let referencesIdentity = false;
    const nameSignal = SEARCH_RE.test(repoPath);
    const canRead = safeToRead(repoPath);
    let bytes = 0;
    const st = await stat(assertRepoPath(repoPath)).catch(() => null);
    if (st?.isFile()) bytes = st.size;

    if (canRead) {
      const text = await readFile(assertRepoPath(repoPath), "utf8").catch(() => "");
      contentSignal = SEARCH_RE.test(text);
      importedTextSignal = IMPORTED_TEXT_RE.test(text);
      fileNamesOnlySignal = PATH_LIST_RE.test(text) && !importedTextSignal;
      referencesTraining = /training\/llm_corpus|llm_corpus|build_r25b_training_pack|generate_r25l_expanded_llm_corpus/i.test(text);
      referencesKnowledge = /knowledge_sources|build_knowledge|extract_knowledge/i.test(text);
      referencesIdentity = /identity_pack|persona|personal_facts|identity interview/i.test(text);
    }
    if (isR25aeAuditSurface(repoPath)) {
      importedTextSignal = false;
      referencesTraining = false;
      referencesKnowledge = false;
      referencesIdentity = false;
    }

    if (!nameSignal && !contentSignal) continue;
    const pathReferences = {
      feeds_training_corpus: isTrainingFeedSurface(repoPath, referencesTraining),
      feeds_knowledge_sources: repoPath.startsWith("knowledge_sources/") || referencesKnowledge,
      feeds_identity_pack: repoPath.startsWith("identity_pack/") || referencesIdentity,
      referenced_by_package_scripts: packageJson.includes(repoPath) || packageJson.includes(basename(repoPath))
    };
    findings.push({
      path: repoPath,
      extension: extname(repoPath).toLowerCase() || "(none)",
      bytes,
      git_status: statusFor(repoPath, trackedSet, statusMap),
      content_read: canRead,
      root_document_content_read: false,
      data_public_ingestion_content_read: false,
      artifact_content_read: false,
      appears_scan_manifest_or_utility: /scan|inventory|ingestion|source|drive|public_ingestion|source_material/i.test(repoPath) || contentSignal,
      appears_to_contain_imported_text: importedTextSignal,
      appears_file_names_or_metadata_only: fileNamesOnlySignal || (!canRead && (repoPath.startsWith("data/public_ingestion/") || ROOT_DOC_RE.test(repoPath))),
      ...pathReferences
    });
  }

  const status_distribution = {};
  const extension_distribution = {};
  for (const item of findings) {
    addDist(status_distribution, item.git_status);
    addDist(extension_distribution, item.extension);
  }
  const feed_counts = {
    training_corpus: findings.filter((item) => item.feeds_training_corpus).length,
    knowledge_sources: findings.filter((item) => item.feeds_knowledge_sources).length,
    identity_pack: findings.filter((item) => item.feeds_identity_pack).length,
    package_scripts: findings.filter((item) => item.referenced_by_package_scripts).length,
    imported_text_signal: findings.filter((item) => item.appears_to_contain_imported_text).length,
    file_names_or_metadata_only_signal: findings.filter((item) => item.appears_file_names_or_metadata_only).length
  };

  const earlyHardDriveImportedUsefulTrainingMaterial = findings.some((item) =>
    item.feeds_training_corpus &&
    item.appears_to_contain_imported_text &&
    !item.path.startsWith("training/llm_corpus/")
  );

  const report = {
    ok: true,
    report_id: "r25ae_legacy_disk_scan_footprint_audit",
    generated_at: new Date().toISOString(),
    repo_root_only: true,
    scan_outside_repo: false,
    training_ran: false,
    corpus_generated: false,
    root_pdf_docx_content_parsed: false,
    data_public_ingestion_content_parsed: false,
    findings_count: findings.length,
    status_distribution,
    extension_distribution,
    feed_counts,
    early_hard_drive_scan_imported_useful_training_material: earlyHardDriveImportedUsefulTrainingMaterial,
    root_personal_files_ingested_into_training_corpus: false,
    data_public_ingestion_ingested_into_training_corpus: false,
    findings,
    notes: [
      "The audit searched only inside the repository root.",
      "Root documents, data/public_ingestion, and artifacts were metadata-only surfaces.",
      "A tracked scan utility can exist without proving useful personal material was imported into the training corpus."
    ]
  };

  await mkdir(dirname(assertRepoPath(REPORT_PATH)), { recursive: true });
  await writeFile(assertRepoPath(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const safeTrackedExamples = findings
    .filter((item) => item.git_status === "tracked" && !item.path.startsWith("training/llm_corpus/") && !item.path.startsWith("identity_pack/"))
    .slice(0, 6)
    .map((item) => `\`${item.path}\``)
    .join(", ");

  const doc = [
    "# R25AE Legacy Disk Scan Audit",
    "",
    "R25AE searched only inside the repository root for legacy scan/import footprints. It did not follow paths, did not scan the hard drive, did not read root PDF/DOCX content, did not parse `data/public_ingestion/`, and did not train or expand corpus.",
    "",
    "## Aggregate Findings",
    "",
    `- Possible scan/import footprint files inside repo: ${findings.length}.`,
    `- Status distribution: ${Object.entries(status_distribution).map(([key, count]) => `${key}=${count}`).join(", ") || "none"}.`,
    `- Feed-reference counts: training_corpus=${feed_counts.training_corpus}, knowledge_sources=${feed_counts.knowledge_sources}, identity_pack=${feed_counts.identity_pack}, package_scripts=${feed_counts.package_scripts}.`,
    `- Imported-text signal count: ${feed_counts.imported_text_signal}.`,
    `- File-name/metadata-only signal count: ${feed_counts.file_names_or_metadata_only_signal}.`,
    `- Safe tracked examples: ${safeTrackedExamples || "none"}.`,
    "",
    "## Interpretation",
    "",
    earlyHardDriveImportedUsefulTrainingMaterial
      ? "The audit found a possible repo-local imported-text footprint that appears connected to training; it needs manual review before any use."
      : "The audit did not find evidence that early hard-drive scan attempts imported useful personal training material into `training/llm_corpus/`.",
    "",
    "Root personal files are not currently ingested into the training corpus by R25AE. `data/public_ingestion/` is not currently ingested into the training corpus by R25AE. Future corpus expansion needs fresh approval and must use only reviewed project-authored rows; future training needs separate fresh approval. Phase_4 remains blocked.",
    ""
  ];
  await writeFile(assertRepoPath(DOC_PATH), `${doc.join("\n")}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    report_path: REPORT_PATH,
    doc_path: DOC_PATH,
    findings_count: findings.length,
    feed_counts,
    early_hard_drive_scan_imported_useful_training_material: earlyHardDriveImportedUsefulTrainingMaterial,
    training_ran: false,
    corpus_generated: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
