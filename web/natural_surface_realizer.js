import { primitiveProfileFor } from "./dialogic_profile_primitives.js";

const LOW_RISK_TURN_FUNCTIONS = new Set([
  "confirmation",
  "analogy_statement",
  "affective_disclosure",
  "compliment",
  "deepening_invitation",
  "topic_reentry",
  "reflection",
  "declaration_with_signal"
]);

const HARD_BOUNDARY_PATTERN =
  /privacy|copyright|self_harm|medical|legal_current|financial|source|boundary|identity_hard|solver|fallback_repair|repair_last_answer/;

const PROHIBITION_PATTERNS = [
  { id: "i_caught_it", regex: /我接住了|我接住这个|我接住这/ },
  { id: "generic_thanks", regex: /谢谢你的认可|感谢你的认可|我会继续努力/ },
  { id: "you_can_continue_ask", regex: /你可以继续问|可以继续问/ },
  { id: "announced_bridge", regex: /跨媒介关联|这体现了|这是一种|本质上/ },
  { id: "domain_profile_entry", regex: /可以从.{0,32}(进入|入手|切入)/ },
  { id: "focus_template", regex: /(重点|关键|核心)(在于|是)/ }
];

function textOf(value) {
  return String(value || "").trim();
}

function sentence(text) {
  return `${textOf(text)}。`;
}

function question(text) {
  return `${textOf(text)}？`;
}

function zhChars(text) {
  return [...String(text || "")].filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
}

function prohibitionHits(text) {
  return PROHIBITION_PATTERNS.filter((pattern) => pattern.regex.test(textOf(text))).map((pattern) => pattern.id);
}

function domainFrom({ domain = "", query = "", activeTopic = {} } = {}) {
  const source = `${domain} ${activeTopic?.domain || ""} ${query}`;
  if (/音乐|歌|专辑|单曲|流行|music|mandopop/.test(source)) return "music";
  if (/文学|小说|诗|作家|literature/.test(source)) return "literature";
  if (/舞台|戏剧|剧场|theater|stage/.test(source)) return "theater";
  if (/法律|法学|law|legal/.test(source)) return "law";
  if (/饮食|料理|烹饪|food|cooking/.test(source)) return "food";
  if (/电影|镜头|film|cinema/.test(source)) return "film";
  return domain || activeTopic?.domain || "";
}

function pickPrimitive(domain, key, fallback = "") {
  const profile = primitiveProfileFor(domain) || {};
  const values = Array.isArray(profile[key]) ? profile[key] : [];
  return values[0] || fallback;
}

function makeCandidate({ query, turnFunction, currentAnswer, domain, surfaceControl, activeTopic }) {
  const fn = textOf(turnFunction);
  const q = textOf(query);
  const topicDomain = domainFrom({ domain, query: q, activeTopic });
  const nativeVerb = pickPrimitive(topicDomain, "native_verbs", "压缩");
  const relation = pickPrimitive(topicDomain, "analogy_relations", "");
  const contrast = pickPrimitive(topicDomain, "focal_contrasts", "");

  if (fn === "confirmation") {
    return /吗|是不是|是那个|对吗/.test(q) ? sentence("是，可以按这个对象继续说") : "";
  }

  if (fn === "analogy_statement" || fn === "reflection" || fn === "declaration_with_signal") {
    if (/诗|文学|小说/.test(q)) {
      return relation
        ? sentence(`是，有点像：${relation.replace(/。$/, "")}`)
        : sentence(`是，有点像：都靠节奏和意象把经验${nativeVerb}住`);
    }
    if (/舞台|戏剧|冲突|细节/.test(q)) {
      return sentence("可以这样看：细节不是装饰，它会把冲突留在场面里");
    }
    if (/不是我要|太机械|像模板|不自然/.test(q)) {
      return sentence("明白，这里应该少一点框架，多贴着你刚才那条线说");
    }
    return contrast ? sentence(`可以，这里真正有张力的是${contrast}`) : "";
  }

  if (fn === "affective_disclosure") {
    if (/羡慕|想到|童年|记忆/.test(q)) return sentence("这像是在羡慕一种能力：把很私人的记忆说得轻，又让别人认得出来");
    return sentence("我会把这当成一个轻的个人联想，不把它讲成诊断");
  }

  if (fn === "compliment") {
    if (topicDomain === "film") return sentence("这条线可以继续：镜头、空间和节奏都在帮感受找到形状");
    if (topicDomain === "law") return sentence("这条线可以继续：规则、解释和人的处境正好连在一起");
    if (topicDomain === "food") return sentence("这条线可以继续：味道、手艺和记忆本来就贴得很近");
    if (topicDomain === "theater") return sentence("这条线可以继续：台词、停顿和冲突都能把感受压实");
    if (topicDomain === "literature") return sentence("这条线可以继续：文学和诗歌都在找更准的说法");
    return sentence("这条线可以继续：音乐、文学和诗歌都在找更准的说法");
  }

  if (fn === "deepening_invitation") {
    if (/童年|记忆|音乐|文学|诗/.test(`${q} ${currentAnswer}`)) return question("一件作品什么时候会把私人记忆变成别人也能认出的经验");
    if (topicDomain === "film") return question("一个镜头什么时候不只是记录，而是在安排人与时间的关系");
    if (topicDomain === "law") return question("规则什么时候会把复杂冲突变成可承担的判断");
    if (topicDomain === "food") return question("一道菜什么时候不只是味道，而是在保存一种地方记忆");
    if (topicDomain === "theater") return question("一句台词什么时候不只是说明，而是在推动行动");
    return question("一件作品什么时候会把形式变成感受本身");
  }

  if (fn === "topic_reentry") {
    return sentence("可以回到刚才那条线：先抓一个具体对象，再看它怎样变奏");
  }

  return "";
}

