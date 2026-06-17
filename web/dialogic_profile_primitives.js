export const DIALOGIC_PROFILE_PRIMITIVE_SCHEMA_VERSION = "r22b.primitive_profile.v1";

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
    focal_contrasts: ["专辑/单曲", "私人记忆/共同经验", "旋律钩子/叙事推进"],
    analogy_relations: ["歌曲和诗都能压缩节奏、意象和情绪", "流行歌可以把私人经验变成可分享的声音"],
    examples: ["叙事歌词", "声音气质", "时代流通"],
    recommendation_criteria: ["叙事", "声音", "时代", "舞台"],
    negative_moves: ["不要把所有音乐问题都抽象成关系、身份或结构", "不要用视觉艺术的观看关系套普通音乐问题"],
    answer_shape_hints: ["先给一句判断，再给一到三个具体入口", "类比声明只轻接一层，不展开小论文"]
  },
  literature: {
    factual_anchors: ["叙述", "视角", "留白", "形式"],
    native_verbs: ["叙述", "转视角", "留白", "嵌套", "反讽", "延宕", "对照", "收束"],
    focal_contrasts: ["叙述者/作者", "个人记忆/形式安排", "留白/说明"],
    analogy_relations: ["文学和音乐都能用短形式承载节奏与记忆", "小说和舞台都靠细节让冲突显出来"],
    examples: ["叙述者", "场景", "冲突", "童年记忆"],
    negative_moves: ["不要把文学回应压成季节、沉默、羞耻等固定抽象词"],
    answer_shape_hints: ["个人联想先回应感受，再给一个作品层面的轻判断"]
  },
  theater: {
    factual_anchors: ["台词", "身体", "停顿", "冲突", "场面"],
    native_verbs: ["调度", "停顿", "压住", "转场", "顶住", "显出"],
    focal_contrasts: ["剧情/现场动作", "解释/表演", "细节/冲突"],
    analogy_relations: ["戏剧和小说都让冲突留在细节里", "舞台把解释交给动作、停顿和身体"],
    negative_moves: ["不要把舞台类比变成跨媒介术语展示"],
    answer_shape_hints: ["类比成立时，承认后补一个具体的形式判断"]
  },
  food: {
    factual_anchors: ["材料", "火候", "味觉", "地方", "餐桌"],
    native_verbs: ["切", "炖", "腌", "发酵", "调味", "收汁", "保留", "过火"],
    focal_contrasts: ["味道/记忆", "手艺/关系", "地方/身体经验"],
    analogy_relations: ["饮食和文学都靠细节保存地方和记忆"],
    negative_moves: ["不要把食物问题回答成抽象关系模板"],
    answer_shape_hints: ["用一个做法动词保留领域质感"]
  },
  law: {
    factual_anchors: ["规则", "解释", "权利", "判例", "边界"],
    native_verbs: ["适用", "区分", "解释", "约束", "排除", "推翻", "援引", "限缩"],
    focal_contrasts: ["条文/适用", "公平/可预期性", "规则/处境"],
    uncertainty_conditions: ["jurisdiction", "date", "procedure", "source"],
    boundary_constraints: ["现实法律适用必须保留辖区、日期和程序边界"],
    negative_moves: ["不要为了自然简短删除法律限定"],
    answer_shape_hints: ["先说明一般结构，再保留适用边界"]
  },
  film: {
    factual_anchors: ["镜头", "剪辑", "场面", "声音", "时间"],
    native_verbs: ["调度", "取景", "剪", "留白", "推进", "停顿", "框住", "对切"],
    focal_contrasts: ["故事/镜头组织", "情绪/剪辑", "场景/时间"],
    analogy_relations: ["电影和文学都组织时间，但电影用镜头和声音承担"],
    negative_moves: ["不要把电影判断变成泛文化入口模板"],
    answer_shape_hints: ["用镜头或剪辑词给出具体判断"]
  },
  identity: {
    factual_anchors: ["对话框", "本地运行", "当前会话", "边界"],
    boundary_constraints: ["不声称人类经验", "不暴露内部 ontology", "不把用户赞许拉成人格循环"],
    uncertainty_conditions: ["身份问题要区分产品身份、能力边界和对话风格"],
    negative_moves: ["不要过度拟人", "不要客服式感谢", "不要把身份边界藏掉"],
    answer_shape_hints: ["身份回应要短、平实，并回到当前对话"]
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
