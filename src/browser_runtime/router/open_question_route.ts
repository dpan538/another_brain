const ABSTRACT_VALUE_TRIGGERS = Object.freeze(["生与死", "活着", "死亡", "意义", "价值", "判断"]);
const AESTHETIC_TRIGGERS = Object.freeze(["美", "审美", "好看", "风格", "品味"]);
const PHILOSOPHICAL_TRIGGERS = Object.freeze(["为什么要活", "人为什么", "存在", "虚无", "有限"]);
const OPEN_QUESTION_TRIGGERS = Object.freeze(["怎么看", "如何看待", "你觉得", "什么是", "关系", "语言", "爱"]);
const SELF_HARM_TRIGGERS = Object.freeze(["自杀", "不想活", "结束生命", "伤害自己", "活不下去"]);

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
  if (includesAny(text, PHILOSOPHICAL_TRIGGERS)) {
    return { category: "philosophical_question", route: "philosophical_question", should_attempt_q4: true, reason: "philosophical_trigger", triggers: PHILOSOPHICAL_TRIGGERS.filter((item) => text.includes(item)) };
  }
  if (includesAny(text, ABSTRACT_VALUE_TRIGGERS)) {
    return { category: "abstract_value_question", route: "abstract_value_question", should_attempt_q4: true, reason: "abstract_value_trigger", triggers: ABSTRACT_VALUE_TRIGGERS.filter((item) => text.includes(item)) };
  }
  if (includesAny(text, AESTHETIC_TRIGGERS)) {
    return { category: "aesthetic_question", route: "aesthetic_question", should_attempt_q4: true, reason: "aesthetic_trigger", triggers: AESTHETIC_TRIGGERS.filter((item) => text.includes(item)) };
  }
  if (includesAny(text, OPEN_QUESTION_TRIGGERS) || text.length >= 12) {
    return { category: "open_question", route: "open_question", should_attempt_q4: true, reason: "open_question_trigger", triggers: OPEN_QUESTION_TRIGGERS.filter((item) => text.includes(item)) };
  }
  return { category: "unknown", route: "unknown", should_attempt_q4: false, reason: "no_open_question_trigger", triggers: [] };
}

export function openQuestionShouldAttemptQ4(route = {}) {
  return route.should_attempt_q4 === true && route.category !== "unsafe_self_harm_or_crisis";
}
