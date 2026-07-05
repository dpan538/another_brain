#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

export const ROOT = resolve(new URL("..", import.meta.url).pathname);
const execFileAsync = promisify(execFile);

export const R26A_REPORT_DIR = "artifacts/training_os/r26a_cleanup";

export const ACTIVE_CORPUS_FILES = [
  "training/llm_corpus/train.jsonl",
  "training/llm_corpus/dev.jsonl",
  "training/llm_corpus/heldout.jsonl",
  "training/llm_corpus/r25l_train.jsonl",
  "training/llm_corpus/r25l_dev.jsonl",
  "training/llm_corpus/r25l_heldout.jsonl",
  "training/llm_corpus/r25ak_repo_derived_train.jsonl",
  "training/llm_corpus/r25ak_repo_derived_dev.jsonl",
  "training/llm_corpus/r25ak_repo_derived_heldout.jsonl",
  "training/llm_corpus/r25am_repo_derived_train.jsonl",
  "training/llm_corpus/r25am_repo_derived_dev.jsonl",
  "training/llm_corpus/r25am_repo_derived_heldout.jsonl",
  "training/llm_corpus/r26e_user_answered_train.jsonl",
  "training/llm_corpus/r26e_user_answered_dev.jsonl",
  "training/llm_corpus/r26e_user_answered_heldout.jsonl",
  "training/llm_corpus/r26g_user_answered_train.jsonl",
  "training/llm_corpus/r26g_user_answered_dev.jsonl",
  "training/llm_corpus/r26g_user_answered_heldout.jsonl"
];

export function repoPath(path) {
  return resolve(ROOT, path);
}

export async function ensureDir(path) {
  await mkdir(repoPath(path), { recursive: true });
}

