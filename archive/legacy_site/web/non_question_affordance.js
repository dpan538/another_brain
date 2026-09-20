import { classifyUserTurn } from "./user_turn_classifier.js";

export const AFFORDANCE_TYPES = Object.freeze({
  QUIET_WAIT: "quiet_wait",
  WATER_RIPPLE: "water_ripple",
  BREATHING_DOTS: "breathing_dots",
  SOFT_QUESTION_MARK: "soft_question_mark"
});

export function shouldShowQuietAffordance({ query, session = {}, trace = {} } = {}) {
  const turn = classifyUserTurn({ query, session, trace });
  return turn.recommended_action === "quiet_affordance";
}

export function buildQuietAffordance({ query, session = {}, trace = {} } = {}) {
  const turn = classifyUserTurn({ query, session, trace });
  return {
    kind: "ui_affordance",
    affordance_type: AFFORDANCE_TYPES.WATER_RIPPLE,
    display_text: "…？…",
    aria_label: "等待下一句输入",
    persist_as_assistant_message: false,
    count_as_exchange_turn: false,
    store_in_internal_session_memory: false,
    max_duration_ms: 3000,
    can_loop_while_input_focused: true,
    animation: {
      name: "water_ripple_question",
      reduced_motion_fallback: AFFORDANCE_TYPES.BREATHING_DOTS
    },
    user_turn: turn
  };
}

export function compactUserSignal({ query, userTurn }) {
  const text = String(query || "");
  const kind = userTurn?.kind || "quiet_declaration";
  let signal_type = "vague_pause";
  if (/不是|不对|错/.test(text)) signal_type = "correction";
  else if (/更严重|太机械|不是我要|怪|绕回|答偏/.test(text)) signal_type = "dissatisfaction";
  else if (/罗大佑|日本文学|摄影|艺术|哲学/.test(text)) signal_type = "topic_shift";
  else if (/测试|fallback|反问/.test(text)) signal_type = "testing_feedback";
  return {
    kind: "user_signal",
    signal_type,
    raw_text_stored: false,
    summary: kind === "quiet_declaration" ? "user paused or left a vague fragment" : "user gave a non-question signal"
  };
}

export function recordQuietAffordanceSignal(state = {}, query = "", userTurn = {}) {
  const signal = compactUserSignal({ query, userTurn });
  const userSignals = Array.isArray(state.userSignals) ? state.userSignals.slice(-7) : [];
  return {
    ...state,
    userSignals: [...userSignals, signal],
    lastUserSignal: signal
  };
}
