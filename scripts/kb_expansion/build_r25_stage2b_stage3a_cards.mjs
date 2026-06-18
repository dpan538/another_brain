import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CARD_DIR = path.join(ROOT, "data", "culture_cards");
const STAGE2B_FILE = path.join(CARD_DIR, "r25_stage2b_domain_expansion.jsonl");
const STAGE3A_FILE = path.join(CARD_DIR, "r25_stage3a_bridge_guardrail.jsonl");
const OUTPUT_FILES = new Set([path.basename(STAGE2B_FILE), path.basename(STAGE3A_FILE)]);

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
  brit: (slug) => ({ label: `Britannica:${slug}`, url: `https://www.britannica.com/${slug}` }),
  sep: (slug) => ({ label: `SEP:${slug}`, url: `https://plato.stanford.edu/entries/${slug}/` }),
  nobel: (slug) => ({ label: `Nobel:${slug}`, url: `https://www.nobelprize.org/${slug}` }),
  acm: (slug) => ({ label: `ACM:${slug}`, url: `https://amturing.acm.org/${slug}` }),
  official: (label, url) => ({ label, url })
};

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function existingIds() {
  const ids = new Set();
  for (const name of fs.readdirSync(CARD_DIR).filter((file) => file.endsWith(".jsonl"))) {
    if (OUTPUT_FILES.has(name)) continue;
    for (const row of readJsonl(path.join(CARD_DIR, name))) ids.add(row.id);
  }
  return ids;
}

function packMeta({
  runtime_scope,
  pack_id,
  activation_priority = 5,
  source_library_tier = "r25_v2_v3",
  runtime_default = true,
  local_first_risk = "low",
  purpose_class = [],
  visibility = "public",
  approved_for_public_runtime = true
}) {
  return {
    runtime_scope,
    pack_id,
    activation_priority,
    source_library_tier,
    runtime_default,
    local_first_risk,
    bundle_weight_estimate: "small",
    purpose_class,
    visibility,
    approved_for_public_runtime
  };
}

function base({
  id,
  entity_type,
  names,
  domain,
  factual_core,
  themes = [],
  related_entities = [],
  comparison_axes = [],
  entry_points = ["definition_unit", "contrast_unit"],
  works = [],
  representative_works = [],
  periods = [],
  style_axes = [],
  historical_context = [],
  confidence = 0.82,
  eval_tags = [],
  meta
}) {
  return {
    id,
    entity_type,
    names,
    domain,
    factual_core,
    short_intro: factual_core,
    works,
    representative_works,
    periods,
    themes,
    style_axes,
    historical_context,
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
    source_summary: "R25 public source-backed card; compact metadata and reusable primitives only.",
    confidence,
    visibility: "public",
    approved_for_public_runtime: true,
    not_to_infer: [
      "complete canon",
      "private motive",
      "direct influence without evidence",
      "identity equivalence from analogy",
      "current professional advice"
    ],
    needs_review: false,
    eval_tags,
    ...meta
  };
}

function person(row) {
  const meta = packMeta(row.meta);
  return {
    ...base({
      id: row.id,
      entity_type: "person",
      names: row.names,
      domain: row.domain,
      factual_core: `${row.names[0]}: ${row.roles.join(", ")}; period=${row.period}.`,
      works: row.works,
      representative_works: row.works,
      periods: [row.period],
      themes: row.concepts,
      style_axes: row.axes,
      related_entities: [
        ...row.works.map((id) => ({ id, relation: "representative_work" })),
        ...row.concepts.map((id) => ({ id, relation: "related_concept" })),
        ...(row.people || []).map((id) => ({ id, relation: "neighbor_or_foil" }))
      ],
      comparison_axes: row.axes,
      eval_tags: ["r25", "person"],
      meta
    }),
    roles: row.roles,
    period: row.period,
    regions_languages: row.regions || [],
    related_concepts: row.concepts,
    related_people: row.people || [],
    negative_moves: row.negative || ["do_not_treat_as_complete_field", "do_not_infer_private_motive"],
    uncertainty_notes: row.uncertainty || ["public summary only"],
    provenance: row.provenance,
    transfer_scope: row.transfer,
    turn_functions: ["identify_person", "list_representative_works", "explain_characteristics", "compare_people", "topic_reentry"]
  };
}

function work(row) {
  const meta = packMeta(row.meta);
  return {
    ...base({
      id: row.id,
      entity_type: "work",
      names: row.names,
      domain: row.domain,
      factual_core: `${row.names[0]}: ${row.work_type}; period=${row.period}.`,
      periods: [row.period],
      themes: row.concepts,
      style_axes: row.axes,
      related_entities: [
        ...row.creators.map((id) => ({ id, relation: "creator_or_primary_context" })),
        ...row.concepts.map((id) => ({ id, relation: "related_concept" }))
      ],
      comparison_axes: row.axes,
      eval_tags: ["r25", "work"],
      meta
    }),
    creator_ids: row.creators,
    work_type: row.work_type,
    period: row.period,
    concepts: row.concepts,
    relation_ids: [],
    safe_summary_units: row.summary,
    copyright_boundary: "summary_paraphrase_only",
    negative_moves: row.negative || ["no plot dump", "no long quotation", "no totalizing interpretation"],
    boundary_notes: row.boundary || ["Use metadata and summary units only."],
    provenance: row.provenance,
    transfer_scope: row.transfer,
    turn_functions: ["list_representative_works", "explain_characteristics", "compare_works", "concept_followup", "recommend_items"]
  };
}

function concept(row) {
  const meta = packMeta(row.meta);
  return {
    ...base({
      id: row.id,
      entity_type: row.entity_type || (row.id.startsWith("theme.") ? "theme" : row.id.startsWith("movement.") ? "movement" : row.id.startsWith("period.") ? "period" : "concept"),
      names: row.names,
      domain: row.domain,
      factual_core: `${row.names[0]} concept scaffold.`,
      themes: row.related || [],
      related_entities: [
        ...(row.related || []).map((id) => ({ id, relation: "related_concept" })),
        ...(row.people || []).map((id) => ({ id, relation: "related_person" }))
      ],
      comparison_axes: row.units,
      eval_tags: ["r25", "concept"],
      meta
    }),
    definition_units: row.units,
    examples: row.examples,
    non_examples: row.non_examples,
    related_concepts: row.related || [],
    related_people: row.people || [],
    relation_ids: [],
    common_misreadings: row.misread || [],
    negative_moves: row.negative,
    boundary_notes: row.boundary,
    provenance: row.provenance,
    transfer_scope: row.transfer,
    turn_functions: ["define_concept", "explain_characteristics", "explain_relation", "compare_forms", "topic_reentry"]
  };
}

function relation(row) {
  const meta = packMeta(row.meta);
  return {
    ...base({
      id: row.id,
      entity_type: "relation",
      names: row.names,
      domain: row.domain,
      factual_core: `${row.relation_type}: ${row.sources.join("+")} -> ${row.targets.join("+")}.`,
      themes: row.shared,
      related_entities: [
        ...row.sources.map((id) => ({ id, relation: "source" })),
        ...row.targets.map((id) => ({ id, relation: "target" })),
        ...(row.examples || []).map((id) => ({ id, relation: "example" }))
      ],
      comparison_axes: [...row.shared, ...(row.contrast || [])],
      eval_tags: ["r25", "relation"],
      meta
    }),
    relation_type: row.relation_type,
    source_ids: row.sources,
    target_ids: row.targets,
    shared_axes: row.shared,
    contrast_axes: row.contrast || [],
    licensed_verbs: row.verbs || ["helps explain", "contrasts with", "frames"],
    example_ids: row.examples || [],
    constraints: row.constraints || ["no identity collapse", "no unsupported causal claim", "no stronger verb than licensed"],
    negative_moves: row.negative || ["do_not_claim_same_as", "do_not_claim_direct_causation"],
    provenance: row.provenance,
    transfer_scope: row.transfer,
    turn_functions: ["explain_relation", "compare_forms", "topic_reentry", "cross_domain_analogy"]
  };
}

const P = {
  city: packMeta({ runtime_scope: "domain_pack", pack_id: "city_food_daily_core", activation_priority: 4, purpose_class: ["adds_domain_foundation", "supports_concept_followup"] }),
  food: packMeta({ runtime_scope: "domain_pack", pack_id: "city_food_daily_core", activation_priority: 4, purpose_class: ["adds_domain_foundation", "supports_non_question_uptake"] }),
  science: packMeta({ runtime_scope: "domain_pack", pack_id: "science_economy_tech_core", activation_priority: 5, purpose_class: ["adds_domain_foundation", "supports_concept_followup"] }),
  economy: packMeta({ runtime_scope: "domain_pack", pack_id: "science_economy_tech_core", activation_priority: 5, purpose_class: ["adds_domain_foundation", "supports_same_or_different"] }),
  law: packMeta({ runtime_scope: "boundary_pack", pack_id: "law_care_boundary_core", activation_priority: 3, purpose_class: ["adds_boundary_guardrail", "supports_safe_abstention"] }),
  psych: packMeta({ runtime_scope: "boundary_pack", pack_id: "law_care_boundary_core", activation_priority: 3, purpose_class: ["adds_boundary_guardrail", "supports_non_question_uptake"] }),
  education: packMeta({ runtime_scope: "domain_pack", pack_id: "education_learning_core", activation_priority: 5, purpose_class: ["adds_domain_foundation", "supports_recommendation_criteria"] }),
  tech: packMeta({ runtime_scope: "domain_pack", pack_id: "science_economy_tech_core", activation_priority: 5, purpose_class: ["adds_domain_foundation", "supports_concept_followup"] }),
  bridge: packMeta({ runtime_scope: "bridge_pack", pack_id: "bridge_cross_domain", activation_priority: 2, purpose_class: ["adds_analogy_bridge", "supports_false_equivalence_rejection", "supports_topic_reentry"] }),
  boundary: packMeta({ runtime_scope: "boundary_pack", pack_id: "boundary_safety_core", activation_priority: 2, purpose_class: ["adds_boundary_guardrail", "supports_safe_abstention"] }),
  bridgeSource: packMeta({
    runtime_scope: "source_only",
    pack_id: "bridge_cross_domain_source",
    activation_priority: 8,
    runtime_default: false,
    local_first_risk: "medium",
    visibility: "local",
    approved_for_public_runtime: false,
    purpose_class: ["source_library_relation", "future_optional_bridge_pack"]
  })
};

