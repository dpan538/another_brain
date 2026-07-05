import fs from "node:fs/promises";
import path from "node:path";

const OUT = "training/current/relation_evidence_index.r27a.json";
const DOC = "docs/R27A_RELATION_EVIDENCE_INDEX_SUMMARY.md";
const REPORT = "artifacts/training_os/r27a_architecture/r27a_relation_evidence_index_report.json";
const CARD_DIR = "knowledge_sources/cards";
const USER_CORPUS = [
  "training/llm_corpus/r26e_user_answered_train.jsonl",
  "training/llm_corpus/r26e_user_answered_dev.jsonl",
  "training/llm_corpus/r26e_user_answered_heldout.jsonl",
  "training/llm_corpus/r26g_user_answered_train.jsonl",
  "training/llm_corpus/r26g_user_answered_dev.jsonl",
  "training/llm_corpus/r26g_user_answered_heldout.jsonl"
];

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function readJsonl(file) {
  const text = await fs.readFile(file, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function bump(map, key, count = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + count);
}

function topEntries(map, limit) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([key, count]) => ({ key, count }));
}

async function main() {
  const registry = await readJson("knowledge_sources/registry.json");
  await readJson("training/current/corpus_manifest.json");
  const cardFiles = (await fs.readdir(CARD_DIR)).filter((name) => /^cards_\d+\.jsonl$/.test(name)).sort();
  const domainCounts = new Map();
  const sourceTypeCounts = new Map();
  const relationHints = [];
  let cardCount = 0;

  for (const file of cardFiles) {
    const rows = await readJsonl(path.join(CARD_DIR, file));
    for (const row of rows) {
      cardCount += 1;
      bump(domainCounts, row.domain || "unknown");
      bump(sourceTypeCounts, row.source_type || row.provenance?.source_type || "unknown");
      if (relationHints.length < 120 && row.label) {
        relationHints.push({
          ref: row.source_id || `${file}:${row.order ?? cardCount}`,
          label: row.label,
          domain: row.domain || "",
          aliases: (row.aliases || []).slice(0, 4),
          relation_types: ["entity", "domain", "source_card"]
        });
      }
    }
  }

  const userRows = [];
  for (const file of USER_CORPUS) userRows.push(...await readJsonl(file));
  const answerModeCounts = new Map();
  const evidencePolicyCounts = new Map();
  const moduleCounts = new Map();
  for (const row of userRows) {
    bump(answerModeCounts, row.answer_mode || "unknown");
    bump(evidencePolicyCounts, row.evidence_policy || "unknown");
    bump(moduleCounts, row.module || "unknown");
  }

  const index = {
    index_id: "r27a_relation_evidence_index",
    phase: "R27A",
    created_from: {
      knowledge_registry: "knowledge_sources/registry.json",
      knowledge_card_files: cardFiles.length,
      corpus_manifest: "training/current/corpus_manifest.json",
      user_answered_corpus_files: USER_CORPUS
    },
    policy: {
      refs_only_or_short_snippets: true,
      private_sources_used: false,
      root_docs_parsed: false,
      data_public_ingestion_parsed: false,
      chain_of_thought_included: false,
      answer_text_rewritten: false
    },
    counts: {
      knowledge_cards: cardCount,
      user_answered_rows: userRows.length,
      domains: domainCounts.size,
      source_types: sourceTypeCounts.size
    },
    domain_hints: topEntries(domainCounts, 80).map((item) => ({ domain: item.key, count: item.count })),
    source_type_counts: Object.fromEntries(sourceTypeCounts),
    user_answered_metadata: {
      answer_mode_counts: Object.fromEntries(answerModeCounts),
      evidence_policy_counts: Object.fromEntries(evidencePolicyCounts),
      module_counts_top: topEntries(moduleCounts, 20)
    },
    relation_hints: relationHints,
    runtime_use: "future evidence packets should cite refs and short snippets, not copied answer banks",
    ok: true
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.mkdir(path.dirname(REPORT), { recursive: true });
  await fs.writeFile(OUT, `${JSON.stringify(index, null, 2)}\n`);
  await fs.writeFile(REPORT, `${JSON.stringify({ ok: true, card_files: cardFiles, counts: index.counts }, null, 2)}\n`);
  await fs.writeFile(DOC, `# R27A Relation Evidence Index Summary

R27A built a local relation/evidence index over reviewed knowledge-source refs and R26E/R26G user-answer metadata. It did not rewrite answer text, parse private sources, parse root documents, parse data/public_ingestion, call external APIs, or add new factual claims.

## Counts

- Knowledge cards: ${cardCount}
- Knowledge card files: ${cardFiles.length}
- User-answer rows represented as metadata: ${userRows.length}
- Domains: ${domainCounts.size}
- Top domains: ${topEntries(domainCounts, 8).map((item) => `${item.key} (${item.count})`).join(", ")}

The index stores refs, domains, aliases, relation hints, and aggregate user-answer metadata. It is an evidence routing surface, not an answer bank.
`);

  console.log(JSON.stringify({ ok: true, out: OUT, report: REPORT, counts: index.counts }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
