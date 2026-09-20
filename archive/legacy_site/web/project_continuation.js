import { resolveTaskContinuation } from "./task_state_runtime.js";

function clean(text) {
  return String(text || "").trim();
}

export function answerProjectContinuation({ query = "", session = {} } = {}) {
  if (/(绕回.*fallback|fallback.*绕回|答偏|太机械|不是我要的|刚才.*不该)/i.test(query)) {
    return null;
  }
  const resolved = resolveTaskContinuation({ query, session });
  if (!resolved?.ok || !clean(resolved.answer)) return null;
  return {
    intent: "project_continuation",
    answer: clean(resolved.answer),
    route: "project_continuation",
    operation: "continue_active_task",
    questionType: "project_continuation",
    contextAction: "SURFACE_PROJECT_ANSWER",
    usedModel: false,
    task_state: resolved.task_state
  };
}