const people = [
  ["person.le_corbusier", ["勒·柯布西耶", "Le Corbusier"], "urban", ["architect", "urban theorist"], "20th_century", ["work.towards_new_architecture", "work.ville_radieuse"], ["concept.planned_vs_lived_city", "concept.modernist_planning"], ["form", "planning"], [S.brit("biography/Le-Corbusier")], ["architecture", "urbanism", "design"], P.city],
  ["person.christopher_alexander", ["克里斯托弗·亚历山大", "Christopher Alexander"], "urban", ["architect", "design theorist"], "20th_century", ["work.pattern_language", "work.timeless_way_building"], ["concept.pattern_language", "concept.human_scale"], ["pattern", "participation"], [S.official("PatternLanguage:Christopher Alexander", "https://www.patternlanguage.com/")], ["architecture", "design", "education"], P.city],
  ["person.rem_koolhaas", ["雷姆·库哈斯", "Rem Koolhaas"], "urban", ["architect", "writer"], "20th_21st_century", ["work.delirious_new_york", "work.s_m_l_xl"], ["concept.metropolitan_condition", "concept.planned_vs_lived_city"], ["metropolis", "density"], [S.brit("biography/Rem-Koolhaas")], ["architecture", "city", "media"], P.city],
  ["person.jan_gehl", ["扬·盖尔", "Jan Gehl"], "urban", ["architect", "urban design writer"], "20th_21st_century", ["work.life_between_buildings", "work.cities_for_people"], ["concept.public_life", "concept.walkability"], ["public_life", "human_scale"], [S.official("Gehl:Jan Gehl", "https://gehlpeople.com/")], ["city", "public_space", "design"], P.city],
  ["person.william_h_whyte", ["威廉·H·怀特", "William H. Whyte"], "urban", ["urban observer", "writer"], "20th_century", ["work.social_life_small_urban_spaces"], ["concept.public_life", "concept.observation_city"], ["observation", "public_space"], [S.official("Project for Public Spaces:William H Whyte", "https://www.pps.org/article/wwhyte")], ["city", "observation", "public_space"], P.city],
  ["person.mfk_fisher", ["M. F. K. 费舍尔", "M. F. K. Fisher"], "food", ["food writer"], "20th_century", ["work.art_of_eating", "work.consider_the_oyster"], ["concept.food_memory", "concept.taste_culture"], ["memory", "essay"], [S.brit("biography/M-F-K-Fisher")], ["food", "essay", "memory"], P.food],
  ["person.fuchsia_dunlop", ["扶霞·邓洛普", "Fuchsia Dunlop"], "food", ["food writer", "translator"], "20th_21st_century", ["work.land_of_plenty", "work.every_grain_of_rice"], ["concept.regional_food_memory", "concept.recipe_vs_practice"], ["regional_food", "practice"], [S.official("Fuchsia Dunlop", "https://www.fuchsiadunlop.com/")], ["food", "Chinese_food_culture", "translation"], P.food],
  ["person.harold_mcgee", ["哈罗德·麦基", "Harold McGee"], "food", ["food science writer"], "20th_21st_century", ["work.on_food_and_cooking", "work.nose_dive"], ["concept.food_science", "concept.aroma"], ["science", "process"], [S.official("Harold McGee", "https://www.curiouscook.com/")], ["food", "science", "daily_practice"], P.food],
  ["person.alice_waters", ["艾丽斯·沃特斯", "Alice Waters"], "food", ["chef", "food activist"], "20th_21st_century", ["work.art_of_simple_food", "work.edible_schoolyard_anchor"], ["concept.home_cooking", "concept.food_social_ritual"], ["seasonal", "education"], [S.brit("biography/Alice-Waters")], ["food", "education", "daily_life"], P.food],
  ["person.rachel_carson", ["蕾切尔·卡森", "Rachel Carson"], "science.history", ["writer", "marine biologist"], "20th_century", ["work.silent_spring", "work.sea_around_us"], ["concept.environmental_risk", "concept.evidence_chain"], ["ecology", "public_science"], [S.brit("biography/Rachel-Carson")], ["science_history", "environment", "public_reasoning"], P.science],
  ["person.charles_darwin", ["查尔斯·达尔文", "Charles Darwin"], "science.history", ["naturalist"], "19th_century", ["work.origin_of_species", "work.descent_of_man"], ["concept.natural_selection", "concept.observation_science"], ["evidence", "change"], [S.brit("biography/Charles-Darwin")], ["science_history", "biology", "evidence"], P.science],
  ["person.karl_popper", ["卡尔·波普尔", "Karl Popper"], "science.history", ["philosopher of science"], "20th_century", ["work.logic_of_scientific_discovery", "work.conjectures_and_refutations"], ["concept.falsifiability", "concept.theory_model"], ["testability", "criticism"], [S.sep("popper")], ["science", "philosophy", "evidence"], P.science],
  ["person.ibn_al_haytham", ["伊本·海赛姆", "Ibn al-Haytham"], "science.history", ["mathematician", "optics writer"], "medieval", ["work.book_of_optics", "work.optics_observation_anchor"], ["concept.observation_science", "concept.experiment_science"], ["optics", "observation"], [S.brit("biography/Ibn-al-Haytham")], ["science_history", "optics", "observation"], P.science],
  ["person.stephen_jay_gould", ["斯蒂芬·杰伊·古尔德", "Stephen Jay Gould"], "science.history", ["paleontologist", "science writer"], "20th_century", ["work.mismeasure_of_man", "work.wonderful_life"], ["concept.science_public_argument", "concept.evidence_chain"], ["history", "argument"], [S.brit("biography/Stephen-Jay-Gould")], ["science_history", "public_science", "evidence"], P.science],
  ["person.rosalind_franklin", ["罗莎琳德·富兰克林", "Rosalind Franklin"], "science.history", ["chemist", "crystallographer"], "20th_century", ["work.photo_51_anchor", "work.dna_crystallography_anchor"], ["concept.evidence_chain", "concept.measurement_science"], ["measurement", "evidence"], [S.brit("biography/Rosalind-Franklin")], ["science_history", "evidence", "research_context"], P.science],
  ["person.carl_sagan", ["卡尔·萨根", "Carl Sagan"], "science.history", ["astronomer", "science communicator"], "20th_century", ["work.cosmos", "work.demon_haunted_world"], ["concept.science_public_argument", "concept.evidence_vs_explanation"], ["public_science", "skepticism"], [S.brit("biography/Carl-Sagan")], ["science", "education", "public_reasoning"], P.science],
  ["person.karl_marx", ["卡尔·马克思", "Karl Marx"], "economy", ["philosopher", "economist"], "19th_century", ["work.capital_marx", "work.communist_manifesto"], ["concept.labor", "concept.capital"], ["labor", "history"], [S.brit("biography/Karl-Marx")], ["economy", "institutions", "political_thought"], P.economy],
  ["person.john_maynard_keynes", ["约翰·梅纳德·凯恩斯", "John Maynard Keynes"], "economy", ["economist"], "20th_century", ["work.general_theory", "work.economic_consequences_peace"], ["concept.public_goods", "concept.institution_economy"], ["demand", "institution"], [S.brit("biography/John-Maynard-Keynes")], ["economy", "institutions", "history"], P.economy],
  ["person.friedrich_hayek", ["弗里德里希·哈耶克", "Friedrich Hayek"], "economy", ["economist", "political theorist"], "20th_century", ["work.road_to_serfdom", "work.use_of_knowledge_society"], ["concept.market_information", "concept.institution_economy"], ["knowledge", "market"], [S.brit("biography/F-A-Hayek")], ["economy", "institutions", "market"], P.economy],
  ["person.amartya_sen", ["阿马蒂亚·森", "Amartya Sen"], "economy", ["economist", "philosopher"], "20th_21st_century", ["work.development_as_freedom", "work.idea_of_justice"], ["concept.capability_approach", "concept.fairness"], ["capability", "justice"], [S.nobel("prizes/economic-sciences/1998/sen/facts/")], ["economy", "justice", "education"], P.economy],
  ["person.douglass_north", ["道格拉斯·诺斯", "Douglass North"], "economy", ["economist"], "20th_century", ["work.institutions_institutional_change", "work.economic_history_structure"], ["concept.institution_economy", "concept.governance_rules"], ["institutions", "history"], [S.nobel("prizes/economic-sciences/1993/north/facts/")], ["economy", "history", "institutions"], P.economy],
  ["person.joseph_schumpeter", ["约瑟夫·熊彼特", "Joseph Schumpeter"], "economy", ["economist"], "20th_century", ["work.capitalism_socialism_democracy", "work.theory_economic_development"], ["concept.creative_destruction", "concept.innovation_economy"], ["innovation", "change"], [S.brit("biography/Joseph-Schumpeter")], ["economy", "technology", "institutions"], P.economy],
  ["person.lon_fuller", ["朗·富勒", "Lon Fuller"], "law_boundary", ["legal philosopher"], "20th_century", ["work.morality_of_law", "work.fuller_hart_debate_anchor"], ["concept.legality_justice_distinction", "concept.rule_of_law"], ["legality", "procedure"], [S.sep("fuller")], ["law_boundary", "philosophy", "rule"], P.law],
  ["person.montesquieu", ["孟德斯鸠", "Montesquieu"], "law_boundary", ["political philosopher"], "18th_century", ["work.spirit_of_laws", "work.persian_letters"], ["concept.separation_of_powers", "concept.rule_of_law"], ["law", "institution"], [S.brit("biography/Montesquieu")], ["law_boundary", "institutions", "history"], P.law],
  ["person.hannah_arendt", ["汉娜·阿伦特", "Hannah Arendt"], "law_boundary", ["political theorist"], "20th_century", ["work.human_condition", "work.origins_totalitarianism"], ["concept.public_space_political", "concept.action_plurality"], ["public", "action"], [S.brit("biography/Hannah-Arendt")], ["political_thought", "law_boundary", "public_space"], P.law],
  ["person.cesare_beccaria", ["切萨雷·贝卡里亚", "Cesare Beccaria"], "law_boundary", ["legal reform writer"], "18th_century", ["work.on_crimes_and_punishments", "work.beccaria_punishment_anchor"], ["concept.proportionality_law", "concept.legal_interpretation"], ["punishment", "reform"], [S.brit("biography/Cesare-Beccaria")], ["law_boundary", "justice", "history"], P.law],
  ["person.william_james", ["威廉·詹姆斯", "William James"], "psychology_boundary", ["psychologist", "philosopher"], "19th_20th_century", ["work.principles_of_psychology", "work.varieties_religious_experience"], ["concept.attention", "concept.memory_as_reconstruction"], ["experience", "attention"], [S.brit("biography/William-James")], ["psychology_boundary", "philosophy", "education"], P.psych],
  ["person.john_bowlby", ["约翰·鲍尔比", "John Bowlby"], "psychology_boundary", ["psychiatrist", "attachment theorist"], "20th_century", ["work.attachment_and_loss", "work.secure_base"], ["concept.attachment_boundary", "concept.care_boundary"], ["attachment", "care"], [S.brit("biography/John-Bowlby")], ["psychology_boundary", "care_boundary", "literature"], P.psych],
  ["person.aaron_beck", ["亚伦·贝克", "Aaron Beck"], "psychology_boundary", ["psychiatrist"], "20th_21st_century", ["work.cognitive_therapy_depression_anchor", "work.beck_depression_inventory_anchor"], ["concept.therapy_boundary", "concept.emotion_evidence"], ["cognition", "care"], [S.official("Beck Institute:Aaron T. Beck", "https://beckinstitute.org/about/our-history/aaron-t-beck/")], ["psychology_boundary", "care_boundary"], P.psych],
  ["person.daniel_kahneman", ["丹尼尔·卡尼曼", "Daniel Kahneman"], "psychology_boundary", ["psychologist", "economist"], "20th_21st_century", ["work.thinking_fast_and_slow", "work.prospect_theory_anchor"], ["concept.cognitive_bias", "concept.evidence_vs_explanation"], ["judgment", "bias"], [S.nobel("prizes/economic-sciences/2002/kahneman/facts/")], ["psychology_boundary", "economy", "decision"], P.psych],
  ["person.paulo_freire", ["保罗·弗莱雷", "Paulo Freire"], "education", ["educator", "philosopher"], "20th_century", ["work.pedagogy_of_the_oppressed", "work.education_for_critical_consciousness"], ["concept.dialogue_pedagogy", "concept.training_vs_education"], ["dialogue", "praxis"], [S.brit("biography/Paulo-Freire")], ["education", "political_thought", "dialogue"], P.education],
  ["person.bell_hooks", ["贝尔·胡克斯", "bell hooks"], "education", ["writer", "educator"], "20th_21st_century", ["work.teaching_to_transgress", "work.teaching_community"], ["concept.classroom_social_environment", "concept.dialogue_pedagogy"], ["classroom", "voice"], [S.official("bell hooks Institute", "https://www.bellhooksinstitute.com/")], ["education", "literature", "care_boundary"], P.education],
  ["person.jean_piaget", ["让·皮亚杰", "Jean Piaget"], "education", ["psychologist"], "20th_century", ["work.language_and_thought_child", "work.child_conception_world"], ["concept.developmental_learning_boundary", "concept.assessment_learning"], ["development", "learning"], [S.brit("biography/Jean-Piaget")], ["education", "psychology_boundary", "learning"], P.education],
  ["person.jerome_bruner", ["杰罗姆·布鲁纳", "Jerome Bruner"], "education", ["psychologist", "educator"], "20th_century", ["work.process_of_education", "work.actual_minds_possible_worlds"], ["concept.example_based_learning", "concept.transfer_learning"], ["structure", "narrative"], [S.brit("biography/Jerome-Bruner")], ["education", "narration", "learning"], P.education],
  ["person.vannevar_bush", ["范内瓦·布什", "Vannevar Bush"], "technology", ["engineer", "science administrator"], "20th_century", ["work.as_we_may_think", "work.memex_anchor"], ["concept.hypertext_linear", "concept.information_architecture"], ["memory", "linking"], [S.brit("biography/Vannevar-Bush")], ["technology", "knowledge_work", "interface"], P.tech],
  ["person.grace_hopper", ["格蕾丝·霍珀", "Grace Hopper"], "technology", ["computer scientist"], "20th_century", ["work.cobol_anchor", "work.compiler_anchor"], ["concept.programming_language", "concept.abstraction_computing"], ["language", "abstraction"], [S.brit("biography/Grace-Hopper")], ["technology", "language", "education"], P.tech],
  ["person.donald_norman", ["唐纳德·诺曼", "Donald Norman"], "technology", ["design researcher"], "20th_21st_century", ["work.design_of_everyday_things", "work.emotional_design"], ["concept.affordance_design", "concept.usability"], ["interface", "affordance"], [S.official("Nielsen Norman Group:Don Norman", "https://www.nngroup.com/people/don-norman/")], ["technology", "design", "interface"], P.tech],
  ["person.ted_nelson", ["泰德·尼尔森", "Ted Nelson"], "technology", ["information theorist", "writer"], "20th_21st_century", ["work.computer_lib_dream_machines", "work.xanadu_anchor"], ["concept.hypertext_linear", "concept.web_protocol_distinction"], ["hypertext", "nonlinear"], [S.official("Ted Nelson", "https://xanadu.com.au/ted/")], ["technology", "text", "interface"], P.tech],
  ["person.claude_shannon", ["克劳德·香农", "Claude Shannon"], "technology", ["mathematician", "engineer"], "20th_century", ["work.mathematical_theory_communication", "work.shannon_information_anchor"], ["concept.information_theory", "concept.signal_noise"], ["information", "signal"], [S.brit("biography/Claude-Shannon")], ["technology", "science", "language"], P.tech],
  ["person.norbert_wiener", ["诺伯特·维纳", "Norbert Wiener"], "technology", ["mathematician"], "20th_century", ["work.cybernetics", "work.human_use_human_beings"], ["concept.cybernetics", "concept.feedback_systems"], ["feedback", "system"], [S.brit("biography/Norbert-Wiener")], ["technology", "education", "systems"], P.tech],
  ["person.john_mccarthy", ["约翰·麦卡锡", "John McCarthy"], "technology", ["computer scientist"], "20th_century", ["work.dartmouth_ai_anchor", "work.lisp_anchor"], ["concept.symbolic_ai", "concept.algorithm"], ["AI", "symbol"], [S.acm("award_winners/mccarthy_1118322")], ["technology", "AI_history", "language"], P.tech],
  ["person.adele_goldberg", ["阿黛尔·戈德堡", "Adele Goldberg"], "technology", ["computer scientist"], "20th_21st_century", ["work.smalltalk_anchor", "work.personal_dynamic_media_anchor"], ["concept.personal_computing", "concept.interface"], ["object", "personal_computing"], [S.official("ACM:Adele Goldberg", "https://amturing.acm.org/award_winners/goldberg_8759341.cfm")], ["technology", "education", "interface"], P.tech],
  ["person.brenda_laurel", ["布伦达·劳雷尔", "Brenda Laurel"], "technology", ["interface theorist", "designer"], "20th_21st_century", ["work.computers_as_theatre", "work.interface_as_performance_anchor"], ["concept.interface_as_medium", "concept.usability"], ["performance", "interface"], [S.official("Brenda Laurel", "https://www.tauzero.com/Brenda_Laurel/")], ["technology", "theater", "interface"], P.tech],
  ["person.elizabeth_eisenstein", ["伊丽莎白·爱森斯坦", "Elizabeth Eisenstein"], "technology", ["historian"], "20th_21st_century", ["work.printing_press_agent_change", "work.print_culture_anchor"], ["concept.media_change", "concept.tool_vs_medium"], ["print", "knowledge"], [S.brit("technology/printing-press")], ["technology", "history", "literature"], P.tech],
  ["person.mary_parker_follett", ["玛丽·帕克·福莱特", "Mary Parker Follett"], "education", ["management thinker", "social worker"], "20th_century", ["work.creative_experience", "work.new_state"], ["concept.group_process", "concept.feedback_learning"], ["group", "practice"], [S.brit("biography/Mary-Parker-Follett")], ["education", "organization", "dialogue"], P.education]
].map(([id, names, domain, roles, period, works, concepts, axes, provenance, transfer, meta]) => person({
  id,
  names,
  domain,
  roles,
  period,
  regions: [],
  works,
  concepts,
  axes,
  provenance,
  transfer,
  meta
}));

