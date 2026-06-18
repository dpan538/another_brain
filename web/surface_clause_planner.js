const ACKNOWLEDGMENTS = Object.freeze(["是", "对", "可以这样看", "有点像"]);

const AXIS_LABELS = Object.freeze({
  rhythm: "节奏",
  imagery: "意象",
  compression: "压缩",
  voice: "声音",
  duration: "时间",
  memory: "记忆",
  circulation: "流通",
  detail: "细节",
  conflict: "冲突",
  scene: "场面",
  time: "时间",
  sequence: "顺序",
  attention: "注意力",
  place: "地方",
  taste: "味道",
  narration: "叙述",
  sound: "声音"
});

function textOf(value) {
  return String(value || "").trim();
}

function hashIndex(text = "", size = 1) {
  let hash = 0;
  for (const char of textOf(text)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return size ? hash % size : 0;
}

function axisLabel(axis = "") {
  return AXIS_LABELS[axis] || textOf(axis).replace(/_/g, "");
}

function relationMatchesQuery(relation = {}, query = "") {
  const q = textOf(query).toLowerCase();
  const haystack = [
    relation.left_type,
    relation.right_type,
    ...(relation.shared_axes || []),
    ...(relation.contrast_axes || []),
    ...(relation.licensed_verbs || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!q) return true;
  if (/诗|文学|小说/.test(q) && /poetry|literature|novel/.test(haystack)) return true;
  if (/舞台|戏剧|冲突|细节/.test(q) && /theater|conflict|detail|scene/.test(haystack)) return true;
  if (/童年|记忆|想到|羡慕/.test(q) && /memory/.test(haystack)) return true;
  if (/电影|镜头|剪辑/.test(q) && /film|time|sequence|attention/.test(haystack)) return true;
  if (/做菜|饮食|味道/.test(q) && /food|taste|place|memory/.test(haystack)) return true;
  return false;
}

function chooseRelation(profile = {}, query = "") {
  const relations = Array.isArray(profile.analogy_relations) ? profile.analogy_relations : [];
  return relations.find((relation) => relationMatchesQuery(relation, query)) || relations[0] || null;
}

function chooseContrast(profile = {}) {
  const contrasts = Array.isArray(profile.focal_contrasts) ? profile.focal_contrasts : [];
  return contrasts[0] || null;
}

function chooseVerb(profile = {}, relation = {}) {
  return relation?.licensed_verbs?.[0] || profile.native_verbs?.[0] || "";
}

function acknowledgmentFor({ query = "", turnFunction = "", recentSkeletons = [] } = {}) {
  const options = recentSkeletons.includes("minimal_ack") ? ACKNOWLEDGMENTS.slice(1) : ACKNOWLEDGMENTS;
  return options[hashIndex(`${turnFunction}|${query}`, options.length)] || "是";
}

export function makeSurfaceClausePlan({
  query = "",
  turnFunction = "",
  profile = {},
  currentUnits = {},
  recentSkeletons = []
} = {}) {
  const fn = textOf(turnFunction);
  const relation = chooseRelation(profile, query);
  const contrast = chooseContrast(profile);
  const acknowledgment = acknowledgmentFor({ query, turnFunction: fn, recentSkeletons });
  const base = {
    act: "",
    acknowledgment,
    relation_id: relation?.id || "",
    contrast_id: contrast?.id || "",
    focal_axes: relation?.shared_axes?.slice(0, 2) || contrast?.contrast_axes?.slice(0, 2) || [],
    licensed_verb: chooseVerb(profile, relation),
    clause_count: 1,
    stance: "light",
    stop_after: "concrete_judgment",
    primitives_used: [relation?.id, contrast?.id].filter(Boolean),
    skeleton_id: ""
  };

  if (fn === "confirmation") {
    return {
      ...base,
      act: "confirmation_preserve",
      referent: currentUnits.named_items?.[0] || currentUnits.entities?.find((item) => !/^(person|author)\./.test(item)) || "",
      skeleton_id: "confirmation_preserve"
    };
  }
  if (["analogy_statement", "reflection", "declaration_with_signal"].includes(fn)) {
    return relation
      ? { ...base, act: "analogy_uptake", skeleton_id: `analogy:${relation.id}` }
      : { ...base, act: "contrast_uptake", skeleton_id: `contrast:${contrast?.id || "none"}` };
  }
  if (fn === "affective_disclosure") {
    if (!relation || !/memory|记忆/.test(`${relation.shared_axes || []} ${query}`)) return null;
    return { ...base, act: "affective_memory_uptake", skeleton_id: `affective:${relation.id}` };
  }
  if (fn === "deepening_invitation") {
    return relation
      ? { ...base, act: "deep_question_relation", skeleton_id: `deep:${relation.id}` }
      : { ...base, act: "deep_question_contrast", skeleton_id: `deep:${contrast?.id || "none"}` };
  }
  return null;
}

function joinAxes(axes = []) {
  const labels = axes.map(axisLabel).filter(Boolean);
  if (!labels.length) return "";
  if (labels.length === 1) return labels[0];
  return `${labels[0]}和${labels[1]}`;
}

function contrastText(plan = {}) {
  return joinAxes(plan.focal_axes);
}

export function realizeSurfaceClausePlan(plan = {}) {
  const ack = textOf(plan.acknowledgment) || "是";
  const verb = textOf(plan.licensed_verb) || "压缩";
  const axes = joinAxes(plan.focal_axes);
  if (plan.act === "confirmation_preserve") {
    if (!plan.referent) return "";
    return `${ack}，还是${plan.referent}。`;
  }
  if (plan.act === "analogy_uptake") {
    if (!axes) return "";
    return `${ack}，${verb}${axes}这一点很近。`;
  }
  if (plan.act === "contrast_uptake") {
    const text = contrastText(plan);
    if (!text) return "";
    return `${ack}，张力就在${text}。`;
  }
  if (plan.act === "affective_memory_uptake") {
    if (!axes) return "";
    return `${ack}，像是${axes}被${verb}了一下。`;
  }
  if (plan.act === "deep_question_relation") {
    if (!axes) return "";
    return `${verb}${axes}时，什么被保留下来？`;
  }
  if (plan.act === "deep_question_contrast") {
    const text = contrastText(plan);
    if (!text) return "";
    return `${text}真正差在哪里？`;
  }
  return "";
}
