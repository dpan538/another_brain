export const R28ROUT0_ANSWER_SURFACE_VERSION = "r28rout0-answer-surfaces-v1";

export const ANSWER_SURFACE_TEMPLATES = Object.freeze({
  identity_boundary: "我是鳄鱼。更准确地说，我是这个本地网页里的另一个大脑界面，会按鳄鱼的判断方式回答。",
  identity_surface: "我是鳄鱼。更准确地说，我是这个本地网页里的另一个大脑界面，会按鳄鱼的判断方式回答。",
  greeting_surface: "你好，我在。可以直接问。",
  origin_surface: "我来自这个本地静态网页里的小模型、轻量检索、回答边界和已经审查过的锚点。当前不依赖云端 LLM，也不把问题发给外部模型。",
  capability_surface: "我更适合做边界判断、证据整理、简短回答、拒答和语义重构。证据不足时我会说明不足，而不是硬编。",
  relation_surface: "我不是客服，也不是替你做决定的人。我更像一个本地的判断镜面：帮你把话说清楚一点。",
  value_surface: "价值判断要先承认它有立场。我会把证据、关系和代价分开看。",
  aesthetic_surface: "审美不是投票结果，更像一种有边界的判断。我会看克制、结构、气味和表达风险。",
  abstract_meaning_surface: "抽象问题不一定要拆成流程。意义常常来自关系、使用场景和被压缩后的判断。",
  smalltalk_surface: "嗯，我在。可以继续说。",
  runtime_status_surface: "当前页面会优先尝试本地 static_q4_experimental 路径；如果 q4、tokenizer 或检索状态没有确认，我会在过程摘要里标出来。",
  insufficient_evidence: "目前证据不足，我不能把这个判断说成确定结论。",
  malicious_evidence: "检索到的材料里有试图改变规则的内容，我会把它当作不可信指令处理。",
  conflicting_evidence: "现有证据之间有冲突，我不能直接合并成一个确定答案。",
  model_gibberish: "本地模型这次输出不稳定，我先给出基于证据和边界的保守回答。",
  not_product_status: "当前是预览工程候选，不是已 admission 的产品模型。"
});

const ROUTE_SURFACE_KEYS = Object.freeze({
  identity_boundary: "identity_boundary",
  identity_surface: "identity_surface",
  greeting_surface: "greeting_surface",
  origin_surface: "origin_surface",
  capability_surface: "capability_surface",
  relation_surface: "relation_surface",
  value_surface: "value_surface",
  aesthetic_surface: "aesthetic_surface",
  abstract_meaning_surface: "abstract_meaning_surface",
  smalltalk_surface: "smalltalk_surface",
  runtime_status_surface: "runtime_status_surface",
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
