#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = "training/from_scratch/r25l_corpus_expansion_config.json";
const FORBIDDEN_KEYS = new Set(["chain_of_thought", "hidden_prompt", "system_prompt", "raw_private_data", "private_memory"]);
const FORBIDDEN_SOURCE_RE = /(?:^|[\s"'`])(data\/public_ingestion\/|[^ "'`]+\.(?:pdf|docx)\b)/i;
const PRIVATE_PATH_RE = /\/Users\/|\/private\/var\/|\/Volumes\/|[A-Za-z]:\\Users\\/;
const TEXT_EXTS = new Set([".json", ".jsonl", ".md", ".txt", ".js", ".mjs", ".html", ".css"]);

const EXACT_EVAL_SOURCES = [
  "evals",
  "training/long_horizon/seed_tasks.jsonl",
  "training/long_horizon/heldout_tasks.jsonl",
  "training/llm_corpus/heldout.jsonl"
];
const HELDOUT_COMPARE_SOURCES = ["training/llm_corpus/r25l_heldout.jsonl"];

const LONG_STRING_SOURCE_DIRS = ["web", "docs"];

function normalize(text) {
  return String(text || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

function collectForbiddenKeys(value, path = "$", out = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenKeys(item, `${path}[${index}]`, out));
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) out.push({ path: `${path}.${key}`, key });
      collectForbiddenKeys(nested, `${path}.${key}`, out);
    }
  }
  return out;
}

async function exists(path) {
  try {
    await stat(resolve(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function walk(path) {
  const abs = resolve(ROOT, path);
  if (!(await exists(path))) return [];
  const info = await stat(abs);
  if (info.isFile()) return [path];
  const out = [];
  for (const entry of await readdir(abs, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const child = join(path, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) out.push(...(await walk(child)));
    else out.push(child);
  }
  return out;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function readRows(path, split) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    rows.push({ ...JSON.parse(line), __file: path, __line: index + 1, __expected_split: split });
  }
  return rows;
}

async function loadTextStrings(path) {
  const ext = extname(path).toLowerCase();
  if (!TEXT_EXTS.has(ext)) return [];
  const text = await readFile(resolve(ROOT, path), "utf8").catch(() => "");
  if (!text) return [];
  if (ext === ".jsonl") {
    const strings = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        strings.push(...collectStrings(JSON.parse(line)));
      } catch {
        strings.push(line);
      }
    }
    return strings;
  }
  if (ext === ".json") {
    try {
      return collectStrings(JSON.parse(text));
    } catch {
      return [text];
    }
  }
  return text.split(/\n{2,}/).flatMap((block) => block.split(/\r?\n/));
}

function wordShingles(text, size = 9) {
  const words = normalize(text).toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter(Boolean);
  if (words.length < size) return new Set(words.length ? [words.join(" ")] : []);
  const out = new Set();
  for (let i = 0; i <= words.length - size; i += 1) out.add(words.slice(i, i + size).join(" "));
  return out;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const trainRows = await readRows(config.outputs.train, "train");
  const devRows = await readRows(config.outputs.dev, "dev");
  const heldoutRows = await readRows(config.outputs.heldout, "heldout");
  const allRows = [...trainRows, ...devRows, ...heldoutRows];
  const failures = [];

  for (const row of allRows) {
    const loc = { sample_id: row.sample_id, split: row.split, file: row.__file, line: row.__line };
    for (const item of collectForbiddenKeys(row)) failures.push({ code: "forbidden_training_field", ...loc, ...item });
    for (const text of collectStrings(row)) {
      if (FORBIDDEN_SOURCE_RE.test(text)) failures.push({ code: "forbidden_source_reference", ...loc, text: text.slice(0, 180) });
      if (PRIVATE_PATH_RE.test(text)) failures.push({ code: "private_path_reference", ...loc, text: text.slice(0, 180) });
    }
  }

  const exactSourceStrings = new Map();
  for (const source of EXACT_EVAL_SOURCES) {
    for (const file of await walk(source)) {
      for (const raw of await loadTextStrings(file)) {
        const text = normalize(raw);
        if (text.length < 32) continue;
        if (!exactSourceStrings.has(text)) exactSourceStrings.set(text, []);
        exactSourceStrings.get(text).push(file);
      }
    }
  }

  for (const row of [...trainRows, ...devRows]) {
    const loc = { sample_id: row.sample_id, split: row.split };
    const corpusStrings = [
      row.user_goal,
      row.target_answer,
      ...(Array.isArray(row.messages) ? row.messages.map((message) => message.content) : [])
    ].map(normalize).filter((text) => text.length >= 32);
    for (const text of corpusStrings) {
      const sources = exactSourceStrings.get(text) || [];
      const disallowed = sources.filter((source) => source !== row.__file);
      if (disallowed.length) failures.push({ code: "exact_eval_or_heldout_text_copy", ...loc, sources: disallowed.slice(0, 5), text: text.slice(0, 180) });
    }
  }

  const heldoutTargets = new Map(heldoutRows.map((row) => [normalize(row.target_answer), row.sample_id]));
  for (const row of trainRows) {
    const target = normalize(row.target_answer);
    if (heldoutTargets.has(target)) failures.push({ code: "heldout_target_answer_copied_into_train", sample_id: row.sample_id, heldout_sample_id: heldoutTargets.get(target) });
  }

  const heldoutShingles = heldoutRows.map((row) => ({
    sample_id: row.sample_id,
    shingle: wordShingles(`${row.user_goal} ${row.target_answer}`)
  }));
  for (const row of trainRows) {
    const shingle = wordShingles(`${row.user_goal} ${row.target_answer}`);
    for (const heldout of heldoutShingles) {
      const score = jaccard(shingle, heldout.shingle);
      if (score > 0.96) {
        failures.push({ code: "high_similarity_train_to_heldout", sample_id: row.sample_id, heldout_sample_id: heldout.sample_id, similarity: score });
        break;
      }
    }
  }

  const longRuntimeStrings = new Map();
  for (const source of LONG_STRING_SOURCE_DIRS) {
    for (const file of await walk(source)) {
      for (const raw of await loadTextStrings(file)) {
        const text = normalize(raw);
        if (text.length < 90) continue;
        if (!longRuntimeStrings.has(text)) longRuntimeStrings.set(text, []);
        longRuntimeStrings.get(text).push(file);
      }
    }
  }
  for (const row of trainRows) {
    const target = normalize(row.target_answer);
    for (const [text, sources] of longRuntimeStrings.entries()) {
      if (target.includes(text) || text.includes(target)) {
        failures.push({ code: "distinctive_runtime_or_doc_string_copied_to_training_target", sample_id: row.sample_id, sources: sources.slice(0, 5), text: target.slice(0, 180) });
        break;
      }
    }
  }

  const report = {
    ok: failures.length === 0,
    r25l_rows_checked: allRows.length,
    train_rows_checked: trainRows.length,
    dev_rows_checked: devRows.length,
    heldout_rows_checked: heldoutRows.length,
    exact_eval_sources: EXACT_EVAL_SOURCES,
    heldout_compare_sources: HELDOUT_COMPARE_SOURCES,
    exact_strings_checked: exactSourceStrings.size,
    long_runtime_or_doc_strings_checked: longRuntimeStrings.size,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