const conceptRows = [
  ["concept.modernist_planning", ["现代主义规划", "modernist planning"], "urban", ["plan", "order", "scale"], ["zoning diagram", "tower block"], ["all architecture"], ["concept.planned_vs_lived_city"], ["planning is neutral"], ["do_not_rank_planned_city_without_context"], ["No current zoning advice."], [S.brit("topic/urban-planning")], ["city", "architecture", "film"], P.city],
  ["concept.pattern_language", ["模式语言", "pattern language"], "urban", ["recurring situation", "design response", "human use"], ["design pattern"], ["template answer"], ["concept.human_scale"], ["pattern means fixed formula"], ["do_not_turn_pattern_into_prompt_template"], ["Use as design structure, not canned prose."], [S.official("PatternLanguage", "https://www.patternlanguage.com/")], ["architecture", "design", "education"], P.city],
  ["concept.human_scale", ["人的尺度", "human scale"], "urban", ["body", "street", "distance"], ["walkable block"], ["small means good"], ["concept.walkability"], ["human scale equals nostalgia"], ["do_not_reduce_city_to_smallness"], ["No travel ranking."], [S.official("Gehl:human scale", "https://gehlpeople.com/")], ["city", "design", "education"], P.city],
  ["concept.metropolitan_condition", ["大都会状态", "metropolitan condition"], "urban", ["density", "speed", "media"], ["metropolitan block"], ["city as chaos only"], ["concept.density_urban"], ["metropolis equals alienation"], ["do_not_make_city_psychological_cause"], ["Use as cultural frame."], [S.brit("topic/metropolis")], ["city", "film", "literature"], P.city],
  ["concept.public_life", ["公共生活", "public life"], "urban", ["presence", "encounter", "shared space"], ["plaza observation"], ["government policy alone"], ["concept.public_space"], ["public equals official"], ["do_not_give_local_planning_advice"], ["No current city ranking."], [S.official("Project for Public Spaces", "https://www.pps.org/")], ["city", "political_thought", "film"], P.city],
  ["concept.observation_city", ["城市观察", "urban observation"], "urban", ["watching", "pattern", "use"], ["bench use"], ["surveillance"], ["concept.public_life"], ["observation equals proof"], ["do_not_overclaim_from_anecdote"], ["Anecdotes need scope."], [S.official("Project for Public Spaces:William H Whyte", "https://www.pps.org/article/wwhyte")], ["city", "science_observation", "film"], P.city],
  ["concept.block_urban", ["街区", "urban block"], "urban", ["street", "parcel", "walk", "edge"], ["short block"], ["administrative district"], ["concept.city_street"], ["block equals neighborhood"], ["do_not_make_design_prescription"], ["No zoning advice."], [S.brit("topic/urban-planning")], ["city", "film", "daily_life"], P.city],
  ["concept.walkability", ["可步行性", "walkability"], "urban", ["walking", "access", "safety", "interest"], ["walkable street"], ["tour advice"], ["concept.public_life"], ["walkability equals beauty"], ["do_not_give_current_route_advice"], ["No travel recommendation."], [S.official("Project for Public Spaces", "https://www.pps.org/")], ["city", "health_boundary", "design"], P.city],
  ["concept.density_urban", ["城市密度", "urban density"], "urban", ["people", "use", "proximity"], ["mixed-use density"], ["crowding only"], ["concept.diversity_urban"], ["density equals bad"], ["do_not_rank_city_policy"], ["No policy advice."], [S.brit("topic/urban-planning")], ["city", "economy", "film"], P.city],
  ["concept.diversity_urban", ["城市多样性", "urban diversity"], "urban", ["uses", "people", "times"], ["mixed street"], ["identity label only"], ["concept.public_life"], ["diversity equals decoration"], ["do_not_flatten_social_context"], ["Use conceptually."], [S.brit("topic/urban-planning")], ["city", "institutions", "daily_life"], P.city],
  ["concept.urban_memory", ["城市记忆", "urban memory"], "urban", ["place", "routine", "change"], ["old street memory"], ["official heritage only"], ["theme.memory", "concept.city_street"], ["memory equals fact"], ["do_not_treat_memory_as_archive"], ["Mark personal vs historical memory."], [S.sep("memory")], ["city", "film", "literature"], P.city],
  ["concept.planned_vs_lived_city", ["规划城市与生活城市", "planned city vs lived city"], "urban", ["plan", "use", "routine"], ["planned boulevard", "lived street"], ["plan bad life good"], ["concept.city_street"], ["binary value ranking"], ["do_not_romanticize_disorder"], ["No planning prescription."], [S.brit("topic/urban-planning")], ["city", "film", "literature"], P.city],
  ["concept.street_as_scene", ["街道作为场景", "street as scene"], "urban", ["public life", "movement", "view"], ["street scene"], ["mere background"], ["concept.city_street", "theme.framing"], ["setting only"], ["do_not_reduce_street_to_setting"], ["Use scene relation carefully."], [S.brit("art/cinematography")], ["city", "film", "literature"], P.city],
  ["concept.imageability", ["可意象性", "imageability"], "urban", ["legibility", "path", "edge"], ["mental city map"], ["photo quality"], ["theme.framing"], ["imageability equals image"], ["do_not_confuse_with_picture"], ["Use as urban cognition concept."], [S.official("MIT Press:The Image of the City", "https://mitpress.mit.edu/")], ["city", "design", "memory"], P.city],
  ["concept.spatial_practice", ["空间实践", "spatial practice"], "urban", ["use", "routine", "production"], ["daily route"], ["abstract space only"], ["concept.public_space"], ["space equals container"], ["do_not_turn_into_slogan"], ["Use as theory term."], [S.brit("topic/urban-planning")], ["city", "philosophy", "daily_life"], P.city],
  ["concept.taste_culture", ["滋味文化", "taste culture"], "food", ["taste", "habit", "memory"], ["preferred flavor"], ["nutrition fact"], ["concept.food_memory"], ["taste equals objective rank"], ["do_not_rank_cultures"], ["No nutrition advice."], [S.brit("topic/taste-sense")], ["food", "literature", "memory"], P.food],
  ["concept.texture_food", ["口感", "texture"], "food", ["mouthfeel", "structure", "contrast"], ["crisp", "soft"], ["flavor only"], ["concept.taste_culture"], ["texture equals quality"], ["do_not_turn_into_recipe_command"], ["No food safety claim."], [S.brit("science/texture-food")], ["food", "film_pacing", "description"], P.food],
  ["concept.aroma", ["香气", "aroma"], "food", ["smell", "volatile", "memory"], ["roasted aroma"], ["nutrition"], ["concept.food_memory"], ["aroma equals taste"], ["do_not_make_health_claim"], ["No medical claim."], [S.brit("topic/smell")], ["food", "memory", "science"], P.food],
  ["concept.seasoning", ["调味", "seasoning"], "food", ["salt", "acid", "balance"], ["seasoned broth"], ["covering flaws"], ["concept.recipe_vs_practice"], ["seasoning equals more flavor"], ["do_not_give_exact_recipe"], ["No diet advice."], [S.brit("topic/cooking")], ["food", "craft", "education"], P.food],
  ["concept.fermentation_food", ["发酵", "fermentation"], "food", ["microbe", "time", "transformation"], ["fermented food"], ["rot by default"], ["concept.timing_cooking"], ["fermentation equals safe automatically"], ["do_not_certify_food_safety"], ["No food-safety certification."], [S.brit("science/fermentation")], ["food", "science", "memory"], P.food],
  ["concept.knife_work", ["刀工", "knife work"], "food", ["cut", "texture", "timing"], ["thin slicing"], ["decoration only"], ["concept.texture_food"], ["knife work equals display"], ["do_not_give_safety_instruction"], ["No safety certification."], [S.brit("topic/cooking")], ["food", "craft", "design"], P.food],
  ["concept.food_social_ritual", ["食物作为社会仪式", "food as social ritual"], "food", ["sharing", "occasion", "relation"], ["family meal"], ["restaurant ranking"], ["concept.food_memory"], ["ritual equals religion only"], ["do_not_psychologize_user"], ["Use light cultural frame."], [S.brit("topic/ritual")], ["food", "literature", "care_boundary"], P.food],
  ["concept.regional_food_memory", ["地域食物记忆", "regional food memory"], "food", ["place", "ingredient", "dialect"], ["regional dish memory"], ["authenticity contest"], ["concept.food_memory"], ["region equals purity"], ["do_not_police_authenticity"], ["No restaurant advice."], [S.brit("topic/cooking")], ["food", "city", "literature"], P.food],
  ["concept.food_science", ["食物科学", "food science"], "food", ["chemistry", "process", "heat"], ["browning process"], ["medical nutrition"], ["concept.heat_control"], ["food science equals diet advice"], ["do_not_make_medical_claim"], ["No medical nutrition advice."], [S.brit("science/food-science")], ["food", "science", "craft"], P.food],
  ["concept.science_public_argument", ["公共科学论证", "public science argument"], "science.history", ["evidence", "public", "risk"], ["environmental argument"], ["science news by default"], ["concept.evidence_chain"], ["public argument equals certainty"], ["do_not_make_current_lab_claim"], ["No current science claims."], [S.brit("science/science")], ["science", "public_reasoning", "education"], P.science],
  ["concept.observation_science", ["科学观察", "observation"], "science.history", ["seeing", "instrument", "record"], ["telescope observation"], ["opinion"], ["concept.experiment_science"], ["observation equals raw fact"], ["do_not_ignore_instrument_context"], ["Stable concept only."], [S.brit("science/scientific-method")], ["science", "city_observation", "film"], P.science],
  ["concept.experiment_science", ["实验", "experiment"], "science.history", ["intervention", "control", "measurement"], ["controlled test"], ["anecdote"], ["concept.evidence_chain"], ["experiment equals proof forever"], ["do_not_generalize_beyond_scope"], ["No lab advice."], [S.brit("science/scientific-method")], ["science", "education", "evidence"], P.science],
  ["concept.theory_model", ["理论与模型", "model and theory"], "science.history", ["model", "theory", "scope"], ["mathematical model"], ["reality itself"], ["concept.evidence_vs_explanation"], ["model equals fact"], ["do_not_confuse_model_with_world"], ["Keep scope."], [S.brit("science/scientific-theory")], ["science", "technology", "economy"], P.science],
  ["concept.evidence_chain", ["证据链", "evidence chain"], "science.history", ["source", "measurement", "inference"], ["linked evidence"], ["single anecdote"], ["concept.observation_science"], ["evidence equals certainty"], ["do_not_overstate_confidence"], ["Preserve uncertainty."], [S.brit("science/scientific-method")], ["science", "law", "history"], P.science],
  ["concept.falsifiability", ["可证伪性", "falsifiability"], "science.history", ["test", "risk", "refutation"], ["testable claim"], ["being false"], ["concept.theory_model"], ["falsifiable equals false"], ["do_not_use_as_universal_demarcation"], ["Philosophy of science scope."], [S.sep("popper")], ["science", "philosophy", "argument"], P.science],
  ["concept.natural_selection", ["自然选择", "natural selection"], "science.history", ["variation", "inheritance", "selection"], ["evolutionary mechanism"], ["moral progress"], ["concept.observation_science"], ["natural equals good"], ["do_not_make_social_darwinist_claim"], ["Biology/history scope."], [S.brit("science/natural-selection")], ["science", "history", "evidence"], P.science],
  ["concept.radioactivity", ["放射性", "radioactivity"], "science.history", ["nucleus", "emission", "measurement"], ["radioactive decay"], ["generic energy"], ["concept.measurement_science"], ["radioactivity equals danger only"], ["do_not_give_medical_or_lab_advice"], ["No biomedical/lab advice."], [S.brit("science/radioactivity")], ["science", "history", "measurement"], P.science],
  ["concept.environmental_risk", ["环境风险", "environmental risk"], "science.history", ["ecology", "exposure", "uncertainty"], ["pesticide risk"], ["political preference only"], ["concept.evidence_chain"], ["risk equals certainty"], ["do_not_make_current_regulatory_claim"], ["No current regulation claim."], [S.brit("science/environmental-science")], ["science", "law_boundary", "public_reasoning"], P.science],
  ["concept.measurement_science", ["测量", "measurement"], "science.history", ["instrument", "unit", "error"], ["measurement record"], ["truth itself"], ["concept.evidence_chain"], ["measurement equals neutral"], ["do_not_ignore_error_or_context"], ["Preserve uncertainty."], [S.brit("science/measurement")], ["science", "technology", "law"], P.science],
  ["concept.capital", ["资本", "capital"], "economy", ["asset", "production", "investment"], ["productive asset"], ["money only"], ["concept.market"], ["capital equals cash"], ["do_not_give_investing_advice"], ["No personal finance advice."], [S.brit("money/capital-economics")], ["economy", "history", "institutions"], P.economy],
  ["concept.institution_economy", ["经济制度", "economic institution"], "economy", ["rule", "norm", "organization"], ["property rule"], ["building only"], ["theme.institution"], ["institution equals organization only"], ["do_not_make_current_policy_claim"], ["Conceptual/historical only."], [S.brit("topic/institutional-economics")], ["economy", "law", "technology"], P.economy],
  ["concept.public_goods", ["公共品", "public goods"], "economy", ["nonrival", "nonexcludable", "collective"], ["public good example"], ["anything good for public"], ["concept.commons"], ["public good equals government service"], ["do_not_make_policy_prescription"], ["No current policy advice."], [S.brit("money/public-good-economics")], ["economy", "law", "city"], P.economy],
  ["concept.externality", ["外部性", "externality"], "economy", ["side effect", "third party", "cost"], ["pollution cost"], ["bad outcome only"], ["concept.environmental_risk"], ["externality equals accident"], ["do_not_give_regulatory_advice"], ["Concept only."], [S.brit("money/externality")], ["economy", "science", "law"], P.economy],
  ["concept.capability_approach", ["能力方法", "capability approach"], "economy", ["freedom", "functioning", "opportunity"], ["capability comparison"], ["skill training only"], ["theme.freedom_responsibility"], ["capability equals talent"], ["do_not_reduce_to_productivity"], ["Theory scope."], [S.sep("capability-approach")], ["economy", "education", "justice"], P.economy],
  ["concept.market_information", ["市场信息", "market information"], "economy", ["price", "knowledge", "coordination"], ["distributed knowledge"], ["perfect knowledge"], ["concept.market"], ["market knows everything"], ["do_not_make_forecast"], ["No market forecast."], [S.brit("biography/F-A-Hayek")], ["economy", "technology", "institutions"], P.economy],
  ["concept.creative_destruction", ["创造性破坏", "creative destruction"], "economy", ["innovation", "displacement", "capitalism"], ["new technology displacing old"], ["good by default"], ["concept.innovation_economy"], ["destruction equals progress"], ["do_not_celebrate_harm"], ["No investment advice."], [S.brit("money/creative-destruction")], ["economy", "technology", "history"], P.economy],
  ["concept.innovation_economy", ["创新经济", "innovation economy"], "economy", ["novelty", "diffusion", "institution"], ["new production method"], ["startup slogan"], ["concept.creative_destruction"], ["innovation equals virtue"], ["do_not_make_product_claim"], ["No current product advice."], [S.brit("money/innovation")], ["economy", "technology", "education"], P.economy],
  ["concept.legality_justice_distinction", ["合法性与正义区别", "legality vs justice"], "law_boundary", ["law", "morality", "procedure"], ["legal but contested"], ["same thing"], ["concept.rule_of_law"], ["legal equals just"], ["do_not_give_legal_advice"], ["Jurisprudence only."], [S.sep("lawphil-theory")], ["law", "philosophy", "literature"], P.law],
  ["concept.legal_interpretation", ["法律解释", "legal interpretation"], "law_boundary", ["text", "purpose", "precedent"], ["interpreting a rule"], ["personal opinion"], ["concept.rule_application_precedent"], ["interpretation equals free choice"], ["do_not_apply_current_law"], ["Needs jurisdiction/date/source for real law."], [S.sep("legal-reas-interpret")], ["law", "literature", "argument"], P.law],
  ["concept.jurisdiction", ["辖区", "jurisdiction"], "law_boundary", ["authority", "place", "court"], ["state jurisdiction"], ["topic category"], ["concept.jurisdiction_date_boundary"], ["jurisdiction equals country only"], ["do_not_answer_without_jurisdiction"], ["No current legal advice."], [S.official("Oyez:about", "https://www.oyez.org/about")], ["law", "boundary", "source_sensitive"], P.law],
  ["concept.procedure_law", ["程序", "procedure"], "law_boundary", ["process", "deadline", "forum"], ["filing procedure"], ["mere formality"], ["concept.jurisdiction_date_boundary"], ["procedure equals detail"], ["do_not_guess_procedure"], ["No procedural advice."], [S.sep("procedural-law")], ["law", "institutions", "education"], P.law],
  ["concept.law_morality", ["法律与道德", "law and morality"], "law_boundary", ["validity", "obligation", "value"], ["legal-moral debate"], ["same thing"], ["concept.legal_positivism"], ["law equals morality"], ["do_not_solve_current_case"], ["Theory only."], [S.sep("legal-positivism")], ["law", "philosophy", "literature"], P.law],
  ["concept.precedent_boundary", ["判例边界", "precedent boundary"], "law_boundary", ["case", "authority", "scope"], ["case precedent"], ["universal rule"], ["concept.rule_application_precedent"], ["precedent always controls"], ["do_not_treat_precedent_as_global"], ["Needs court/jurisdiction/date."], [S.sep("precedent")], ["law", "argument", "same_or_different"], P.law],
  ["concept.legal_testimony", ["法律证言", "legal testimony"], "law_boundary", ["witness", "record", "credibility"], ["testimony record"], ["narrative truth"], ["concept.testimony"], ["testimony equals truth"], ["do_not_evaluate_real_case"], ["No legal advice."], [S.brit("topic/testimony-law")], ["law", "literature", "film"], P.law],
  ["concept.separation_of_powers", ["权力分立", "separation of powers"], "law_boundary", ["legislative", "executive", "judicial"], ["institutional separation"], ["good governance by default"], ["concept.rule_of_law"], ["separation solves all abuse"], ["do_not_make_current_constitution_claim"], ["Political theory scope."], [S.brit("topic/separation-of-powers")], ["law", "institutions", "history"], P.law],
  ["concept.action_plurality", ["行动与复数性", "action and plurality"], "law_boundary", ["public", "speech", "plurality"], ["public action"], ["individual psychology"], ["concept.public_space_political"], ["plurality equals diversity metric"], ["do_not_turn_into_policy_claim"], ["Theory scope."], [S.brit("biography/Hannah-Arendt")], ["political_thought", "city", "education"], P.law],
  ["concept.public_space_political", ["政治公共空间", "political public space"], "law_boundary", ["public", "appearance", "action"], ["public forum"], ["urban design only"], ["concept.public_space"], ["political space equals street"], ["do_not_give_legal_public_forum_advice"], ["No current law."], [S.brit("biography/Hannah-Arendt")], ["law", "city", "philosophy"], P.law],
  ["concept.proportionality_law", ["比例原则", "proportionality"], "law_boundary", ["means", "end", "severity"], ["punishment proportionality"], ["fair feeling"], ["concept.fairness"], ["proportional means equal"], ["do_not_apply_to_current_case"], ["Theory only."], [S.brit("topic/criminal-law")], ["law", "justice", "ethics"], P.law],
  ["concept.attention", ["注意", "attention"], "psychology_boundary", ["focus", "selection", "effort"], ["attending to a task"], ["moral virtue"], ["concept.working_memory"], ["attention equals willpower"], ["do_not_diagnose_user"], ["Concept-level only."], [S.official("APA:attention", "https://dictionary.apa.org/attention")], ["psychology_boundary", "education", "interface"], P.psych],
  ["concept.memory_as_reconstruction", ["记忆作为重构", "memory as reconstruction"], "psychology_boundary", ["recall", "cue", "reconstruction"], ["remembered scene"], ["perfect storage"], ["theme.memory"], ["memory equals archive"], ["do_not_treat_memory_as_fact"], ["No diagnosis."], [S.sep("memory")], ["psychology_boundary", "literature", "film"], P.psych],
  ["concept.attachment_boundary", ["依恋边界", "attachment boundary"], "psychology_boundary", ["relationship", "security", "development"], ["attachment concept"], ["diagnosing user relation"], ["concept.care_boundary"], ["attachment label explains all"], ["do_not_diagnose_attachment"], ["No clinical assessment."], [S.official("APA:attachment", "https://dictionary.apa.org/attachment")], ["psychology_boundary", "care", "literature"], P.psych],
  ["concept.therapy_boundary", ["治疗边界", "therapy boundary"], "psychology_boundary", ["scope", "clinician", "treatment"], ["support caveat"], ["chat as therapy"], ["concept.no_diagnosis_boundary"], ["support equals therapy"], ["do_not_give_treatment_plan"], ["High-stakes needs qualified help."], [S.official("APA:psychotherapy", "https://dictionary.apa.org/psychotherapy")], ["psychology_boundary", "care", "safety"], P.psych],
  ["concept.emotion_evidence", ["情绪与证据", "emotion vs evidence"], "psychology_boundary", ["feeling", "claim", "evidence"], ["felt impression"], ["emotion proves fact"], ["concept.care_boundary"], ["emotion is evidence for external fact"], ["do_not_invalidate_feeling"], ["Separate feeling from factual claim."], [S.official("APA:emotion", "https://dictionary.apa.org/emotion")], ["psychology_boundary", "law", "literature"], P.psych],
  ["concept.affective_association", ["情感联想", "affective association"], "psychology_boundary", ["object", "feeling", "memory"], ["book evokes childhood"], ["diagnosis"], ["concept.affective_disclosure_boundary"], ["association equals symptom"], ["do_not_psychologize_user"], ["Use light uptake."], [S.official("APA:association", "https://dictionary.apa.org/association")], ["psychology_boundary", "music", "literature"], P.psych],
  ["concept.cognitive_bias", ["认知偏差", "cognitive bias"], "psychology_boundary", ["judgment", "heuristic", "error"], ["framing effect"], ["stupidity"], ["concept.evidence_vs_explanation"], ["bias equals bad person"], ["do_not_diagnose_user"], ["Conceptual only."], [S.official("APA:bias", "https://dictionary.apa.org/bias")], ["psychology_boundary", "economy", "education"], P.psych],
  ["concept.grief_boundary", ["哀伤边界", "grief boundary"], "psychology_boundary", ["loss", "time", "support"], ["grief mention"], ["clinical diagnosis by chat"], ["concept.care_boundary"], ["grief has one path"], ["do_not_treat_or_diagnose"], ["Use care/safety boundary."], [S.official("APA:grief", "https://dictionary.apa.org/grief")], ["psychology_boundary", "literature", "care"], P.psych],
  ["concept.curriculum", ["课程", "curriculum"], "education", ["sequence", "aim", "content"], ["course plan"], ["textbook only"], ["concept.assessment_learning"], ["curriculum equals list"], ["do_not_give_policy_claim"], ["No school-policy current fact."], [S.brit("topic/curriculum")], ["education", "planning", "design"], P.education],
  ["concept.assessment_learning", ["评价与测评", "assessment"], "education", ["evidence", "feedback", "standard"], ["formative check"], ["score only"], ["concept.feedback_learning"], ["assessment equals ranking"], ["do_not_label_learners"], ["No clinical/special-needs advice."], [S.brit("topic/educational-assessment")], ["education", "feedback", "measurement"], P.education],
  ["concept.practice_learning", ["练习", "practice"], "education", ["repetition", "feedback", "adjustment"], ["deliberate practice"], ["drill only"], ["concept.feedback_learning"], ["practice equals rote"], ["do_not_remove_reflection"], ["Context matters."], [S.brit("topic/learning")], ["education", "food_craft", "music"], P.education],
  ["concept.transfer_learning", ["迁移", "transfer"], "education", ["apply", "context", "abstraction"], ["use idea in new domain"], ["copying answer"], ["concept.example_based_learning"], ["transfer is automatic"], ["do_not_claim_transfer_without_bridge"], ["Needs relation support."], [S.brit("topic/learning")], ["education", "dialogue", "analogy"], P.education],
  ["concept.formative_summative", ["形成性与总结性评价", "formative vs summative"], "education", ["feedback", "judgment", "timing"], ["draft feedback", "final exam"], ["good vs bad"], ["concept.assessment_learning"], ["formative always gentle"], ["do_not_make_school_policy_claim"], ["Educational scope only."], [S.brit("topic/educational-assessment")], ["education", "feedback", "evaluation"], P.education],
  ["concept.training_vs_education", ["训练与教育", "training vs education"], "education", ["skill", "judgment", "aim"], ["task training", "critical education"], ["one is always superior"], ["concept.learning_by_doing"], ["education means no practice"], ["do_not_rank_without_goal"], ["Use based on aim."], [S.brit("topic/education")], ["education", "work", "dialogue"], P.education],
  ["concept.example_based_learning", ["例子学习", "example-based learning"], "education", ["example", "pattern", "transfer"], ["worked example"], ["answer memorization"], ["concept.transfer_learning"], ["example equals final answer"], ["do_not_train_prompt_patch"], ["Use example as support, not answer."], [S.brit("topic/learning")], ["education", "evaluation_governance", "dialogue"], P.education],
  ["concept.dialogue_pedagogy", ["对话教育", "dialogue pedagogy"], "education", ["question", "voice", "reflection"], ["dialogic classroom"], ["chatty style"], ["concept.inquiry_learning"], ["dialogue equals no structure"], ["do_not_force_question_back"], ["Needs purpose and context."], [S.brit("topic/education")], ["education", "dialogue", "care_boundary"], P.education],
  ["concept.developmental_learning_boundary", ["发展学习边界", "developmental learning boundary"], "education", ["age", "stage", "context"], ["developmental concept"], ["diagnosis"], ["concept.no_diagnosis_boundary"], ["development explains individual fully"], ["do_not_diagnose_child"], ["No special-needs advice."], [S.official("APA:development", "https://dictionary.apa.org/development")], ["education", "psychology_boundary"], P.education],
  ["concept.group_process", ["群体过程", "group process"], "education", ["interaction", "conflict", "coordination"], ["group discussion"], ["groupthink only"], ["concept.social_learning"], ["group equals consensus"], ["do_not_ignore_power_context"], ["Use conceptually."], [S.brit("topic/social-psychology")], ["education", "organization", "dialogue"], P.education],
  ["concept.algorithm", ["算法", "algorithm"], "technology", ["procedure", "input", "step"], ["sorting procedure"], ["AI magic"], ["concept.computation"], ["algorithm equals model"], ["do_not_make_platform_claim"], ["No product/API state claim."], [S.brit("technology/algorithm")], ["technology", "science", "education"], P.tech],
  ["concept.usability", ["可用性", "usability"], "technology", ["use", "task", "feedback"], ["usable interface"], ["visual polish only"], ["concept.interface"], ["usability equals taste"], ["do_not_give_product_review"], ["No current product advice."], [S.official("Nielsen Norman Group:usability", "https://www.nngroup.com/articles/usability-101-introduction-to-usability/")], ["technology", "design", "education"], P.tech],
  ["concept.affordance_design", ["可供性", "affordance"], "technology", ["perceived action", "object", "user"], ["handle suggests pulling"], ["button styling"], ["concept.interface"], ["affordance equals instruction text"], ["do_not_reduce_interface_to_style"], ["Conceptual design only."], [S.official("Nielsen Norman Group:affordance", "https://www.nngroup.com/articles/affordances-and-signifiers/")], ["technology", "design", "city"], P.tech],
  ["concept.information_architecture", ["信息架构", "information architecture"], "technology", ["organization", "label", "navigation"], ["site structure"], ["visual layout only"], ["concept.interface"], ["IA equals menu"], ["do_not_claim_current_site_behavior"], ["No platform-specific claim."], [S.official("Information Architecture Institute", "https://www.iainstitute.org/")], ["technology", "design", "education"], P.tech],
  ["concept.personal_computing", ["个人计算", "personal computing"], "technology", ["individual", "tool", "medium"], ["personal computer"], ["consumer gadget only"], ["concept.tool_vs_medium"], ["personal means private data"], ["do_not_make_product_claim"], ["No buying advice."], [S.brit("technology/personal-computer")], ["technology", "education", "interface"], P.tech],
  ["concept.protocol_technology", ["协议", "protocol"], "technology", ["rule", "communication", "interoperability"], ["web protocol"], ["company policy"], ["concept.open_protocol"], ["protocol equals platform"], ["do_not_claim_current_platform_state"], ["No current API facts."], [S.brit("technology/Internet")], ["technology", "law_boundary", "institutions"], P.tech],
  ["concept.automation_augmentation", ["自动化与增强", "automation vs augmentation"], "technology", ["replace", "extend", "agency"], ["tool augments task"], ["always better automation"], ["concept.augmentation"], ["augmentation equals no automation"], ["do_not_overpromise_capability"], ["No product claim."], [S.acm("award_winners/engelbart_5078811")], ["technology", "education", "work"], P.tech],
  ["concept.hypertext_linear", ["超文本与线性文本", "hypertext vs linear text"], "technology", ["link", "sequence", "navigation"], ["linked note"], ["randomness"], ["concept.hypertext"], ["hypertext equals web only"], ["do_not_claim_all_reading_non_linear"], ["Historical/conceptual scope."], [S.brit("technology/hypertext")], ["technology", "literature", "education"], P.tech],
  ["concept.programming_language", ["程序语言", "programming language"], "technology", ["syntax", "abstraction", "execution"], ["COBOL", "Lisp"], ["natural language"], ["concept.abstraction_computing"], ["programming language equals interface"], ["do_not_give_current_coding_advice"], ["No API/current support claim."], [S.brit("technology/computer-programming-language")], ["technology", "language", "education"], P.tech],
  ["concept.abstraction_computing", ["计算抽象", "computing abstraction"], "technology", ["hide detail", "model", "reuse"], ["compiler abstraction"], ["vagueness"], ["concept.programming_language"], ["abstraction equals imprecision"], ["do_not_hide_required_boundary"], ["Conceptual scope."], [S.brit("technology/computer-science")], ["technology", "science", "design"], P.tech],
  ["concept.information_theory", ["信息论", "information theory"], "technology", ["signal", "channel", "noise"], ["communication channel"], ["content meaning by default"], ["concept.signal_noise"], ["information equals wisdom"], ["do_not_overextend_to_all_meaning"], ["Technical concept in stable scope."], [S.brit("science/information-theory")], ["technology", "science", "language"], P.tech],
  ["concept.signal_noise", ["信号与噪声", "signal and noise"], "technology", ["signal", "noise", "channel"], ["noisy channel"], ["good vs bad speech"], ["concept.information_theory"], ["noise equals useless"], ["do_not_moralize_noise"], ["Conceptual scope."], [S.brit("science/information-theory")], ["technology", "science", "media"], P.tech],
  ["concept.cybernetics", ["控制论", "cybernetics"], "technology", ["feedback", "control", "system"], ["feedback loop"], ["robotics only"], ["concept.feedback_systems"], ["cybernetics equals AI"], ["do_not_make_total_system_claim"], ["Historical/conceptual scope."], [S.brit("science/cybernetics")], ["technology", "education", "systems"], P.tech],
  ["concept.feedback_systems", ["反馈系统", "feedback systems"], "technology", ["output", "adjustment", "loop"], ["thermostat loop"], ["praise only"], ["concept.feedback_learning"], ["feedback equals correction only"], ["do_not_overcontrol_human_context"], ["Use scope."], [S.brit("science/feedback-control")], ["technology", "education", "economy"], P.tech],
  ["concept.symbolic_ai", ["符号人工智能", "symbolic AI"], "technology", ["symbol", "rule", "representation"], ["logic program"], ["all AI"], ["concept.algorithm"], ["symbolic AI equals current AI"], ["do_not_make_current_model_claim"], ["Historical/conceptual scope."], [S.brit("technology/artificial-intelligence")], ["technology", "language", "history"], P.tech],
  ["concept.web_protocol_distinction", ["网络协议与平台区别", "web protocol vs platform"], "technology", ["open protocol", "platform", "access"], ["web standard"], ["single website"], ["concept.protocol_technology"], ["web equals platform"], ["do_not_claim_current_platform_state"], ["No current product facts."], [S.brit("technology/World-Wide-Web")], ["technology", "law_boundary", "institutions"], P.tech],
  ["concept.interface_as_medium", ["界面作为媒介", "interface as medium"], "technology", ["action", "representation", "feedback"], ["interactive interface"], ["visual skin"], ["concept.interface"], ["interface equals styling"], ["do_not_reduce_to_visual_style"], ["No product advice."], [S.official("Nielsen Norman Group:usability", "https://www.nngroup.com/articles/usability-101-introduction-to-usability/")], ["technology", "design", "theater"], P.tech],
  ["concept.media_change", ["媒介变迁", "media change"], "technology", ["medium", "institution", "practice"], ["print culture"], ["new gadget"], ["concept.tool_vs_medium"], ["medium causes everything"], ["do_not_make_direct_causation_claim"], ["Historical scope."], [S.brit("technology/printing-press")], ["technology", "history", "literature"], P.tech],
  ["concept.analogy_not_identity", ["类比不是等同", "analogy is not identity"], "cross_domain_bridge", ["shared axis", "difference", "limit"], ["food pacing compared to film"], ["same thing"], ["theme.interpretation"], ["analogy proves identity"], ["do_not_collapse_domains"], ["Bridge must preserve difference."], [S.brit("art/analogy")], ["bridge", "same_or_different", "negative_relation"], P.bridge],
  ["concept.concept_explanation_not_advice", ["概念解释不是专业建议", "concept explanation is not advice"], "boundary_guardrail", ["concept", "scope", "advice"], ["law concept explanation"], ["jurisdiction-specific advice"], ["theme.boundary"], ["explaining means advising"], ["do_not_give_expert_advice"], ["Preserve legal/medical/financial caveats."], [S.official("Oyez:about", "https://www.oyez.org/about")], ["law", "care", "finance_boundary"], P.boundary],
  ["concept.same_different_support", ["相同还是不同支持", "same or different support"], "cross_domain_bridge", ["identity", "overlap", "contrast"], ["mono no aware vs sadness"], ["word swap"], ["concept.analogy_not_identity"], ["same word means same concept"], ["do_not_answer_same_without_axes"], ["Needs axes."], [S.brit("art/analogy")], ["bridge", "comparison", "concept_followup"], P.bridge],
  ["concept.topic_reentry_support", ["话题回入支持", "topic re-entry support"], "cross_domain_bridge", ["referent", "domain", "operation"], ["back to prior film director"], ["generic reset"], ["concept.same_different_support"], ["reentry equals previous domain always"], ["do_not_ignore_explicit_topic"], ["Requires state work beyond KB."], [S.brit("art/discourse")], ["bridge", "dialogue", "routing_boundary"], P.bridge],
  ["concept.false_equivalence", ["错误等同", "false equivalence"], "cross_domain_bridge", ["difference", "surface similarity", "scope"], ["sadness vs mono no aware"], ["useful analogy"], ["concept.analogy_not_identity"], ["similar means same"], ["do_not_flatten_distinctions"], ["Use when same/different is asked."], [S.brit("art/logic")], ["bridge", "argument", "negative_relation"], P.bridge],
  ["concept.evidence_vs_explanation", ["证据与解释", "evidence vs explanation"], "cross_domain_bridge", ["support", "account", "inference"], ["evidence supports explanation"], ["explanation proves itself"], ["concept.evidence_chain"], ["explanation equals evidence"], ["do_not_overstate_confidence"], ["Preserve uncertainty."], [S.brit("science/scientific-method")], ["science", "law", "history"], P.bridge],
  ["concept.model_vs_reality", ["模型与现实", "model vs reality"], "cross_domain_bridge", ["representation", "scope", "world"], ["economic model"], ["model is reality"], ["concept.theory_model"], ["map equals territory"], ["do_not_replace_world_with_model"], ["Scope matters."], [S.brit("science/scientific-theory")], ["science", "economy", "technology"], P.bridge],
  ["concept.rule_interpretation", ["规则与解释", "rule and interpretation"], "cross_domain_bridge", ["rule", "case", "judgment"], ["legal interpretation"], ["rule directly answers all"], ["concept.legal_interpretation"], ["rule equals answer"], ["do_not_apply_without_context"], ["Preserve domain boundary."], [S.sep("legal-reas-interpret")], ["law", "education", "technology"], P.bridge],
  ["concept.precedent_example", ["判例与例子", "precedent vs example"], "cross_domain_bridge", ["authority", "illustration", "scope"], ["case precedent", "learning example"], ["example always binding"], ["concept.precedent_boundary"], ["precedent equals universal rule"], ["do_not_transfer_authority_across_domains"], ["Legal authority is bounded."], [S.sep("precedent")], ["law", "education", "argument"], P.bridge]
].map(([id, names, domain, units, examples, non_examples, related, misread, negative, boundary, provenance, transfer, meta]) => concept({
  id,
  names,
  domain,
  units,
  examples,
  non_examples,
  related,
  misread,
  negative,
  boundary,
  provenance,
  transfer,
  meta
}));

