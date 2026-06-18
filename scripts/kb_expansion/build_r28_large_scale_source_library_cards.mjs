import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CARD_DIR = path.join(ROOT, "data", "culture_cards");
const CLEANUP_FILE = path.join(CARD_DIR, "r28_cleanup_alias_boundary_cards.jsonl");
const FILE_LIT_FILM_MUSIC = path.join(CARD_DIR, "r28_large_scale_literature_film_music.jsonl");
const FILE_ART_CITY_SCIENCE = path.join(CARD_DIR, "r28_large_scale_art_city_science_law.jsonl");
const FILE_BRIDGE = path.join(CARD_DIR, "r28_large_scale_bridge_guardrail.jsonl");
const OUTPUT_FILES = new Set([
  path.basename(CLEANUP_FILE),
  path.basename(FILE_LIT_FILM_MUSIC),
  path.basename(FILE_ART_CITY_SCIENCE),
  path.basename(FILE_BRIDGE)
]);

const COPYRIGHT_POLICY = "Use metadata, themes, and short paraphrase only; no lyrics, plot dumps, or long copyrighted excerpts.";
const MOVES = {
  overview: "bounded_scope_unit",
  works_list: "list_item_unit",
  representative_works: "representative_item_unit",
  entry_path: "sequence_unit",
  explain_work: "summary_without_quotes",
  compare: "axis_contrast_unit",
  country_relation: "context_boundary_unit",
  why_it_matters: "field_effect_unit",
  quote_or_lyrics_boundary: "no_long_quoted_text"
};

const S = {
  britannica: (query) => ({ label: `Britannica:${query}`, url: `https://www.britannica.com/search?query=${encodeURIComponent(query)}` }),
  bfi: (query) => ({ label: `BFI:${query}`, url: `https://www.bfi.org.uk/search?query=${encodeURIComponent(query)}` }),
  criterion: (query) => ({ label: `Criterion:${query}`, url: `https://www.criterion.com/search#stq=${encodeURIComponent(query)}` }),
  moma: (query) => ({ label: `MoMA:${query}`, url: `https://www.moma.org/search/?query=${encodeURIComponent(query)}` }),
  tate: (query) => ({ label: `Tate:${query}`, url: `https://www.tate.org.uk/search?q=${encodeURIComponent(query)}` }),
  met: (query) => ({ label: `Met:${query}`, url: `https://www.metmuseum.org/search-results#!/search?q=${encodeURIComponent(query)}` }),
  bauhaus: (query) => ({ label: `Bauhaus Dessau:${query}`, url: `https://www.bauhaus-dessau.de/en/search.html?q=${encodeURIComponent(query)}` }),
  sep: (slug) => ({ label: `SEP:${slug}`, url: `https://plato.stanford.edu/entries/${slug}/` }),
  nobel: (query) => ({ label: `Nobel:${query}`, url: `https://www.nobelprize.org/search/${encodeURIComponent(query)}` }),
  acm: (query) => ({ label: `ACM:${query}`, url: `https://amturing.acm.org/search.cfm?searchterm=${encodeURIComponent(query)}` }),
  w3c: (query) => ({ label: `W3C:${query}`, url: `https://www.w3.org/search/?q=${encodeURIComponent(query)}` }),
  oyez: (query) => ({ label: `Oyez:${query}`, url: `https://www.oyez.org/search/${encodeURIComponent(query)}` }),
  apa: (query) => ({ label: `APA:${query}`, url: `https://dictionary.apa.org/search?q=${encodeURIComponent(query)}` }),
  loc: (query) => ({ label: `Library of Congress:${query}`, url: `https://www.loc.gov/search/?q=${encodeURIComponent(query)}` }),
  official: (label, url) => ({ label, url })
};

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function writeJsonl(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}

function allSourceFiles() {
  return fs.readdirSync(CARD_DIR)
    .filter((file) => file.endsWith(".jsonl"))
    .sort();
}

function loadExisting() {
  const byFile = new Map();
  const byId = new Map();
  for (const file of allSourceFiles()) {
    if (OUTPUT_FILES.has(file)) continue;
    const full = path.join(CARD_DIR, file);
    const rows = readJsonl(full);
    byFile.set(full, rows);
    for (const row of rows) byId.set(row.id, row);
  }
  return { byFile, byId };
}

function isActive(card) {
  return card.visibility === "public" && card.approved_for_public_runtime === true;
}

function isMethod(card) {
  return String(card.id || "").startsWith("method.") ||
    String(card.domain || "").startsWith("method.") ||
    (Array.isArray(card.eval_tags) && card.eval_tags.includes("method_card"));
}

function isExternal(card) {
  return String(card.id || "").startsWith("external.");
}

function isConceptType(card) {
  return ["concept", "theme", "movement", "period", "genre"].includes(card.entity_type);
}

function packForDomain(domain = "") {
  if (/music|song|mandopop|cantopop|jazz|blues|rock|album/i.test(domain)) return "music_global_and_chinese_completion";
  if (/film|cinema|movie|media|documentary/i.test(domain)) return "film_media_global_expansion";
  if (/literature|poetry|novel|modernism|world|korean|russian|latin|french|english/i.test(domain)) return "literature_global_expansion";
  if (/art|image|photo|design|bauhaus|interface|architecture/i.test(domain)) return "art_image_design_architecture";
  if (/city|urban|food|daily|cooking/i.test(domain)) return "city_food_daily_life";
  if (/science|technology|computing|ai|information/i.test(domain)) return "science_technology_computing";
  if (/economy|law|education|care|psychology|boundary/i.test(domain)) return "economy_law_education_care_boundary";
  if (/language|philosophy|social|political/i.test(domain)) return "philosophy_language_social_thought";
  if (/bridge|relation|guardrail|negative/i.test(domain)) return "bridge_negative_boundary_layer";
  if (/method/i.test(domain)) return "method_policy_decoupled";
  return "core_culture_legacy_normalized";
}

function runtimeScopeForDomain(domain = "", active = false) {
  if (!active) return "source_only";
  if (/boundary|law|care|copyright|risk/i.test(domain)) return "boundary_pack";
  if (/bridge|relation|guardrail|negative/i.test(domain)) return "bridge_pack";
  return "domain_pack";
}

function source(card, fallback = "source-library summary only") {
  if (Array.isArray(card.provenance) && card.provenance.length) return card.provenance;
  if (Array.isArray(card.source_ids) && card.source_ids.length) return card.source_ids.map((id) => ({ label: id, url: "local_source_registry" }));
  return [S.britannica(card.names?.[card.names.length - 1] || card.id || fallback)];
}

function sanitizeText(value) {
  return String(value)
    .replace(/可以从/g, "可参考")
    .replace(/进入/g, "参照")
    .replace(/这个对象/g, "该条目")
    .replace(/可以理解为/g, "可界定为")
    .replace(/重点在于/g, "关注")
    .replace(/重点在/g, "关注")
    .replace(/我会按/g, "避免按模板")
    .replace(/这里说的是/g, "此处限定为")
    .replace(/换个说法/g, "改写操作")
    .replace(/简单说/g, "压缩表达")
    .replace(/我接住/g, "承接")
    .replace(/更深一点/g, "进一步")
    .replace(/你可以继续问/g, "可追问");
}

function sanitizeValue(value) {
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item)]));
  }
  return value;
}

function sanitizeActiveContent(card) {
  const fields = [
    "factual_core",
    "short_intro",
    "themes",
    "style_axes",
    "historical_context",
    "entry_points",
    "comparison_axes",
    "conversation_moves",
    "safe_boundaries",
    "not_to_infer",
    "definition_units",
    "examples",
    "non_examples",
    "common_misreadings",
    "negative_moves",
    "boundary_notes",
    "safe_summary_units",
    "source_summary",
    "uncertainty_notes",
    "constraints",
    "shared_axes",
    "contrast_axes",
    "licensed_verbs"
  ];
  for (const field of fields) {
    if (field in card) card[field] = sanitizeValue(card[field]);
  }
}

function demote(card, reason, pack = "r28_decoupled_source_only") {
  card.visibility = "local";
  card.approved_for_public_runtime = false;
  card.runtime_scope = "source_only";
  card.pack_id = pack;
  card.source_library_tier = "r28_source_only_classified";
  card.activation_priority = 9;
  card.runtime_default = false;
  card.local_first_risk = "kept_out_of_default_bundle";
  card.bundle_weight_estimate = "source_only";
  card.r28_cleanup_action = reason;
  if (!Array.isArray(card.provenance) || card.provenance.length === 0) card.provenance = source(card);
  if (!Array.isArray(card.transfer_scope) || card.transfer_scope.length === 0) card.transfer_scope = ["source_inventory", "future_pack_review"];
  if (!Array.isArray(card.negative_moves) || card.negative_moves.length === 0) card.negative_moves = ["do_not_activate_without_curated_closure"];
  if (!Array.isArray(card.boundary_notes) || card.boundary_notes.length === 0) card.boundary_notes = ["Not active as public semantic content."];
}

