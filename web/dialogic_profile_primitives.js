export const DIALOGIC_PROFILE_PRIMITIVE_SCHEMA_VERSION = "r22c.primitive_profile.v2";

export const LEGACY_SURFACE_FIELD_STATUS = Object.freeze({
  legacy_surface_only: true,
  authoritative_knowledge: false,
  migration_pending: true,
  frozen_baseline_commit: "424e4b7cbe41fb8439fe38a2a75d43abfe3c862b",
  note: "Existing dialogic profile sentence fields are legacy surface debt. New runtime authority should use compositional primitives, not full answer sentences."
});

export const PRIMITIVE_FIELD_TAXONOMY = Object.freeze([
  "factual_anchors",
  "native_verbs",
  "focal_contrasts",
  "analogy_relations",
  "historical_anchors",
  "examples",
  "recommendation_items",
  "recommendation_criteria",
  "uncertainty_conditions",
  "negative_moves",
  "boundary_constraints",
  "answer_shape_hints"
]);

export const DIALOGIC_PROFILE_PRIMITIVES = Object.freeze({
  music: {
    factual_anchors: ["流行歌", "声音", "记忆", "时代"],
    native_verbs: ["铺陈", "重复", "变奏", "压缩", "推进", "留白", "转调", "咬字"],
    focal_contrasts: [
      { id: "album_single", left_axis: "专辑", right_axis: "单曲", contrast_axes: ["整体结构", "集中表达"] },
      { id: "private_shared_memory", left_axis: "私人记忆", right_axis: "共同经验", contrast_axes: ["亲身感", "流通性"] },
      { id: "hook_narrative", left_axis: "旋律钩子", right_axis: "叙事推进", contrast_axes: ["反复", "展开"] }
    ],
    analogy_relations: [
      {
        id: "music_poetry_compression",
        left_type: "music",
        right_type: "poetry",
        shared_axes: ["rhythm", "imagery", "compression"],
        contrast_axes: ["voice", "duration"],
        licensed_verbs: ["压缩", "重复", "留白"]
      },
      {
        id: "private_memory_to_shared_voice",
        left_type: "song",
        right_type: "shared_memory",
        shared_axes: ["memory", "voice", "circulation"],
        contrast_axes: ["private_source", "public_recognition"],
        licensed_verbs: ["变奏", "咬字", "推进"]
      }
    ],
    examples: ["叙事歌词", "声音气质", "时代流通"],
    recommendation_criteria: ["叙事", "声音", "时代", "舞台"],
    negative_moves: ["avoid_generic_relation_template", "avoid_visual_art_method_for_music"],
    answer_shape_hints: [
      { id: "judgment_then_anchors", first_move: "light_judgment", anchor_count: [1, 3] },
      { id: "analogy_one_step", first_move: "uptake", max_visible_steps: 1 }
    ]
  },
  literature: {
    factual_anchors: ["叙述", "视角", "留白", "形式"],
    native_verbs: ["叙述", "转视角", "留白", "嵌套", "反讽", "延宕", "对照", "收束"],
    focal_contrasts: [
      { id: "narrator_author", left_axis: "叙述者", right_axis: "作者", contrast_axes: ["voice", "biography"] },
      { id: "memory_form", left_axis: "个人记忆", right_axis: "形式安排", contrast_axes: ["experience", "construction"] },
      { id: "ellipsis_explanation", left_axis: "留白", right_axis: "说明", contrast_axes: ["withholding", "clarifying"] }
    ],
    analogy_relations: [
      {
        id: "literature_music_short_form",
        left_type: "literature",
        right_type: "music",
        shared_axes: ["rhythm", "memory", "compression"],
        contrast_axes: ["narrative_space", "sound"],
        licensed_verbs: ["叙述", "留白", "收束"]
      },
      {
        id: "novel_theater_detail_conflict",
        left_type: "novel",
        right_type: "theater",
        shared_axes: ["detail", "conflict", "scene"],
        contrast_axes: ["narration", "embodiment"],
        licensed_verbs: ["对照", "延宕", "收束"]
      }
    ],
    examples: ["叙述者", "场景", "冲突", "童年记忆"],
    negative_moves: ["avoid_fixed_mood_abstraction"],
    answer_shape_hints: [{ id: "affective_then_work_judgment", first_move: "affective_uptake", max_visible_steps: 1 }]
  },
  theater: {
    factual_anchors: ["台词", "身体", "停顿", "冲突", "场面"],
    native_verbs: ["调度", "停顿", "压住", "转场", "顶住", "显出"],
    focal_contrasts: [
      { id: "plot_action", left_axis: "剧情", right_axis: "现场动作", contrast_axes: ["summary", "embodiment"] },
      { id: "explanation_performance", left_axis: "解释", right_axis: "表演", contrast_axes: ["statement", "action"] },
      { id: "detail_conflict", left_axis: "细节", right_axis: "冲突", contrast_axes: ["texture", "pressure"] }
    ],
    analogy_relations: [
      {
        id: "theater_novel_detail_conflict",
        left_type: "theater",
        right_type: "novel",
        shared_axes: ["detail", "conflict", "scene"],
        contrast_axes: ["body", "narration"],
        licensed_verbs: ["调度", "停顿", "显出"]
      }
    ],
    negative_moves: ["avoid_cross_media_jargon_display"],
    answer_shape_hints: [{ id: "analogy_form_judgment", first_move: "confirm_relation", max_visible_steps: 1 }]
  },
  food: {
    factual_anchors: ["材料", "火候", "味觉", "地方", "餐桌"],
    native_verbs: ["切", "炖", "腌", "发酵", "调味", "收汁", "保留", "过火"],
    focal_contrasts: [
      { id: "taste_memory", left_axis: "味道", right_axis: "记忆", contrast_axes: ["sensory", "recollection"] },
      { id: "craft_relation", left_axis: "手艺", right_axis: "关系", contrast_axes: ["method", "sociality"] },
      { id: "place_body", left_axis: "地方", right_axis: "身体经验", contrast_axes: ["locale", "embodiment"] }
    ],
    analogy_relations: [
      {
        id: "food_literature_detail_memory",
        left_type: "food",
        right_type: "literature",
        shared_axes: ["detail", "place", "memory"],
        contrast_axes: ["taste", "narration"],
        licensed_verbs: ["保留", "发酵", "调味"]
      }
    ],
    negative_moves: ["avoid_abstract_relation_template"],
    answer_shape_hints: [{ id: "native_verb_texture", first_move: "concrete_verb", max_visible_steps: 1 }]
  },
  law: {
    factual_anchors: ["规则", "解释", "权利", "判例", "边界"],
    native_verbs: ["适用", "区分", "解释", "约束", "排除", "推翻", "援引", "限缩"],
    focal_contrasts: [
      { id: "text_application", left_axis: "条文", right_axis: "适用", contrast_axes: ["wording", "case_context"] },
      { id: "fairness_predictability", left_axis: "公平", right_axis: "可预期性", contrast_axes: ["equity", "stability"] },
      { id: "rule_situation", left_axis: "规则", right_axis: "处境", contrast_axes: ["general", "particular"] }
    ],
    uncertainty_conditions: ["jurisdiction", "date", "procedure", "source"],
    boundary_constraints: ["preserve_jurisdiction_date_procedure_source"],
    negative_moves: ["avoid_deleting_legal_qualifiers"],
    answer_shape_hints: [{ id: "structure_then_boundary", first_move: "general_structure", required_boundary: true }]
  },
  film: {
    factual_anchors: ["镜头", "剪辑", "场面", "声音", "时间"],
    native_verbs: ["调度", "取景", "剪", "留白", "推进", "停顿", "框住", "对切"],
    focal_contrasts: [
      { id: "story_shot_organization", left_axis: "故事", right_axis: "镜头组织", contrast_axes: ["plot", "framing"] },
      { id: "emotion_editing", left_axis: "情绪", right_axis: "剪辑", contrast_axes: ["feeling", "cut"] },
      { id: "scene_time", left_axis: "场景", right_axis: "时间", contrast_axes: ["space", "duration"] }
    ],
    analogy_relations: [
      {
        id: "film_literature_time",
        left_type: "film",
        right_type: "literature",
        shared_axes: ["time", "sequence", "attention"],
        contrast_axes: ["image_sound", "language"],
        licensed_verbs: ["调度", "剪", "停顿"]
      }
    ],
    negative_moves: ["avoid_generic_culture_entry_template"],
    answer_shape_hints: [{ id: "shot_or_editing_judgment", first_move: "domain_verb_judgment", max_visible_steps: 1 }]
  },
  identity: {
    factual_anchors: ["对话框", "本地运行", "当前会话", "边界"],
    boundary_constraints: ["avoid_human_experience_claim", "avoid_internal_ontology_disclosure", "avoid_praise_identity_loop"],
    uncertainty_conditions: ["product_identity", "capability_boundary", "dialogue_style"],
    negative_moves: ["avoid_over_personification", "avoid_customer_service_thanks", "preserve_identity_boundary"],
    answer_shape_hints: [{ id: "plain_identity_boundary", first_move: "plain_boundary", return_to_context: true }]
  }
});

export function primitiveProfileFor(domain = "") {
  const key = String(domain || "").toLowerCase();
  if (DIALOGIC_PROFILE_PRIMITIVES[key]) return DIALOGIC_PROFILE_PRIMITIVES[key];
  if (/music|mandopop/.test(key)) return DIALOGIC_PROFILE_PRIMITIVES.music;
  if (/literature|language/.test(key)) return DIALOGIC_PROFILE_PRIMITIVES.literature;
  if (/theater|stage|drama/.test(key)) return DIALOGIC_PROFILE_PRIMITIVES.theater;
  if (/food|cooking|taste/.test(key)) return DIALOGIC_PROFILE_PRIMITIVES.food;
  if (/law|legal/.test(key)) return DIALOGIC_PROFILE_PRIMITIVES.law;
  if (/film|cinema|visual/.test(key)) return DIALOGIC_PROFILE_PRIMITIVES.film;
  return null;
}