const workRows = [
  ["work.towards_new_architecture", ["走向新建筑", "Towards a New Architecture"], "urban", ["person.le_corbusier"], "architecture text", "1923", ["concept.modernist_planning", "concept.planned_vs_lived_city"], ["architecture", "modernism"], ["modern architecture argument"], [S.brit("biography/Le-Corbusier")], ["architecture", "design", "urbanism"], P.city],
  ["work.ville_radieuse", ["光辉城市", "Ville Radieuse"], "urban", ["person.le_corbusier"], "urban planning proposal", "20th_century", ["concept.modernist_planning", "concept.planned_vs_lived_city"], ["planning", "city"], ["planning proposal metadata"], [S.brit("biography/Le-Corbusier")], ["urbanism", "architecture"], P.city],
  ["work.pattern_language", ["模式语言", "A Pattern Language"], "urban", ["person.christopher_alexander"], "design book", "1977", ["concept.pattern_language", "concept.human_scale"], ["pattern", "participation"], ["design pattern summary"], [S.official("PatternLanguage:A Pattern Language", "https://www.patternlanguage.com/")], ["architecture", "design", "education"], P.city],
  ["work.timeless_way_building", ["建筑的永恒之道", "The Timeless Way of Building"], "urban", ["person.christopher_alexander"], "design book", "1979", ["concept.pattern_language", "concept.human_scale"], ["place", "pattern"], ["building process summary"], [S.official("PatternLanguage:The Timeless Way", "https://www.patternlanguage.com/")], ["architecture", "design"], P.city],
  ["work.delirious_new_york", ["癫狂纽约", "Delirious New York"], "urban", ["person.rem_koolhaas"], "architecture book", "1978", ["concept.metropolitan_condition", "concept.density_urban"], ["metropolis", "density"], ["metropolitan reading"], [S.brit("biography/Rem-Koolhaas")], ["city", "architecture", "film"], P.city],
  ["work.s_m_l_xl", ["S,M,L,XL"], "urban", ["person.rem_koolhaas"], "architecture book", "1995", ["concept.metropolitan_condition", "concept.modernist_planning"], ["scale", "architecture"], ["architecture-media object"], [S.brit("biography/Rem-Koolhaas")], ["architecture", "media"], P.city],
  ["work.life_between_buildings", ["建筑之间的生活", "Life Between Buildings"], "urban", ["person.jan_gehl"], "urban design book", "1971", ["concept.public_life", "concept.human_scale"], ["public life", "street"], ["public space observation"], [S.official("Gehl:Life Between Buildings", "https://gehlpeople.com/")], ["city", "design"], P.city],
  ["work.cities_for_people", ["人的城市", "Cities for People"], "urban", ["person.jan_gehl"], "urban design book", "2010", ["concept.walkability", "concept.public_life"], ["walkability", "human scale"], ["human-scale urbanism"], [S.official("Gehl:Cities for People", "https://gehlpeople.com/")], ["city", "design"], P.city],
  ["work.social_life_small_urban_spaces", ["小型城市空间的社会生活", "The Social Life of Small Urban Spaces"], "urban", ["person.william_h_whyte"], "urban observation book", "1980", ["concept.public_life", "concept.observation_city"], ["observation", "plaza"], ["public space observation"], [S.official("Project for Public Spaces:William H Whyte", "https://www.pps.org/article/wwhyte")], ["city", "public_space"], P.city],
  ["work.sidewalk_ballet_anchor", ["人行道芭蕾例子", "sidewalk ballet example"], "urban", ["person.jane_jacobs"], "example card", "20th_century", ["concept.city_street", "concept.public_life"], ["street", "routine"], ["street-life example only"], [S.brit("biography/Jane-Jacobs")], ["city", "film", "literature"], P.city],
  ["work.art_of_eating", ["吃的艺术", "The Art of Eating"], "food", ["person.mfk_fisher"], "food essay collection", "20th_century", ["concept.taste_culture", "concept.food_memory"], ["essay", "memory"], ["food essay summary"], [S.brit("biography/M-F-K-Fisher")], ["food", "essay", "memory"], P.food],
  ["work.consider_the_oyster", ["想想牡蛎", "Consider the Oyster"], "food", ["person.mfk_fisher"], "food essay book", "1941", ["concept.taste_culture", "concept.texture_food"], ["taste", "essay"], ["food writing anchor"], [S.brit("biography/M-F-K-Fisher")], ["food", "essay"], P.food],
  ["work.land_of_plenty", ["鱼米之乡", "Land of Plenty"], "food", ["person.fuchsia_dunlop"], "cookbook", "2001", ["concept.regional_food_memory", "concept.recipe_vs_practice"], ["regional food", "practice"], ["Chinese food culture metadata"], [S.official("Fuchsia Dunlop", "https://www.fuchsiadunlop.com/")], ["food", "regional_memory"], P.food],
  ["work.every_grain_of_rice", ["每一粒米", "Every Grain of Rice"], "food", ["person.fuchsia_dunlop"], "cookbook", "2012", ["concept.home_cooking", "concept.seasoning"], ["home cooking", "practice"], ["home cooking metadata"], [S.official("Fuchsia Dunlop", "https://www.fuchsiadunlop.com/")], ["food", "daily_life"], P.food],
  ["work.on_food_and_cooking", ["食物与厨艺", "On Food and Cooking"], "food", ["person.harold_mcgee"], "food science book", "1984", ["concept.food_science", "concept.heat_control"], ["science", "process"], ["food science summary"], [S.official("Harold McGee", "https://www.curiouscook.com/")], ["food", "science"], P.food],
  ["work.nose_dive", ["气味宇宙", "Nose Dive"], "food", ["person.harold_mcgee"], "smell and food book", "2020", ["concept.aroma", "concept.food_science"], ["smell", "chemistry"], ["smell culture metadata"], [S.official("Harold McGee", "https://www.curiouscook.com/")], ["food", "science", "memory"], P.food],
  ["work.art_of_simple_food", ["简单食物的艺术", "The Art of Simple Food"], "food", ["person.alice_waters"], "cookbook", "2007", ["concept.home_cooking", "concept.recipe_vs_practice"], ["home", "practice"], ["home cooking metadata"], [S.brit("biography/Alice-Waters")], ["food", "daily_life"], P.food],
  ["work.edible_schoolyard_anchor", ["可食校园例子", "Edible Schoolyard example"], "food", ["person.alice_waters"], "education-food example", "1990s", ["concept.food_social_ritual", "concept.learning_by_doing"], ["food", "education"], ["food education anchor"], [S.official("Edible Schoolyard Project", "https://edibleschoolyard.org/")], ["food", "education"], P.food],
  ["work.silent_spring", ["寂静的春天", "Silent Spring"], "science.history", ["person.rachel_carson"], "science-environment book", "1962", ["concept.environmental_risk", "concept.evidence_chain"], ["risk", "public science"], ["environmental argument summary"], [S.brit("biography/Rachel-Carson")], ["science", "environment", "public_reasoning"], P.science],
  ["work.sea_around_us", ["我们周围的海", "The Sea Around Us"], "science.history", ["person.rachel_carson"], "science writing book", "1951", ["concept.science_public_argument", "concept.observation_science"], ["ocean", "public science"], ["science writing anchor"], [S.brit("biography/Rachel-Carson")], ["science", "writing"], P.science],
  ["work.origin_of_species", ["物种起源", "On the Origin of Species"], "science.history", ["person.charles_darwin"], "science book", "1859", ["concept.natural_selection", "concept.evidence_chain"], ["evolution", "evidence"], ["evolutionary theory metadata"], [S.brit("biography/Charles-Darwin")], ["science", "history"], P.science],
  ["work.descent_of_man", ["人类的由来", "The Descent of Man"], "science.history", ["person.charles_darwin"], "science book", "1871", ["concept.natural_selection", "concept.evidence_chain"], ["evolution", "human"], ["science-history anchor"], [S.brit("biography/Charles-Darwin")], ["science", "history"], P.science],
  ["work.logic_of_scientific_discovery", ["科学发现的逻辑", "The Logic of Scientific Discovery"], "science.history", ["person.karl_popper"], "philosophy of science book", "1934", ["concept.falsifiability", "concept.theory_model"], ["testability", "theory"], ["philosophy of science anchor"], [S.sep("popper")], ["science", "philosophy"], P.science],
  ["work.conjectures_and_refutations", ["猜想与反驳", "Conjectures and Refutations"], "science.history", ["person.karl_popper"], "philosophy of science essays", "1963", ["concept.falsifiability", "concept.evidence_vs_explanation"], ["criticism", "test"], ["philosophy essays metadata"], [S.sep("popper")], ["science", "argument"], P.science],
  ["work.book_of_optics", ["光学之书", "Book of Optics"], "science.history", ["person.ibn_al_haytham"], "science text", "11th_century", ["concept.observation_science", "concept.experiment_science"], ["optics", "observation"], ["optics history metadata"], [S.brit("biography/Ibn-al-Haytham")], ["science", "observation"], P.science],
  ["work.optics_observation_anchor", ["光学观察例子", "optics observation example"], "science.history", ["person.ibn_al_haytham"], "example card", "medieval", ["concept.observation_science", "concept.measurement_science"], ["optics", "measurement"], ["observation example only"], [S.brit("biography/Ibn-al-Haytham")], ["science", "observation"], P.science],
  ["work.mismeasure_of_man", ["人的误测", "The Mismeasure of Man"], "science.history", ["person.stephen_jay_gould"], "science history book", "1981", ["concept.measurement_science", "concept.science_public_argument"], ["measurement", "critique"], ["measurement critique metadata"], [S.brit("biography/Stephen-Jay-Gould")], ["science", "history", "argument"], P.science],
  ["work.wonderful_life", ["奇妙的生命", "Wonderful Life"], "science.history", ["person.stephen_jay_gould"], "science writing book", "1989", ["concept.natural_selection", "concept.evidence_vs_explanation"], ["evolution", "contingency"], ["science writing anchor"], [S.brit("biography/Stephen-Jay-Gould")], ["science", "history"], P.science],
  ["work.photo_51_anchor", ["照片51例子", "Photo 51 example"], "science.history", ["person.rosalind_franklin"], "research example", "1952", ["concept.measurement_science", "concept.evidence_chain"], ["measurement", "DNA"], ["research evidence anchor"], [S.brit("biography/Rosalind-Franklin")], ["science", "evidence"], P.science],
  ["work.dna_crystallography_anchor", ["DNA晶体学例子", "DNA crystallography example"], "science.history", ["person.rosalind_franklin"], "research example", "20th_century", ["concept.measurement_science", "concept.evidence_chain"], ["measurement", "instrument"], ["crystallography anchor"], [S.brit("biography/Rosalind-Franklin")], ["science", "measurement"], P.science],
  ["work.cosmos", ["宇宙", "Cosmos"], "science.history", ["person.carl_sagan"], "science communication work", "1980", ["concept.science_public_argument", "concept.evidence_vs_explanation"], ["public science", "cosmos"], ["science communication metadata"], [S.brit("biography/Carl-Sagan")], ["science", "education"], P.science],
  ["work.demon_haunted_world", ["魔鬼出没的世界", "The Demon-Haunted World"], "science.history", ["person.carl_sagan"], "science communication book", "1995", ["concept.evidence_vs_explanation", "concept.falsifiability"], ["skepticism", "evidence"], ["public reasoning anchor"], [S.brit("biography/Carl-Sagan")], ["science", "argument"], P.science],
  ["work.capital_marx", ["资本论", "Capital"], "economy", ["person.karl_marx"], "economic theory book", "19th_century", ["concept.capital", "concept.labor"], ["capital", "labor"], ["economic theory metadata"], [S.brit("biography/Karl-Marx")], ["economy", "history"], P.economy],
  ["work.communist_manifesto", ["共产党宣言", "The Communist Manifesto"], "economy", ["person.karl_marx"], "political text", "1848", ["concept.labor", "concept.institution_economy"], ["class", "history"], ["political economy anchor"], [S.brit("biography/Karl-Marx")], ["economy", "history"], P.economy],
  ["work.general_theory", ["就业利息和货币通论", "The General Theory"], "economy", ["person.john_maynard_keynes"], "economics book", "1936", ["concept.public_goods", "concept.institution_economy"], ["demand", "institution"], ["economic theory metadata"], [S.brit("biography/John-Maynard-Keynes")], ["economy", "institutions"], P.economy],
  ["work.economic_consequences_peace", ["和平的经济后果", "The Economic Consequences of the Peace"], "economy", ["person.john_maynard_keynes"], "economic history book", "1919", ["concept.institution_economy", "concept.externality"], ["treaty", "economy"], ["economic history anchor"], [S.brit("biography/John-Maynard-Keynes")], ["economy", "history"], P.economy],
  ["work.road_to_serfdom", ["通往奴役之路", "The Road to Serfdom"], "economy", ["person.friedrich_hayek"], "political economy book", "1944", ["concept.market_information", "concept.institution_economy"], ["market", "state"], ["political economy metadata"], [S.brit("biography/F-A-Hayek")], ["economy", "institutions"], P.economy],
  ["work.use_of_knowledge_society", ["社会中的知识运用", "The Use of Knowledge in Society"], "economy", ["person.friedrich_hayek"], "economics essay", "1945", ["concept.market_information", "concept.protocol_technology"], ["knowledge", "coordination"], ["knowledge coordination anchor"], [S.brit("biography/F-A-Hayek")], ["economy", "technology"], P.economy],
  ["work.development_as_freedom", ["以自由看待发展", "Development as Freedom"], "economy", ["person.amartya_sen"], "economics-philosophy book", "1999", ["concept.capability_approach", "concept.fairness"], ["freedom", "capability"], ["capability approach anchor"], [S.nobel("prizes/economic-sciences/1998/sen/facts/")], ["economy", "justice"], P.economy],
  ["work.idea_of_justice", ["正义的理念", "The Idea of Justice"], "economy", ["person.amartya_sen"], "philosophy-economics book", "2009", ["concept.capability_approach", "concept.legality_justice_distinction"], ["justice", "comparison"], ["justice theory metadata"], [S.nobel("prizes/economic-sciences/1998/sen/facts/")], ["economy", "law"], P.economy],
  ["work.institutions_institutional_change", ["制度制度变迁与经济绩效", "Institutions, Institutional Change and Economic Performance"], "economy", ["person.douglass_north"], "institutional economics book", "1990", ["concept.institution_economy", "concept.governance_rules"], ["institution", "history"], ["institutional economics anchor"], [S.nobel("prizes/economic-sciences/1993/north/facts/")], ["economy", "institutions"], P.economy],
  ["work.economic_history_structure", ["经济史结构例子", "economic history structure example"], "economy", ["person.douglass_north"], "example card", "20th_century", ["concept.institution_economy", "concept.evidence_chain"], ["history", "institution"], ["economic history example"], [S.nobel("prizes/economic-sciences/1993/north/facts/")], ["economy", "history"], P.economy],
  ["work.capitalism_socialism_democracy", ["资本主义社会主义与民主", "Capitalism, Socialism and Democracy"], "economy", ["person.joseph_schumpeter"], "economics book", "1942", ["concept.creative_destruction", "concept.innovation_economy"], ["innovation", "capitalism"], ["innovation theory anchor"], [S.brit("biography/Joseph-Schumpeter")], ["economy", "technology"], P.economy],
  ["work.theory_economic_development", ["经济发展理论", "The Theory of Economic Development"], "economy", ["person.joseph_schumpeter"], "economics book", "1911", ["concept.innovation_economy", "concept.market"], ["development", "innovation"], ["economic development metadata"], [S.brit("biography/Joseph-Schumpeter")], ["economy", "innovation"], P.economy],
  ["work.morality_of_law", ["法律的道德性", "The Morality of Law"], "law_boundary", ["person.lon_fuller"], "legal philosophy book", "1964", ["concept.law_morality", "concept.rule_of_law"], ["legality", "morality"], ["legal philosophy metadata"], [S.sep("fuller")], ["law", "philosophy"], P.law],
  ["work.fuller_hart_debate_anchor", ["富勒哈特论争例子", "Fuller Hart debate example"], "law_boundary", ["person.lon_fuller", "person.hla_hart"], "debate example", "20th_century", ["concept.legal_positivism", "concept.law_morality"], ["validity", "morality"], ["jurisprudence debate anchor"], [S.sep("legal-positivism")], ["law", "philosophy"], P.law],
  ["work.spirit_of_laws", ["论法的精神", "The Spirit of Laws"], "law_boundary", ["person.montesquieu"], "political philosophy book", "1748", ["concept.separation_of_powers", "concept.rule_of_law"], ["law", "institution"], ["political theory metadata"], [S.brit("biography/Montesquieu")], ["law", "history"], P.law],
  ["work.persian_letters", ["波斯人信札", "Persian Letters"], "law_boundary", ["person.montesquieu"], "literary-political work", "1721", ["concept.legal_interpretation", "concept.false_equivalence"], ["satire", "custom"], ["literary political anchor"], [S.brit("biography/Montesquieu")], ["law", "literature"], P.law],
  ["work.human_condition", ["人的境况", "The Human Condition"], "law_boundary", ["person.hannah_arendt"], "political theory book", "1958", ["concept.action_plurality", "concept.public_space_political"], ["action", "public"], ["political theory metadata"], [S.brit("biography/Hannah-Arendt")], ["law", "city"], P.law],
  ["work.origins_totalitarianism", ["极权主义的起源", "The Origins of Totalitarianism"], "law_boundary", ["person.hannah_arendt"], "political theory book", "1951", ["concept.rule_of_law", "concept.institution_economy"], ["authority", "institution"], ["political theory anchor"], [S.brit("biography/Hannah-Arendt")], ["law", "history"], P.law],
  ["work.on_crimes_and_punishments", ["论犯罪与刑罚", "On Crimes and Punishments"], "law_boundary", ["person.cesare_beccaria"], "legal reform text", "1764", ["concept.proportionality_law", "concept.legality_justice_distinction"], ["punishment", "justice"], ["legal reform metadata"], [S.brit("biography/Cesare-Beccaria")], ["law", "justice"], P.law],
  ["work.beccaria_punishment_anchor", ["刑罚比例例子", "punishment proportionality example"], "law_boundary", ["person.cesare_beccaria"], "example card", "18th_century", ["concept.proportionality_law", "concept.fairness"], ["punishment", "proportion"], ["proportionality anchor"], [S.brit("biography/Cesare-Beccaria")], ["law", "justice"], P.law],
  ["work.principles_of_psychology", ["心理学原理", "The Principles of Psychology"], "psychology_boundary", ["person.william_james"], "psychology book", "1890", ["concept.attention", "concept.memory_as_reconstruction"], ["attention", "experience"], ["psychology history metadata"], [S.brit("biography/William-James")], ["psychology_boundary", "education"], P.psych],
  ["work.varieties_religious_experience", ["宗教经验之种种", "The Varieties of Religious Experience"], "psychology_boundary", ["person.william_james"], "psychology-philosophy book", "1902", ["concept.affective_association", "concept.emotion_evidence"], ["experience", "interpretation"], ["experience study metadata"], [S.brit("biography/William-James")], ["psychology_boundary", "philosophy"], P.psych],
  ["work.attachment_and_loss", ["依恋与丧失", "Attachment and Loss"], "psychology_boundary", ["person.john_bowlby"], "psychology book", "1969_1980", ["concept.attachment_boundary", "concept.grief_boundary"], ["attachment", "loss"], ["attachment theory metadata"], [S.brit("biography/John-Bowlby")], ["psychology_boundary", "care"], P.psych],
  ["work.secure_base", ["安全基地", "A Secure Base"], "psychology_boundary", ["person.john_bowlby"], "psychology lectures", "1988", ["concept.attachment_boundary", "concept.care_boundary"], ["attachment", "care"], ["attachment concept anchor"], [S.brit("biography/John-Bowlby")], ["psychology_boundary", "care"], P.psych],
  ["work.cognitive_therapy_depression_anchor", ["认知治疗例子", "cognitive therapy example"], "psychology_boundary", ["person.aaron_beck"], "clinical-theory example", "20th_century", ["concept.therapy_boundary", "concept.emotion_evidence"], ["therapy", "boundary"], ["clinical history anchor"], [S.official("Beck Institute:Aaron T. Beck", "https://beckinstitute.org/about/our-history/aaron-t-beck/")], ["psychology_boundary"], P.psych],
  ["work.beck_depression_inventory_anchor", ["贝克量表示例", "Beck inventory example"], "psychology_boundary", ["person.aaron_beck"], "assessment example", "20th_century", ["concept.assessment_learning", "concept.no_diagnosis_boundary"], ["assessment", "boundary"], ["assessment boundary anchor"], [S.official("Beck Institute:Aaron T. Beck", "https://beckinstitute.org/about/our-history/aaron-t-beck/")], ["psychology_boundary", "assessment"], P.psych],
  ["work.thinking_fast_and_slow", ["思考快与慢", "Thinking, Fast and Slow"], "psychology_boundary", ["person.daniel_kahneman"], "psychology book", "2011", ["concept.cognitive_bias", "concept.evidence_vs_explanation"], ["judgment", "bias"], ["decision research metadata"], [S.nobel("prizes/economic-sciences/2002/kahneman/facts/")], ["psychology_boundary", "economy"], P.psych],
  ["work.prospect_theory_anchor", ["前景理论例子", "prospect theory example"], "psychology_boundary", ["person.daniel_kahneman"], "research example", "20th_century", ["concept.cognitive_bias", "concept.market_information"], ["decision", "risk"], ["decision theory anchor"], [S.nobel("prizes/economic-sciences/2002/kahneman/facts/")], ["psychology_boundary", "economy"], P.psych],
  ["work.pedagogy_of_the_oppressed", ["被压迫者教育学", "Pedagogy of the Oppressed"], "education", ["person.paulo_freire"], "education book", "1970", ["concept.dialogue_pedagogy", "concept.training_vs_education"], ["dialogue", "praxis"], ["education theory metadata"], [S.brit("biography/Paulo-Freire")], ["education", "dialogue"], P.education],
  ["work.education_for_critical_consciousness", ["批判意识教育", "Education for Critical Consciousness"], "education", ["person.paulo_freire"], "education book", "1970s", ["concept.dialogue_pedagogy", "concept.inquiry_learning"], ["critical", "dialogue"], ["education theory anchor"], [S.brit("biography/Paulo-Freire")], ["education", "dialogue"], P.education],
  ["work.teaching_to_transgress", ["越界教学", "Teaching to Transgress"], "education", ["person.bell_hooks"], "education essay book", "1994", ["concept.classroom_social_environment", "concept.dialogue_pedagogy"], ["classroom", "voice"], ["education writing metadata"], [S.official("bell hooks Institute", "https://www.bellhooksinstitute.com/")], ["education", "literature"], P.education],
  ["work.teaching_community", ["教学共同体", "Teaching Community"], "education", ["person.bell_hooks"], "education essay book", "2003", ["concept.classroom_social_environment", "concept.care_boundary"], ["community", "classroom"], ["education writing anchor"], [S.official("bell hooks Institute", "https://www.bellhooksinstitute.com/")], ["education", "care_boundary"], P.education],
  ["work.language_and_thought_child", ["儿童的语言与思维", "The Language and Thought of the Child"], "education", ["person.jean_piaget"], "developmental psychology book", "1923", ["concept.developmental_learning_boundary", "concept.assessment_learning"], ["development", "language"], ["developmental theory metadata"], [S.brit("biography/Jean-Piaget")], ["education", "psychology_boundary"], P.education],
  ["work.child_conception_world", ["儿童对世界的概念", "The Child's Conception of the World"], "education", ["person.jean_piaget"], "developmental psychology book", "1926", ["concept.developmental_learning_boundary", "concept.example_based_learning"], ["child", "concept"], ["developmental theory anchor"], [S.brit("biography/Jean-Piaget")], ["education", "psychology_boundary"], P.education],
  ["work.process_of_education", ["教育过程", "The Process of Education"], "education", ["person.jerome_bruner"], "education book", "1960", ["concept.transfer_learning", "concept.curriculum"], ["structure", "learning"], ["curriculum theory metadata"], [S.brit("biography/Jerome-Bruner")], ["education", "learning"], P.education],
  ["work.actual_minds_possible_worlds", ["真实的心灵可能的世界", "Actual Minds, Possible Worlds"], "education", ["person.jerome_bruner"], "psychology and narrative book", "1986", ["concept.example_based_learning", "concept.narrator_point_of_view"], ["narrative", "mind"], ["narrative cognition anchor"], [S.brit("biography/Jerome-Bruner")], ["education", "literature"], P.education],
  ["work.as_we_may_think", ["诚如所思", "As We May Think"], "technology", ["person.vannevar_bush"], "technology essay", "1945", ["concept.hypertext_linear", "concept.information_architecture"], ["linking", "memory"], ["hypertext precursor metadata"], [S.brit("biography/Vannevar-Bush")], ["technology", "knowledge_work"], P.tech],
  ["work.memex_anchor", ["Memex例子", "Memex example"], "technology", ["person.vannevar_bush"], "concept example", "1945", ["concept.hypertext_linear", "concept.personal_computing"], ["memory", "link"], ["memex concept anchor"], [S.brit("biography/Vannevar-Bush")], ["technology", "interface"], P.tech],
  ["work.cobol_anchor", ["COBOL例子", "COBOL example"], "technology", ["person.grace_hopper"], "programming language example", "20th_century", ["concept.programming_language", "concept.abstraction_computing"], ["language", "business computing"], ["programming language anchor"], [S.brit("biography/Grace-Hopper")], ["technology", "language"], P.tech],
  ["work.compiler_anchor", ["编译器例子", "compiler example"], "technology", ["person.grace_hopper"], "computing example", "20th_century", ["concept.abstraction_computing", "concept.programming_language"], ["compiler", "abstraction"], ["compiler history anchor"], [S.brit("biography/Grace-Hopper")], ["technology", "education"], P.tech],
  ["work.design_of_everyday_things", ["日常物品的设计", "The Design of Everyday Things"], "technology", ["person.donald_norman"], "design book", "1988", ["concept.affordance_design", "concept.usability"], ["affordance", "design"], ["design theory metadata"], [S.official("Nielsen Norman Group:Don Norman", "https://www.nngroup.com/people/don-norman/")], ["technology", "design"], P.tech],
  ["work.emotional_design", ["情感化设计", "Emotional Design"], "technology", ["person.donald_norman"], "design book", "2004", ["concept.usability", "concept.emotion_evidence"], ["emotion", "design"], ["design theory anchor"], [S.official("Nielsen Norman Group:Don Norman", "https://www.nngroup.com/people/don-norman/")], ["technology", "design", "psychology_boundary"], P.tech],
  ["work.computer_lib_dream_machines", ["计算机自由梦机器", "Computer Lib/Dream Machines"], "technology", ["person.ted_nelson"], "computing book", "1974", ["concept.hypertext_linear", "concept.web_protocol_distinction"], ["hypertext", "computing culture"], ["hypertext culture metadata"], [S.official("Ted Nelson", "https://xanadu.com.au/ted/")], ["technology", "text"], P.tech],
  ["work.xanadu_anchor", ["Xanadu例子", "Project Xanadu example"], "technology", ["person.ted_nelson"], "hypertext project example", "20th_century", ["concept.hypertext_linear", "concept.protocol_technology"], ["hypertext", "link"], ["hypertext project anchor"], [S.official("Project Xanadu", "https://xanadu.com.au/")], ["technology", "interface"], P.tech],
  ["work.mathematical_theory_communication", ["通信的数学理论", "A Mathematical Theory of Communication"], "technology", ["person.claude_shannon"], "information theory paper", "1948", ["concept.information_theory", "concept.signal_noise"], ["signal", "channel"], ["information theory metadata"], [S.brit("biography/Claude-Shannon")], ["technology", "science"], P.tech],
  ["work.shannon_information_anchor", ["香农信息例子", "Shannon information example"], "technology", ["person.claude_shannon"], "example card", "20th_century", ["concept.information_theory", "concept.signal_noise"], ["information", "noise"], ["information theory anchor"], [S.brit("biography/Claude-Shannon")], ["technology", "science"], P.tech],
  ["work.cybernetics", ["控制论", "Cybernetics"], "technology", ["person.norbert_wiener"], "science and technology book", "1948", ["concept.cybernetics", "concept.feedback_systems"], ["feedback", "control"], ["cybernetics metadata"], [S.brit("biography/Norbert-Wiener")], ["technology", "systems"], P.tech],
  ["work.human_use_human_beings", ["人有人的用处", "The Human Use of Human Beings"], "technology", ["person.norbert_wiener"], "technology society book", "1950", ["concept.cybernetics", "concept.automation_augmentation"], ["automation", "society"], ["technology society anchor"], [S.brit("biography/Norbert-Wiener")], ["technology", "ethics"], P.tech],
  ["work.dartmouth_ai_anchor", ["达特茅斯AI例子", "Dartmouth AI example"], "technology", ["person.john_mccarthy"], "AI history example", "1956", ["concept.symbolic_ai", "concept.algorithm"], ["AI", "symbol"], ["AI history anchor"], [S.acm("award_winners/mccarthy_1118322")], ["technology", "AI_history"], P.tech],
  ["work.lisp_anchor", ["Lisp例子", "Lisp example"], "technology", ["person.john_mccarthy"], "programming language example", "1958", ["concept.programming_language", "concept.symbolic_ai"], ["language", "symbol"], ["programming language anchor"], [S.acm("award_winners/mccarthy_1118322")], ["technology", "language"], P.tech],
  ["work.smalltalk_anchor", ["Smalltalk例子", "Smalltalk example"], "technology", ["person.adele_goldberg"], "personal computing example", "1970s", ["concept.personal_computing", "concept.interface"], ["object", "interface"], ["personal computing anchor"], [S.official("ACM:Adele Goldberg", "https://amturing.acm.org/award_winners/goldberg_8759341.cfm")], ["technology", "interface"], P.tech],
  ["work.personal_dynamic_media_anchor", ["个人动态媒介例子", "personal dynamic media example"], "technology", ["person.adele_goldberg", "person.alan_kay"], "computing concept example", "1970s", ["concept.personal_computing", "concept.tool_vs_medium"], ["media", "learning"], ["personal media anchor"], [S.official("ACM:Adele Goldberg", "https://amturing.acm.org/award_winners/goldberg_8759341.cfm")], ["technology", "education"], P.tech],
  ["work.computers_as_theatre", ["作为剧场的计算机", "Computers as Theatre"], "technology", ["person.brenda_laurel"], "interface theory book", "1991", ["concept.interface_as_medium", "concept.usability"], ["performance", "interface"], ["interface theory metadata"], [S.official("Brenda Laurel", "https://www.tauzero.com/Brenda_Laurel/")], ["technology", "theater"], P.tech],
  ["work.interface_as_performance_anchor", ["界面表演例子", "interface as performance example"], "technology", ["person.brenda_laurel"], "example card", "20th_century", ["concept.interface_as_medium", "concept.affordance_design"], ["performance", "interaction"], ["interface performance anchor"], [S.official("Brenda Laurel", "https://www.tauzero.com/Brenda_Laurel/")], ["technology", "theater"], P.tech],
  ["work.printing_press_agent_change", ["印刷机作为变迁因素", "The Printing Press as an Agent of Change"], "technology", ["person.elizabeth_eisenstein"], "media history book", "1979", ["concept.media_change", "concept.tool_vs_medium"], ["print", "institution"], ["media history metadata"], [S.brit("technology/printing-press")], ["technology", "history", "literature"], P.tech],
  ["work.print_culture_anchor", ["印刷文化例子", "print culture example"], "technology", ["person.elizabeth_eisenstein"], "example card", "early_modern", ["concept.media_change", "concept.protocol_technology"], ["print", "knowledge"], ["print culture anchor"], [S.brit("technology/printing-press")], ["technology", "history"], P.tech],
  ["work.creative_experience", ["创造性经验", "Creative Experience"], "education", ["person.mary_parker_follett"], "management and social theory book", "1924", ["concept.group_process", "concept.dialogue_pedagogy"], ["group", "practice"], ["group process metadata"], [S.brit("biography/Mary-Parker-Follett")], ["education", "organization"], P.education],
  ["work.new_state", ["新国家", "The New State"], "education", ["person.mary_parker_follett"], "political-social theory book", "1918", ["concept.group_process", "concept.public_space_political"], ["group", "democracy"], ["social theory anchor"], [S.brit("biography/Mary-Parker-Follett")], ["education", "law_boundary"], P.education]
].map(([id, names, domain, creators, work_type, period, concepts, axes, summary, provenance, transfer, meta]) => work({
  id,
  names,
  domain,
  creators,
  work_type,
  period,
  concepts,
  axes,
  summary,
  provenance,
  transfer,
  meta
}));

