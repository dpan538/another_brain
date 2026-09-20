export const R23_KNOWLEDGE_PRIMITIVES = Object.freeze([
  {
    id: "person.ozu_yasujiro",
    entity_type: "person",
    names: ["小津安二郎", "小津"],
    domain: "film.japanese",
    roles: ["日本电影导演"],
    period: "20世纪",
    themes: ["family", "daily_life", "postwar_japan"],
    style_axes: ["static_framing", "domestic_detail"],
    representative_works: ["work.tokyo_story", "work.late_spring", "work.early_summer"],
    provenance: "r23_structured_public_knowledge_seed",
    transfer_scope: ["person_pronoun_works", "film_familiarity", "works_list"]
  },
  {
    id: "work.tokyo_story",
    entity_type: "work",
    names: ["东京物语"],
    domain: "film.japanese",
    work_type: "film",
    creator_ids: ["person.ozu_yasujiro"],
    themes: ["family", "time", "postwar_japan"],
    provenance: "r23_structured_public_knowledge_seed",
    transfer_scope: ["works_list", "film_examples"]
  },
  {
    id: "work.late_spring",
    entity_type: "work",
    names: ["晚春"],
    domain: "film.japanese",
    work_type: "film",
    creator_ids: ["person.ozu_yasujiro"],
    themes: ["family", "daily_life"],
    provenance: "r23_structured_public_knowledge_seed",
    transfer_scope: ["works_list", "film_examples"]
  },
  {
    id: "work.early_summer",
    entity_type: "work",
    names: ["麦秋"],
    domain: "film.japanese",
    work_type: "film",
    creator_ids: ["person.ozu_yasujiro"],
    themes: ["family", "daily_life"],
    provenance: "r23_structured_public_knowledge_seed",
    transfer_scope: ["works_list", "film_examples"]
  },
  {
    id: "person.charles_darwin",
    entity_type: "person",
    names: ["达尔文", "查尔斯·达尔文", "Charles Darwin"],
    domain: "science.history",
    roles: ["自然科学家"],
    period: "19世纪",
    themes: ["evolution", "natural_selection", "scientific_argument"],
    style_axes: ["evidence_chain", "comparative_observation"],
    representative_works: ["work.origin_of_species", "work.descent_of_man"],
    provenance: "r23_structured_public_knowledge_seed",
    transfer_scope: ["person_pronoun_works", "science_familiarity", "confirmation"]
  },
  {
    id: "work.origin_of_species",
    entity_type: "work",
    names: ["物种起源"],
    domain: "science.history",
    work_type: "book",
    creator_ids: ["person.charles_darwin"],
    themes: ["evolution", "natural_selection"],
    provenance: "r23_structured_public_knowledge_seed",
    transfer_scope: ["works_list", "science_examples"]
  },
  {
    id: "work.descent_of_man",
    entity_type: "work",
    names: ["人类的由来"],
    domain: "science.history",
    work_type: "book",
    creator_ids: ["person.charles_darwin"],
    themes: ["human_evolution", "comparative_observation"],
    provenance: "r23_structured_public_knowledge_seed",
    transfer_scope: ["works_list", "science_examples"]
  },
  {
    id: "concept.modern_art",
    entity_type: "concept",
    names: ["现代艺术"],
    domain: "visual.art",
    definition_units: ["观看方式", "材料选择", "制度语境"],
    themes: ["viewing", "material", "institution", "form_experiment"],
    relation_units: ["art_to_viewing_context", "material_to_form"],
    provenance: "r23_structured_public_knowledge_seed",
    transfer_scope: ["domain_familiarity", "concept_characteristics", "visual_art_bridge"],
    constraints: ["avoid_art_as_history_profile"]
  }
]);
