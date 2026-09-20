export function makeAnswerResponse({ answer, trace = {}, intent = "", route = "" }) {
  return {
    type: "answer",
    answer: String(answer || ""),
    output: String(answer || ""),
    trace,
    intent,
    route,
    persist_as_assistant_message: true,
    count_as_exchange_turn: true
  };
}

export function makeAffordanceResponse({ affordance, trace = {} }) {
  return {
    type: "ui_affordance",
    answer: "",
    output: "",
    affordance,
    trace,
    intent: "quiet_affordance",
    route: "affordance",
    persist_as_assistant_message: false,
    count_as_exchange_turn: false
  };
}
