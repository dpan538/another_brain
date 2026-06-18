import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CARD_DIR = path.join(ROOT, "data", "culture_cards");
const FILE_A = path.join(CARD_DIR, "r27_inventory_first_world_lit_cinema_music.jsonl");
const FILE_B = path.join(CARD_DIR, "r27_inventory_first_daily_thought_boundary.jsonl");
const FILE_C = path.join(CARD_DIR, "r27_inventory_first_bridge_closure.jsonl");
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

const ACTIVE_CONCEPTS = new Set([
  "concept.concept_explanation_not_advice",
  "concept.rule_not_answer",
  "concept.interface_not_visual_styling",
  "concept.public_space_not_travel_advice",
  "concept.market_not_society",
  "concept.food_taste_not_nutrition",
  "concept.technology_history_not_support",
  "concept.evidence_not_anecdote",
  "concept.model_not_reality",
  "concept.recommendation_criterion",
  "concept.representative_work_spine",
  "concept.topic_reentry_anchor",
  "concept.false_equivalence_guard",
  "concept.example_not_precedent",
  "concept.documentary_ethics",
  "concept.archival_image",
  "concept.close_reading",
  "concept.comparative_literature",
  "concept.lyric_subject",
  "concept.city_walk",
  "concept.recipe_not_rule",
  "concept.care_boundary_static_card",
  "concept.memory_not_diagnosis",
  "concept.source_library_pack",
  "concept.active_loaded_pack"
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

function meta({ pack_id, runtime_scope = "source_only", active = false, purpose = [] }) {
  return {
    runtime_scope: active ? (runtime_scope === "source_only" ? "bridge_pack" : runtime_scope) : runtime_scope,
    pack_id,
    activation_priority: active ? 6 : 9,
    source_library_tier: active ? "r27_active_high_transfer" : "r27_source_library",
    runtime_default: false,
    local_first_risk: active ? "low_bundle_risk" : "kept_out_of_default_bundle",
    bundle_weight_estimate: active ? "small" : "source_only",
    purpose_class: purpose,
    visibility: active ? "public" : "local",
    approved_for_public_runtime: active
  };
}

function base({ id, entity_type, names, domain, factual_core, themes = [], related_entities = [], comparison_axes = [], metadata }) {
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
    source_summary: "R27 inventory-first source card; compact primitives only.",
    confidence: 0.82,
    visibility: metadata.visibility,
    approved_for_public_runtime: metadata.approved_for_public_runtime,
    not_to_infer: [
      "complete canon",
      "private motive",
      "direct influence without evidence",
      "identity equivalence from analogy",
      "current professional advice"
    ],
    needs_review: false,
    eval_tags: ["r27", entity_type],
    ...metadata
  };
}

function person(row) {
  const metadata = meta({
    pack_id: row.pack,
    runtime_scope: row.scope || "optional_long_tail",
    active: false,
    purpose: ["closes_person_work_loop", "source_library_breadth"]
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
      metadata
    }),
    roles: row.roles,
    period: row.period,
    regions_languages: row.regions || [],
    works: row.works.map((work) => work.id),
    representative_works: row.works.map((work) => work.id),
    related_concepts: row.concepts,
    related_people: row.people || [],
    negative_moves: ["do_not_infer_private_motive", "do_not_treat_as_complete_field"],
    uncertainty_notes: ["source-library summary only"],
    provenance: row.provenance,
    transfer_scope: row.transfer,
    turn_functions: ["identify_person", "list_representative_works", "explain_characteristics", "compare_people", "topic_reentry"]
  };
}

