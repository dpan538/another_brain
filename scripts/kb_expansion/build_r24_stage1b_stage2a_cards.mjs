import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CARD_DIR = path.join(ROOT, "data", "culture_cards");
const STAGE1B_FILE = path.join(CARD_DIR, "r24_stage1b_strong_lane_closure.jsonl");
const STAGE2A_FILE = path.join(CARD_DIR, "r24_stage2a_daily_world_slice.jsonl");
const OUTPUT_FILES = new Set([path.basename(STAGE1B_FILE), path.basename(STAGE2A_FILE)]);

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

const COPYRIGHT_POLICY = "Use metadata, themes, and short paraphrase only; no lyrics or long copyrighted excerpts.";

const S = {
  brit: (slug) => ({ label: `Britannica:${slug}`, url: `https://www.britannica.com/${slug}` }),
  sep: (slug) => ({ label: `SEP:${slug}`, url: `https://plato.stanford.edu/entries/${slug}/` }),
  criterion: (slug) => ({ label: `Criterion:${slug}`, url: `https://www.criterion.com/${slug}` }),
  bfi: (slug) => ({ label: `BFI:${slug}`, url: `https://www.bfi.org.uk/${slug}` }),
  moma: (slug) => ({ label: `MoMA:${slug}`, url: `https://www.moma.org/${slug}` }),
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
  eval_tags = []
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
      "no lyrics",
      "no private-intent inference",
      "mark uncertainty when scope is partial"
    ],
    copyright_policy: COPYRIGHT_POLICY,
    followup_bindings: [],
    source_summary: "R24 Stage 1B/2A public source-backed cultural card; compact metadata only.",
    confidence,
    visibility: "public",
    approved_for_public_runtime: true,
    not_to_infer: [
      "complete canon",
      "private motive",
      "direct influence without evidence",
      "identity equivalence from loose analogy"
    ],
    needs_review: false,
    eval_tags
  };
}

function concept({
  id,
  names,
  domain,
  factual_core,
  definition_units,
  examples = [],
  non_examples = [],
  related_concepts = [],
  related_people = [],
  relation_ids = [],
  common_misreadings = [],
  negative_moves = [],
  boundary_notes = [],
  provenance = [],
  transfer_scope = [],
  entity_type
}) {
  const card = base({
    id,
    entity_type: entity_type || (id.startsWith("theme.") ? "theme" : id.startsWith("movement.") ? "movement" : "concept"),
    names,
    domain,
    factual_core,
    themes: related_concepts,
    related_entities: [
      ...related_concepts.map((ref) => ({ id: ref, relation: "related_concept" })),
      ...related_people.map((ref) => ({ id: ref, relation: "related_person" })),
      ...relation_ids.map((ref) => ({ id: ref, relation: "relation_card" }))
    ],
    comparison_axes: definition_units,
    eval_tags: ["r24", "concept"]
  });
  return {
    ...card,
    definition_units,
    examples,
    non_examples,
    related_concepts,
    related_people,
    relation_ids,
    common_misreadings,
    negative_moves,
    boundary_notes,
    provenance,
    transfer_scope,
    turn_functions: ["define_concept", "explain_characteristics", "explain_relation", "compare_forms", "topic_reentry"]
  };
}

function person({
  id,
  names,
  domain,
  roles,
  period,
  regions_languages,
  representative_works = [],
  themes = [],
  style_axes = [],
  related_concepts = [],
  related_people = [],
  negative_moves = [],
  uncertainty_notes = [],
  provenance = [],
  transfer_scope = []
}) {
  const card = base({
    id,
    entity_type: "person",
    names,
    domain,
    factual_core: `${names[0]}: ${roles.join(", ")}; period=${period}.`,
    works: representative_works,
    representative_works,
    periods: [period],
    themes,
    style_axes,
    related_entities: [
      ...representative_works.map((ref) => ({ id: ref, relation: "representative_work" })),
      ...related_concepts.map((ref) => ({ id: ref, relation: "related_concept" })),
      ...related_people.map((ref) => ({ id: ref, relation: "neighbor_or_foil" }))
    ],
    comparison_axes: style_axes,
    eval_tags: ["r24", "person"]
  });
  return {
    ...card,
    roles,
    period,
    regions_languages,
    related_concepts,
    related_people,
    negative_moves,
    uncertainty_notes,
    provenance,
    transfer_scope,
    turn_functions: ["identify_person", "list_representative_works", "explain_characteristics", "compare_people", "topic_reentry"]
  };
}

function work({
  id,
  names,
  domain,
  creator_ids = [],
  work_type,
  period,
  factual_core,
  themes = [],
  concepts = [],
  relation_ids = [],
  style_axes = [],
  safe_summary_units = [],
  negative_moves = [],
  boundary_notes = [],
  provenance = [],
  transfer_scope = []
}) {
  const card = base({
    id,
    entity_type: "work",
    names,
    domain,
    factual_core,
    periods: [period],
    themes,
    style_axes,
    related_entities: [
      ...creator_ids.map((ref) => ({ id: ref, relation: "creator_or_primary_context" })),
      ...concepts.map((ref) => ({ id: ref, relation: "related_concept" })),
      ...relation_ids.map((ref) => ({ id: ref, relation: "relation_card" }))
    ],
    comparison_axes: style_axes,
    eval_tags: ["r24", "work"]
  });
  return {
    ...card,
    creator_ids,
    work_type,
    concepts,
    relation_ids,
    safe_summary_units,
    copyright_boundary: "summary_paraphrase_only",
    negative_moves,
    boundary_notes,
    provenance,
    transfer_scope,
    turn_functions: ["list_representative_works", "explain_characteristics", "compare_works", "concept_followup", "recommend_items"]
  };
}

function relation({
  id,
  names,
  domain,
  relation_type,
  source_ids,
  target_ids,
  shared_axes = [],
  contrast_axes = [],
  licensed_verbs = ["helps explain"],
  example_ids = [],
  constraints = ["no identity collapse", "no causal claim without source", "no stronger verb than licensed"],
  negative_moves = ["do_not_claim_same_as", "do_not_claim_direct_causation"],
  provenance = [],
  transfer_scope = []
}) {
  const card = base({
    id,
    entity_type: "relation",
    names,
    domain,
    factual_core: `${relation_type}: ${source_ids.join("+")} -> ${target_ids.join("+")}.`,
    themes: shared_axes,
    related_entities: [
      ...source_ids.map((ref) => ({ id: ref, relation: "source" })),
      ...target_ids.map((ref) => ({ id: ref, relation: "target" })),
      ...example_ids.map((ref) => ({ id: ref, relation: "example" }))
    ],
    comparison_axes: [...shared_axes, ...contrast_axes],
    eval_tags: ["r24", "relation"]
  });
  return {
    ...card,
    relation_type,
    source_ids,
    target_ids,
    shared_axes,
    contrast_axes,
    licensed_verbs,
    example_ids,
    constraints,
    negative_moves,
    provenance,
    transfer_scope,
    turn_functions: ["explain_relation", "compare_forms", "topic_reentry", "cross_domain_analogy"]
  };
}

function boundary(id, names, domain, definition_units, provenance, transfer_scope, extra = {}) {
  return concept({
    id,
    names,
    domain,
    factual_core: `${names[0]} boundary scaffold.`,
    definition_units,
    examples: extra.examples || ["scope limit", "uncertainty marker"],
    non_examples: extra.non_examples || ["final answer", "generic refusal"],
    related_concepts: extra.related_concepts || ["theme.boundary"],
    common_misreadings: extra.common_misreadings || ["boundary_as_escape"],
    negative_moves: extra.negative_moves || ["do_not_replace_safe_answer", "do_not_overstate_static_card"],
    boundary_notes: extra.boundary_notes || ["Boundary constrains output; it does not substitute for the requested operation."],
    provenance,
    transfer_scope
  });
}

