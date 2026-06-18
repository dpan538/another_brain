import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CARD_DIR = path.join(ROOT, "data", "culture_cards");
const FILE_A = path.join(CARD_DIR, "r26_source_growth_world_literature_cinema_music.jsonl");
const FILE_B = path.join(CARD_DIR, "r26_source_growth_image_thought_daily_boundary.jsonl");
const FILE_C = path.join(CARD_DIR, "r26_bridge_negative_boundary_source_pack.jsonl");
const OUTPUT_FILES = new Set([path.basename(FILE_A), path.basename(FILE_B), path.basename(FILE_C)]);

const COPYRIGHT_POLICY = "Use metadata, themes, and short paraphrase only; no lyrics, plot dumps, or long copyrighted excerpts.";
const MOVES = {
  overview: "definition_unit",
  works_list: "list_items",
  representative_works: "representative_items",
  entry_path: "guided_sequence",
  explain_work: "summary_no_quotes",
  compare: "contrast_axes",
  country_relation: "context_split",
  why_it_matters: "field_effect",
  quote_or_lyrics_boundary: "no_long_quotes"
};

const S = {
  britannica: (query) => ({ label: `Britannica:${query}`, url: `https://www.britannica.com/search?query=${encodeURIComponent(query)}` }),
  bfi: (query) => ({ label: `BFI:${query}`, url: `https://www.bfi.org.uk/search?query=${encodeURIComponent(query)}` }),
  moma: (query) => ({ label: `MoMA:${query}`, url: `https://www.moma.org/search/?query=${encodeURIComponent(query)}` }),
  tate: (query) => ({ label: `Tate:${query}`, url: `https://www.tate.org.uk/search?q=${encodeURIComponent(query)}` }),
  sep: (slug) => ({ label: `SEP:${slug}`, url: `https://plato.stanford.edu/entries/${slug}/` }),
  nobel: (query) => ({ label: `Nobel:${query}`, url: `https://www.nobelprize.org/search/${encodeURIComponent(query)}` }),
  acm: (query) => ({ label: `ACM:${query}`, url: `https://amturing.acm.org/search.cfm?searchterm=${encodeURIComponent(query)}` }),
  official: (label, url) => ({ label, url })
};

const ACTIVE_PEOPLE = new Set([
  "person.gabriel_garcia_marquez",
  "person.han_kang",
  "person.dostoevsky",
  "person.toni_morrison",
  "person.fellini",
  "person.tarkovsky",
  "person.chantal_akerman",
  "person.abbas_kiarostami",
  "person.bob_dylan",
  "person.miles_davis",
  "person.rene_magritte",
  "person.walter_benjamin"
]);

const ACTIVE_EXTRA_CONCEPTS = new Set([
  "concept.magical_realism",
  "concept.realism_literature",
  "concept.witness_testimony",
  "concept.postcolonial_memory",
  "concept.absurdity_literature",
  "concept.exile",
  "concept.montage",
  "concept.long_take",
  "concept.mise_en_scene",
  "concept.documentary_fiction_boundary",
  "concept.city_film",
  "concept.memory_film",
  "concept.cover_version",
  "concept.improvisation",
  "concept.jazz",
  "concept.folk_revival",
  "concept.song_poem_boundary",
  "concept.representation_image",
  "concept.image_not_evidence",
  "concept.naming_reference_distinction",
  "concept.translation_equivalence_boundary",
  "concept.authority_legitimacy",
  "concept.memory_vs_fact",
  "concept.affective_association_boundary",
  "concept.analogy_not_identity"
]);

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function existingMaps() {
  const all = new Map();
  const active = new Set();
  for (const name of fs.readdirSync(CARD_DIR).filter((file) => file.endsWith(".jsonl"))) {
    if (OUTPUT_FILES.has(name)) continue;
    for (const row of readJsonl(path.join(CARD_DIR, name))) {
      all.set(row.id, row);
      if (row.approved_for_public_runtime === true && row.visibility === "public") active.add(row.id);
    }
  }
  return { all, active };
}

function activeMeta({ pack_id, runtime_scope = "domain_pack", priority = 6, purpose = [] }) {
  return {
    runtime_scope,
    pack_id,
    activation_priority: priority,
    source_library_tier: "r26_v2_v3_source_growth",
    runtime_default: false,
    local_first_risk: "low_bundle_risk",
    bundle_weight_estimate: "small",
    purpose_class: purpose,
    visibility: "public",
    approved_for_public_runtime: true
  };
}

function dormantMeta({ pack_id, runtime_scope = "source_only", purpose = [] }) {
  return {
    runtime_scope,
    pack_id,
    activation_priority: 9,
    source_library_tier: "r26_source_library",
    runtime_default: false,
    local_first_risk: "kept_out_of_default_bundle",
    bundle_weight_estimate: "source_only",
    purpose_class: purpose,
    visibility: "local",
    approved_for_public_runtime: false
  };
}

function chooseMeta({ active, pack_id, active_scope = "domain_pack", dormant_scope = "source_only", purpose = [] }) {
  return active
    ? activeMeta({ pack_id, runtime_scope: active_scope, purpose })
    : dormantMeta({ pack_id, runtime_scope: dormant_scope, purpose });
}

function base({ id, entity_type, names, domain, factual_core, themes = [], related_entities = [], comparison_axes = [], entry_points = ["definition_unit", "contrast_unit"], confidence = 0.82, meta }) {
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
    entry_points,
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
    source_summary: "R26 source backed card; compact primitives only.",
    confidence,
    visibility: meta.visibility,
    approved_for_public_runtime: meta.approved_for_public_runtime,
    not_to_infer: [
      "complete canon",
      "private motive",
      "direct influence without evidence",
      "identity equivalence from analogy",
      "current professional advice"
    ],
    needs_review: false,
    eval_tags: ["r26", entity_type],
    ...meta
  };
}

function person(row) {
  const active = ACTIVE_PEOPLE.has(row.id);
  const meta = chooseMeta({
    active,
    pack_id: row.pack,
    dormant_scope: row.scope || "source_only",
    purpose: ["closes_person_work_loop", "supports_representative_work_questions"]
  });
  return {
    ...base({
      id: row.id,
      entity_type: "person",
      names: row.names,
      domain: row.domain,
      factual_core: `${row.names.at(-1)}: ${row.roles.join(", ")}; period=${row.period}.`,
      themes: row.concepts,
      related_entities: [
        ...row.works.map((work) => ({ id: work.id, relation: "representative_work" })),
        ...row.concepts.map((id) => ({ id, relation: "related_concept" }))
      ],
      comparison_axes: row.axes,
      meta
    }),
    roles: row.roles,
    period: row.period,
    regions_languages: row.regions || [],
    works: row.works.map((work) => work.id),
    representative_works: row.works.map((work) => work.id),
    related_concepts: row.concepts,
    related_people: row.people || [],
    negative_moves: ["do_not_infer_private_motive", "do_not_treat_as_complete_field"],
    uncertainty_notes: ["public summary only"],
    provenance: row.provenance,
    transfer_scope: row.transfer,
    turn_functions: ["identify_person", "list_representative_works", "explain_characteristics", "compare_people", "topic_reentry"]
  };
}

