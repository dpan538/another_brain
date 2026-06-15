#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CARD_DIR = resolve(ROOT, "data/culture_cards");
const R12_PROMPTS = resolve(ROOT, "evals/r12b_blackbox/initial_probe_prompts.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/r12b_culture_coverage_audit.json");
const DOC_OUT = resolve(ROOT, "docs/culture_coverage_audit_2026-06-15.md");

const DOMAINS = [
  "music.mandopop",
  "music.taiwan",
  "music.hongkong",
  "music.mainland_rock",
  "music.chinese_pop_general",
  "literature.japanese",
  "literature.asian_general",
  "literature.chinese_modern",
  "literature.korean_modern",
  "literature.western_modern",
  "philosophy",
  "art_history",
  "photography_history",
  "design_history",
  "poetry"
];

function emptyDomain(domain) {
  return {
    domain,
    person_cards: 0,
    work_cards: 0,
    period_cards: 0,
    movement_cards: 0,
    genre_cards: 0,
    concept_cards: 0,
    relation_cards: 0,
    method_cards: 0,
    eval_cases: 0,
    blackbox_prompts: 0,
    has_chronology: false,
    has_entry_paths: false,
    has_representative_works: false,
    has_compare_axes: false,
    has_copyright_policy: false,
    has_not_to_infer: false,
    coverage_level: "none",
    fake_coverage_reasons: []
  };
}

async function readJsonl(path) {
  if (!existsSync(path)) return [];
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return { __parse_error: `${path}:${index + 1}: ${error.message}` };
      }
    });
}

async function readCards() {
  if (!existsSync(CARD_DIR)) return [];
  const files = (await readdir(CARD_DIR)).filter((file) => file.endsWith(".jsonl")).sort();
  const cards = [];
  for (const file of files) {
    for (const row of await readJsonl(join(CARD_DIR, file))) cards.push({ ...row, __file: file });
  }
  return cards.filter((card) => !card.__parse_error);
}

async function countEvalCases() {
  const counts = Object.fromEntries(DOMAINS.map((domain) => [domain, 0]));
  const dirs = ["evals/r10_culture", "evals/r11_reasoning", "evals/r13_coverage"];
  for (const dir of dirs) {
    const fullDir = resolve(ROOT, dir);
    if (!existsSync(fullDir)) continue;
    const files = (await readdir(fullDir)).filter((file) => file.endsWith(".jsonl"));
    for (const file of files) {
      const rows = await readJsonl(join(fullDir, file));
      for (const row of rows) {
        const domain = row.coverage_domain || row.expected_domain || row.expected_task_type || "";
        for (const known of DOMAINS) {
          if (domain === known || row.prompt?.includes(labelHint(known))) counts[known] += 1;
        }
      }
    }
  }
  return counts;
}

function labelHint(domain) {
  const hints = {
    "music.chinese_pop_general": "华语流行",
    "music.taiwan": "台湾",
    "music.hongkong": "香港",
    "music.mainland_rock": "大陆摇滚",
    "literature.japanese": "日本文学",
    "literature.asian_general": "亚洲文学",
    "literature.chinese_modern": "中国现代文学",
    "literature.korean_modern": "韩国",
    "literature.western_modern": "现代主义",
    philosophy: "哲学",
    art_history: "艺术史",
    photography_history: "摄影",
    design_history: "设计史",
    poetry: "诗"
  };
  return hints[domain] || domain;
}

function compatibleDomains(cardDomain) {
  const domains = new Set([cardDomain]);
  if (cardDomain === "music.mandopop") domains.add("music.chinese_pop_general");
  if (cardDomain === "music.taiwan") domains.add("music.chinese_pop_general");
  if (cardDomain === "music.hongkong") domains.add("music.chinese_pop_general");
  if (cardDomain === "music.mainland_rock") domains.add("music.chinese_pop_general");
  if (cardDomain === "poetry.art") {
    domains.add("art_history");
    domains.add("photography_history");
    domains.add("poetry");
  }
  if (cardDomain === "literature.japanese") domains.add("literature.asian_general");
  if (cardDomain === "literature.chinese_modern") domains.add("literature.asian_general");
  if (cardDomain === "literature.korean_modern") domains.add("literature.asian_general");
  return domains;
}