const stage1bConcepts = [
  concept({ id: "concept.song_vs_poem_medium", names: ["歌曲与诗的媒介差异", "song vs poem medium"], domain: "music.chinese_pop_general", factual_core: "Medium contrast between lyric, voice, melody, page, rhythm, and performance.", definition_units: ["voice", "melody", "page", "performance"], examples: ["sung line", "printed line"], non_examples: ["same form because both are short"], related_concepts: ["theme.memory"], common_misreadings: ["song_equals_poem"], negative_moves: ["do_not_flatten_medium_difference"], boundary_notes: ["Use analogy only after preserving medium difference."], provenance: [S.brit("art/popular-music")], transfer_scope: ["music", "poetry", "cross_domain_analogy"] }),
  concept({ id: "concept.singer_songwriter_role", names: ["唱作人", "singer-songwriter"], domain: "music.chinese_pop_general", factual_core: "Music role combining performance and authorship across song, voice, and persona.", definition_units: ["performance", "songwriting", "persona"], examples: ["Mandopop singer-songwriter"], non_examples: ["performer only", "lyricist only"], related_concepts: ["concept.lyricist_role", "concept.voice_persona"], common_misreadings: ["singer_songwriter_equals_all_roles"], negative_moves: ["do_not_credit_lyrics_without_evidence"], boundary_notes: ["Separate composer, lyricist, performer, producer."], provenance: [S.brit("art/singer-songwriter")], transfer_scope: ["music_roles", "works_list", "comparison"] }),
  concept({ id: "concept.lyricist_role", names: ["作词人", "lyricist"], domain: "music.chinese_pop_general", factual_core: "Song role focused on words, imagery, phrasing, and relation to melody.", definition_units: ["words", "imagery", "phrasing"], examples: ["Cantopop lyricist"], non_examples: ["vocal timbre", "arrangement alone"], related_concepts: ["concept.singer_songwriter_role", "concept.song_vs_poem_medium"], common_misreadings: ["lyricist_equals_singer"], negative_moves: ["do_not_quote_lyrics"], boundary_notes: ["No lyric excerpts; use theme summary."], provenance: [S.brit("art/lyric")], transfer_scope: ["music", "poetry_bridge", "copyright_boundary"] }),
  concept({ id: "concept.performer_role", names: ["演唱者", "performer role"], domain: "music.chinese_pop_general", factual_core: "Music role centered on voice, interpretation, stage persona, and audience relation.", definition_units: ["voice", "interpretation", "persona"], examples: ["recorded vocal performance"], non_examples: ["songwriting credit by default"], related_concepts: ["concept.voice_persona", "concept.lyricist_role"], common_misreadings: ["performer_equals_author"], negative_moves: ["do_not_assign_authorship_without_credit"], boundary_notes: ["Separate performer claims from creator claims."], provenance: [S.brit("art/singing")], transfer_scope: ["music_roles", "comparison", "representative_work"] }),
  concept({ id: "concept.album_vs_single", names: ["专辑与单曲", "album vs single"], domain: "music.chinese_pop_general", factual_core: "Music form contrast between larger sequence and concentrated release.", definition_units: ["sequence", "single_track", "coherence", "release"], examples: ["album arc", "single hook"], non_examples: ["quality ranking"], related_concepts: ["concept.music_chinese_pop_general"], common_misreadings: ["album_always_deeper"], negative_moves: ["do_not_rank_format_by_default"], boundary_notes: ["Discuss form and production, not value hierarchy."], provenance: [S.brit("art/album-music")], transfer_scope: ["music", "form_comparison", "creation_process"] }),
  concept({ id: "concept.voice_persona", names: ["声音人格", "voice persona"], domain: "music.chinese_pop_general", factual_core: "Perceived relation among voice, phrasing, arrangement, and public persona.", definition_units: ["voice", "phrasing", "arrangement", "persona"], examples: ["intimate vocal image", "rock public voice"], non_examples: ["private personality"], related_concepts: ["concept.performer_role"], common_misreadings: ["voice_persona_equals_real_person"], negative_moves: ["do_not_infer_private_identity"], boundary_notes: ["Keep to public performance evidence."], provenance: [S.brit("art/singing")], transfer_scope: ["music_style", "persona_questions", "comparison"] }),
  concept({ id: "concept.mandopop_cantopop_rock", names: ["华语流行粤语流行摇滚", "Mandopop Cantopop Chinese rock"], domain: "music.chinese_pop_general", factual_core: "Genre/region contrast among Mandarin pop, Cantonese pop, and Chinese rock.", definition_units: ["language", "region", "industry", "sound"], examples: ["Mandopop", "Cantopop", "mainland rock"], non_examples: ["single unified style"], related_concepts: ["concept.music_chinese_pop_general"], common_misreadings: ["Chinese_pop_one_style"], negative_moves: ["do_not_merge_language_markets"], boundary_notes: ["Use language/region/history distinctions."], provenance: [S.brit("art/popular-music")], transfer_scope: ["music_comparison", "recommendation", "history"] }),
  concept({ id: "concept.nostalgia_historical_memory", names: ["怀旧与历史记忆", "nostalgia and historical memory"], domain: "music.chinese_pop_general", factual_core: "Contrast between private retrospection and shared historical memory.", definition_units: ["private_recall", "public_memory", "history"], examples: ["youth song memory", "era-marked song"], non_examples: ["literal childhood fact"], related_concepts: ["theme.memory", "theme.youth_memory"], common_misreadings: ["nostalgia_equals_history"], negative_moves: ["do_not_force_nostalgia"], boundary_notes: ["Separate personal feeling from historical claim."], provenance: [S.sep("memory")], transfer_scope: ["music", "literature", "film"] }),
  concept({ id: "concept.private_public_memory", names: ["私人情感与公共记忆", "private emotion and public memory"], domain: "music.chinese_pop_general", factual_core: "Relation between intimate feeling and shared cultural memory.", definition_units: ["private_emotion", "public_memory", "circulation"], examples: ["love song as shared memory"], non_examples: ["private diary only"], related_concepts: ["concept.nostalgia_historical_memory"], common_misreadings: ["popular_song_only_private"], negative_moves: ["do_not_reduce_public_song_to_author_biography"], boundary_notes: ["Use circulation and audience frame."], provenance: [S.brit("art/popular-music")], transfer_scope: ["music", "film", "literature"] }),
  concept({ id: "concept.vernacular_literature", names: ["白话文学", "vernacular literature"], domain: "literature.chinese_modern", factual_core: "Literary use of vernacular language linked to modern readership and reform.", definition_units: ["vernacular_language", "readership", "reform"], examples: ["May Fourth fiction"], non_examples: ["casual speech only"], related_concepts: ["movement.may_fourth_new_literature"], common_misreadings: ["vernacular_equals_simple"], negative_moves: ["do_not_treat_as_lower_style"], boundary_notes: ["Tie to historical language reform."], provenance: [S.brit("biography/Lu-Xun")], transfer_scope: ["modern_chinese_literature", "language", "public_critique"] }),
  concept({ id: "concept.irony_literary", names: ["反讽", "literary irony"], domain: "literature", factual_core: "Gap between statement, situation, and implied judgment.", definition_units: ["gap", "statement", "situation", "judgment"], examples: ["narrative irony", "social satire"], non_examples: ["simple joke"], related_concepts: ["theme.interpretation"], common_misreadings: ["irony_equals_sarcasm"], negative_moves: ["do_not_overread_every_tone_as_irony"], boundary_notes: ["Needs textual or structural evidence."], provenance: [S.brit("art/irony")], transfer_scope: ["literature", "film", "public_language"] }),
  concept({ id: "concept.rural_urban_transition", names: ["乡土城市转换", "rural urban transition"], domain: "literature.chinese_modern", factual_core: "Cultural movement between rural locality, city modernity, and social change.", definition_units: ["rural", "urban", "migration", "modernity"], examples: ["town-city contrast", "village-city memory"], non_examples: ["rural nostalgia only"], related_concepts: ["theme.modernization_loss", "concept.city_street"], common_misreadings: ["rural_equals_pure"], negative_moves: ["do_not_romanticize_rural_life"], boundary_notes: ["Keep social and historical context."], provenance: [S.brit("topic/modernization")], transfer_scope: ["literature", "music", "film"] }),
  concept({ id: "concept.public_critique_intimate_anatomy", names: ["公共批判与亲密剖面", "public critique and intimate social anatomy"], domain: "literature.chinese_modern", factual_core: "Contrast axis for modern literature: public social critique versus close analysis of intimate relations.", definition_units: ["public_critique", "intimate_relation", "social_form"], examples: ["Lu Xun contrast", "Eileen Chang contrast"], non_examples: ["male/female style split"], related_concepts: ["concept.vernacular_literature", "concept.cold_affect"], common_misreadings: ["critique_vs_intimacy_as_value_rank"], negative_moves: ["do_not_gender_the_contrast"], boundary_notes: ["Use as comparison axis, not hierarchy."], provenance: [S.brit("biography/Lu-Xun"), S.brit("biography/Eileen-Chang")], transfer_scope: ["Chinese_literature", "comparison", "style"] }),
  concept({ id: "concept.haiku", names: ["俳句", "haiku"], domain: "literature.japanese", factual_core: "Short Japanese poetic form linked to season words, cut, brevity, and perception.", definition_units: ["brevity", "kigo", "cut", "perception"], examples: ["Basho haiku metadata"], non_examples: ["any short poem"], related_concepts: ["concept.kigo_seasonality", "concept.seasonality"], common_misreadings: ["haiku_equals_any_3_line_poem"], negative_moves: ["do_not_quote_full_poems_without_rights"], boundary_notes: ["Use form features and summaries only."], provenance: [S.brit("art/haiku")], transfer_scope: ["Japanese_literature", "poetry", "seasonality"] }),
  concept({ id: "concept.interiority", names: ["内面性", "interiority"], domain: "literature", factual_core: "Narrative attention to inner perception, memory, thought, and self-relation.", definition_units: ["perception", "memory", "thought", "self_relation"], examples: ["modern novel consciousness"], non_examples: ["biographical confession by default"], related_concepts: ["concept.narrator_point_of_view", "concept.stream_of_consciousness"], common_misreadings: ["interiority_equals_author_feeling"], negative_moves: ["do_not_infer_private_author_state"], boundary_notes: ["Distinguish character consciousness from author biography."], provenance: [S.brit("art/novel")], transfer_scope: ["Japanese_literature", "Western_modernism", "film"] }),
  concept({ id: "concept.city_loneliness", names: ["城市孤独", "city loneliness"], domain: "literature.japanese", factual_core: "Modern urban affect shaped by anonymity, mobility, routine, and delayed relation.", definition_units: ["anonymity", "mobility", "routine", "relation"], examples: ["contemporary urban fiction"], non_examples: ["any sadness in a city"], related_concepts: ["concept.city_street", "theme.memory"], common_misreadings: ["city_loneliness_equals_all_modern_life"], negative_moves: ["do_not_make_city_a_psychological_cause"], boundary_notes: ["Use as literary/social frame, not diagnosis."], provenance: [S.brit("biography/Haruki-Murakami")], transfer_scope: ["literature", "film", "music"] }),
  concept({ id: "concept.stream_of_consciousness", names: ["意识流", "stream of consciousness"], domain: "literature.western_modern", factual_core: "Narrative method representing thought flow, perception, and associative movement.", definition_units: ["thought_flow", "perception", "association"], examples: ["modernist fiction"], non_examples: ["confusing prose by default"], related_concepts: ["concept.interiority", "concept.narrator_point_of_view"], common_misreadings: ["stream_equals_randomness"], negative_moves: ["do_not_call_all_complex_narration_stream"], boundary_notes: ["Use for specific narrative technique."], provenance: [S.brit("art/stream-of-consciousness")], transfer_scope: ["modernism", "narration", "memory"] }),
  concept({ id: "concept.fragmentation_modernism", names: ["现代主义碎片化", "modernist fragmentation"], domain: "literature.western_modern", factual_core: "Form strategy using fragments, allusions, discontinuity, and multiple voices.", definition_units: ["fragment", "allusion", "discontinuity"], examples: ["modernist poem", "collage narrative"], non_examples: ["incoherence by default"], related_concepts: ["period.modernist_literature"], common_misreadings: ["fragmentation_equals_bad_structure"], negative_moves: ["do_not_treat_difficulty_as_failure"], boundary_notes: ["Tie fragmentation to form and historical context."], provenance: [S.brit("event/Modernism-art")], transfer_scope: ["literature", "art", "film"] }),
  concept({ id: "concept.unreliable_viewpoint", names: ["不可靠视角", "unreliable viewpoint"], domain: "literature", factual_core: "Narrative condition where a viewpoint requires caution against taking claims at face value.", definition_units: ["viewpoint", "claim", "caution", "evidence"], examples: ["limited narrator", "conflicting testimony"], non_examples: ["character lies always"], related_concepts: ["concept.narrator_point_of_view", "concept.testimony"], common_misreadings: ["unreliable_equals_false"], negative_moves: ["do_not_overrule_all_claims"], boundary_notes: ["Mark uncertainty instead of declaring hidden truth."], provenance: [S.brit("art/narrative")], transfer_scope: ["literature", "film", "law_boundary"] }),
  concept({ id: "concept.interior_monologue", names: ["内心独白", "interior monologue"], domain: "literature.western_modern", factual_core: "Narrative representation of inner speech or thought.", definition_units: ["inner_speech", "thought", "narrative_form"], examples: ["modernist monologue"], non_examples: ["dialogue spoken aloud"], related_concepts: ["concept.stream_of_consciousness", "concept.interiority"], common_misreadings: ["interior_monologue_equals_all_psychology"], negative_moves: ["do_not_infer_author_confession"], boundary_notes: ["Keep technique distinct from therapy language."], provenance: [S.brit("art/interior-monologue")], transfer_scope: ["modernism", "narration", "psychology_boundary"] }),
  concept({ id: "concept.novel_poem_medium_difference", names: ["小说与诗的媒介差异", "novel vs poem medium difference"], domain: "literature", factual_core: "Contrast between extended narrative form and compressed poetic form.", definition_units: ["duration", "narrative", "compression", "rhythm"], examples: ["novel plot", "poem image"], non_examples: ["length as sole difference"], related_concepts: ["concept.song_vs_poem_medium"], common_misreadings: ["poem_short_novel_long_only"], negative_moves: ["do_not_reduce_medium_to_size"], boundary_notes: ["Use form, voice, time, and reader rhythm."], provenance: [S.brit("art/literature")], transfer_scope: ["literature", "music_bridge", "film_bridge"] }),
  concept({ id: "concept.modernism_postmodern_aftermath", names: ["现代主义与后现代余波", "modernism and postmodern aftermath"], domain: "literature.western_modern", factual_core: "Contrast between modernist form crisis and later reflexive or institutional play.", definition_units: ["form_crisis", "reflexivity", "institution"], examples: ["modernist fragmentation", "conceptual art link"], non_examples: ["newer automatically postmodern"], related_concepts: ["period.modernist_literature", "movement.postmodern_art"], common_misreadings: ["postmodern_equals_any_late_work"], negative_moves: ["do_not_use_period_label_as_shortcut"], boundary_notes: ["Use period and form evidence."], provenance: [S.brit("event/Modernism-art")], transfer_scope: ["literature", "art", "film"] }),
  concept({ id: "concept.duration_film", names: ["电影时长感", "duration in film"], domain: "film", factual_core: "Felt time shaped by shot length, rhythm, repetition, and attention.", definition_units: ["shot_length", "rhythm", "repetition", "attention"], examples: ["long take", "held shot"], non_examples: ["film length only"], related_concepts: ["concept.restraint", "concept.time_memory"], common_misreadings: ["duration_equals_slow"], negative_moves: ["do_not_praise_slowness_by_default"], boundary_notes: ["Connect duration to film form, not mood alone."], provenance: [S.bfi("features")], transfer_scope: ["film", "music_timing", "daily_practice"] }),
  concept({ id: "concept.ellipsis_film", names: ["电影省略", "film ellipsis"], domain: "film", factual_core: "Omission between scenes or shots that lets viewers infer time, action, or relation.", definition_units: ["omission", "inference", "time_gap"], examples: ["cut over unseen event"], non_examples: ["plot hole by default"], related_concepts: ["concept.negative_space", "theme.framing"], common_misreadings: ["ellipsis_equals_missing_information"], negative_moves: ["do_not_call_all_ambiguity_ellipsis"], boundary_notes: ["Use when omission is structurally meaningful."], provenance: [S.bfi("features")], transfer_scope: ["film", "literature", "design"] }),
  concept({ id: "concept.slow_cinema", names: ["慢电影", "slow cinema"], domain: "film", factual_core: "Film tendency associated with long duration, sparse action, and heightened attention.", definition_units: ["long_duration", "sparse_action", "attention"], examples: ["long take cinema"], non_examples: ["boring film by default"], related_concepts: ["concept.duration_film", "concept.restraint"], common_misreadings: ["slow_equals_empty"], negative_moves: ["do_not_reduce_director_style_to_speed"], boundary_notes: ["Compare concrete formal choices."], provenance: [S.bfi("features")], transfer_scope: ["film_comparison", "Hou_Tsai_Ozu", "pacing"] }),
  concept({ id: "movement.hong_kong_new_wave", names: ["香港新浪潮", "Hong Kong New Wave"], domain: "film.hongkong", factual_core: "Hong Kong cinema movement linked to new directors, urban subjects, and social change.", definition_units: ["Hong_Kong", "new_directors", "urban_subjects"], examples: ["Ann Hui context"], non_examples: ["all Hong Kong cinema"], related_concepts: ["concept.city_alienation"], common_misreadings: ["movement_equals_one_style"], negative_moves: ["do_not_merge_with_Wong_Kar_wai_style_only"], boundary_notes: ["Use movement context and concrete films."], provenance: [S.bfi("features")], transfer_scope: ["film_history", "Hong_Kong", "city_film"], entity_type: "movement" }),
  concept({ id: "concept.city_alienation", names: ["城市疏离", "city alienation"], domain: "film", factual_core: "Urban affect shaped by crowding, distance, repetition, and missed relation.", definition_units: ["crowding", "distance", "repetition", "missed_relation"], examples: ["lonely city scene"], non_examples: ["all urban setting"], related_concepts: ["concept.city_street", "concept.city_loneliness"], common_misreadings: ["city_alienation_equals_city_itself"], negative_moves: ["do_not_make_city_a_cause_without_evidence"], boundary_notes: ["Use as form/social axis, not diagnosis."], provenance: [S.brit("topic/urbanization")], transfer_scope: ["film", "literature", "music"] }),
  concept({ id: "concept.family_memory", names: ["家庭记忆", "family memory"], domain: "film", factual_core: "Memory mediated by family roles, rituals, absences, and repeated objects.", definition_units: ["family_role", "ritual", "absence", "object"], examples: ["family meal scene", "homecoming"], non_examples: ["genealogy only"], related_concepts: ["theme.memory", "concept.time_memory"], common_misreadings: ["family_memory_equals_nostalgia"], negative_moves: ["do_not_romanticize_family"], boundary_notes: ["Use for works, not user family diagnosis."], provenance: [S.brit("topic/family-kinship")], transfer_scope: ["film", "literature", "photography"] }),
  concept({ id: "concept.medium_material", names: ["媒介与材料", "medium and material"], domain: "art_history", factual_core: "Relation between medium, material support, technique, and meaning.", definition_units: ["medium", "material", "support", "technique"], examples: ["paint", "photograph", "chair"], non_examples: ["theme only"], related_concepts: ["concept.form_material_institution"], common_misreadings: ["material_equals_content"], negative_moves: ["do_not_ignore_material_specificity"], boundary_notes: ["Use medium-specific evidence."], provenance: [S.moma("collection/terms")], transfer_scope: ["art", "photography", "design"] }),
  concept({ id: "concept.gaze", names: ["凝视", "gaze"], domain: "photography_history", factual_core: "Viewing relation shaped by position, power, attention, and representation.", definition_units: ["viewer_position", "power", "attention", "representation"], examples: ["camera gaze", "spectator relation"], non_examples: ["looking only"], related_concepts: ["theme.looking", "theme.framing"], common_misreadings: ["gaze_equals_eye_contact"], negative_moves: ["do_not_moralize_every_view"], boundary_notes: ["Use when representation relation matters."], provenance: [S.moma("collection/terms/photography")], transfer_scope: ["photography", "film", "art"] }),
  concept({ id: "concept.studium", names: ["知面", "studium"], domain: "photography_history", factual_core: "Barthes-linked photographic field of cultural interest and readable context.", definition_units: ["cultural_interest", "context", "readability"], examples: ["historical photo context"], non_examples: ["personal piercing detail"], related_concepts: ["concept.punctum", "theme.looking"], common_misreadings: ["studium_equals_technical_quality"], negative_moves: ["do_not_make_viewer_response_universal"], boundary_notes: ["Keep distinction from punctum."], provenance: [S.brit("biography/Roland-Gerard-Barthes")], transfer_scope: ["photography", "memory", "image_theory"] }),
  concept({ id: "concept.abstraction_art", names: ["抽象艺术", "abstraction"], domain: "art_history", factual_core: "Art approach reducing or transforming visible reference into form, color, line, or structure.", definition_units: ["form", "color", "line", "structure"], examples: ["abstract painting"], non_examples: ["meaningless decoration"], related_concepts: ["movement.abstract_expressionism", "movement.minimalism"], common_misreadings: ["abstraction_equals_no_subject"], negative_moves: ["do_not_force_society_identity_answer"], boundary_notes: ["Use formal and historical anchors."], provenance: [S.moma("collection/terms/abstract-art")], transfer_scope: ["art", "design", "visual_culture"] }),
  concept({ id: "concept.design_good_principles", names: ["好设计原则", "good design principles"], domain: "design_history", factual_core: "Design evaluation scaffold around usefulness, clarity, durability, and restraint.", definition_units: ["usefulness", "clarity", "durability", "restraint"], examples: ["industrial product", "interface"], non_examples: ["style trend only"], related_concepts: ["concept.form_material_institution", "concept.interface"], common_misreadings: ["good_design_equals_minimal"], negative_moves: ["do_not_make_Bauhaus_all_design"], boundary_notes: ["Keep user need and material constraints visible."], provenance: [S.official("Vitsoe:Dieter Rams", "https://www.vitsoe.com/us/about/dieter-rams")], transfer_scope: ["design", "technology_interface", "daily_objects"] })
];