function work(row, owner) {
  const active = ACTIVE_PEOPLE.has(owner.id);
  const meta = chooseMeta({
    active,
    pack_id: owner.pack,
    dormant_scope: owner.scope || "source_only",
    purpose: ["closes_work_concept_loop", "supports_concept_followup"]
  });
  return {
    ...base({
      id: row.id,
      entity_type: "work",
      names: row.names,
      domain: owner.domain,
      factual_core: `${row.names.at(-1)}: ${row.type}; period=${row.period || owner.period}.`,
      themes: row.concepts || owner.concepts,
      related_entities: [
        { id: owner.id, relation: "creator_or_primary_context" },
        ...(row.concepts || owner.concepts).map((id) => ({ id, relation: "related_concept" }))
      ],
      comparison_axes: row.axes || owner.axes,
      meta
    }),
    creator_ids: [owner.id],
    work_type: row.type,
    period: row.period || owner.period,
    concepts: row.concepts || owner.concepts,
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

function concept(row) {
  const active = ACTIVE_EXTRA_CONCEPTS.has(row.id);
  const meta = chooseMeta({
    active,
    pack_id: row.pack,
    active_scope: row.boundary ? "boundary_pack" : "domain_pack",
    dormant_scope: row.scope || "source_only",
    purpose: row.boundary ? ["adds_boundary_guardrail", "supports_false_equivalence_rejection"] : ["adds_domain_foundation", "supports_concept_followup"]
  });
  return {
    ...base({
      id: row.id,
      entity_type: row.type || "concept",
      names: row.names,
      domain: row.domain,
      factual_core: `${row.names.at(-1)} concept scaffold.`,
      themes: row.related || [],
      related_entities: (row.related || []).map((id) => ({ id, relation: "related_concept" })),
      comparison_axes: row.units,
      meta
    }),
    definition_units: row.units,
    examples: row.examples,
    non_examples: row.non_examples,
    related_concepts: row.related || [],
    related_people: row.people || [],
    relation_ids: [],
    common_misreadings: row.misreadings,
    negative_moves: row.negative,
    boundary_notes: row.boundary_notes || ["Use as a concept distinction, not as a complete answer."],
    provenance: row.provenance,
    transfer_scope: row.transfer,
    turn_functions: ["define_concept", "explain_characteristics", "explain_relation", "compare_forms", "topic_reentry"]
  };
}

function relation(row) {
  const meta = chooseMeta({
    active: row.active === true,
    pack_id: row.pack || "bridge_negative_boundary_layer",
    active_scope: row.boundary ? "boundary_pack" : "bridge_pack",
    dormant_scope: row.scope || "source_only",
    purpose: row.purpose || ["adds_analogy_bridge", "supports_same_or_different_question"]
  });
  return {
    ...base({
      id: row.id,
      entity_type: "relation",
      names: row.names || [row.id.replace(/^relation\./, "")],
      domain: row.domain,
      factual_core: `${row.relation_type} relation scaffold.`,
      themes: row.shared_axes,
      related_entities: [...row.source_ids, ...row.target_ids].map((id) => ({ id, relation: "relation_endpoint" })),
      comparison_axes: [...row.shared_axes, ...(row.contrast_axes || [])],
      meta
    }),
    relation_type: row.relation_type,
    source_ids: row.source_ids,
    target_ids: row.target_ids,
    shared_axes: row.shared_axes,
    contrast_axes: row.contrast_axes || [],
    licensed_verbs: row.licensed_verbs || ["contrasts_with", "helps_explain", "frames"],
    example_ids: row.example_ids || [],
    constraints: row.constraints || ["do not claim identity", "do not infer causation without evidence"],
    negative_moves: row.negative_moves || ["analogy_is_not_identity", "avoid_totalizing_claim"],
    boundary_notes: row.boundary_notes || ["Relation supports comparison only."],
    provenance: row.provenance,
    transfer_scope: row.transfer,
    turn_functions: ["explain_relation", "compare_forms", "concept_followup", "topic_reentry", "meaningful_non_question"]
  };
}

function anchor(id, names, domain, roles, period, works, concepts, axes, pack, provenance, transfer, scope = "source_only") {
  return { id, names, domain, roles, period, works, concepts, axes, pack, provenance, transfer, scope };
}

function w(id, names, type, concepts, axes, summary, period) {
  return { id, names, type, concepts, axes, summary, period };
}

const anchors = [
  anchor("person.han_kang", ["韩江", "Han Kang"], "literature.korean", ["novelist"], "21st_century", [
    w("work.the_vegetarian", ["素食者", "The Vegetarian"], "novel", ["concept.witness_testimony", "concept.body_boundary"], ["body", "violence", "refusal"], ["body", "refusal", "social pressure"]),
    w("work.human_acts", ["少年时", "Human Acts"], "novel", ["concept.witness_testimony", "concept.historical_trauma"], ["testimony", "violence", "memory"], ["testimony", "collective violence", "memory"])
  ], ["concept.witness_testimony", "concept.body_boundary"], ["body", "refusal", "memory"], "world_literature_extension", [S.nobel("Han Kang"), S.britannica("Han Kang")], ["literature", "memory", "care_boundary"]),
  anchor("person.gabriel_garcia_marquez", ["加西亚·马尔克斯", "Gabriel Garcia Marquez"], "literature.latin_american", ["novelist"], "20th_century", [
    w("work.one_hundred_years_solitude", ["百年孤独", "One Hundred Years of Solitude"], "novel", ["concept.magical_realism", "concept.memory_lineage"], ["family", "history", "myth"], ["family memory", "history", "mythic scale"]),
    w("work.love_in_time_of_cholera", ["霍乱时期的爱情", "Love in the Time of Cholera"], "novel", ["concept.time_love_memory", "concept.realism_literature"], ["time", "love", "aging"], ["long duration", "love", "aging"])
  ], ["concept.magical_realism", "concept.memory_lineage"], ["memory", "history", "myth"], "world_literature_extension", [S.nobel("Gabriel Garcia Marquez"), S.britannica("Gabriel Garcia Marquez")], ["literature", "history", "memory"]),
  anchor("person.julio_cortazar", ["胡里奥·科塔萨尔", "Julio Cortazar"], "literature.latin_american", ["writer"], "20th_century", [
    w("work.hopscotch", ["跳房子", "Hopscotch"], "novel", ["concept.fragmented_form", "concept.reader_path"], ["structure", "reader", "play"], ["open structure", "reader path", "urban drift"]),
    w("work.blow_up_story", ["恶魔涎", "Blow-Up story"], "short_story", ["concept.short_story_vs_novel", "concept.photographic_uncertainty"], ["image", "uncertainty", "short_form"], ["image uncertainty", "short form", "perception"])
  ], ["concept.fragmented_form", "concept.reader_path"], ["structure", "play", "city"], "world_literature_extension", [S.britannica("Julio Cortazar")], ["literature", "film", "image"]),
  anchor("person.clarice_lispector", ["克拉丽丝·李斯佩克朵", "Clarice Lispector"], "literature.latin_american", ["novelist"], "20th_century", [
    w("work.passion_according_gh", ["星辰时刻前的G.H.", "The Passion According to G.H."], "novel", ["concept.interior_monologue", "concept.identity_boundary"], ["interiority", "self", "limit"], ["interiority", "self limit", "encounter"]),
    w("work.hour_of_star", ["星辰时刻", "The Hour of the Star"], "novel", ["concept.narrative_voice", "concept.social_visibility"], ["voice", "poverty", "visibility"], ["narrative voice", "social visibility", "distance"])
  ], ["concept.interior_monologue", "concept.narrative_voice"], ["interiority", "voice", "distance"], "world_literature_extension", [S.britannica("Clarice Lispector")], ["literature", "voice", "identity"]),
  anchor("person.dostoevsky", ["陀思妥耶夫斯基", "Fyodor Dostoevsky"], "literature.russian", ["novelist"], "19th_century", [
    w("work.crime_and_punishment", ["罪与罚", "Crime and Punishment"], "novel", ["concept.moral_conflict", "concept.psychological_novel"], ["guilt", "crime", "conscience"], ["crime", "guilt", "conscience"]),
    w("work.brothers_karamazov", ["卡拉马佐夫兄弟", "The Brothers Karamazov"], "novel", ["concept.moral_conflict", "concept.polyphonic_novel"], ["family", "faith", "argument"], ["family conflict", "faith", "argument"])
  ], ["concept.moral_conflict", "concept.psychological_novel"], ["guilt", "faith", "argument"], "world_literature_extension", [S.britannica("Fyodor Dostoevsky")], ["literature", "philosophy", "psychology_boundary"]),
  anchor("person.tolstoy", ["托尔斯泰", "Leo Tolstoy"], "literature.russian", ["novelist"], "19th_century", [
    w("work.war_and_peace", ["战争与和平", "War and Peace"], "novel", ["concept.historical_novel", "concept.social_totality"], ["history", "family", "war"], ["history", "family", "war"]),
    w("work.anna_karenina", ["安娜·卡列尼娜", "Anna Karenina"], "novel", ["concept.realism_literature", "concept.social_norm"], ["family", "society", "desire"], ["family", "social norm", "desire"])
  ], ["concept.realism_literature", "concept.social_totality"], ["society", "history", "family"], "world_literature_extension", [S.britannica("Leo Tolstoy")], ["literature", "history", "ethics"]),
  anchor("person.chekhov", ["契诃夫", "Anton Chekhov"], "literature.russian", ["short story writer", "playwright"], "19th_20th_century", [
    w("work.cherry_orchard", ["樱桃园", "The Cherry Orchard"], "play", ["concept.transition_society", "concept.ellipsis"], ["loss", "estate", "change"], ["social transition", "loss", "compressed stage action"]),
    w("work.lady_with_little_dog", ["带小狗的女人", "The Lady with the Little Dog"], "short_story", ["concept.short_story_vs_novel", "concept.open_ending"], ["short form", "desire", "open end"], ["short form", "desire", "open ending"])
  ], ["concept.short_story_vs_novel", "concept.open_ending"], ["short_form", "subtext", "stage"], "world_literature_extension", [S.britannica("Anton Chekhov")], ["literature", "theater", "short_story"]),
  anchor("person.nabokov", ["纳博科夫", "Vladimir Nabokov"], "literature.russian_american", ["novelist"], "20th_century", [
    w("work.lolita_novel", ["洛丽塔", "Lolita"], "novel", ["concept.unreliable_narrator", "concept.ethical_distance"], ["voice", "unreliability", "ethics"], ["unreliable voice", "ethical distance", "style"]),
    w("work.pale_fire", ["微暗的火", "Pale Fire"], "novel", ["concept.annotation_form", "concept.unreliable_narrator"], ["annotation", "voice", "misreading"], ["annotation form", "misreading", "voice"])
  ], ["concept.unreliable_narrator", "concept.ethical_distance"], ["voice", "misreading", "style"], "world_literature_extension", [S.britannica("Vladimir Nabokov")], ["literature", "language", "ethics"]),
  anchor("person.flaubert", ["福楼拜", "Gustave Flaubert"], "literature.french", ["novelist"], "19th_century", [
    w("work.madame_bovary", ["包法利夫人", "Madame Bovary"], "novel", ["concept.realism_literature", "concept.free_indirect_style"], ["style", "society", "desire"], ["realist detail", "style", "desire"]),
    w("work.sentimental_education", ["情感教育", "Sentimental Education"], "novel", ["concept.realism_literature", "concept.modern_disillusion"], ["youth", "history", "disillusion"], ["youth", "history", "disillusion"])
  ], ["concept.realism_literature", "concept.free_indirect_style"], ["style", "detail", "desire"], "world_literature_extension", [S.britannica("Gustave Flaubert")], ["literature", "style", "realism"]),
  anchor("person.baudelaire", ["波德莱尔", "Charles Baudelaire"], "literature.french", ["poet", "critic"], "19th_century", [
    w("work.flowers_of_evil", ["恶之花", "Les Fleurs du mal"], "poetry_collection", ["concept.modern_city_poetry", "concept.spleen_ideal"], ["city", "beauty", "modernity"], ["modern city", "beauty", "ambivalence"]),
    w("work.painter_modern_life", ["现代生活的画家", "The Painter of Modern Life"], "essay", ["concept.modernity", "concept.flaneur"], ["modernity", "street", "observation"], ["modernity", "street observation", "figure"])
  ], ["concept.modern_city_poetry", "concept.flaneur"], ["city", "modernity", "observation"], "world_literature_extension", [S.britannica("Charles Baudelaire")], ["literature", "city", "art"]),
  anchor("person.beckett", ["贝克特", "Samuel Beckett"], "literature.european_modern", ["playwright", "novelist"], "20th_century", [
    w("work.waiting_for_godot", ["等待戈多", "Waiting for Godot"], "play", ["concept.absurdity_literature", "concept.waiting_structure"], ["waiting", "stage", "absurdity"], ["waiting", "minimal stage action", "repetition"]),
    w("work.molloy", ["莫洛伊", "Molloy"], "novel", ["concept.voice_reduction", "concept.absurdity_literature"], ["voice", "reduction", "wandering"], ["reduced voice", "wandering", "absurdity"])
  ], ["concept.absurdity_literature", "concept.waiting_structure"], ["waiting", "repetition", "minimal form"], "world_literature_extension", [S.nobel("Samuel Beckett"), S.britannica("Samuel Beckett")], ["literature", "theater", "philosophy"]),
  anchor("person.toni_morrison", ["托妮·莫里森", "Toni Morrison"], "literature.american", ["novelist"], "20th_21st_century", [
    w("work.beloved", ["宠儿", "Beloved"], "novel", ["concept.historical_trauma", "concept.memory_vs_fact"], ["memory", "history", "haunting"], ["historical trauma", "memory", "haunting"]),
    w("work.song_of_solomon", ["所罗门之歌", "Song of Solomon"], "novel", ["concept.family_memory", "concept.black_modern_literature"], ["family", "memory", "myth"], ["family memory", "myth", "identity"])
  ], ["concept.historical_trauma", "concept.memory_vs_fact"], ["memory", "history", "voice"], "world_literature_extension", [S.nobel("Toni Morrison"), S.britannica("Toni Morrison")], ["literature", "memory", "history"]),
  anchor("person.james_baldwin", ["詹姆斯·鲍德温", "James Baldwin"], "literature.american", ["writer", "essayist"], "20th_century", [
    w("work.giovannis_room", ["乔瓦尼的房间", "Giovanni's Room"], "novel", ["concept.identity_boundary", "concept.exile"], ["identity", "desire", "exile"], ["identity pressure", "desire", "exile"]),
    w("work.fire_next_time", ["下一次将是烈火", "The Fire Next Time"], "essay", ["concept.witness_testimony", "concept.public_private_boundary"], ["essay", "race", "public voice"], ["witness essay", "public voice", "moral address"])
  ], ["concept.witness_testimony", "concept.public_private_boundary"], ["essay", "witness", "identity"], "world_literature_extension", [S.britannica("James Baldwin")], ["literature", "social_thought", "public_voice"]),
  anchor("person.ursula_le_guin", ["厄休拉·勒古恩", "Ursula K. Le Guin"], "literature.speculative", ["novelist"], "20th_21st_century", [
    w("work.left_hand_darkness", ["黑暗的左手", "The Left Hand of Darkness"], "novel", ["concept.worldbuilding_ethics", "concept.gender_imagination"], ["worldbuilding", "gender", "ethics"], ["worldbuilding", "gender imagination", "ethics"]),
    w("work.dispossessed", ["一无所有", "The Dispossessed"], "novel", ["concept.utopia_ambiguity", "concept.freedom_responsibility"], ["utopia", "freedom", "society"], ["utopia ambiguity", "freedom", "social form"])
  ], ["concept.worldbuilding_ethics", "concept.freedom_responsibility"], ["worldbuilding", "ethics", "society"], "world_literature_extension", [S.britannica("Ursula K Le Guin")], ["literature", "ethics", "political_thought"]),
  anchor("person.orhan_pamuk", ["奥尔罕·帕慕克", "Orhan Pamuk"], "literature.world", ["novelist"], "20th_21st_century", [
    w("work.my_name_is_red", ["我的名字叫红", "My Name Is Red"], "novel", ["concept.image_text_relation", "concept.east_west_frame"], ["image", "voice", "tradition"], ["image and text", "voice", "tradition"]),
    w("work.snow_pamuk", ["雪", "Snow"], "novel", ["concept.public_private_boundary", "concept.political_city"], ["city", "politics", "interiority"], ["city politics", "interiority", "public private tension"])
  ], ["concept.image_text_relation", "concept.public_private_boundary"], ["image", "city", "identity"], "world_literature_extension", [S.nobel("Orhan Pamuk"), S.britannica("Orhan Pamuk")], ["literature", "image", "city"]),
  anchor("person.chinua_achebe", ["钦努阿·阿契贝", "Chinua Achebe"], "literature.world", ["novelist"], "20th_century", [
    w("work.things_fall_apart", ["瓦解", "Things Fall Apart"], "novel", ["concept.colonial_discourse_boundary", "concept.witness_testimony"], ["colonial encounter", "social order", "voice"], ["colonial encounter", "social order", "voice"]),
    w("work.arrow_of_god", ["神箭", "Arrow of God"], "novel", ["concept.tradition_change", "concept.colonial_discourse_boundary"], ["tradition", "change", "authority"], ["tradition", "change", "authority"])
  ], ["concept.colonial_discourse_boundary", "concept.tradition_change"], ["voice", "colonial encounter", "authority"], "world_literature_extension", [S.britannica("Chinua Achebe")], ["literature", "history", "postcolonial_memory"]),
  anchor("person.salman_rushdie", ["萨尔曼·鲁西迪", "Salman Rushdie"], "literature.world", ["novelist"], "20th_21st_century", [
    w("work.midnights_children", ["午夜之子", "Midnight's Children"], "novel", ["concept.postcolonial_memory", "concept.magical_realism"], ["nation", "memory", "myth"], ["postcolonial memory", "mythic narration", "nation"]),
    w("work.shame_rushdie", ["羞耻", "Shame"], "novel", ["concept.political_allegory", "concept.public_private_boundary"], ["allegory", "politics", "family"], ["political allegory", "family", "shame"])
  ], ["concept.postcolonial_memory", "concept.political_allegory"], ["nation", "memory", "allegory"], "world_literature_extension", [S.britannica("Salman Rushdie")], ["literature", "history", "political_thought"]),
  anchor("person.ngugi_wa_thiongo", ["恩古吉·瓦·提安哥", "Ngugi wa Thiongo"], "literature.world", ["novelist", "theorist"], "20th_21st_century", [
    w("work.decolonising_the_mind", ["去殖民化心灵", "Decolonising the Mind"], "theory_text", ["concept.language_power", "concept.colonial_discourse_boundary"], ["language", "power", "education"], ["language power", "education", "culture"]),
    w("work.river_between", ["河流之间", "The River Between"], "novel", ["concept.tradition_change", "concept.postcolonial_memory"], ["tradition", "education", "change"], ["tradition", "education", "change"])
  ], ["concept.language_power", "concept.postcolonial_memory"], ["language", "education", "power"], "world_literature_extension", [S.britannica("Ngugi wa Thiongo")], ["literature", "education", "language"]),
  anchor("person.albert_camus", ["阿尔贝·加缪", "Albert Camus"], "literature.european_modern", ["writer", "philosopher"], "20th_century", [
    w("work.stranger_camus", ["局外人", "The Stranger"], "novel", ["concept.absurdity_literature", "concept.moral_distance"], ["absurdity", "judgment", "distance"], ["absurdity", "social judgment", "distance"]),
    w("work.plague_camus", ["鼠疫", "The Plague"], "novel", ["concept.collective_crisis", "concept.responsibility"], ["crisis", "responsibility", "community"], ["collective crisis", "responsibility", "community"])
  ], ["concept.absurdity_literature", "concept.responsibility"], ["absurdity", "responsibility", "judgment"], "world_literature_extension", [S.nobel("Albert Camus"), S.britannica("Albert Camus")], ["literature", "philosophy", "ethics"]),
  anchor("person.italo_calvino", ["伊塔洛·卡尔维诺", "Italo Calvino"], "literature.european_modern", ["novelist"], "20th_century", [
    w("work.invisible_cities", ["看不见的城市", "Invisible Cities"], "novel", ["concept.city_imagination", "concept.fragmented_form"], ["city", "memory", "form"], ["imagined city", "memory", "fragment"]),
    w("work.if_on_winter_night", ["如果在冬夜，一个旅人", "If on a winter's night a traveler"], "novel", ["concept.reader_path", "concept.metafiction"], ["reader", "structure", "interruption"], ["reader path", "structure", "interruption"])
  ], ["concept.city_imagination", "concept.reader_path"], ["city", "form", "reader"], "world_literature_extension", [S.britannica("Italo Calvino")], ["literature", "city", "form"]),

  anchor("person.fellini", ["费里尼", "Federico Fellini"], "film.world", ["film director"], "20th_century", [
    w("work.eight_and_half", ["八部半", "8 1/2"], "film", ["concept.modernist_cinema", "concept.memory_film"], ["self_reflexive", "memory", "spectacle"], ["self reflexive form", "memory", "spectacle"]),
    w("work.la_dolce_vita", ["甜蜜的生活", "La Dolce Vita"], "film", ["concept.city_film", "concept.modernist_cinema"], ["city", "media", "modernity"], ["urban spectacle", "media", "modernity"])
  ], ["concept.modernist_cinema", "concept.memory_film"], ["memory", "spectacle", "city"], "global_cinema_extension", [S.bfi("Federico Fellini"), S.britannica("Federico Fellini")], ["film", "modernism", "city"]),
  anchor("person.bergman", ["伯格曼", "Ingmar Bergman"], "film.world", ["film director"], "20th_century", [
    w("work.persona_film", ["假面", "Persona"], "film", ["concept.identity_boundary", "concept.close_up_face"], ["face", "identity", "doubling"], ["face", "identity boundary", "doubling"]),
    w("work.seventh_seal", ["第七封印", "The Seventh Seal"], "film", ["concept.allegory", "concept.moral_conflict"], ["allegory", "faith", "death"], ["allegory", "faith", "mortality"])
  ], ["concept.identity_boundary", "concept.close_up_face"], ["face", "interiority", "allegory"], "global_cinema_extension", [S.bfi("Ingmar Bergman"), S.britannica("Ingmar Bergman")], ["film", "theater", "philosophy"]),
  anchor("person.tarkovsky", ["塔可夫斯基", "Andrei Tarkovsky"], "film.world", ["film director"], "20th_century", [
    w("work.stalker", ["潜行者", "Stalker"], "film", ["concept.long_take", "concept.spiritual_landscape"], ["duration", "landscape", "belief"], ["duration", "zone", "belief"]),
    w("work.mirror_tarkovsky", ["镜子", "Mirror"], "film", ["concept.memory_film", "concept.ellipsis"], ["memory", "fragment", "image"], ["memory", "fragment", "image"])
  ], ["concept.long_take", "concept.memory_film"], ["duration", "memory", "landscape"], "global_cinema_extension", [S.bfi("Andrei Tarkovsky"), S.britannica("Andrei Tarkovsky")], ["film", "memory", "image"]),
  anchor("person.godard", ["戈达尔", "Jean-Luc Godard"], "film.world", ["film director"], "20th_21st_century", [
    w("work.breathless", ["精疲力尽", "Breathless"], "film", ["concept.modernist_cinema", "concept.jump_cut"], ["editing", "modernity", "citation"], ["editing break", "modernist cinema", "citation"]),
    w("work.contempt_film", ["蔑视", "Contempt"], "film", ["concept.image_text_relation", "concept.auteur"], ["cinema", "adaptation", "production"], ["cinema self reflection", "adaptation", "production"])
  ], ["concept.modernist_cinema", "concept.jump_cut"], ["editing", "citation", "modernism"], "global_cinema_extension", [S.bfi("Jean-Luc Godard"), S.britannica("Jean-Luc Godard")], ["film", "modernism", "language"]),
  anchor("person.agnes_varda", ["阿涅斯·瓦尔达", "Agnes Varda"], "film.world", ["film director"], "20th_21st_century", [
    w("work.cleo_from_5_to_7", ["五至七时的克莱奥", "Cleo from 5 to 7"], "film", ["concept.everyday_time", "concept.city_film"], ["time", "city", "self"], ["real time frame", "city", "self image"]),
    w("work.gleaners_and_i", ["拾穗者", "The Gleaners and I"], "film", ["concept.documentary_fiction_boundary", "concept.everyday_object"], ["documentary", "object", "self"], ["documentary essay", "objects", "self"])
  ], ["concept.everyday_time", "concept.documentary_fiction_boundary"], ["everyday", "city", "documentary"], "global_cinema_extension", [S.bfi("Agnes Varda"), S.britannica("Agnes Varda")], ["film", "documentary", "everyday_life"]),
  anchor("person.chantal_akerman", ["香特尔·阿克曼", "Chantal Akerman"], "film.world", ["film director"], "20th_21st_century", [
    w("work.jeanne_dielman", ["让娜·迪尔曼", "Jeanne Dielman"], "film", ["concept.domestic_space_film", "concept.duration"], ["duration", "domestic space", "routine"], ["domestic routine", "duration", "attention"]),
    w("work.news_from_home", ["家乡来信", "News from Home"], "film", ["concept.city_film", "concept.voice_image_gap"], ["city", "voice", "distance"], ["city image", "voice distance", "letters"])
  ], ["concept.domestic_space_film", "concept.duration"], ["duration", "domestic_space", "voice"], "global_cinema_extension", [S.bfi("Chantal Akerman")], ["film", "feminist_form", "city"]),
  anchor("person.antonioni", ["安东尼奥尼", "Michelangelo Antonioni"], "film.world", ["film director"], "20th_century", [
    w("work.l_avventura", ["奇遇", "L'Avventura"], "film", ["concept.modernist_cinema", "concept.ellipsis"], ["absence", "space", "modernity"], ["absence", "space", "ellipsis"]),
    w("work.blow_up_film", ["放大", "Blow-Up"], "film", ["concept.photographic_uncertainty", "concept.image_not_evidence"], ["image", "uncertainty", "modernity"], ["photographic uncertainty", "image", "evidence boundary"])
  ], ["concept.ellipsis", "concept.photographic_uncertainty"], ["absence", "image", "modernity"], "global_cinema_extension", [S.bfi("Michelangelo Antonioni"), S.britannica("Michelangelo Antonioni")], ["film", "photography", "modernism"]),
  anchor("person.bresson", ["布列松", "Robert Bresson"], "film.world", ["film director"], "20th_century", [
    w("work.pickpocket", ["扒手", "Pickpocket"], "film", ["concept.restrained_performance", "concept.hand_detail"], ["gesture", "restraint", "sound"], ["gesture", "restraint", "sound"]),
    w("work.au_hasard_balthazar", ["驴子巴特萨", "Au Hasard Balthazar"], "film", ["concept.restrained_performance", "concept.moral_distance"], ["restraint", "suffering", "distance"], ["restraint", "suffering", "moral distance"])
  ], ["concept.restrained_performance", "concept.moral_distance"], ["gesture", "restraint", "ethics"], "global_cinema_extension", [S.bfi("Robert Bresson"), S.britannica("Robert Bresson")], ["film", "ethics", "performance"]),
  anchor("person.hitchcock", ["希区柯克", "Alfred Hitchcock"], "film.world", ["film director"], "20th_century", [
    w("work.vertigo", ["迷魂记", "Vertigo"], "film", ["concept.spectatorship", "concept.gaze_image"], ["look", "obsession", "identity"], ["looking relation", "obsession", "identity"]),
    w("work.rear_window", ["后窗", "Rear Window"], "film", ["concept.spectatorship", "concept.framing"], ["viewing", "window", "ethics"], ["window view", "spectatorship", "ethics"])
  ], ["concept.spectatorship", "concept.gaze_image"], ["suspense", "viewing", "frame"], "global_cinema_extension", [S.bfi("Alfred Hitchcock"), S.britannica("Alfred Hitchcock")], ["film", "image", "ethics"]),
  anchor("person.kubrick", ["库布里克", "Stanley Kubrick"], "film.world", ["film director"], "20th_century", [
    w("work.two_thousand_one_space_odyssey", ["2001太空漫游", "2001: A Space Odyssey"], "film", ["concept.science_fiction_cinema", "concept.model_vs_reality"], ["space", "technology", "evolution"], ["space", "technology", "human scale"]),
    w("work.dr_strangelove", ["奇爱博士", "Dr. Strangelove"], "film", ["concept.satire", "concept.technology_power"], ["satire", "war", "system"], ["satire", "system risk", "technology power"])
  ], ["concept.science_fiction_cinema", "concept.technology_power"], ["system", "image", "control"], "global_cinema_extension", [S.bfi("Stanley Kubrick"), S.britannica("Stanley Kubrick")], ["film", "technology", "satire"]),
  anchor("person.abbas_kiarostami", ["阿巴斯·基亚罗斯塔米", "Abbas Kiarostami"], "film.world", ["film director"], "20th_21st_century", [
    w("work.close_up_kiarostami", ["特写", "Close-Up"], "film", ["concept.documentary_fiction_boundary", "concept.testimony"], ["documentary", "fiction", "identity"], ["documentary fiction boundary", "testimony", "identity"]),
    w("work.taste_of_cherry", ["樱桃的滋味", "Taste of Cherry"], "film", ["concept.ellipsis", "concept.moral_distance"], ["ellipsis", "choice", "distance"], ["ellipsis", "choice", "moral distance"])
  ], ["concept.documentary_fiction_boundary", "concept.testimony"], ["documentary", "fiction", "testimony"], "global_cinema_extension", [S.bfi("Abbas Kiarostami"), S.britannica("Abbas Kiarostami")], ["film", "documentary", "ethics"]),
  anchor("person.satyajit_ray", ["萨蒂亚吉特·雷伊", "Satyajit Ray"], "film.world", ["film director"], "20th_century", [
    w("work.pather_panchali", ["大地之歌", "Pather Panchali"], "film", ["concept.realism_cinema", "concept.family_memory"], ["family", "realism", "rural life"], ["family", "realism", "rural life"]),
    w("work.apu_trilogy", ["阿普三部曲", "Apu Trilogy"], "film_cycle", ["concept.realism_cinema", "concept.growth_narrative"], ["growth", "family", "time"], ["growth", "family", "time"])
  ], ["concept.realism_cinema", "concept.family_memory"], ["realism", "family", "time"], "global_cinema_extension", [S.bfi("Satyajit Ray"), S.britannica("Satyajit Ray")], ["film", "realism", "family"]),
  anchor("person.zhang_yimou", ["张艺谋", "Zhang Yimou"], "film.chinese", ["film director"], "20th_21st_century", [
    w("work.raise_red_lantern", ["大红灯笼高高挂", "Raise the Red Lantern"], "film", ["concept.domestic_space_film", "concept.power_ritual"], ["space", "ritual", "power"], ["domestic space", "ritual", "power"]),
    w("work.red_sorghum_film", ["红高粱", "Red Sorghum film"], "film", ["concept.history_body", "concept.rural_memory"], ["history", "body", "rural"], ["history", "body", "rural memory"])
  ], ["concept.domestic_space_film", "concept.power_ritual"], ["color", "ritual", "history"], "global_cinema_extension", [S.bfi("Zhang Yimou"), S.britannica("Zhang Yimou")], ["film", "Chinese_literature", "history"]),
  anchor("person.chen_kaige", ["陈凯歌", "Chen Kaige"], "film.chinese", ["film director"], "20th_21st_century", [
    w("work.farewell_my_concubine", ["霸王别姬", "Farewell My Concubine"], "film", ["concept.performance_identity", "concept.historical_trauma"], ["performance", "history", "identity"], ["performance", "history", "identity"]),
    w("work.yellow_earth", ["黄土地", "Yellow Earth"], "film", ["concept.landscape_history", "concept.folk_public_memory"], ["landscape", "song", "history"], ["landscape", "song", "public memory"])
  ], ["concept.performance_identity", "concept.historical_trauma"], ["performance", "history", "landscape"], "global_cinema_extension", [S.bfi("Chen Kaige"), S.britannica("Chen Kaige")], ["film", "performance", "history"]),
  anchor("person.ang_lee", ["李安", "Ang Lee"], "film.global", ["film director"], "20th_21st_century", [
    w("work.crouching_tiger_hidden_dragon", ["卧虎藏龙", "Crouching Tiger Hidden Dragon"], "film", ["concept.genre_transformation", "concept.body_movement"], ["genre", "body", "ethics"], ["genre transformation", "body movement", "ethics"]),
    w("work.eat_drink_man_woman", ["饮食男女", "Eat Drink Man Woman"], "film", ["concept.food_family_memory", "concept.domestic_space_film"], ["food", "family", "ritual"], ["food ritual", "family", "domestic space"])
  ], ["concept.genre_transformation", "concept.food_family_memory"], ["genre", "family", "body"], "global_cinema_extension", [S.bfi("Ang Lee"), S.britannica("Ang Lee")], ["film", "food", "family"]),
  anchor("person.jane_campion", ["简·坎皮恩", "Jane Campion"], "film.world", ["film director"], "20th_21st_century", [
    w("work.the_piano", ["钢琴课", "The Piano"], "film", ["concept.voice_silence", "concept.landscape_body"], ["voice", "silence", "landscape"], ["voice and silence", "landscape", "body"]),
    w("work.power_of_dog", ["犬之力", "The Power of the Dog"], "film", ["concept.masculinity_performance", "concept.repressed_desire"], ["performance", "desire", "space"], ["performance", "desire", "landscape"])
  ], ["concept.voice_silence", "concept.landscape_body"], ["landscape", "voice", "performance"], "global_cinema_extension", [S.bfi("Jane Campion"), S.britannica("Jane Campion")], ["film", "gender", "landscape"]),
  anchor("person.pedro_almodovar", ["阿莫多瓦", "Pedro Almodovar"], "film.world", ["film director"], "20th_21st_century", [
    w("work.all_about_my_mother", ["关于我母亲的一切", "All About My Mother"], "film", ["concept.melodrama_form", "concept.performance_identity"], ["melodrama", "identity", "performance"], ["melodrama", "performance", "identity"]),
    w("work.talk_to_her", ["对她说", "Talk to Her"], "film", ["concept.care_boundary", "concept.melodrama_form"], ["care", "voice", "boundary"], ["care boundary", "voice", "melodrama"])
  ], ["concept.melodrama_form", "concept.performance_identity"], ["melodrama", "identity", "care"], "global_cinema_extension", [S.bfi("Pedro Almodovar"), S.britannica("Pedro Almodovar")], ["film", "performance", "care_boundary"]),

  anchor("person.bob_dylan", ["鲍勃·迪伦", "Bob Dylan"], "music.global", ["singer-songwriter"], "20th_21st_century", [
    w("work.highway_61_revisited", ["重访61号公路", "Highway 61 Revisited"], "album", ["concept.folk_revival", "concept.rock_public_voice"], ["songwriting", "folk", "public voice"], ["songwriting", "folk rock", "public voice"]),
    w("work.blood_on_tracks", ["血痕", "Blood on the Tracks"], "album", ["concept.album_as_form", "concept.voice_persona"], ["album", "memory", "voice"], ["album form", "memory", "voice persona"])
  ], ["concept.folk_revival", "concept.rock_public_voice"], ["songwriting", "voice", "public_memory"], "global_music_culture", [S.nobel("Bob Dylan"), S.britannica("Bob Dylan")], ["music", "poetry", "public_memory"]),
  anchor("person.the_beatles", ["披头士", "The Beatles"], "music.global", ["band"], "20th_century", [
    w("work.sgt_pepper", ["佩珀军士", "Sgt. Pepper's Lonely Hearts Club Band"], "album", ["concept.album_as_form", "concept.studio_experiment"], ["album", "studio", "persona"], ["album form", "studio experiment", "persona"]),
    w("work.abbey_road", ["艾比路", "Abbey Road"], "album", ["concept.album_sequence", "concept.band_sound"], ["sequence", "band", "studio"], ["album sequence", "band sound", "studio"])
  ], ["concept.album_as_form", "concept.studio_experiment"], ["album", "studio", "band"], "global_music_culture", [S.britannica("The Beatles")], ["music", "technology", "album_form"]),
  anchor("person.david_bowie", ["大卫·鲍伊", "David Bowie"], "music.global", ["musician"], "20th_21st_century", [
    w("work.ziggy_stardust", ["齐吉星尘", "Ziggy Stardust"], "album", ["concept.voice_persona", "concept.performance_identity"], ["persona", "rock", "performance"], ["persona", "rock theater", "performance"]),
    w("work.low_album", ["Low", "Low"], "album", ["concept.electronic_music_repetition", "concept.album_as_form"], ["electronic", "fragment", "studio"], ["electronic texture", "fragment", "studio"])
  ], ["concept.voice_persona", "concept.performance_identity"], ["persona", "performance", "studio"], "global_music_culture", [S.britannica("David Bowie")], ["music", "performance", "art"]),
  anchor("person.joni_mitchell", ["琼尼·米切尔", "Joni Mitchell"], "music.global", ["singer-songwriter"], "20th_21st_century", [
    w("work.blue_joni_mitchell", ["Blue", "Blue"], "album", ["concept.singer_songwriter", "concept.intimacy_performance"], ["voice", "songwriting", "intimacy"], ["voice", "songwriting", "intimacy"]),
    w("work.hejira", ["Hejira", "Hejira"], "album", ["concept.travel_memory", "concept.album_as_form"], ["travel", "memory", "arrangement"], ["travel memory", "arrangement", "album form"])
  ], ["concept.singer_songwriter", "concept.intimacy_performance"], ["voice", "songwriting", "memory"], "global_music_culture", [S.britannica("Joni Mitchell")], ["music", "poetry", "memory"]),
  anchor("person.leonard_cohen", ["莱昂纳德·科恩", "Leonard Cohen"], "music.global", ["singer-songwriter", "poet"], "20th_21st_century", [
    w("work.songs_of_leonard_cohen", ["莱昂纳德·科恩之歌", "Songs of Leonard Cohen"], "album", ["concept.song_poem_boundary", "concept.voice_persona"], ["song", "poem", "voice"], ["song poem boundary", "voice", "minimal arrangement"]),
    w("work.various_positions", ["各种位置", "Various Positions"], "album", ["concept.spiritual_song", "concept.arrangement"], ["spiritual", "arrangement", "voice"], ["spiritual song", "arrangement", "voice"])
  ], ["concept.song_poem_boundary", "concept.voice_persona"], ["song", "poem", "voice"], "global_music_culture", [S.britannica("Leonard Cohen")], ["music", "poetry", "religion_culture"]),
  anchor("person.nina_simone", ["妮娜·西蒙", "Nina Simone"], "music.global", ["singer", "pianist"], "20th_century", [
    w("work.pastel_blues", ["Pastel Blues", "Pastel Blues"], "album", ["concept.voice_persona", "concept.blues"], ["voice", "blues", "piano"], ["voice persona", "blues", "piano"]),
    w("work.nina_simone_in_concert", ["Nina Simone in Concert", "Nina Simone in Concert"], "album", ["concept.public_voice_music", "concept.performance_context"], ["live", "public voice", "performance"], ["live performance", "public voice", "context"])
  ], ["concept.voice_persona", "concept.public_voice_music"], ["voice", "piano", "public_memory"], "global_music_culture", [S.britannica("Nina Simone")], ["music", "public_memory", "performance"]),
  anchor("person.miles_davis", ["迈尔斯·戴维斯", "Miles Davis"], "music.global", ["trumpeter", "bandleader"], "20th_century", [
    w("work.kind_of_blue", ["Kind of Blue", "Kind of Blue"], "album", ["concept.jazz", "concept.improvisation"], ["jazz", "improvisation", "ensemble"], ["modal jazz", "improvisation", "ensemble"]),
    w("work.bitches_brew", ["Bitches Brew", "Bitches Brew"], "album", ["concept.jazz_fusion", "concept.electronic_music_repetition"], ["fusion", "studio", "rhythm"], ["jazz fusion", "studio texture", "rhythm"])
  ], ["concept.jazz", "concept.improvisation"], ["improvisation", "ensemble", "tone"], "global_music_culture", [S.britannica("Miles Davis")], ["music", "improvisation", "technology"]),
  anchor("person.billie_holiday", ["比莉·哈乐黛", "Billie Holiday"], "music.global", ["singer"], "20th_century", [
    w("work.lady_in_satin", ["Lady in Satin", "Lady in Satin"], "album", ["concept.voice_persona", "concept.arrangement"], ["voice", "arrangement", "late style"], ["voice persona", "arrangement", "late style"]),
    w("work.strange_fruit_song", ["奇异的果实", "Strange Fruit"], "song", ["concept.public_voice_music", "concept.song_copyright_boundary"], ["song", "public memory", "boundary"], ["song as public memory", "performance context", "copyright boundary"])
  ], ["concept.voice_persona", "concept.public_voice_music"], ["voice", "performance", "public_memory"], "global_music_culture", [S.britannica("Billie Holiday")], ["music", "public_memory", "care_boundary"]),
  anchor("person.louis_armstrong", ["路易斯·阿姆斯特朗", "Louis Armstrong"], "music.global", ["trumpeter", "singer"], "20th_century", [
    w("work.hot_fives_sevens", ["Hot Fives and Sevens", "Hot Fives and Sevens"], "recording_group", ["concept.jazz", "concept.improvisation"], ["jazz", "solo", "ensemble"], ["jazz solo", "ensemble", "improvisation"]),
    w("work.what_a_wonderful_world", ["What a Wonderful World", "What a Wonderful World"], "song", ["concept.voice_persona", "concept.song_copyright_boundary"], ["voice", "song", "public memory"], ["voice persona", "song circulation", "copyright boundary"])
  ], ["concept.jazz", "concept.voice_persona"], ["jazz", "voice", "improvisation"], "global_music_culture", [S.britannica("Louis Armstrong")], ["music", "jazz", "performance"]),
  anchor("person.kraftwerk", ["发电站乐队", "Kraftwerk"], "music.global", ["band"], "20th_21st_century", [
    w("work.autobahn_album", ["Autobahn", "Autobahn"], "album", ["concept.electronic_music_repetition", "concept.technology_rhythm"], ["electronic", "repetition", "machine"], ["electronic repetition", "machine rhythm", "travel"]),
    w("work.trans_europe_express", ["Trans-Europe Express", "Trans-Europe Express"], "album", ["concept.electronic_music_repetition", "concept.protocol_rhythm"], ["electronic", "network", "rhythm"], ["electronic rhythm", "network image", "repetition"])
  ], ["concept.electronic_music_repetition", "concept.technology_rhythm"], ["technology", "repetition", "rhythm"], "global_music_culture", [S.britannica("Kraftwerk")], ["music", "technology", "design"]),
  anchor("person.bjork", ["比约克", "Bjork"], "music.global", ["musician"], "20th_21st_century", [
    w("work.homogenic", ["Homogenic", "Homogenic"], "album", ["concept.electronic_music_repetition", "concept.voice_persona"], ["voice", "electronic", "landscape"], ["voice", "electronic texture", "landscape"]),
    w("work.vespertine", ["Vespertine", "Vespertine"], "album", ["concept.intimacy_performance", "concept.texture_music"], ["intimacy", "texture", "voice"], ["intimacy", "texture", "voice"])
  ], ["concept.electronic_music_repetition", "concept.texture_music"], ["voice", "texture", "technology"], "global_music_culture", [S.britannica("Bjork")], ["music", "technology", "voice"]),
  anchor("person.radiohead", ["电台司令", "Radiohead"], "music.global", ["band"], "20th_21st_century", [
    w("work.ok_computer", ["OK Computer", "OK Computer"], "album", ["concept.album_as_form", "concept.technology_anxiety"], ["album", "technology", "alienation"], ["album form", "technology anxiety", "alienation"]),
    w("work.kid_a", ["Kid A", "Kid A"], "album", ["concept.electronic_music_repetition", "concept.fragmented_form"], ["electronic", "fragment", "voice"], ["electronic repetition", "fragment", "voice"])
  ], ["concept.album_as_form", "concept.technology_anxiety"], ["album", "technology", "alienation"], "global_music_culture", [S.britannica("Radiohead")], ["music", "technology", "culture"]),
  anchor("person.leslie_cheung", ["张国荣", "Leslie Cheung"], "music.chinese", ["singer", "actor"], "20th_century", [
    w("work.monica_song", ["Monica", "Monica"], "song", ["concept.cantopop", "concept.performance_identity"], ["cantopop", "performance", "persona"], ["Cantopop", "performance persona", "song circulation"]),
    w("work.red_cheung_album", ["红", "Red"], "album", ["concept.voice_persona", "concept.album_as_form"], ["album", "persona", "performance"], ["album form", "persona", "performance"])
  ], ["concept.cantopop", "concept.performance_identity"], ["voice", "performance", "persona"], "global_music_culture", [S.britannica("Leslie Cheung")], ["music", "film", "performance"]),
  anchor("person.anita_mui", ["梅艳芳", "Anita Mui"], "music.chinese", ["singer", "actor"], "20th_century", [
    w("work.bad_girl_anita_mui", ["坏女孩", "Bad Girl"], "album", ["concept.cantopop", "concept.performance_identity"], ["performance", "voice", "persona"], ["performance persona", "Cantopop", "voice"]),
    w("work.anita_mui_farewell_concert", ["告别演唱会", "Anita Mui farewell concert"], "performance", ["concept.performance_context", "concept.public_memory"], ["concert", "public memory", "persona"], ["performance context", "public memory", "persona"])
  ], ["concept.cantopop", "concept.performance_identity"], ["performance", "voice", "public_memory"], "global_music_culture", [S.britannica("Anita Mui")], ["music", "performance", "public_memory"]),

  anchor("person.rene_magritte", ["马格利特", "Rene Magritte"], "art_image_design", ["artist"], "20th_century", [
    w("work.treachery_of_images", ["图像的背叛", "The Treachery of Images"], "painting", ["concept.representation_image", "concept.naming_reference_distinction"], ["image", "text", "reference"], ["image text relation", "reference", "representation"]),
    w("work.son_of_man", ["人子", "The Son of Man"], "painting", ["concept.representation_image", "concept.visibility_hidden"], ["image", "face", "concealment"], ["visibility", "concealment", "representation"])
  ], ["concept.representation_image", "concept.naming_reference_distinction"], ["image", "text", "reference"], "art_design_image_deepening", [S.moma("Rene Magritte"), S.britannica("Rene Magritte")], ["art", "language", "image"]),
  anchor("person.matisse", ["马蒂斯", "Henri Matisse"], "art_image_design", ["artist"], "20th_century", [
    w("work.red_studio", ["红色画室", "The Red Studio"], "painting", ["concept.color_field_space", "concept.abstraction_visual"], ["color", "space", "studio"], ["color space", "studio", "abstraction"]),
    w("work.snail_matisse", ["蜗牛", "The Snail"], "collage", ["concept.materiality", "concept.cutout_form"], ["color", "cutout", "material"], ["cutout form", "material", "color"])
  ], ["concept.abstraction_visual", "concept.materiality"], ["color", "space", "material"], "art_design_image_deepening", [S.moma("Henri Matisse"), S.britannica("Henri Matisse")], ["art", "design", "color"]),
  anchor("person.cezanne", ["塞尚", "Paul Cezanne"], "art_image_design", ["artist"], "19th_20th_century", [
    w("work.mont_sainte_victoire", ["圣维克多山", "Mont Sainte-Victoire"], "painting_series", ["concept.form_observation", "concept.abstraction_visual"], ["form", "landscape", "observation"], ["form", "landscape", "observation"]),
    w("work.card_players", ["玩牌者", "The Card Players"], "painting", ["concept.form_observation", "concept.composition"], ["form", "figure", "composition"], ["form", "figure", "composition"])
  ], ["concept.form_observation", "concept.abstraction_visual"], ["form", "observation", "composition"], "art_design_image_deepening", [S.moma("Paul Cezanne"), S.britannica("Paul Cezanne")], ["art", "observation", "modernism"]),
  anchor("person.rothko", ["罗斯科", "Mark Rothko"], "art_image_design", ["artist"], "20th_century", [
    w("work.rothko_chapel", ["罗斯科教堂", "Rothko Chapel paintings"], "painting_group", ["concept.color_field_space", "concept.abstract_affect"], ["color", "space", "affect"], ["color field", "space", "abstract affect"]),
    w("work.orange_red_yellow", ["橙红黄", "Orange Red Yellow"], "painting", ["concept.color_field_space", "concept.abstraction_visual"], ["color", "scale", "field"], ["color field", "scale", "abstract space"])
  ], ["concept.color_field_space", "concept.abstract_affect"], ["color", "field", "affect"], "art_design_image_deepening", [S.moma("Mark Rothko"), S.britannica("Mark Rothko")], ["art", "image", "affect"]),
  anchor("person.louise_bourgeois", ["路易丝·布尔乔亚", "Louise Bourgeois"], "art_image_design", ["artist"], "20th_21st_century", [
    w("work.maman_bourgeois", ["妈妈", "Maman"], "sculpture", ["concept.memory_object", "concept.body_space"], ["memory", "object", "body"], ["memory object", "scale", "body space"]),
    w("work.cells_bourgeois", ["细胞", "Cells"], "installation_series", ["concept.installation_art", "concept.memory_object"], ["installation", "memory", "space"], ["installation", "memory", "space"])
  ], ["concept.installation_art", "concept.memory_object"], ["memory", "body", "space"], "art_design_image_deepening", [S.moma("Louise Bourgeois"), S.tate("Louise Bourgeois")], ["art", "memory", "space"]),
  anchor("person.barbara_kruger", ["芭芭拉·克鲁格", "Barbara Kruger"], "art_image_design", ["artist"], "20th_21st_century", [
    w("work.untitled_your_body_battleground", ["你的身体是战场", "Untitled Your body is a battleground"], "image_text_work", ["concept.image_text_relation", "concept.visual_rhetoric"], ["image", "text", "public address"], ["image text relation", "public address", "visual rhetoric"]),
    w("work.kruger_belief_doubt", ["信念与怀疑", "Belief+Doubt"], "installation", ["concept.installation_art", "concept.visual_rhetoric"], ["text", "space", "public"], ["text in space", "public address", "installation"])
  ], ["concept.image_text_relation", "concept.visual_rhetoric"], ["image", "text", "public_address"], "art_design_image_deepening", [S.moma("Barbara Kruger"), S.tate("Barbara Kruger")], ["art", "design", "language"]),
  anchor("person.cindy_sherman", ["辛迪·舍曼", "Cindy Sherman"], "art_image_design", ["artist"], "20th_21st_century", [
    w("work.untitled_film_stills", ["无题电影剧照", "Untitled Film Stills"], "photography_series", ["concept.performance_identity", "concept.gaze_image"], ["photography", "persona", "film"], ["photographic persona", "film reference", "gaze"]),
    w("work.history_portraits", ["历史肖像", "History Portraits"], "photography_series", ["concept.representation_image", "concept.performance_identity"], ["portrait", "persona", "history"], ["portrait", "persona", "art history"])
  ], ["concept.performance_identity", "concept.gaze_image"], ["photography", "persona", "representation"], "art_design_image_deepening", [S.moma("Cindy Sherman"), S.tate("Cindy Sherman")], ["photography", "film", "identity"]),
  anchor("person.sol_lewitt", ["索尔·勒维特", "Sol LeWitt"], "art_image_design", ["artist"], "20th_21st_century", [
    w("work.sentences_on_conceptual_art", ["关于观念艺术的句子", "Sentences on Conceptual Art"], "essay", ["concept.conceptual_art", "concept.idea_execution"], ["concept", "instruction", "execution"], ["conceptual art", "instruction", "execution"]),
    w("work.wall_drawings", ["墙绘", "Wall Drawings"], "work_series", ["concept.idea_execution", "concept.instruction_art"], ["instruction", "wall", "system"], ["instruction art", "wall", "system"])
  ], ["concept.conceptual_art", "concept.idea_execution"], ["concept", "instruction", "system"], "art_design_image_deepening", [S.moma("Sol LeWitt"), S.tate("Sol LeWitt")], ["art", "language", "system"]),
  anchor("person.nam_june_paik", ["白南准", "Nam June Paik"], "art_image_design", ["artist"], "20th_21st_century", [
    w("work.tv_buddha", ["电视佛", "TV Buddha"], "video_installation", ["concept.media_art", "concept.feedback_loop"], ["video", "feedback", "image"], ["video feedback", "image", "technology"]),
    w("work.electronic_superhighway", ["电子高速公路", "Electronic Superhighway"], "installation", ["concept.media_art", "concept.technology_image"], ["media", "network", "image"], ["media art", "network", "image"])
  ], ["concept.media_art", "concept.feedback_loop"], ["media", "technology", "image"], "art_design_image_deepening", [S.moma("Nam June Paik"), S.britannica("Nam June Paik")], ["art", "technology", "image"]),
  anchor("person.donald_norman", ["唐纳德·诺曼", "Donald Norman"], "design_interface", ["design theorist"], "20th_21st_century", [
    w("work.design_of_everyday_things", ["日常物品设计", "The Design of Everyday Things"], "design_text", ["concept.affordance_design", "concept.usability"], ["affordance", "use", "design"], ["affordance", "use", "feedback"]),
    w("work.emotional_design", ["情感化设计", "Emotional Design"], "design_text", ["concept.interface", "concept.emotional_design"], ["design", "emotion", "use"], ["design", "emotion", "use"])
  ], ["concept.affordance_design", "concept.usability"], ["use", "feedback", "interface"], "art_design_image_deepening", [S.official("Nielsen Norman Group:Donald Norman", "https://www.nngroup.com/people/don-norman/")], ["design", "technology", "education"]),

  anchor("person.walter_benjamin", ["本雅明", "Walter Benjamin"], "philosophy_language_social_thought", ["critic", "philosopher"], "20th_century", [
    w("work.work_art_mechanical_reproduction", ["机械复制时代的艺术作品", "The Work of Art in the Age of Mechanical Reproduction"], "essay", ["concept.aura_reproduction", "concept.media_technology"], ["reproduction", "aura", "media"], ["reproduction", "aura", "media technology"]),
    w("work.task_of_translator", ["译者的任务", "The Task of the Translator"], "essay", ["concept.translation_equivalence_boundary", "concept.language_afterlife"], ["translation", "language", "afterlife"], ["translation boundary", "language", "afterlife"])
  ], ["concept.aura_reproduction", "concept.translation_equivalence_boundary"], ["media", "translation", "history"], "philosophy_language_social_thought", [S.britannica("Walter Benjamin")], ["philosophy", "media", "translation"]),
  anchor("person.kripke", ["克里普克", "Saul Kripke"], "philosophy_language", ["philosopher"], "20th_21st_century", [
    w("work.naming_and_necessity", ["命名与必然性", "Naming and Necessity"], "philosophy_text", ["concept.naming_reference_distinction", "concept.modal_reasoning"], ["naming", "reference", "necessity"], ["naming", "reference", "necessity"]),
    w("work.wittgenstein_on_rules", ["维特根斯坦论规则", "Wittgenstein on Rules and Private Language"], "philosophy_text", ["concept.rule_following", "concept.meaning_as_use"], ["rule", "meaning", "language"], ["rule following", "meaning", "language"])
  ], ["concept.naming_reference_distinction", "concept.modal_reasoning"], ["naming", "reference", "rule"], "philosophy_language_social_thought", [S.sep("rigid-designators"), S.britannica("Saul Kripke")], ["language", "logic", "meaning"]),
  anchor("person.roman_jakobson", ["雅各布森", "Roman Jakobson"], "philosophy_language", ["linguist"], "20th_century", [
    w("work.linguistics_poetics", ["语言学与诗学", "Linguistics and Poetics"], "linguistics_text", ["concept.poetic_function", "concept.translation"], ["language", "poetics", "function"], ["poetic function", "language", "communication"]),
    w("work.on_translation_jakobson", ["论翻译的语言学方面", "On Linguistic Aspects of Translation"], "linguistics_text", ["concept.translation_equivalence_boundary", "concept.signifier_signified"], ["translation", "equivalence", "sign"], ["translation boundary", "equivalence", "sign"])
  ], ["concept.poetic_function", "concept.translation_equivalence_boundary"], ["language", "poetics", "translation"], "philosophy_language_social_thought", [S.britannica("Roman Jakobson")], ["language", "poetry", "translation"]),
  anchor("person.paul_ricoeur", ["保罗·利科", "Paul Ricoeur"], "philosophy_language", ["philosopher"], "20th_century", [
    w("work.time_and_narrative", ["时间与叙事", "Time and Narrative"], "philosophy_text", ["concept.narrative_identity", "concept.memory_narration"], ["time", "narrative", "identity"], ["time", "narrative", "identity"]),
    w("work.memory_history_forgetting", ["记忆、历史、遗忘", "Memory History Forgetting"], "philosophy_text", ["concept.memory_vs_fact", "concept.history_memory_boundary"], ["memory", "history", "forgetting"], ["memory", "history", "forgetting"])
  ], ["concept.narrative_identity", "concept.memory_vs_fact"], ["narrative", "memory", "identity"], "philosophy_language_social_thought", [S.britannica("Paul Ricoeur"), S.sep("ricoeur")], ["philosophy", "history", "literature"]),
  anchor("person.frantz_fanon", ["法农", "Frantz Fanon"], "social_thought", ["writer", "psychiatrist"], "20th_century", [
    w("work.black_skin_white_masks", ["黑皮肤，白面具", "Black Skin White Masks"], "theory_text", ["concept.colonial_discourse_boundary", "concept.recognition"], ["colonial relation", "recognition", "identity"], ["colonial relation", "recognition", "identity"]),
    w("work.wretched_of_earth", ["全世界受苦的人", "The Wretched of the Earth"], "theory_text", ["concept.violence_power_boundary", "concept.decolonization"], ["power", "violence", "decolonization"], ["power", "violence boundary", "decolonization"])
  ], ["concept.colonial_discourse_boundary", "concept.recognition"], ["colonial_relation", "recognition", "power"], "philosophy_language_social_thought", [S.britannica("Frantz Fanon")], ["social_thought", "literature", "care_boundary"]),
  anchor("person.edward_said", ["爱德华·萨义德", "Edward Said"], "social_thought", ["critic"], "20th_21st_century", [
    w("work.orientalism", ["东方学", "Orientalism"], "theory_text", ["concept.colonial_discourse_boundary", "concept.representation_power"], ["representation", "power", "knowledge"], ["representation", "power", "knowledge"]),
    w("work.culture_and_imperialism", ["文化与帝国主义", "Culture and Imperialism"], "theory_text", ["concept.public_private_boundary", "concept.postcolonial_memory"], ["culture", "empire", "narrative"], ["culture", "empire", "narrative"])
  ], ["concept.colonial_discourse_boundary", "concept.representation_power"], ["representation", "power", "culture"], "philosophy_language_social_thought", [S.britannica("Edward Said")], ["social_thought", "literature", "history"]),
  anchor("person.habermas", ["哈贝马斯", "Jurgen Habermas"], "social_thought", ["philosopher"], "20th_21st_century", [
    w("work.structural_transformation_public_sphere", ["公共领域的结构转型", "The Structural Transformation of the Public Sphere"], "social_theory_text", ["concept.public_sphere", "concept.public_private_boundary"], ["public", "private", "communication"], ["public sphere", "private boundary", "communication"]),
    w("work.theory_communicative_action", ["交往行为理论", "The Theory of Communicative Action"], "social_theory_text", ["concept.communication_action", "concept.legitimacy"], ["communication", "reason", "legitimacy"], ["communication", "reason", "legitimacy"])
  ], ["concept.public_sphere", "concept.authority_legitimacy"], ["communication", "public", "legitimacy"], "philosophy_language_social_thought", [S.britannica("Jurgen Habermas"), S.sep("habermas")], ["social_thought", "law", "city"]),
  anchor("person.judith_butler", ["朱迪斯·巴特勒", "Judith Butler"], "social_thought", ["philosopher"], "20th_21st_century", [
    w("work.gender_trouble", ["性别麻烦", "Gender Trouble"], "theory_text", ["concept.performance_identity", "concept.recognition"], ["gender", "performance", "identity"], ["performance", "identity", "recognition"]),
    w("work.bodies_that_matter", ["身体之重", "Bodies That Matter"], "theory_text", ["concept.body_boundary", "concept.power_norm"], ["body", "norm", "power"], ["body boundary", "norm", "power"])
  ], ["concept.performance_identity", "concept.recognition"], ["identity", "performance", "norm"], "philosophy_language_social_thought", [S.britannica("Judith Butler")], ["social_thought", "literature", "care_boundary"]),

  anchor("person.rachel_carson", ["蕾切尔·卡森", "Rachel Carson"], "science_history", ["writer", "marine biologist"], "20th_century", [
    w("work.silent_spring", ["寂静的春天", "Silent Spring"], "science_text", ["concept.public_science_boundary", "concept.evidence_chain"], ["ecology", "public science", "evidence"], ["public science", "evidence chain", "ecology"]),
    w("work.sea_around_us", ["我们周围的海", "The Sea Around Us"], "science_text", ["concept.science_writing", "concept.observation"], ["sea", "science writing", "observation"], ["science writing", "observation", "sea"])
  ], ["concept.public_science_boundary", "concept.evidence_chain"], ["evidence", "public science", "ecology"], "science_computing_history_extension", [S.britannica("Rachel Carson")], ["science", "environment", "public_boundary"]),
  anchor("person.popper", ["波普尔", "Karl Popper"], "philosophy_science", ["philosopher"], "20th_century", [
    w("work.logic_scientific_discovery", ["科学发现的逻辑", "The Logic of Scientific Discovery"], "philosophy_text", ["concept.falsifiability", "concept.model_vs_reality"], ["falsifiability", "method", "science"], ["falsifiability", "method", "science"]),
    w("work.open_society_enemies", ["开放社会及其敌人", "The Open Society and Its Enemies"], "philosophy_text", ["concept.public_reason_boundary", "concept.authority_legitimacy"], ["open society", "authority", "critique"], ["open society", "authority", "critique"])
  ], ["concept.falsifiability", "concept.public_reason_boundary"], ["science", "method", "society"], "science_computing_history_extension", [S.britannica("Karl Popper"), S.sep("popper")], ["science", "philosophy", "social_thought"]),
  anchor("person.ada_lovelace", ["艾达·洛夫莱斯", "Ada Lovelace"], "technology_history", ["mathematician"], "19th_century", [
    w("work.notes_analytical_engine", ["分析机札记", "Notes on the Analytical Engine"], "computing_text", ["concept.computation", "concept.algorithm"], ["computation", "notation", "machine"], ["computation", "notation", "machine"]),
    w("work.lovelace_note_g", ["洛夫莱斯G札记", "Lovelace Note G"], "computing_note", ["concept.algorithm", "concept.tool_vs_medium"], ["algorithm", "machine", "symbol"], ["algorithm", "machine", "symbol"])
  ], ["concept.computation", "concept.algorithm"], ["computation", "symbol", "machine"], "science_computing_history_extension", [S.britannica("Ada Lovelace")], ["technology", "science_history", "language"]),
  anchor("person.grace_hopper", ["格蕾丝·霍珀", "Grace Hopper"], "technology_history", ["computer scientist"], "20th_century", [
    w("work.hopper_compiler_work", ["编译器工作", "Compiler work"], "computing_example", ["concept.programming_language", "concept.interface"], ["compiler", "language", "machine"], ["compiler", "programming language", "machine relation"]),
    w("work.cobol_context", ["COBOL语境", "COBOL context"], "computing_example", ["concept.programming_language", "concept.protocol_technology"], ["language", "business", "standard"], ["programming language", "business computing", "standard"])
  ], ["concept.programming_language", "concept.interface"], ["language", "machine", "standard"], "science_computing_history_extension", [S.britannica("Grace Hopper"), S.acm("Grace Hopper")], ["technology", "language", "education"]),
  anchor("person.vannevar_bush", ["万尼瓦尔·布什", "Vannevar Bush"], "technology_history", ["engineer", "science administrator"], "20th_century", [
    w("work.as_we_may_think", ["诚如所思", "As We May Think"], "technology_essay", ["concept.hypertext", "concept.augmentation"], ["memory", "machine", "link"], ["memory machine", "linking", "augmentation"]),
    w("work.memex_concept", ["Memex概念", "Memex concept"], "technology_concept", ["concept.hypertext", "concept.tool_vs_medium"], ["memory", "tool", "association"], ["associative memory", "tool", "medium"])
  ], ["concept.hypertext", "concept.augmentation"], ["memory", "tool", "link"], "science_computing_history_extension", [S.britannica("Vannevar Bush")], ["technology", "memory", "education"]),
  anchor("person.paulo_freire", ["保罗·弗莱雷", "Paulo Freire"], "education_learning", ["educator", "philosopher"], "20th_century", [
    w("work.pedagogy_of_oppressed", ["被压迫者教育学", "Pedagogy of the Oppressed"], "education_text", ["concept.dialogic_learning", "concept.authority_legitimacy"], ["dialogue", "education", "power"], ["dialogic learning", "education", "power"]),
    w("work.education_for_critical_consciousness", ["批判意识教育", "Education for Critical Consciousness"], "education_text", ["concept.inquiry_learning", "concept.public_reason_boundary"], ["education", "inquiry", "public"], ["education", "inquiry", "public reason"])
  ], ["concept.dialogic_learning", "concept.inquiry_learning"], ["education", "dialogue", "power"], "economy_law_education_care_boundary", [S.britannica("Paulo Freire")], ["education", "social_thought", "dialogue"]),
  anchor("person.amartya_sen", ["阿马蒂亚·森", "Amartya Sen"], "economy_institutions", ["economist", "philosopher"], "20th_21st_century", [
    w("work.development_as_freedom", ["以自由看待发展", "Development as Freedom"], "economics_text", ["concept.capability", "concept.freedom_responsibility"], ["capability", "freedom", "development"], ["capability", "freedom", "development"]),
    w("work.idea_of_justice", ["正义的理念", "The Idea of Justice"], "philosophy_text", ["concept.fairness", "concept.public_reason_boundary"], ["justice", "reason", "fairness"], ["justice", "public reason", "fairness"])
  ], ["concept.capability", "concept.fairness"], ["capability", "freedom", "justice"], "economy_law_education_care_boundary", [S.nobel("Amartya Sen"), S.britannica("Amartya Sen")], ["economy", "law", "education"]),
  anchor("person.mary_douglas", ["玛丽·道格拉斯", "Mary Douglas"], "food_social_thought", ["anthropologist"], "20th_century", [
    w("work.purity_and_danger", ["洁净与危险", "Purity and Danger"], "anthropology_text", ["concept.boundary", "concept.food_as_social_ritual"], ["boundary", "classification", "ritual"], ["boundary", "classification", "ritual"]),
    w("work.deciphering_a_meal", ["解读一餐", "Deciphering a Meal"], "anthropology_essay", ["concept.food_as_social_ritual", "concept.taste_memory"], ["meal", "social form", "classification"], ["meal", "social form", "classification"])
  ], ["concept.food_as_social_ritual", "concept.boundary"], ["food", "ritual", "classification"], "city_food_daily_extension", [S.britannica("Mary Douglas")], ["food", "anthropology", "boundary"]),
  anchor("person.richard_sennett", ["理查德·桑内特", "Richard Sennett"], "city_public_space", ["sociologist"], "20th_21st_century", [
    w("work.fall_public_man", ["公共人的衰落", "The Fall of Public Man"], "social_theory_text", ["concept.public_private_boundary", "concept.public_space"], ["public", "private", "city"], ["public private boundary", "city", "social form"]),
    w("work.craftsman_sennett", ["匠人", "The Craftsman"], "social_theory_text", ["concept.craft_knowledge", "concept.practice_learning"], ["craft", "practice", "skill"], ["craft knowledge", "practice", "skill"])
  ], ["concept.public_private_boundary", "concept.craft_knowledge"], ["city", "public", "craft"], "city_food_daily_extension", [S.britannica("Richard Sennett")], ["city", "craft", "education"])
];

const concepts = [
  ["concept.magical_realism", ["魔幻现实主义", "magical realism"], "literature.world", ["realist setting", "marvelous element", "ordinary treatment"], ["Latin American fiction", "postcolonial narrative"], ["fantasy world only", "anything strange"], ["concept.realism_literature"], ["do_not_reduce_to_fantasy"], [S.britannica("magical realism")], ["literature", "film", "history"]],
  ["concept.realism_literature", ["现实主义", "realism"], "literature", ["social detail", "ordinary life", "historical setting"], ["19th century novel", "social fiction"], ["mere factual recording"], ["concept.modernism_global"], ["do_not_treat_as_no_style"], [S.britannica("realism literature")], ["literature", "film", "art"]],
  ["concept.modernism_global", ["全球现代主义", "global modernism"], "literature", ["formal experiment", "modern rupture", "multiple centers"], ["modernist fiction", "modernist poetry"], ["difficult style only"], ["concept.fragmented_form"], ["do_not_reduce_to_difficulty"], [S.britannica("modernism")], ["literature", "film", "art"]],
  ["concept.postcolonial_memory", ["后殖民记忆", "postcolonial memory"], "literature.world", ["memory after empire", "language pressure", "historical voice"], ["nation narrative", "family history"], ["nostalgia only"], ["concept.witness_testimony"], ["do_not_turn_into_current_politics_without_source"], [S.britannica("postcolonialism")], ["literature", "history", "social_thought"]],
  ["concept.witness_testimony", ["见证与证词", "witness and testimony"], "literature", ["first person account", "evidence pressure", "ethical address"], ["testimonial writing", "legal testimony analogy"], ["opinion only"], ["concept.memory_vs_fact"], ["do_not_treat_testimony_as_total_proof"], [S.britannica("testimony")], ["literature", "law", "history"]],
  ["concept.exile", ["流亡", "exile"], "literature", ["displacement", "language distance", "home relation"], ["exile writing", "diaspora fiction"], ["travel mood"], ["concept.nostalgia"], ["do_not_equate_with_tourism"], [S.britannica("exile")], ["literature", "history", "music"]],
  ["concept.absurdity_literature", ["荒诞", "absurdity"], "literature.european_modern", ["meaning gap", "repetition", "ordinary action under strain"], ["absurd theater", "modern fiction"], ["random nonsense"], ["concept.waiting_structure"], ["do_not_treat_as_any_weirdness"], [S.britannica("Theatre-of-the-Absurd")], ["literature", "theater", "philosophy"]],
  ["concept.short_story_vs_novel", ["短篇与长篇差异", "short story vs novel"], "literature", ["compression", "single pressure", "duration difference"], ["short fiction", "novel form"], ["short means simpler"], ["concept.fragmented_form"], ["do_not_rank_by_length"], [S.britannica("short-story")], ["literature", "film", "music"]],
  ["concept.unreliable_narrator", ["不可靠叙述者", "unreliable narrator"], "literature", ["voice gap", "reader inference", "credibility pressure"], ["first-person novel", "frame narrative"], ["lying character only"], ["concept.narrative_voice"], ["do_not_claim_author_believes_narrator"], [S.britannica("narrator")], ["literature", "film", "law"]],
  ["concept.stream_consciousness_global", ["意识流", "stream of consciousness"], "literature", ["interior flow", "associative sequence", "temporal looseness"], ["modernist fiction", "interior monologue"], ["confusing writing only"], ["concept.interior_monologue"], ["do_not_use_for_all_first_person"], [S.britannica("stream-of-consciousness")], ["literature", "psychology_boundary", "film"]],
  ["concept.memory_vs_fact", ["记忆与事实", "memory vs fact"], "psychology_memory_boundary", ["subjective recall", "evidence difference", "narrative shaping"], ["memoir question", "film memory scene"], ["memory equals perfect storage"], ["concept.witness_testimony"], ["do_not_treat_memory_as_complete_evidence"], [S.britannica("memory")], ["literature", "film", "care_boundary"], true],
  ["concept.body_boundary", ["身体边界", "body boundary"], "care_boundary", ["embodiment", "consent", "social pressure"], ["body in fiction", "care discussion"], ["diagnosis"], ["concept.identity_boundary"], ["do_not_pathologize"], [S.britannica("body")], ["literature", "care_boundary", "art"], true],
  ["concept.montage", ["蒙太奇", "montage"], "film", ["editing relation", "shot sequence", "meaning by juxtaposition"], ["film editing", "essay film"], ["random cutting"], ["concept.long_take"], ["do_not_use_as_all_editing"], [S.bfi("montage")], ["film", "music", "literature"]],
  ["concept.long_take", ["长镜头", "long take"], "film", ["duration", "continuous shot", "viewer attention"], ["slow cinema", "spatial observation"], ["slow story only"], ["concept.duration"], ["do_not_equate_duration_with_quality"], [S.bfi("long take")], ["film", "city", "performance"]],
  ["concept.mise_en_scene", ["场面调度", "mise-en-scene"], "film", ["staging", "space", "visible arrangement"], ["frame composition", "actor placement"], ["set decoration only"], ["theme.framing"], ["do_not_reduce_to_pretty_image"], [S.bfi("mise en scene")], ["film", "theater", "design"]],
  ["concept.modernist_cinema", ["现代主义电影", "modernist cinema"], "film", ["formal self-awareness", "fragmented time", "viewer activity"], ["new wave cinema", "essay cinema"], ["old film only"], ["concept.modernism_global"], ["do_not_use_period_label_as_answer"], [S.bfi("modernism cinema")], ["film", "literature", "art"]],
  ["concept.auteur", ["作者论", "auteur"], "film", ["director signature", "recurring form", "production context"], ["director study", "style comparison"], ["director owns everything"], ["concept.institution"], ["do_not_ignore_collaboration"], [S.bfi("auteur")], ["film", "music", "design"]],
  ["concept.documentary_fiction_boundary", ["纪录与虚构边界", "documentary fiction boundary"], "film", ["recorded world", "constructed form", "truth claim"], ["docufiction", "essay film"], ["documentary equals pure fact"], ["concept.image_not_evidence"], ["do_not_treat_image_as_complete_proof"], [S.bfi("documentary")], ["film", "law", "history"], true],
  ["concept.city_film", ["城市电影", "city film"], "film", ["urban space", "movement", "social relation"], ["street scene", "metropolis film"], ["city as backdrop only"], ["concept.city_street"], ["do_not_reduce_city_to_setting"], [S.bfi("city film")], ["film", "urban", "literature"]],
  ["concept.memory_film", ["记忆电影", "memory film"], "film", ["time return", "image fragment", "subjective recall"], ["flashback structure", "essay film"], ["plot recap only"], ["concept.memory_vs_fact"], ["do_not_treat_memory_as_exact_record"], [S.bfi("memory film")], ["film", "literature", "psychology_boundary"]],
  ["concept.spectatorship", ["观影关系", "spectatorship"], "film", ["viewer position", "look", "ethical distance"], ["window scene", "camera gaze"], ["watching only"], ["concept.gaze"], ["do_not_moralize_every_view"], [S.bfi("spectatorship")], ["film", "photography", "art"]],
  ["concept.domestic_space_film", ["家庭空间电影", "domestic space in film"], "film", ["home space", "routine", "power relation"], ["kitchen scene", "room staging"], ["decor only"], ["concept.public_private_boundary"], ["do_not_assume_private_intent"], [S.bfi("domestic space film")], ["film", "food", "architecture"]],
  ["concept.image_not_evidence", ["图像不是证据本身", "image is not evidence by default"], "image_theory", ["image record", "context need", "interpretive risk"], ["photograph as clue", "documentary image"], ["image equals proof"], ["concept.documentary_fiction_boundary"], ["do_not_treat_picture_as_complete_proof"], [S.moma("photography evidence")], ["photography", "law", "film"], true],
  ["concept.cover_version", ["翻唱", "cover version"], "music", ["same song", "new performance", "interpretation"], ["cover song", "live reinterpretation"], ["copy without difference"], ["concept.interpretation"], ["do_not_quote_lyrics"], [S.britannica("cover version music")], ["music", "translation", "performance"]],
  ["concept.improvisation", ["即兴", "improvisation"], "music", ["real-time choice", "shared structure", "variation"], ["jazz solo", "call response"], ["random playing"], ["concept.jazz"], ["do_not_claim_no_structure"], [S.britannica("improvisation music")], ["music", "conversation", "theater"]],
  ["concept.blues", ["布鲁斯", "blues"], "music", ["form", "voice", "African American musical tradition"], ["blues song", "jazz relation"], ["sad song only"], ["concept.jazz"], ["do_not_reduce_to_mood"], [S.britannica("blues music")], ["music", "poetry", "history"]],
  ["concept.jazz", ["爵士", "jazz"], "music", ["improvisation", "swing relation", "ensemble interaction"], ["small group jazz", "modal jazz"], ["background cafe music"], ["concept.improvisation"], ["do_not_reduce_to_mood"], [S.britannica("jazz")], ["music", "conversation", "city"]],
  ["concept.folk_revival", ["民谣复兴", "folk revival"], "music", ["song tradition", "public memory", "revival context"], ["folk song", "protest song"], ["acoustic sound only"], ["concept.public_voice_music"], ["do_not_quote_lyrics"], [S.britannica("folk music")], ["music", "history", "literature"]],
  ["concept.rock_public_voice", ["摇滚与公共声音", "rock as public voice"], "music", ["youth sound", "public address", "amplified performance"], ["rock anthem", "band sound"], ["loud sound only"], ["concept.public_voice_music"], ["do_not_turn_style_into_politics_without_support"], [S.britannica("rock music")], ["music", "youth_memory", "public_memory"]],
  ["concept.electronic_music_repetition", ["电子音乐与重复", "electronic music and repetition"], "music", ["machine rhythm", "loop", "texture"], ["electronic track", "synth pattern"], ["computer music only"], ["concept.technology_rhythm"], ["do_not_make_platform_claim"], [S.britannica("electronic music")], ["music", "technology", "design"]],
  ["concept.sampling_boundary", ["采样边界", "sampling boundary"], "music", ["reuse", "quotation risk", "copyright context"], ["sample-based music", "remix"], ["free copying"], ["concept.copyright_boundary"], ["do_not_quote_or_reproduce_protected_audio"], [S.britannica("sampling music")], ["music", "law_boundary", "technology"], true],
  ["concept.album_as_form", ["专辑作为形式", "album as form"], "music", ["sequence", "theme arc", "listening duration"], ["concept album", "album side"], ["playlist only"], ["concept.sequence_form"], ["do_not_assume_every_album_has_single_story"], [S.britannica("album music")], ["music", "film", "novel"]],
  ["concept.song_poem_boundary", ["歌与诗的边界", "song and poem boundary"], "music_literature", ["voice", "music support", "text compression"], ["lyric discussion", "song-poem comparison"], ["song equals poem"], ["concept.translation_equivalence_boundary"], ["do_not_quote_lyrics"], [S.britannica("lyric")], ["music", "poetry", "copyright_boundary"], true],
  ["concept.representation_image", ["再现", "representation"], "art_image_design", ["image relation", "object relation", "viewer inference"], ["painting", "photography"], ["copying only"], ["concept.image_not_evidence"], ["do_not_treat_image_as_object_itself"], [S.moma("representation")], ["art", "language", "film"]],
  ["concept.abstraction_visual", ["视觉抽象", "visual abstraction"], "art_image_design", ["form reduction", "color relation", "non-figurative pressure"], ["abstract painting", "design form"], ["anything unclear"], ["concept.form_material_institution"], ["do_not_treat_as_no_subject"], [S.moma("abstract art")], ["art", "design", "music"]],
  ["concept.installation_art", ["装置艺术", "installation art"], "art_image_design", ["space", "object arrangement", "viewer movement"], ["room installation", "site work"], ["large sculpture only"], ["concept.medium_specificity"], ["do_not_ignore_site_context"], [S.tate("installation art")], ["art", "architecture", "film"]],
  ["concept.medium_specificity", ["媒介特性", "medium specificity"], "art_image_design", ["material condition", "form constraint", "medium difference"], ["painting vs film", "photo vs text"], ["medium equals topic"], ["concept.materiality"], ["do_not_rank_media_by_purity"], [S.tate("medium specificity")], ["art", "film", "music"]],
  ["concept.materiality", ["材料性", "materiality"], "art_image_design", ["material support", "texture", "making condition"], ["paint surface", "paper", "object"], ["expensive material"], ["concept.form_material_institution"], ["do_not_make_material_the_whole_meaning"], [S.moma("materiality")], ["art", "design", "food"]],
  ["concept.image_text_relation", ["图像与文字关系", "image text relation"], "art_image_design", ["image", "caption", "semantic tension"], ["poster", "conceptual art"], ["text explaining image only"], ["concept.naming_reference_distinction"], ["do_not_assume_text_controls_image"], [S.moma("text art")], ["art", "language", "design"]],
  ["concept.visual_rhetoric", ["视觉修辞", "visual rhetoric"], "art_image_design", ["persuasion", "composition", "public address"], ["poster", "public image"], ["pretty design"], ["concept.image_text_relation"], ["do_not_claim_intent_without_evidence"], [S.moma("graphic design")], ["art", "design", "public_sphere"]],
  ["concept.prototype_design", ["原型", "prototype"], "design_interface", ["test object", "iteration", "learning from use"], ["design prototype", "interface mock"], ["finished product"], ["concept.affordance_design"], ["do_not_claim_current_product_state"], [S.official("Interaction Design Foundation:prototype", "https://www.interaction-design.org/literature/topics/prototyping")], ["design", "technology", "education"]],
  ["concept.craft_vs_industry", ["手艺与工业", "craft vs industry"], "design", ["making skill", "standardization", "production scale"], ["Bauhaus question", "furniture design"], ["handmade good industrial bad"], ["concept.materiality"], ["do_not_romanticize_craft"], [S.britannica("craft design industry")], ["design", "food", "education"]],
  ["concept.naming_reference_distinction", ["命名与指称差异", "naming vs reference"], "language", ["name", "referent", "context"], ["proper name", "translation term"], ["name equals meaning"], ["concept.reference"], ["do_not_treat_same_name_as_same_entity"], [S.sep("reference"), S.sep("names")], ["language", "law", "dialogue"], true],
  ["concept.translation_equivalence_boundary", ["翻译等价边界", "translation equivalence boundary"], "language", ["meaning loss", "context shift", "form difference"], ["title translation", "poetry term"], ["perfect one-to-one equivalent"], ["concept.translation"], ["do_not_claim_one_perfect_equivalent"], [S.britannica("translation")], ["language", "literature", "philosophy"], true],
  ["concept.narrative_identity", ["叙事身份", "narrative identity"], "philosophy_language", ["self account", "time", "story form"], ["memoir", "character arc"], ["fixed essence"], ["concept.memory_vs_fact"], ["do_not_diagnose_user_identity"], [S.sep("ricoeur")], ["philosophy", "literature", "care_boundary"]],
  ["concept.public_private_boundary", ["公共与私人边界", "public private boundary"], "social_thought", ["public role", "private life", "context split"], ["city life", "literary character"], ["everything personal"], ["concept.boundary"], ["do_not_infer_private_life_from_public_work"], [S.britannica("public-private distinction")], ["city", "literature", "law_boundary"], true],
  ["concept.authority_legitimacy", ["权威与正当性", "authority and legitimacy"], "social_thought", ["power claim", "acceptance", "justification"], ["law", "institution"], ["authority equals force"], ["concept.rule_of_law"], ["do_not_make_current_legal_claim"], [S.sep("legitimacy")], ["law", "politics", "education"], true],
  ["concept.recognition", ["承认", "recognition"], "social_thought", ["social acknowledgement", "status", "identity relation"], ["recognition theory", "identity conflict"], ["praise only"], ["concept.public_private_boundary"], ["do_not_reduce_to_compliment"], [S.sep("recognition")], ["social_thought", "care_boundary", "literature"]],
  ["concept.public_sphere", ["公共领域", "public sphere"], "social_thought", ["public discussion", "institution", "media relation"], ["newspaper debate", "civic forum"], ["any online space"], ["concept.public_private_boundary"], ["do_not_make_current_platform_claim"], [S.britannica("public sphere")], ["city", "law", "media"]],
  ["concept.violence_power_boundary", ["暴力与权力边界", "violence and power boundary"], "social_thought", ["force", "coercion", "historical context"], ["colonial theory", "political theory"], ["metaphor for any conflict"], ["concept.authority_legitimacy"], ["do_not_romanticize_or_prescribe_violence"], [S.britannica("violence")], ["social_thought", "history", "care_boundary"], true],
  ["concept.colonial_discourse_boundary", ["殖民话语边界", "colonial discourse boundary"], "social_thought", ["representation", "power", "historical relation"], ["postcolonial criticism", "travel writing"], ["any foreign description"], ["concept.representation_power"], ["do_not_apply_without historical_context"], [S.britannica("postcolonialism")], ["literature", "history", "social_thought"], true],
  ["concept.analogy_not_identity", ["类比不是同一", "analogy is not identity"], "bridge_boundary", ["shared axis", "kept difference", "limited transfer"], ["film and city analogy", "song and poem analogy"], ["same thing"], ["concept.translation_equivalence_boundary"], ["do_not_collapse_domains"], [S.britannica("analogy")], ["all_domains", "dialogue", "boundary"], true],
  ["concept.affective_association_boundary", ["情感联想边界", "affective association boundary"], "care_boundary", ["association", "memory", "non-diagnosis"], ["personal resonance", "art feeling"], ["clinical diagnosis"], ["concept.memory_vs_fact"], ["do_not_pathologize_personal_association"], [S.britannica("emotion")], ["care_boundary", "art", "music"], true],
  ["concept.food_as_social_ritual", ["食物作为社会仪式", "food as social ritual"], "food", ["meal form", "shared practice", "social relation"], ["family meal", "festival food"], ["nutrition advice"], ["concept.taste_memory"], ["do_not_give_medical_nutrition_claim"], [S.britannica("food culture")], ["food", "literature", "film"], true],
  ["concept.hospitality_food", ["待客与饮食", "hospitality and food"], "food", ["hosting", "sharing", "social expectation"], ["home meal", "banquet"], ["restaurant ranking"], ["concept.food_as_social_ritual"], ["do_not_make_local_recommendation"], [S.britannica("hospitality")], ["food", "city", "literature"]],
  ["concept.craft_knowledge", ["手艺知识", "craft knowledge"], "daily_world", ["practice", "skill", "material feedback"], ["cooking practice", "design workshop"], ["talent only"], ["concept.practice_learning"], ["do_not_romanticize_skill"], [S.britannica("craft")], ["food", "design", "education"]],
  ["concept.public_science_boundary", ["公共科学边界", "public science boundary"], "science_history", ["stable concept", "source need", "no current claim"], ["science history", "environment writing"], ["medical advice"], ["concept.evidence_chain"], ["do_not_give_biomedical_advice"], [S.britannica("science")], ["science", "public_policy", "boundary"], true],
  ["concept.falsifiability", ["可证伪性", "falsifiability"], "philosophy_science", ["test risk", "claim exposure", "method boundary"], ["scientific hypothesis", "method debate"], ["any disagreement"], ["concept.model_vs_reality"], ["do_not_use_as_universal_judge"], [S.sep("popper")], ["science", "philosophy", "education"]],
  ["concept.programming_language", ["编程语言", "programming language"], "technology_history", ["notation", "machine instruction", "human interface"], ["COBOL", "compiler"], ["natural language only"], ["concept.interface"], ["do_not_make_current_platform_claim"], [S.britannica("computer-programming-language")], ["technology", "language", "education"]],
  ["concept.dialogic_learning", ["对话式学习", "dialogic learning"], "education", ["dialogue", "reflection", "power relation"], ["seminar", "critical pedagogy"], ["chatty teaching only"], ["concept.inquiry_learning"], ["do_not_give_special_needs_advice"], [S.britannica("education")], ["education", "dialogue", "social_thought"]],
  ["concept.practice_learning", ["练习型学习", "practice learning"], "education", ["repetition", "feedback", "skill"], ["instrument practice", "writing practice"], ["rote drilling only"], ["concept.feedback"], ["do_not_claim_one_method_fits_all"], [S.britannica("learning")], ["education", "music", "craft"]],
  ["concept.capability", ["能力进路", "capability"], "economy_institutions", ["real opportunity", "freedom", "human development"], ["capability approach", "development debate"], ["skill only"], ["concept.freedom_responsibility"], ["do_not_turn_into_personal_finance_advice"], [S.nobel("Amartya Sen"), S.britannica("Amartya Sen")], ["economy", "law", "education"]],
  ["concept.evaluation_boundary_static", ["静态评估边界", "static evaluation boundary"], "boundary", ["stable concept", "current data gap", "source requirement"], ["law boundary", "platform state boundary"], ["refusal to discuss"], ["concept.public_science_boundary"], ["do_not_answer_current_state_without_source"], [S.britannica("evidence")], ["law", "science", "technology"], true],
  ["concept.protocol_governance", ["协议治理", "protocol governance"], "technology", ["shared rules", "interoperability", "institutional maintenance"], ["web protocol", "standards body"], ["company policy only"], ["concept.protocol_technology"], ["do_not_claim_current_API_state"], [S.britannica("Internet protocol")], ["technology", "law", "institutions"]],
  ["concept.same_or_different_question", ["同一与差异问题", "same or different question"], "bridge_boundary", ["shared feature", "active difference", "scope limit"], ["concept comparison", "work comparison"], ["identity collapse"], ["concept.analogy_not_identity"], ["do_not_answer_same_without_axis"], [S.britannica("identity philosophy")], ["all_domains", "language", "dialogue"], true]
].map(([id, names, domain, units, examples, non_examples, related, negative, provenance, transfer, boundary = false]) => ({
  id,
  names,
  domain,
  units,
  examples,
  non_examples,
  related,
  negative,
  misreadings: non_examples,
  provenance,
  transfer,
  boundary,
  pack: boundary ? "bridge_negative_boundary_layer" : packForDomain(domain)
}));

function packForDomain(domain) {
  if (domain.includes("film")) return "global_cinema_extension";
  if (domain.includes("music")) return "global_music_culture";
  if (domain.includes("art") || domain.includes("design") || domain.includes("image")) return "art_design_image_deepening";
  if (domain.includes("philosophy") || domain.includes("language") || domain.includes("social")) return "philosophy_language_social_thought";
  if (domain.includes("science") || domain.includes("technology")) return "science_computing_history_extension";
  if (domain.includes("food") || domain.includes("city") || domain.includes("daily")) return "city_food_daily_extension";
  if (domain.includes("education") || domain.includes("economy") || domain.includes("law") || domain.includes("care")) return "economy_law_education_care_boundary";
  if (domain.includes("boundary") || domain.includes("bridge")) return "bridge_negative_boundary_layer";
  return "world_literature_extension";
}

function relationId(prefix, a, b) {
  return `relation.${prefix}.${a.replace(/^(person|work|concept)\./, "").replace(/[^a-z0-9_]+/gi, "_")}.${b.replace(/^(person|work|concept)\./, "").replace(/[^a-z0-9_]+/gi, "_")}`;
}

function derivedRelationsForAnchor(row) {
  const active = ACTIVE_PEOPLE.has(row.id);
  const out = [];
  for (const workRow of row.works) {
    out.push(relation({
      id: relationId("r26_person_work", row.id, workRow.id),
      domain: row.domain,
      relation_type: "person_to_work",
      source_ids: [row.id],
      target_ids: [workRow.id],
      shared_axes: ["representative work", ...row.axes.slice(0, 2)],
      contrast_axes: ["creator is not reducible to one work"],
      example_ids: [workRow.id],
      provenance: workRow.provenance || row.provenance,
      transfer: ["representative_works", "topic_reentry", "comparison"],
      active,
      pack: row.pack,
      scope: row.scope || "source_only",
      purpose: ["closes_person_work_loop", "supports_representative_work_questions"]
    }));
    for (const conceptId of (workRow.concepts || row.concepts).slice(0, 2)) {
      out.push(relation({
        id: relationId("r26_work_concept", workRow.id, conceptId),
        domain: row.domain,
        relation_type: "work_to_concept",
        source_ids: [workRow.id],
        target_ids: [conceptId],
        shared_axes: ["example", ...((workRow.axes || row.axes).slice(0, 2))],
        contrast_axes: ["example does not exhaust concept"],
        example_ids: [workRow.id],
        provenance: workRow.provenance || row.provenance,
        transfer: ["concept_followup", "explain_characteristics", "compare_works"],
        active,
        pack: row.pack,
        scope: row.scope || "source_only",
        purpose: ["closes_work_concept_loop", "supports_concept_followup"]
      }));
    }
  }
  return out;
}

const manualRelationPairs = [
  ["magical_realism_not_fantasy", "concept.magical_realism", "concept.realism_literature", "distinguishes_from", ["realist world", "marvelous event"], ["not secondary-world fantasy"]],
  ["witness_memory_boundary", "concept.witness_testimony", "concept.memory_vs_fact", "constrains", ["testimony", "evidence pressure"], ["not perfect recall"]],
  ["exile_not_nostalgia", "concept.exile", "concept.postcolonial_memory", "distinguishes_from", ["home relation", "distance"], ["not simple homesickness"]],
  ["absurdity_not_randomness", "concept.absurdity_literature", "concept.waiting_structure", "frames", ["meaning gap", "repetition"], ["not random nonsense"]],
  ["montage_long_take", "concept.montage", "concept.long_take", "contrasts_with", ["time construction", "viewer attention"], ["not better or worse by default"]],
  ["mise_frame", "concept.mise_en_scene", "theme.framing", "overlaps_with", ["space", "arrangement"], ["not border only"]],
  ["documentary_image_evidence", "concept.documentary_fiction_boundary", "concept.image_not_evidence", "constrains", ["truth claim", "context"], ["image not complete proof"]],
  ["city_film_street", "concept.city_film", "concept.city_street", "bridges", ["urban scene", "movement"], ["city not backdrop only"]],
  ["memory_film_memory_fact", "concept.memory_film", "concept.memory_vs_fact", "constrains", ["subjective recall", "image fragment"], ["memory not exact record"]],
  ["cover_translation", "concept.cover_version", "concept.translation_equivalence_boundary", "bridges", ["same source", "new realization"], ["not perfect equivalence"]],
  ["improvisation_conversation", "concept.improvisation", "concept.dialogic_learning", "bridges", ["real-time response", "shared structure"], ["not random talk"]],
  ["jazz_conversation", "concept.jazz", "concept.improvisation", "frames", ["ensemble", "variation"], ["not mood label"]],
  ["song_poem_boundary", "concept.song_poem_boundary", "concept.translation_equivalence_boundary", "constrains", ["form difference", "voice support"], ["song is not just poem"]],
  ["album_novel_film", "concept.album_as_form", "concept.sequence_form", "bridges", ["sequence", "duration"], ["not every album tells story"]],
  ["image_reference", "concept.representation_image", "concept.naming_reference_distinction", "bridges", ["representation", "referent"], ["image is not object"]],
  ["image_not_evidence_law", "concept.image_not_evidence", "concept.witness_testimony", "constrains", ["evidence", "context"], ["not proof alone"]],
  ["translation_not_equivalence", "concept.translation_equivalence_boundary", "concept.naming_reference_distinction", "constrains", ["name", "meaning shift"], ["no perfect one-to-one"]],
  ["public_private_law_lit", "concept.public_private_boundary", "concept.authority_legitimacy", "bridges", ["role", "institution"], ["not legal advice"]],
  ["analogy_not_identity", "concept.analogy_not_identity", "concept.same_or_different_question", "constrains", ["shared axis", "scope"], ["not identity"]],
  ["affective_not_diagnosis", "concept.affective_association_boundary", "concept.memory_vs_fact", "constrains", ["association", "memory"], ["not diagnosis"]],
  ["food_memory_literature", "concept.food_as_social_ritual", "concept.memory_vs_fact", "bridges", ["memory", "ritual"], ["not nutrition claim"]],
  ["craft_practice_learning", "concept.craft_knowledge", "concept.practice_learning", "bridges", ["feedback", "skill"], ["not innate talent only"]],
  ["public_science_evidence", "concept.public_science_boundary", "concept.evidence_chain", "constrains", ["source", "claim"], ["no biomedical advice"]],
  ["protocol_rule_law", "concept.protocol_governance", "concept.rule_application_precedent", "bridges", ["rule", "application"], ["protocol is not statute"]],
  ["capability_freedom", "concept.capability", "concept.freedom_responsibility", "frames", ["real opportunity", "responsibility"], ["not personal productivity advice"]]
];

function manualRelations() {
  const source = [S.britannica("analogy"), S.britannica("evidence")];
  const activeKeys = new Set(manualRelationPairs.slice(0, 25).map((row) => row[0]));
  const baseRows = manualRelationPairs.map(([key, a, b, type, shared, contrast]) => relation({
    id: `relation.r26_bridge.${key}`,
    domain: "bridge_boundary",
    relation_type: type,
    source_ids: [a],
    target_ids: [b],
    shared_axes: shared,
    contrast_axes: contrast,
    licensed_verbs: ["distinguishes", "frames", "constrains", "helps_compare"],
    constraints: ["preserve domain difference", "do not infer identity"],
    negative_moves: ["analogy_is_not_identity", "same_word_is_not_same_concept"],
    boundary_notes: ["Use only for bounded comparison."],
    provenance: source,
    transfer: ["same_or_different_question", "concept_followup", "non_question_uptake"],
    active: activeKeys.has(key),
    boundary: true
  }));

  const denseRows = [];
  const bridgeConcepts = concepts.map((row) => row.id);
  for (let i = 0; i < bridgeConcepts.length - 1; i += 2) {
    denseRows.push(relation({
      id: `relation.r26_source_bridge.${bridgeConcepts[i].replace("concept.", "")}.${bridgeConcepts[i + 1].replace("concept.", "")}`,
      domain: "bridge_boundary",
      relation_type: "source_library_bridge",
      source_ids: [bridgeConcepts[i]],
      target_ids: [bridgeConcepts[i + 1]],
      shared_axes: ["comparison support", "concept transfer"],
      contrast_axes: ["keep local domain meaning"],
      licensed_verbs: ["can_be_compared_with", "helps_frame", "contrasts_with"],
      constraints: ["source library support only", "do not collapse domains"],
      negative_moves: ["analogy_is_not_identity", "avoid_generic_abstraction"],
      boundary_notes: ["Optional source-library bridge; not a final answer."],
      provenance: source,
      transfer: ["comparison", "topic_reentry", "concept_followup"],
      active: false,
      scope: "source_only",
      boundary: true
    }));
  }
  return [...baseRows, ...denseRows];
}

function collectRefs(card) {
  const refs = [];
  const add = (id) => {
    if (typeof id === "string" && /^(person|work|concept|theme|movement|period|genre)\./.test(id)) refs.push(id);
  };
  for (const field of ["works", "representative_works", "related_concepts", "related_people", "relation_ids", "source_ids", "target_ids", "creator_ids", "example_ids"]) {
    if (Array.isArray(card[field])) card[field].forEach(add);
  }
  if (Array.isArray(card.related_entities)) card.related_entities.forEach((item) => add(item?.id));
  return refs;
}

function demote(card) {
  card.visibility = "local";
  card.approved_for_public_runtime = false;
  card.runtime_default = false;
  card.runtime_scope = card.runtime_scope === "optional_long_tail" ? "optional_long_tail" : "source_only";
  card.activation_priority = 9;
  card.local_first_risk = "kept_out_of_default_bundle";
  card.bundle_weight_estimate = "source_only";
}

function targetFile(card) {
  if (card.entity_type === "relation") return FILE_C;
  if (["world_literature_extension", "global_cinema_extension", "global_music_culture"].includes(card.pack_id)) return FILE_A;
  return FILE_B;
}

function uniqueCards(candidates, existing) {
  const seen = new Set();
  const out = [];
  for (const card of candidates) {
    if (existing.all.has(card.id) || seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}

function writeOutputs(cards) {
  fs.mkdirSync(CARD_DIR, { recursive: true });
  const buckets = new Map([[FILE_A, []], [FILE_B, []], [FILE_C, []]]);
  for (const card of cards) buckets.get(targetFile(card)).push(card);
  for (const [file, rows] of buckets) {
    fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  }
}

function main() {
  const existing = existingMaps();
  const candidates = [];
  for (const row of anchors) {
    candidates.push(person(row));
    for (const workRow of row.works) candidates.push(work(workRow, row));
    candidates.push(...derivedRelationsForAnchor(row));
  }
  for (const row of concepts) candidates.push(concept(row));
  candidates.push(...manualRelations());

  const cards = uniqueCards(candidates, existing);

  let changed = true;
  while (changed) {
    changed = false;
    const activeIds = new Set(existing.active);
    for (const card of cards) {
      if (card.visibility === "public" && card.approved_for_public_runtime === true) activeIds.add(card.id);
    }
    for (const card of cards) {
      if (card.visibility !== "public" || card.approved_for_public_runtime !== true) continue;
      const missing = collectRefs(card).filter((id) => !activeIds.has(id));
      if (missing.length > 0) {
        demote(card);
        changed = true;
      }
    }
  }

  writeOutputs(cards);
  const active = cards.filter((card) => card.visibility === "public" && card.approved_for_public_runtime === true).length;
  const relationLike = cards.filter((card) => card.entity_type === "relation" || ["bridge_pack", "boundary_pack"].includes(card.runtime_scope)).length;
  console.log(JSON.stringify({
    execution_ok: true,
    r26_cards_written: cards.length,
    active_cards_written: active,
    source_or_optional_cards_written: cards.length - active,
    relation_like_cards_written: relationLike,
    relation_like_share: Number((relationLike / Math.max(1, cards.length)).toFixed(3)),
    files: {
      world_literature_cinema_music: path.relative(ROOT, FILE_A),
      image_thought_daily_boundary: path.relative(ROOT, FILE_B),
      bridge_negative_boundary: path.relative(ROOT, FILE_C)
    }
  }, null, 2));
}

main();
