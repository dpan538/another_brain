#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_DIR = resolve(ROOT, "data/external_cards");
const OUT_DIR = resolve(ROOT, "data/culture_cards");
const REPORT = resolve(ROOT, "artifacts/training_os/external_culture_build_report.json");

function parseJsonl(text) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function moves(label) {
  return {
    overview: `Use ${label} only as reviewed metadata ingredients, not as final prose.`,
    works_list: "List only concrete titles present in reviewed cards; otherwise say the metadata is incomplete.",
    representative_works: "Separate representative status from mere metadata presence.",
    entry_path: "Offer a bounded entry route from reviewed people, works, periods, or movements.",
    explain_work: "Explain using metadata, relation edges, themes, and context; do not quote source text.",
    compare: "Compare both sides with an explicit axis and avoid one-sided collapse.",
    country_relation: "Relate country, language, institution, and period only when reviewed metadata supports it.",
    why_it_matters: "State significance as a bounded interpretation, not as a memorized source sentence.",
    quote_or_lyrics_boundary: "Do not provide lyrics, long quotations, or raw source text; summarize metadata and themes."
  };
}

function baseCard(candidate, id, entityType, domain, names, factualCore, extra = {}) {
  return {
    id,
    entity_type: entityType,
    names,
    domain,
    factual_core: factualCore,
    short_intro: extra.short_intro || "Review-only external metadata seed for expanding structured culture coverage.",
    works: extra.works || [],
    representative_works: extra.representative_works || [],
    periods: extra.periods || [],
    themes: extra.themes || ["metadata_expansion", "coverage_balancing"],
    style_axes: extra.style_axes || [],
    historical_context: extra.historical_context || [],
    entry_points: extra.entry_points || ["Review source metadata before using in public answers."],
    related_entities: extra.related_entities || [
      { id: candidate.source_id, relation: "metadata_source" }
    ],
    comparison_axes: extra.comparison_axes || ["coverage", "period", "medium", "relation"],
    conversation_moves: moves(domain),
    safe_boundaries: [
      "metadata_only",
      "no_raw_source_text",
      "no_private_contact",
      "review_before_runtime"
    ],
    copyright_policy: "Use titles, labels, dates, and relation metadata only; no lyrics or long quoted text.",
    followup_bindings: [],
    source_ids: [candidate.source_id],
    license_refs: [candidate.license_url],
    source_summary: `${candidate.source_id} metadata candidate; provenance ${candidate.provenance_hash}.`,
    confidence: Math.min(Number(candidate.confidence || 0.75), 0.9),
    visibility: "public",
    approved_for_public_runtime: false,
    needs_review: true,
    not_to_infer: [
      "Do not infer private biography.",
      "Do not treat metadata presence as cultural importance.",
      "Do not generate final public answers from this card until reviewed."
    ],
    eval_tags: extra.eval_tags || ["external_metadata", "needs_review"]
  };
}

