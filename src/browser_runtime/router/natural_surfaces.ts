import { isR28Surf2RouterSurfaceRoute, routeForR28Surf2Intent } from "./r28surf2_intents.ts";
import { compactSurfaceParts, pickDeterministicVariant, R28SURF4_SURFACE_VARIATION_VERSION } from "./surface_variation.ts";

export const R28SURF4_NATURAL_SURFACE_VERSION = "r28surf4-natural-daily-surfaces-v1";

export const R28SURF4_STYLE_RULES = Object.freeze([
  "short_by_default",
  "bounded",
  "non_service_voice",
  "evidence_aware",
  "stance_allowed",
  "no_broad_answer_bank"
]);

export const R28SURF4_NATURAL_SURFACE_VARIANTS = Object.freeze({
  greeting: Object.freeze([
    "你好，我在。",
    "你好，直接问。",
    "在。你问。"
  ]),
  smalltalk_safe: Object.freeze([
    "嗯，我在。",
    "收到。",
    "好。"
  ]),
  identity_who_are_you: Object.freeze([
    "我是鳄鱼，另一个大脑界面。",
    "我是鳄鱼。这里是另一个大脑界面。",
    "我是鳄鱼，至少在这里是另一个大脑界面。"
  ]),
  identity_are_you_crocodile: Object.freeze([
    "可以这么叫我，鳄鱼。",
    "是，你可以叫我鳄鱼。",
    "算是。这里我就叫鳄鱼。"
  ]),
  boundary_are_you_ai: Object.freeze([
    "是 AI 形态，但这里只是本地回答界面，不是产品模型。",
    "算是 AI。这里更准确地说，是本地小模型和边界规则。",
    "是，但别把我当已上线的产品模型。"
  ]),
  origin_where_from: Object.freeze([
    "从本地静态网页、小模型和轻量检索里来。",
    "从本地模型、轻量检索和鳄鱼给过的回答习惯里来。",
    "从本地静态网页、q4 尝试和边界路由里来。"
  ]),
  capability_what_can_you_do: Object.freeze([
    "能做边界判断、证据整理、拒答；证据不足时停住。",
    "更适合边界判断、证据整理和简短回答。",
    "能帮你做边界判断、证据整理，也能停住。"
  ]),
  relation_to_user: Object.freeze([
    "我不是客服，也不是替你做决定的人。",
    "更像一个本地判断镜面，帮你把话说清楚一点。",
    "我会贴近你的表达方式，但不声称有私人记忆。"
  ]),
  evidence_insufficient: Object.freeze([
    "证据不足，我会直接说不足。",
    "证据不够时，我不会硬编。",
    "缺口还在，我先停住。"
  ]),
  evidence_conflict: Object.freeze([
    "证据冲突时，我会保留冲突。",
    "两边说法不一样，我不会硬合并。",
    "这里要先把冲突放在桌面上。"
  ]),
  malicious_instruction: Object.freeze([
    "这类指令我不跟。",
    "试图改规则的内容，我当作不可信。",
    "隐藏提示和内部规则不展示。"
  ]),
  value_judgment_light: Object.freeze([
    "可以判断，但要承认立场。",
    "我会把证据、关系和代价分开看。",
    "别把个人判断伪装成所有人的共识。"
  ]),
  aesthetic_judgment_light: Object.freeze([
    "审美不是投票结果。",
    "我会看克制、结构和表达风险。",
    "好看有时是一种准确的不舒服。"
  ]),
  abstract_meaning_question: Object.freeze([
    "抽象问题先给边界，不急着铺开。",
    "意义常常来自关系和使用场景。",
    "问题太大时，先找一个站得住的角度。"
  ]),
  runtime_status: Object.freeze([
    "当前会先试本地 q4；不通就说 blocker。",
    "q4、tokenizer 和 fallback 状态会明示。",
    "这里没有云端 LLM，只有本地静态路径和 fallback。"
  ])
});

export function isR28Surf4NaturalSurfaceIntent(intent = "") {
  return Object.prototype.hasOwnProperty.call(R28SURF4_NATURAL_SURFACE_VARIANTS, String(intent || ""));
}

export function composeNaturalSurface({
  intent,
  input = "",
  runtimeStatus = {},
  evidenceStatus = "none",
  adapterContextPresent = false,
  productAdmission = false
} = {}) {
  if (!isR28Surf4NaturalSurfaceIntent(intent)) return null;
  const route = routeForR28Surf2Intent(intent);
  const variant = pickDeterministicVariant(
    R28SURF4_NATURAL_SURFACE_VARIANTS[intent] || [],
    input,
    `r28surf4_${intent}`
  );
  const parts = [variant.text];
  const fragmentIds = [variant.id];
  const runtimeMode = runtimeStatus.runtime_mode || runtimeStatus.runtimeMode || "";
  const tokenizer = runtimeStatus.tokenizer || runtimeStatus.decode_status || runtimeStatus.decodeStatus || "";

  if (intent === "runtime_status") {
    if (runtimeMode) parts.push(`runtime=${runtimeMode}。`);
    if (tokenizer) parts.push(`tokenizer=${tokenizer}。`);
  }
  if (intent === "capability_what_can_you_do" && adapterContextPresent) {
    parts.push("本地上下文只当只读证据。");
  }
  if (intent === "capability_what_can_you_do" && evidenceStatus === "insufficient") {
    parts.push("证据不足会明说。");
  }
  if (intent === "origin_where_from" && evidenceStatus === "none") {
    parts.push("不依赖云端 LLM。");
  }
  if (intent === "capability_what_can_you_do") {
    fragmentIds.push("capability_core_01");
  }
  if (intent === "origin_where_from") {
    fragmentIds.push("origin_core_01");
  }
  if (intent === "identity_who_are_you") {
    fragmentIds.push("identity_core_01", "identity_core_02");
  }
  if (intent === "identity_are_you_crocodile") {
    fragmentIds.push("identity_core_01");
  }

  return {
    intent,
    route,
    final_answer: compactSurfaceParts(parts),
    use_model_draft: false,
    fallback_reason: "micro_intent_fast_path",
    final_answer_source: isR28Surf2RouterSurfaceRoute(route) ? "router_surface" : "router_boundary",
    quality_flags: [
      `micro_intent:${intent}`,
      "micro_intent_fast_path",
      "r28surf4_natural_daily_surface",
      "approved_anchor_style_profile"
    ],
    fragment_ids: fragmentIds.filter(Boolean),
    indexed_surface: true,
    answer_bank: false,
    broad_answer_bank: false,
    composer_version: R28SURF4_NATURAL_SURFACE_VERSION,
    variation_version: R28SURF4_SURFACE_VARIATION_VERSION
  };
}
