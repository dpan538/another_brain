#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = resolve(ROOT, "data/external_cards/relation_cards.external.jsonl");
const OUT = resolve(ROOT, "data/culture_cards/external_relation_cards.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/external_relation_build_report.json");

function parseJsonl(text) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function moves(label) {
  return {
    overview: `Use the ${label} relation as a reviewed graph edge, not as a final answer.`,
    works_list: "Use relation edges to support lists only after linked nodes are reviewed.",
    representative_works: "Do not treat a relation edge as representative status.",
    entry_path: "Use relation edges to choose bounded entry routes through reviewed nodes.",
    explain_work: "Explain via linked metadata and reviewed context; do not quote source text.",
    compare: "Compare both linked sides with an explicit relation axis.",
    country_relation: "Use country or institution relations only when reviewed metadata supports them.",
    why_it_matters: "Explain relation significance after review, not from metadata presence alone.",
    quote_or_lyrics_boundary: "No lyrics, long quotations, or raw source text; use relation labels only."
  };
}

function relationCard(row) {
  const relation = row.payload?.relation_type || "metadata_relation";
  return {
    id: `external.relation.${row.id.replace(/^ext_rel_/, "").replaceAll("_", ".")}`,
    entity_type: "relation",
    names: [relation, row.payload?.from_type || "from", row.payload?.to_type || "to"],
    domain: row.domain || "generic",
    factual_core: `Review-only metadata relation candidate: ${relation}.`,
    short_intro: "External relation seed for graph coverage review.",
    works: [],
    representative_works: [],
    periods: [],
    themes: ["metadata_relation", relation],
    style_axes: [],
    historical_context: [],
    entry_points: [row.payload?.from_type || "source node", row.payload?.to_type || "target node"],
    related_entities: [
      { id: row.source_id, relation: "metadata_source" },
      { id: row.payload?.from_type || "from", relation: "from_type" },
      { id: row.payload?.to_type || "to", relation: "to_type" }
    ],
    comparison_axes: ["relation_type", "source_node", "target_node"],
    conversation_moves: moves(relation),
    safe_boundaries: ["metadata_only", "review_before_runtime", "no_raw_source_text"],
    copyright_policy: "Use relation metadata only; no lyrics or long quoted text.",
    followup_bindings: [],
    source_ids: [row.source_id],
    license_refs: [row.license_url],
    source_summary: `${row.source_id} relation candidate; provenance ${row.provenance_hash}.`,
    confidence: Math.min(Number(row.confidence || 0.75), 0.9),
    visibility: "public",
    approved_for_public_runtime: false,
    needs_review: true,
    not_to_infer: [
      "Do not infer importance from relation presence alone.",
      "Do not infer private biography.",
      "Do not use this edge in public runtime until reviewed."
    ],
    eval_tags: ["external_relation", "needs_review"]
  };
}

async function main() {
  const rows = parseJsonl(await readFile(INPUT, "utf8")).map(relationCard);
  await mkdir(dirname(OUT), { recursive: true });
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(OUT, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  const report = {
    ok: true,
    relation_cards: rows.length,
    approved_for_public_runtime: 0,
    needs_review: rows.length
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
