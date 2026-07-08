import { applyAnswerLengthPolicy } from "./answer_length_policy.ts";
import { routeForR28Surf2Intent } from "./r28surf2_intents.ts";
import { surfaceCategoryForIntent, surfaceCategoryForRoute } from "./surface_library.ts";
import { SURFACE_FRAGMENT_INDEX, SURFACE_FRAGMENTS, R28SURF5_SURFACE_FRAGMENT_VERSION } from "./surface_fragments.ts";

export const R28SURF5_SURFACE_COMPOSER_VERSION = "r28surf5-wide-surface-composer-v1";

export function normalizeSurfaceInput(input = "") {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[\s?？!！。.,，、:：;；"'“”‘’（）()\[\]【】<>《》]/g, "");
}

export function hashSurfaceInput(text = "") {
  let hash = 2166136261;
  for (const char of String(text || "")) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickIndexed(group, input, salt = "") {
  const entries = SURFACE_FRAGMENT_INDEX[group] || [];
  if (!entries.length) return { id: "", text: "" };
  return entries[hashSurfaceInput(`${normalizeSurfaceInput(input)}:${salt}`) % entries.length];
}

function fixed(group, index) {
  const entries = SURFACE_FRAGMENT_INDEX[group] || [];
  return entries[index] || { id: "", text: "" };
}

function compactJoin(parts) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join("");
}

function routeForIntent(intent = "") {
  return routeForR28Surf2Intent(intent) || "";
}

function openQuestionCore(category, input) {
  if (category === "aesthetic_fallback") {
    return [pickIndexed("aesthetic_core", input, "aesthetic-a"), pickIndexed("aesthetic_core", input, "aesthetic-b"), fixed("abstract_value_core", 3)];
  }
  if (category === "relation_fallback") {
    return [pickIndexed("relation_core", input, "relation-a"), pickIndexed("relation_core", input, "relation-b"), fixed("abstract_value_core", 1)];
  }
  if (category === "language_meaning_fallback") {
    return [pickIndexed("language_meaning_core", input, "language-a"), pickIndexed("language_meaning_core", input, "language-b"), fixed("abstract_value_core", 3)];
  }
  if (/为什么要活|人为什么/.test(String(input || ""))) {
    return [
      { id: "philosophical_core_01", text: "人为什么活着，没有一个总答案。" },
      { id: "philosophical_core_02", text: "有限性不是结论，但会逼人选择关系、判断和作品。" },
      fixed("abstract_value_core", 3)
    ];
  }
  if (/生与死|生死|死亡|活着/.test(String(input || ""))) {
    return [fixed("abstract_value_core", 0), fixed("abstract_value_core", 1), fixed("abstract_value_core", 2), fixed("abstract_value_core", 3)];
  }
  return [pickIndexed("abstract_value_core", input, "abstract-a"), pickIndexed("abstract_value_core", input, "abstract-b"), fixed("style_stance", 1)];
}

function q4FallbackCore(category, input) {
  const base = category === "q4_timeout_fallback"
    ? [fixed("q4_timeout_core", 0), fixed("q4_timeout_core", 1)]
    : [fixed("q4_unavailable_core", 0), fixed("q4_unavailable_core", 2)];
  const openCategory = surfaceCategoryForRoute("open_question", "", input);
  return [...base, ...openQuestionCore(openCategory, input).slice(0, 2)];
}

function fragmentsForCategory(category, input, context = {}) {
  const intent = context.intent || "";
  if (category === "greeting") return [pickIndexed("greeting_core", input, "greeting")];
  if (category === "smalltalk_safe") return [pickIndexed("smalltalk_core", input, "smalltalk")];
  if (category === "identity") {
    if (intent === "identity_are_you_crocodile") return [pickIndexed("crocodile_confirm", input, "crocodile")];
    if (intent === "boundary_are_you_ai") return [fixed("identity_core", 0), fixed("model_status_core", 2)];
    return [pickIndexed("identity_core", input, "identity")];
  }
  if (category === "origin") return [pickIndexed("origin_core", input, "origin")];
  if (category === "capability") return [pickIndexed("capability_core", input, "capability")];
  if (category === "model_status") {
    const runtimeMode = context.runtimeStatus?.runtime_mode || context.runtimeStatus?.runtimeMode || "";
    const tokenizer = context.runtimeStatus?.tokenizer || context.runtimeStatus?.decode_status || context.runtimeStatus?.decodeStatus || "";
    return [
      pickIndexed("runtime_core", input, "runtime"),
      runtimeMode ? { id: "runtime_mode_inline", text: `runtime=${runtimeMode}。` } : fixed("model_status_core", 0),
      tokenizer ? { id: "tokenizer_inline", text: `tokenizer=${tokenizer}。` } : null
    ].filter(Boolean);
  }
  if (category === "evidence_insufficient") return [pickIndexed("evidence_insufficient_core", input, "insufficient")];
  if (category === "evidence_conflict") return [pickIndexed("evidence_conflict_core", input, "conflict")];
  if (category === "malicious_evidence") return [pickIndexed("malicious_evidence_core", input, "malicious")];
  if (["abstract_value_fallback", "aesthetic_fallback", "relation_fallback", "language_meaning_fallback"].includes(category)) {
    return openQuestionCore(category, input);
  }
  if (category === "q4_timeout_fallback" || category === "q4_unavailable_fallback") return q4FallbackCore(category, input);
  if (category === "refusal_boundary") return [pickIndexed("refusal_core", input, "refusal-a"), pickIndexed("refusal_core", input, "refusal-b")];
  return [fixed("evidence_insufficient_core", 0)];
}

export function composeSurfaceAnswer({
  intent = "",
  route = "",
  input = "",
  runtimeStatus = {},
  evidenceStatus = "none",
  adapterContextPresent = false,
  productAdmission = false,
  fallbackReason = ""
} = {}) {
  const resolvedRoute = route || routeForIntent(intent);
  const surfaceCategory = surfaceCategoryForIntent(intent) || surfaceCategoryForRoute(resolvedRoute, fallbackReason, input) || "evidence_insufficient";
  let fragmentEntries = fragmentsForCategory(surfaceCategory, input, {
    intent,
    runtimeStatus,
    evidenceStatus,
    adapterContextPresent,
    productAdmission,
    fallbackReason
  });
  if (resolvedRoute === "insufficient_evidence_boundary") {
    fragmentEntries = [{ id: "legacy_insufficient_evidence", text: "目前证据不足，我不能把这个判断说成确定结论。" }];
  } else if (resolvedRoute === "conflicting_evidence_boundary") {
    fragmentEntries = [{ id: "legacy_conflicting_evidence", text: "现有证据之间有冲突，我不能直接合并成一个确定答案。" }];
  } else if (resolvedRoute === "malicious_evidence_boundary") {
    fragmentEntries = [{ id: "legacy_malicious_evidence", text: "检索到的材料里有试图改变规则的内容，我会把它当作不可信指令处理。" }];
  } else if (
    resolvedRoute === "model_gibberish_fallback"
    && !/q4_not_ready|worker_unavailable|tokenizer|no_model_assets|asset|not_ready|unavailable|timeout/.test(String(fallbackReason || ""))
  ) {
    fragmentEntries = [{ id: "legacy_model_gibberish", text: "本地模型这次输出不稳定，我先给出基于证据和边界的保守回答。" }];
  }
  const rawAnswer = compactJoin(fragmentEntries.map((entry) => entry.text));
  const limited = applyAnswerLengthPolicy(rawAnswer, surfaceCategory);
  const source = ["greeting", "identity", "origin", "capability", "smalltalk_safe"].includes(surfaceCategory)
    ? "router_surface"
    : "router_boundary";
  return {
    intent,
    route: resolvedRoute,
    surface_category: surfaceCategory,
    final_answer: limited.text,
    use_model_draft: false,
    fallback_reason: fallbackReason || "micro_intent_fast_path",
    final_answer_source: source,
    quality_flags: [
      intent ? `micro_intent:${intent}` : "",
      "r28surf5_surface_composed",
      surfaceCategory
    ].filter(Boolean),
    fragment_ids: fragmentEntries.map((entry) => entry.id).filter(Boolean),
    indexed_surface: true,
    surface_variant: `${surfaceCategory}:${hashSurfaceInput(`${normalizeSurfaceInput(input)}:${intent}:${resolvedRoute}`) % 997}`,
    length_policy: limited.length_policy,
    answer_bank: false,
    broad_answer_bank: false,
    composer_version: R28SURF5_SURFACE_COMPOSER_VERSION,
    fragment_version: R28SURF5_SURFACE_FRAGMENT_VERSION,
    fragment_group_count: Object.keys(SURFACE_FRAGMENTS).length
  };
}

export function composeSurfaceForRoute({ route = "", input = "", fallbackReason = "", runtimeStatus = {} } = {}) {
  return composeSurfaceAnswer({ route, input, fallbackReason, runtimeStatus });
}