const stage1bPersons = [
  person({ id: "person.tsai_ming_liang", names: ["蔡明亮", "Tsai Ming-liang"], domain: "film.taiwan", roles: ["film director"], period: "contemporary_Taiwan_cinema", regions_languages: ["Taiwan", "Chinese"], representative_works: ["work.goodbye_dragon_inn"], themes: ["slow_cinema", "absence", "urban_space"], style_axes: ["duration", "stillness", "minimal_dialogue"], related_concepts: ["concept.slow_cinema", "concept.duration_film"], related_people: ["person.hou_hsiao_hsien"], negative_moves: ["do_not_reduce_Tsai_to_slowness_only"], uncertainty_notes: ["Compare formal duration and space, not personality."], provenance: [S.bfi("features")], transfer_scope: ["Taiwan_cinema", "slow_cinema", "director_comparison"] }),
  person({ id: "person.samuel_beckett", names: ["贝克特", "Samuel Beckett"], domain: "literature.western_modern", roles: ["playwright", "novelist"], period: "20th_century", regions_languages: ["Ireland", "France", "English", "French"], representative_works: ["work.waiting_for_godot"], themes: ["absurdity", "waiting", "minimal_action"], style_axes: ["repetition", "silence", "stage_bare_form"], related_concepts: ["concept.fragmentation_modernism", "theme.interpretation"], related_people: ["person.kafka"], negative_moves: ["do_not_reduce_to_meaningless_absurdity"], uncertainty_notes: ["Separate absurdist theater from all modernism."], provenance: [S.brit("biography/Samuel-Beckett")], transfer_scope: ["Western_modernism", "theater", "waiting_questions"] }),
  person({ id: "person.john_berger", names: ["约翰·伯格", "John Berger"], domain: "photography_history", roles: ["critic", "writer"], period: "20th_century", regions_languages: ["Britain", "English"], representative_works: ["work.ways_of_seeing"], themes: ["viewing", "image", "power"], style_axes: ["looking_relation", "public_criticism"], related_concepts: ["theme.looking", "concept.gaze"], related_people: ["person.susan_sontag", "person.roland_barthes"], negative_moves: ["do_not_make_all_viewing_about_power_only"], uncertainty_notes: ["Use image theory boundaries."], provenance: [S.brit("biography/John-Berger")], transfer_scope: ["photography", "art", "film"] })
];

const stage1bWorks = [
  ["work.zhihuzheye", ["之乎者也"], "music.mandopop", ["person.luo_dayou"], "album", "taiwan_pop_1980s", "Luo Dayou album anchor for Mandarin pop, social observation, and singer-songwriter form.", ["Mandopop", "social_observation", "singer_songwriter"], ["album_form", "public_memory"], ["concept.album_vs_single", "concept.singer_songwriter_role"], [S.brit("art/popular-music")]],
  ["work.childhood_luo", ["童年", "Childhood"], "music.mandopop", ["person.luo_dayou"], "song", "taiwan_pop_1980s", "Luo Dayou song anchor for youth memory and retrospective public feeling.", ["youth_memory", "school_time", "retrospection"], ["plain_melody", "public_memory"], ["theme.youth_memory", "concept.nostalgia_historical_memory"], [S.brit("art/popular-music")]],
  ["work.lukang_town", ["鹿港小镇", "Lukang Town"], "music.mandopop", ["person.luo_dayou"], "song", "taiwan_pop_1980s", "Luo Dayou song anchor for modernization loss, place memory, and town-city contrast.", ["place", "modernization_loss", "memory"], ["town_city_contrast"], ["theme.modernization_loss", "concept.rural_urban_transition"], [S.brit("art/popular-music")]],
  ["work.love_song_1990", ["恋曲1990", "Love Song 1990"], "music.mandopop", ["person.luo_dayou"], "song", "mandopop_1990s", "Luo Dayou song anchor for private emotion and broad cultural memory.", ["private_emotion", "memory", "Mandopop"], ["retrospective_voice"], ["concept.private_public_memory"], [S.brit("art/popular-music")]],
  ["work.price_of_love", ["爱的代价", "The Price of Love"], "music.mandopop", ["person.li_zongsheng"], "song", "mandopop_1990s", "Jonathan Lee song anchor for relationship memory and ordinary-life songwriting.", ["relationship", "ordinary_life", "memory"], ["singer_songwriter", "spoken_plainness"], ["concept.private_public_memory", "concept.singer_songwriter_role"], [S.brit("art/popular-music")]],
  ["work.hills_li", ["山丘", "Hills"], "music.mandopop", ["person.li_zongsheng"], "song", "mandopop_2010s", "Jonathan Lee song anchor for retrospection, aging, and singer-songwriter reflection.", ["retrospection", "aging", "life_review"], ["plain_voice", "late_style"], ["theme.memory", "concept.voice_persona"], [S.brit("art/popular-music")]],
  ["work.red_bean_faye", ["红豆", "Red Bean"], "music.hongkong", ["person.faye_wong"], "song", "cantopop_mandopop_1990s", "Faye Wong song anchor for vocal persona, restraint, and popular memory.", ["voice", "restraint", "memory"], ["vocal_persona", "lyricist_relation"], ["concept.voice_persona", "concept.lyricist_role"], [S.brit("art/popular-music")]],
  ["work.sky_faye", ["天空", "Sky"], "music.hongkong", ["person.faye_wong"], "album", "cantopop_mandopop_1990s", "Faye Wong album anchor for voice, atmosphere, and 1990s Chinese pop circulation.", ["voice", "atmosphere", "Mandopop"], ["album_form", "persona"], ["concept.album_vs_single", "concept.voice_persona"], [S.brit("art/popular-music")]],
  ["work.fantasy_jay", ["范特西", "Fantasy"], "music.chinese_pop_general", ["person.jay_chou"], "album", "mandopop_2000s", "Jay Chou album anchor for genre mixing, production, and early-2000s Mandopop.", ["genre_mixing", "production", "youth"], ["album_form", "arrangement"], ["concept.album_vs_single"], [S.brit("art/popular-music")]],
  ["work.boundless_ocean_vast_skies", ["海阔天空", "Boundless Oceans Vast Skies"], "music.hongkong", ["person.beyond"], "song", "hk_cantopop_1990s", "Beyond song anchor for Cantopop rock, public feeling, and band identity.", ["Cantopop", "rock", "public_feeling"], ["band_voice", "anthem"], ["concept.mandopop_cantopop_rock"], [S.brit("art/rock-music")]],
  ["work.border_town", ["边城", "Border Town"], "literature.chinese_modern", ["person.shen_congwen"], "novel", "modern_chinese_literature", "Shen Congwen novel anchor for rural locality, lyric narrative, and modernity contrast.", ["rural_locality", "memory", "modernity"], ["lyric_narration", "place"], ["concept.rural_urban_transition"], [S.brit("biography/Shen-Congwen")]],
  ["work.camel_xiangzi", ["骆驼祥子", "Rickshaw Boy"], "literature.chinese_modern", ["person.lao_she"], "novel", "modern_chinese_literature", "Lao She novel anchor for urban labor, social pressure, and modern Beijing.", ["urban_labor", "social_pressure", "city"], ["spoken_language", "social_detail"], ["concept.city_street", "concept.rural_urban_transition"], [S.brit("biography/Lao-She")]],
  ["work.to_live_yu_hua", ["活着", "To Live"], "literature.chinese_modern", ["person.yu_hua"], "novel", "contemporary_chinese_literature", "Yu Hua novel anchor for historical pressure, survival, and family loss.", ["survival", "history", "family"], ["plain_narration", "historical_pressure"], ["theme.memory"], [S.brit("biography/Yu-Hua")]],
  ["work.red_sorghum", ["红高粱", "Red Sorghum"], "literature.chinese_modern", ["person.mo_yan"], "novel", "contemporary_chinese_literature", "Mo Yan novel anchor for rural history, mythic narration, and sensory intensity.", ["rural_history", "memory", "violence"], ["mythic_narration", "sensory_detail"], ["concept.rural_urban_transition"], [S.nobel("prizes/literature/2012/mo/facts/")]],
  ["work.pillow_book", ["枕草子", "The Pillow Book"], "literature.japanese", ["person.sei_shonagon"], "prose_classic", "heian_literature", "Heian prose anchor for lists, court observation, and refined attention.", ["court_life", "lists", "attention"], ["fragment", "observation"], ["concept.seasonality", "theme.looking"], [S.brit("topic/The-Pillow-Book")]],
  ["work.basho_haiku_anchor", ["芭蕉俳句例卡", "Basho haiku anchor"], "literature.japanese", ["person.matsuo_basho"], "poetry_metadata", "haiku_edo", "Basho haiku metadata anchor for seasonal word, cut, brevity, and travel context.", ["haiku", "seasonality", "travel"], ["brevity", "kigo"], ["concept.haiku", "concept.kigo_seasonality"], [S.brit("biography/Matsuo-Basho")]],
  ["work.i_am_a_cat", ["我是猫", "I Am a Cat"], "literature.japanese", ["person.natsume_soseki"], "novel", "meiji_modern_literature", "Soseki novel anchor for satirical viewpoint, modern self, and observer distance.", ["satire", "modernity", "viewpoint"], ["narrator", "irony"], ["concept.narrator_point_of_view", "concept.irony_literary"], [S.brit("biography/Natsume-Soseki")]],
  ["work.kokoro", ["心", "Kokoro"], "literature.japanese", ["person.natsume_soseki"], "novel", "meiji_modern_literature", "Soseki novel anchor for modern self, guilt, relation, and interiority.", ["selfhood", "guilt", "relation"], ["interiority", "letter_form"], ["concept.interiority"], [S.brit("biography/Natsume-Soseki")]],
  ["work.in_praise_of_shadows", ["阴翳礼赞", "In Praise of Shadows"], "literature.japanese", ["person.tanizaki_junichiro"], "essay", "modern_japanese_literature", "Tanizaki essay anchor for shadow, material, taste, and aesthetic contrast.", ["shadow", "material", "aesthetic_taste"], ["essay", "contrast"], ["concept.wabi_sabi", "concept.negative_space"], [S.brit("biography/Tanizaki-Junichiro")]],
  ["work.snow_country", ["雪国", "Snow Country"], "literature.japanese", ["person.kawabata_yasunari"], "novel", "postwar_japanese_literature", "Kawabata novel anchor for snow setting, distance, beauty, and impermanence.", ["snow", "beauty", "impermanence"], ["restraint", "seasonality"], ["concept.mujo_impermanence", "concept.seasonality"], [S.nobel("prizes/literature/1968/kawabata/facts/")]],
  ["work.no_longer_human", ["人间失格", "No Longer Human"], "literature.japanese", ["person.dazai_osamu"], "novel", "postwar_japanese_literature", "Dazai novel anchor for alienation, self-performance, and postwar interiority.", ["alienation", "self_performance", "interiority"], ["confession_form", "distance"], ["concept.interiority", "theme.self_deception"], [S.brit("biography/Dazai-Osamu")]],
  ["work.temple_of_golden_pavilion", ["金阁寺", "The Temple of the Golden Pavilion"], "literature.japanese", ["person.mishima_yukio"], "novel", "postwar_japanese_literature", "Mishima novel anchor for beauty, obsession, destruction, and postwar self-relation.", ["beauty", "obsession", "destruction"], ["symbolic_object", "interiority"], ["concept.interiority"], [S.brit("biography/Mishima-Yukio")]],
  ["work.woman_in_the_dunes", ["砂女", "The Woman in the Dunes"], "literature.japanese", ["person.abe_kobo"], "novel", "postwar_japanese_literature", "Abe Kobo novel anchor for enclosure, absurd condition, and modern alienation.", ["enclosure", "absurdity", "alienation"], ["spatial_condition", "parable"], ["concept.city_loneliness"], [S.brit("biography/Abe-Kobo")]],
  ["work.personal_matter", ["个人的体验", "A Personal Matter"], "literature.japanese", ["person.oe_kenzaburo"], "novel", "postwar_japanese_literature", "Oe novel anchor for responsibility, family crisis, and postwar ethical pressure.", ["responsibility", "family", "ethics"], ["moral_pressure", "interiority"], ["theme.freedom_responsibility"], [S.nobel("prizes/literature/1994/oe/facts/")]],
  ["work.kafka_on_the_shore", ["海边的卡夫卡", "Kafka on the Shore"], "literature.japanese", ["person.haruki_murakami"], "novel", "contemporary_japanese_literature", "Murakami novel anchor for city loneliness, mythic structure, and contemporary readability.", ["city_loneliness", "myth", "memory"], ["parallel_narrative", "surreal_structure"], ["concept.city_loneliness", "theme.memory"], [S.brit("biography/Haruki-Murakami")]],
  ["work.the_trial", ["审判", "The Trial"], "literature.western_modern", ["person.kafka"], "novel", "modernism", "Kafka novel anchor for opaque authority, accusation, and modern anxiety.", ["authority", "law_like_space", "anxiety"], ["parabolic_form", "bureaucratic_space"], ["theme.institution", "concept.rule_application_precedent"], [S.brit("topic/The-Trial-novel-by-Kafka")]],
  ["work.in_search_of_lost_time", ["追忆似水年华", "In Search of Lost Time"], "literature.western_modern", ["person.proust"], "novel_cycle", "modernism", "Proust work anchor for memory, time, perception, and social world.", ["memory", "time", "perception"], ["long_form", "recollection"], ["theme.memory", "concept.time_memory"], [S.brit("topic/In-Search-of-Lost-Time")]],
  ["work.ficciones", ["虚构集", "Ficciones"], "literature.western_modern", ["person.borges"], "story_collection", "modernism_postmodern", "Borges story collection anchor for labyrinth, fiction, reference, and conceptual narrative.", ["labyrinth", "fiction", "reference"], ["short_form", "conceptual_narrative"], ["concept.reference", "theme.interpretation"], [S.brit("biography/Jorge-Luis-Borges")]],
  ["work.waiting_for_godot", ["等待戈多", "Waiting for Godot"], "literature.western_modern", ["person.samuel_beckett"], "play", "20th_century_theater", "Beckett play anchor for waiting, repetition, minimal action, and stage form.", ["waiting", "repetition", "minimal_action"], ["stage_bare_form", "dialogue_loop"], ["theme.interpretation"], [S.brit("topic/Waiting-for-Godot")]],
  ["work.chungking_express", ["重庆森林", "Chungking Express"], "film.hongkong", ["person.wong_kar_wai"], "film", "Hong_Kong_cinema_1990s", "Wong Kar-wai film anchor for urban loneliness, pop music, and missed relation.", ["city_alienation", "pop_music", "missed_relation"], ["fragment", "urban_speed"], ["concept.city_alienation", "concept.time_memory"], [S.criterion("films/226-chungking-express")]],
  ["work.platform_jia", ["站台", "Platform"], "film.chinese", ["person.jia_zhangke"], "film", "contemporary_chinese_cinema", "Jia Zhangke film anchor for troupe life, social change, and long temporal span.", ["modernization_loss", "performance", "social_change"], ["duration", "place"], ["theme.modernization_loss", "concept.duration_film"], [S.bfi("features/jia-zhangke")]],
  ["work.after_life_koreeda", ["下一站，天国", "After Life"], "film.japanese", ["person.koreeda_hirokazu"], "film", "contemporary_Japanese_cinema", "Kore-eda film anchor for memory choice, afterlife premise, and ordinary detail.", ["memory", "choice", "ordinary_detail"], ["interview_form", "restraint"], ["theme.memory", "concept.restraint"], [S.criterion("films/27539-after-life")]],
  ["work.goodbye_dragon_inn", ["不散", "Goodbye Dragon Inn"], "film.taiwan", ["person.tsai_ming_liang"], "film", "contemporary_Taiwan_cinema", "Tsai Ming-liang film anchor for duration, cinema space, absence, and slow attention.", ["duration", "cinema_space", "absence"], ["slow_cinema", "long_take"], ["concept.slow_cinema", "concept.duration_film"], [S.bfi("features")]],
  ["work.campbells_soup_cans", ["Campbell's Soup Cans", "坎贝尔汤罐"], "art_history", ["person.warhol"], "artwork", "pop_art", "Warhol artwork anchor for repetition, commodity image, and Pop Art.", ["repetition", "commodity", "image"], ["seriality", "popular_culture"], ["theme.institution", "concept.medium_material"], [S.moma("collection/works/79809")]],
  ["work.composition_red_blue_yellow", ["Composition with Red Blue and Yellow", "红黄蓝构成"], "art_history", ["person.mondrian"], "artwork", "modernism_art", "Mondrian artwork anchor for abstraction, grid, color, and modern form.", ["abstraction", "grid", "color"], ["geometric_form", "balance"], ["concept.abstraction_art"], [S.moma("collection/works/79879")]],
  ["work.ways_of_seeing", ["观看之道", "Ways of Seeing"], "photography_history", ["person.john_berger"], "theory_text", "20th_century_image_theory", "John Berger text anchor for viewing, image circulation, and power relations.", ["viewing", "image", "power"], ["essay_form", "public_criticism"], ["theme.looking", "concept.gaze"], [S.brit("biography/John-Berger")]],
  ["work.eames_house", ["Eames House", "伊姆斯住宅"], "design_history", ["person.charles_eames", "person.ray_eames"], "building", "modern_design", "Eames House anchor for modern design, living, material assembly, and collaboration.", ["modern_design", "home", "material"], ["modular_structure", "collaboration"], ["concept.form_material_institution"], [S.official("Eames Foundation:Eames House", "https://eamesfoundation.org/house/eames-house/")]]
].map(([id, names, domain, creator_ids, work_type, period, factual_core, themes, style_axes, concepts, provenance]) => work({ id, names, domain, creator_ids, work_type, period, factual_core, themes, style_axes, concepts, safe_summary_units: themes, negative_moves: ["do_not_quote_long_text", "do_not_infer_private_intent"], boundary_notes: ["Use summary and metadata only."], provenance, transfer_scope: ["representative_work", "comparison", "concept_followup"] }));