function derivedPersonWorkRelations() {
  const rels = [];
  for (const p of people) {
    for (const workId of p.representative_works || []) {
      rels.push(relation({
        id: `relation.${p.id.replace("person.", "")}_${workId.replace("work.", "")}`,
        names: [`${p.names[1] || p.names[0]} to ${workId.replace("work.", "")}`],
        domain: p.domain,
        relation_type: "person_to_work",
        sources: [p.id],
        targets: [workId],
        shared: ["representative work", "field anchor"],
        contrast: ["not full bibliography"],
        verbs: ["is represented by", "is often introduced through"],
        provenance: p.provenance || [],
        transfer: ["works_list", "topic_reentry", "representative_anchor"],
        meta: { ...P.bridge, pack_id: p.pack_id || "bridge_cross_domain", purpose_class: ["closes_person_work_loop", "supports_topic_reentry"] }
      }));
    }
  }
  return rels;
}

function derivedWorkConceptRelations() {
  const rels = [];
  for (const w of workRows) {
    for (const conceptId of (w.concepts || []).slice(0, 1)) {
      rels.push(relation({
        id: `relation.${w.id.replace("work.", "")}_${conceptId.replace(/^(concept|theme|movement|period)\./, "")}`,
        names: [`${w.names[1] || w.names[0]} and ${conceptId.split(".").pop()}`],
        domain: w.domain,
        relation_type: "work_to_concept",
        sources: [w.id],
        targets: [conceptId],
        shared: ["example", "concept anchor"],
        contrast: ["not exhaustive interpretation"],
        verbs: ["exemplifies", "helps explain", "is often read through"],
        provenance: w.provenance || [],
        transfer: ["concept_followup", "explain_characteristics", "recommendation"],
        meta: { ...P.bridge, pack_id: "bridge_cross_domain", purpose_class: ["closes_work_concept_loop", "supports_concept_followup"] }
      }));
    }
  }
  return rels;
}