function cardsFromCandidates(candidates) {
  const byId = new Map(candidates.map((row) => [row.id, row]));
  const get = (id) => {
    const row = byId.get(id);
    if (!row) throw new Error(`missing candidate ${id}`);
    return row;
  };

  const music = [
    baseCard(
      get("ext_musicbrainz_mandopop_seed"),
      "external.music.musicbrainz.metadata_seed",
      "concept",
      "music.chinese_pop_general",
      ["MusicBrainz music metadata seed", "artist/release metadata"],
      "CC0 core music metadata can support artist, release, recording, and relation candidates without importing lyrics.",
      {
        themes: ["music_metadata", "artist_release_relation", "no_lyrics"],
        entry_points: ["artist metadata", "release metadata", "recording/work relation metadata"],
        comparison_axes: ["artist", "release", "period", "relationship type"],
        eval_tags: ["external_music", "license_cc0", "needs_review"]
      }
    )
  ];

  const literature = [
    baseCard(
      get("ext_wikidata_japanese_literature_seed"),
      "external.literature.wikidata.japanese_seed",
      "concept",
      "literature.japanese",
      ["Wikidata Japanese literature seed"],
      "CC0 entity and relation metadata can seed authors, works, periods, and notable-work links for Japanese literature coverage.",
      {
        themes: ["author_work_metadata", "period_relation", "coverage_balancing"],
        entry_points: ["author entity labels", "work entity labels", "notable-work links"],
        comparison_axes: ["period", "work relation", "genre", "movement"],
        eval_tags: ["external_literature", "japanese_literature", "needs_review"]
      }
    ),
    baseCard(
      get("ext_openalex_humanities_seed"),
      "external.literature.openalex.asian_humanities_seed",
      "concept",
      "literature.asian_general",
      ["OpenAlex humanities metadata seed"],
      "CC0 scholarly metadata can support broad literature coverage audits through titles, authors, years, and topics.",
      {
        themes: ["scholarly_metadata", "asian_literature_balance", "topic_graph"],
        entry_points: ["author metadata", "topic metadata", "publication year metadata"],
        comparison_axes: ["region", "topic", "period", "publication context"],
        eval_tags: ["external_literature", "asian_literature", "needs_review"]
      }
    )
  ];

  const art = [
    baseCard(get("ext_met_art_history_seed"), "external.art.met.open_access_seed", "concept", "art_history", ["Met Open Access metadata seed"], "CC0 Open Access object metadata can seed artwork, artist, department, medium, and period candidates.", { themes: ["museum_metadata", "object_artist_relation"], entry_points: ["object title", "artist display name", "object date", "classification"], eval_tags: ["external_art", "museum_metadata", "needs_review"] }),
    baseCard(get("ext_europeana_culture_seed"), "external.art.europeana.metadata_seed", "concept", "art_history", ["Europeana metadata seed"], "CC0 cultural heritage metadata can broaden art and design coverage through titles, creators, providers, and object types.", { themes: ["cultural_heritage_metadata", "provider_relation"], entry_points: ["title metadata", "creator metadata", "type metadata"], eval_tags: ["external_art", "cultural_heritage", "needs_review"] }),
    baseCard(get("ext_smithsonian_design_seed"), "external.design.smithsonian.open_access_seed", "concept", "design_history", ["Smithsonian Open Access metadata seed"], "CC0-designated collection metadata can seed design-history and collection-object coverage without importing images or long descriptions.", { themes: ["design_history_metadata", "collection_object"], entry_points: ["unit", "object type", "date metadata"], eval_tags: ["external_design", "museum_metadata", "needs_review"] }),
    baseCard(get("ext_rijksmuseum_art_seed"), "external.art.rijksmuseum.metadata_seed", "concept", "art_history", ["Rijksmuseum metadata seed"], "Public-domain or CC0 collection metadata can seed title, maker, dating, and object-type candidates for art-history coverage.", { themes: ["museum_metadata", "maker_object_relation"], entry_points: ["title", "maker", "dating", "object type"], eval_tags: ["external_art", "museum_metadata", "needs_review"] }),
    baseCard(get("ext_aic_movement_seed"), "external.art.aic.cc0_subset_seed", "concept", "art_history", ["Art Institute of Chicago CC0 subset seed"], "Designated CC0 API rows can seed classification, style, category, artist, and date candidates where per-row license text is verified.", { themes: ["classification_metadata", "movement_seed"], entry_points: ["classification title", "style/category term", "date display"], eval_tags: ["external_art", "movement_seed", "needs_review"] })
  ];

  const philosophy = [
    baseCard(
      get("ext_openalex_humanities_seed"),
      "external.philosophy.openalex.topic_seed",
      "concept",
      "philosophy",
      ["OpenAlex philosophy topic seed"],
      "CC0 topic and work metadata can seed philosopher, concept, school, and publication-year relation candidates after review.",
      {
        themes: ["topic_metadata", "school_concept_relation", "method_separation"],
        entry_points: ["topic graph", "author metadata", "publication year metadata"],
        comparison_axes: ["school", "concept", "method", "period"],
        eval_tags: ["external_philosophy", "needs_review"]
      }
    )
  ];

  return { music, literature, art, philosophy };
}

async function writeJsonl(file, rows) {
  await writeFile(resolve(OUT_DIR, file), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function main() {
  const candidateFiles = [
    "culture_cards.external.jsonl",
    "relation_cards.external.jsonl",
    "reasoning_examples.external.jsonl",
    "persona_method_candidates.external.jsonl"
  ];
  const candidates = [];
  for (const file of candidateFiles) {
    candidates.push(...parseJsonl(await readFile(resolve(INPUT_DIR, file), "utf8")));
  }
  const cards = cardsFromCandidates(candidates);
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(dirname(REPORT), { recursive: true });
  await writeJsonl("external_music_cards.jsonl", cards.music);
  await writeJsonl("external_literature_cards.jsonl", cards.literature);
  await writeJsonl("external_art_cards.jsonl", cards.art);
  await writeJsonl("external_philosophy_cards.jsonl", cards.philosophy);
  const report = {
    ok: true,
    cards: {
      music: cards.music.length,
      literature: cards.literature.length,
      art: cards.art.length,
      philosophy: cards.philosophy.length
    },
    approved_for_public_runtime: 0,
    needs_review: Object.values(cards).flat().length,
    note: "External culture cards are review-only metadata seeds and are excluded from generated public runtime bundles."
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
