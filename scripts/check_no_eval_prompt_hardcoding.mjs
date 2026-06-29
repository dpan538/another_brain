#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

const RECOVERY_PROMPTS = resolve(ROOT, "evals/r24_intelligence_recovery/prompts.jsonl");
const LONG_HORIZON_TASKS = resolve(ROOT, "training/long_horizon/seed_tasks.jsonl");
const MIN_SNIPPET_CHARS = 22;
const SCAN_PATHS = [
  "web",
  "scripts/dialog_runtime.mjs"
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s\-＿_—–~～`"'“”‘’.,，。!?！？:：;；、()[\]{}<>《》「」『』]/g, "")
    .trim();
}

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${index + 1}: ${error.message}`);
      }
    });
}

function promptTextsFromRecovery(rows) {
  const out = [];
  for (const row of rows) {
    if (row.prompt) out.push({ id: row.id, text: row.prompt });
    for (const turn of row.turns || []) out.push({ id: row.id, text: turn.user || turn.prompt || "" });
  }
  return out;
}

function promptTextsFromLongHorizon(rows) {
  const out = [];
  for (const row of rows) {
    if (row.user_goal) out.push({ id: row.task_id, text: row.user_goal });
    if (row.initial_context) out.push({ id: row.task_id, text: row.initial_context });
    for (const turn of row.turns || []) out.push({ id: row.task_id, text: turn.text || "" });
  }
  return out;
}

function snippetsFor(text) {
  const normalized = normalize(text);
  if (normalized.length < MIN_SNIPPET_CHARS) return [];
  const snippets = new Set();
  snippets.add(normalized);
  for (let start = 0; start + MIN_SNIPPET_CHARS <= normalized.length; start += 10) {
    snippets.add(normalized.slice(start, start + Math.min(34, normalized.length - start)));
  }
  return [...snippets].filter((snippet) => snippet.length >= MIN_SNIPPET_CHARS);
}

async function walk(path) {
  const info = await stat(path);
  if (info.isFile()) return [path];
  const out = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(child)));
    else out.push(child);
  }
  return out;
}

async function main() {
  const recovery = await readJsonl(RECOVERY_PROMPTS);
  const longHorizon = await readJsonl(LONG_HORIZON_TASKS);
  const promptSnippets = [];
  for (const item of [...promptTextsFromRecovery(recovery), ...promptTextsFromLongHorizon(longHorizon)]) {
    for (const snippet of snippetsFor(item.text)) {
      promptSnippets.push({ id: item.id, snippet, source_text: item.text });
    }
  }

  const scanFiles = (
    await Promise.all(SCAN_PATHS.map((item) => walk(resolve(ROOT, item))))
  )
    .flat()
    .filter((file) => [".js", ".mjs"].includes(extname(file)))
    .filter((file) => !/\/eval_|\/check_no_eval_prompt_hardcoding\.mjs$/.test(file));

  const failures = [];
  for (const file of scanFiles) {
    const rel = relative(ROOT, file);
    const normalizedSource = normalize(await readFile(file, "utf8"));
    for (const item of promptSnippets) {
      if (normalizedSource.includes(item.snippet)) {
        failures.push({
          file: rel,
          prompt_id: item.id,
          snippet: item.snippet.slice(0, 80)
        });
        break;
      }
    }
  }

  const report = {
    ok: failures.length === 0,
    failures,
    prompt_snippets_checked: promptSnippets.length,
    files_scanned: scanFiles.map((file) => relative(ROOT, file))
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
