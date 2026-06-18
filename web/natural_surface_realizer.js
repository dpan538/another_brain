import { primitiveProfileFor } from "./dialogic_profile_primitives.js";
import { detectUserConfirmationPolarity, extractSurfaceContentUnits } from "./surface_content_units.js";
import { verifySurfaceCandidate } from "./surface_semantic_verifier.js";

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

function axisLabel(axis = "") {
  return AXIS_LABELS[axis] || String(axis || "").replace(/_/g, "");
}

function pickPrimitive(domain, key, fallback = "") {
  const profile = primitiveProfileFor(domain) || {};
  const values = Array.isArray(profile[key]) ? profile[key] : [];
  return values[0] || fallback;
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
  return false;
}

function pickRelation(profile = {}, query = "") {
  const relations = Array.isArray(profile.analogy_relations) ? profile.analogy_relations : [];
  return relations.find((relation) => relationMatchesQuery(relation, query)) || relations[0] || null;
}

function pickContrast(profile = {}) {
  const contrasts = Array.isArray(profile.focal_contrasts) ? profile.focal_contrasts : [];
  return contrasts[0] || null;
}

function relationPhrase(relation = {}, verb = "压缩") {
  const axes = (relation.shared_axes || []).map(axisLabel).filter(Boolean);
  if (!axes.length) return "";
  const first = axes[0];
  const second = axes[1] || axes[0];
  return `${verb}${first}${second === first ? "" : `和${second}`}`;
}

function contrastPhrase(contrast = {}) {
  if (!contrast) return "";
  const left = textOf(contrast.left_axis);
  const right = textOf(contrast.right_axis);
  if (!left || !right) return "";
  return `${left}和${right}`;
}

function buildMicroCandidate({ query, turnFunction, currentUnits, domain, activeTopic }) {
  const fn = textOf(turnFunction);
  const q = textOf(query);
  const topicDomain = domainFrom({ domain, query: q, activeTopic });
  const profile = primitiveProfileFor(topicDomain) || {};
  const nativeVerb = pickPrimitive(topicDomain, "native_verbs", "压缩");
  const relation = pickRelation(profile, q);
  const contrast = pickContrast(profile);
  const primitivesUsed = [];

  if (fn === "confirmation") {
    const confirmationKind = detectUserConfirmationPolarity(q);
    if (confirmationKind !== "confirmation_question" || currentUnits.polarity !== "affirmative") return null;
    const referent = currentUnits.named_items?.[0] || currentUnits.entities?.find((item) => !/^person\.|^author\./.test(item)) || "";
    if (!referent) return null;
    return {
      text: sentence(`是，仍然是${referent}`),
      primitives_used: []
    };
  }

  if (fn === "analogy_statement" || fn === "reflection" || fn === "declaration_with_signal") {
    if (relation) {
      primitivesUsed.push(relation.id);
      const phrase = relationPhrase(relation, relation.licensed_verbs?.[0] || nativeVerb);
      if (phrase) return { text: sentence(`是，像在${phrase}`), primitives_used: primitivesUsed };
    }
    const contrastText = contrastPhrase(contrast);
    if (contrastText) {
      primitivesUsed.push(contrast.id);
      return { text: sentence(`是，张力在${contrastText}`), primitives_used: primitivesUsed };
    }
  }

  if (fn === "affective_disclosure") {
    const relationForMemory = relation && /memory|记忆/.test(`${relation.shared_axes || []} ${q}`) ? relation : null;
    if (!relationForMemory) return null;
    primitivesUsed.push(relationForMemory.id);
    const phrase = relationPhrase(relationForMemory, relationForMemory.licensed_verbs?.[0] || nativeVerb);
    return phrase ? { text: sentence(`像是被${phrase}碰到`), primitives_used: primitivesUsed } : null;
  }

  if (fn === "deepening_invitation") {
    if (relation) {
      primitivesUsed.push(relation.id);
      const axis = axisLabel(relation.shared_axes?.[0] || "");
      const verb = relation.licensed_verbs?.[0] || nativeVerb;
      if (axis) return { text: question(`它怎样用${verb}改变${axis}`), primitives_used: primitivesUsed };
    }
    if (contrast) {
      primitivesUsed.push(contrast.id);
      return { text: question(`${contrastPhrase(contrast)}真正差在哪里`), primitives_used: primitivesUsed };
    }
  }

  return null;
}

function makeCandidate({ query, turnFunction, currentAnswer, domain, surfaceControl, activeTopic }) {
  return buildMicroCandidate({
    query,
    turnFunction,
    currentAnswer,
    domain,
    surfaceControl,
    activeTopic,
    currentUnits: surfaceControl.current_units || {}
  });
}

