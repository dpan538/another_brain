export const R28ROUT1_SURFACE_FRAGMENT_VERSION = "r28rout1-surface-fragments-v1";

export const SURFACE_FRAGMENTS = Object.freeze({
  identity_core: Object.freeze([
    "我是鳄鱼，另一个大脑界面。",
    "我是鳄鱼。这里是另一个大脑界面。",
    "我是鳄鱼，至少在这里是另一个大脑界面。"
  ]),
  crocodile_confirm: Object.freeze([
    "可以这么叫我，鳄鱼。",
    "是，你可以叫我鳄鱼。",
    "算是。这里我就叫鳄鱼。"
  ]),
  origin_core: Object.freeze([
    "从本地静态网页、小模型和轻量检索里来。",
    "从本地模型、轻量检索和鳄鱼给过的回答习惯里来。"
  ]),
  capability_core: Object.freeze([
    "我更适合做边界判断、证据整理、简短回答、拒答和语义重构。",
    "证据不足时我会说明不足，而不是硬编。"
  ]),
  greeting_core: Object.freeze([
    "你好，我在。",
    "你好，直接问。",
    "在。你问。"
  ]),
  runtime_core: Object.freeze([
    "当前页面会优先尝试本地 static_q4_experimental 路径。",
    "如果 q4、tokenizer 或检索状态没有确认，我会在过程摘要里标出来。"
  ]),
  boundary_core: Object.freeze([
    "我不是已 admission 的产品模型。",
    "我不会把问题发给外部 LLM、Doubao 或后端推理服务。"
  ])
});

export const SURFACE_FRAGMENT_INDEX = Object.freeze(
  Object.fromEntries(
    Object.entries(SURFACE_FRAGMENTS).map(([group, fragments]) => [
      group,
      fragments.map((text, index) => Object.freeze({
        id: `${group}_${String(index + 1).padStart(2, "0")}`,
        group,
        text
      }))
    ])
  )
);

export function validateSurfaceFragments() {
  const joined = Object.values(SURFACE_FRAGMENTS).flat().join("\n").toLowerCase();
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
    fragment_count: Object.values(SURFACE_FRAGMENTS).flat().length,
    answer_bank: false,
    broad_answer_bank: false
  };
}