const stage1bRelations = [
  ["relation.luo_zhihuzheye", "person_to_work", ["person.luo_dayou"], ["work.zhihuzheye"], ["singer_songwriter", "social_observation"], ["album_form"]],
  ["relation.luo_childhood", "person_to_work", ["person.luo_dayou"], ["work.childhood_luo"], ["youth_memory", "retrospection"], ["literal_childhood"]],
  ["relation.luo_lukang_modernization", "work_to_concept", ["work.lukang_town"], ["theme.modernization_loss", "concept.rural_urban_transition"], ["place_memory", "modernization"], ["nostalgia_only"]],
  ["relation.li_price_of_love", "person_to_work", ["person.li_zongsheng"], ["work.price_of_love"], ["ordinary_life", "relationship"], ["public_memory"]],
  ["relation.li_hills_memory", "person_to_work", ["person.li_zongsheng"], ["work.hills_li"], ["retrospection", "aging"], ["youth_song"]],
  ["relation.faye_red_bean_voice", "person_to_work", ["person.faye_wong"], ["work.red_bean_faye"], ["voice_persona", "restraint"], ["authorship"]],
  ["relation.beyond_ocean_rock", "person_to_work", ["person.beyond"], ["work.boundless_ocean_vast_skies"], ["Cantopop", "rock"], ["Mandopop"]],
  ["relation.lin_xi_lyricist_role", "person_to_concept", ["person.lin_xi"], ["concept.lyricist_role"], ["lyrics", "image"], ["performer_role"]],
  ["relation.song_poem_medium", "concept_to_concept", ["concept.song_vs_poem_medium"], ["concept.novel_poem_medium_difference"], ["medium", "compression"], ["same_medium"]],
  ["relation.album_single_form", "concept_to_concept", ["concept.album_vs_single"], ["work.album_jay", "work.fantasy_jay"], ["sequence", "release"], ["quality_rank"]],
  ["relation.lu_xun_public_critique", "person_to_concept", ["person.lu_xun"], ["concept.public_critique_intimate_anatomy"], ["public_critique", "vernacular"], ["intimate_style_only"]],
  ["relation.eileen_intimate_anatomy", "person_to_concept", ["person.eileen_chang"], ["concept.public_critique_intimate_anatomy", "concept.cold_affect"], ["intimate_relation", "cool_detail"], ["public_satire"]],
  ["relation.shen_border_town", "person_to_work", ["person.shen_congwen"], ["work.border_town"], ["rural_locality", "modernity"], ["urban_modernity"]],
  ["relation.lao_she_camel", "person_to_work", ["person.lao_she"], ["work.camel_xiangzi"], ["city", "labor"], ["rural_memory"]],
  ["relation.yu_hua_to_live", "person_to_work", ["person.yu_hua"], ["work.to_live_yu_hua"], ["survival", "history"], ["nostalgia"]],
  ["relation.mo_yan_red_sorghum", "person_to_work", ["person.mo_yan"], ["work.red_sorghum"], ["rural_history", "sensory"], ["urban_modernity"]],
  ["relation.yu_hua_mo_yan_contrast", "contrast_foil", ["person.yu_hua"], ["person.mo_yan"], ["contemporary_chinese_literature"], ["plain_survival", "mythic_sensory"]],
  ["relation.murasaki_genji_mono", "work_to_concept", ["work.tale_of_genji"], ["concept.mono_no_aware", "concept.seasonality"], ["court_life", "transience"], ["weather_only"]],
  ["relation.basho_haiku_kigo", "person_to_concept", ["person.matsuo_basho"], ["concept.haiku", "concept.kigo_seasonality"], ["haiku", "season"], ["short_poem_any"]],
  ["relation.soseki_cat_viewpoint", "work_to_concept", ["work.i_am_a_cat"], ["concept.narrator_point_of_view", "concept.irony_literary"], ["observer", "satire"], ["author_biography"]],
  ["relation.tanizaki_shadow_wabi", "work_to_concept", ["work.in_praise_of_shadows"], ["concept.wabi_sabi", "concept.negative_space"], ["shadow", "material"], ["minimalism_same"]],
  ["relation.kawabata_snow_country_mujo", "work_to_concept", ["work.snow_country"], ["concept.mujo_impermanence", "concept.seasonality"], ["season", "impermanence"], ["sadness_only"]],
  ["relation.dazai_no_longer_human", "person_to_work", ["person.dazai_osamu"], ["work.no_longer_human"], ["interiority", "alienation"], ["diagnosis"]],
  ["relation.murakami_kafka_city", "work_to_concept", ["work.kafka_on_the_shore"], ["concept.city_loneliness", "theme.memory"], ["city", "memory"], ["all_city"]],
  ["relation.modernism_stream", "concept_to_concept", ["period.modernist_literature"], ["concept.stream_of_consciousness", "concept.fragmentation_modernism"], ["form", "consciousness"], ["difficulty_only"]],
  ["relation.woolf_lighthouse_time", "work_to_concept", ["work.to_the_lighthouse"], ["concept.time_memory", "concept.stream_of_consciousness"], ["time", "interiority"], ["plot_only"]],
  ["relation.eliot_waste_fragment", "work_to_concept", ["work.the_waste_land"], ["concept.fragmentation_modernism"], ["fragment", "allusion"], ["incoherence"]],
  ["relation.borges_ficciones_reference", "work_to_concept", ["work.ficciones"], ["concept.reference", "theme.interpretation"], ["fiction", "reference"], ["mere_puzzle"]],
  ["relation.beckett_godot_waiting", "person_to_work", ["person.samuel_beckett"], ["work.waiting_for_godot"], ["waiting", "stage_form"], ["meaningless"]],
  ["relation.film_duration_slow", "concept_to_concept", ["concept.duration_film"], ["concept.slow_cinema"], ["duration", "attention"], ["film_length_only"]],
  ["relation.hou_tsai_slow_contrast", "contrast_foil", ["person.hou_hsiao_hsien"], ["person.tsai_ming_liang"], ["slow_cinema", "Taiwan_cinema"], ["history_space", "empty_theater_space"]],
  ["relation.tsai_goodbye_duration", "person_to_work", ["person.tsai_ming_liang"], ["work.goodbye_dragon_inn"], ["duration", "absence"], ["plot_speed"]],
  ["relation.wong_chungking_city", "work_to_concept", ["work.chungking_express"], ["concept.city_alienation", "concept.time_memory"], ["city", "missed_relation"], ["tourism"]],
  ["relation.jia_platform_change", "work_to_concept", ["work.platform_jia"], ["theme.modernization_loss", "concept.duration_film"], ["social_change", "duration"], ["mood_only"]],
  ["relation.koreeda_after_life_memory", "work_to_concept", ["work.after_life_koreeda"], ["theme.memory", "concept.restraint"], ["memory_choice", "ordinary_detail"], ["afterlife_doctrine"]],
  ["relation.berger_seeing_gaze", "person_to_work", ["person.john_berger"], ["work.ways_of_seeing"], ["viewing", "power"], ["neutral_looking"]],
  ["relation.warhol_soup_commodity", "work_to_concept", ["work.campbells_soup_cans"], ["theme.institution", "concept.medium_material"], ["commodity_image", "repetition"], ["private_emotion"]],
  ["relation.mondrian_abstraction", "work_to_concept", ["work.composition_red_blue_yellow"], ["concept.abstraction_art"], ["grid", "color"], ["no_subject"]],
  ["relation.eames_design_material", "work_to_concept", ["work.eames_house"], ["concept.form_material_institution", "concept.design_good_principles"], ["home", "material"], ["style_only"]]
].map(([id, relation_type, source_ids, target_ids, shared_axes, contrast_axes]) => relation({ id, names: [id.replace("relation.", "").replaceAll("_", " ")], domain: "relation_graph", relation_type, source_ids, target_ids, shared_axes, contrast_axes, licensed_verbs: ["helps explain", "is often read through", "contrasts with"], provenance: [S.official("R24 curated public-source synthesis", "https://www.britannica.com/")], transfer_scope: ["comparison", "concept_followup", "topic_reentry"] }));

