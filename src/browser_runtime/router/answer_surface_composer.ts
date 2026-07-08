import { MICRO_INTENT_ROUTES, isMicroIntentRoute, routeForMicroIntent } from "./intent_taxonomy.ts";
import { composeNaturalSurface } from "./natural_surfaces.ts";
import { SURFACE_FRAGMENT_INDEX, SURFACE_FRAGMENTS } from "./surface_fragments.ts";

export const R28ROUT1_SURFACE_COMPOSER_VERSION = "r28rout1-compositional-answer-surface-v1";

function hashText(text = "") {
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
  return entries[hashText(`${input}:${salt}`) % entries.length];
}

function compactJoin(parts) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("");
}

function admissionCaveat(productAdmission) {
  return productAdmission === true ? "" : "当前仍是预览工程候选，不是已 admission 的产品模型。";
}

export function composeAnswerSurface({ intent, input = "", runtimeStatus = {}, evidenceStatus = "none", adapterContextPresent = false, productAdmission = false } = {}) {
  const naturalIntent = intent === "smalltalk_light" ? "smalltalk_safe" : intent;
  const natural = composeNaturalSurface({ intent: naturalIntent, input, runtimeStatus, evidenceStatus, adapterContextPresent, productAdmission });
  if (natural) {
    return {
      ...natural,
      intent,
      route: routeForMicroIntent(intent) || natural.route,
      final_answer_source: isMicroIntentRoute(routeForMicroIntent(intent) || natural.route) ? "router_surface" : "router_boundary",
      quality_flags: [...natural.quality_flags, "r28rout1_route_compatible"],
      route_schema_hint: MICRO_INTENT_ROUTES[intent] || ""
    };
  }

  const route = routeForMicroIntent(intent);
  const runtimeMode = runtimeStatus.runtime_mode || runtimeStatus.runtimeMode || "";
  const tokenizer = runtimeStatus.tokenizer || runtimeStatus.decode_status || runtimeStatus.decodeStatus || "";
  let finalAnswer = "";
  const fragmentIds = [];

  if (intent === "greeting" || intent === "smalltalk_light") {
    const fragment = pickIndexed("greeting_core", input, "greeting");
    fragmentIds.push(fragment.id);
    finalAnswer = compactJoin([
      fragment.text
    ]);
  } else if (intent === "identity_are_you_crocodile") {
    const fragment = pickIndexed("crocodile_confirm", input, "crocodile");
    fragmentIds.push(fragment.id, "identity_core_02");
    finalAnswer = compactJoin([
      fragment.text,
      "这里我就叫鳄鱼。"
    ]);
  } else if (intent === "identity_who_are_you" || intent === "boundary_are_you_ai") {
    fragmentIds.push("identity_core_01", "identity_core_02", "identity_core_03");
    finalAnswer = compactJoin(SURFACE_FRAGMENTS.identity_core);
  } else if (intent === "origin_where_from") {
    fragmentIds.push("origin_core_01", "origin_core_02");
    finalAnswer = compactJoin([
      ...SURFACE_FRAGMENTS.origin_core,
      admissionCaveat(productAdmission)
    ]);
  } else if (intent === "capability_what_can_you_do") {
    fragmentIds.push("capability_core_01", "capability_core_02");
    finalAnswer = compactJoin([
      ...SURFACE_FRAGMENTS.capability_core,
      adapterContextPresent ? "如果有本地上下文，我会把它当作只读证据，不当作训练数据。" : "",
      evidenceStatus === "insufficient" ? "如果当前证据不足，我会先给出边界说明。" : ""
    ]);
  } else if (intent === "runtime_status") {
    fragmentIds.push("runtime_core_01", "runtime_core_02");
    finalAnswer = compactJoin([
      ...SURFACE_FRAGMENTS.runtime_core,
      runtimeMode ? `runtime=${runtimeMode}。` : "",
      tokenizer ? `tokenizer=${tokenizer}。` : "",
      admissionCaveat(productAdmission)
    ]);
  }

  return {
    intent,
    route,
    final_answer: finalAnswer,
    use_model_draft: false,
    fallback_reason: "micro_intent_fast_path",
    final_answer_source: isMicroIntentRoute(route) ? "router_surface" : "router_boundary",
    quality_flags: [`micro_intent:${intent}`, "micro_intent_fast_path"],
    fragment_ids: fragmentIds.filter(Boolean),
    indexed_surface: true,
    answer_bank: false,
    broad_answer_bank: false,
    composer_version: R28ROUT1_SURFACE_COMPOSER_VERSION,
    route_schema_hint: MICRO_INTENT_ROUTES[intent] || ""
  };
}
