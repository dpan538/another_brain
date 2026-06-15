#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/training_os/r12b_anchor_overfit_audit.json");
const PROBE = resolve(ROOT, "artifacts/training_os/r12b_initial_blackbox_probe.json");
const TRAINING = resolve(ROOT, "artifacts/training_os/reasoning_trace_training.jsonl");
const CARD_DIR = resolve(ROOT, "data/culture_cards");
const EVAL_DIRS = ["evals/r10_culture", "evals/r11_reasoning", "evals/r12b_blackbox", "evals/r13_coverage"];

const TERMS = ["罗大佑", "日本文学", "时代感", "私人生活", "沉默", "季节", "羞耻", "战后断裂"];

function parseArgs(argv) {
  const args = { threshold: 0.35, reportOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--threshold") args.threshold = Number(argv[++index]);
    else if (item === "--report-only") args.reportOnly = true;
    else if (item === "--help") {
      console.log("Usage: node scripts/audit_anchor_overfit.mjs [--report-only] [--threshold n]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }
  return args;
}

async function readText(path) {
  return existsSync(path) ? readFile(path, "utf8") : "";
}

async function readJsonl(path) {
  const text = await readText(path);
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function collectEvalRows() {
  const rows = [];
  for (const dir of EVAL_DIRS) {
    const full = resolve(ROOT, dir);
    if (!existsSync(full)) continue;
    const files = (await readdir(full)).filter((file) => file.endsWith(".jsonl"));
    for (const file of files) rows.push(...(await readJsonl(join(full, file))).map((row) => ({ ...row, __file: `${dir}/${file}` })));
  }
  return rows;
}

async function collectCards() {
  if (!existsSync(CARD_DIR)) return [];
  const files = (await readdir(CARD_DIR)).filter((file) => file.endsWith(".jsonl"));
  const rows = [];
  for (const file of files) rows.push(...(await readJsonl(join(CARD_DIR, file))).map((row) => ({ ...row, __file: `data/culture_cards/${file}` })));
  return rows;
}

function countTerms(text, counts) {
  for (const term of TERMS) {
    counts[term] += (String(text || "").match(new RegExp(term, "g")) || []).length;
  }
}

function compactAnswer(answer) {
  return String(answer || "").replace(/\s+/g, " ").trim();
}

const args = parseArgs(process.argv.slice(2));
const cards = await collectCards();
const evalRows = await collectEvalRows();
const probe = existsSync(PROBE) ? JSON.parse(await readFile(PROBE, "utf8")) : { results: [] };
const trainingRows = await readJsonl(TRAINING);

const anchor_mentions = Object.fromEntries(TERMS.map((term) => [term, 0]));
for (const card of cards) countTerms(JSON.stringify(card), anchor_mentions);
for (const row of evalRows) countTerms(JSON.stringify(row), anchor_mentions);
for (const row of probe.results || []) countTerms(`${row.prompt}\n${row.answer}`, anchor_mentions);
for (const row of trainingRows) countTerms(JSON.stringify(row), anchor_mentions);

const domain_diversity = {};
for (const card of cards) {
  domain_diversity[card.domain] ||= { cards: 0, persons: 0, works: 0, periods: 0 };
  domain_diversity[card.domain].cards += 1;
  if (card.entity_type === "person") domain_diversity[card.domain].persons += 1;
  if (card.entity_type === "work") domain_diversity[card.domain].works += 1;
  if (card.entity_type === "period" || card.entity_type === "movement") domain_diversity[card.domain].periods += 1;
}

const repeatedMap = new Map();
const single_anchor_fallbacks = [];
const questions_answered_with_wrong_anchor = [];
for (const row of probe.results || []) {
  const answer = compactAnswer(row.answer);
  if (answer) repeatedMap.set(answer, [...(repeatedMap.get(answer) || []), row.id]);
  const prompt = row.prompt || "";
  if (/华语流行|中文流行/.test(prompt) && /罗大佑/.test(answer) && !/(李宗盛|邓丽君|崔健|王菲|周杰伦|台湾|香港|大陆)/.test(answer)) {
    single_anchor_fallbacks.push({ id: row.id, prompt, anchor: "罗大佑", answer });
  }
  if (/亚洲文学/.test(prompt) && /日本文学|夏目|川端|村上/.test(answer) && !/(中国|韩国|东亚|南亚|东南亚|范围太大)/.test(answer)) {
    single_anchor_fallbacks.push({ id: row.id, prompt, anchor: "日本文学", answer });
  }
  if (/艺术史/.test(prompt) && /摄影|照片/.test(answer) && !/(杜尚|现代主义|包豪斯|达达|抽象|极简|美术馆)/.test(answer)) {
    single_anchor_fallbacks.push({ id: row.id, prompt, anchor: "摄影", answer });
  }
  if (/日本文学/.test(prompt) && /(沉默|季节|羞耻|战后断裂)/.test(answer) && !/(夏目|川端|太宰|村上|紫式部|芭蕉|源氏|明治|平安)/.test(answer)) {
    questions_answered_with_wrong_anchor.push({ id: row.id, prompt, issue: "mood-only Japanese literature answer", answer });
  }
}

const repeated_template_groups = [...repeatedMap.entries()]
  .filter(([, ids]) => ids.length >= 3)
  .map(([answer, ids]) => ({ answer, ids, count: ids.length }));

const probeCount = (probe.results || []).length || 1;
const anchor_answer_ratio = (probe.results || []).filter((row) => /罗大佑|日本文学|时代感|沉默|季节|羞耻|战后断裂/.test(row.answer || "")).length / probeCount;
const diversityPenalty = Object.values(domain_diversity).filter((item) => item.cards <= 2).length / Math.max(1, Object.keys(domain_diversity).length);
const overfit_score = Number(Math.min(1, anchor_answer_ratio * 0.45 + single_anchor_fallbacks.length / probeCount * 0.35 + repeated_template_groups.length * 0.05 + diversityPenalty * 0.15).toFixed(4));

const gate_recommendations = [];
if (single_anchor_fallbacks.length) gate_recommendations.push("Reject broad-domain answers that only mention a seed anchor.");
if (repeated_template_groups.length) gate_recommendations.push("Reject repeated mood/template answers across unrelated prompts.");
if (anchor_mentions["沉默"] + anchor_mentions["季节"] + anchor_mentions["羞耻"] > anchor_mentions["日本文学"] * 2) gate_recommendations.push("Balance Japanese literature with person/work/period anchors.");
if (anchor_mentions["罗大佑"] > 20) gate_recommendations.push("Balance Mandopop coverage with non-Luo people, works, and periods.");

const report = {
  ok: overfit_score <= args.threshold,
  mode: args.reportOnly ? "report-only" : "strict",
  generated_at: new Date().toISOString(),
  threshold: args.threshold,
  anchor_mentions,
  anchor_answer_ratio,
  domain_diversity,
  repeated_template_groups,
  single_anchor_fallbacks,
  questions_answered_with_wrong_anchor,
  overfit_score,
  gate_recommendations
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ ok: report.ok, mode: report.mode, overfit_score, threshold: args.threshold, single_anchor_fallbacks: single_anchor_fallbacks.length, repeated_template_groups: repeated_template_groups.length, out: OUT }, null, 2));
process.exit(report.ok || args.reportOnly ? 0 : 2);