const stage2aPersons = [
  person({ id: "person.galileo", names: ["伽利略", "Galileo Galilei"], domain: "science.history", roles: ["scientist", "astronomer"], period: "early_modern_science", regions_languages: ["Italy", "Latin", "Italian"], representative_works: ["work.dialogue_two_chief_world_systems"], themes: ["observation", "experiment", "scientific_revolution"], style_axes: ["mathematization", "telescope"], related_concepts: ["concept.observation_vs_experiment", "concept.scientific_revolution"], provenance: [S.brit("biography/Galileo-Galilei")], transfer_scope: ["science_history", "evidence_chain"] }),
  person({ id: "person.isaac_newton", names: ["牛顿", "Isaac Newton"], domain: "science.history", roles: ["mathematician", "physicist"], period: "early_modern_science", regions_languages: ["England", "Latin", "English"], representative_works: ["work.principia"], themes: ["mechanics", "mathematical_model"], style_axes: ["law_form", "model"], related_concepts: ["concept.model_vs_theory", "concept.evidence_chain"], provenance: [S.brit("biography/Isaac-Newton")], transfer_scope: ["science_history", "model_theory"] }),
  person({ id: "person.marie_curie", names: ["玛丽·居里", "Marie Curie"], domain: "science.history", roles: ["physicist", "chemist"], period: "modern_science", regions_languages: ["Poland", "France"], representative_works: ["work.radioactivity_research_anchor"], themes: ["radioactivity", "laboratory", "evidence"], style_axes: ["experimental_work", "measurement"], related_concepts: ["concept.evidence_chain"], provenance: [S.nobel("prizes/physics/1903/marie-curie/facts/")], transfer_scope: ["science_history", "experiment", "women_in_science"] }),
  person({ id: "person.albert_einstein", names: ["爱因斯坦", "Albert Einstein"], domain: "science.history", roles: ["physicist"], period: "modern_science", regions_languages: ["Germany", "Switzerland", "United States", "German"], representative_works: ["work.relativity_1905_anchor"], themes: ["relativity", "model", "theory"], style_axes: ["conceptual_model", "mathematical_physics"], related_concepts: ["concept.relativity", "concept.model_vs_theory"], provenance: [S.nobel("prizes/physics/1921/einstein/facts/")], transfer_scope: ["science_history", "model_theory"] }),
  person({ id: "person.thomas_kuhn", names: ["托马斯·库恩", "Thomas Kuhn"], domain: "science.history", roles: ["historian of science", "philosopher"], period: "20th_century", regions_languages: ["United States", "English"], representative_works: ["work.structure_scientific_revolutions"], themes: ["paradigm", "normal_science", "scientific_revolution"], style_axes: ["history_of_science", "conceptual_change"], related_concepts: ["concept.paradigm", "concept.normal_science", "concept.scientific_revolution"], provenance: [S.sep("thomas-kuhn")], transfer_scope: ["science_history", "paradigm_questions"] }),
  person({ id: "person.kevin_lynch", names: ["凯文·林奇", "Kevin Lynch"], domain: "urban", roles: ["urban planner", "writer"], period: "20th_century", regions_languages: ["United States", "English"], representative_works: ["work.image_of_the_city"], themes: ["city_image", "legibility", "urban_form"], style_axes: ["paths", "edges", "nodes"], related_concepts: ["concept.walkability", "concept.lived_vs_planned_city"], provenance: [S.brit("topic/urban-planning")], transfer_scope: ["city", "design", "film_space"] }),
  person({ id: "person.henri_lefebvre", names: ["亨利·列斐伏尔", "Henri Lefebvre"], domain: "urban", roles: ["philosopher", "sociologist"], period: "20th_century", regions_languages: ["France", "French"], representative_works: ["work.production_of_space"], themes: ["space", "everyday_life", "urban"], style_axes: ["social_space", "lived_space"], related_concepts: ["concept.lived_vs_planned_city", "concept.public_space"], provenance: [S.brit("topic/sociology")], transfer_scope: ["urban", "space_theory", "city_film_bridge"] }),
  person({ id: "person.brillat_savarin", names: ["布里亚-萨瓦兰", "Brillat-Savarin"], domain: "food", roles: ["food writer"], period: "19th_century", regions_languages: ["France", "French"], representative_works: ["work.physiology_of_taste"], themes: ["taste", "gastronomy", "daily_culture"], style_axes: ["aphoristic_food_thought"], related_concepts: ["concept.taste", "concept.recipe_vs_practice"], provenance: [S.brit("biography/Anthelme-Brillat-Savarin")], transfer_scope: ["food", "taste", "daily_culture"] }),
  person({ id: "person.hla_hart", names: ["H. L. A. Hart", "哈特"], domain: "law_boundary", roles: ["legal philosopher"], period: "20th_century", regions_languages: ["Britain", "English"], representative_works: ["work.concept_of_law"], themes: ["legal_positivism", "rule", "law"], style_axes: ["conceptual_analysis"], related_concepts: ["concept.legal_positivism", "concept.rule_of_law"], provenance: [S.sep("legal-positivism")], transfer_scope: ["jurisprudence", "rule_questions"] }),
  person({ id: "person.john_rawls", names: ["约翰·罗尔斯", "John Rawls"], domain: "law_boundary", roles: ["political philosopher"], period: "20th_century", regions_languages: ["United States", "English"], representative_works: ["work.theory_of_justice"], themes: ["justice", "fairness", "rights"], style_axes: ["contractarian_reasoning"], related_concepts: ["concept.fairness", "concept.rights"], provenance: [S.sep("rawls")], transfer_scope: ["justice", "political_philosophy", "law_boundary"] }),
  person({ id: "person.ronald_dworkin", names: ["罗纳德·德沃金", "Ronald Dworkin"], domain: "law_boundary", roles: ["legal philosopher"], period: "20th_century", regions_languages: ["United States", "Britain", "English"], representative_works: ["work.taking_rights_seriously"], themes: ["rights", "hard_cases", "interpretation"], style_axes: ["principle_reasoning"], related_concepts: ["concept.hard_cases", "concept.rights"], provenance: [S.sep("legal-interpretivism")], transfer_scope: ["jurisprudence", "rights", "hard_cases"] }),
  person({ id: "person.john_dewey", names: ["约翰·杜威", "John Dewey"], domain: "education", roles: ["philosopher", "educator"], period: "20th_century", regions_languages: ["United States", "English"], representative_works: ["work.experience_and_education"], themes: ["learning_by_doing", "inquiry", "democracy"], style_axes: ["experience", "reflection"], related_concepts: ["concept.learning_by_doing", "concept.inquiry_learning"], provenance: [S.brit("biography/John-Dewey")], transfer_scope: ["education", "learning", "feedback"] }),
  person({ id: "person.maria_montessori", names: ["蒙台梭利", "Maria Montessori"], domain: "education", roles: ["physician", "educator"], period: "20th_century", regions_languages: ["Italy", "Italian"], representative_works: ["work.montessori_method"], themes: ["prepared_environment", "child_development", "practice"], style_axes: ["materials", "independence"], related_concepts: ["concept.prepared_environment", "concept.scaffolding_learning"], provenance: [S.brit("biography/Maria-Montessori")], transfer_scope: ["education", "learning_environment"] }),
  person({ id: "person.lev_vygotsky", names: ["维果茨基", "Lev Vygotsky"], domain: "education", roles: ["psychologist"], period: "20th_century", regions_languages: ["Russia", "Russian"], representative_works: ["work.thought_and_language"], themes: ["social_learning", "language", "development"], style_axes: ["scaffolding", "social_context"], related_concepts: ["concept.social_learning", "concept.scaffolding_learning"], provenance: [S.brit("biography/Lev-Semyonovich-Vygotsky")], transfer_scope: ["education", "language", "learning"] }),
  person({ id: "person.adam_smith", names: ["亚当·斯密", "Adam Smith"], domain: "economy", roles: ["moral philosopher", "economist"], period: "18th_century", regions_languages: ["Scotland", "English"], representative_works: ["work.wealth_of_nations"], themes: ["market", "division_of_labor", "moral_philosophy"], style_axes: ["institutional_analysis"], related_concepts: ["concept.market", "concept.division_of_labor"], provenance: [S.brit("biography/Adam-Smith")], transfer_scope: ["economy", "institutions", "labor"] }),
  person({ id: "person.karl_polanyi", names: ["卡尔·波兰尼", "Karl Polanyi"], domain: "economy", roles: ["economic historian"], period: "20th_century", regions_languages: ["Hungary", "Britain", "English"], representative_works: ["work.great_transformation"], themes: ["embeddedness", "market_society", "institution"], style_axes: ["historical_argument"], related_concepts: ["concept.embeddedness", "theme.institution"], provenance: [S.brit("biography/Karl-Polanyi")], transfer_scope: ["economy", "institutions", "history"] }),
  person({ id: "person.elinor_ostrom", names: ["埃莉诺·奥斯特罗姆", "Elinor Ostrom"], domain: "economy", roles: ["political economist"], period: "20th_century", regions_languages: ["United States", "English"], representative_works: ["work.governing_the_commons"], themes: ["commons", "governance", "rules"], style_axes: ["institutional_analysis", "empirical_cases"], related_concepts: ["concept.commons", "concept.governance_rules"], provenance: [S.nobel("prizes/economic-sciences/2009/ostrom/facts/")], transfer_scope: ["economy", "institutions", "governance"] }),
  person({ id: "person.alan_turing", names: ["图灵", "Alan Turing"], domain: "technology", roles: ["mathematician", "computer scientist"], period: "20th_century", regions_languages: ["Britain", "English"], representative_works: ["work.on_computable_numbers"], themes: ["computation", "machine", "formal_model"], style_axes: ["formal_reasoning"], related_concepts: ["concept.computation", "concept.model_vs_theory"], provenance: [S.brit("biography/Alan-Turing")], transfer_scope: ["technology", "computing_culture"] }),
  person({ id: "person.douglas_engelbart", names: ["道格拉斯·恩格尔巴特", "Douglas Engelbart"], domain: "technology", roles: ["inventor", "computer engineer"], period: "20th_century", regions_languages: ["United States", "English"], representative_works: ["work.mother_of_all_demos"], themes: ["augmentation", "interface", "collaboration"], style_axes: ["demo", "human_computer_interaction"], related_concepts: ["concept.augmentation", "concept.interface"], provenance: [S.acm("award_winners/engelbart_5078811.cfm")], transfer_scope: ["technology", "interface", "tool_medium"] }),
  person({ id: "person.alan_kay", names: ["艾伦·凯", "Alan Kay"], domain: "technology", roles: ["computer scientist"], period: "20th_century", regions_languages: ["United States", "English"], representative_works: ["work.dynabook_concept"], themes: ["personal_computing", "learning", "interface"], style_axes: ["medium", "child_learning"], related_concepts: ["concept.tool_vs_medium", "concept.interface"], provenance: [S.acm("award_winners/kay_3972189.cfm")], transfer_scope: ["technology", "education", "interface"] }),
  person({ id: "person.tim_berners_lee", names: ["蒂姆·伯纳斯-李", "Tim Berners-Lee"], domain: "technology", roles: ["computer scientist"], period: "late_20th_century", regions_languages: ["Britain", "English"], representative_works: ["work.world_wide_web_anchor"], themes: ["web", "hypertext", "open_protocol"], style_axes: ["protocol", "linking"], related_concepts: ["concept.hypertext", "concept.open_protocol"], provenance: [S.official("W3C:Tim Berners-Lee", "https://www.w3.org/People/Berners-Lee/")], transfer_scope: ["technology", "web", "interface"] })
];

