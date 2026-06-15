#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY = resolve(ROOT, "data/external_sources/admitted_open_sources.jsonl");
const OUT_DIR = resolve(ROOT, "data/external_cards");
const REPORT = resolve(ROOT, "artifacts/external_imports/external_samples_report.json");

function parseJsonl(text) {
  return text
    .split(/\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function hash(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function base(source, id, domain, cardType, payload) {
  return {
    id,
    source_id: source.source_id,
    source_url: source.homepage_url,
    license_name: source.license_name,
    license_url: source.license_url,
    provenance_hash: hash({ id, source_id: source.source_id, payload }),
    domain,
    card_type: cardType,
    visibility: "public",
    approved_for_public_runtime: false,
    needs_review: true,
    confidence: 0.86,
    payload,
    not_to_infer: [
      "Do not infer private biography.",
      "Do not import raw source text.",
      "Do not treat metadata candidates as final answer prose."
    ],
    must_not_include: ["lyrics", "long quote", "source path", "private contact", "according to your file"]
  };
}

function byId(sources, id) {
  const source = sources.find((item) => item.source_id === id);
  if (!source) throw new Error(`missing admitted source ${id}`);
  return source;
}

async function writeJsonl(file, rows) {
  await writeFile(resolve(OUT_DIR, file), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function main() {
  const sources = parseJsonl(await readFile(REGISTRY, "utf8"));
  const wikidata = byId(sources, "src_wikidata_cc0");
  const musicbrainz = byId(sources, "src_musicbrainz_core_cc0");
  const openalex = byId(sources, "src_openalex_cc0");
  const met = byId(sources, "src_met_open_access_cc0");
  const europeana = byId(sources, "src_europeana_metadata_cc0");
  const smithsonian = byId(sources, "src_smithsonian_open_access_cc0");
  const rijksmuseum = byId(sources, "src_rijksmuseum_cc0_metadata");
  const aic = byId(sources, "src_aic_api_cc0_subset");

  const cultureCards = [
    base(wikidata, "ext_wikidata_japanese_literature_seed", "literature.japanese", "culture_entity_candidate", {
      entity_type: "domain",
      names: ["Japanese literature"],
      fields: ["entity id", "labels", "instance/class relations", "notable work links"],
      import_policy: "metadata only"
    }),
    base(musicbrainz, "ext_musicbrainz_mandopop_seed", "music.chinese_pop_general", "music_metadata_candidate", {
      entity_type: "music_metadata",
      names: ["artist", "release", "recording", "work"],
      fields: ["artist name", "release title", "date", "relationship ids"],
      import_policy: "core metadata only; no song text"
    }),
    base(openalex, "ext_openalex_humanities_seed", "literature.asian_general", "scholarly_metadata_candidate", {
      entity_type: "scholarly_metadata",
      names: ["author", "work", "topic"],
      fields: ["title", "author", "publication year", "topic"],
      import_policy: "metadata only; no abstracts"
    }),
    base(met, "ext_met_art_history_seed", "art_history", "museum_object_candidate", {
      entity_type: "work",
      names: ["artwork title", "artist", "period", "medium"],
      fields: ["title", "artistDisplayName", "objectDate", "classification"],
      import_policy: "Open Access metadata only"
    }),
    base(europeana, "ext_europeana_culture_seed", "art_history", "cultural_metadata_candidate", {
      entity_type: "work",
      names: ["cultural heritage object"],
      fields: ["title", "creator", "data provider", "type"],
      import_policy: "metadata only; retain provider acknowledgement in notice report"
    }),
    base(smithsonian, "ext_smithsonian_design_seed", "design_history", "museum_object_candidate", {
      entity_type: "work",
      names: ["collection object"],
      fields: ["title", "unit", "object type", "date"],
      import_policy: "CC0-designated metadata only"
    }),
    base(rijksmuseum, "ext_rijksmuseum_art_seed", "art_history", "museum_object_candidate", {
      entity_type: "work",
      names: ["Rijksmuseum collection object"],
      fields: ["title", "maker", "dating", "object type"],
      import_policy: "CC0/public-domain rows only"
    }),
    base(aic, "ext_aic_movement_seed", "art_history", "museum_object_candidate", {
      entity_type: "movement",
      names: ["classification", "style", "category term"],
      fields: ["title", "artist_title", "date_display", "classification_titles"],
      import_policy: "rows whose API license_text is CC0 only"
    })
  ];

  const relationCards = [
    base(wikidata, "ext_rel_wikidata_person_work", "generic", "relation_candidate", {
      relation_type: "person_to_work",
      from_type: "person",
      to_type: "work",
      fields: ["creator", "author", "notable work"]
    }),
    base(musicbrainz, "ext_rel_musicbrainz_artist_release", "music.chinese_pop_general", "relation_candidate", {
      relation_type: "artist_to_release",
      from_type: "artist",
      to_type: "release",
      fields: ["artist-credit", "release-group", "recording"]
    }),
    base(openalex, "ext_rel_openalex_author_topic", "scholarly_metadata", "relation_candidate", {
      relation_type: "author_to_topic",
      from_type: "author",
      to_type: "topic",
      fields: ["authorships", "topics", "publication_year"]
    }),
    base(met, "ext_rel_met_artist_object", "art_history", "relation_candidate", {
      relation_type: "artist_to_object",
      from_type: "artist",
      to_type: "work",
      fields: ["artistDisplayName", "objectID", "department"]
    })
  ];

  const reasoningExamples = [
    base(openalex, "ext_reasoning_openalex_retrieval_plan", "retrieval_reasoning", "retrieval_plan_candidate", {
      task_type: "metadata_retrieval",
      operation: "select_fields_then_bound_answer",
      labels: ["source_id", "license_ref", "metadata_only", "no_source_framing"]
    })
  ];

  const personaMethodCandidates = [
    base(wikidata, "ext_method_metadata_not_persona", "method", "persona_method_candidate", {
      expected_persona_operation: "separate_public_knowledge_from_persona",
      answer_policy: "culture_first_persona_light",
      bad_answer_shape: "treat external metadata as user identity"
    }),
    base(musicbrainz, "ext_method_no_lyrics", "method", "persona_method_candidate", {
      expected_persona_operation: "copyright_boundary",
      answer_policy: "summarize_theme_no_song_text",
      bad_answer_shape: "quote song text"
    })
  ];

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(dirname(REPORT), { recursive: true });
  await writeJsonl("culture_cards.external.jsonl", cultureCards);
  await writeJsonl("relation_cards.external.jsonl", relationCards);
  await writeJsonl("reasoning_examples.external.jsonl", reasoningExamples);
  await writeJsonl("persona_method_candidates.external.jsonl", personaMethodCandidates);
  const report = {
    ok: true,
    rows: {
      culture_cards: cultureCards.length,
      relation_cards: relationCards.length,
      reasoning_examples: reasoningExamples.length,
      persona_method_candidates: personaMethodCandidates.length
    },
    raw_corpora_downloaded: false,
    approved_for_public_runtime: 0,
    needs_review: cultureCards.length + relationCards.length + reasoningExamples.length + personaMethodCandidates.length
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
