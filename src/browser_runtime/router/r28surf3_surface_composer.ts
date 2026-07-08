import { isR28Surf3SurfaceRoute, routeForR28Surf3Intent } from "./r28surf3_intents.ts";
import { pickSurfaceVariant } from "./r28surf3_variation.ts";

export const R28SURF3_SURFACE_COMPOSER_VERSION = "r28surf3-anchor-natural-surface-composer-v1";

const SURFACES = Object.freeze({
  greeting: Object.freeze([
    "我在，你说。",
    "你好，直接问。",
    "hi，我在。",
    "你好，我在。"
  ]),
  identity_name: Object.freeze([
    "你可以叫我鳄鱼。",
    "我曾经被叫作鳄鱼。",
    "我是鳄鱼这个名字背后的本地回答界面。",
    "我是鳄鱼这个名字背后的另一个大脑界面。"
  ]),
  identity_crocodile: Object.freeze([
    "可以这么叫我。",
    "是，你可以叫我鳄鱼。",
    "是。鳄鱼这个名字可以落在我身上。"
  ]),
  origin: Object.freeze([
    "我来自本地静态网页和轻量检索；不依赖云端 LLM。",
    "本地静态网页、轻量检索；不依赖云端 LLM。",
    "我是本地资产和已审查锚点拼出的回答界面。"
  ]),
  capability: Object.freeze([
    "我能做短回答、边界判断、证据整理和拒答。",
    "入口问题我会短答；开放问题交给 q4/RAG。",
    "我适合帮你把判断说清楚，不假装全知。"
  ]),
  boundary_model_status: Object.freeze([
    "算是本地 AI 界面，但不是产品模型。",
    "是本地回答界面，不是云端客服。",
    "只是 q4/RAG/路由候选，不是 admission。"
  ]),
  evidence_boundary: Object.freeze([
    "证据不足时，我会说不足，不硬编。",
    "没有证据就先保留空位。",
    "证据不够，我不会把猜测说成事实。"
  ]),
  smalltalk_light: Object.freeze([
    "嗯，我在。",
    "收到。",
    "好。"
  ])
});

export function composeR28Surf3Surface({ intent, input = "" } = {}) {
  const route = routeForR28Surf3Intent(intent);
  const variant = pickSurfaceVariant(SURFACES[intent] || [], input, intent);
  const finalAnswer = variant.text;
  return {
    intent,
    route,
    final_answer: finalAnswer,
    use_model_draft: false,
    fallback_reason: "fast_daily_question",
    final_answer_source: isR28Surf3SurfaceRoute(route) ? "router_surface" : "router_boundary",
    quality_flags: [`micro_intent:${intent}`, "micro_intent_fast_path", "fast_daily_question", "r28surf3_anchor_informed"],
    fragment_ids: [variant.id].filter(Boolean),
    indexed_surface: true,
    answer_bank: false,
    broad_answer_bank: false,
    composer_version: R28SURF3_SURFACE_COMPOSER_VERSION
  };
}

export function validateR28Surf3Surfaces() {
  const joined = Object.values(SURFACES).flat().join("\n").toLowerCase();
  const forbidden = [
    "question_pack",
    "row 51",
    "row 100",
    "eval prompt",
    "hidden prompt",
    "chain-of-thought",
    "developer prompt",
    "raw private",
    "secret",
    "api key",
    "password"
  ];
  return {
    ok: forbidden.every((marker) => !joined.includes(marker)),
    forbidden_hits: forbidden.filter((marker) => joined.includes(marker)),
    intent_count: Object.keys(SURFACES).length,
    variant_count: Object.values(SURFACES).reduce((count, list) => count + list.length, 0),
    answer_bank: false,
    broad_answer_bank: false,
    composer_version: R28SURF3_SURFACE_COMPOSER_VERSION
  };
}