const stage2aConcepts = [
  concept({ id: "concept.relativity", names: ["相对论", "relativity"], domain: "science.history", factual_core: "Physics concept family about space, time, motion, and gravitation models.", definition_units: ["space", "time", "motion", "gravitation"], examples: ["special relativity", "general relativity"], non_examples: ["everything is subjective"], related_concepts: ["concept.model_vs_theory"], common_misreadings: ["relativity_equals_any_opinion"], negative_moves: ["do_not_use_for_moral_relativism"], boundary_notes: ["No current physics claim beyond card support."], provenance: [S.nobel("prizes/physics/1921/einstein/facts/")], transfer_scope: ["science_history", "model_theory"] }),
  concept({ id: "concept.paradigm", names: ["范式", "paradigm"], domain: "science.history", factual_core: "Kuhn-linked frame of shared problems, methods, exemplars, and standards.", definition_units: ["shared_problems", "methods", "exemplars", "standards"], examples: ["normal science frame"], non_examples: ["fashion word"], related_concepts: ["concept.normal_science", "concept.scientific_revolution"], common_misreadings: ["paradigm_equals_any_view"], negative_moves: ["do_not_use_as_jargon_filler"], boundary_notes: ["Use for science-history framing, not arbitrary trend talk."], provenance: [S.sep("thomas-kuhn")], transfer_scope: ["science_history", "knowledge_change"] }),
  concept({ id: "concept.normal_science", names: ["常规科学", "normal science"], domain: "science.history", factual_core: "Kuhn-linked research work conducted within a paradigm's accepted problems and standards.", definition_units: ["paradigm", "puzzle_solving", "standards"], examples: ["research under accepted model"], non_examples: ["unimportant science"], related_concepts: ["concept.paradigm"], common_misreadings: ["normal_equals_boring"], negative_moves: ["do_not_devalue_regular_research"], boundary_notes: ["Keep descriptive, not value judgment."], provenance: [S.sep("thomas-kuhn")], transfer_scope: ["science_history", "work_process"] }),
  concept({ id: "concept.scientific_revolution", names: ["科学革命", "scientific revolution"], domain: "science.history", factual_core: "Change in scientific framework, method, or explanatory structure.", definition_units: ["framework_change", "method", "explanation"], examples: ["Kuhn paradigm shift", "early modern astronomy"], non_examples: ["any discovery"], related_concepts: ["concept.paradigm", "concept.evidence_chain"], common_misreadings: ["revolution_equals_speed"], negative_moves: ["do_not_call_every_update_revolution"], boundary_notes: ["Needs historical scope."], provenance: [S.sep("thomas-kuhn")], transfer_scope: ["science_history", "model_change"] }),
  concept({ id: "concept.observation_vs_experiment", names: ["观察与实验", "observation vs experiment"], domain: "science.history", factual_core: "Contrast between careful seeing/measurement and controlled intervention.", definition_units: ["measurement", "seeing", "control", "intervention"], examples: ["telescope observation", "lab experiment"], non_examples: ["opinion"], related_concepts: ["concept.evidence_chain"], common_misreadings: ["observation_equals_passive"], negative_moves: ["do_not_treat_anecdote_as_experiment"], boundary_notes: ["No current lab advice."], provenance: [S.brit("science/scientific-method")], transfer_scope: ["science", "education", "evidence"] }),
  concept({ id: "concept.model_vs_theory", names: ["模型与理论", "model vs theory"], domain: "science.history", factual_core: "Contrast between simplified representation and broader explanatory framework.", definition_units: ["representation", "framework", "prediction", "scope"], examples: ["physics model", "economic model"], non_examples: ["mere picture"], related_concepts: ["concept.evidence_chain"], common_misreadings: ["model_equals_truth"], negative_moves: ["do_not_overstate_model"], boundary_notes: ["Preserve scope and uncertainty."], provenance: [S.brit("science/scientific-modeling")], transfer_scope: ["science", "economy", "technology"] }),
  concept({ id: "concept.evidence_chain", names: ["证据链", "evidence chain"], domain: "science.history", factual_core: "Linked support among observation, measurement, source, inference, and claim.", definition_units: ["observation", "measurement", "source", "inference"], examples: ["scientific claim support"], non_examples: ["single unsourced fact"], related_concepts: ["concept.truth_claim"], common_misreadings: ["evidence_equals_one_example"], negative_moves: ["do_not_increase_confidence_without_support"], boundary_notes: ["Use for source-sensitive claims."], provenance: [S.brit("science/scientific-method")], transfer_scope: ["science", "law_boundary", "history"] }),
  concept({ id: "concept.walkability", names: ["可步行性", "walkability"], domain: "urban", factual_core: "Urban quality involving distance, safety, access, mixed use, and pedestrian experience.", definition_units: ["distance", "access", "pedestrian_experience"], examples: ["sidewalk network", "nearby mixed uses"], non_examples: ["tourist prettiness"], related_concepts: ["concept.city_street", "concept.public_space"], common_misreadings: ["walkability_equals_beautiful_street"], negative_moves: ["do_not_give_local_travel_advice"], boundary_notes: ["No current zoning or travel recommendation."], provenance: [S.brit("topic/urban-planning")], transfer_scope: ["urban", "design", "film_street"] }),
  concept({ id: "concept.density_diversity", names: ["密度与多样性", "density and diversity"], domain: "urban", factual_core: "Urban relation between concentration, mixed uses, people, and time patterns.", definition_units: ["concentration", "mixed_use", "people", "time"], examples: ["mixed street life"], non_examples: ["crowding alone"], related_concepts: ["concept.diversity_city", "concept.public_space"], common_misreadings: ["density_equals_good_by_default"], negative_moves: ["do_not_ignore_displacement"], boundary_notes: ["Urban claims require local scope."], provenance: [S.brit("biography/Jane-Jacobs")], transfer_scope: ["urban", "economy", "film"] }),
  concept({ id: "concept.lived_vs_planned_city", names: ["生活城市与规划城市", "lived city vs planned city"], domain: "urban", factual_core: "Contrast between everyday use of space and top-down design representation.", definition_units: ["everyday_use", "plan", "space", "practice"], examples: ["street use", "master plan"], non_examples: ["anti-planning claim"], related_concepts: ["concept.city_street", "concept.public_space"], common_misreadings: ["planned_city_bad_by_default"], negative_moves: ["do_not_reject_planning_as_such"], boundary_notes: ["Keep policy claims bounded."], provenance: [S.brit("topic/urban-planning")], transfer_scope: ["urban", "design", "film"] }),
  concept({ id: "concept.taste", names: ["味觉与品味", "taste"], domain: "food", factual_core: "Taste as sensory judgment and cultural preference shaped by texture, memory, and practice.", definition_units: ["sensory", "preference", "memory", "practice"], examples: ["taste memory", "seasoning judgment"], non_examples: ["objective ranking only"], related_concepts: ["concept.texture_food", "concept.food_memory"], common_misreadings: ["taste_equals_expensive"], negative_moves: ["do_not_medicalize_food_taste"], boundary_notes: ["No nutrition or medical advice."], provenance: [S.brit("topic/gastronomy")], transfer_scope: ["food", "aesthetic_judgment", "memory"] }),
  concept({ id: "concept.texture_food", names: ["口感", "texture"], domain: "food", factual_core: "Food quality involving mouthfeel, structure, moisture, resistance, and temperature.", definition_units: ["mouthfeel", "structure", "moisture", "resistance"], examples: ["crisp", "tender", "silky"], non_examples: ["flavor only"], related_concepts: ["concept.heat_control", "concept.timing_cooking"], common_misreadings: ["texture_equals_taste"], negative_moves: ["do_not_make_safety_claim"], boundary_notes: ["Use as craft concept only."], provenance: [S.brit("topic/cooking")], transfer_scope: ["food", "craft", "aesthetic_comparison"] }),
  concept({ id: "concept.timing_cooking", names: ["烹饪时机", "cooking timing"], domain: "food", factual_core: "Process judgment about sequence, duration, heat, rest, and readiness.", definition_units: ["sequence", "duration", "heat", "readiness"], examples: ["resting dough", "finishing sauce"], non_examples: ["clock time only"], related_concepts: ["concept.heat_control"], common_misreadings: ["timing_equals_minutes_only"], negative_moves: ["do_not_certify_food_safety"], boundary_notes: ["No food-safety certification."], provenance: [S.brit("topic/cooking")], transfer_scope: ["food", "music_timing", "film_pacing"] }),
  concept({ id: "concept.fermentation", names: ["发酵", "fermentation"], domain: "food", factual_core: "Food process involving microbial transformation, time, flavor, and preservation.", definition_units: ["microbial_process", "time", "flavor", "preservation"], examples: ["bread", "yogurt", "pickles"], non_examples: ["rotting by default"], related_concepts: ["concept.timing_cooking"], common_misreadings: ["fermentation_equals_spoilage"], negative_moves: ["do_not_give_food_safety_instructions"], boundary_notes: ["No safety or medical claims."], provenance: [S.brit("science/fermentation")], transfer_scope: ["food", "time_process", "daily_culture"] }),
  concept({ id: "concept.seasoning", names: ["调味", "seasoning"], domain: "food", factual_core: "Adjustment of salt, acid, aroma, fat, heat, and balance in cooking.", definition_units: ["salt", "acid", "aroma", "balance"], examples: ["finishing salt", "acid balance"], non_examples: ["covering bad ingredients"], related_concepts: ["concept.taste", "concept.recipe_vs_practice"], common_misreadings: ["seasoning_equals_spicy"], negative_moves: ["do_not_prescribe_health_diet"], boundary_notes: ["Craft concept, not medical nutrition."], provenance: [S.brit("topic/cooking")], transfer_scope: ["food", "craft", "analogy"] }),
  concept({ id: "concept.home_cooking", names: ["家常烹饪", "home cooking"], domain: "food", factual_core: "Daily cooking practice shaped by habit, family memory, economy, and available materials.", definition_units: ["habit", "memory", "materials", "economy"], examples: ["family meal", "leftover practice"], non_examples: ["restaurant style"], related_concepts: ["concept.food_memory", "concept.recipe_vs_practice"], common_misreadings: ["home_cooking_equals_simple"], negative_moves: ["do_not_romanticize_domestic_labor"], boundary_notes: ["Avoid medical or moral judgment."], provenance: [S.brit("topic/cooking")], transfer_scope: ["food", "memory", "daily_life"] }),
  concept({ id: "concept.recipe_vs_practice", names: ["菜谱与实践", "recipe vs practice"], domain: "food", factual_core: "Contrast between written instruction and embodied adjustment in cooking.", definition_units: ["instruction", "adjustment", "skill", "context"], examples: ["recipe step", "experienced adjustment"], non_examples: ["rule versus chaos"], related_concepts: ["concept.timing_cooking", "concept.heat_control"], common_misreadings: ["recipe_equals_result"], negative_moves: ["do_not_turn_into_exact_advice"], boundary_notes: ["Use as process concept."], provenance: [S.brit("topic/cooking")], transfer_scope: ["food", "education", "law_rule_application"] }),
  concept({ id: "concept.food_memory", names: ["食物记忆", "food memory"], domain: "food", factual_core: "Relation among taste, smell, place, family, and remembered time.", definition_units: ["taste", "smell", "place", "memory"], examples: ["childhood dish memory"], non_examples: ["nutrition fact"], related_concepts: ["theme.memory", "concept.home_cooking"], common_misreadings: ["food_memory_equals_recipe"], negative_moves: ["do_not_psychologize_user"], boundary_notes: ["Use light uptake for personal disclosures."], provenance: [S.sep("memory")], transfer_scope: ["food", "literature", "film"] }),
  concept({ id: "concept.rule_of_law", names: ["法治", "rule of law"], domain: "law_boundary", factual_core: "Legal-political concept about rules, authority, limits, and accountable procedure.", definition_units: ["rules", "authority", "limits", "procedure"], examples: ["general legal principle"], non_examples: ["current legal advice"], related_concepts: ["concept.rule_application_precedent"], common_misreadings: ["rule_of_law_equals_one_law"], negative_moves: ["do_not_give_jurisdiction_specific_claim"], boundary_notes: ["Jurisprudence only unless current sources are explicitly invoked."], provenance: [S.sep("rule-of-law")], transfer_scope: ["law_boundary", "institutions", "justice"] }),
  concept({ id: "concept.hard_cases", names: ["疑难案件", "hard cases"], domain: "law_boundary", factual_core: "Legal-theory cases where rule application is contested by interpretation, principle, or fact.", definition_units: ["rule", "interpretation", "principle", "fact"], examples: ["conflicting legal principles"], non_examples: ["simple difficult question"], related_concepts: ["concept.rule_application_precedent", "concept.rights"], common_misreadings: ["hard_case_equals_famous_case"], negative_moves: ["do_not_predict_current_case"], boundary_notes: ["No legal advice; preserve jurisdiction/date caveat."], provenance: [S.sep("legal-reas-interpret")], transfer_scope: ["law_boundary", "argument", "ethics"] }),
  concept({ id: "concept.rights", names: ["权利", "rights"], domain: "law_boundary", factual_core: "Normative or legal claim about protected interests, duties, and institutional recognition.", definition_units: ["protected_interest", "duty", "institution"], examples: ["rights claim in theory"], non_examples: ["personal preference"], related_concepts: ["concept.fairness", "concept.rule_of_law"], common_misreadings: ["rights_equals_any_desire"], negative_moves: ["do_not_state_current_right_without_source"], boundary_notes: ["Static cards do not determine current legal rights."], provenance: [S.sep("rights")], transfer_scope: ["law_boundary", "justice", "political_philosophy"] }),
  concept({ id: "concept.legal_positivism", names: ["法律实证主义", "legal positivism"], domain: "law_boundary", factual_core: "Jurisprudential view family separating legal validity from moral merit in specific ways.", definition_units: ["validity", "source", "morality_distinction"], examples: ["Hart debate"], non_examples: ["law has no morality"], related_concepts: ["concept.rule_of_law"], common_misreadings: ["positivism_equals_supporting_bad_law"], negative_moves: ["do_not_simplify_into_moral_indifference"], boundary_notes: ["Theory only; no legal advice."], provenance: [S.sep("legal-positivism")], transfer_scope: ["law_boundary", "philosophy", "institutions"] }),
  concept({ id: "concept.fairness", names: ["公平", "fairness"], domain: "law_boundary", factual_core: "Normative concept about fair terms, distribution, procedure, and justification.", definition_units: ["terms", "distribution", "procedure", "justification"], examples: ["justice as fairness"], non_examples: ["everyone gets same outcome"], related_concepts: ["concept.rights"], common_misreadings: ["fairness_equals_equality_only"], negative_moves: ["do_not_solve_policy_question_from_static_card"], boundary_notes: ["Keep philosophical scope."], provenance: [S.sep("rawls")], transfer_scope: ["law_boundary", "education", "economy"] }),
  concept({ id: "concept.jurisdiction_date_boundary", names: ["辖区日期程序边界", "jurisdiction date procedure boundary"], domain: "law_boundary", factual_core: "Legal safety boundary requiring jurisdiction, date, procedure, and current authority for legal claims.", definition_units: ["jurisdiction", "date", "procedure", "current_authority"], examples: ["legal information caveat"], non_examples: ["universal legal answer"], related_concepts: ["theme.boundary"], common_misreadings: ["boundary_equals_refusal"], negative_moves: ["do_not_answer_current_law_from_static_card"], boundary_notes: ["Always preserve in legal/current institutional questions."], provenance: [S.official("Oyez:about", "https://www.oyez.org/about")], transfer_scope: ["law_boundary", "source_sensitive_answers"] }),
  concept({ id: "concept.working_memory", names: ["工作记忆", "working memory"], domain: "psychology_boundary", factual_core: "Cognitive concept for temporarily holding and manipulating information.", definition_units: ["temporary_holding", "manipulation", "attention"], examples: ["remembering a number briefly"], non_examples: ["all intelligence"], related_concepts: ["theme.memory"], common_misreadings: ["working_memory_equals_personality"], negative_moves: ["do_not_diagnose_user"], boundary_notes: ["Concept-level only; no clinical assessment."], provenance: [S.official("APA:memory", "https://dictionary.apa.org/memory")], transfer_scope: ["psychology_boundary", "education", "conversation_memory"] }),
  concept({ id: "concept.social_rejection", names: ["社会拒绝", "social rejection"], domain: "psychology_boundary", factual_core: "Social experience of exclusion, nonacceptance, or relational loss.", definition_units: ["exclusion", "nonacceptance", "relation"], examples: ["group exclusion"], non_examples: ["single disagreement"], related_concepts: ["theme.refusal", "concept.emotion_regulation"], common_misreadings: ["rejection_equals_personal_defect"], negative_moves: ["do_not_diagnose_or_blame"], boundary_notes: ["Use care boundary; avoid therapy imitation."], provenance: [S.official("APA:social rejection", "https://dictionary.apa.org/rejection")], transfer_scope: ["care_boundary", "literature", "social_life"] }),
  concept({ id: "concept.emotion_regulation", names: ["情绪调节", "emotion regulation"], domain: "psychology_boundary", factual_core: "Psychology concept for how emotion is noticed, shaped, expressed, or managed.", definition_units: ["notice", "shape", "express", "manage"], examples: ["naming emotion", "taking distance"], non_examples: ["suppress everything"], related_concepts: ["concept.care_boundary"], common_misreadings: ["regulation_equals_control_all_feeling"], negative_moves: ["do_not_give_treatment_plan"], boundary_notes: ["No diagnosis or treatment plan."], provenance: [S.official("APA:emotion regulation", "https://dictionary.apa.org/emotion-regulation")], transfer_scope: ["care_boundary", "education", "affective_disclosure"] }),
  concept({ id: "concept.care_boundary", names: ["关怀边界", "care boundary"], domain: "psychology_boundary", factual_core: "Safety boundary for supportive language without diagnosis, treatment, or false intimacy.", definition_units: ["support", "scope", "no_diagnosis", "referral_when_needed"], examples: ["light acknowledgment", "scope caveat"], non_examples: ["therapy plan"], related_concepts: ["theme.boundary"], common_misreadings: ["care_equals_clinical_advice"], negative_moves: ["do_not_imitate_clinician", "do_not_over_personify"], boundary_notes: ["High-stakes distress needs appropriate safety path outside KB cards."], provenance: [S.official("APA:psychotherapy", "https://dictionary.apa.org/psychotherapy")], transfer_scope: ["psychology_boundary", "affective_disclosure", "identity_boundary"] }),
  concept({ id: "concept.burnout", names: ["耗竭", "burnout"], domain: "psychology_boundary", factual_core: "Work-related exhaustion concept; static card is not diagnostic.", definition_units: ["exhaustion", "work_context", "reduced_capacity"], examples: ["work fatigue discussion"], non_examples: ["clinical diagnosis by chat"], related_concepts: ["concept.care_boundary"], common_misreadings: ["burnout_equals_any_tiredness"], negative_moves: ["do_not_diagnose_user"], boundary_notes: ["No diagnosis or treatment; encourage professional support when needed."], provenance: [S.official("APA:burnout", "https://dictionary.apa.org/burnout")], transfer_scope: ["care_boundary", "work_life", "education"] }),
  concept({ id: "concept.no_diagnosis_boundary", names: ["不诊断边界", "no diagnosis boundary"], domain: "psychology_boundary", factual_core: "Boundary preventing static cultural cards from diagnosing users or prescribing treatment.", definition_units: ["no_diagnosis", "no_treatment_plan", "scope"], examples: ["concept explanation only"], non_examples: ["clinical assessment"], related_concepts: ["concept.care_boundary"], common_misreadings: ["boundary_equals_no_help"], negative_moves: ["do_not_assign_condition", "do_not_prescribe_treatment"], boundary_notes: ["Offer general information and suggest qualified help when appropriate."], provenance: [S.official("APA:diagnosis", "https://dictionary.apa.org/diagnosis")], transfer_scope: ["psychology_boundary", "care", "safety"] }),
  concept({ id: "concept.affective_disclosure_boundary", names: ["情感表达回应边界", "affective disclosure response boundary"], domain: "psychology_boundary", factual_core: "Dialogue boundary for receiving personal feeling without diagnosis or excessive intimacy.", definition_units: ["acknowledge", "scope", "no_diagnosis", "light_response"], examples: ["personal association with a book"], non_examples: ["therapy interpretation"], related_concepts: ["concept.care_boundary"], common_misreadings: ["uptake_equals_analysis"], negative_moves: ["do_not_psychologize_user", "do_not_ignore_meaningful_disclosure"], boundary_notes: ["Acknowledge the stated object or feeling; avoid clinical framing."], provenance: [S.official("APA:emotion", "https://dictionary.apa.org/emotion")], transfer_scope: ["dialogue", "literature", "music"] }),
  concept({ id: "concept.learning_by_doing", names: ["做中学", "learning by doing"], domain: "education", factual_core: "Learning concept linking action, reflection, problem, and feedback.", definition_units: ["action", "reflection", "problem", "feedback"], examples: ["project activity"], non_examples: ["activity without reflection"], related_concepts: ["concept.feedback_learning", "concept.inquiry_learning"], common_misreadings: ["doing_equals_learning"], negative_moves: ["do_not_ignore_guidance"], boundary_notes: ["Education advice needs age/context scope."], provenance: [S.brit("biography/John-Dewey")], transfer_scope: ["education", "craft", "technology"] }),
  concept({ id: "concept.scaffolding_learning", names: ["学习支架", "scaffolding"], domain: "education", factual_core: "Support structure that helps learners perform beyond unaided capacity and then fades.", definition_units: ["support", "zone", "fade", "capacity"], examples: ["guided prompt", "worked example"], non_examples: ["doing task for learner"], related_concepts: ["concept.social_learning"], common_misreadings: ["scaffold_equals_answer_giving"], negative_moves: ["do_not_replace_learning_with_solution"], boundary_notes: ["Keep special-needs claims bounded."], provenance: [S.brit("biography/Lev-Semyonovich-Vygotsky")], transfer_scope: ["education", "feedback", "interface"] }),
  concept({ id: "concept.prepared_environment", names: ["有准备的环境", "prepared environment"], domain: "education", factual_core: "Learning environment arranged to support autonomy, practice, and attention.", definition_units: ["environment", "autonomy", "practice", "attention"], examples: ["organized learning materials"], non_examples: ["decorated classroom only"], related_concepts: ["concept.learning_by_doing"], common_misreadings: ["environment_equals_room_design"], negative_moves: ["do_not_make_parenting_prescription"], boundary_notes: ["Concept-level only; avoid clinical/special-needs advice."], provenance: [S.brit("biography/Maria-Montessori")], transfer_scope: ["education", "design", "daily_practice"] }),
  concept({ id: "concept.social_learning", names: ["社会学习", "social learning"], domain: "education", factual_core: "Learning shaped by interaction, language, modeling, and shared activity.", definition_units: ["interaction", "language", "modeling", "activity"], examples: ["peer learning", "guided dialogue"], non_examples: ["copying only"], related_concepts: ["concept.scaffolding_learning"], common_misreadings: ["social_learning_equals_group_work"], negative_moves: ["do_not_ignore_individual_context"], boundary_notes: ["Educational scope only."], provenance: [S.brit("biography/Lev-Semyonovich-Vygotsky")], transfer_scope: ["education", "language", "dialogue"] }),
  concept({ id: "concept.feedback_learning", names: ["反馈", "feedback"], domain: "education", factual_core: "Information returned to guide adjustment, attention, and next action.", definition_units: ["return_information", "adjustment", "next_action"], examples: ["specific comment", "revision cue"], non_examples: ["praise only"], related_concepts: ["concept.learning_by_doing"], common_misreadings: ["feedback_equals_score"], negative_moves: ["do_not_make_feedback_generic"], boundary_notes: ["Avoid educational/clinical prescription without context."], provenance: [S.brit("topic/educational-psychology")], transfer_scope: ["education", "design", "dialogue"] }),
  concept({ id: "concept.inquiry_learning", names: ["探究学习", "inquiry learning"], domain: "education", factual_core: "Learning organized around questions, evidence, exploration, and revision.", definition_units: ["question", "evidence", "exploration", "revision"], examples: ["guided investigation"], non_examples: ["aimless searching"], related_concepts: ["concept.learning_by_doing"], common_misreadings: ["inquiry_equals_no_structure"], negative_moves: ["do_not_remove_guidance"], boundary_notes: ["Needs age/context scope."], provenance: [S.brit("topic/education")], transfer_scope: ["education", "science", "dialogue"] }),
  concept({ id: "concept.classroom_social_environment", names: ["课堂社会环境", "classroom as social environment"], domain: "education", factual_core: "Classroom as relationships, norms, space, language, and shared attention.", definition_units: ["relationship", "norm", "space", "language"], examples: ["discussion norm", "peer relation"], non_examples: ["room only"], related_concepts: ["concept.social_learning", "concept.prepared_environment"], common_misreadings: ["classroom_equals_container"], negative_moves: ["do_not_generalize_to_all_children"], boundary_notes: ["No special-needs advice without source/context."], provenance: [S.brit("topic/education")], transfer_scope: ["education", "city_space", "design"] }),
  concept({ id: "concept.market", names: ["市场", "market"], domain: "economy", factual_core: "Institutional arrangement for exchange, prices, coordination, and rules.", definition_units: ["exchange", "price", "coordination", "rules"], examples: ["goods market"], non_examples: ["natural force"], related_concepts: ["concept.embeddedness", "concept.governance_rules"], common_misreadings: ["market_equals_free_of_institutions"], negative_moves: ["do_not_give_investing_advice"], boundary_notes: ["Conceptual/historical only; no forecasts."], provenance: [S.brit("money/market")], transfer_scope: ["economy", "institutions", "daily_life"] }),
  concept({ id: "concept.labor", names: ["劳动", "labor"], domain: "economy", factual_core: "Human work considered through production, skill, wage, time, and institution.", definition_units: ["work", "skill", "wage", "time"], examples: ["division of labor"], non_examples: ["job advice"], related_concepts: ["concept.division_of_labor"], common_misreadings: ["labor_equals_manual_work_only"], negative_moves: ["do_not_give_career_or_finance_advice"], boundary_notes: ["Keep economic/historical scope."], provenance: [S.brit("money/labour-economics")], transfer_scope: ["economy", "education", "technology"] }),
  concept({ id: "concept.division_of_labor", names: ["分工", "division of labor"], domain: "economy", factual_core: "Organization of work into specialized tasks and roles.", definition_units: ["specialization", "task", "coordination"], examples: ["factory division", "knowledge work roles"], non_examples: ["inequality explanation alone"], related_concepts: ["concept.labor", "concept.market"], common_misreadings: ["division_equals_hierarchy"], negative_moves: ["do_not_reduce_society_to_efficiency"], boundary_notes: ["Use historically and institutionally."], provenance: [S.brit("topic/division-of-labour")], transfer_scope: ["economy", "technology", "education"] }),
  concept({ id: "concept.embeddedness", names: ["嵌入性", "embeddedness"], domain: "economy", factual_core: "Idea that economic action is shaped by social relations, institutions, and norms.", definition_units: ["economy", "social_relation", "institution", "norm"], examples: ["market in society"], non_examples: ["market has no logic"], related_concepts: ["theme.institution", "concept.market"], common_misreadings: ["embeddedness_equals_no_market"], negative_moves: ["do_not_make_totalizing_claim"], boundary_notes: ["Conceptual/historical only."], provenance: [S.brit("biography/Karl-Polanyi")], transfer_scope: ["economy", "city", "law"] }),
  concept({ id: "concept.commons", names: ["公地", "commons"], domain: "economy", factual_core: "Shared resource arrangement governed by rules, users, and collective action.", definition_units: ["shared_resource", "rules", "users", "collective_action"], examples: ["common-pool resource"], non_examples: ["free-for-all"], related_concepts: ["concept.governance_rules"], common_misreadings: ["commons_equals_no_rules"], negative_moves: ["do_not_ignore_governance"], boundary_notes: ["No policy prescription without context."], provenance: [S.nobel("prizes/economic-sciences/2009/ostrom/facts/")], transfer_scope: ["economy", "institutions", "technology_commons"] }),
  concept({ id: "concept.governance_rules", names: ["治理规则", "governance rules"], domain: "economy", factual_core: "Rules and practices that organize access, responsibility, monitoring, and revision.", definition_units: ["access", "responsibility", "monitoring", "revision"], examples: ["commons governance", "protocol governance"], non_examples: ["command only"], related_concepts: ["theme.institution", "concept.commons"], common_misreadings: ["governance_equals_state_only"], negative_moves: ["do_not_give_current_policy_advice"], boundary_notes: ["Keep conceptual and historical."], provenance: [S.nobel("prizes/economic-sciences/2009/ostrom/facts/")], transfer_scope: ["economy", "technology", "law_boundary"] }),
  concept({ id: "concept.computation", names: ["计算", "computation"], domain: "technology", factual_core: "Formal process of symbolic operation, algorithmic procedure, or machine-executable step.", definition_units: ["symbol", "algorithm", "machine", "procedure"], examples: ["Turing machine model"], non_examples: ["thinking in general"], related_concepts: ["concept.model_vs_theory"], common_misreadings: ["computation_equals_any_intelligence"], negative_moves: ["do_not_claim_general_mind_equivalence"], boundary_notes: ["Avoid current product claims."], provenance: [S.brit("technology/Turing-machine")], transfer_scope: ["technology", "science", "philosophy"] }),
  concept({ id: "concept.hypertext", names: ["超文本", "hypertext"], domain: "technology", factual_core: "Text and media structure connected by links for nonlinear navigation.", definition_units: ["link", "node", "navigation"], examples: ["web hyperlink"], non_examples: ["plain footnote only"], related_concepts: ["concept.interface", "concept.open_protocol"], common_misreadings: ["hypertext_equals_website"], negative_moves: ["do_not_make_current_platform_claim"], boundary_notes: ["Historical/conceptual only."], provenance: [S.official("W3C:History", "https://www.w3.org/History.html")], transfer_scope: ["technology", "literature", "interface"] }),
  concept({ id: "concept.open_protocol", names: ["开放协议", "open protocol"], domain: "technology", factual_core: "Shared technical agreement enabling interoperable communication across systems.", definition_units: ["agreement", "interoperability", "communication"], examples: ["web protocol"], non_examples: ["open company policy"], related_concepts: ["concept.hypertext", "concept.governance_rules"], common_misreadings: ["open_equals_unowned_everything"], negative_moves: ["do_not_make_current_platform_claim"], boundary_notes: ["No current product comparison."], provenance: [S.official("W3C:Standards", "https://www.w3.org/standards/")], transfer_scope: ["technology", "institutions", "governance"] }),
  concept({ id: "concept.interface", names: ["界面", "interface"], domain: "technology", factual_core: "Shared surface or boundary where user, tool, system, and action meet.", definition_units: ["surface", "boundary", "action", "feedback"], examples: ["graphical interface", "tool handle"], non_examples: ["decoration only"], related_concepts: ["concept.augmentation", "concept.tool_vs_medium"], common_misreadings: ["interface_equals_screen"], negative_moves: ["do_not_reduce_to_visual_style"], boundary_notes: ["No current product recommendation."], provenance: [S.acm("award_winners/engelbart_5078811.cfm")], transfer_scope: ["technology", "design", "dialogue_surface"] }),
  concept({ id: "concept.augmentation", names: ["增强", "augmentation"], domain: "technology", factual_core: "Technology idea of extending human action, memory, collaboration, or problem-solving.", definition_units: ["extend", "action", "memory", "collaboration"], examples: ["interactive computing demo"], non_examples: ["replacement by default"], related_concepts: ["concept.interface"], common_misreadings: ["augmentation_equals_automation"], negative_moves: ["do_not_claim_tool_replaces_judgment"], boundary_notes: ["Avoid current AI product claims."], provenance: [S.acm("award_winners/engelbart_5078811.cfm")], transfer_scope: ["technology", "education", "interface"] }),
  concept({ id: "concept.tool_vs_medium", names: ["工具与媒介", "tool vs medium"], domain: "technology", factual_core: "Contrast between instrument for task and environment that reshapes expression or thought.", definition_units: ["instrument", "environment", "expression", "practice"], examples: ["computer as medium", "tool for task"], non_examples: ["all tools transform equally"], related_concepts: ["concept.interface", "concept.medium_material"], common_misreadings: ["medium_equals_message_slogan"], negative_moves: ["do_not_overstate_transformative_claim"], boundary_notes: ["Use concrete task/context."], provenance: [S.acm("award_winners/kay_3972189.cfm")], transfer_scope: ["technology", "design", "education"] }),
  concept({ id: "concept.local_first_boundary", names: ["本地优先边界", "local-first boundary"], domain: "technology", factual_core: "Policy concept for preferring local data/control while marking limits, sync, and privacy scope.", definition_units: ["local_control", "privacy", "sync_limit", "scope"], examples: ["local cache boundary"], non_examples: ["guaranteed privacy by default"], related_concepts: ["theme.boundary", "concept.interface"], common_misreadings: ["local_equals_safe_always"], negative_moves: ["do_not_overclaim_privacy"], boundary_notes: ["Do not expose implementation terms to ordinary users."], provenance: [S.official("ACM:local-first software", "https://dl.acm.org/doi/10.1145/3359591.3359737")], transfer_scope: ["technology", "privacy_boundary", "interface"] })
];

