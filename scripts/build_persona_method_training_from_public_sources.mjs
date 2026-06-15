#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = resolve(ROOT, "data/external_sources/admitted_open_sources.jsonl");
const OUT = resolve(ROOT, "artifacts/training_os/persona_method_training_public.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/persona_method_training_public_report.json");

function parseJsonl(text) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function splitFor(index) {
  return ["train", "train", "dev", "test", "blind"][index % 5];
}

function row(source, index, kind) {
  const isBoundary = kind === "boundary";
  const isCulture = kind === "culture";
  return {
    id: `pm_public_${source.source_id}_${kind}_${String(index).padStart(3, "0")}`,
    source_id: source.source_id,
    query: isCulture
      ? "How should the system answer a culture question when it has public metadata but no reviewed final card?"
      : "How should the system keep public metadata separate from persona and private memory?",
    compact_state: {
      runtime_profile: "public",
      source_visibility: "public",
      admitted_source: true
    },
    retrieved_cards: [
      {
        source_id: source.source_id,
        source_type: source.source_type,
        license: source.license_name,
        use: "metadata_policy_training"
      }
    ],
    expected_persona_operation: isCulture ? "culture_first_persona_light" : "separate_external_metadata_from_persona",
    expected_answer_policy: isBoundary ? "boundary_then_useful_alternative" : "direct_but_bounded_method",
    style_target: "short, concrete, non-mystifying",
    privacy_risk: "low",
    overfit_risk: "medium",
    source_leak_risk: "medium",
    must_include_any: isCulture
      ? ["use reviewed metadata", "do not overclaim"]
      : ["not personal memory", "not user identity"],
    must_not_include: [
      "according to your file",
      "according to your website",
      "private memory",
      "complete quotation",
      "exact imitation"
    ],
    bad_answers: isCulture
      ? [
          "This proves the system knows the whole field.",
          "I can answer as if every metadata candidate were reviewed."
        ]
      : [
          "This metadata is part of the user's personality.",
          "The public dataset tells me who you are."
        ],
    final_answer: isCulture
      ? "Use reviewed metadata as bounded culture support, say when coverage is incomplete, and do not turn metadata into final answer prose."
      : "Keep public metadata outside persona: it can guide method and boundaries, but it is not private memory or user identity.",
    split: splitFor(index),
    eval_tags: ["persona_method_public", kind, "source_separation"]
  };
}

async function main() {
  const sources = parseJsonl(await readFile(SOURCES, "utf8"));
  const rows = [];
  let index = 0;
  for (const source of sources) {
    rows.push(row(source, index++, "culture"));
    rows.push(row(source, index++, "boundary"));
    rows.push(row(source, index++, "reasoning"));
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${rows.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  const bySplit = rows.reduce((acc, item) => {
    acc[item.split] = (acc[item.split] || 0) + 1;
    return acc;
  }, {});
  const report = {
    ok: true,
    rows: rows.length,
    sources: sources.length,
    by_split: bySplit,
    privacy_high_rows: rows.filter((item) => item.privacy_risk === "high").length,
    source_leak_medium_or_high_rows: rows.filter((item) => ["medium", "high"].includes(item.source_leak_risk)).length,
    note: "Rows train separation and policy only; they do not define user persona or imitate source style."
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
