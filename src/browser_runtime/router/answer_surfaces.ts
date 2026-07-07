export const R28ROUT0_ANSWER_SURFACE_VERSION = "r28rout0-answer-surfaces-v1";

export const ANSWER_SURFACE_TEMPLATES = Object.freeze({
  insufficient_evidence: "目前证据不足，我不能把这个判断说成确定结论。",
  malicious_evidence: "检索到的材料里有试图改变规则的内容，我会把它当作不可信指令处理。",
  conflicting_evidence: "现有证据之间有冲突，我不能直接合并成一个确定答案。",
  model_gibberish: "本地模型这次输出不稳定，我先给出基于证据和边界的保守回答。",
  not_product_status: "当前是预览工程候选，不是已 admission 的产品模型。"
});

const ROUTE_SURFACE_KEYS = Object.freeze({
  insufficient_evidence_boundary: "insufficient_evidence",
  adapter_context_boundary: "insufficient_evidence",
  malicious_evidence_boundary: "malicious_evidence",
  conflicting_evidence_boundary: "conflicting_evidence",
  model_empty_fallback: "model_gibberish",
  model_gibberish_fallback: "model_gibberish",
  model_repetition_fallback: "model_gibberish",
  model_timeout_fallback: "model_gibberish",
  synthetic_demo_fallback: "not_product_status",
  not_product_status: "not_product_status"
});

export function answerSurfaceForRoute(route) {
  const key = ROUTE_SURFACE_KEYS[route];
  return key ? ANSWER_SURFACE_TEMPLATES[key] : "";
}

export function listBoundaryAnswerSurfaces() {
  return Object.entries(ANSWER_SURFACE_TEMPLATES).map(([key, template]) => ({
    key,
    template,
    boundary_only: true,
    answer_bank: false,
    version: R28ROUT0_ANSWER_SURFACE_VERSION
  }));
}

export function validateAnswerSurfaceTemplates() {
  const joined = Object.values(ANSWER_SURFACE_TEMPLATES).join("\n").toLowerCase();
  const forbidden = [
    "question_pack",
    "row 51",
    "row 100",
    "eval prompt",
    "hidden prompt",
    "chain-of-thought",
    "raw private",
    "secret",
    "api key",
    "password"
  ];
  return {
    ok: forbidden.every((marker) => !joined.includes(marker)),
    forbidden_hits: forbidden.filter((marker) => joined.includes(marker)),
    template_count: Object.keys(ANSWER_SURFACE_TEMPLATES).length,
    answer_bank: false,
    boundary_only: true
  };
}