const stage2aWorks = [
  ["work.dialogue_two_chief_world_systems", ["关于托勒密和哥白尼两大世界体系的对话", "Dialogue Concerning the Two Chief World Systems"], "science.history", ["person.galileo"], "science_text", "early_modern_science", "Galileo work anchor for astronomy debate, observation, and scientific conflict.", ["astronomy", "observation", "debate"], ["dialogue_form"], ["concept.observation_vs_experiment", "concept.scientific_revolution"], [S.brit("biography/Galileo-Galilei")]],
  ["work.principia", ["自然哲学的数学原理", "Principia"], "science.history", ["person.isaac_newton"], "science_text", "early_modern_science", "Newton work anchor for mechanics, mathematical law form, and scientific model.", ["mechanics", "mathematics", "law_form"], ["model", "theory"], ["concept.model_vs_theory", "concept.evidence_chain"], [S.brit("biography/Isaac-Newton")]],
  ["work.radioactivity_research_anchor", ["放射性研究锚点", "radioactivity research anchor"], "science.history", ["person.marie_curie"], "research_anchor", "modern_science", "Marie Curie research anchor for radioactivity, measurement, and laboratory evidence.", ["radioactivity", "measurement", "lab"], ["evidence_chain"], ["concept.evidence_chain"], [S.nobel("prizes/physics/1903/marie-curie/facts/")]],
  ["work.relativity_1905_anchor", ["相对论论文锚点", "relativity 1905 anchor"], "science.history", ["person.albert_einstein"], "research_anchor", "modern_science", "Einstein research anchor for relativity, model change, and physics concepts.", ["relativity", "model", "theory"], ["conceptual_model"], ["concept.relativity", "concept.model_vs_theory"], [S.nobel("prizes/physics/1921/einstein/facts/")]],
  ["work.structure_scientific_revolutions", ["科学革命的结构", "The Structure of Scientific Revolutions"], "science.history", ["person.thomas_kuhn"], "theory_text", "20th_century", "Kuhn work anchor for paradigm, normal science, and scientific revolution.", ["paradigm", "normal_science", "revolution"], ["history_of_science"], ["concept.paradigm", "concept.normal_science", "concept.scientific_revolution"], [S.sep("thomas-kuhn")]],
  ["work.image_of_the_city", ["城市意象", "The Image of the City"], "urban", ["person.kevin_lynch"], "urban_theory_text", "20th_century", "Kevin Lynch work anchor for city image, legibility, paths, edges, and nodes.", ["city_image", "legibility", "urban_form"], ["paths", "edges", "nodes"], ["concept.walkability", "concept.lived_vs_planned_city"], [S.brit("topic/urban-planning")]],
  ["work.production_of_space", ["空间的生产", "The Production of Space"], "urban", ["person.henri_lefebvre"], "urban_theory_text", "20th_century", "Henri Lefebvre work anchor for social space, everyday life, and urban theory.", ["space", "everyday_life", "urban"], ["social_space"], ["concept.lived_vs_planned_city", "concept.public_space"], [S.brit("topic/sociology")]],
  ["work.physiology_of_taste", ["味觉生理学", "The Physiology of Taste"], "food", ["person.brillat_savarin"], "food_text", "19th_century", "Brillat-Savarin work anchor for gastronomy, taste, and daily food culture.", ["taste", "gastronomy", "daily_culture"], ["aphorism", "food_thought"], ["concept.taste", "concept.food_memory"], [S.brit("biography/Anthelme-Brillat-Savarin")]],
  ["work.concept_of_law", ["法律的概念", "The Concept of Law"], "law_boundary", ["person.hla_hart"], "jurisprudence_text", "20th_century", "Hart work anchor for legal positivism, rules, and jurisprudence.", ["legal_positivism", "rule", "law"], ["conceptual_analysis"], ["concept.legal_positivism", "concept.rule_of_law"], [S.sep("legal-positivism")]],
  ["work.theory_of_justice", ["正义论", "A Theory of Justice"], "law_boundary", ["person.john_rawls"], "political_philosophy_text", "20th_century", "Rawls work anchor for fairness, justice, and rights in political philosophy.", ["justice", "fairness", "rights"], ["contractarian_reasoning"], ["concept.fairness", "concept.rights"], [S.sep("rawls")]],
  ["work.taking_rights_seriously", ["认真对待权利", "Taking Rights Seriously"], "law_boundary", ["person.ronald_dworkin"], "jurisprudence_text", "20th_century", "Dworkin work anchor for rights, principles, and hard cases.", ["rights", "principle", "hard_cases"], ["legal_interpretation"], ["concept.rights", "concept.hard_cases"], [S.sep("legal-interpretivism")]],
  ["work.experience_and_education", ["经验与教育", "Experience and Education"], "education", ["person.john_dewey"], "education_text", "20th_century", "Dewey work anchor for experience, reflection, and learning by doing.", ["experience", "learning", "reflection"], ["inquiry", "practice"], ["concept.learning_by_doing", "concept.inquiry_learning"], [S.brit("biography/John-Dewey")]],
  ["work.montessori_method", ["蒙台梭利方法", "The Montessori Method"], "education", ["person.maria_montessori"], "education_text", "20th_century", "Montessori work anchor for prepared environment, autonomy, and learning materials.", ["prepared_environment", "autonomy", "materials"], ["practice", "environment"], ["concept.prepared_environment", "concept.scaffolding_learning"], [S.brit("biography/Maria-Montessori")]],
  ["work.thought_and_language", ["思维与语言", "Thought and Language"], "education", ["person.lev_vygotsky"], "psychology_education_text", "20th_century", "Vygotsky work anchor for language, thought, and social learning.", ["language", "thought", "social_learning"], ["development", "scaffolding"], ["concept.social_learning", "concept.scaffolding_learning"], [S.brit("biography/Lev-Semyonovich-Vygotsky")]],
  ["work.wealth_of_nations", ["国富论", "The Wealth of Nations"], "economy", ["person.adam_smith"], "economics_text", "18th_century", "Adam Smith work anchor for market, labor, and division of labor.", ["market", "labor", "division_of_labor"], ["institution", "exchange"], ["concept.market", "concept.division_of_labor"], [S.brit("biography/Adam-Smith")]],
  ["work.great_transformation", ["大转型", "The Great Transformation"], "economy", ["person.karl_polanyi"], "economic_history_text", "20th_century", "Karl Polanyi work anchor for embeddedness, market society, and institutions.", ["embeddedness", "market_society", "institution"], ["historical_argument"], ["concept.embeddedness", "concept.market"], [S.brit("biography/Karl-Polanyi")]],
  ["work.governing_the_commons", ["治理公地", "Governing the Commons"], "economy", ["person.elinor_ostrom"], "political_economy_text", "20th_century", "Elinor Ostrom work anchor for commons, rules, and governance.", ["commons", "rules", "governance"], ["institutional_analysis"], ["concept.commons", "concept.governance_rules"], [S.nobel("prizes/economic-sciences/2009/ostrom/facts/")]],
  ["work.on_computable_numbers", ["论可计算数", "On Computable Numbers"], "technology", ["person.alan_turing"], "computing_text", "20th_century", "Turing work anchor for computability, formal procedure, and machine model.", ["computation", "formal_model", "machine"], ["algorithmic_reasoning"], ["concept.computation", "concept.model_vs_theory"], [S.brit("biography/Alan-Turing")]],
  ["work.mother_of_all_demos", ["所有演示之母", "Mother of All Demos"], "technology", ["person.douglas_engelbart"], "demo_anchor", "20th_century", "Engelbart demo anchor for augmentation, interface, collaboration, and interactive computing.", ["augmentation", "interface", "collaboration"], ["demo", "interaction"], ["concept.augmentation", "concept.interface"], [S.acm("award_winners/engelbart_5078811.cfm")]],
  ["work.dynabook_concept", ["Dynabook", "Dynabook concept"], "technology", ["person.alan_kay"], "concept_anchor", "20th_century", "Alan Kay concept anchor for personal dynamic media, learning, and computing as medium.", ["personal_computing", "learning", "medium"], ["tool_medium", "interface"], ["concept.tool_vs_medium", "concept.interface"], [S.acm("award_winners/kay_3972189.cfm")]],
  ["work.world_wide_web_anchor", ["万维网锚点", "World Wide Web anchor"], "technology", ["person.tim_berners_lee"], "technology_anchor", "late_20th_century", "Tim Berners-Lee web anchor for hypertext, open protocol, and linking.", ["hypertext", "open_protocol", "web"], ["linking", "standard"], ["concept.hypertext", "concept.open_protocol"], [S.official("W3C:History", "https://www.w3.org/History.html")]]
].map(([id, names, domain, creator_ids, work_type, period, factual_core, themes, style_axes, concepts, provenance]) => work({ id, names, domain, creator_ids, work_type, period, factual_core, themes, style_axes, concepts, safe_summary_units: themes, negative_moves: ["do_not_overstate_static_card", "do_not_make_current_advice"], boundary_notes: ["Conceptual and historical scope only."], provenance, transfer_scope: ["representative_work", "concept_followup", "comparison"] }));

