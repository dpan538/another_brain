#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const INBOX_ROOT = "private_sources/r25af_user_writing_inbox";
const REPORT_PATH = "artifacts/training_os/personal_writing_intake/r25af/personal_writing_inbox_audit.json";
const ALLOWED_SUBDIRS = [
  "poetry",
  "essays",
  "fragments",
  "preferred_answers",
  "rejected_and_repaired_answers"
];

function assertRepoPath(repoPath) {
  const abs = resolve(ROOT, repoPath);
  if (!(abs === ROOT || abs.startsWith(`${ROOT}${sep}`))) {
    throw new Error(`Refusing path outside repo: ${repoPath}`);
  }
  return abs;
}

function toRepoPath(absPath) {
  return relative(ROOT, absPath).split(sep).join("/");
}

function addDist(dist, key, amount = 1) {
  const normalized = key || "unknown";
  dist[normalized] = (dist[normalized] || 0) + amount;
}

async function existsDir(repoPath) {
  const st = await stat(assertRepoPath(repoPath)).catch(() => null);
  return Boolean(st && st.isDirectory());
}

async function walkFiles(repoDir) {
  const absDir = assertRepoPath(repoDir);
  const out = [];
  async function visit(abs) {
    const entries = await readdir(abs, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const child = resolve(abs, entry.name);
      const repoPath = toRepoPath(child);
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

function categoryForPath(repoPath) {
  const rest = repoPath.slice(`${INBOX_ROOT}/`.length);
  const first = rest.split("/")[0];
  return ALLOWED_SUBDIRS.includes(first) ? first : "other";
}

async function metadataForPath(repoPath) {
  const abs = assertRepoPath(repoPath);
  const st = await stat(abs);
  const bytes = await readFile(abs);
  return {
    path: repoPath,
    category: categoryForPath(repoPath),
    extension: extname(repoPath).toLowerCase() || "(none)",
    byte_size: st.size,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

async function main() {
  const inboxExists = await existsDir(INBOX_ROOT);
  const files = inboxExists ? await walkFiles(INBOX_ROOT) : [];
  const metadata = [];
  const extension_distribution = {};
  const category_distribution = {};
  let total_bytes = 0;

  for (const path of files) {
    const item = await metadataForPath(path);
    metadata.push(item);
    total_bytes += item.byte_size;
    addDist(extension_distribution, item.extension);
    addDist(category_distribution, item.category);
  }

  const report = {
    ok: true,
    report_id: "r25af_personal_writing_inbox_audit",
    generated_at: new Date().toISOString(),
    repo_root: ROOT,
    repo_root_only: true,
    scan_outside_repo: false,
    inbox_root: INBOX_ROOT,
    private_sources_exists: inboxExists,
    status: inboxExists ? "metadata_only_inventory_complete" : "no_sources_provided",
    raw_file_content_parsed: false,
    parse_approved_sources_count: 0,
    training_ran: false,
    corpus_generated: false,
    root_pdf_docx_content_parsed: false,
    data_public_ingestion_content_parsed: false,
    private_raw_data_ingested: false,
    external_api_used: false,
    file_count: metadata.length,
    total_bytes,
    extension_distribution,
    category_distribution,
    files: metadata,
    notes: [
      "R25AF audits only private_sources/r25af_user_writing_inbox if present.",
      "File contents are not parsed; sha256 is metadata for local audit only.",
      "Raw writing remains ignored and must not be committed."
    ]
  };

  await mkdir(dirname(assertRepoPath(REPORT_PATH)), { recursive: true });
  await writeFile(assertRepoPath(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