function fallbackUnitSummary(units) {
  return {
    entities: units.entities || [],
    active_referent: units.active_referent || "",
    polarity: units.polarity || "neutral",
    claims: (units.claims || []).slice(0, 6),
    named_items: units.named_items || [],
    qualifiers: units.qualifiers || [],
    relation_ids: units.relation_ids || [],
    required_units: units.required_units || [],
    evidence_ids: units.evidence_ids || []
  };
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
  const activeReferent = binding?.active_referent || binding?.target_ids?.[0] || activeTopic?.id || "";
  const currentUnits = extractSurfaceContentUnits({
    answer: current,
    query,
    plan,
    binding,
    responseType,
    responseMode,
    activeReferent,
    evidenceIds
  });
  const base = {
    enabled: true,
    live_switch: false,
    candidate_answer: current,
    content_units_used: fallbackUnitSummary(currentUnits),
    primitives_used: [],
    realization_shape: "fallback_current",
    dropped_reasoning_units: [],
    forbidden_pattern_hits: prohibitionHits(current),
    prohibition_hits: [],
    confidence: 0,
    surface_confidence: 0,
    required_units_preserved: true,
    semantic_verifier: {
      ok: true,
      semantic_preservation_ok: true,
      hard_failures: [],
      warnings: ["no_shadow_candidate_attempted"]
    },
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
  const candidateResult = makeCandidate({
    query,
    turnFunction: fn,
    currentAnswer: current,
    domain: resolvedDomain,
    surfaceControl: { ...surfaceControl, current_units: currentUnits },
    activeTopic,
    binding,
    plan
  });
  const candidate = textOf(candidateResult?.text || "");
  if (!candidate) {
    return {
      ...base,
      fallback_to_current_reason: "no_confident_candidate",
      fallback_reason: "no_confident_candidate"
    };
  }

  const hits = prohibitionHits(candidate);
  const candidateUnits = extractSurfaceContentUnits({
    answer: candidate,
    query,
    plan,
    binding,
    responseType,
    responseMode,
    activeReferent,
    evidenceIds
  });
  const semanticVerifier = verifySurfaceCandidate({
    query,
    currentAnswer: current,
    candidateAnswer: candidate,
    currentUnits,
    candidateUnits,
    plan: {
      ...plan,
      relation_ids: [...(Array.isArray(plan?.relation_ids) ? plan.relation_ids : []), ...(candidateResult?.primitives_used || [])],
      primitive_ids: [...(Array.isArray(plan?.primitive_ids) ? plan.primitive_ids : []), ...(candidateResult?.primitives_used || [])]
    },
    binding,
    responseType,
    responseMode,
    turnFunction: fn,
    surfaceControl,
    evidenceIds
  });
  const tooLongForNone = surfaceControl.reasoning_budget === "none" && zhChars(candidate) > 70;
  const confidence = Math.max(0, Math.min(1, semanticVerifier.confidence - (hits.length ? 0.24 : 0) - (tooLongForNone ? 0.2 : 0)));
  if (hits.length || tooLongForNone || !semanticVerifier.ok || confidence < 0.6) {
    const fallbackReason = hits.length
      ? "candidate_hits_surface_prohibition"
      : !semanticVerifier.ok
        ? "candidate_failed_semantic_verifier"
        : "candidate_confidence_below_threshold";
    return {
      ...base,
      candidate_answer: current,
      content_units_used: fallbackUnitSummary(currentUnits),
      primitives_used: [],
      forbidden_pattern_hits: hits,
      prohibition_hits: hits,
      confidence,
      surface_confidence: confidence,
      required_units_preserved: semanticVerifier.missing_required_units.length === 0,
      semantic_verifier: semanticVerifier,
      fallback_to_current_reason: fallbackReason,
      fallback_reason: fallbackReason
    };
  }

  return {
    ...base,
    candidate_answer: candidate,
    content_units_used: fallbackUnitSummary(candidateUnits),
    primitives_used: candidateResult?.primitives_used || [],
    realization_shape: surfaceControl.sentence_shape || "one_sentence",
    dropped_reasoning_units: (currentUnits.claims || []).filter((unit) => !candidate.includes(unit)).slice(0, 4),
    forbidden_pattern_hits: hits,
    prohibition_hits: hits,
    confidence,
    surface_confidence: confidence,
    required_units_preserved: semanticVerifier.missing_required_units.length === 0,
    semantic_verifier: semanticVerifier,
    dropped_optional_units: [],
    fallback_to_current_reason: "",
    fallback_reason: ""
  };
}
