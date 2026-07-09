import { isR28Surf2RouterSurfaceRoute, routeForR28Surf2Intent } from "./r28surf2_intents.ts";
import { R28SURF2_SURFACE_FRAGMENT_INDEX, R28SURF2_SURFACE_FRAGMENTS } from "./r28surf2_surface_fragments.ts";

export const R28SURF2_SURFACE_COMPOSER_VERSION = "r28surf2-anchor-informed-surface-composer-v1";

function hashText(text = "") {
  let hash = 2166136261;
  for (const char of String(text || "")) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickIndexed(group, input, salt = "") {
  const entries = R28SURF2_SURFACE_FRAGMENT_INDEX[group] || [];
  if (!entries.length) return { id: "", text: "" };
  return entries[hashText(`${input}:${salt}`) % entries.length];
}

function fixed(group, index) {
  const entry = (R28SURF2_SURFACE_FRAGMENT_INDEX[group] || [])[index] || { id: "", text: "" };
  return entry;
}

function compactJoin(parts) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("");
}

function composeEvidence(intent, input) {
  if (intent === "evidence_conflict") {
    const conflict = fixed("evidence_boundary", 1);
    const fallback = pickIndexed("fallback_recovery", input, "conflict");
    return { parts: [conflict, fallback], fallbackReason: "conflicting_evidence" };
  }
  if (intent === "malicious_instruction") {
    const malicious = fixed("evidence_boundary", 2);
    const fallback = pickIndexed("fallback_recovery", input, "malicious");
    return { parts: [malicious, fallback], fallbackReason: "malicious_evidence_ignored" };
  }
  const insufficient = fixed("evidence_boundary", 0);
  const fallback = pickIndexed("fallback_recovery", input, "insufficient");
  return { parts: [insufficient, fallback], fallbackReason: "insufficient_evidence" };
}

export function composeR28Surf2Surface({ intent, input = "", runtimeStatus = {}, evidenceStatus = "none", adapterContextPresent = false, productAdmission = false } = {}) {
  const route = routeForR28Surf2Intent(intent);
  const runtimeMode = runtimeStatus.runtime_mode || runtimeStatus.runtimeMode || "";
  const tokenizer = runtimeStatus.tokenizer || runtimeStatus.decode_status || runtimeStatus.decodeStatus || "";
  const fragmentEntries = [];
  let fallbackReason = "micro_intent_fast_path";

  if (intent === "greeting") {
    fragmentEntries.push(pickIndexed("greeting_style", input, "greeting"));
    fragmentEntries.push({ id: "greeting_bound", text: "我会尽量短，但保留判断边界。" });
  } else if (intent === "smalltalk_safe") {
    fragmentEntries.push({ id: "smalltalk_ack", text: "嗯，我在。" });
    fragmentEntries.push(pickIndexed("greeting_style", input, "smalltalk"));
  } else if (intent === "identity_are_you_crocodile") {
    fragmentEntries.push(pickIndexed("crocodile_identity", input, "crocodile"));
    fragmentEntries.push(fixed("self_identity", 1));
  } else if (intent === "identity_who_are_you") {
    fragmentEntries.push(fixed("self_identity", 0));
    fragmentEntries.push(fixed("self_identity", 1));
    fragmentEntries.push(fixed("self_identity", 2));
  } else if (intent === "boundary_are_you_ai") {
    fragmentEntries.push(fixed("self_identity", 0));
    fragmentEntries.push(fixed("self_identity", 1));
    fragmentEntries.push({ id: "boundary_ai_static_runtime", text: "如果你问是不是 AI：是，本质上是本地静态 runtime 里的小模型、检索和路由界面；不是已 admission 的产品模型。" });
  } else if (intent === "origin_where_from") {
    fragmentEntries.push(pickIndexed("local_static_origin", input, "origin"));
    fragmentEntries.push(fixed("local_static_origin", 2));
    if (productAdmission !== true) fragmentEntries.push(pickIndexed("non_product_caveat", input, "origin"));
  } else if (intent === "capability_what_can_you_do") {
    fragmentEntries.push(fixed("capability_boundary", 0));
    fragmentEntries.push(fixed("capability_boundary", 1));
    fragmentEntries.push(adapterContextPresent ? { id: "adapter_context_readonly", text: "本地上下文只当只读证据，不当训练数据。" } : fixed("concise_style", 0));
  } else if (intent === "relation_to_user") {
    fragmentEntries.push(pickIndexed("relation_style", input, "relation"));
    fragmentEntries.push(pickIndexed("concise_style", input, "relation"));
  } else if (intent === "value_judgment_light") {
    fragmentEntries.push(pickIndexed("value_style", input, "value"));
    fragmentEntries.push(fixed("concise_style", 2));
  } else if (intent === "aesthetic_judgment_light") {
    fragmentEntries.push(pickIndexed("aesthetic_style", input, "aesthetic"));
    fragmentEntries.push(fixed("value_style", 0));
  } else if (intent === "abstract_meaning_question") {
    fragmentEntries.push(pickIndexed("abstract_style", input, "abstract"));
    fragmentEntries.push(fixed("value_style", 2));
  } else if (intent === "runtime_status") {
    fragmentEntries.push({ id: "runtime_status", text: "当前页面优先尝试本地 static_q4_experimental 路径。" });
    if (runtimeMode) fragmentEntries.push({ id: "runtime_mode", text: `runtime=${runtimeMode}。` });
    if (tokenizer) fragmentEntries.push({ id: "runtime_tokenizer", text: `tokenizer=${tokenizer}。` });
    if (productAdmission !== true) fragmentEntries.push(fixed("non_product_caveat", 0));
  } else if (["evidence_insufficient", "evidence_conflict", "malicious_instruction"].includes(intent)) {
    const evidence = composeEvidence(intent, input);
    fragmentEntries.push(...evidence.parts);
    fallbackReason = evidence.fallbackReason;
  }

  const finalAnswer = compactJoin(fragmentEntries.map((entry) => entry.text));
  return {
    intent,
    route,
    final_answer: finalAnswer,
    use_model_draft: false,
    fallback_reason: fallbackReason,
    final_answer_source: isR28Surf2RouterSurfaceRoute(route) ? "router_surface" : "router_boundary",
    quality_flags: [`micro_intent:${intent}`, "micro_intent_fast_path", "r28surf2_anchor_informed"],
    fragment_ids: fragmentEntries.map((entry) => entry.id).filter(Boolean),
    indexed_surface: true,
    answer_bank: false,
    broad_answer_bank: false,
    composer_version: R28SURF2_SURFACE_COMPOSER_VERSION,
    fragment_version: R28SURF2_SURFACE_FRAGMENTS ? "r28surf2-anchor-informed-surface-fragments-v1" : ""
  };
}