const manualRelations = [
  ["relation.city_film_street_scene", ["city street and film scene"], "cross_domain_bridge", "analogy_bridge", ["concept.city_street", "concept.street_as_scene"], ["theme.framing"], ["selection", "movement", "public life"], ["street is not mere setting"], ["frames", "echoes", "helps compare"], P.bridge],
  ["relation.jane_jacobs_edward_yang_city", ["Jane Jacobs and Edward Yang city relation"], "cross_domain_bridge", "contrast_bridge", ["person.jane_jacobs", "person.edward_yang"], ["concept.public_life", "concept.urban_memory"], ["city observation", "everyday detail"], ["urban theory is not film analysis"], ["echoes", "helps compare"], P.bridge],
  ["relation.jia_zhangke_modernization_loss", ["Jia Zhangke and modernization loss"], "cross_domain_bridge", "work_concept_bridge", ["person.jia_zhangke"], ["theme.modernization_loss", "concept.urban_memory"], ["change", "place", "memory"], ["not economic forecast"], ["frames", "is often read through"], P.bridge],
  ["relation.hou_historical_memory", ["Hou and historical memory"], "cross_domain_bridge", "work_concept_bridge", ["person.hou_hsiao_hsien"], ["concept.urban_memory", "theme.memory"], ["history", "daily life"], ["not documentary proof"], ["frames", "helps explain"], P.bridge],
  ["relation.wong_kar_wai_urban_longing", ["Wong Kar-wai and urban longing"], "cross_domain_bridge", "work_concept_bridge", ["person.wong_kar_wai"], ["concept.city_loneliness", "concept.urban_memory"], ["city", "longing", "time"], ["not city planning"], ["echoes", "frames"], P.bridge],
  ["relation.food_literature_texture_description", ["food texture and literary description"], "cross_domain_bridge", "analogy_bridge", ["concept.texture_food"], ["concept.narrator_point_of_view"], ["detail", "sensory selection"], ["texture is not plot"], ["echoes", "helps compare"], P.bridge],
  ["relation.food_film_pacing_heat", ["heat control and film pacing"], "cross_domain_bridge", "analogy_bridge", ["concept.heat_control", "concept.duration_film"], ["concept.timing_cooking"], ["timing", "attention", "restraint"], ["cooking is not cinema"], ["echoes", "frames"], P.bridge],
  ["relation.recipe_practice_rule_application", ["recipe practice and rule application"], "cross_domain_bridge", "contrast_bridge", ["concept.recipe_vs_practice"], ["concept.rule_interpretation"], ["instruction", "case", "judgment"], ["recipe is not law"], ["contrasts with", "helps explain"], P.bridge],
  ["relation.taste_memory_literature", ["taste memory and literature"], "cross_domain_bridge", "analogy_bridge", ["concept.food_memory"], ["theme.memory", "concept.urban_memory"], ["memory", "place", "detail"], ["taste is not fact"], ["echoes", "frames"], P.bridge],
  ["relation.law_literature_testimony", ["legal testimony and narrative testimony"], "cross_domain_bridge", "contrast_bridge", ["concept.legal_testimony"], ["concept.unreliable_viewpoint", "concept.testimony"], ["voice", "claim", "credibility"], ["literary testimony has no legal authority"], ["contrasts with", "helps compare"], P.bridge],
  ["relation.rule_interpretation_literary_reading", ["rule interpretation and literary reading"], "cross_domain_bridge", "analogy_bridge", ["concept.rule_interpretation"], ["theme.interpretation"], ["text", "context", "judgment"], ["interpretation is not free invention"], ["echoes", "contrasts with"], P.bridge],
  ["relation.justice_legality_literature", ["justice legality and literature"], "cross_domain_bridge", "contrast_bridge", ["concept.legality_justice_distinction"], ["concept.public_critique_intimate_anatomy"], ["norm", "social critique"], ["literature is not legal advice"], ["frames", "helps compare"], P.bridge],
  ["relation.science_history_observation_theory", ["observation and theory"], "cross_domain_bridge", "concept_relation", ["concept.observation_science"], ["concept.theory_model"], ["evidence", "instrument", "model"], ["observation is not theory-free"], ["constrains", "helps explain"], P.bridge],
  ["relation.model_reality_economy_science", ["model and reality across science and economy"], "cross_domain_bridge", "negative_relation", ["concept.model_vs_reality"], ["concept.market_information", "concept.theory_model"], ["representation", "scope"], ["model is not reality"], ["constrains", "helps compare"], P.bridge],
  ["relation.paradigm_fashion_negative", ["paradigm is not fashion"], "cross_domain_bridge", "negative_relation", ["concept.paradigm"], ["concept.false_equivalence"], ["discipline", "normal science"], ["paradigm is not trend"], ["constrains"], P.bridge],
  ["relation.experiment_anecdote_negative", ["experiment is not anecdote"], "cross_domain_bridge", "negative_relation", ["concept.experiment_science"], ["concept.evidence_chain"], ["control", "measurement"], ["experiment is not anecdote"], ["constrains"], P.bridge],
  ["relation.interface_object_design", ["interface and object"], "cross_domain_bridge", "contrast_bridge", ["concept.interface"], ["concept.affordance_design", "concept.usability"], ["use", "feedback", "action"], ["interface is not styling"], ["frames", "constrains"], P.bridge],
  ["relation.tool_medium_education", ["tool medium and education"], "cross_domain_bridge", "analogy_bridge", ["concept.tool_vs_medium"], ["concept.training_vs_education"], ["means", "practice", "aim"], ["tool is not neutral by default"], ["helps compare"], P.bridge],
  ["relation.augmentation_automation_learning", ["augmentation automation and learning"], "cross_domain_bridge", "contrast_bridge", ["concept.automation_augmentation"], ["concept.scaffolding_learning"], ["support", "agency", "task"], ["augmentation is not replacement"], ["contrasts with", "frames"], P.bridge],
  ["relation.hypertext_linear_literature", ["hypertext and linear text"], "cross_domain_bridge", "analogy_bridge", ["concept.hypertext_linear"], ["concept.novel_poem_medium_difference"], ["sequence", "navigation"], ["hypertext is not random"], ["helps compare"], P.bridge],
  ["relation.memory_fact_boundary", ["memory is not perfect storage"], "boundary_guardrail", "negative_relation", ["concept.memory_as_reconstruction"], ["theme.memory"], ["recall", "evidence"], ["memory is not perfect storage"], ["constrains"], P.boundary],
  ["relation.affective_association_no_diagnosis", ["affective association is not diagnosis"], "boundary_guardrail", "negative_relation", ["concept.affective_association"], ["concept.no_diagnosis_boundary"], ["feeling", "object", "care"], ["association is not diagnosis"], ["constrains"], P.boundary],
  ["relation.youth_memory_nostalgia_negative", ["youthful memory and nostalgia"], "boundary_guardrail", "negative_relation", ["theme.youth_memory"], ["concept.nostalgia_historical_memory"], ["memory", "public circulation"], ["youth memory is not literal childhood proof"], ["constrains"], P.boundary],
  ["relation.rejection_not_pathology", ["rejection is not pathology"], "boundary_guardrail", "negative_relation", ["concept.social_rejection"], ["concept.care_boundary"], ["social concept", "care"], ["rejection is not diagnosis"], ["constrains"], P.boundary],
  ["relation.wabi_sabi_not_minimalism_r25", ["wabi-sabi is not minimalism"], "boundary_guardrail", "negative_relation", ["concept.wabi_sabi"], ["movement.minimalism"], ["imperfection", "material", "restraint"], ["wabi-sabi is not minimalism"], ["differs from", "constrains"], P.boundary],
  ["relation.mono_no_aware_not_sadness_r25", ["mono no aware is not simple sadness"], "boundary_guardrail", "negative_relation", ["concept.mono_no_aware"], ["concept.false_equivalence"], ["transience", "feeling", "awareness"], ["not simple sadness"], ["differs from", "constrains"], P.boundary],
  ["relation.seasonality_not_weather_r25", ["seasonality is not weather talk"], "boundary_guardrail", "negative_relation", ["concept.seasonality"], ["concept.false_equivalence"], ["time", "form", "ritual"], ["seasonality is not weather talk"], ["differs from", "constrains"], P.boundary],
  ["relation.cold_affect_not_emotionless_r25", ["cold affect is not emotionlessness"], "boundary_guardrail", "negative_relation", ["concept.cold_affect"], ["concept.emotion_evidence"], ["restraint", "tone"], ["cold affect is not no emotion"], ["differs from", "constrains"], P.boundary],
  ["relation.city_street_not_setting_r25", ["city street is not merely setting"], "boundary_guardrail", "negative_relation", ["concept.city_street"], ["concept.street_as_scene"], ["scene", "public life"], ["street is not merely setting"], ["constrains"], P.boundary],
  ["relation.rule_not_answer_r25", ["rule is not answer"], "boundary_guardrail", "negative_relation", ["concept.rule_interpretation"], ["concept.rule_application_precedent"], ["case", "interpretation"], ["rule is not answer"], ["constrains"], P.boundary],
  ["relation.precedent_not_universal_rule_r25", ["precedent is not universal rule"], "boundary_guardrail", "negative_relation", ["concept.precedent_boundary"], ["concept.rule_application_precedent"], ["authority", "scope"], ["precedent is not universal rule"], ["constrains"], P.boundary],
  ["relation.market_not_society_r25", ["market is not society"], "boundary_guardrail", "negative_relation", ["concept.market"], ["concept.embeddedness"], ["exchange", "institution"], ["market is not society"], ["differs from", "constrains"], P.boundary],
  ["relation.interface_not_styling_r25", ["interface is not styling"], "boundary_guardrail", "negative_relation", ["concept.interface"], ["concept.affordance_design"], ["action", "feedback"], ["interface is not styling"], ["constrains"], P.boundary],
  ["relation.food_taste_not_nutrition_r25", ["taste is not nutrition advice"], "boundary_guardrail", "negative_relation", ["concept.taste_culture"], ["concept.concept_explanation_not_advice"], ["taste", "health boundary"], ["taste is not nutrition advice"], ["constrains"], P.boundary],
  ["relation.analogy_not_identity_r25", ["analogy is not identity relation"], "boundary_guardrail", "negative_relation", ["concept.analogy_not_identity"], ["concept.false_equivalence"], ["shared axis", "difference"], ["analogy is not identity"], ["constrains"], P.boundary],
  ["relation.concept_explanation_not_expert_advice_r25", ["concept explanation is not expert advice"], "boundary_guardrail", "negative_relation", ["concept.concept_explanation_not_advice"], ["theme.boundary"], ["scope", "advice"], ["concept explanation is not expert advice"], ["constrains"], P.boundary]
].map(([id, names, domain, relation_type, sources, targets, shared, negative, verbs, meta]) => relation({
  id,
  names,
  domain,
  relation_type,
  sources,
  targets,
  shared,
  contrast: negative,
  verbs,
  provenance: [S.brit("art/analogy")],
  transfer: ["bridge", "negative_relation", "same_or_different"],
  meta
}));

