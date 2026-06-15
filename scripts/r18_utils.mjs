import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ARTIFACT_DIR = resolve(ROOT, "artifacts/training_os");
export const execFileAsync = promisify(execFile);

export async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

export async function readText(path, fallback = "") {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(path, value) {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeJsonl(path, rows) {
  await ensureDir(dirname(path));
  await writeFile(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

export async function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, "utf8"));
}

export async function readJsonl(path) {
  if (!existsSync(path)) return [];
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return { __parse_error: `${path}:${index + 1}: ${error.message}`, __raw: line };
      }
    });
}

export async function listFiles(dir, predicate = () => true) {
  if (!existsSync(dir)) return [];
  const out = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = resolve(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (predicate(full)) out.push(full);
    }
  }
  await walk(dir);
  return out.sort();
}

export async function git(args, options = {}) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 20 * 1024 * 1024, ...options });
  return stdout.trim();
}

export async function currentBranch() {
  return git(["branch", "--show-current"]);
}

export async function gitStatusShort() {
  return git(["status", "--short"]);
}

export async function countLines(path) {
  if (!existsSync(path)) return 0;
  const text = await readFile(path, "utf8");
  if (!text.trim()) return 0;
  return text.split(/\r?\n/).filter((line) => line.trim()).length;
}

export function fileSize(path) {
  if (!existsSync(path)) return 0;
  return statSync(path).size;
}

export function splitCounts(rows) {
  return rows.reduce((acc, row) => {
    const split = row.split || "missing";
    acc[split] = (acc[split] || 0) + 1;
    return acc;
  }, {});
}

export function forbiddenHits(text) {
  const checks = [
    ["local_path", /\/Users\/jarlgiovanni|\/Volumes\/|\/private\/var\/folders\//],
    ["lyrics_marker", /完整歌词如下|整首歌词|全文如下|整首如下/],
    ["source_framing", /根据你的文件|根据你的网站|according to your file|according to your website/i],
    ["raw_private_doc_marker", /Poetry_Collection|Church\.pdf|Deep Research|\.docx/i],
    ["contact", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\s-]?){9,}/i]
  ];
  return checks.filter(([, re]) => re.test(text)).map(([name]) => name);
}

export function hashString(text) {
  let value = 2166136261;
  for (const char of String(text)) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

export function deterministicSplit(id) {
  const n = Number.parseInt(hashString(id).slice(0, 2), 16) % 100;
  if (n < 70) return "train";
  if (n < 80) return "dev";
  if (n < 90) return "test";
  return "blind";
}

export function nowIso() {
  return new Date().toISOString();
}