export async function writeJson(path, value) {
  await ensureDir(dirname(path));
  await writeFile(repoPath(path), `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeText(path, value) {
  await ensureDir(dirname(path));
  await writeFile(repoPath(path), value.endsWith("\n") ? value : `${value}\n`);
}

export async function readJson(path) {
  return JSON.parse(await readFile(repoPath(path), "utf8"));
}

export async function readJsonIfPresent(path) {
  try {
    return await readJson(path);
  } catch {
    return null;
  }
}

export async function exists(path) {
  try {
    await stat(repoPath(path));
    return true;
  } catch {
    return false;
  }
}

export async function git(args, options = {}) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: ROOT,
    maxBuffer: options.maxBuffer || 64 * 1024 * 1024
  });
  return stdout;
}

export async function gitLines(args, options = {}) {
  const stdout = await git(args, options);
  return stdout.split(/\r?\n/).filter(Boolean);
}

export async function gitStatusShort(args = []) {
  return gitLines(["status", "--short", ...args], { maxBuffer: 32 * 1024 * 1024 });
}

export async function gitStatusIgnored(args = []) {
  return gitLines(["status", "--ignored", "--short", ...args], { maxBuffer: 64 * 1024 * 1024 });
}

export function parseStatusLine(line) {
  const code = line.slice(0, 2);
  const path = line.slice(3).replace(/^"|"$/g, "");
  return { code, path, raw: line };
}

export async function trackedFiles() {
  return gitLines(["ls-files"], { maxBuffer: 64 * 1024 * 1024 });
}

export async function stagedFiles() {
  return gitLines(["diff", "--cached", "--name-only"], { maxBuffer: 16 * 1024 * 1024 });
}

export function extOf(path) {
  return extname(path).toLowerCase() || "[none]";
}

export function addCount(map, key, by = 1) {
  map[key] = (map[key] || 0) + by;
}

export function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source || {})) addCount(target, key, value);
  return target;
}

export function isRootDoc(path) {
  return /^[^/]+\.(pdf|PDF|docx|DOCX|doc|DOC)$/i.test(path);
}

export function isModelLike(path) {
  return /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i.test(path);
}

export function isTrainingCorpus(path) {
  return /^training\/llm_corpus\/.*\.jsonl$/.test(path);
}

export function classifyTracked(path) {
  if (/^(web|knowledge_sources|build_sources|static_llm)\//.test(path)) return "tracked_active";
  if (/^(evals|schemas)\//.test(path)) return "tracked_active";
  if (/^scripts\//.test(path)) return "tracked_active";
  if (/^training\/(llm_corpus|long_horizon|current)\//.test(path)) return "tracked_active";
  if (/^training\/from_scratch\/.*(r25m|r25p|r25s|r25v|r25y|r25ac|r25ao|r25ar)/i.test(path)) return "tracked_historical";
  if (/^training\/from_scratch\//.test(path)) return "tracked_active";
  if (/^docs\/R2[45]/.test(path)) return "tracked_historical";
  if (/^docs\/R26/.test(path) || /^(README|DATA_CARD|DEPLOYMENT)\.md$/.test(path)) return "tracked_active";
  if (/^docs\//.test(path)) return "review_needed";
  if (/^build_sources\//.test(path)) return "tracked_generated_source";
  return "review_needed";
}

export function classifyUntracked(path) {
  if (isRootDoc(path)) return "untracked_user_local";
  if (/^data\/public_ingestion\//.test(path) || path === "data/public_ingestion/") return "untracked_user_local";
  if (/^private_sources\//.test(path) || path === "private_sources/") return "untracked_user_local";
  if (/R25AI|r25ai/.test(path)) return "deletion_candidate";
  if (/^docs\/R25.*SUMMARY\.md$/.test(path)) return "review_needed";
  return "review_needed";
}

export function topCategory(path) {
  if (/^web\//.test(path)) return "runtime_web";
  if (/^knowledge_sources\//.test(path)) return "runtime_knowledge_sources";
  if (/^build_sources\//.test(path)) return "runtime_build_sources";
  if (/^static_llm\//.test(path)) return "runtime_static_llm";
  if (/^training\/llm_corpus\//.test(path)) return "training_corpus";
  if (/^training\/long_horizon\//.test(path)) return "training_long_horizon";
  if (/^training\/from_scratch\//.test(path)) return "training_from_scratch";
  if (/^training\/current\//.test(path)) return "training_current";
  if (/^evals\//.test(path)) return "evals";
  if (/^scripts\//.test(path)) return "scripts";
  if (/^docs\//.test(path)) return "docs";
  if (/^artifacts\//.test(path)) return "artifacts";
  if (/^data\/public_ingestion\//.test(path)) return "data_public_ingestion";
  if (isRootDoc(path)) return "root_documents";
  return "other";
}

export async function countTreeMetadata(rootPath, { skipContents = false } = {}) {
  const abs = repoPath(rootPath);
  const out = {
    exists: false,
    files: 0,
    dirs: 0,
    bytes: 0,
    extension_counts: {},
    large_files: 0,
    model_like_files: 0
  };
  try {
    const rootStat = await stat(abs);
    if (!rootStat.isDirectory()) return out;
    out.exists = true;
  } catch {
    return out;
  }
  if (skipContents) return out;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const absEntry = join(dir, entry.name);
      const rel = relative(ROOT, absEntry);
      if (rel.startsWith("private_sources/")) continue;
      if (entry.isDirectory()) {
        out.dirs += 1;
        await walk(absEntry);
      } else if (entry.isFile()) {
        const info = await stat(absEntry);
        out.files += 1;
        out.bytes += info.size;
        addCount(out.extension_counts, extOf(entry.name));
        if (info.size >= 5 * 1024 * 1024) out.large_files += 1;
        if (isModelLike(entry.name)) out.model_like_files += 1;
      }
    }
  }
  await walk(abs);
  return out;
}

export async function rootDocumentMetadata() {
  const entries = await readdir(ROOT, { withFileTypes: true });
  const docs = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.(pdf|PDF|docx|DOCX|doc|DOC)$/i.test(entry.name)) continue;
    const info = await stat(join(ROOT, entry.name));
    docs.push({
      path: entry.name,
      extension: extOf(entry.name),
      byte_size: info.size,
      metadata_only: true
    });
  }
  return docs.sort((a, b) => a.path.localeCompare(b.path));
}

export function estimateLanguage(text) {
  const str = String(text || "");
  const zh = (str.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (str.match(/[A-Za-z]/g) || []).length;
  if (zh > 0 && latin > 0) return "mixed";
  if (zh > 0) return "zh";
  if (latin > 0) return "en";
  return "unknown";
}

export async function readJsonlRows(path) {
  const text = await readFile(repoPath(path), "utf8");
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    rows.push({ row: JSON.parse(line), line: index + 1 });
  }
  return rows;
}

export function splitFromPath(path) {
  const name = path.split("/").pop() || "";
  if (/(^|_)train\.jsonl$/.test(name)) return "train";
  if (/(^|_)dev\.jsonl$/.test(name)) return "dev";
  if (/(^|_)heldout\.jsonl$/.test(name)) return "heldout";
  return "unknown";
}

export function provenanceKey(row) {
  const prov = row?.provenance;
  if (typeof prov === "string") return prov;
  if (prov && typeof prov === "object") {
    return prov.source_type || prov.origin || prov.generator || prov.promotion_phase || "object";
  }
  return "unknown";
}

export function summaryTable(rows) {
  return rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
}