const stage2aRelations = [
  ["relation.galileo_observation_revolution", "person_to_concept", ["person.galileo"], ["concept.observation_vs_experiment", "concept.scientific_revolution"], ["observation", "scientific_change"], ["current_lab"]],
  ["relation.newton_principia_model", "work_to_concept", ["work.principia"], ["concept.model_vs_theory", "concept.evidence_chain"], ["model", "law_form"], ["truth_without_scope"]],
  ["relation.curie_radioactivity_evidence", "person_to_concept", ["person.marie_curie"], ["concept.evidence_chain"], ["measurement", "lab"], ["biomedical_advice"]],
  ["relation.einstein_relativity_model", "person_to_concept", ["person.albert_einstein"], ["concept.relativity", "concept.model_vs_theory"], ["theory", "model"], ["subjective_opinion"]],
  ["relation.kuhn_structure_paradigm", "work_to_concept", ["work.structure_scientific_revolutions"], ["concept.paradigm", "concept.normal_science", "concept.scientific_revolution"], ["paradigm", "revolution"], ["jargon_filler"]],
  ["relation.jane_jacobs_street", "person_to_concept", ["person.jane_jacobs"], ["concept.city_street", "concept.density_diversity", "concept.public_space"], ["street", "public_space"], ["travel_advice"]],
  ["relation.lynch_city_image", "work_to_concept", ["work.image_of_the_city"], ["concept.walkability", "concept.lived_vs_planned_city"], ["legibility", "city_image"], ["zoning_advice"]],
  ["relation.lefebvre_lived_city", "work_to_concept", ["work.production_of_space"], ["concept.lived_vs_planned_city", "concept.public_space"], ["lived_space", "social_space"], ["anti_planning"]],
  ["relation.food_taste_memory", "concept_to_concept", ["concept.taste"], ["concept.food_memory", "theme.memory"], ["taste", "memory"], ["nutrition_advice"]],
  ["relation.heat_timing_texture", "concept_to_concept", ["concept.heat_control"], ["concept.timing_cooking", "concept.texture_food"], ["timing", "texture"], ["food_safety_certification"]],
  ["relation.recipe_practice_learning", "concept_to_concept", ["concept.recipe_vs_practice"], ["concept.learning_by_doing"], ["practice", "feedback"], ["answer_giving"]],
  ["relation.hart_law_positivism", "person_to_concept", ["person.hla_hart"], ["concept.legal_positivism", "concept.rule_of_law"], ["law", "rule"], ["legal_advice"]],
  ["relation.rawls_fairness", "person_to_concept", ["person.john_rawls"], ["concept.fairness", "concept.rights"], ["justice", "fairness"], ["current_policy"]],
  ["relation.dworkin_hard_cases", "person_to_concept", ["person.ronald_dworkin"], ["concept.hard_cases", "concept.rights"], ["principle", "interpretation"], ["case_prediction"]],
  ["relation.legal_boundary_static", "concept_to_concept", ["concept.jurisdiction_date_boundary"], ["concept.rule_application_precedent", "concept.rule_of_law"], ["jurisdiction", "date"], ["universal_law_answer"]],
  ["relation.memory_working_care", "concept_to_concept", ["concept.working_memory"], ["theme.memory", "concept.care_boundary"], ["memory", "scope"], ["diagnosis"]],
  ["relation.social_rejection_care", "concept_to_concept", ["concept.social_rejection"], ["concept.care_boundary", "concept.emotion_regulation"], ["relation", "support"], ["diagnosis"]],
  ["relation.affective_disclosure_boundary", "concept_to_concept", ["concept.affective_disclosure_boundary"], ["concept.care_boundary"], ["uptake", "scope"], ["therapy"]],
  ["relation.dewey_learning_doing", "person_to_concept", ["person.john_dewey"], ["concept.learning_by_doing", "concept.inquiry_learning"], ["experience", "inquiry"], ["activity_only"]],
  ["relation.montessori_prepared_environment", "person_to_concept", ["person.maria_montessori"], ["concept.prepared_environment"], ["environment", "autonomy"], ["parenting_prescription"]],
  ["relation.vygotsky_scaffolding", "person_to_concept", ["person.lev_vygotsky"], ["concept.scaffolding_learning", "concept.social_learning"], ["language", "support"], ["answer_giving"]],
  ["relation.feedback_inquiry", "concept_to_concept", ["concept.feedback_learning"], ["concept.inquiry_learning"], ["adjustment", "question"], ["score_only"]],
  ["relation.smith_market_labor", "work_to_concept", ["work.wealth_of_nations"], ["concept.market", "concept.division_of_labor", "concept.labor"], ["market", "labor"], ["investing_advice"]],
  ["relation.polanyi_embeddedness_market", "work_to_concept", ["work.great_transformation"], ["concept.embeddedness", "concept.market"], ["market_society", "institution"], ["anti_market_simple"]],
  ["relation.ostrom_commons_rules", "work_to_concept", ["work.governing_the_commons"], ["concept.commons", "concept.governance_rules"], ["rules", "commons"], ["free_for_all"]],
  ["relation.turing_computation_model", "work_to_concept", ["work.on_computable_numbers"], ["concept.computation", "concept.model_vs_theory"], ["formal_model", "machine"], ["mind_equivalence"]],
  ["relation.engelbart_augmentation_interface", "work_to_concept", ["work.mother_of_all_demos"], ["concept.augmentation", "concept.interface"], ["augmentation", "interface"], ["replacement"]],
  ["relation.kay_dynabook_medium", "work_to_concept", ["work.dynabook_concept"], ["concept.tool_vs_medium", "concept.interface"], ["medium", "learning"], ["tool_only"]],
  ["relation.web_hypertext_protocol", "work_to_concept", ["work.world_wide_web_anchor"], ["concept.hypertext", "concept.open_protocol"], ["link", "protocol"], ["current_platform_claim"]],
  ["relation.interface_design_feedback", "concept_to_concept", ["concept.interface"], ["concept.feedback_learning", "concept.design_good_principles"], ["feedback", "use"], ["visual_style_only"]]
].map(([id, relation_type, source_ids, target_ids, shared_axes, contrast_axes]) => relation({ id, names: [id.replace("relation.", "").replaceAll("_", " ")], domain: "relation_graph", relation_type, source_ids, target_ids, shared_axes, contrast_axes, licensed_verbs: ["helps explain", "constrains", "is often read through"], provenance: [S.official("R24 curated public-source synthesis", "https://www.britannica.com/")], transfer_scope: ["comparison", "concept_followup", "boundary"] }));

const stage2aBoundaries = [
  boundary("boundary.science_static_scope", ["静态科学卡边界", "science static scope boundary"], "science.history", ["stable_history", "no_current_lab", "scope"], [S.brit("science/scientific-method")], ["science_history", "source_sensitive_answers"]),
  boundary("boundary.biomedical_advice", ["生物医学建议边界", "biomedical advice boundary"], "science.history", ["no_medical_advice", "no_treatment", "source_required"], [S.official("APA:health psychology", "https://dictionary.apa.org/health-psychology")], ["science", "care_boundary"]),
  boundary("boundary.urban_no_travel_zoning", ["城市旅行规划边界", "urban travel zoning boundary"], "urban", ["no_travel_recommendation", "no_current_zoning", "local_scope"], [S.brit("topic/urban-planning")], ["urban", "city"]),
  boundary("boundary.food_no_medical_safety", ["食物医疗安全边界", "food medical safety boundary"], "food", ["no_medical_nutrition", "no_safety_certification", "craft_only"], [S.brit("topic/cooking")], ["food", "daily_culture"]),
  boundary("boundary.law_no_advice", ["法律非建议边界", "law no advice boundary"], "law_boundary", ["jurisdiction", "date", "procedure", "no_advice"], [S.official("Oyez:about", "https://www.oyez.org/about")], ["law_boundary", "current_facts"]),
  boundary("boundary.psych_no_diagnosis", ["心理不诊断边界", "psychology no diagnosis boundary"], "psychology_boundary", ["no_diagnosis", "no_treatment", "care_scope"], [S.official("APA:diagnosis", "https://dictionary.apa.org/diagnosis")], ["care_boundary", "affective_disclosure"]),
  boundary("boundary.education_context_scope", ["教育情境边界", "education context boundary"], "education", ["age_context", "no_clinical_advice", "concept_only"], [S.brit("topic/education")], ["education", "learning"]),
  boundary("boundary.economy_no_forecast", ["经济非预测边界", "economy no forecast boundary"], "economy", ["no_investing", "no_macro_forecast", "conceptual_history"], [S.brit("money/economics")], ["economy", "institutions"]),
  boundary("boundary.technology_no_product_state", ["技术产品状态边界", "technology product-state boundary"], "technology", ["no_current_product_comparison", "no_platform_state_claim", "conceptual_history"], [S.acm("award_winners/engelbart_5078811.cfm")], ["technology", "interface"]),
  boundary("boundary.source_sensitive_current_facts", ["当前事实来源边界", "source-sensitive current facts boundary"], "source_sensitive_boundary", ["current_fact", "source_date", "uncertainty"], [S.official("W3C:Standards", "https://www.w3.org/standards/")], ["law", "science", "technology", "economy"])
];

function writeJsonl(file, rows) {
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function main() {
  const existing = existingIds();
  const skipped = [];
  const keep = (row) => {
    if (existing.has(row.id)) {
      skipped.push(row.id);
      return false;
    }
    existing.add(row.id);
    return true;
  };
  const stage1bRows = [...stage1bConcepts, ...stage1bPersons, ...stage1bWorks, ...stage1bRelations].filter(keep);
  const stage2aRows = [...stage2aPersons, ...stage2aConcepts, ...stage2aWorks, ...stage2aRelations, ...stage2aBoundaries].filter(keep);
  writeJsonl(STAGE1B_FILE, stage1bRows);
  writeJsonl(STAGE2A_FILE, stage2aRows);
  console.log(JSON.stringify({
    stage1b_file: path.relative(ROOT, STAGE1B_FILE),
    stage2a_file: path.relative(ROOT, STAGE2A_FILE),
    stage1b_cards: stage1bRows.length,
    stage2a_cards: stage2aRows.length,
    total_cards: stage1bRows.length + stage2aRows.length,
    skipped_existing_ids: skipped
  }, null, 2));
}

main();