const manualConceptRelations = [];
for (const c of conceptRows) {
  const related = (c.related_concepts || []).slice(0, 2);
  for (const target of related) {
    manualConceptRelations.push(relation({
      id: `relation.${c.id.replace(/^(concept|theme|movement|period)\./, "")}_${target.replace(/^(concept|theme|movement|period)\./, "")}`,
      names: [`${c.names[1] || c.names[0]} relation ${target.split(".").pop()}`],
      domain: c.domain,
      relation_type: "concept_to_concept",
      sources: [c.id],
      targets: [target],
      shared: c.definition_units?.slice(0, 2) || ["concept relation"],
      contrast: c.non_examples?.slice(0, 1) || ["not equivalent"],
      verbs: ["helps distinguish", "frames", "constrains"],
      provenance: c.provenance,
      transfer: ["concept_followup", "same_or_different", "topic_reentry"],
      meta: { ...P.bridgeSource, purpose_class: ["closes_concept_relation_loop", "supports_same_or_different", "source_library_relation"] }
    }));
  }
}

function writeJsonl(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function uniqueNew(rows, ids) {
  const seen = new Set();
  const out = [];
  const skipped = [];
  for (const row of rows) {
    if (ids.has(row.id) || seen.has(row.id)) {
      skipped.push(row.id);
      continue;
    }
    seen.add(row.id);
    out.push(row);
  }
  return { out, skipped };
}

function main() {
  const ids = existingIds();
  const domainRows = [...people, ...conceptRows, ...workRows];
  const relationRows = [
    ...derivedPersonWorkRelations(),
    ...derivedWorkConceptRelations(),
    ...manualConceptRelations,
    ...manualRelations
  ];
  const domainResult = uniqueNew(domainRows, ids);
  const relationResult = uniqueNew(relationRows, new Set([...ids, ...domainResult.out.map((row) => row.id)]));
  writeJsonl(STAGE2B_FILE, domainResult.out);
  writeJsonl(STAGE3A_FILE, relationResult.out);
  console.log(JSON.stringify({
    execution_ok: true,
    stage2b_cards: domainResult.out.length,
    stage3a_cards: relationResult.out.length,
    total_cards: domainResult.out.length + relationResult.out.length,
    skipped_existing_or_duplicate: [...domainResult.skipped, ...relationResult.skipped].length,
    outputs: [
      path.relative(ROOT, STAGE2B_FILE),
      path.relative(ROOT, STAGE3A_FILE)
    ]
  }, null, 2));
}

main();
