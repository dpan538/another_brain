#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = resolve(ROOT, "data/culture_cards/external_r17_knowledge_cards.jsonl");
const OUT = resolve(ROOT, "data/culture_cards/external_r17_relation_graph.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/r17_external_relation_graph_report.json");

function parseJsonl(text) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function moves(name) {
  return {
    overview: `Use relation ${name} as a graph edge only after review.`,
    works_list: "Use reviewed edges to support lists, not as standalone answer prose.",
    representative_works: "Relation presence is not representative status.",
    entry_path: "Use reviewed edges to choose an entry route through domains, people, works, and periods.",
    explain_work: "Explain through linked metadata; do not quote source text.",
    compare: "Compare both linked sides with an explicit relation axis.",
    country_relation: "Use country/language/institution relations only when reviewed metadata supports them.",
    why_it_matters: "Explain edge significance as bounded interpretation after review.",
    quote_or_lyrics_boundary: "No lyrics, long quotations, or raw source text; relation labels only."
  };
}

function relationCard(from, to, index) {
  const relation = `${from.entity_type}_to_${to.entity_type}`;
  const fromName = from.names?.[0] || from.id;
  const toName = to.names?.[0] || to.id;
  return {
    id: `external.r17.relation.${index}.${from.id.split(".").slice(-2).join(".")}.${to.id.split(".").slice(-2).join(".")}`,
    entity_type: "relation",
    names: [`${fromName} -> ${toName}`, relation],
    domain: from.domain,
    factual_core: `Review-only external metadata relation candidate linking ${fromName} and ${toName}.`,
    short_intro: "R17 review-only relation edge for external knowledge graph coverage.",
    works: [],
    representative_works: [],
    periods: [],
    themes: ["external_metadata_relation", from.domain, relation],
    style_axes: [],
    historical_context: [],
    entry_points: [fromName, toName],
    related_entities: [
      { id: from.id, relation: "from" },
      { id: to.id, relation: "to" }
    ],
    comparison_axes: ["relation_type", "domain", "period", "medium"],
    conversation_moves: moves(relation),
    safe_boundaries: ["metadata_only", "needs_review", "no_raw_source_text", "no_private_data"],
    copyright_policy: "Use relation labels and metadata only; no lyrics or long quoted text.",
    followup_bindings: [from.id, to.id],
    source_ids: [...new Set([...(from.source_ids || []), ...(to.source_ids || [])])],
    license_refs: [...new Set([...(from.license_refs || []), ...(to.license_refs || [])])],
    source_summary: "Generated from R17 external metadata candidate nodes.",
    confidence: 0.82,
    visibility: "public",
    approved_for_public_runtime: false,
    needs_review: true,
    not_to_infer: [
      "Do not infer cultural importance from this relation alone.",
      "Do not infer private biography.",
      "Do not use in public runtime until reviewed."
    ],
    eval_tags: ["r17_external_relation", "needs_review", from.domain]
  };
}

async function main() {
  const cards = parseJsonl(await readFile(INPUT, "utf8"));
  const relations = [];
  const byDomain = Map.groupBy ? Map.groupBy(cards, (card) => card.domain) : null;
  const groups = byDomain
    ? [...byDomain.entries()]
    : Object.entries(cards.reduce((acc, card) => {
        acc[card.domain] ||= [];
        acc[card.domain].push(card);
        return acc;
      }, {}));

  let index = 1;
  for (const [, group] of groups) {
    const people = group.filter((card) => card.entity_type === "person");
    const works = group.filter((card) => card.entity_type === "work");
    const periods = group.filter((card) => card.entity_type === "period" || card.entity_type === "movement");
    for (let i = 0; i < Math.min(people.length, works.length || people.length); i += 1) {
      const to = works[i % Math.max(works.length, 1)] || periods[i % Math.max(periods.length, 1)] || people[(i + 1) % people.length];
      if (to && people[i] && to.id !== people[i].id) relations.push(relationCard(people[i], to, index++));
    }
    for (let i = 0; i < Math.min(periods.length, Math.max(works.length, people.length)); i += 1) {
      const to = works[i % Math.max(works.length, 1)] || people[i % Math.max(people.length, 1)];
      if (to && periods[i] && to.id !== periods[i].id) relations.push(relationCard(periods[i], to, index++));
    }
  }

  await mkdir(dirname(OUT), { recursive: true });
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(OUT, `${relations.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  const report = {
    ok: true,
    out: "data/culture_cards/external_r17_relation_graph.jsonl",
    relation_edges: relations.length,
    approved_for_public_runtime: 0,
    needs_review: relations.length,
    by_domain: relations.reduce((acc, row) => {
      acc[row.domain] = (acc[row.domain] || 0) + 1;
      return acc;
    }, {})
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