function work(row, owner) {
  const metadata = meta({
    pack_id: owner.pack,
    runtime_scope: owner.scope || "optional_long_tail",
    active: false,
    purpose: ["closes_work_concept_loop", "source_library_breadth"]
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
      metadata
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
  const active = ACTIVE_CONCEPTS.has(row.id);
  const metadata = meta({
    pack_id: row.pack,
    runtime_scope: row.boundary ? "boundary_pack" : (active ? "bridge_pack" : "source_only"),
    active,
    purpose: row.boundary ? ["adds_boundary_guardrail", "supports_false_equivalence_rejection"] : ["adds_concept_distinction", "supports_concept_followup"]
  });
  return {
    ...base({
      id: row.id,
      entity_type: "concept",
      names: row.names,
      domain: row.domain,
      factual_core: `${row.names.at(-1)} concept scaffold.`,
      themes: row.related || [],
      related_entities: (row.related || []).map((id) => ({ id, relation: "related_concept" })),
      comparison_axes: row.units,
      metadata
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

function relation(row) {
  const active = row.active === true;
  const metadata = meta({
    pack_id: row.pack || "bridge_negative_boundary_layer",
    runtime_scope: row.boundary ? "boundary_pack" : (active ? "bridge_pack" : "source_only"),
    active,
    purpose: row.purpose || ["adds_relation_closure", "supports_comparison"]
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
      metadata
    }),
    relation_type: row.relation_type,
    source_ids: row.source_ids,
    target_ids: row.target_ids,
    shared_axes: row.shared_axes,
    contrast_axes: row.contrast_axes || [],
    licensed_verbs: row.licensed_verbs || ["contrasts_with", "helps_frame", "helps_compare"],
    example_ids: row.example_ids || [],
    constraints: row.constraints || ["preserve domain difference", "do not infer causation without evidence"],
    negative_moves: row.negative_moves || ["analogy_is_not_identity", "avoid_totalizing_claim"],
    boundary_notes: row.boundary_notes || ["Relation supports bounded comparison only."],
    provenance: row.provenance,
    transfer_scope: row.transfer,
    turn_functions: ["explain_relation", "compare_forms", "concept_followup", "topic_reentry", "meaningful_non_question"]
  };
}

function anchor(id, names, domain, roles, period, works, concepts, axes, pack, provenance, transfer, scope = "optional_long_tail") {
  return { id, names, domain, roles, period, works, concepts, axes, pack, provenance, transfer, scope };
}

function w(id, names, type, concepts, axes, summary) {
  return { id, names, type, concepts, axes, summary };
}

const anchors = [
  anchor("person.yi_sang", ["李箱", "Yi Sang"], "literature.korean", ["writer"], "20th_century", [w("work.wings_yi_sang", ["翼", "Wings"], "short_story", ["concept.modernist_interiority", "concept.fragmented_subject"], ["interiority", "fragment", "city"], ["interiority", "fragment", "urban unease"]), w("work.crow_eye_view", ["乌瞰图", "Crow's Eye View"], "poetry_sequence", ["concept.modernist_poetry", "concept.visual_arrangement"], ["poetry", "form", "arrangement"], ["visual arrangement", "poetic form", "modernity"])], ["concept.modernist_interiority", "concept.fragmented_subject"], ["interiority", "city", "form"], "world_literature_extension", [S.britannica("Yi Sang")], ["literature", "modernism", "city"]),
  anchor("person.naguib_mahfouz", ["纳吉布·马哈福兹", "Naguib Mahfouz"], "literature.world", ["novelist"], "20th_century", [w("work.cairo_trilogy", ["开罗三部曲", "Cairo Trilogy"], "novel_cycle", ["concept.city_memory", "concept.family_history"], ["city", "family", "history"], ["city memory", "family history", "social change"]), w("work.children_of_gebelawi", ["盖巴拉维的孩子们", "Children of Gebelawi"], "novel", ["concept.allegory", "concept.religious_allusion_boundary"], ["allegory", "community", "boundary"], ["allegory", "community", "interpretive boundary"])], ["concept.city_memory", "concept.family_history"], ["city", "family", "history"], "world_literature_extension", [S.nobel("Naguib Mahfouz"), S.britannica("Naguib Mahfouz")], ["literature", "city", "history"]),
  anchor("person.wole_soyinka", ["沃莱·索因卡", "Wole Soyinka"], "literature.world", ["playwright", "writer"], "20th_21st_century", [w("work.death_kings_horseman", ["国王的骑士之死", "Death and the King's Horseman"], "play", ["concept.tragedy_cross_cultural", "concept.ritual_boundary"], ["ritual", "tragedy", "colonial encounter"], ["ritual", "tragedy", "colonial encounter"]), w("work.ake_years_childhood", ["阿凯：童年岁月", "Ake: The Years of Childhood"], "memoir", ["concept.memory_vs_fact", "concept.childhood_memory"], ["memory", "childhood", "place"], ["childhood memory", "place", "memoir boundary"])], ["concept.tragedy_cross_cultural", "concept.memory_vs_fact"], ["ritual", "memory", "public voice"], "world_literature_extension", [S.nobel("Wole Soyinka"), S.britannica("Wole Soyinka")], ["literature", "theater", "history"]),
  anchor("person.nadine_gordimer", ["纳丁·戈迪默", "Nadine Gordimer"], "literature.world", ["novelist"], "20th_21st_century", [w("work.julys_people", ["七月的人民", "July's People"], "novel", ["concept.public_private_boundary", "concept.political_household"], ["household", "politics", "future"], ["household politics", "future crisis", "social relation"]), w("work.conservationist", ["保护主义者", "The Conservationist"], "novel", ["concept.land_ownership", "concept.social_order"], ["land", "class", "order"], ["land ownership", "class", "social order"])], ["concept.public_private_boundary", "concept.social_order"], ["household", "land", "politics"], "world_literature_extension", [S.nobel("Nadine Gordimer"), S.britannica("Nadine Gordimer")], ["literature", "history", "law_boundary"]),
  anchor("person.chimamanda_adichie", ["奇玛曼达·恩戈齐·阿迪契", "Chimamanda Ngozi Adichie"], "literature.world", ["novelist"], "21st_century", [w("work.half_yellow_sun", ["半轮黄日", "Half of a Yellow Sun"], "novel", ["concept.historical_trauma", "concept.witness_testimony"], ["war", "memory", "family"], ["war memory", "family", "witness"]), w("work.americanah", ["美国佬", "Americanah"], "novel", ["concept.migration_identity", "concept.public_private_boundary"], ["migration", "voice", "identity"], ["migration identity", "voice", "social observation"])], ["concept.migration_identity", "concept.witness_testimony"], ["migration", "history", "voice"], "world_literature_extension", [S.britannica("Chimamanda Ngozi Adichie")], ["literature", "migration", "identity"]),
  anchor("person.doris_lessing", ["多丽丝·莱辛", "Doris Lessing"], "literature.english", ["novelist"], "20th_21st_century", [w("work.golden_notebook", ["金色笔记", "The Golden Notebook"], "novel", ["concept.fragmented_form", "concept.notebook_form"], ["notebook", "fragment", "identity"], ["notebook form", "fragment", "identity"]), w("work.grass_is_singing", ["野草在歌唱", "The Grass Is Singing"], "novel", ["concept.colonial_discourse_boundary", "concept.social_order"], ["colonial relation", "household", "violence"], ["colonial relation", "household", "violence boundary"])], ["concept.fragmented_form", "concept.colonial_discourse_boundary"], ["fragment", "identity", "colonial relation"], "world_literature_extension", [S.nobel("Doris Lessing"), S.britannica("Doris Lessing")], ["literature", "social_thought", "form"]),
  anchor("person.sylvia_plath", ["西尔维娅·普拉斯", "Sylvia Plath"], "literature.english", ["poet", "novelist"], "20th_century", [w("work.ariel_plath", ["爱丽儿", "Ariel"], "poetry_collection", ["concept.lyric_subject", "concept.care_boundary_static_card"], ["lyric voice", "image", "care boundary"], ["lyric subject", "image intensity", "care boundary"]), w("work.bell_jar", ["钟形罩", "The Bell Jar"], "novel", ["concept.care_boundary_static_card", "concept.narrative_identity"], ["voice", "mental distress", "fiction boundary"], ["fiction voice", "distress boundary", "identity"])], ["concept.lyric_subject", "concept.care_boundary_static_card"], ["voice", "image", "care boundary"], "world_literature_extension", [S.britannica("Sylvia Plath")], ["poetry", "care_boundary", "literature"]),
  anchor("person.zora_neale_hurston", ["佐拉·尼尔·赫斯顿", "Zora Neale Hurston"], "literature.american", ["novelist", "anthropologist"], "20th_century", [w("work.their_eyes_watching_god", ["他们眼望上苍", "Their Eyes Were Watching God"], "novel", ["concept.voice_orality", "concept.community_voice"], ["voice", "community", "desire"], ["orality", "community voice", "desire"]), w("work.mules_and_men", ["骡子与人", "Mules and Men"], "folklore_text", ["concept.folklore_recording", "concept.witness_testimony"], ["folklore", "record", "voice"], ["folklore recording", "voice", "field context"])], ["concept.voice_orality", "concept.community_voice"], ["voice", "folklore", "community"], "world_literature_extension", [S.britannica("Zora Neale Hurston")], ["literature", "folklore", "music"]),
  anchor("person.flannery_oconnor", ["弗兰纳里·奥康纳", "Flannery O'Connor"], "literature.american", ["writer"], "20th_century", [w("work.good_man_hard_find", ["好人难寻", "A Good Man Is Hard to Find"], "short_story", ["concept.short_story_pressure", "concept.moral_distance"], ["short form", "violence", "moral distance"], ["short story pressure", "violence", "moral distance"]), w("work.wise_blood", ["慧血", "Wise Blood"], "novel", ["concept.grotesque", "concept.moral_conflict"], ["grotesque", "faith", "conflict"], ["grotesque", "faith", "moral conflict"])], ["concept.short_story_pressure", "concept.grotesque"], ["short form", "moral distance", "grotesque"], "world_literature_extension", [S.britannica("Flannery O'Connor")], ["literature", "short_story", "ethics"]),
  anchor("person.alice_munro", ["艾丽丝·门罗", "Alice Munro"], "literature.english", ["short story writer"], "20th_21st_century", [w("work.dear_life", ["亲爱的生活", "Dear Life"], "short_story_collection", ["concept.short_story_pressure", "concept.memory_vs_fact"], ["short story", "memory", "ordinary life"], ["short story pressure", "memory", "ordinary life"]), w("work.runaway_munro", ["逃离", "Runaway"], "short_story_collection", ["concept.open_ending", "concept.domestic_space_film"], ["open ending", "domestic relation", "choice"], ["open ending", "domestic relation", "choice"])], ["concept.short_story_pressure", "concept.open_ending"], ["short form", "memory", "ordinary life"], "world_literature_extension", [S.nobel("Alice Munro"), S.britannica("Alice Munro")], ["literature", "memory", "short_story"]),
  anchor("person.margaret_atwood", ["玛格丽特·阿特伍德", "Margaret Atwood"], "literature.english", ["novelist", "poet"], "20th_21st_century", [w("work.handmaids_tale", ["使女的故事", "The Handmaid's Tale"], "novel", ["concept.speculative_warning", "concept.law_concept_not_advice"], ["speculative frame", "law", "body"], ["speculative warning", "law boundary", "body"]), w("work.alias_grace", ["别名格蕾丝", "Alias Grace"], "novel", ["concept.witness_testimony", "concept.memory_vs_fact"], ["testimony", "memory", "crime"], ["testimony", "memory", "evidence boundary"])], ["concept.speculative_warning", "concept.witness_testimony"], ["speculative", "testimony", "law boundary"], "world_literature_extension", [S.britannica("Margaret Atwood")], ["literature", "law_boundary", "memory"]),
  anchor("person.roberto_bolano", ["罗贝托·波拉尼奥", "Roberto Bolano"], "literature.latin_american", ["novelist", "poet"], "20th_21st_century", [w("work.savage_detectives", ["荒野侦探", "The Savage Detectives"], "novel", ["concept.exile", "concept.fragmented_form"], ["poetry", "exile", "fragment"], ["poetry scene", "exile", "fragmented form"]), w("work.2666", ["2666", "2666"], "novel", ["concept.witness_testimony", "concept.violence_power_boundary"], ["violence", "testimony", "archive"], ["testimony", "archive", "violence boundary"])], ["concept.exile", "concept.witness_testimony"], ["exile", "archive", "violence boundary"], "world_literature_extension", [S.britannica("Roberto Bolano")], ["literature", "poetry", "history"]),
  anchor("person.juan_rulfo", ["胡安·鲁尔福", "Juan Rulfo"], "literature.latin_american", ["writer"], "20th_century", [w("work.pedro_paramo", ["佩德罗·巴拉莫", "Pedro Paramo"], "novel", ["concept.memory_vs_fact", "concept.voice_orality"], ["voice", "dead", "memory"], ["voice", "memory", "rural world"]), w("work.burning_plain", ["燃烧的原野", "The Burning Plain"], "short_story_collection", ["concept.short_story_pressure", "concept.rural_memory"], ["short story", "rural", "violence"], ["short story pressure", "rural memory", "violence boundary"])], ["concept.voice_orality", "concept.rural_memory"], ["voice", "rural", "memory"], "world_literature_extension", [S.britannica("Juan Rulfo")], ["literature", "memory", "voice"]),
  anchor("person.octavio_paz", ["奥克塔维奥·帕斯", "Octavio Paz"], "literature.latin_american", ["poet", "essayist"], "20th_century", [w("work.labyrinth_of_solitude", ["孤独的迷宫", "The Labyrinth of Solitude"], "essay", ["concept.identity_boundary", "concept.public_private_boundary"], ["identity", "nation", "essay"], ["identity boundary", "nation essay", "public private"]), w("work.sunstone_paz", ["太阳石", "Sunstone"], "poem", ["concept.lyric_subject", "concept.cyclical_time"], ["poem", "time", "voice"], ["lyric subject", "cyclical time", "voice"])], ["concept.identity_boundary", "concept.lyric_subject"], ["poetry", "identity", "time"], "world_literature_extension", [S.nobel("Octavio Paz"), S.britannica("Octavio Paz")], ["literature", "poetry", "identity"]),
  anchor("person.mario_vargas_llosa", ["马里奥·巴尔加斯·略萨", "Mario Vargas Llosa"], "literature.latin_american", ["novelist"], "20th_21st_century", [w("work.time_of_hero", ["城市与狗", "The Time of the Hero"], "novel", ["concept.institution", "concept.power_formation"], ["school", "institution", "power"], ["institution", "power formation", "youth"]), w("work.conversation_cathedral", ["酒吧长谈", "Conversation in the Cathedral"], "novel", ["concept.public_private_boundary", "concept.political_city"], ["conversation", "politics", "city"], ["conversation frame", "politics", "city"])], ["concept.institution", "concept.public_private_boundary"], ["institution", "conversation", "politics"], "world_literature_extension", [S.nobel("Mario Vargas Llosa"), S.britannica("Mario Vargas Llosa")], ["literature", "political_thought", "city"]),
  anchor("person.alejo_carpentier", ["阿莱霍·卡彭铁尔", "Alejo Carpentier"], "literature.latin_american", ["novelist"], "20th_century", [w("work.kingdom_this_world", ["人间王国", "The Kingdom of This World"], "novel", ["concept.magical_realism", "concept.historical_trauma"], ["history", "marvelous real", "revolution"], ["marvelous real", "history", "revolution"]), w("work.lost_steps", ["消失的足迹", "The Lost Steps"], "novel", ["concept.exile", "concept.travel_memory"], ["travel", "memory", "time"], ["travel memory", "time", "exile"])], ["concept.magical_realism", "concept.historical_trauma"], ["history", "marvelous", "travel"], "world_literature_extension", [S.britannica("Alejo Carpentier")], ["literature", "history", "music"]),

  anchor("person.claire_denis", ["克莱尔·德尼", "Claire Denis"], "film.world", ["film director"], "20th_21st_century", [w("work.beau_travail", ["军中禁恋", "Beau Travail"], "film", ["concept.body_movement", "concept.military_space"], ["body", "movement", "ritual"], ["body movement", "ritual", "military space"]), w("work.35_shots_rum", ["35杯朗姆酒", "35 Shots of Rum"], "film", ["concept.domestic_space_film", "concept.everyday_time"], ["home", "family", "everyday time"], ["home space", "family", "everyday rhythm"])], ["concept.body_movement", "concept.everyday_time"], ["body", "space", "everyday"], "global_cinema_extension", [S.bfi("Claire Denis")], ["film", "body", "daily_life"]),
  anchor("person.spike_lee", ["斯派克·李", "Spike Lee"], "film.american", ["film director"], "20th_21st_century", [w("work.do_the_right_thing", ["为所应为", "Do the Right Thing"], "film", ["concept.public_space", "concept.city_heat"], ["street", "race", "public space"], ["public space", "heat", "community conflict"]), w("work.malcolm_x_film", ["马尔科姆X", "Malcolm X"], "film", ["concept.biographical_film", "concept.public_memory"], ["biography", "public memory", "history"], ["biographical film", "public memory", "history"])], ["concept.public_space", "concept.public_memory"], ["street", "public memory", "conflict"], "global_cinema_extension", [S.bfi("Spike Lee"), S.britannica("Spike Lee")], ["film", "city", "public_memory"]),
  anchor("person.francis_coppola", ["弗朗西斯·科波拉", "Francis Ford Coppola"], "film.american", ["film director"], "20th_21st_century", [w("work.godfather_film", ["教父", "The Godfather"], "film", ["concept.family_power", "concept.institution"], ["family", "power", "institution"], ["family power", "institution", "genre"]), w("work.apocalypse_now", ["现代启示录", "Apocalypse Now"], "film", ["concept.adaptation_transformation", "concept.war_memory"], ["war", "adaptation", "journey"], ["adaptation", "war memory", "journey"])], ["concept.family_power", "concept.adaptation_transformation"], ["family", "genre", "adaptation"], "global_cinema_extension", [S.bfi("Francis Ford Coppola"), S.britannica("Francis Ford Coppola")], ["film", "literature", "genre"]),
  anchor("person.martin_scorsese", ["马丁·斯科塞斯", "Martin Scorsese"], "film.american", ["film director"], "20th_21st_century", [w("work.taxi_driver", ["出租车司机", "Taxi Driver"], "film", ["concept.city_alienation", "concept.unreliable_viewpoint"], ["city", "alienation", "viewpoint"], ["city alienation", "viewpoint", "violence boundary"]), w("work.raging_bull", ["愤怒的公牛", "Raging Bull"], "film", ["concept.body_performance", "concept.biographical_film"], ["body", "performance", "biography"], ["body performance", "biographical film", "self destruction boundary"])], ["concept.city_alienation", "concept.unreliable_viewpoint"], ["city", "viewpoint", "body"], "global_cinema_extension", [S.bfi("Martin Scorsese"), S.britannica("Martin Scorsese")], ["film", "city", "biography"]),
  anchor("person.maya_deren", ["玛雅·德伦", "Maya Deren"], "film.experimental", ["film director"], "20th_century", [w("work.meshes_afternoon", ["午后的迷惘", "Meshes of the Afternoon"], "film", ["concept.experimental_film", "concept.dream_image"], ["dream", "image", "repetition"], ["dream image", "repetition", "experimental form"]), w("work.divine_horsemen", ["神圣骑士", "Divine Horsemen"], "film", ["concept.documentary_ethics", "concept.ritual_boundary"], ["ritual", "documentary", "ethics"], ["documentary ethics", "ritual boundary", "field context"])], ["concept.experimental_film", "concept.documentary_ethics"], ["dream", "ritual", "experimental"], "global_cinema_extension", [S.bfi("Maya Deren")], ["film", "dance", "anthropology_boundary"]),
  anchor("person.chris_marker", ["克里斯·马克", "Chris Marker"], "film.essay", ["film director"], "20th_21st_century", [w("work.la_jetee", ["堤", "La Jetee"], "film", ["concept.memory_film", "concept.photographic_sequence"], ["memory", "still image", "time"], ["still image sequence", "memory", "time"]), w("work.sans_soleil", ["日月无光", "Sans Soleil"], "essay_film", ["concept.essay_film", "concept.memory_vs_fact"], ["essay", "memory", "travel"], ["essay film", "memory", "travel image"])], ["concept.essay_film", "concept.memory_vs_fact"], ["memory", "image", "essay"], "global_cinema_extension", [S.bfi("Chris Marker")], ["film", "photography", "memory"]),
  anchor("person.alain_resnais", ["阿伦·雷乃", "Alain Resnais"], "film.world", ["film director"], "20th_century", [w("work.hiroshima_mon_amour", ["广岛之恋", "Hiroshima mon amour"], "film", ["concept.memory_film", "concept.historical_trauma"], ["memory", "history", "love"], ["memory film", "historical trauma", "love"]), w("work.last_year_marienbad", ["去年在马里昂巴德", "Last Year at Marienbad"], "film", ["concept.memory_vs_fact", "concept.ambiguous_time"], ["memory", "time", "uncertainty"], ["memory uncertainty", "time", "space"])], ["concept.memory_film", "concept.ambiguous_time"], ["memory", "time", "history"], "global_cinema_extension", [S.bfi("Alain Resnais"), S.britannica("Alain Resnais")], ["film", "memory", "history"]),
  anchor("person.ousmane_sembene", ["奥斯曼·塞姆班", "Ousmane Sembene"], "film.world", ["film director", "writer"], "20th_century", [w("work.black_girl", ["黑女孩", "Black Girl"], "film", ["concept.postcolonial_memory", "concept.work_domestic_space"], ["migration", "work", "domestic space"], ["migration", "work relation", "domestic space"]), w("work.xala", ["哈拉", "Xala"], "film", ["concept.satire", "concept.institution"], ["satire", "postcolonial institution", "body"], ["satire", "institution", "body boundary"])], ["concept.postcolonial_memory", "concept.institution"], ["migration", "satire", "institution"], "global_cinema_extension", [S.bfi("Ousmane Sembene"), S.britannica("Ousmane Sembene")], ["film", "literature", "postcolonial_memory"]),
  anchor("person.apichatpong", ["阿彼察邦·韦拉斯哈古", "Apichatpong Weerasethakul"], "film.world", ["film director"], "21st_century", [w("work.uncle_boonmee", ["能召回前世的布米叔叔", "Uncle Boonmee Who Can Recall His Past Lives"], "film", ["concept.memory_film", "concept.dream_image"], ["memory", "dream", "forest"], ["memory film", "dream image", "forest"]), w("work.tropical_malady", ["热带疾病", "Tropical Malady"], "film", ["concept.story_split", "concept.body_landscape"], ["split story", "body", "landscape"], ["split story", "body landscape", "myth boundary"])], ["concept.memory_film", "concept.dream_image"], ["memory", "dream", "landscape"], "global_cinema_extension", [S.bfi("Apichatpong Weerasethakul")], ["film", "memory", "landscape"]),
  anchor("person.bong_joon_ho", ["奉俊昊", "Bong Joon Ho"], "film.korean", ["film director"], "21st_century", [w("work.parasite_film", ["寄生虫", "Parasite"], "film", ["concept.class_space", "concept.house_as_system"], ["class", "space", "house"], ["class space", "house system", "genre shift"]), w("work.memories_murder", ["杀人回忆", "Memories of Murder"], "film", ["concept.investigation_failure", "concept.memory_vs_fact"], ["investigation", "memory", "institution"], ["investigation failure", "memory", "institution"])], ["concept.class_space", "concept.investigation_failure"], ["class", "genre", "institution"], "global_cinema_extension", [S.bfi("Bong Joon Ho"), S.britannica("Bong Joon Ho")], ["film", "city", "institution"]),
  anchor("person.park_chan_wook", ["朴赞郁", "Park Chan-wook"], "film.korean", ["film director"], "21st_century", [w("work.oldboy", ["老男孩", "Oldboy"], "film", ["concept.revenge_structure", "concept.violence_power_boundary"], ["revenge", "violence", "plot"], ["revenge structure", "violence boundary", "plot twist"]), w("work.handmaiden", ["小姐", "The Handmaiden"], "film", ["concept.adaptation_transformation", "concept.gaze_image"], ["adaptation", "gaze", "deception"], ["adaptation transformation", "gaze", "deception"])], ["concept.revenge_structure", "concept.adaptation_transformation"], ["genre", "gaze", "adaptation"], "global_cinema_extension", [S.bfi("Park Chan-wook")], ["film", "genre", "literature"]),
  anchor("person.ken_loach", ["肯·洛奇", "Ken Loach"], "film.world", ["film director"], "20th_21st_century", [w("work.kes", ["小孩与鹰", "Kes"], "film", ["concept.social_realism", "concept.education_boundary"], ["school", "class", "youth"], ["social realism", "school", "class"]), w("work.i_daniel_blake", ["我是布莱克", "I Daniel Blake"], "film", ["concept.institution", "concept.concept_explanation_not_advice"], ["welfare", "institution", "boundary"], ["institution", "welfare boundary", "social realism"])], ["concept.social_realism", "concept.institution"], ["social realism", "class", "institution"], "global_cinema_extension", [S.bfi("Ken Loach")], ["film", "economy", "law_boundary"]),

  anchor("person.aretha_franklin", ["艾瑞莎·富兰克林", "Aretha Franklin"], "music.global", ["singer"], "20th_21st_century", [w("work.i_never_loved_man", ["I Never Loved a Man", "I Never Loved a Man"], "album", ["concept.voice_persona", "concept.soul_music"], ["voice", "soul", "performance"], ["voice persona", "soul", "performance"]), w("work.amazing_grace_album", ["Amazing Grace", "Amazing Grace"], "album", ["concept.gospel_music", "concept.performance_context"], ["gospel", "voice", "live"], ["gospel music", "live performance", "voice"])], ["concept.soul_music", "concept.voice_persona"], ["voice", "performance", "gospel"], "global_music_culture", [S.britannica("Aretha Franklin")], ["music", "public_memory", "performance"]),
  anchor("person.james_brown", ["詹姆斯·布朗", "James Brown"], "music.global", ["singer", "bandleader"], "20th_century", [w("work.live_apollo", ["Live at the Apollo", "Live at the Apollo"], "album", ["concept.performance_context", "concept.funk"], ["live", "rhythm", "band"], ["live performance", "rhythm", "band"]), w("work.sex_machine", ["Sex Machine", "Sex Machine"], "song", ["concept.funk", "concept.song_copyright_boundary"], ["rhythm", "groove", "song boundary"], ["funk groove", "rhythm", "copyright boundary"])], ["concept.funk", "concept.performance_context"], ["rhythm", "groove", "performance"], "global_music_culture", [S.britannica("James Brown")], ["music", "dance", "performance"]),
  anchor("person.stevie_wonder", ["史蒂夫·旺德", "Stevie Wonder"], "music.global", ["singer-songwriter"], "20th_21st_century", [w("work.songs_key_life", ["生命之歌", "Songs in the Key of Life"], "album", ["concept.album_as_form", "concept.soul_music"], ["album", "songwriting", "social range"], ["album form", "songwriting", "social range"]), w("work.innervisions", ["内在视界", "Innervisions"], "album", ["concept.album_as_form", "concept.public_voice_music"], ["album", "public voice", "arrangement"], ["album form", "public voice", "arrangement"])], ["concept.album_as_form", "concept.public_voice_music"], ["album", "voice", "arrangement"], "global_music_culture", [S.britannica("Stevie Wonder")], ["music", "album_form", "public_memory"]),
  anchor("person.marvin_gaye", ["马文·盖伊", "Marvin Gaye"], "music.global", ["singer"], "20th_century", [w("work.whats_going_on", ["What's Going On", "What's Going On"], "album", ["concept.album_as_form", "concept.public_voice_music"], ["album", "public voice", "soul"], ["album form", "public voice", "soul"]), w("work.lets_get_it_on", ["Let's Get It On", "Let's Get It On"], "album", ["concept.voice_persona", "concept.soul_music"], ["voice", "soul", "intimacy"], ["voice persona", "soul", "intimacy boundary"])], ["concept.soul_music", "concept.public_voice_music"], ["voice", "album", "public_memory"], "global_music_culture", [S.britannica("Marvin Gaye")], ["music", "public_memory", "voice"]),
  anchor("person.talking_heads", ["Talking Heads", "Talking Heads"], "music.global", ["band"], "20th_century", [w("work.remain_in_light", ["Remain in Light", "Remain in Light"], "album", ["concept.electronic_music_repetition", "concept.groove_layer"], ["repetition", "groove", "studio"], ["repetition", "groove layer", "studio"]), w("work.stop_making_sense", ["Stop Making Sense", "Stop Making Sense"], "concert_film", ["concept.performance_context", "concept.music_film_bridge"], ["performance", "film", "stage"], ["performance context", "music film bridge", "stage"])], ["concept.groove_layer", "concept.music_film_bridge"], ["repetition", "performance", "film"], "global_music_culture", [S.britannica("Talking Heads")], ["music", "film", "performance"]),
  anchor("person.brian_eno", ["布莱恩·伊诺", "Brian Eno"], "music.global", ["musician", "producer"], "20th_21st_century", [w("work.music_for_airports", ["机场音乐", "Music for Airports"], "album", ["concept.ambient_music", "concept.listening_scene"], ["ambient", "space", "listening"], ["ambient music", "space", "listening scene"]), w("work.another_green_world", ["另一个绿色世界", "Another Green World"], "album", ["concept.studio_as_instrument", "concept.album_as_form"], ["studio", "album", "texture"], ["studio as instrument", "album form", "texture"])], ["concept.ambient_music", "concept.studio_as_instrument"], ["space", "texture", "studio"], "global_music_culture", [S.britannica("Brian Eno")], ["music", "design", "technology"]),
  anchor("person.public_enemy", ["公众敌人", "Public Enemy"], "music.global", ["group"], "20th_21st_century", [w("work.it_takes_nation", ["It Takes a Nation of Millions", "It Takes a Nation of Millions"], "album", ["concept.public_voice_music", "concept.sampling_boundary"], ["public voice", "sampling", "rhythm"], ["public voice", "sampling boundary", "rhythm"]), w("work.fear_black_planet", ["Fear of a Black Planet", "Fear of a Black Planet"], "album", ["concept.public_voice_music", "concept.album_as_form"], ["album", "public voice", "sound collage"], ["album form", "public voice", "sound collage"])], ["concept.public_voice_music", "concept.sampling_boundary"], ["public voice", "sampling", "album"], "global_music_culture", [S.britannica("Public Enemy")], ["music", "public_memory", "copyright_boundary"]),
  anchor("person.kate_bush", ["凯特·布什", "Kate Bush"], "music.global", ["singer-songwriter"], "20th_21st_century", [w("work.hounds_love", ["Hounds of Love", "Hounds of Love"], "album", ["concept.album_as_form", "concept.voice_persona"], ["album", "voice", "narrative"], ["album form", "voice persona", "narrative sequence"]), w("work.dreaming_kate_bush", ["The Dreaming", "The Dreaming"], "album", ["concept.voice_persona", "concept.studio_as_instrument"], ["voice", "studio", "character"], ["voice persona", "studio", "character"])], ["concept.voice_persona", "concept.album_as_form"], ["voice", "album", "studio"], "global_music_culture", [S.britannica("Kate Bush")], ["music", "theater", "voice"]),
  anchor("person.fela_kuti", ["费拉·库蒂", "Fela Kuti"], "music.global", ["musician"], "20th_century", [w("work.zombie_fela", ["Zombie", "Zombie"], "album", ["concept.afrobeat", "concept.public_voice_music"], ["afrobeat", "public voice", "rhythm"], ["afrobeat", "public voice", "rhythm"]), w("work.expensive_shit", ["Expensive Shit", "Expensive Shit"], "album", ["concept.afrobeat", "concept.song_copyright_boundary"], ["afrobeat", "satire", "song boundary"], ["afrobeat", "satire", "copyright boundary"])], ["concept.afrobeat", "concept.public_voice_music"], ["rhythm", "public voice", "satire"], "global_music_culture", [S.britannica("Fela Kuti")], ["music", "public_memory", "rhythm"]),

  anchor("person.georg_simmel", ["齐美尔", "Georg Simmel"], "city_public_space", ["sociologist"], "19th_20th_century", [w("work.metropolis_mental_life", ["大都会与精神生活", "The Metropolis and Mental Life"], "essay", ["concept.city_walk", "concept.public_private_boundary"], ["metropolis", "attention", "public life"], ["metropolis", "attention", "public life"]), w("work.philosophy_money", ["货币哲学", "The Philosophy of Money"], "social_theory_text", ["concept.market_not_society", "concept.value_relation"], ["money", "value", "society"], ["money", "value relation", "society boundary"])], ["concept.city_walk", "concept.market_not_society"], ["city", "attention", "value"], "city_food_daily_extension", [S.britannica("Georg Simmel")], ["city", "economy", "social_thought"]),
  anchor("person.michel_de_certeau", ["米歇尔·德·塞托", "Michel de Certeau"], "city_public_space", ["historian", "theorist"], "20th_century", [w("work.practice_everyday_life", ["日常生活实践", "The Practice of Everyday Life"], "theory_text", ["concept.city_walk", "concept.practice_learning"], ["walking", "practice", "everyday"], ["city walking", "practice", "everyday tactic"]), w("work.writing_history_certeau", ["书写历史", "The Writing of History"], "history_theory_text", ["concept.history_memory_boundary", "concept.narrative_identity"], ["history", "writing", "memory"], ["history writing", "memory boundary", "narrative"])], ["concept.city_walk", "concept.practice_learning"], ["walking", "practice", "history"], "city_food_daily_extension", [S.britannica("Michel de Certeau")], ["city", "history", "daily_life"]),
  anchor("person.marc_auge", ["马克·奥热", "Marc Auge"], "city_public_space", ["anthropologist"], "20th_21st_century", [w("work.non_places", ["非地点", "Non-Places"], "anthropology_text", ["concept.public_space_not_travel_advice", "concept.transit_space"], ["transit", "place", "modernity"], ["transit space", "place boundary", "modernity"]), w("work.in_metro", ["地铁之中", "In the Metro"], "anthropology_text", ["concept.city_walk", "concept.public_space"], ["metro", "city", "everyday"], ["metro", "city observation", "everyday"])], ["concept.public_space_not_travel_advice", "concept.transit_space"], ["transit", "place", "city"], "city_food_daily_extension", [S.britannica("Marc Auge")], ["city", "anthropology", "travel_boundary"]),
  anchor("person.dolores_hayden", ["多洛雷斯·海登", "Dolores Hayden"], "city_public_space", ["urban historian"], "20th_21st_century", [w("work.power_of_place", ["地方的力量", "The Power of Place"], "urban_history_text", ["concept.public_space", "concept.memory_vs_fact"], ["place", "memory", "public history"], ["place memory", "public history", "city"]), w("work.redesigning_american_dream", ["重设计美国梦", "Redesigning the American Dream"], "urban_design_text", ["concept.domestic_space_film", "concept.public_private_boundary"], ["home", "city", "gender"], ["home city relation", "public private boundary", "gender"])], ["concept.public_space", "concept.memory_vs_fact"], ["place", "memory", "home"], "city_food_daily_extension", [S.official("MIT Press:Dolores Hayden", "https://mitpress.mit.edu/author/dolores-hayden-8140/")], ["city", "memory", "architecture"]),
  anchor("person.alice_waters", ["爱丽丝·沃特斯", "Alice Waters"], "food_everyday", ["chef", "food activist"], "20th_21st_century", [w("work.chez_panisse_menu", ["Chez Panisse context", "Chez Panisse context"], "food_context", ["concept.recipe_not_rule", "concept.food_as_social_ritual"], ["season", "ingredient", "practice"], ["ingredient practice", "season", "restaurant boundary"]), w("work.art_simple_food", ["简单食物的艺术", "The Art of Simple Food"], "cookbook", ["concept.recipe_not_rule", "concept.craft_knowledge"], ["recipe", "practice", "ingredient"], ["recipe boundary", "practice", "ingredient"])], ["concept.recipe_not_rule", "concept.food_as_social_ritual"], ["ingredient", "practice", "season"], "city_food_daily_extension", [S.britannica("Alice Waters")], ["food", "practice", "education"]),
  anchor("person.elizabeth_david", ["伊丽莎白·戴维", "Elizabeth David"], "food_everyday", ["food writer"], "20th_century", [w("work.mediterranean_food", ["地中海食物", "A Book of Mediterranean Food"], "food_writing", ["concept.taste_not_nutrition", "concept.place_food_memory"], ["place", "taste", "memory"], ["place food memory", "taste", "season"]), w("work.french_country_cooking", ["法国乡村烹饪", "French Country Cooking"], "food_writing", ["concept.recipe_not_rule", "concept.craft_knowledge"], ["recipe", "place", "practice"], ["recipe practice", "place", "craft knowledge"])], ["concept.taste_not_nutrition", "concept.recipe_not_rule"], ["taste", "place", "practice"], "city_food_daily_extension", [S.britannica("Elizabeth David")], ["food", "place", "writing"]),
  anchor("person.claudia_roden", ["克劳迪娅·罗登", "Claudia Roden"], "food_everyday", ["food writer"], "20th_21st_century", [w("work.book_middle_eastern_food", ["中东食物之书", "A Book of Middle Eastern Food"], "food_writing", ["concept.food_as_social_ritual", "concept.place_food_memory"], ["food", "region", "memory"], ["regional food memory", "social ritual", "place"]), w("work.book_jewish_food", ["犹太食物之书", "The Book of Jewish Food"], "food_writing", ["concept.food_as_social_ritual", "concept.memory_vs_fact"], ["food", "diaspora", "memory"], ["food ritual", "diaspora memory", "source boundary"])], ["concept.food_as_social_ritual", "concept.place_food_memory"], ["food", "memory", "diaspora"], "city_food_daily_extension", [S.britannica("Claudia Roden")], ["food", "memory", "migration"]),
  anchor("person.norbert_wiener", ["诺伯特·维纳", "Norbert Wiener"], "technology_history", ["mathematician"], "20th_century", [w("work.cybernetics_wiener", ["控制论", "Cybernetics"], "science_text", ["concept.feedback_loop", "concept.model_not_reality"], ["feedback", "control", "model"], ["feedback loop", "control", "model boundary"]), w("work.human_use_human_beings", ["人有人的用处", "The Human Use of Human Beings"], "technology_text", ["concept.technology_history_not_support", "concept.automation_augmentation"], ["automation", "society", "boundary"], ["automation boundary", "society", "technology history"])], ["concept.feedback_loop", "concept.technology_history_not_support"], ["feedback", "automation", "model"], "science_computing_history_extension", [S.britannica("Norbert Wiener")], ["technology", "science", "social_thought"]),
  anchor("person.claude_shannon", ["克劳德·香农", "Claude Shannon"], "technology_history", ["mathematician", "engineer"], "20th_century", [w("work.mathematical_theory_communication", ["通信的数学理论", "A Mathematical Theory of Communication"], "science_text", ["concept.information_theory", "concept.model_not_reality"], ["information", "signal", "model"], ["information theory", "signal", "model boundary"]), w("work.shannon_switching_theory", ["继电器与开关电路理论", "Switching circuit theory"], "science_text", ["concept.computation", "concept.model_not_reality"], ["switching", "logic", "model"], ["switching logic", "model", "computation"])], ["concept.information_theory", "concept.model_not_reality"], ["information", "signal", "model"], "science_computing_history_extension", [S.britannica("Claude Shannon")], ["technology", "science", "communication"]),
  anchor("person.john_von_neumann", ["冯·诺伊曼", "John von Neumann"], "technology_history", ["mathematician"], "20th_century", [w("work.first_draft_edvac", ["EDVAC报告初稿", "First Draft of a Report on the EDVAC"], "computing_text", ["concept.computation", "concept.architecture_model"], ["computer", "architecture", "model"], ["computer architecture", "model", "computation"]), w("work.theory_games_economic_behavior", ["博弈论与经济行为", "Theory of Games and Economic Behavior"], "economics_text", ["concept.model_not_reality", "concept.strategy_model"], ["game", "strategy", "model"], ["strategy model", "economics", "model boundary"])], ["concept.computation", "concept.model_not_reality"], ["model", "computation", "strategy"], "science_computing_history_extension", [S.britannica("John von Neumann")], ["technology", "economy", "science"]),
  anchor("person.ted_nelson", ["泰德·尼尔森", "Ted Nelson"], "technology_history", ["technology writer"], "20th_21st_century", [w("work.computer_lib_dream_machines", ["计算机解放/梦机器", "Computer Lib Dream Machines"], "technology_text", ["concept.hypertext_linear", "concept.active_loaded_pack"], ["hypertext", "computer culture", "medium"], ["hypertext", "computer culture", "medium"]), w("work.xanadu_project", ["Xanadu项目", "Project Xanadu"], "technology_project", ["concept.hypertext_linear", "concept.protocol_governance"], ["hypertext", "linking", "system"], ["hypertext linking", "system", "protocol boundary"])], ["concept.hypertext_linear", "concept.protocol_governance"], ["hypertext", "system", "medium"], "science_computing_history_extension", [S.britannica("hypertext")], ["technology", "writing", "interface"]),
  anchor("person.martha_nussbaum", ["玛莎·努斯鲍姆", "Martha Nussbaum"], "law_education_care", ["philosopher"], "20th_21st_century", [w("work.frontiers_justice", ["正义的前沿", "Frontiers of Justice"], "philosophy_text", ["concept.capability", "concept.concept_explanation_not_advice"], ["justice", "capability", "boundary"], ["capability", "justice", "advice boundary"]), w("work.poetic_justice", ["诗性正义", "Poetic Justice"], "philosophy_text", ["concept.law_literature_bridge", "concept.example_not_precedent"], ["law", "literature", "judgment"], ["law literature bridge", "example boundary", "judgment"])], ["concept.capability", "concept.law_literature_bridge"], ["capability", "law", "literature"], "economy_law_education_care_boundary", [S.britannica("Martha Nussbaum")], ["law_boundary", "literature", "education"]),
  anchor("person.joseph_raz", ["约瑟夫·拉兹", "Joseph Raz"], "law_boundary", ["legal philosopher"], "20th_21st_century", [w("work.authority_law", ["法律的权威", "The Authority of Law"], "law_theory_text", ["concept.authority_legitimacy", "concept.concept_explanation_not_advice"], ["authority", "law", "boundary"], ["authority", "legal theory", "advice boundary"]), w("work.morality_freedom", ["自由的道德", "The Morality of Freedom"], "philosophy_text", ["concept.freedom_responsibility", "concept.rule_not_answer"], ["freedom", "morality", "rule"], ["freedom", "morality", "rule boundary"])], ["concept.authority_legitimacy", "concept.rule_not_answer"], ["authority", "rule", "freedom"], "economy_law_education_care_boundary", [S.sep("legal-positivism")], ["law_boundary", "philosophy", "ethics"]),
  anchor("person.bruno_latour", ["布鲁诺·拉图尔", "Bruno Latour"], "science_social_thought", ["sociologist", "philosopher"], "20th_21st_century", [w("work.science_in_action", ["行动中的科学", "Science in Action"], "science_studies_text", ["concept.evidence_not_anecdote", "concept.public_science_boundary"], ["science", "network", "evidence"], ["science studies", "network", "evidence boundary"]), w("work.we_have_never_been_modern", ["我们从未现代过", "We Have Never Been Modern"], "social_theory_text", ["concept.modernity", "concept.model_not_reality"], ["modernity", "hybrid", "model"], ["modernity", "hybrid", "model boundary"])], ["concept.evidence_not_anecdote", "concept.public_science_boundary"], ["science", "network", "modernity"], "science_computing_history_extension", [S.britannica("Bruno Latour")], ["science", "social_thought", "philosophy"]),
  anchor("person.donna_haraway", ["唐娜·哈拉维", "Donna Haraway"], "science_social_thought", ["scholar"], "20th_21st_century", [w("work.cyborg_manifesto", ["赛博格宣言", "A Cyborg Manifesto"], "theory_text", ["concept.technology_history_not_support", "concept.identity_boundary"], ["technology", "identity", "boundary"], ["technology metaphor", "identity boundary", "social theory"]), w("work.situated_knowledges", ["情境化知识", "Situated Knowledges"], "theory_text", ["concept.evidence_not_anecdote", "concept.public_science_boundary"], ["knowledge", "position", "evidence"], ["situated knowledge", "evidence boundary", "position"])], ["concept.technology_history_not_support", "concept.evidence_not_anecdote"], ["technology", "knowledge", "boundary"], "science_computing_history_extension", [S.britannica("Donna Haraway")], ["science", "technology", "social_thought"])
];

const conceptRows = [
  ["concept.concept_explanation_not_advice", ["概念解释不是专业建议", "concept explanation is not advice"], "boundary", ["concept scope", "source limit", "advice boundary"], ["law concept", "science history"], ["professional advice"], ["concept.evaluation_boundary_static"], ["do_not_answer_as_expert_advice"], [S.britannica("advice")], ["law_boundary", "science", "care"], true],
  ["concept.rule_not_answer", ["规则不是答案", "rule is not answer"], "law_boundary", ["rule text", "application facts", "procedure"], ["legal theory", "game rule"], ["automatic outcome"], ["concept.rule_application_precedent"], ["do_not_skip_application_context"], [S.sep("law-interpretivist")], ["law", "education", "institutions"], true],
  ["concept.interface_not_visual_styling", ["界面不是视觉装饰", "interface is not visual styling"], "design_interface", ["use relation", "feedback", "task fit"], ["software interface", "object affordance"], ["color polish only"], ["concept.interface"], ["do_not_reduce_interface_to_style"], [S.official("Nielsen Norman Group:interface", "https://www.nngroup.com/articles/interface/")], ["design", "technology", "education"], true],
  ["concept.public_space_not_travel_advice", ["公共空间不是旅行建议", "public space is not travel advice"], "city_boundary", ["public life", "access", "urban relation"], ["park concept", "street concept"], ["where to go now"], ["concept.public_space"], ["do_not_make_current_travel_recommendation"], [S.britannica("public space")], ["city", "film", "law_boundary"], true],
  ["concept.market_not_society", ["市场不是社会整体", "market is not society"], "economy_boundary", ["exchange", "institution", "social embedding"], ["market concept", "institution concept"], ["all social relation"], ["concept.market"], ["do_not_reduce_society_to_market"], [S.britannica("market")], ["economy", "law", "literature"], true],
  ["concept.food_taste_not_nutrition", ["味道不是营养建议", "taste is not nutrition advice"], "food_boundary", ["sensory judgment", "culture", "health boundary"], ["taste memory", "cooking description"], ["medical nutrition"], ["concept.taste_culture"], ["do_not_give_medical_nutrition_claim"], [S.britannica("taste")], ["food", "care_boundary", "literature"], true],
  ["concept.technology_history_not_support", ["技术史不是当前支持", "technology history is not current support"], "technology_boundary", ["historical concept", "current product gap", "source need"], ["web history", "interface history"], ["current platform status"], ["concept.evaluation_boundary_static"], ["do_not_claim_current_product_state"], [S.britannica("technology")], ["technology", "history", "boundary"], true],
  ["concept.evidence_not_anecdote", ["证据不是轶事", "evidence is not anecdote"], "science_boundary", ["source chain", "method", "claim strength"], ["science explanation", "history claim"], ["single story proves rule"], ["concept.evidence_chain"], ["do_not_overgeneralize_anecdote"], [S.britannica("evidence")], ["science", "law", "history"], true],
  ["concept.model_not_reality", ["模型不是现实本身", "model is not reality"], "science_boundary", ["representation", "assumption", "scope"], ["scientific model", "economic model"], ["complete world"], ["concept.model_vs_reality"], ["do_not_treat_model_as_world"], [S.britannica("scientific-modeling")], ["science", "economy", "technology"], true],
  ["concept.recommendation_criterion", ["推荐标准", "recommendation criterion"], "bridge_boundary", ["reason", "fit", "constraint"], ["book recommendation", "film path"], ["name dropping"], ["concept.representative_work_spine"], ["do_not_recommend_without_axis"], [S.britannica("criticism")], ["all_domains", "recommendation", "dialogue"], true],
  ["concept.representative_work_spine", ["代表作骨架", "representative work spine"], "bridge_boundary", ["person", "works", "concept links"], ["author works", "director films"], ["isolated person card"], ["concept.recommendation_criterion"], ["do_not_add_person_without_work_closure"], [S.britannica("bibliography")], ["all_domains", "knowledge_graph", "topic_reentry"], true],
  ["concept.topic_reentry_anchor", ["话题回返锚点", "topic re-entry anchor"], "bridge_boundary", ["active subject", "prior concept", "relation trail"], ["return to director", "return to concept"], ["stale domain guess"], ["concept.same_or_different_question"], ["do_not_restore_wrong_topic"], [S.britannica("discourse")], ["dialogue", "all_domains", "memory"], true],
  ["concept.false_equivalence_guard", ["虚假等同防线", "false equivalence guard"], "bridge_boundary", ["shared word", "kept distinction", "negative relation"], ["物哀 vs sadness", "interface vs styling"], ["same label equals same concept"], ["concept.analogy_not_identity"], ["do_not_collapse_distinctions"], [S.britannica("analogy")], ["all_domains", "comparison", "boundary"], true],
  ["concept.example_not_precedent", ["例子不是判例", "example is not precedent"], "law_boundary", ["example", "rule relation", "jurisdiction boundary"], ["literary example", "legal theory"], ["example decides case"], ["concept.rule_application_precedent"], ["do_not_make_legal_advice"], [S.britannica("precedent")], ["law", "literature", "education"], true],
  ["concept.documentary_ethics", ["纪录伦理", "documentary ethics"], "film_boundary", ["recorded subject", "representation", "consent context"], ["documentary film", "image use"], ["camera equals permission"], ["concept.documentary_fiction_boundary"], ["do_not_treat_recording_as_full_authority"], [S.bfi("documentary ethics")], ["film", "image", "care_boundary"], true],
  ["concept.archival_image", ["档案图像", "archival image"], "image_theory", ["record", "selection", "context"], ["archive photo", "historical footage"], ["neutral proof"], ["concept.image_not_evidence"], ["do_not_treat_archive_as_context_free"], [S.britannica("archive")], ["history", "film", "law"], true],
  ["concept.close_reading", ["细读", "close reading"], "literature", ["attention to wording", "form", "local evidence"], ["poem analysis", "paragraph analysis"], ["keyword spotting"], ["concept.example_not_precedent"], ["do_not_quote_long_text"], [S.britannica("literary criticism")], ["literature", "law", "philosophy"], true],
  ["concept.comparative_literature", ["比较文学", "comparative literature"], "literature", ["cross-language relation", "translation", "influence caution"], ["world literature", "translation study"], ["everything resembles everything"], ["concept.translation_equivalence_boundary"], ["do_not_claim_influence_without_source"], [S.britannica("comparative literature")], ["literature", "film", "music"], true],
  ["concept.lyric_subject", ["抒情主体", "lyric subject"], "poetry_music", ["speaker", "voice", "not author identity"], ["poem voice", "song persona"], ["author confession"], ["concept.voice_persona"], ["do_not_equate_speaker_with_author"], [S.britannica("lyric")], ["poetry", "music", "care_boundary"], true],
  ["concept.city_walk", ["城市步行", "city walk"], "city", ["movement", "observation", "street relation"], ["urban essay", "film street"], ["travel itinerary"], ["concept.public_space_not_travel_advice"], ["do_not_make_current_route_advice"], [S.britannica("urbanism")], ["city", "film", "literature"], true],
  ["concept.recipe_not_rule", ["菜谱不是规则本身", "recipe is not rule"], "food", ["instruction", "practice", "adjustment"], ["home cooking", "learning practice"], ["guaranteed outcome"], ["concept.craft_knowledge"], ["do_not_certify_food_safety"], [S.britannica("cookbook")], ["food", "education", "craft"], true],
  ["concept.care_boundary_static_card", ["照护边界静态卡", "care boundary static card"], "care_boundary", ["non-diagnosis", "support limit", "source need"], ["literature distress", "personal feeling"], ["treatment plan"], ["concept.affective_association_boundary"], ["do_not_diagnose_or_treat"], [S.britannica("mental-health")], ["care_boundary", "literature", "music"], true],
  ["concept.memory_not_diagnosis", ["记忆不是诊断", "memory is not diagnosis"], "care_boundary", ["memory report", "context need", "diagnosis boundary"], ["autobiographical memory", "art association"], ["clinical conclusion"], ["concept.memory_vs_fact"], ["do_not_pathologize_memory"], [S.britannica("memory")], ["care_boundary", "literature", "film"], true],
  ["concept.source_library_pack", ["源库包", "source library pack"], "kb_governance", ["authored source", "not default active", "future shard"], ["optional domain pack", "long-tail source"], ["browser active pack"], ["concept.active_loaded_pack"], ["do_not_treat_source_only_as_live_behavior"], [S.britannica("library science")], ["kb_governance", "loaded_pack_boundary"], true],
  ["concept.active_loaded_pack", ["活跃加载包", "active loaded pack"], "kb_governance", ["default loaded", "bounded size", "high-transfer"], ["core cards", "boundary cards"], ["all source cards"], ["concept.source_library_pack"], ["do_not_activate_unbounded_long_tail"], [S.britannica("computer-memory")], ["kb_governance", "local_first"], true],
  ["concept.modernist_interiority", ["现代主义内在性", "modernist interiority"], "literature", ["inner pressure", "fragment", "city perception"], ["modernist fiction", "Korean modernism"], ["private biography"], ["concept.fragmented_subject"], ["do_not_diagnose_author"], [S.britannica("modernism")], ["literature", "film", "psychology_boundary"]],
  ["concept.fragmented_subject", ["碎片化主体", "fragmented subject"], "literature", ["split voice", "modern pressure", "form"], ["modernist narrator", "city subject"], ["incoherent person"], ["concept.modernist_interiority"], ["do_not_pathologize_form"], [S.britannica("modernism")], ["literature", "film", "care_boundary"]],
  ["concept.family_history", ["家族历史", "family history"], "literature", ["family line", "social change", "memory"], ["family novel", "city saga"], ["private gossip"], ["concept.memory_vs_fact"], ["do_not_infer_private_life"], [S.britannica("family")], ["literature", "history", "film"]],
  ["concept.tragedy_cross_cultural", ["跨文化悲剧", "cross-cultural tragedy"], "theater_literature", ["ritual", "conflict", "translation boundary"], ["stage tragedy", "ritual drama"], ["same plot everywhere"], ["concept.translation_equivalence_boundary"], ["do_not_flatten_cultural_context"], [S.britannica("tragedy")], ["theater", "literature", "history"]],
  ["concept.migration_identity", ["迁移身份", "migration identity"], "literature", ["movement", "language", "belonging"], ["migration novel", "diaspora story"], ["travel mood"], ["concept.exile"], ["do_not_equate_with_tourism"], [S.britannica("migration")], ["literature", "city", "social_thought"]],
  ["concept.short_story_pressure", ["短篇压力", "short story pressure"], "literature", ["compression", "single situation", "open implication"], ["short story", "flash fiction"], ["short equals easy"], ["concept.short_story_vs_novel"], ["do_not_rank_by_length"], [S.britannica("short-story")], ["literature", "film", "music"]],
  ["concept.voice_orality", ["口传声音", "voice and orality"], "literature_music", ["spoken cadence", "community voice", "recording boundary"], ["folklore", "song voice"], ["unwritten means primitive"], ["concept.witness_testimony"], ["do_not_make_hierarchy_of_written_over_oral"], [S.britannica("oral tradition")], ["literature", "music", "history"]],
  ["concept.essay_film", ["散文电影", "essay film"], "film", ["argument image", "voice", "associative structure"], ["essay documentary", "travel film"], ["documentary fact dump"], ["concept.documentary_fiction_boundary"], ["do_not_treat_voiceover_as_proof"], [S.bfi("essay film")], ["film", "literature", "image"]],
  ["concept.photographic_sequence", ["照片序列", "photographic sequence"], "image_film", ["still image", "order", "time effect"], ["photo film", "slide sequence"], ["single photo proof"], ["concept.archival_image"], ["do_not_treat_sequence_as_raw_record"], [S.moma("photography sequence")], ["film", "photography", "memory"]],
  ["concept.social_realism", ["社会现实主义", "social realism"], "film_literature", ["ordinary life", "class relation", "institution"], ["social realist film", "working-class fiction"], ["documentary truth"], ["concept.realism_literature"], ["do_not_make_policy_claim_without_source"], [S.bfi("social realism")], ["film", "literature", "economy"]],
  ["concept.soul_music", ["灵魂乐", "soul music"], "music", ["voice", "gospel relation", "rhythm and blues"], ["soul vocal", "band arrangement"], ["emotion only"], ["concept.voice_persona"], ["do_not_reduce_to_mood"], [S.britannica("soul-music")], ["music", "public_memory", "performance"]],
  ["concept.funk", ["放克", "funk"], "music", ["groove", "rhythm section", "dance relation"], ["funk band", "rhythmic vamp"], ["any dance music"], ["concept.groove_layer"], ["do_not_reduce_to_tempo"], [S.britannica("funk")], ["music", "dance", "film"]],
  ["concept.ambient_music", ["环境音乐", "ambient music"], "music", ["space", "texture", "listening condition"], ["ambient album", "sound installation"], ["background music only"], ["concept.listening_scene"], ["do_not_assume_passive_listening"], [S.britannica("ambient music")], ["music", "design", "architecture"]],
  ["concept.performance_context", ["表演语境", "performance context"], "music_film", ["live setting", "audience relation", "occasion"], ["concert film", "live album"], ["recording quality only"], ["concept.voice_persona"], ["do_not_infer_private_intent"], [S.britannica("performance")], ["music", "film", "theater"]],
  ["concept.city_heat", ["城市热度", "city heat"], "city_film", ["weather pressure", "public space", "social tension"], ["summer street film", "urban scene"], ["weather report"], ["concept.public_space_not_travel_advice"], ["do_not_turn_into_current_weather"], [S.britannica("urbanism")], ["film", "city", "literature"]],
  ["concept.class_space", ["阶级空间", "class space"], "film_city", ["spatial separation", "social hierarchy", "movement"], ["house film", "urban drama"], ["room decoration"], ["concept.public_private_boundary"], ["do_not_make_current_class_claim"], [S.britannica("social-class")], ["film", "city", "economy"]],
  ["concept.information_theory", ["信息论", "information theory"], "science_technology", ["signal", "noise", "formal measure"], ["communication model", "coding theory"], ["content meaning by itself"], ["concept.model_not_reality"], ["do_not_treat_formal_measure_as_all_meaning"], [S.britannica("information-theory")], ["technology", "language", "science"]],
  ["concept.law_literature_bridge", ["法律与文学桥", "law and literature bridge"], "law_literature", ["example", "judgment", "interpretation"], ["novel and justice", "testimony scene"], ["legal advice"], ["concept.example_not_precedent"], ["do_not_make_case_specific_claim"], [S.britannica("law")], ["law", "literature", "education"]],
  ["concept.place_food_memory", ["地方食物记忆", "place food memory"], "food", ["place", "taste", "memory"], ["regional cooking", "family dish"], ["nutrition label"], ["concept.food_taste_not_nutrition"], ["do_not_make_restaurant_recommendation"], [S.britannica("cuisine")], ["food", "literature", "city"]]
];

function conceptCard(row) {
  const [id, names, domain, units, examples, non_examples, related, negative, provenance, transfer, boundary = false] = row;
  return concept({ id, names, domain, units, examples, non_examples, related, negative, provenance, transfer, boundary, pack: packForDomain(domain) });
}

function packForDomain(domain) {
  if (/film|cinema/i.test(domain)) return "global_cinema_extension";
  if (/music|poetry_music/i.test(domain)) return "global_music_culture";
  if (/city|food|daily/i.test(domain)) return "city_food_daily_extension";
  if (/science|technology/i.test(domain)) return "science_computing_history_extension";
  if (/law|care|economy|education/i.test(domain)) return "economy_law_education_care_boundary";
  if (/design|image|art/i.test(domain)) return "art_design_image_deepening";
  if (/philosophy|language|social/i.test(domain)) return "philosophy_language_social_thought";
  if (/boundary|bridge|kb_governance/i.test(domain)) return "bridge_negative_boundary_layer";
  return "world_literature_extension";
}

function relationId(prefix, a, b) {
  return `relation.r27_${prefix}.${a.replace(/^(person|work|concept)\./, "").replace(/[^a-z0-9_]+/gi, "_")}.${b.replace(/^(person|work|concept)\./, "").replace(/[^a-z0-9_]+/gi, "_")}`;
}

function derivedRelationsForAnchor(row) {
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
      active: false,
      purpose: ["closes_person_work_loop", "source_library_closure"]
    }));
    for (const conceptId of (workRow.concepts || row.concepts).slice(0, 2)) {
      out.push(relation({
        id: relationId("work_concept", workRow.id, conceptId),
        domain: row.domain,
        relation_type: "work_to_concept",
        source_ids: [workRow.id],
        target_ids: [conceptId],
        shared_axes: ["example", ...((workRow.axes || row.axes).slice(0, 2))],
        contrast_axes: ["example does not exhaust concept"],
        example_ids: [workRow.id],
        provenance: workRow.provenance || row.provenance,
        transfer: ["concept_followup", "explain_characteristics", "compare_works"],
        pack: row.pack,
        active: false,
        purpose: ["closes_work_concept_loop", "source_library_closure"]
      }));
    }
  }
  return out;
}

const manualPairs = [
  ["concept.concept_explanation_not_advice", "concept.example_not_precedent", "constrains", ["scope", "application"], ["not advice"], true],
  ["concept.rule_not_answer", "concept.example_not_precedent", "distinguishes_from", ["rule", "application"], ["not automatic outcome"], true],
  ["concept.interface_not_visual_styling", "concept.interface", "constrains", ["use", "feedback"], ["not decoration"], true],
  ["concept.public_space_not_travel_advice", "concept.public_space", "constrains", ["urban concept", "current advice gap"], ["not travel advice"], true],
  ["concept.market_not_society", "concept.market", "constrains", ["exchange", "institution"], ["not society as whole"], true],
  ["concept.food_taste_not_nutrition", "concept.food_as_social_ritual", "constrains", ["taste", "culture"], ["not nutrition advice"], true],
  ["concept.technology_history_not_support", "concept.protocol_governance", "constrains", ["history", "current state"], ["not support claim"], true],
  ["concept.evidence_not_anecdote", "concept.public_science_boundary", "constrains", ["evidence", "source chain"], ["not anecdote"], true],
  ["concept.model_not_reality", "concept.evidence_not_anecdote", "bridges", ["representation", "claim strength"], ["not world itself"], true],
  ["concept.recommendation_criterion", "concept.representative_work_spine", "frames", ["reason", "fit"], ["not name dropping"], true],
  ["concept.topic_reentry_anchor", "concept.same_or_different_question", "frames", ["active subject", "relation trail"], ["not stale domain"], true],
  ["concept.false_equivalence_guard", "concept.analogy_not_identity", "constrains", ["shared axis", "distinction"], ["not identity"], true],
  ["concept.documentary_ethics", "concept.documentary_fiction_boundary", "frames", ["recorded subject", "truth claim"], ["not raw authority"], true],
  ["concept.archival_image", "concept.image_not_evidence", "constrains", ["record", "context"], ["not proof alone"], true],
  ["concept.close_reading", "concept.example_not_precedent", "bridges", ["local evidence", "interpretation"], ["not keyword spotting"], true],
  ["concept.comparative_literature", "concept.translation_equivalence_boundary", "frames", ["cross-language", "transfer"], ["not influence proof"], true],
  ["concept.lyric_subject", "concept.song_poem_boundary", "constrains", ["voice", "speaker"], ["not author confession"], true],
  ["concept.city_walk", "concept.public_space_not_travel_advice", "frames", ["movement", "urban observation"], ["not route advice"], true],
  ["concept.recipe_not_rule", "concept.craft_knowledge", "bridges", ["practice", "adjustment"], ["not guarantee"], true],
  ["concept.care_boundary_static_card", "concept.memory_not_diagnosis", "constrains", ["support limit", "non-diagnosis"], ["not treatment"], true],
  ["concept.source_library_pack", "concept.active_loaded_pack", "distinguishes_from", ["authored source", "active loaded"], ["not same pack"], true],
  ["concept.modernist_interiority", "concept.fragmented_subject", "frames", ["interiority", "form"], ["not diagnosis"], false],
  ["concept.short_story_pressure", "concept.short_story_vs_novel", "frames", ["compression", "duration"], ["not easier because shorter"], false],
  ["concept.voice_orality", "concept.witness_testimony", "bridges", ["voice", "record"], ["not lower than writing"], false],
  ["concept.essay_film", "concept.documentary_fiction_boundary", "frames", ["image argument", "truth claim"], ["not fact dump"], false],
  ["concept.photographic_sequence", "concept.archival_image", "bridges", ["order", "image"], ["not raw proof"], false],
  ["concept.social_realism", "concept.concept_explanation_not_advice", "constrains", ["social form", "policy boundary"], ["not policy claim"], false],
  ["concept.soul_music", "concept.voice_persona", "frames", ["voice", "tradition"], ["not emotion only"], false],
  ["concept.funk", "concept.groove_layer", "frames", ["rhythm", "body"], ["not tempo only"], false],
  ["concept.ambient_music", "concept.listening_scene", "frames", ["space", "attention"], ["not mere background"], false],
  ["concept.performance_context", "concept.voice_persona", "bridges", ["event", "voice"], ["not private motive"], false],
  ["concept.city_heat", "concept.public_space", "frames", ["weather pressure", "street"], ["not weather report"], false],
  ["concept.class_space", "concept.public_private_boundary", "bridges", ["space", "social hierarchy"], ["not decoration"], false],
  ["concept.information_theory", "concept.model_not_reality", "constrains", ["formal model", "meaning boundary"], ["not all meaning"], false],
  ["concept.law_literature_bridge", "concept.example_not_precedent", "constrains", ["example", "judgment"], ["not legal advice"], false],
  ["concept.place_food_memory", "concept.food_taste_not_nutrition", "constrains", ["taste", "place"], ["not nutrition"], false]
];

function manualRelations() {
  const out = [];
  for (const [a, b, type, shared, contrast, active] of manualPairs) {
    out.push(relation({
      id: relationId("bridge", a, b),
      domain: "bridge_boundary",
      relation_type: type,
      source_ids: [a],
      target_ids: [b],
      shared_axes: shared,
      contrast_axes: contrast,
      licensed_verbs: ["distinguishes", "frames", "constrains", "helps_compare"],
      constraints: ["preserve local domain meaning", "do not claim identity"],
      negative_moves: ["analogy_is_not_identity", "same_word_is_not_same_concept"],
      provenance: [S.britannica("analogy"), S.britannica("evidence")],
      transfer: ["same_or_different_question", "concept_followup", "topic_reentry"],
      active,
      boundary: active,
      purpose: active ? ["adds_boundary_guardrail", "prevents_false_equivalence"] : ["adds_source_relation_closure"]
    }));
  }
  const concepts = conceptRows.map((row) => row[0]);
  for (let i = 0; i < concepts.length - 2; i++) {
    if (i % 2 === 0) {
      out.push(relation({
        id: relationId("dense", concepts[i], concepts[i + 2]),
        domain: "bridge_boundary",
        relation_type: "source_library_bridge",
        source_ids: [concepts[i]],
        target_ids: [concepts[i + 2]],
        shared_axes: ["comparison support", "concept transfer"],
        contrast_axes: ["keep domain-specific meaning"],
        licensed_verbs: ["helps_compare", "contrasts_with", "frames"],
        constraints: ["source-library support only", "do not make a final answer"],
        negative_moves: ["avoid_generic_abstraction", "analogy_is_not_identity"],
        provenance: [S.britannica("analogy")],
        transfer: ["comparison", "concept_followup", "topic_reentry"],
        active: false,
        purpose: ["adds_source_relation_closure"]
      }));
    }
  }
  for (let i = 1; i < concepts.length - 4; i += 3) {
    out.push(relation({
      id: relationId("matrix", concepts[i], concepts[i + 4]),
      domain: "bridge_boundary",
      relation_type: "source_library_contrast",
      source_ids: [concepts[i]],
      target_ids: [concepts[i + 4]],
      shared_axes: ["contrast support", "boundary transfer"],
      contrast_axes: ["different local use", "different evidence need"],
      licensed_verbs: ["contrasts_with", "helps_distinguish", "sets_boundary_for"],
      constraints: ["source-library contrast only", "do not imply equivalence"],
      negative_moves: ["false_equivalence_guard", "keep_domain_boundary"],
      provenance: [S.britannica("comparison")],
      transfer: ["same_or_different_question", "concept_followup", "boundary_response"],
      active: false,
      purpose: ["adds_contrast_gap_closure"]
    }));
  }
  for (let i = 2; i < concepts.length - 5; i += 4) {
    out.push(relation({
      id: relationId("guard", concepts[i], concepts[i + 5]),
      domain: "bridge_boundary",
      relation_type: "source_library_negative_guard",
      source_ids: [concepts[i]],
      target_ids: [concepts[i + 5]],
      shared_axes: ["guardrail support", "scope control"],
      contrast_axes: ["do not transfer full claim", "keep uncertainty visible"],
      licensed_verbs: ["constrains", "guards_against", "limits_transfer_to"],
      constraints: ["not active by default", "not a complete answer"],
      negative_moves: ["do_not_overgeneralize", "do_not_convert_concept_to_advice"],
      provenance: [S.britannica("critical thinking")],
      transfer: ["boundary_response", "comparison", "topic_reentry"],
      active: false,
      purpose: ["adds_negative_boundary_closure"]
    }));
  }
  for (let i = 0; i < concepts.length - 6; i += 5) {
    out.push(relation({
      id: relationId("example_support", concepts[i], concepts[i + 6]),
      domain: "bridge_boundary",
      relation_type: "source_library_example_support",
      source_ids: [concepts[i]],
      target_ids: [concepts[i + 6]],
      shared_axes: ["example support", "topic transfer"],
      contrast_axes: ["example does not exhaust concept"],
      licensed_verbs: ["is_exemplified_near", "helps_explain", "supports_followup_for"],
      constraints: ["source-library relation only", "do not infer direct influence"],
      negative_moves: ["example_not_total_definition", "avoid_exact_prompt_patch"],
      provenance: [S.britannica("example")],
      transfer: ["concept_followup", "representative_examples", "topic_reentry"],
      active: false,
      purpose: ["adds_example_relation_closure"]
    }));
  }
  for (let i = 3; i < concepts.length - 7; i += 6) {
    out.push(relation({
      id: relationId("reentry", concepts[i], concepts[i + 7]),
      domain: "bridge_boundary",
      relation_type: "source_library_topic_reentry_support",
      source_ids: [concepts[i]],
      target_ids: [concepts[i + 7]],
      shared_axes: ["topic re-entry", "referent support"],
      contrast_axes: ["not a stale-domain shortcut"],
      licensed_verbs: ["helps_restore", "supports_reentry_to", "keeps_distinct_from"],
      constraints: ["source-library support only", "does not replace dialogue referent binding"],
      negative_moves: ["do_not_restore_wrong_topic", "do_not_call_live_behavior_fixed"],
      provenance: [S.britannica("discourse")],
      transfer: ["topic_reentry", "concept_followup", "same_or_different_question"],
      active: false,
      purpose: ["adds_topic_reentry_support_relation"]
    }));
  }
  for (let i = 4; i < concepts.length - 8; i += 7) {
    out.push(relation({
      id: relationId("scope", concepts[i], concepts[i + 8]),
      domain: "bridge_boundary",
      relation_type: "source_library_scope_guard",
      source_ids: [concepts[i]],
      target_ids: [concepts[i + 8]],
      shared_axes: ["scope guard", "transfer limit"],
      contrast_axes: ["different evidence threshold"],
      licensed_verbs: ["limits", "guards", "keeps_scope_for"],
      constraints: ["not active by default", "does not create live behavior claim"],
      negative_moves: ["do_not_overclaim_from_static_card", "do_not_blur_boundary"],
      provenance: [S.britannica("scope")],
      transfer: ["boundary_response", "comparison", "recommendation_criterion"],
      active: false,
      purpose: ["adds_scope_guard_relation"]
    }));
  }
  return out;
}

function collectRefs(card) {
  const refs = [];
  const add = (id) => {
    if (typeof id === "string" && /^(person|work|concept|theme|movement|period|genre)\./.test(id)) refs.push(id);
  };
  for (const field of ["works", "representative_works", "related_concepts", "related_people", "relation_ids", "source_ids", "target_ids", "creator_ids", "example_ids", "concepts"]) {
    if (Array.isArray(card[field])) card[field].forEach(add);
  }
  if (Array.isArray(card.related_entities)) card.related_entities.forEach((item) => add(item?.id));
  return refs;
}

function demote(card) {
  card.visibility = "local";
  card.approved_for_public_runtime = false;
  card.runtime_default = false;
  card.runtime_scope = card.runtime_scope === "boundary_pack" ? "source_only" : (card.runtime_scope === "optional_long_tail" ? "optional_long_tail" : "source_only");
  card.activation_priority = 9;
  card.source_library_tier = "r27_source_library";
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
  for (const [file, rows] of buckets) fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function main() {
  const existing = existingMaps();
  const candidates = [];
  for (const row of anchors) {
    candidates.push(person(row));
    for (const workRow of row.works) candidates.push(work(workRow, row));
    candidates.push(...derivedRelationsForAnchor(row));
  }
  for (const row of conceptRows) candidates.push(conceptCard(row));
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
      if (missing.length) {
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
    r27_cards_written: cards.length,
    active_cards_written: active,
    source_or_optional_cards_written: cards.length - active,
    relation_like_cards_written: relationLike,
    relation_like_share: Number((relationLike / Math.max(1, cards.length)).toFixed(3)),
    files: {
      world_lit_cinema_music: path.relative(ROOT, FILE_A),
      daily_thought_boundary: path.relative(ROOT, FILE_B),
      bridge_closure: path.relative(ROOT, FILE_C)
    }
  }, null, 2));
}

main();