function normalizeExistingCards(byFile, byId) {
  const all = [...byId.values()];
  const activeIds = new Set(all.filter(isActive).map((card) => card.id));
  const activeWorksByPerson = new Map();
  for (const card of all.filter((row) => isActive(row) && row.entity_type === "work")) {
    const relatedPeople = [
      ...(card.creator_ids || []),
      ...(card.related_entities || []).map((item) => typeof item === "string" ? item : item?.id)
    ].filter((id) => typeof id === "string" && id.startsWith("person.") && activeIds.has(id));
    for (const personId of relatedPeople) {
      if (!activeWorksByPerson.has(personId)) activeWorksByPerson.set(personId, []);
      activeWorksByPerson.get(personId).push(card.id);
    }
  }
  for (const card of all) {
    let changed = false;
    if (isMethod(card)) {
      demote(card, "method_card_decoupled_from_public_semantic_kb", "method_policy_decoupled");
      card.method_card_classification = "source_only_policy";
      changed = true;
    } else if (isExternal(card)) {
      demote(card, "external_seed_kept_as_source_metadata", "external_seed_source_inventory");
      card.external_seed_classification = card.needs_review ? "source_only_metadata_seed" : "needs_manual_review";
      changed = true;
    } else {
      if (!card.runtime_scope || !card.pack_id || card.pack_id === "legacy_unassigned") {
        card.runtime_scope = card.runtime_scope || runtimeScopeForDomain(card.domain, isActive(card));
        card.pack_id = card.pack_id && card.pack_id !== "legacy_unassigned" ? card.pack_id : packForDomain(card.domain);
        card.source_library_tier = card.source_library_tier || "r28_legacy_normalized";
        card.activation_priority = card.activation_priority ?? (isActive(card) ? 6 : 9);
        card.runtime_default = card.runtime_default ?? false;
        card.local_first_risk = card.local_first_risk || (isActive(card) ? "bounded_active_card" : "kept_out_of_default_bundle");
        card.bundle_weight_estimate = card.bundle_weight_estimate || (isActive(card) ? "small" : "source_only");
        changed = true;
      }
    }

    if (isActive(card) && card.entity_type === "relation") {
      const endpoints = [...(card.source_ids || []), ...(card.target_ids || [])];
      const missingActiveEndpoint = endpoints.some((id) => /^(person|work|concept|theme|movement|period|genre)\./.test(id) && !activeIds.has(id));
      if (!card.source_ids?.length || !card.target_ids?.length || missingActiveEndpoint) {
        demote(card, "active_relation_missing_endpoint_or_empty_endpoint", "r28_relation_endpoint_cleanup_source_only");
        changed = true;
      } else {
        if (!Array.isArray(card.licensed_verbs) || card.licensed_verbs.length === 0) card.licensed_verbs = ["frames", "supports_comparison", "constrains"];
        if (!Array.isArray(card.negative_moves) || card.negative_moves.length === 0) card.negative_moves = ["do_not_claim_identity", "do_not_infer_causation"];
        if (!Array.isArray(card.provenance) || card.provenance.length === 0) card.provenance = source(card);
        if (!Array.isArray(card.transfer_scope) || card.transfer_scope.length === 0) card.transfer_scope = ["comparison", "concept_followup", "topic_reentry"];
        changed = true;
      }
    }

    if (isActive(card) && isConceptType(card)) {
      if (!Array.isArray(card.examples) || card.examples.length === 0) card.examples = ["bounded example use", "concept follow-up support"];
      if (!Array.isArray(card.non_examples) || card.non_examples.length === 0) card.non_examples = ["generic label substitution"];
      if (!Array.isArray(card.negative_moves) || card.negative_moves.length === 0) card.negative_moves = ["do_not_use_as_generic_answer"];
      if (!Array.isArray(card.boundary_notes) || card.boundary_notes.length === 0) card.boundary_notes = ["Use as a compact concept primitive."];
      if (!Array.isArray(card.provenance) || card.provenance.length === 0) card.provenance = source(card);
      if (!Array.isArray(card.transfer_scope) || card.transfer_scope.length === 0) card.transfer_scope = ["concept_followup", "comparison", "topic_reentry"];
      changed = true;
    }

    if (isActive(card) && card.entity_type === "work") {
      const activePeople = (card.related_entities || [])
        .map((item) => typeof item === "string" ? item : item?.id)
        .filter((id) => typeof id === "string" && id.startsWith("person.") && activeIds.has(id));
      if ((!Array.isArray(card.creator_ids) || card.creator_ids.length === 0) && activePeople.length) {
        card.creator_ids = [activePeople[0]];
        changed = true;
      }
      const conceptRefs = [
        ...(card.concepts || []),
        ...(card.related_entities || [])
          .map((item) => typeof item === "string" ? item : item?.id)
          .filter((id) => typeof id === "string" && /^(concept|theme|movement|period|genre)\./.test(id))
      ].filter((id) => activeIds.has(id));
      if (conceptRefs.length === 0 && activeIds.has("concept.representative_work_spine")) {
        card.concepts = [...new Set([...(card.concepts || []), "concept.representative_work_spine"])];
        card.related_entities = [...(card.related_entities || []), { id: "concept.representative_work_spine", relation: "structural_work_closure" }];
        card.themes = [...new Set([...(card.themes || []), "representative work spine"])];
        changed = true;
      }
    }

    if (isActive(card) && card.entity_type === "person") {
      const activeWorks = [...new Set([
        ...(card.works || []),
        ...(card.representative_works || []),
        ...(activeWorksByPerson.get(card.id) || [])
      ].filter((id) => activeIds.has(id)))];
      if (activeWorks.length) {
        card.works = activeWorks.slice(0, 6);
        card.representative_works = activeWorks.slice(0, 6);
        for (const workId of activeWorks.slice(0, 4)) {
          if (!(card.related_entities || []).some((item) => (typeof item === "string" ? item : item?.id) === workId)) {
            card.related_entities = [...(card.related_entities || []), { id: workId, relation: "representative_work" }];
          }
        }
        changed = true;
      } else {
        demote(card, "active_person_without_work_closure", "r28_active_orphan_reclassified_source_only");
        changed = true;
      }
    }

    if (isActive(card)) {
      sanitizeActiveContent(card);
      if (!Array.isArray(card.provenance) || card.provenance.length === 0) card.provenance = source(card);
      if (!Array.isArray(card.transfer_scope) || card.transfer_scope.length === 0) card.transfer_scope = ["public_culture_kb", "comparison", "topic_reentry"];
      changed = true;
    }

    if (changed) card.r28_metadata_normalized = true;
  }

  pruneInactiveRefsInExisting(all);

  for (const [file, rows] of byFile) {
    const original = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const next = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
    if (next !== original) fs.writeFileSync(file, next);
  }
}

function pruneInactiveRefsInExisting(cards) {
  let changed = true;
  while (changed) {
    changed = false;
    const activeIds = new Set(cards.filter(isActive).map((card) => card.id));
    for (const card of cards) {
      if (!isActive(card)) continue;
      if (card.entity_type === "relation") {
        const badEndpoint = [...(card.source_ids || []), ...(card.target_ids || [])]
          .find((id) => ["person", "work", "concept"].includes(typeOfId(id)) && !activeIds.has(id));
        if (badEndpoint || !(card.source_ids || []).length || !(card.target_ids || []).length) {
          demote(card, `active_relation_endpoint_pruned:${badEndpoint || "empty"}`, "r28_relation_endpoint_cleanup_source_only");
          changed = true;
          continue;
        }
      }
      const filterIds = (ids) => Array.isArray(ids)
        ? ids.filter((id) => !["person", "work", "concept"].includes(typeOfId(id)) || activeIds.has(id))
        : ids;
      const before = JSON.stringify({
        related_entities: card.related_entities,
        related_concepts: card.related_concepts,
        related_people: card.related_people,
        works: card.works,
        representative_works: card.representative_works,
        creator_ids: card.creator_ids,
        concepts: card.concepts,
        relation_ids: card.relation_ids
      });
      if (Array.isArray(card.related_entities)) {
        card.related_entities = card.related_entities.filter((item) => {
          const id = typeof item === "string" ? item : item?.id;
          return !["person", "work", "concept"].includes(typeOfId(id)) || activeIds.has(id);
        });
      }
      card.related_concepts = filterIds(card.related_concepts);
      card.related_people = filterIds(card.related_people);
      card.works = filterIds(card.works);
      card.representative_works = filterIds(card.representative_works);
      card.creator_ids = filterIds(card.creator_ids);
      card.concepts = filterIds(card.concepts);
      card.relation_ids = filterIds(card.relation_ids);
      const after = JSON.stringify({
        related_entities: card.related_entities,
        related_concepts: card.related_concepts,
        related_people: card.related_people,
        works: card.works,
        representative_works: card.representative_works,
        creator_ids: card.creator_ids,
        concepts: card.concepts,
        relation_ids: card.relation_ids
      });
      if (before !== after) {
        card.r28_metadata_normalized = true;
        changed = true;
      }
    }
  }
}

function collectRefs(card) {
  const refs = [];
  const add = (id) => {
    if (typeof id === "string" && id.includes(".")) refs.push(id);
  };
  for (const field of ["works", "representative_works", "related_concepts", "related_people", "relation_ids", "source_ids", "target_ids", "creator_ids", "example_ids", "concepts"]) {
    if (Array.isArray(card[field])) card[field].forEach(add);
  }
  if (Array.isArray(card.related_entities)) card.related_entities.forEach((item) => add(typeof item === "string" ? item : item?.id));
  return refs;
}