function contentUnitsFromAnswer(answer) {
  return textOf(answer)
    .split(/[。！？!?；;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export function realizeNaturalSurfaceShadow({
  query = "",
  currentAnswer = "",
  turnFunction = "",
  responseType = "",
  responseMode = "",
  questionType = "",
  operation = "",
  domain = "",
  activeTopic = null,
  binding = {},
  surfaceControl = {},
  evidenceIds = [],
  plan = {}
} = {}) {
  const fn = textOf(turnFunction);
  const boundarySource = `${responseType} ${responseMode} ${questionType} ${operation}`;
  const current = textOf(currentAnswer);
  const base = {
    enabled: true,
    live_switch: false,
    candidate_answer: current,
    content_units_used: contentUnitsFromAnswer(current),
    primitives_used: [],
    realization_shape: "fallback_current",
    dropped_reasoning_units: [],
    forbidden_pattern_hits: prohibitionHits(current),
    prohibition_hits: [],
    confidence: 0,
    surface_confidence: 0,
    required_units_preserved: true,
    evidence_ids: Array.isArray(evidenceIds) ? evidenceIds.slice(0, 8) : [],
    dropped_optional_units: [],
    fallback_to_current_reason: "",
    fallback_reason: ""
  };

  if (HARD_BOUNDARY_PATTERN.test(boundarySource)) {
    return {
      ...base,
      fallback_to_current_reason: "unsupported_or_boundary_response_type",
      fallback_reason: "unsupported_or_boundary_response_type"
    };
  }
  if (!LOW_RISK_TURN_FUNCTIONS.has(fn)) {
    return {
      ...base,
      fallback_to_current_reason: "turn_function_not_in_shadow_scope",
      fallback_reason: "turn_function_not_in_shadow_scope"
    };
  }

  const resolvedDomain = domainFrom({ domain, query, activeTopic });
  const primitiveProfile = primitiveProfileFor(resolvedDomain) || {};
  const candidate = textOf(makeCandidate({
    query,
    turnFunction: fn,
    currentAnswer: current,
    domain: resolvedDomain,
    surfaceControl,
    activeTopic,
    binding,
    plan
  }));
  if (!candidate) {
    return {
      ...base,
      fallback_to_current_reason: "no_confident_candidate",
      fallback_reason: "no_confident_candidate"
    };
  }

  const hits = prohibitionHits(candidate);
  const tooLongForNone = surfaceControl.reasoning_budget === "none" && zhChars(candidate) > 70;
  const confidence = hits.length || tooLongForNone ? 0.38 : 0.72;
  if (confidence < 0.6) {
    return {
      ...base,
      candidate_answer: current,
      content_units_used: contentUnitsFromAnswer(current),
      primitives_used: [],
      forbidden_pattern_hits: hits,
      prohibition_hits: hits,
      confidence,
      surface_confidence: confidence,
      fallback_to_current_reason: hits.length ? "candidate_hits_surface_prohibition" : "candidate_confidence_below_threshold",
      fallback_reason: hits.length ? "candidate_hits_surface_prohibition" : "candidate_confidence_below_threshold"
    };
  }

  const primitivesUsed = [
    ...(primitiveProfile.native_verbs || []).slice(0, 2),
    ...(primitiveProfile.focal_contrasts || []).slice(0, 1),
    ...(primitiveProfile.analogy_relations || []).slice(0, 1)
  ].filter(Boolean);
  return {
    ...base,
    candidate_answer: candidate,
    content_units_used: contentUnitsFromAnswer(candidate),
    primitives_used: primitivesUsed,
    realization_shape: surfaceControl.sentence_shape || "one_sentence",
    dropped_reasoning_units: contentUnitsFromAnswer(current).filter((unit) => !candidate.includes(unit)).slice(0, 4),
    forbidden_pattern_hits: hits,
    prohibition_hits: hits,
    confidence,
    surface_confidence: confidence,
    required_units_preserved: true,
    dropped_optional_units: [],
    fallback_to_current_reason: "",
    fallback_reason: ""
  };
}
