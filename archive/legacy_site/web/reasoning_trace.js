function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function clean(text) {
  return String(text || "").trim();
}

export function initReasoningTrace(query, state = {}) {
  return {
    query: clean(query),
    compact_state: cloneJson(state) || {},
    task_type: "",
    question_type: "",
    referent: "",
    entities: [],
    works: [],
    relations: [],
    operation: "",
    premises: [],
    retrieval_plan: {},
    solver_plan: {},
    solver_result: {},
    answer_policy: "",
    risk_label: "none",
    template_id: "",
    draft_answer: "",
    bad_answers: [],
    verifier: {
      verdict: "",
      reject_reason: "",
      must_rewrite: false
    },
    final_answer: ""
  };
}

export function updateReasoningTrace(trace, patch = {}) {
  const next = { ...(trace || initReasoningTrace("")) };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "verifier") {
      next.verifier = { ...next.verifier, ...(value || {}) };
    } else if (Array.isArray(next[key]) && Array.isArray(value)) {
      next[key] = [...value];
    } else if (value && typeof value === "object" && !Array.isArray(value) && next[key] && typeof next[key] === "object" && !Array.isArray(next[key])) {
      next[key] = { ...next[key], ...value };
    } else {
      next[key] = value;
    }
  }
  return next;
}

export function finalizeReasoningTrace(trace, answer) {
  return updateReasoningTrace(trace, {
    final_answer: clean(answer),
    verifier: trace?.verifier?.verdict
      ? trace.verifier
      : {
          verdict: "accepted",
          reject_reason: "",
          must_rewrite: false
        }
  });
}

export function nextCompactStateFromTrace(trace = {}) {
  return {
    last_task_type: trace.task_type || "",
    last_question_type: trace.question_type || "",
    last_focus_entity_id: trace.referent || trace.entities?.[0] || "",
    last_two_entity_ids: (trace.entities || []).slice(0, 2),
    last_mentions: [...(trace.entities || []), ...(trace.works || [])].slice(0, 8),
    last_works: (trace.works || []).slice(0, 8),
    last_operation: trace.operation || "",
    last_answer_policy: trace.answer_policy || ""
  };
}