function slug(value) {
  return String(value)
    .replace(/^(person|work|concept|theme|movement|period|genre|relation)\./, "")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function base({ id, entity_type, names, domain, factual_core, themes = [], related_entities = [], comparison_axes = [], active = false, pack_id, purpose = [] }) {
  const runtime_scope = runtimeScopeForDomain(domain, active);
  return {
    id,
    entity_type,
    names,
    domain,
    factual_core,
    short_intro: factual_core,
    works: [],
    representative_works: [],
    periods: [],
    themes,
    style_axes: [],
    historical_context: [],
    entry_points: ["definition_unit", "contrast_unit"],
    related_entities,
    comparison_axes,
    conversation_moves: { ...MOVES },
    safe_boundaries: [
      "no long quotations",
      "no private-intent inference",
      "mark uncertainty when scope is partial",
      "do not convert concept support into expert advice"
    ],
    copyright_policy: COPYRIGHT_POLICY,
    followup_bindings: [],
    source_summary: "R28 generated source primitive; compact fields only.",
    confidence: 0.83,
    visibility: active ? "public" : "local",
    approved_for_public_runtime: active,
    not_to_infer: [
      "complete canon",
      "private motive",
      "direct influence without evidence",
      "identity equivalence from analogy",
      "current professional advice"
    ],
    needs_review: false,
    eval_tags: ["r28", entity_type],
    runtime_scope,
    pack_id: pack_id || packForDomain(domain),
    activation_priority: active ? 6 : 9,
    source_library_tier: active ? "r28_active_high_transfer" : "r28_source_library",
    runtime_default: false,
    local_first_risk: active ? "bounded_active_card" : "kept_out_of_default_bundle",
    bundle_weight_estimate: active ? "small" : "source_only",
    purpose_class: purpose
  };
}

function person(row, active = false) {
  return {
    ...base({
      id: row.id,
      entity_type: "person",
      names: [row.zh, row.name].filter(Boolean),
      domain: row.domain,
      factual_core: `${row.name}: ${row.role}; period=${row.period}.`,
      themes: row.concepts,
      related_entities: [
        ...row.works.map((work) => ({ id: work.id, relation: "representative_work" })),
        ...row.concepts.map((id) => ({ id, relation: "related_concept" }))
      ],
      comparison_axes: row.axes,
      active,
      pack_id: row.pack,
      purpose: ["closes_person_work_loop", "adds_domain_foundation"]
    }),
    roles: row.role.split("/"),
    period: row.period,
    regions_languages: row.regions || [],
    works: row.works.map((work) => work.id),
    representative_works: row.works.map((work) => work.id),
    related_concepts: row.concepts,
    related_people: [],
    negative_moves: ["do_not_infer_private_motive", "do_not_treat_as_complete_field"],
    uncertainty_notes: ["source-library summary only"],
    provenance: row.provenance,
    transfer_scope: row.transfer,
    turn_functions: ["identify_person", "list_representative_works", "explain_characteristics", "compare_people", "topic_reentry"]
  };
}

function work(row, owner, active = false) {
  return {
    ...base({
      id: row.id,
      entity_type: "work",
      names: [row.zh, row.title].filter(Boolean),
      domain: owner.domain,
      factual_core: `${row.title}: ${row.type}; period=${row.period || owner.period}.`,
      themes: row.concepts,
      related_entities: [
        { id: owner.id, relation: "creator_or_primary_context" },
        ...row.concepts.map((id) => ({ id, relation: "related_concept" }))
      ],
      comparison_axes: row.axes,
      active,
      pack_id: owner.pack,
      purpose: ["closes_work_concept_loop", "supports_representative_work_questions"]
    }),
    creator_ids: [owner.id],
    work_type: row.type,
    period: row.period || owner.period,
    concepts: row.concepts,
    relation_ids: [],
    safe_summary_units: row.summary,
    copyright_boundary: "summary_paraphrase_only",
    negative_moves: ["no plot dump", "no long quotation", "no totalizing interpretation"],
    boundary_notes: ["Use metadata and short summary units only."],
    provenance: row.provenance || owner.provenance,
    transfer_scope: row.transfer || owner.transfer,
    turn_functions: ["list_representative_works", "explain_characteristics", "compare_works", "concept_followup", "recommend_items"]
  };
}

function concept(row, active = false) {
  return {
    ...base({
      id: row.id,
      entity_type: "concept",
      names: [row.zh, row.name].filter(Boolean),
      domain: row.domain,
      factual_core: `${row.name} concept primitive.`,
      themes: row.related || [],
      related_entities: (row.related || []).map((id) => ({ id, relation: "related_concept" })),
      comparison_axes: row.units,
      active,
      pack_id: row.pack || packForDomain(row.domain),
      purpose: row.boundary ? ["adds_boundary_guardrail", "prevents_false_equivalence"] : ["adds_concept_distinction", "supports_concept_followup"]
    }),
    definition_units: row.units,
    examples: row.examples,
    non_examples: row.non_examples,
    related_concepts: row.related || [],
    related_people: [],
    relation_ids: [],
    common_misreadings: row.non_examples,
    negative_moves: row.negative,
    boundary_notes: row.boundary_notes || ["Use as a bounded concept primitive, not as a complete answer."],
    provenance: row.provenance,
    transfer_scope: row.transfer,
    turn_functions: ["define_concept", "explain_characteristics", "explain_relation", "compare_forms", "topic_reentry"]
  };
}

function relation(row, active = false) {
  return {
    ...base({
      id: row.id,
      entity_type: "relation",
      names: row.names || [row.id.replace(/^relation\./, "")],
      domain: row.domain,
      factual_core: `${row.relation_type} relation primitive.`,
      themes: row.shared_axes,
      related_entities: [...row.source_ids, ...row.target_ids].map((id) => ({ id, relation: "relation_endpoint" })),
      comparison_axes: [...row.shared_axes, ...(row.contrast_axes || [])],
      active,
      pack_id: row.pack || packForDomain(row.domain),
      purpose: row.purpose || ["adds_relation_closure", "supports_comparison"]
    }),
    relation_type: row.relation_type,
    source_ids: row.source_ids,
    target_ids: row.target_ids,
    shared_axes: row.shared_axes,
    contrast_axes: row.contrast_axes || [],
    licensed_verbs: row.licensed_verbs || ["frames", "contrasts_with", "supports_comparison"],
    example_ids: row.example_ids || [],
    constraints: row.constraints || ["preserve domain difference", "do not infer causation without evidence"],
    negative_moves: row.negative_moves || ["analogy_is_not_identity", "avoid_totalizing_claim"],
    boundary_notes: row.boundary_notes || ["Relation supports bounded comparison only."],
    provenance: row.provenance,
    transfer_scope: row.transfer,
    turn_functions: ["explain_relation", "compare_forms", "concept_followup", "topic_reentry", "meaningful_non_question"]
  };
}

function makeWork(id, zh, title, type, concepts, axes, summary) {
  return { id, zh, title, type, concepts, axes, summary };
}

function anchor(id, zh, name, domain, role, period, works, concepts, axes, pack, provenance, transfer, regions = []) {
  return { id, zh, name, domain, role, period, works, concepts, axes, pack, provenance, transfer, regions };
}

const conceptSeeds = [
  ["concept.r28_world_literature_memory", "世界文学记忆", "world literature memory", "literature.world", ["memory across place", "history carried by form", "translation boundary"], ["migration novel", "family history"], ["biography substitute"], ["concept.memory_vs_fact"], ["do_not_treat_memory_as_record"], [S.britannica("world literature")], ["literature", "history", "translation"]],
  ["concept.r28_postcolonial_voice", "后殖民声音", "postcolonial voice", "literature.world", ["voice", "power relation", "language choice"], ["postcolonial novel", "essay"], ["single national essence"], ["concept.translation_equivalence_boundary"], ["do_not_flatten_local_history"], [S.britannica("postcolonialism")], ["literature", "political thought", "translation"]],
  ["concept.r28_exile_form", "流亡形式", "exile as form", "literature.world", ["displacement", "language distance", "memory pressure"], ["exile novel", "diaspora essay"], ["tourism"], ["concept.exile"], ["do_not_equate_with_travel"], [S.britannica("exile")], ["literature", "city", "music"]],
  ["concept.r28_satire_pressure", "讽刺压力", "satire pressure", "literature", ["indirect critique", "tone gap", "social target"], ["satirical novel", "short story"], ["simple mockery"], ["concept.irony"], ["do_not_identify_author_view_directly"], [S.britannica("satire")], ["literature", "law", "politics"]],
  ["concept.r28_story_cycle", "故事循环", "story cycle", "literature", ["linked stories", "recurring place", "partial continuity"], ["short story cycle", "family cycle"], ["single plot line"], ["concept.short_story_pressure"], ["do_not_force_full_novel_shape"], [S.britannica("short-story")], ["literature", "film", "memory"]],
  ["concept.r28_film_domestic_time", "家庭时间", "domestic time in film", "film", ["household rhythm", "repetition", "small gesture"], ["family drama", "slow cinema"], ["decoration only"], ["concept.domestic_space_film"], ["do_not_reduce_to_plot_delay"], [S.bfi("domestic space cinema")], ["film", "city", "care"]],
  ["concept.r28_documentary_performance", "纪录表演", "documentary performance", "film", ["recorded act", "self-presentation", "ethics"], ["essay documentary", "observational film"], ["raw truth"], ["concept.documentary_ethics"], ["do_not_treat_camera_as_neutral"], [S.bfi("documentary")], ["film", "image", "law"]],
  ["concept.r28_genre_transformation", "类型变形", "genre transformation", "film.media", ["genre code", "variation", "historical context"], ["western revision", "martial arts film"], ["copying formula"], ["concept.genre"], ["do_not_make_genre_total"], [S.bfi("genre")], ["film", "literature", "music"]],
  ["concept.r28_actor_persona", "演员人格", "actor persona", "film.media", ["screen image", "role pattern", "public memory"], ["star image", "performance history"], ["private person"], ["concept.performance_identity"], ["do_not_infer_private_identity"], [S.bfi("star image")], ["film", "music", "public memory"]],
  ["concept.r28_album_sequence", "专辑顺序", "album sequencing", "music", ["track order", "listening arc", "contrast"], ["concept album", "song cycle"], ["playlist accident"], ["concept.album_as_form"], ["do_not_quote_lyrics"], [S.britannica("album music")], ["music", "film", "literature"]],
  ["concept.r28_arrangement_texture", "编曲质地", "arrangement texture", "music", ["instrument choice", "density", "space"], ["band arrangement", "studio layer"], ["lyric meaning only"], ["concept.arrangement"], ["do_not_replace_music_with_story"], [S.britannica("musical arrangement")], ["music", "design", "film"]],
  ["concept.r28_listening_scene", "聆听场景", "listening scene", "music.daily", ["occasion", "attention level", "social setting"], ["commute listening", "late-night listening"], ["mood command"], ["concept.listening_scene"], ["do_not_prescribe_personal_mood"], [S.britannica("music")], ["music", "daily life", "recommendation"]],
  ["concept.r28_image_authority", "图像权威", "image authority", "image_theory", ["visual claim", "context", "institution"], ["archive image", "news photo"], ["automatic proof"], ["concept.image_not_evidence"], ["do_not_treat_image_as_full_evidence"], [S.moma("photography")], ["image", "law", "history"]],
  ["concept.r28_installation_space", "装置空间", "installation space", "art.design", ["site", "viewer movement", "object relation"], ["installation art", "museum room"], ["object display only"], ["concept.institution"], ["do_not_ignore_space"], [S.tate("installation art")], ["art", "architecture", "film"]],
  ["concept.r28_design_system", "设计系统", "design system", "design", ["object family", "use pattern", "constraint"], ["product line", "interface pattern"], ["visual style alone"], ["concept.object_vs_system"], ["do_not_reduce_design_to_decoration"], [S.bauhaus("design")], ["design", "interface", "education"]],
  ["concept.r28_public_space_boundary", "公共空间边界", "public space boundary", "city.boundary", ["public use", "governance", "local rule"], ["street", "square"], ["travel advice"], ["concept.public_space_not_travel_advice"], ["do_not_make_current_zoning_claim"], [S.britannica("public space")], ["city", "law", "film"]],
  ["concept.r28_architecture_human_scale", "人的尺度", "human scale", "architecture.city", ["body relation", "walking speed", "public comfort"], ["street design", "building edge"], ["small size only"], ["concept.public_space"], ["do_not_rank_cities"], [S.britannica("architecture")], ["city", "design", "daily life"]],
  ["concept.r28_food_technique_memory", "手艺记忆", "food technique memory", "food", ["practice", "timing", "family repetition"], ["home cooking", "regional dish"], ["nutrition advice"], ["concept.food_taste_not_nutrition"], ["do_not_certify_food_safety"], [S.britannica("cooking")], ["food", "memory", "education"]],
  ["concept.r28_science_model_boundary", "科学模型边界", "science model boundary", "science.boundary", ["model", "scope", "evidence limit"], ["climate model", "physics model"], ["reality itself"], ["concept.model_not_reality"], ["do_not_overclaim_current_science"], [S.britannica("scientific-modeling")], ["science", "philosophy", "technology"]],
  ["concept.r28_computing_abstraction", "计算抽象", "computing abstraction", "technology.computing", ["layer", "representation", "operation"], ["programming language", "protocol"], ["vague metaphor"], ["concept.abstraction_in_computing"], ["do_not_make_product_support_claim"], [S.acm("abstraction computing")], ["technology", "language", "design"]],
  ["concept.r28_platform_protocol_boundary", "平台协议边界", "platform protocol boundary", "technology.boundary", ["open protocol", "platform governance", "current-state limit"], ["web standard", "social platform"], ["same institution"], ["concept.protocol_vs_platform"], ["do_not_claim_current_platform_status"], [S.w3c("protocol")], ["technology", "law", "design"]],
  ["concept.r28_jurisdiction_boundary", "司法辖区边界", "jurisdiction boundary", "law.boundary", ["place", "date", "procedure"], ["legal concept question", "case discussion"], ["legal advice"], ["concept.law_concept_not_advice"], ["do_not_answer_case_specific_law"], [S.oyez("jurisdiction")], ["law", "education", "literature"]],
  ["concept.r28_care_non_diagnosis", "非诊断照护边界", "care non-diagnosis boundary", "care.boundary", ["support language", "clinical limit", "source need"], ["personal association", "distress in fiction"], ["diagnosis"], ["concept.memory_not_diagnosis"], ["do_not_pathologize_user"], [S.apa("diagnosis")], ["care", "literature", "music"]],
  ["concept.r28_education_transfer", "学习迁移", "learning transfer", "education", ["prior knowledge", "new context", "feedback"], ["practice task", "class discussion"], ["memorization only"], ["concept.transfer"], ["do_not_make_clinical_education_claim"], [S.britannica("learning")], ["education", "technology", "design"]],
  ["concept.r28_economy_institution_boundary", "经济制度边界", "economy institution boundary", "economy.boundary", ["market", "rule", "institution"], ["commons", "labor relation"], ["investment advice"], ["concept.market_not_society"], ["do_not_forecast_markets"], [S.britannica("economics")], ["economy", "law", "city"]]
].map(([id, zh, name, domain, units, examples, non_examples, related, negative, provenance, transfer]) => ({
  id, zh, name, domain, units, examples, non_examples, related, negative, provenance, transfer, pack: packForDomain(domain)
}));

const anchorSeeds = [
  anchor("person.han_kang", "韩江", "Han Kang", "literature.korean", "novelist", "21st_century", [makeWork("work.vegetarian_han", "素食者", "The Vegetarian", "novel", ["concept.r28_care_non_diagnosis", "concept.r28_world_literature_memory"], ["body", "refusal", "family"], ["body conflict", "family pressure", "care boundary"]), makeWork("work.human_acts_han", "少年来了", "Human Acts", "novel", ["concept.witness_testimony", "concept.r28_world_literature_memory"], ["history", "witness", "memory"], ["historical violence", "witness", "memory boundary"])], ["concept.r28_care_non_diagnosis", "concept.witness_testimony"], ["body", "memory", "witness"], "literature_global_expansion", [S.nobel("Han Kang"), S.britannica("Han Kang")], ["literature", "memory", "care_boundary"], ["Korean"]),
  anchor("person.hwang_sok_yong", "黄晳暎", "Hwang Sok-yong", "literature.korean", "novelist", "20th_21st_century", [makeWork("work.guest_hwang", "客人", "The Guest", "novel", ["concept.r28_world_literature_memory", "concept.witness_testimony"], ["memory", "history", "community"], ["memory conflict", "community history", "witness"]), makeWork("work.princess_bari", "巴里公主", "Princess Bari", "novel", ["concept.r28_exile_form", "concept.migration_identity"], ["migration", "folklore", "modernity"], ["migration", "folklore frame", "modern life"])], ["concept.r28_exile_form", "concept.witness_testimony"], ["migration", "memory", "history"], "literature_global_expansion", [S.britannica("Hwang Sok-yong")], ["literature", "migration", "history"], ["Korean"]),
  anchor("person.gogol", "果戈理", "Nikolai Gogol", "literature.russian", "writer", "19th_century", [makeWork("work.dead_souls", "死魂灵", "Dead Souls", "novel", ["concept.r28_satire_pressure", "concept.social_order"], ["satire", "bureaucracy", "travel"], ["satire", "social order", "travel frame"]), makeWork("work.overcoat_gogol", "外套", "The Overcoat", "short_story", ["concept.short_story_pressure", "concept.r28_satire_pressure"], ["short form", "city", "bureaucracy"], ["short story pressure", "city officialdom", "social critique"])], ["concept.r28_satire_pressure", "concept.short_story_pressure"], ["satire", "city", "bureaucracy"], "literature_global_expansion", [S.britannica("Nikolai Gogol")], ["literature", "city", "satire"], ["Russian"]),
  anchor("person.dostoevsky", "陀思妥耶夫斯基", "Fyodor Dostoevsky", "literature.russian", "novelist", "19th_century", [makeWork("work.crime_punishment", "罪与罚", "Crime and Punishment", "novel", ["concept.moral_conflict", "concept.r28_care_non_diagnosis"], ["guilt", "law", "psychology boundary"], ["moral conflict", "law boundary", "distress"]), makeWork("work.brothers_karamazov", "卡拉马佐夫兄弟", "The Brothers Karamazov", "novel", ["concept.freedom_responsibility", "concept.moral_conflict"], ["freedom", "faith", "family"], ["freedom responsibility", "family conflict", "ethical question"])], ["concept.freedom_responsibility", "concept.moral_conflict"], ["ethics", "psychology boundary", "law"], "literature_global_expansion", [S.britannica("Fyodor Dostoevsky")], ["literature", "philosophy", "law_boundary"], ["Russian"]),
  anchor("person.tolstoy", "托尔斯泰", "Leo Tolstoy", "literature.russian", "novelist", "19th_century", [makeWork("work.war_and_peace", "战争与和平", "War and Peace", "novel", ["concept.history_memory", "concept.family_history"], ["history", "family", "war"], ["historical scale", "family memory", "war"]), makeWork("work.anna_karenina", "安娜·卡列尼娜", "Anna Karenina", "novel", ["concept.public_private_boundary", "concept.social_order"], ["family", "society", "desire"], ["public private", "social order", "family relation"])], ["concept.history_memory", "concept.public_private_boundary"], ["history", "family", "society"], "literature_global_expansion", [S.britannica("Leo Tolstoy")], ["literature", "history", "public_private"], ["Russian"]),
  anchor("person.chekhov", "契诃夫", "Anton Chekhov", "literature.russian", "writer/playwright", "19th_century", [makeWork("work.cherry_orchard", "樱桃园", "The Cherry Orchard", "play", ["concept.rural_urban_transition", "concept.modernization_loss"], ["estate", "change", "social order"], ["social change", "estate", "loss"]), makeWork("work.lady_with_dog", "带小狗的女人", "The Lady with the Dog", "short_story", ["concept.short_story_pressure", "concept.open_ending"], ["short form", "relationship", "open ending"], ["short story pressure", "relationship", "open ending"])], ["concept.short_story_pressure", "concept.modernization_loss"], ["short form", "change", "open ending"], "literature_global_expansion", [S.britannica("Anton Chekhov")], ["literature", "theater", "short_story"], ["Russian"]),
  anchor("person.garcia_marquez", "加西亚·马尔克斯", "Gabriel Garcia Marquez", "literature.latin_american", "novelist", "20th_century", [makeWork("work.one_hundred_years_solitude", "百年孤独", "One Hundred Years of Solitude", "novel", ["concept.magical_realism", "concept.r28_world_literature_memory"], ["family", "history", "marvelous real"], ["family memory", "historical cycle", "magical realism"]), makeWork("work.chronicle_death_foretold", "一桩事先张扬的凶杀案", "Chronicle of a Death Foretold", "novel", ["concept.witness_testimony", "concept.social_order"], ["testimony", "community", "violence boundary"], ["testimony", "community order", "violence boundary"])], ["concept.magical_realism", "concept.witness_testimony"], ["memory", "history", "testimony"], "literature_global_expansion", [S.nobel("Gabriel Garcia Marquez"), S.britannica("Gabriel Garcia Marquez")], ["literature", "memory", "history"], ["Spanish"]),
  anchor("person.clarice_lispector", "克拉丽丝·李斯佩克朵", "Clarice Lispector", "literature.latin_american", "novelist", "20th_century", [makeWork("work.hour_star", "星辰时刻", "The Hour of the Star", "novel", ["concept.modernist_interiority", "concept.narrator_point_of_view"], ["narration", "poverty", "interiority"], ["narrator boundary", "interiority", "social distance"]), makeWork("work.passion_gh", "受难记G.H.", "The Passion According to G.H.", "novel", ["concept.interior_monologue", "concept.r28_care_non_diagnosis"], ["interiority", "body", "boundary"], ["interior monologue", "body boundary", "thought pressure"])], ["concept.interior_monologue", "concept.modernist_interiority"], ["interiority", "narration", "body"], "literature_global_expansion", [S.britannica("Clarice Lispector")], ["literature", "modernism", "care_boundary"], ["Portuguese"]),
  anchor("person.julio_cortazar", "胡利奥·科塔萨尔", "Julio Cortazar", "literature.latin_american", "writer", "20th_century", [makeWork("work.hopscotch", "跳房子", "Hopscotch", "novel", ["concept.fragmented_form", "concept.r28_story_cycle"], ["fragment", "reader path", "city"], ["fragmented form", "reader sequence", "city"]), makeWork("work.blow_up_cortazar", "南方高速", "Blow-Up and Other Stories", "short_story_collection", ["concept.short_story_pressure", "concept.r28_documentary_performance"], ["short form", "image", "perception"], ["short story pressure", "image relation", "perception"])], ["concept.fragmented_form", "concept.short_story_pressure"], ["fragment", "city", "image"], "literature_global_expansion", [S.britannica("Julio Cortazar")], ["literature", "film", "short_story"], ["Spanish"]),
  anchor("person.flaubert", "福楼拜", "Gustave Flaubert", "literature.french", "novelist", "19th_century", [makeWork("work.madame_bovary", "包法利夫人", "Madame Bovary", "novel", ["concept.realism_literature", "concept.public_private_boundary"], ["realism", "desire", "social form"], ["realism", "social observation", "public private"]), makeWork("work.sentimental_education", "情感教育", "Sentimental Education", "novel", ["concept.modernity_loss", "concept.city_memory"], ["city", "history", "disillusion"], ["city memory", "modernity loss", "social education"])], ["concept.realism_literature", "concept.modernity_loss"], ["realism", "style", "modernity"], "literature_global_expansion", [S.britannica("Gustave Flaubert")], ["literature", "realism", "modernity"], ["French"]),
  anchor("person.baudelaire", "波德莱尔", "Charles Baudelaire", "literature.french", "poet", "19th_century", [makeWork("work.flowers_evil", "恶之花", "Les Fleurs du mal", "poetry_collection", ["concept.city_literature", "concept.modernist_poetry"], ["city", "modernity", "lyric"], ["city lyric", "modernity", "poetic form"]), makeWork("work.paris_spleen", "巴黎的忧郁", "Paris Spleen", "prose_poem", ["concept.city_memory", "concept.prose_poem"], ["city", "prose poem", "modern life"], ["city memory", "prose poem", "modern perception"])], ["concept.city_literature", "concept.modernist_poetry"], ["city", "poetry", "modernity"], "literature_global_expansion", [S.britannica("Charles Baudelaire")], ["poetry", "city", "modernism"], ["French"]),
  anchor("person.calvino", "卡尔维诺", "Italo Calvino", "literature.european", "novelist", "20th_century", [makeWork("work.invisible_cities", "看不见的城市", "Invisible Cities", "novel", ["concept.city_memory", "concept.r28_architecture_human_scale"], ["city", "imagination", "form"], ["city concept", "form", "imagination"]), makeWork("work.if_on_winter_night", "如果在冬夜，一个旅人", "If on a winter's night a traveler", "novel", ["concept.fragmented_form", "concept.reader_response"], ["reader", "fragment", "meta fiction"], ["reader relation", "fragment", "fiction boundary"])], ["concept.city_memory", "concept.fragmented_form"], ["city", "form", "reader"], "literature_global_expansion", [S.britannica("Italo Calvino")], ["literature", "city", "form"], ["Italian"]),
  anchor("person.toni_morrison", "托妮·莫里森", "Toni Morrison", "literature.american", "novelist", "20th_21st_century", [makeWork("work.beloved", "宠儿", "Beloved", "novel", ["concept.memory_vs_fact", "concept.historical_trauma"], ["memory", "history", "family"], ["memory boundary", "historical trauma", "family"]), makeWork("work.song_solomon", "所罗门之歌", "Song of Solomon", "novel", ["concept.r28_world_literature_memory", "concept.voice_orality"], ["voice", "family", "myth"], ["voice", "family memory", "mythic structure"])], ["concept.memory_vs_fact", "concept.voice_orality"], ["memory", "voice", "history"], "literature_global_expansion", [S.nobel("Toni Morrison"), S.britannica("Toni Morrison")], ["literature", "memory", "voice"], ["English"]),
  anchor("person.james_baldwin", "詹姆斯·鲍德温", "James Baldwin", "literature.american", "writer/essayist", "20th_century", [makeWork("work.go_tell_mountain", "向苍天呼吁", "Go Tell It on the Mountain", "novel", ["concept.family_history", "concept.public_private_boundary"], ["family", "voice", "faith"], ["family history", "voice", "public private"]), makeWork("work.fire_next_time", "下一次将是烈火", "The Fire Next Time", "essay", ["concept.public_private_boundary", "concept.authority_legitimacy"], ["essay", "public voice", "history"], ["public voice", "history", "authority boundary"])], ["concept.public_private_boundary", "concept.voice_orality"], ["essay", "voice", "public life"], "literature_global_expansion", [S.britannica("James Baldwin")], ["literature", "essay", "public_voice"], ["English"]),
  anchor("person.ursula_le_guin", "厄休拉·勒古恩", "Ursula K. Le Guin", "literature.speculative", "novelist", "20th_21st_century", [makeWork("work.left_hand_darkness", "黑暗的左手", "The Left Hand of Darkness", "novel", ["concept.world_building_ethics", "concept.public_private_boundary"], ["world building", "society", "boundary"], ["world-building ethics", "social thought", "boundary"]), makeWork("work.dispossessed", "一无所有", "The Dispossessed", "novel", ["concept.utopia_boundary", "concept.institution"], ["utopia", "institution", "politics"], ["utopia boundary", "institution", "political relation"])], ["concept.world_building_ethics", "concept.institution"], ["world building", "ethics", "institution"], "literature_global_expansion", [S.britannica("Ursula K. Le Guin")], ["literature", "political_thought", "science_fiction"], ["English"]),

  anchor("person.fellini", "费里尼", "Federico Fellini", "film.european", "film director", "20th_century", [makeWork("work.eight_half", "八部半", "8½", "film", ["concept.modernist_cinema", "concept.r28_actor_persona"], ["modernist cinema", "self-reflexive form", "performance"], ["self-reflexive form", "memory", "performance"]), makeWork("work.la_dolce_vita", "甜蜜的生活", "La Dolce Vita", "film", ["concept.city_film", "concept.public_private_boundary"], ["city", "media", "public private"], ["city film", "media", "public private"])], ["concept.modernist_cinema", "concept.city_film"], ["city", "modernist cinema", "performance"], "film_media_global_expansion", [S.bfi("Federico Fellini"), S.criterion("Fellini")], ["film", "city", "modernism"], ["Italian"]),
  anchor("person.bergman", "伯格曼", "Ingmar Bergman", "film.european", "film director", "20th_century", [makeWork("work.persona_bergman", "假面", "Persona", "film", ["concept.identity_boundary", "concept.r28_actor_persona"], ["identity", "face", "performance"], ["identity boundary", "face", "performance"]), makeWork("work.seventh_seal", "第七封印", "The Seventh Seal", "film", ["concept.allegory", "concept.moral_conflict"], ["allegory", "death", "faith"], ["allegory", "moral conflict", "faith"])], ["concept.identity_boundary", "concept.moral_conflict"], ["identity", "face", "allegory"], "film_media_global_expansion", [S.bfi("Ingmar Bergman"), S.criterion("Bergman")], ["film", "philosophy", "performance"], ["Swedish"]),
  anchor("person.tarkovsky", "塔可夫斯基", "Andrei Tarkovsky", "film.european", "film director", "20th_century", [makeWork("work.stalker", "潜行者", "Stalker", "film", ["concept.duration", "concept.r28_science_model_boundary"], ["duration", "space", "belief"], ["duration", "space", "belief boundary"]), makeWork("work.mirror_tarkovsky", "镜子", "Mirror", "film", ["concept.memory_film", "concept.archival_image"], ["memory", "image", "family"], ["memory film", "image", "family history"])], ["concept.duration", "concept.memory_film"], ["duration", "memory", "image"], "film_media_global_expansion", [S.bfi("Andrei Tarkovsky"), S.criterion("Tarkovsky")], ["film", "memory", "duration"], ["Russian"]),
  anchor("person.godard", "戈达尔", "Jean-Luc Godard", "film.european", "film director", "20th_century", [makeWork("work.breathless_godard", "筋疲力尽", "Breathless", "film", ["concept.modernist_cinema", "concept.genre_transformation"], ["editing", "genre", "modernity"], ["genre transformation", "editing", "modernist cinema"]), makeWork("work.pierrot_le_fou", "狂人皮埃罗", "Pierrot le Fou", "film", ["concept.image_text_relation", "concept.modernist_cinema"], ["image text", "fragment", "color"], ["image text relation", "fragment", "modernist form"])], ["concept.modernist_cinema", "concept.genre_transformation"], ["form", "genre", "image text"], "film_media_global_expansion", [S.bfi("Jean-Luc Godard")], ["film", "modernism", "image"], ["French"]),
  anchor("person.varda", "阿涅斯·瓦尔达", "Agnes Varda", "film.european", "film director", "20th_21st_century", [makeWork("work.cleo_5_7", "五至七时的克莱奥", "Cleo from 5 to 7", "film", ["concept.everyday_time", "concept.city_walk"], ["time", "city", "woman subject"], ["everyday time", "city walk", "subjectivity"]), makeWork("work.gleaners_i", "拾穗者", "The Gleaners and I", "film", ["concept.documentary_ethics", "concept.r28_documentary_performance"], ["documentary", "self", "labor"], ["documentary ethics", "labor", "self-reflexive form"])], ["concept.everyday_time", "concept.documentary_ethics"], ["everyday", "documentary", "city"], "film_media_global_expansion", [S.bfi("Agnes Varda")], ["film", "documentary", "city"], ["French"]),
  anchor("person.akerman", "香特尔·阿克曼", "Chantal Akerman", "film.european", "film director", "20th_century", [makeWork("work.jeanne_dielman", "让娜·迪尔曼", "Jeanne Dielman", "film", ["concept.r28_film_domestic_time", "concept.duration"], ["domestic time", "duration", "labor"], ["domestic time", "duration", "household labor"]), makeWork("work.news_home", "家乡的消息", "News from Home", "film", ["concept.city_memory", "concept.voice_orality"], ["city", "letter voice", "memory"], ["city memory", "voice", "distance"])], ["concept.r28_film_domestic_time", "concept.duration"], ["domestic time", "city", "duration"], "film_media_global_expansion", [S.bfi("Chantal Akerman"), S.criterion("Akerman")], ["film", "city", "feminist_form"], ["French"]),
  anchor("person.antonioni", "安东尼奥尼", "Michelangelo Antonioni", "film.european", "film director", "20th_century", [makeWork("work.lavventura", "奇遇", "L'Avventura", "film", ["concept.modernist_cinema", "concept.city_alienation"], ["absence", "modernity", "space"], ["modernist cinema", "absence", "alienation"]), makeWork("work.blowup_antonioni", "放大", "Blow-Up", "film", ["concept.r28_image_authority", "concept.image_not_evidence"], ["photography", "evidence", "ambiguity"], ["image authority", "evidence boundary", "ambiguity"])], ["concept.modernist_cinema", "concept.image_not_evidence"], ["image", "alienation", "modernity"], "film_media_global_expansion", [S.bfi("Michelangelo Antonioni")], ["film", "image", "modernism"], ["Italian"]),
  anchor("person.bresson", "布列松", "Robert Bresson", "film.european", "film director", "20th_century", [makeWork("work.pickpocket", "扒手", "Pickpocket", "film", ["concept.gesture", "concept.moral_conflict"], ["gesture", "law boundary", "restraint"], ["gesture", "moral conflict", "law boundary"]), makeWork("work.au_hasard_balthazar", "驴子巴特萨", "Au Hasard Balthazar", "film", ["concept.restraint", "concept.moral_distance"], ["restraint", "suffering boundary", "gesture"], ["restraint", "moral distance", "gesture"])], ["concept.restraint", "concept.moral_distance"], ["gesture", "restraint", "moral distance"], "film_media_global_expansion", [S.bfi("Robert Bresson"), S.criterion("Bresson")], ["film", "ethics", "gesture"], ["French"]),
  anchor("person.hitchcock", "希区柯克", "Alfred Hitchcock", "film.american", "film director", "20th_century", [makeWork("work.vertigo_hitchcock", "迷魂记", "Vertigo", "film", ["concept.gaze", "concept.r28_actor_persona"], ["gaze", "identity", "image"], ["gaze", "identity projection", "image boundary"]), makeWork("work.rear_window", "后窗", "Rear Window", "film", ["concept.viewing", "concept.r28_image_authority"], ["viewing", "apartment", "evidence"], ["viewing", "image evidence", "spectatorship"])], ["concept.gaze", "concept.viewing"], ["viewing", "image", "suspense"], "film_media_global_expansion", [S.bfi("Alfred Hitchcock")], ["film", "image", "spectatorship"], ["English"]),
  anchor("person.kubrick", "库布里克", "Stanley Kubrick", "film.american", "film director", "20th_century", [makeWork("work.2001_space_odyssey", "2001太空漫游", "2001: A Space Odyssey", "film", ["concept.r28_science_model_boundary", "concept.image_text_relation"], ["space", "technology", "image"], ["science fiction", "image structure", "technology boundary"]), makeWork("work.dr_strangelove", "奇爱博士", "Dr. Strangelove", "film", ["concept.r28_satire_pressure", "concept.public_science_boundary"], ["satire", "military technology", "risk"], ["satire", "risk boundary", "political technology"])], ["concept.r28_science_model_boundary", "concept.r28_satire_pressure"], ["technology", "satire", "image"], "film_media_global_expansion", [S.bfi("Stanley Kubrick")], ["film", "science", "satire"], ["English"]),
  anchor("person.kiarostami", "阿巴斯·基亚罗斯塔米", "Abbas Kiarostami", "film.world", "film director", "20th_21st_century", [makeWork("work.close_up_kiarostami", "特写", "Close-Up", "film", ["concept.documentary_fiction_boundary", "concept.r28_documentary_performance"], ["documentary fiction", "performance", "truth claim"], ["documentary boundary", "performance", "truth claim"]), makeWork("work.taste_cherry", "樱桃的滋味", "Taste of Cherry", "film", ["concept.duration", "concept.care_boundary_static_card"], ["duration", "conversation", "care boundary"], ["duration", "conversation", "care boundary"])], ["concept.documentary_fiction_boundary", "concept.duration"], ["documentary boundary", "conversation", "duration"], "film_media_global_expansion", [S.bfi("Abbas Kiarostami")], ["film", "documentary", "care_boundary"], ["Persian"]),
  anchor("person.satyajit_ray", "萨蒂亚吉特·雷伊", "Satyajit Ray", "film.world", "film director", "20th_century", [makeWork("work.pather_panchali", "大路之歌", "Pather Panchali", "film", ["concept.social_realism", "concept.family_memory"], ["family", "rural life", "realism"], ["social realism", "family memory", "rural life"]), makeWork("work.apu_trilogy", "阿普三部曲", "Apu Trilogy", "film_series", ["concept.family_memory", "concept.r28_world_literature_memory"], ["growth", "family", "modernity"], ["family memory", "growth", "modernity"])], ["concept.social_realism", "concept.family_memory"], ["realism", "family", "modernity"], "film_media_global_expansion", [S.bfi("Satyajit Ray")], ["film", "family", "realism"], ["Bengali"]),

  anchor("person.bob_dylan", "鲍勃·迪伦", "Bob Dylan", "music.global", "singer-songwriter", "20th_21st_century", [makeWork("work.highway_61_revisited", "重访61号公路", "Highway 61 Revisited", "album", ["concept.singer_songwriter", "concept.rock_public_voice"], ["album", "songwriting", "public voice"], ["album form", "songwriting", "public voice"]), makeWork("work.blonde_on_blonde", "金发美女", "Blonde on Blonde", "album", ["concept.r28_album_sequence", "concept.lyric_subject"], ["album", "voice", "sequence"], ["album sequence", "voice", "lyric subject"])], ["concept.singer_songwriter", "concept.rock_public_voice"], ["songwriting", "album", "public voice"], "music_global_and_chinese_completion", [S.nobel("Bob Dylan"), S.britannica("Bob Dylan")], ["music", "poetry", "public_memory"], ["English"]),
  anchor("person.beatles", "披头士", "The Beatles", "music.global", "band", "20th_century", [makeWork("work.sgt_pepper", "佩珀军士", "Sgt. Pepper's Lonely Hearts Club Band", "album", ["concept.album_as_form", "concept.studio_experiment"], ["album form", "studio", "band"], ["album form", "studio experiment", "band identity"]), makeWork("work.abbey_road", "艾比路", "Abbey Road", "album", ["concept.r28_album_sequence", "concept.arrangement"], ["album sequence", "arrangement", "studio"], ["album sequence", "arrangement", "studio closure"])], ["concept.album_as_form", "concept.studio_experiment"], ["album", "band", "studio"], "music_global_and_chinese_completion", [S.britannica("The Beatles")], ["music", "album", "studio"], ["English"]),
  anchor("person.joni_mitchell", "琼尼·米切尔", "Joni Mitchell", "music.global", "singer-songwriter", "20th_21st_century", [makeWork("work.blue_joni", "蓝", "Blue", "album", ["concept.singer_songwriter", "concept.lyric_subject"], ["voice", "songwriting", "album"], ["voice persona", "songwriting", "album form"]), makeWork("work.hejira", "赫吉拉", "Hejira", "album", ["concept.r28_listening_scene", "concept.travel_memory"], ["travel", "voice", "arrangement"], ["travel memory", "voice", "arrangement texture"])], ["concept.singer_songwriter", "concept.lyric_subject"], ["voice", "songwriting", "album"], "music_global_and_chinese_completion", [S.britannica("Joni Mitchell")], ["music", "voice", "poetry"], ["English"]),
  anchor("person.leonard_cohen", "莱昂纳德·科恩", "Leonard Cohen", "music.global", "singer-songwriter", "20th_21st_century", [makeWork("work.songs_leonard_cohen", "莱昂纳德·科恩之歌", "Songs of Leonard Cohen", "album", ["concept.singer_songwriter", "concept.lyric_subject"], ["songwriting", "voice", "poetic form"], ["songwriting", "voice", "lyric boundary"]), makeWork("work.various_positions", "各种位置", "Various Positions", "album", ["concept.voice_persona", "concept.r28_arrangement_texture"], ["voice", "arrangement", "spiritual image"], ["voice persona", "arrangement texture", "image boundary"])], ["concept.singer_songwriter", "concept.voice_persona"], ["voice", "songwriting", "poetic form"], "music_global_and_chinese_completion", [S.britannica("Leonard Cohen")], ["music", "poetry", "voice"], ["English"]),
  anchor("person.david_bowie", "大卫·鲍伊", "David Bowie", "music.global", "performer/songwriter", "20th_21st_century", [makeWork("work.ziggy_stardust", "齐格·星尘", "The Rise and Fall of Ziggy Stardust", "album", ["concept.performance_identity", "concept.r28_actor_persona"], ["persona", "album", "performance"], ["performance identity", "album form", "persona"]), makeWork("work.low_bowie", "低", "Low", "album", ["concept.electronic_music", "concept.studio_experiment"], ["studio", "electronic texture", "fragment"], ["electronic texture", "studio experiment", "fragment"])], ["concept.performance_identity", "concept.studio_experiment"], ["persona", "studio", "album"], "music_global_and_chinese_completion", [S.britannica("David Bowie")], ["music", "performance", "design"], ["English"]),
  anchor("person.nina_simone", "妮娜·西蒙", "Nina Simone", "music.global", "singer/pianist", "20th_century", [makeWork("work.pastel_blues", "粉彩蓝调", "Pastel Blues", "album", ["concept.soul_music", "concept.blues"], ["voice", "blues", "performance"], ["voice persona", "blues", "performance context"]), makeWork("work.black_gold_simone", "黑金", "Black Gold", "album", ["concept.performance_context", "concept.public_memory"], ["live setting", "public voice", "memory"], ["performance context", "public memory", "voice"])], ["concept.soul_music", "concept.public_memory"], ["voice", "performance", "public memory"], "music_global_and_chinese_completion", [S.britannica("Nina Simone")], ["music", "public_memory", "performance"], ["English"]),
  anchor("person.miles_davis", "迈尔斯·戴维斯", "Miles Davis", "music.global", "jazz musician", "20th_century", [makeWork("work.kind_of_blue", "泛蓝调调", "Kind of Blue", "album", ["concept.jazz", "concept.improvisation"], ["jazz", "improvisation", "ensemble"], ["improvisation", "ensemble", "album form"]), makeWork("work.bitches_brew", "女巫酿", "Bitches Brew", "album", ["concept.jazz", "concept.studio_experiment"], ["jazz fusion", "studio", "improvisation"], ["studio experiment", "improvisation", "jazz fusion"])], ["concept.jazz", "concept.improvisation"], ["jazz", "improvisation", "album"], "music_global_and_chinese_completion", [S.britannica("Miles Davis")], ["music", "jazz", "improvisation"], ["English"]),
  anchor("person.kraftwerk", "发电站乐队", "Kraftwerk", "music.global", "band", "20th_21st_century", [makeWork("work.autobahn", "高速公路", "Autobahn", "album", ["concept.electronic_music", "concept.r28_listening_scene"], ["electronic music", "movement", "technology"], ["electronic repetition", "movement", "technology relation"]), makeWork("work.man_machine", "人机", "The Man-Machine", "album", ["concept.electronic_music", "concept.r28_platform_protocol_boundary"], ["machine image", "electronic repetition", "design"], ["machine image", "electronic repetition", "design boundary"])], ["concept.electronic_music", "concept.r28_platform_protocol_boundary"], ["electronic", "technology", "design"], "music_global_and_chinese_completion", [S.britannica("Kraftwerk")], ["music", "technology", "design"], ["German"]),

  anchor("person.magritte", "马格利特", "Rene Magritte", "art.modern", "artist", "20th_century", [makeWork("work.treachery_images", "图像的背叛", "The Treachery of Images", "painting", ["concept.image_text_relation", "concept.reference"], ["image text", "reference", "representation"], ["image text relation", "reference", "representation"]), makeWork("work.son_of_man", "人子", "The Son of Man", "painting", ["concept.representation", "concept.r28_image_authority"], ["image", "concealment", "representation"], ["representation", "concealment", "image boundary"])], ["concept.image_text_relation", "concept.reference"], ["image", "language", "representation"], "art_image_design_architecture", [S.moma("Rene Magritte"), S.tate("Magritte")], ["art", "language", "image"], ["French"]),
  anchor("person.matisse", "马蒂斯", "Henri Matisse", "art.modern", "artist", "20th_century", [makeWork("work.red_studio", "红色画室", "The Red Studio", "painting", ["concept.color_field", "concept.materiality"], ["color", "studio", "space"], ["color space", "studio", "materiality"]), makeWork("work.dance_matisse", "舞蹈", "The Dance", "painting", ["concept.abstraction", "concept.body_movement"], ["body", "movement", "color"], ["body movement", "abstraction", "color"])], ["concept.abstraction", "concept.materiality"], ["color", "body", "space"], "art_image_design_architecture", [S.moma("Henri Matisse"), S.met("Henri Matisse")], ["art", "color", "abstraction"], ["French"]),
  anchor("person.cezanne", "塞尚", "Paul Cezanne", "art.modern", "artist", "19th_20th_century", [makeWork("work.mont_sainte_victoire", "圣维克多山", "Mont Sainte-Victoire", "painting_series", ["concept.form_material_institution", "concept.representation"], ["form", "landscape", "structure"], ["form", "landscape", "structure"]), makeWork("work.large_bathers", "大浴女", "The Large Bathers", "painting", ["concept.abstraction", "concept.body_movement"], ["body", "composition", "abstraction"], ["body composition", "abstraction", "form"])], ["concept.abstraction", "concept.representation"], ["form", "structure", "painting"], "art_image_design_architecture", [S.moma("Paul Cezanne"), S.met("Paul Cezanne")], ["art", "form", "modernism"], ["French"]),
  anchor("person.rothko", "罗斯科", "Mark Rothko", "art.modern", "artist", "20th_century", [makeWork("work.rothko_chapel", "罗斯科教堂", "Rothko Chapel", "art_space", ["concept.r28_installation_space", "concept.abstraction"], ["space", "color", "viewing"], ["installation space", "color field", "viewing"]), makeWork("work.no61_rust_blue", "第61号", "No. 61 (Rust and Blue)", "painting", ["concept.abstraction", "concept.viewing"], ["color", "field", "viewing"], ["abstraction", "color field", "viewing"])], ["concept.abstraction", "concept.viewing"], ["color", "space", "viewing"], "art_image_design_architecture", [S.moma("Mark Rothko"), S.tate("Rothko")], ["art", "viewing", "space"], ["English"]),
  anchor("person.cindy_sherman", "辛迪·舍曼", "Cindy Sherman", "art.photography", "artist", "20th_21st_century", [makeWork("work.untitled_film_stills", "无题电影剧照", "Untitled Film Stills", "photography_series", ["concept.gaze", "concept.performance_identity"], ["photography", "persona", "cinema"], ["gaze", "persona", "image performance"]), makeWork("work.history_portraits_sherman", "历史肖像", "History Portraits", "photography_series", ["concept.representation", "concept.institution"], ["portrait", "institution", "performance"], ["representation", "institution", "performance"])], ["concept.gaze", "concept.performance_identity"], ["photography", "persona", "gaze"], "art_image_design_architecture", [S.moma("Cindy Sherman")], ["photography", "film", "identity_boundary"], ["English"]),
  anchor("person.nam_june_paik", "白南准", "Nam June Paik", "art.media", "artist", "20th_century", [makeWork("work.tv_buddha", "电视佛", "TV Buddha", "video_installation", ["concept.r28_installation_space", "concept.interface"], ["video", "feedback", "installation"], ["installation space", "interface", "feedback"]), makeWork("work.electronic_superhighway", "电子高速公路", "Electronic Superhighway", "installation", ["concept.r28_platform_protocol_boundary", "concept.media_art"], ["media", "map", "technology"], ["media art", "technology boundary", "map"])], ["concept.interface", "concept.media_art"], ["video", "technology", "installation"], "art_image_design_architecture", [S.moma("Nam June Paik")], ["art", "technology", "interface"], ["Korean", "English"]),
  anchor("person.donald_norman", "唐纳德·诺曼", "Donald Norman", "design.interface", "designer/researcher", "20th_21st_century", [makeWork("work.design_everyday_things", "日常物品的设计", "The Design of Everyday Things", "design_text", ["concept.affordance", "concept.usability"], ["affordance", "usability", "everyday object"], ["affordance", "usability", "object relation"]), makeWork("work.emotional_design", "情感化设计", "Emotional Design", "design_text", ["concept.r28_design_system", "concept.interface"], ["design", "emotion", "use"], ["design system", "interface", "use boundary"])], ["concept.affordance", "concept.usability"], ["interface", "use", "design"], "art_image_design_architecture", [S.britannica("Donald Norman")], ["design", "interface", "education"], ["English"]),
  anchor("person.le_corbusier", "勒·柯布西耶", "Le Corbusier", "architecture.city", "architect", "20th_century", [makeWork("work.toward_architecture", "走向新建筑", "Toward an Architecture", "architecture_text", ["concept.planned_city", "concept.r28_architecture_human_scale"], ["modern architecture", "planning", "machine metaphor"], ["planning", "modern architecture", "human scale boundary"]), makeWork("work.villa_savoye", "萨伏伊别墅", "Villa Savoye", "building", ["concept.modern_design", "concept.form_material_institution"], ["building", "modern form", "material"], ["modern form", "building", "material"])], ["concept.planned_city", "concept.r28_architecture_human_scale"], ["architecture", "planning", "modernism"], "art_image_design_architecture", [S.britannica("Le Corbusier")], ["architecture", "city", "design"], ["French"]),
  anchor("person.kevin_lynch", "凯文·林奇", "Kevin Lynch", "city.urbanism", "urban planner", "20th_century", [makeWork("work.image_city_lynch", "城市意象", "The Image of the City", "urbanism_text", ["concept.imageability", "concept.city_memory"], ["imageability", "path", "city memory"], ["imageability", "path", "city memory"]), makeWork("work.good_city_form", "好的城市形态", "Good City Form", "urbanism_text", ["concept.public_space", "concept.r28_architecture_human_scale"], ["city form", "public space", "human scale"], ["city form", "public space", "human scale"])], ["concept.imageability", "concept.public_space"], ["city image", "public space", "urban form"], "city_food_daily_life", [S.britannica("Kevin Lynch urban planner")], ["city", "design", "film"], ["English"]),
  anchor("person.henri_lefebvre", "亨利·列斐伏尔", "Henri Lefebvre", "city.social_thought", "philosopher/sociologist", "20th_century", [makeWork("work.production_space", "空间的生产", "The Production of Space", "social_theory_text", ["concept.production_of_space", "concept.public_space"], ["space", "society", "everyday life"], ["production of space", "public space", "everyday life"]), makeWork("work.critique_everyday_life", "日常生活批判", "Critique of Everyday Life", "social_theory_text", ["concept.everyday_life", "concept.public_private_boundary"], ["daily life", "social form", "public private"], ["everyday life", "social form", "public private"])], ["concept.production_of_space", "concept.everyday_life"], ["space", "daily life", "social thought"], "city_food_daily_life", [S.britannica("Henri Lefebvre")], ["city", "social_thought", "daily_life"], ["French"]),
  anchor("person.brooks", "简·雅各布斯", "Jane Jacobs", "city.urbanism", "writer/urbanist", "20th_century", [makeWork("work.death_life_cities", "美国大城市的死与生", "The Death and Life of Great American Cities", "urbanism_text", ["concept.city_street", "concept.public_space"], ["street", "public life", "diversity"], ["street life", "public space", "diversity"]), makeWork("work.economy_cities", "城市经济", "The Economy of Cities", "urbanism_text", ["concept.institution", "concept.city_memory"], ["city economy", "institution", "public life"], ["city economy", "institution", "public life"])], ["concept.city_street", "concept.public_space"], ["street", "public life", "city"], "city_food_daily_life", [S.britannica("Jane Jacobs")], ["city", "public_space", "economy"], ["English"]),

  anchor("person.darwin", "达尔文", "Charles Darwin", "science.history", "naturalist", "19th_century", [makeWork("work.origin_species", "物种起源", "On the Origin of Species", "science_text", ["concept.natural_selection", "concept.evidence_chain"], ["natural selection", "evidence", "model"], ["natural selection", "evidence chain", "science boundary"]), makeWork("work.descent_man", "人类的由来", "The Descent of Man", "science_text", ["concept.natural_selection", "concept.public_science_boundary"], ["evolution", "public science", "boundary"], ["evolution", "public science boundary", "historical science"])], ["concept.natural_selection", "concept.evidence_chain"], ["science", "evidence", "model"], "science_technology_computing", [S.britannica("Charles Darwin")], ["science", "history", "evidence"], ["English"]),
  anchor("person.rachel_carson", "蕾切尔·卡森", "Rachel Carson", "science.environment", "writer/scientist", "20th_century", [makeWork("work.silent_spring", "寂静的春天", "Silent Spring", "science_text", ["concept.environmental_risk", "concept.public_science_boundary"], ["environmental risk", "public science", "evidence"], ["environmental risk", "public science", "evidence boundary"]), makeWork("work.sea_around_us", "我们周围的海洋", "The Sea Around Us", "science_text", ["concept.public_science_boundary", "concept.model_not_reality"], ["public science", "ocean", "model boundary"], ["public science", "ocean", "model boundary"])], ["concept.environmental_risk", "concept.public_science_boundary"], ["environment", "public science", "evidence"], "science_technology_computing", [S.britannica("Rachel Carson")], ["science", "environment", "public_science"], ["English"]),
  anchor("person.claude_shannon", "香农", "Claude Shannon", "technology.computing", "mathematician/engineer", "20th_century", [makeWork("work.mathematical_theory_communication", "通信的数学理论", "A Mathematical Theory of Communication", "paper", ["concept.information_theory", "concept.r28_computing_abstraction"], ["information", "signal", "abstraction"], ["information theory", "signal", "formal model"]), makeWork("work.shannon_switching", "继电器与开关电路", "A Symbolic Analysis of Relay and Switching Circuits", "thesis", ["concept.computation", "concept.r28_computing_abstraction"], ["logic", "switching", "computation"], ["logic", "switching", "computing abstraction"])], ["concept.information_theory", "concept.r28_computing_abstraction"], ["information", "signal", "computation"], "science_technology_computing", [S.britannica("Claude Shannon")], ["technology", "science", "language"], ["English"]),
  anchor("person.grace_hopper", "格蕾丝·霍珀", "Grace Hopper", "technology.computing", "computer scientist", "20th_century", [makeWork("work.cobol_context", "COBOL语境", "COBOL language context", "technology_example", ["concept.programming_language", "concept.r28_computing_abstraction"], ["programming language", "abstraction", "business computing"], ["programming language", "abstraction", "business computing"]), makeWork("work.compiler_hopper", "编译器工作", "compiler work", "technology_example", ["concept.programming_language", "concept.augmentation"], ["compiler", "language", "automation"], ["compiler", "programming language", "augmentation boundary"])], ["concept.programming_language", "concept.r28_computing_abstraction"], ["programming", "language", "abstraction"], "science_technology_computing", [S.britannica("Grace Hopper")], ["technology", "education", "language"], ["English"]),
  anchor("person.vannevar_bush", "范内瓦·布什", "Vannevar Bush", "technology.history", "engineer/science administrator", "20th_century", [makeWork("work.as_we_may_think", "诚如所思", "As We May Think", "essay", ["concept.hypertext", "concept.augmentation"], ["memory aid", "hypertext", "augmentation"], ["hypertext precursor", "augmentation", "memory aid"]), makeWork("work.memex_concept", "Memex概念", "Memex concept", "technology_example", ["concept.hypertext", "concept.r28_platform_protocol_boundary"], ["associative trail", "memory aid", "technology history"], ["associative trail", "hypertext", "technology history boundary"])], ["concept.hypertext", "concept.augmentation"], ["hypertext", "memory", "augmentation"], "science_technology_computing", [S.britannica("Vannevar Bush")], ["technology", "memory", "interface"], ["English"]),
  anchor("person.h_l_a_hart", "哈特", "H. L. A. Hart", "law.jurisprudence", "legal philosopher", "20th_century", [makeWork("work.concept_law_hart", "法律的概念", "The Concept of Law", "law_text", ["concept.legal_positivism", "concept.r28_jurisdiction_boundary"], ["rule", "legal system", "boundary"], ["legal positivism", "rule", "jurisdiction boundary"]), makeWork("work.law_liberty_morality", "法律、自由与道德", "Law, Liberty and Morality", "law_text", ["concept.law_morality", "concept.freedom_responsibility"], ["law", "morality", "liberty"], ["law morality", "freedom responsibility", "boundary"])], ["concept.legal_positivism", "concept.r28_jurisdiction_boundary"], ["law", "rule", "boundary"], "economy_law_education_care_boundary", [S.britannica("H. L. A. Hart")], ["law", "philosophy", "boundary"], ["English"]),
  anchor("person.rawls", "罗尔斯", "John Rawls", "law.political_philosophy", "philosopher", "20th_century", [makeWork("work.theory_justice", "正义论", "A Theory of Justice", "philosophy_text", ["concept.fairness", "concept.public_private_boundary"], ["justice", "fairness", "institution"], ["fairness", "institution", "justice boundary"]), makeWork("work.political_liberalism", "政治自由主义", "Political Liberalism", "philosophy_text", ["concept.public_private_boundary", "concept.legitimacy"], ["public reason", "legitimacy", "pluralism"], ["public reason", "legitimacy", "pluralism"])], ["concept.fairness", "concept.legitimacy"], ["justice", "institution", "legitimacy"], "economy_law_education_care_boundary", [S.sep("rawls")], ["law", "philosophy", "education"], ["English"]),
  anchor("person.dworkin", "德沃金", "Ronald Dworkin", "law.jurisprudence", "legal philosopher", "20th_21st_century", [makeWork("work.taking_rights_seriously", "认真对待权利", "Taking Rights Seriously", "law_text", ["concept.rights", "concept.legal_interpretation"], ["rights", "interpretation", "law"], ["rights", "legal interpretation", "jurisprudence"]), makeWork("work.laws_empire", "法律帝国", "Law's Empire", "law_text", ["concept.legal_interpretation", "concept.rule_application_precedent"], ["interpretation", "precedent", "principle"], ["legal interpretation", "precedent", "principle"])], ["concept.rights", "concept.legal_interpretation"], ["law", "rights", "interpretation"], "economy_law_education_care_boundary", [S.britannica("Ronald Dworkin")], ["law", "philosophy", "boundary"], ["English"]),
  anchor("person.amartya_sen", "阿马蒂亚·森", "Amartya Sen", "economy.social_thought", "economist/philosopher", "20th_21st_century", [makeWork("work.development_freedom", "以自由看待发展", "Development as Freedom", "economy_text", ["concept.capability_approach", "concept.freedom_responsibility"], ["capability", "freedom", "development"], ["capability approach", "freedom", "development boundary"]), makeWork("work.idea_justice", "正义的理念", "The Idea of Justice", "philosophy_text", ["concept.fairness", "concept.public_private_boundary"], ["justice", "comparison", "institution"], ["justice", "comparison", "institution boundary"])], ["concept.capability_approach", "concept.fairness"], ["economy", "justice", "capability"], "economy_law_education_care_boundary", [S.nobel("Amartya Sen"), S.britannica("Amartya Sen")], ["economy", "law", "education"], ["English"]),
  anchor("person.dewey", "杜威", "John Dewey", "education", "philosopher/educator", "20th_century", [makeWork("work.democracy_education", "民主与教育", "Democracy and Education", "education_text", ["concept.learning_by_doing", "concept.inquiry"], ["education", "democracy", "inquiry"], ["learning by doing", "inquiry", "social environment"]), makeWork("work.experience_education", "经验与教育", "Experience and Education", "education_text", ["concept.r28_education_transfer", "concept.feedback"], ["experience", "learning", "feedback"], ["experience", "learning transfer", "feedback"])], ["concept.learning_by_doing", "concept.inquiry"], ["education", "experience", "inquiry"], "economy_law_education_care_boundary", [S.britannica("John Dewey")], ["education", "democracy", "learning"], ["English"]),
  anchor("person.montessori", "蒙台梭利", "Maria Montessori", "education", "educator", "20th_century", [makeWork("work.montessori_method", "蒙台梭利方法", "The Montessori Method", "education_text", ["concept.prepared_environment", "concept.practice"], ["prepared environment", "practice", "child agency"], ["prepared environment", "practice", "education boundary"]), makeWork("work.absorbent_mind", "有吸收力的心灵", "The Absorbent Mind", "education_text", ["concept.prepared_environment", "concept.r28_education_transfer"], ["environment", "development", "learning"], ["prepared environment", "learning transfer", "development boundary"])], ["concept.prepared_environment", "concept.r28_education_transfer"], ["education", "environment", "practice"], "economy_law_education_care_boundary", [S.britannica("Maria Montessori")], ["education", "design", "care_boundary"], ["Italian"]),
  anchor("person.william_james", "威廉·詹姆斯", "William James", "psychology.philosophy", "psychologist/philosopher", "19th_20th_century", [makeWork("work.principles_psychology", "心理学原理", "The Principles of Psychology", "psychology_text", ["concept.attention", "concept.memory"], ["attention", "habit", "memory"], ["attention", "memory", "psychology boundary"]), makeWork("work.varieties_religious_experience", "宗教经验之种种", "The Varieties of Religious Experience", "psychology_text", ["concept.experience_boundary", "concept.r28_care_non_diagnosis"], ["experience", "religion", "boundary"], ["experience boundary", "psychology boundary", "non-diagnosis"])], ["concept.attention", "concept.memory"], ["psychology", "experience", "boundary"], "economy_law_education_care_boundary", [S.britannica("William James")], ["psychology", "philosophy", "care_boundary"], ["English"])
];

function existingIds(byId, outputRows = []) {
  return new Set([...byId.keys(), ...outputRows.map((row) => row.id)]);
}

function pushUnique(rows, card, byId) {
  if (!card || byId.has(card.id) || rows.some((row) => row.id === card.id)) return false;
  rows.push(card);
  return true;
}

function relationId(kind, a, b) {
  return `relation.r28_${kind}.${slug(a)}.${slug(b)}`;
}

function makeAnchorRelations(row, active = false) {
  const out = [];
  for (const workRow of row.works) {
    out.push(relation({
      id: relationId("person_work", row.id, workRow.id),
      domain: row.domain,
      relation_type: "person_to_work",
      source_ids: [row.id],
      target_ids: [workRow.id],
      shared_axes: ["representative work", ...row.axes.slice(0, 2)],
      contrast_axes: ["creator is not reducible to one work"],
      example_ids: [workRow.id],
      provenance: workRow.provenance || row.provenance,
      transfer: ["representative_works", "topic_reentry", "comparison"],
      pack: row.pack,
      purpose: ["closes_person_work_loop", "representative_work_support"]
    }, active));
    for (const conceptId of workRow.concepts.slice(0, 2)) {
      out.push(relation({
        id: relationId("work_concept", workRow.id, conceptId),
        domain: row.domain,
        relation_type: "work_to_concept",
        source_ids: [workRow.id],
        target_ids: [conceptId],
        shared_axes: ["example", ...workRow.axes.slice(0, 2)],
        contrast_axes: ["example does not exhaust concept"],
        example_ids: [workRow.id],
        provenance: workRow.provenance || row.provenance,
        transfer: ["concept_followup", "explain_characteristics", "compare_works"],
        pack: row.pack,
        purpose: ["closes_work_concept_loop", "concept_followup_support"]
      }, active));
    }
  }
  for (const conceptId of row.concepts.slice(0, 2)) {
    out.push(relation({
      id: relationId("person_concept", row.id, conceptId),
      domain: row.domain,
      relation_type: "person_to_concept",
      source_ids: [row.id],
      target_ids: [conceptId],
      shared_axes: ["recurring theme", ...row.axes.slice(0, 2)],
      contrast_axes: ["theme is not biography"],
      provenance: row.provenance,
      transfer: ["explain_characteristics", "compare_people", "topic_reentry"],
      pack: row.pack,
      purpose: ["closes_person_concept_loop", "comparison_support"]
    }, active));
  }
  return out;
}

function typeOfId(id = "") {
  if (id.startsWith("person.")) return "person";
  if (id.startsWith("work.")) return "work";
  if (/^(concept|theme|movement|period|genre)\./.test(id)) return "concept";
  if (id.startsWith("relation.")) return "relation";
  return "other";
}

function autoClosureRelations(byId) {
  const cards = [...byId.values()];
  const ids = new Set(cards.map((card) => card.id));
  const activeIds = new Set(cards.filter(isActive).map((card) => card.id));
  const existingPair = new Set(cards.filter((card) => card.entity_type === "relation" && isActive(card))
    .flatMap((card) => (card.source_ids || []).flatMap((a) => (card.target_ids || []).map((b) => [a, b].sort().join("|")))));
  const out = [];
  const add = (kind, from, to, domain, axes, provenance, transfer, preferredActive) => {
    if (!ids.has(from) || !ids.has(to)) return;
    const pair = [from, to].sort().join("|");
    if (existingPair.has(pair)) return;
    existingPair.add(pair);
    out.push(relation({
      id: relationId(`closure_${kind}`, from, to),
      domain: domain || "bridge_guardrail",
      relation_type: kind,
      source_ids: [from],
      target_ids: [to],
      shared_axes: axes.slice(0, 3),
      contrast_axes: ["connection does not prove identity"],
      provenance,
      transfer,
      pack: packForDomain(domain),
      purpose: ["closes_existing_endpoint_loop", "reduces_orphan_debt"]
    }, preferredActive && activeIds.has(from) && activeIds.has(to)));
  };
  for (const card of cards) {
    const prov = source(card);
    if (card.entity_type === "person") {
      for (const workId of [...(card.works || []), ...(card.representative_works || [])]) {
        add("person_to_work", card.id, workId, card.domain, ["representative work", ...(card.comparison_axes || card.themes || [])], prov, ["representative_works", "topic_reentry"], isActive(card));
      }
      for (const conceptId of (card.related_concepts || [])) {
        add("person_to_concept", card.id, conceptId, card.domain, ["theme", ...(card.comparison_axes || card.themes || [])], prov, ["explain_characteristics", "comparison"], isActive(card));
      }
    }
    if (card.entity_type === "work") {
      for (const creatorId of (card.creator_ids || [])) {
        add("work_to_creator", card.id, creatorId, card.domain, ["creator relation", ...(card.comparison_axes || card.themes || [])], prov, ["representative_works", "topic_reentry"], isActive(card));
      }
      for (const conceptId of (card.concepts || collectRefs(card).filter((id) => typeOfId(id) === "concept")).slice(0, 4)) {
        add("work_to_concept", card.id, conceptId, card.domain, ["example", ...(card.comparison_axes || card.themes || [])], prov, ["concept_followup", "compare_works"], isActive(card));
      }
    }
    if (isConceptType(card)) {
      for (const conceptId of (card.related_concepts || []).slice(0, 4)) {
        add("concept_to_concept", card.id, conceptId, card.domain, ["concept relation", ...(card.comparison_axes || card.definition_units || [])], prov, ["same_or_different_question", "concept_followup"], isActive(card));
      }
    }
  }
  return out;
}

function activeLimitRelations(rows, limit) {
  let activeCount = 0;
  for (const row of rows) {
    if (row.approved_for_public_runtime) {
      activeCount += 1;
      if (activeCount > limit) {
        row.visibility = "local";
        row.approved_for_public_runtime = false;
        row.runtime_scope = "source_only";
        row.activation_priority = 9;
        row.source_library_tier = "r28_source_library";
      }
    }
  }
  return rows;
}

function generateR28Cards(byId) {
  const conceptRows = [];
  for (const seed of conceptSeeds) {
    const active = [
      "concept.r28_world_literature_memory",
      "concept.r28_film_domestic_time",
      "concept.r28_documentary_performance",
      "concept.r28_album_sequence",
      "concept.r28_arrangement_texture",
      "concept.r28_listening_scene",
      "concept.r28_image_authority",
      "concept.r28_design_system",
      "concept.r28_public_space_boundary",
      "concept.r28_architecture_human_scale",
      "concept.r28_food_technique_memory",
      "concept.r28_science_model_boundary",
      "concept.r28_computing_abstraction",
      "concept.r28_platform_protocol_boundary",
      "concept.r28_jurisdiction_boundary",
      "concept.r28_care_non_diagnosis",
      "concept.r28_education_transfer",
      "concept.r28_economy_institution_boundary"
    ].includes(seed.id);
    pushUnique(conceptRows, concept(seed, active), byId);
  }

  const litFilmMusic = [];
  const artCityScience = [];
  let activeAnchorBudget = 20;
  for (const seed of anchorSeeds) {
    const active = activeAnchorBudget > 0 && !byId.has(seed.id) && seed.works.every((workRow) => !byId.has(workRow.id));
    activeAnchorBudget -= active ? 1 : 0;
    const target = /literature|film|music/.test(seed.domain) ? litFilmMusic : artCityScience;
    pushUnique(target, person(seed, active), byId);
    for (const workRow of seed.works) pushUnique(target, work(workRow, seed, active), byId);
    for (const rel of makeAnchorRelations(seed, active)) pushUnique(target, rel, byId);
  }

  const auto = autoClosureRelations(byId);
  activeLimitRelations(auto, 380);

  const bridgeRows = [];
  const conceptIds = [
    ...conceptSeeds.map((row) => row.id),
    "concept.analogy_not_identity",
    "concept.memory_vs_fact",
    "concept.concept_explanation_not_advice",
    "concept.rule_not_answer",
    "concept.interface_not_visual_styling",
    "concept.model_not_reality",
    "concept.evidence_not_anecdote",
    "concept.city_street",
    "concept.food_taste_not_nutrition",
    "concept.song_poem_boundary",
    "concept.seasonality",
    "concept.mono_no_aware",
    "concept.wabi_sabi",
    "concept.translation_equivalence_boundary",
    "concept.naming",
    "concept.reference",
    "concept.public_private_boundary",
    "concept.legal_interpretation",
    "concept.market_not_society",
    "concept.care_boundary_static_card"
  ].filter((id, index, arr) => arr.indexOf(id) === index);
  const existingOrNew = new Set([...byId.keys(), ...conceptRows.map((row) => row.id)]);
  const activeConcepts = new Set(conceptRows.filter(isActive).map((row) => row.id));
  for (let i = 0; i < conceptIds.length; i += 1) {
    for (let j = i + 1; j < Math.min(conceptIds.length, i + 13); j += 1) {
      const a = conceptIds[i];
      const b = conceptIds[j];
      if (!existingOrNew.has(a) || !existingOrNew.has(b)) continue;
      const active = bridgeRows.filter(isActive).length < 80 && (activeConcepts.has(a) || byId.get(a)?.approved_for_public_runtime) && (activeConcepts.has(b) || byId.get(b)?.approved_for_public_runtime);
      pushUnique(bridgeRows, relation({
        id: relationId("bridge_guardrail", a, b),
        domain: "bridge_guardrail",
        relation_type: "concept_bridge_or_negative_boundary",
        source_ids: [a],
        target_ids: [b],
        shared_axes: ["comparison support", "concept follow-up", "boundary guardrail"],
        contrast_axes: ["analogy is not identity", "shared word is not shared meaning"],
        licensed_verbs: ["distinguishes", "frames", "constrains", "supports_comparison"],
        constraints: ["preserve domain-specific meaning", "avoid false equivalence"],
        negative_moves: ["analogy_is_not_identity", "do_not_collapse_concepts", "do_not_offer_expert_advice"],
        provenance: [S.britannica("analogy"), S.britannica("concept")],
        transfer: ["same_or_different_question", "concept_followup", "cross_domain_analogy"],
        pack: "bridge_negative_boundary_layer",
        purpose: ["adds_bridge_guardrail", "supports_false_equivalence_rejection"]
      }, active), byId);
    }
  }

  // Extra boundary/example relations over existing active cards: high-transfer, compact, and endpoint-safe.
  const activeExisting = [...byId.values()].filter(isActive).filter((card) => !isMethod(card));
  const activeConceptExisting = activeExisting.filter(isConceptType).slice(0, 420);
  const activeWorkExisting = activeExisting.filter((card) => card.entity_type === "work").slice(0, 170);
  for (const workCard of activeWorkExisting) {
    for (const conceptId of collectRefs(workCard).filter((id) => typeOfId(id) === "concept").slice(0, 3)) {
      if (!byId.has(conceptId) || !isActive(byId.get(conceptId))) continue;
      pushUnique(bridgeRows, relation({
        id: relationId("active_example", workCard.id, conceptId),
        domain: `${workCard.domain}.example_closure`,
        relation_type: "work_example_for_concept",
        source_ids: [workCard.id],
        target_ids: [conceptId],
        shared_axes: ["example", "concept follow-up", "representative-work support"],
        contrast_axes: ["example does not exhaust concept"],
        licensed_verbs: ["exemplifies", "helps_explain", "frames"],
        negative_moves: ["do_not_make_single_work_definition", "do_not_overgeneralize"],
        provenance: source(workCard),
        transfer: ["concept_followup", "representative_works", "comparison"],
        pack: packForDomain(workCard.domain),
        purpose: ["closes_active_work_concept_loop"]
      }, bridgeRows.filter(isActive).length < 180), byId);
    }
  }
  for (let i = 0; i < activeConceptExisting.length; i += 1) {
    const a = activeConceptExisting[i];
    const b = activeConceptExisting[(i + 17) % activeConceptExisting.length];
    if (!a || !b || a.id === b.id) continue;
    pushUnique(bridgeRows, relation({
      id: relationId("active_concept_guard", a.id, b.id),
      domain: "bridge_guardrail",
      relation_type: "concept_distinction_or_bridge",
      source_ids: [a.id],
      target_ids: [b.id],
      shared_axes: ["comparison", "boundary", "topic re-link"],
      contrast_axes: ["same topic family does not imply same concept"],
      licensed_verbs: ["distinguishes", "frames", "supports_reentry"],
      negative_moves: ["same_word_is_not_same_concept", "do_not_force_equivalence"],
      provenance: [S.britannica("concept"), S.britannica("comparison")],
      transfer: ["same_or_different_question", "topic_reentry", "cross_domain_analogy"],
      pack: "bridge_negative_boundary_layer",
      purpose: ["adds_active_guardrail_relation"]
    }, bridgeRows.filter(isActive).length < 620), byId);
  }

  const cleanupRows = auto;
  const allRows = [...cleanupRows, ...conceptRows, ...litFilmMusic, ...artCityScience, ...bridgeRows];
  enforceActiveReferenceClosure(allRows, byId);
  return {
    cleanupRows,
    litFilmMusic: [...conceptRows.filter((card) => /literature|film|music/.test(card.domain)), ...litFilmMusic],
    artCityScience: [...conceptRows.filter((card) => !/literature|film|music/.test(card.domain)), ...artCityScience],
    bridgeRows
  };
}

function enforceActiveReferenceClosure(rows, byId) {
  const sourceExistingActive = [...byId.values()].filter(isActive).map((card) => card.id);
  let changed = true;
  while (changed) {
    changed = false;
    const activeIds = new Set([...sourceExistingActive, ...rows.filter(isActive).map((card) => card.id)]);
    for (const card of rows) {
      if (!isActive(card)) continue;
      const badRef = collectRefs(card).find((id) => ["person", "work", "concept"].includes(typeOfId(id)) && !activeIds.has(id));
      if (badRef) {
        demote(card, `active_reference_not_loaded:${badRef}`, "r28_active_closure_pruned_source_only");
        changed = true;
      }
    }
  }
}

function main() {
  for (const file of [CLEANUP_FILE, FILE_LIT_FILM_MUSIC, FILE_ART_CITY_SCIENCE, FILE_BRIDGE]) {
    if (fs.existsSync(file)) fs.rmSync(file);
  }
  const { byFile, byId } = loadExisting();
  normalizeExistingCards(byFile, byId);

  // Reload after normalization, so active endpoint checks see demotions.
  const reloaded = loadExisting();
  const generated = generateR28Cards(reloaded.byId);

  writeJsonl(CLEANUP_FILE, generated.cleanupRows);
  writeJsonl(FILE_LIT_FILM_MUSIC, generated.litFilmMusic);
  writeJsonl(FILE_ART_CITY_SCIENCE, generated.artCityScience);
  writeJsonl(FILE_BRIDGE, generated.bridgeRows);

  const counts = {
    cleanup_cards: generated.cleanupRows.length,
    lit_film_music_cards: generated.litFilmMusic.length,
    art_city_science_cards: generated.artCityScience.length,
    bridge_cards: generated.bridgeRows.length,
    total_r28_cards: generated.cleanupRows.length + generated.litFilmMusic.length + generated.artCityScience.length + generated.bridgeRows.length,
    active_r28_cards: [...generated.cleanupRows, ...generated.litFilmMusic, ...generated.artCityScience, ...generated.bridgeRows].filter(isActive).length
  };
  console.log(JSON.stringify(counts, null, 2));
}

main();
