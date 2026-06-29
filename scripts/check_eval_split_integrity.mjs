#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

import { ROOT } from "./r18_utils.mjs";

const R24A_PROMPTS = resolve(ROOT, "evals/r24_intelligence_recovery/prompts.jsonl");
const R24D_PROMPTS = resolve(ROOT, "evals/r24d_heldout_recovery/prompts.jsonl");
const SEED_TASKS = resolve(ROOT, "training/long_horizon/seed_tasks.jsonl");
const HELDOUT_TASKS = resolve(ROOT, "training/long_horizon/heldout_tasks.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/eval_split_integrity_report.json");
const SCAN_PATHS = ["web", "scripts/dialog_runtime.mjs"];
const MIN_DUPLICATE_CHARS = 22;
const MIN_RUNTIME_SNIPPET_CHARS = 42;
const COMMON_TERMS = new Set([
  "vercel",
  "shard",
  "routing",
  "manifest",
  "runtime",
  "eval",
  "schema",
  "训练",
  "评测",
  "对话框",
  "知识",
  "检查",
  "heldout",
  "split",
  "taskstate",
  "route",
  "drift",
  "r24",
  "r24a",
  "r24b",
  "r24c",
  "r24d"
]);

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/held[- ]?out/g, "heldout")
    .replace(/task[-_ ]?state/g, "taskstate")
    .replace(/[\s\-＿_—–~～`"'“”‘’.,，。!?！？:：;；、()[\]{}<>《》「」『』]/g, "")
    .trim();
}

function roughTokens(text) {
  const ascii = String(text || "").toLowerCase().match(/[a-z0-9_]{3,}/g) || [];
  const chinese = String(text || "").match(/[\u4e00-\u9fff]{2,}/g) || [];
  return [...new Set([...ascii, ...chinese].filter((token) => !COMMON_TERMS.has(normalize(token))))];
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

function promptTextsFromRecovery(rows, source) {
  const out = [];
  for (const row of rows) {
    if (row.prompt) out.push({ id: row.id, source, kind: "prompt", text: row.prompt });
    for (const turn of row.turns || []) out.push({ id: row.id, source, kind: "turn", text: turn.user || turn.prompt || "" });
  }
  return out;
}

function promptTextsFromTasks(rows, source) {
  const out = [];
  for (const row of rows) {
    if (row.user_goal) out.push({ id: row.task_id, source, kind: "user_goal", text: row.user_goal });
    if (row.initial_context) out.push({ id: row.task_id, source, kind: "initial_context", text: row.initial_context });
    for (const turn of row.turns || []) out.push({ id: row.task_id, source, kind: "turn", text: turn.text || "" });
    const final = row.scoring_rubric?.final_answer || {};
    for (const marker of final.must_include_any || []) out.push({ id: row.task_id, source, kind: "marker", text: marker });
  }
  return out;
}

function distinctiveSnippets(text) {
  const normalized = normalize(text);
  if (normalized.length < MIN_RUNTIME_SNIPPET_CHARS) return [];
  const tokens = roughTokens(text);
  if (tokens.length < 2 && normalized.length < 70) return [];
  const snippets = new Set();
  const window = Math.min(72, normalized.length);
  for (let start = 0; start + MIN_RUNTIME_SNIPPET_CHARS <= normalized.length; start += 14) {
    const snippet = normalized.slice(start, start + window);
    const commonOnly = [...COMMON_TERMS].some((term) => snippet === term);
    if (!commonOnly && snippet.length >= MIN_RUNTIME_SNIPPET_CHARS) snippets.add(snippet);
  }
  snippets.add(normalized);
  return [...snippets].filter((snippet) => snippet.length >= MIN_RUNTIME_SNIPPET_CHARS);
}

function similarity(a, b) {
  const aTokens = new Set(roughTokens(a));
  const bTokens = new Set(roughTokens(b));
  if (aTokens.size < 4 || bTokens.size < 4) return 0;
  let overlap = 0;
  for (const token of aTokens) if (bTokens.has(token)) overlap += 1;
  return overlap / Math.max(aTokens.size, bTokens.size);
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

function taskText(task) {
  return [
    task.task_family,
    task.user_goal,
    task.initial_context,
    ...(task.constraints || []),
    ...(task.expected_behaviors || []),
    ...(task.forbidden_behaviors || []),
    ...(task.turns || []).map((turn) => turn.text || "")
  ].join(" ");
}

async function main() {
  const r24a = await readJsonl(R24A_PROMPTS);
  const r24d = await readJsonl(R24D_PROMPTS);
  const seed = await readJsonl(SEED_TASKS);
  const heldout = await readJsonl(HELDOUT_TASKS);
  const failures = [];
  const warnings = [];

  const seedTexts = [
    ...promptTextsFromRecovery(r24a, "r24a_recovery"),
    ...promptTextsFromTasks(seed, "long_horizon_seed")
  ].filter((item) => normalize(item.text).length >= MIN_DUPLICATE_CHARS);
  const heldoutTexts = [
    ...promptTextsFromRecovery(r24d, "r24d_heldout"),
    ...promptTextsFromTasks(heldout, "long_horizon_heldout")
  ].filter((item) => normalize(item.text).length >= MIN_DUPLICATE_CHARS);

  const seen = new Map();
  for (const item of seedTexts) seen.set(normalize(item.text), item);
  for (const item of heldoutTexts) {
    const normalized = normalize(item.text);
    const match = seen.get(normalized);
    if (match) {
      failures.push({
        type: "exact_duplicate_between_seed_and_heldout",
        seed_id: match.id,
        seed_source: match.source,
        heldout_id: item.id,
        heldout_source: item.source,
        text: item.text.slice(0, 120)
      });
    }
  }

  for (const heldoutTask of heldout) {
    const heldoutText = taskText(heldoutTask);
    for (const seedTask of seed) {
      const score = similarity(heldoutText, taskText(seedTask));
      if (score >= 0.96) {
        failures.push({
          type: "heldout_task_too_similar_to_seed",
          heldout_id: heldoutTask.task_id,
          seed_id: seedTask.task_id,
          similarity: score
        });
      } else if (score >= 0.9) {
        warnings.push({
          type: "heldout_task_similarity_warning",
          heldout_id: heldoutTask.task_id,
          seed_id: seedTask.task_id,
          similarity: score
        });
      }
    }
  }

  const scanFiles = (
    await Promise.all(SCAN_PATHS.map((item) => walk(resolve(ROOT, item))))
  )
    .flat()
    .filter((file) => [".js", ".mjs"].includes(extname(file)))
    .filter((file) => !/\/eval_|\/check_eval_split_integrity\.mjs$|\/check_no_eval_prompt_hardcoding\.mjs$/.test(file));

  const snippets = [];
  for (const item of [...seedTexts, ...heldoutTexts]) {
    for (const snippet of distinctiveSnippets(item.text)) snippets.push({ ...item, snippet });
  }

  for (const file of scanFiles) {
    const rel = relative(ROOT, file);
    const source = normalize(await readFile(file, "utf8"));
    for (const item of snippets) {
      if (source.includes(item.snippet)) {
        failures.push({
          type: "eval_prompt_text_in_runtime",
          file: rel,
          source: item.source,
          id: item.id,
          kind: item.kind,
          snippet: item.snippet.slice(0, 100)
        });
        break;
      }
    }
  }

  const report = {
    ok: failures.length === 0,
    failures,
    warnings,
    counts: {
      r24a_prompts: r24a.length,
      r24d_prompts: r24d.length,
      seed_tasks: seed.length,
      heldout_tasks: heldout.length,
      runtime_files_scanned: scanFiles.length,
      snippets_checked: snippets.length
    },
    report_path: OUT
  };

  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