function classifyLevel(item) {
  const totalCards =
    item.person_cards +
    item.work_cards +
    item.period_cards +
    item.movement_cards +
    item.genre_cards +
    item.concept_cards +
    item.relation_cards +
    item.method_cards;
  const reasons = [];
  if (totalCards === 0 && item.eval_cases === 0) return { level: "none", reasons: ["no cards and no eval"] };
  if (totalCards === 0) reasons.push("runtime/evals may exist but no typed cards");
  if (totalCards <= 1) reasons.push("one generic card only");
  if (item.work_cards === 0) reasons.push("no work cards");
  if (item.person_cards === 0) reasons.push("no person cards");
  if (item.period_cards + item.movement_cards === 0) reasons.push("no periods or movements");
  if (item.relation_cards === 0) reasons.push("no relation cards");
  if (item.eval_cases < 5) reasons.push("low eval coverage");
  if (!item.has_entry_paths) reasons.push("no entry paths");
  if (!item.has_compare_axes) reasons.push("no comparison axes");

  if (totalCards <= 1 || (item.eval_cases > 0 && totalCards < 3)) return { level: "fake", reasons };
  const missingCore = [
    item.work_cards > 0,
    item.person_cards > 0,
    item.period_cards + item.movement_cards > 0,
    item.relation_cards > 0,
    item.has_entry_paths,
    item.has_compare_axes,
    item.eval_cases >= 10
  ].filter(Boolean).length;
  if (missingCore < 5) return { level: "thin", reasons };
  if (
    item.person_cards >= 8 &&
    item.work_cards >= 10 &&
    item.period_cards + item.movement_cards >= 3 &&
    item.relation_cards >= 8 &&
    item.eval_cases >= 20
  ) {
    return { level: "strong", reasons };
  }
  return { level: "usable", reasons };
}

const cards = await readCards();
const evalCounts = await countEvalCases();
const promptRows = await readJsonl(R12_PROMPTS);
const promptCounts = Object.fromEntries(DOMAINS.map((domain) => [domain, 0]));
for (const row of promptRows) {
  if (promptCounts[row.domain] !== undefined) promptCounts[row.domain] += 1;
}

const coverage = Object.fromEntries(DOMAINS.map((domain) => [domain, emptyDomain(domain)]));
for (const [domain, count] of Object.entries(evalCounts)) coverage[domain].eval_cases = count;
for (const [domain, count] of Object.entries(promptCounts)) coverage[domain].blackbox_prompts = count;

for (const card of cards) {
  for (const domain of compatibleDomains(card.domain || "")) {
    if (!coverage[domain]) continue;
    const item = coverage[domain];
    const type = card.entity_type;
    if (type === "person") item.person_cards += 1;
    else if (type === "work") item.work_cards += 1;
    else if (type === "period") item.period_cards += 1;
    else if (type === "movement") item.movement_cards += 1;
    else if (type === "genre") item.genre_cards += 1;
    else if (type === "concept" || type === "theme") item.concept_cards += 1;
    else if (type === "relation") item.relation_cards += 1;
    if (String(card.id || "").startsWith("relation.")) item.relation_cards += 1;
    if (String(card.id || "").startsWith("method.") || (card.eval_tags || []).includes("method_card")) item.method_cards += 1;
    if ((card.periods || []).length || card.time_scope || (card.historical_context || []).some((x) => /\d|世纪|年代|古典|近代|战后|当代/.test(x))) item.has_chronology = true;
    if ((card.entry_points || []).length) item.has_entry_paths = true;
    if ((card.representative_works || []).length) item.has_representative_works = true;
    if ((card.comparison_axes || []).length) item.has_compare_axes = true;
    if (card.copyright_policy) item.has_copyright_policy = true;
    if ((card.not_to_infer || []).length) item.has_not_to_infer = true;
  }
}

const rows = Object.values(coverage).map((item) => {
  const { level, reasons } = classifyLevel(item);
  return { ...item, coverage_level: level, fake_coverage_reasons: reasons };
});

const report = {
  ok: true,
  generated_at: new Date().toISOString(),
  domains: rows,
  summary: rows.reduce((acc, item) => {
    acc[item.coverage_level] = (acc[item.coverage_level] || 0) + 1;
    return acc;
  }, {})
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(report, null, 2) + "\n", "utf8");

const doc = [
  "# Culture Coverage Audit - 2026-06-15",
  "",
  "This audit distinguishes runtime surface answers from typed-card and eval-backed coverage. A domain can answer something and still be fake or thin if it lacks person/work/period/relation nodes and eval diversity.",
  "",
  "## Summary",
  "",
  `- none: ${report.summary.none || 0}`,
  `- fake: ${report.summary.fake || 0}`,
  `- thin: ${report.summary.thin || 0}`,
  `- usable: ${report.summary.usable || 0}`,
  `- strong: ${report.summary.strong || 0}`,
  "",
  "## Domains",
  "",
  ...rows.flatMap((item) => [
    `### ${item.domain}`,
    "",
    `- coverage_level: ${item.coverage_level}`,
    `- cards: person ${item.person_cards}, work ${item.work_cards}, period ${item.period_cards}, movement ${item.movement_cards}, genre ${item.genre_cards}, concept ${item.concept_cards}, relation ${item.relation_cards}, method ${item.method_cards}`,
    `- eval_cases: ${item.eval_cases}`,
    `- blackbox_prompts: ${item.blackbox_prompts}`,
    `- structure: chronology=${item.has_chronology}, entry_paths=${item.has_entry_paths}, representative_works=${item.has_representative_works}, compare_axes=${item.has_compare_axes}`,
    `- fake/thin reasons: ${item.fake_coverage_reasons.length ? item.fake_coverage_reasons.join("; ") : "none"}`,
    ""
  ])
];
await writeFile(DOC_OUT, doc.join("\n"), "utf8");
console.log(JSON.stringify({ ok: true, summary: report.summary, out: OUT, doc: DOC_OUT }, null, 2));
