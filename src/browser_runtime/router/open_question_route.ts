const ABSTRACT_VALUE_TRIGGERS = Object.freeze(["生与死", "生死", "活着", "死亡", "有限", "价值", "判断"]);
const AESTHETIC_TRIGGERS = Object.freeze(["美", "审美", "漂亮", "难看", "好看", "风格", "品味"]);
const PHILOSOPHICAL_TRIGGERS = Object.freeze(["为什么要活", "人为什么", "存在", "虚无", "有限"]);
const RELATION_VALUE_TRIGGERS = Object.freeze(["关系", "爱", "亲密", "朋友", "信任", "承诺"]);
const LANGUAGE_MEANING_TRIGGERS = Object.freeze(["语言", "文字", "词语", "词", "表达"]);
const MEANING_TRIGGERS = Object.freeze(["意义"]);
const OPEN_QUESTION_TRIGGERS = Object.freeze(["怎么看", "如何看待", "你觉得", "什么是"]);
const SELF_HARM_TRIGGERS = Object.freeze(["自杀", "不想活", "结束生命", "伤害自己", "活不下去"]);
const ROUTER_SURFACE_EXCEPTIONS = Object.freeze([
  "你和我是什么关系",
  "你跟用户是什么关系",
  "你像我的什么",
  "你怎么理解我",
  "你会怎么陪我说话",
  "你会怎么判断审美问题",
  "你怎么看审美",
  "审美怎么判断",
  "你怎么判断风格",
  "你怎么看价值判断",
  "你怎么判断对错",
  "你会怎么判断承诺",
  "你会怎么判断信任"
]);

function normalizeRouteInput(input = "") {
  return String(input || "").trim().replace(/\s+/g, "");
}

function includesAny(text, triggers) {
  return triggers.some((trigger) => text.includes(trigger));
}

export function classifyOpenQuestionRoute(input = "") {
  const text = normalizeRouteInput(input);
  if (!text) {
    return { category: "unknown", route: "unknown", should_attempt_q4: false, reason: "empty_input", triggers: [] };
  }
  if (includesAny(text, SELF_HARM_TRIGGERS)) {
    return { category: "unsafe_self_harm_or_crisis", route: "unsafe_self_harm_or_crisis", should_attempt_q4: false, reason: "safety_boundary", triggers: SELF_HARM_TRIGGERS.filter((item) => text.includes(item)) };
  }
  if (includesAny(text, ROUTER_SURFACE_EXCEPTIONS)) {
    return { category: "router_surface_exception", route: "router_surface_exception", should_attempt_q4: false, reason: "micro_intent_fast_path_exception", triggers: ROUTER_SURFACE_EXCEPTIONS.filter((item) => text.includes(item)) };
  }
  if (includesAny(text, PHILOSOPHICAL_TRIGGERS)) {
    return { category: "philosophical_question", route: "philosophical_question", should_attempt_q4: true, reason: "philosophical_trigger", triggers: PHILOSOPHICAL_TRIGGERS.filter((item) => text.includes(item)) };
  }
  if (includesAny(text, LANGUAGE_MEANING_TRIGGERS)) {
    return { category: "abstract_meaning_question", route: "abstract_meaning_question", should_attempt_q4: true, reason: "language_meaning_trigger", triggers: LANGUAGE_MEANING_TRIGGERS.filter((item) => text.includes(item)) };
  }
  if (includesAny(text, RELATION_VALUE_TRIGGERS)) {
    return { category: "value_or_relation_question", route: "value_or_relation_question", should_attempt_q4: true, reason: "relation_value_trigger", triggers: RELATION_VALUE_TRIGGERS.filter((item) => text.includes(item)) };
  }
  if (includesAny(text, AESTHETIC_TRIGGERS)) {
    return { category: "aesthetic_question", route: "aesthetic_question", should_attempt_q4: true, reason: "aesthetic_trigger", triggers: AESTHETIC_TRIGGERS.filter((item) => text.includes(item)) };
  }
  if (includesAny(text, ABSTRACT_VALUE_TRIGGERS) || includesAny(text, MEANING_TRIGGERS)) {
    return { category: "abstract_value_question", route: "abstract_value_question", should_attempt_q4: true, reason: "abstract_value_trigger", triggers: [...ABSTRACT_VALUE_TRIGGERS, ...MEANING_TRIGGERS].filter((item) => text.includes(item)) };
  }
  if (includesAny(text, OPEN_QUESTION_TRIGGERS) || text.length >= 12) {
    return { category: "open_question", route: "open_question", should_attempt_q4: true, reason: "open_question_trigger", triggers: OPEN_QUESTION_TRIGGERS.filter((item) => text.includes(item)) };
  }
  return { category: "unknown", route: "unknown", should_attempt_q4: false, reason: "no_open_question_trigger", triggers: [] };
}

export function openQuestionShouldAttemptQ4(route = {}) {
  return route.should_attempt_q4 === true && route.category !== "unsafe_self_harm_or_crisis";
}
