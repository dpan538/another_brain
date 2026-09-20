function textOf(value) {
  return String(value || "");
}

function isQuestionBackNeeded({ responseMode = "", binding = {} } = {}) {
  return responseMode === "specific_clarification" || Boolean(binding?.should_clarify);
}

export function inferSurfaceControl({
  query = "",
  userTurn = {},
  turnFunction = {},
  responseType = "answer",
  responseMode = "",
  answerStyle = "",
  questionType = "",
  binding = {}
} = {}) {
  const fn = textOf(turnFunction.turn_function || userTurn.kind);
  const mode = textOf(responseMode);
  const style = textOf(answerStyle);
  const qType = textOf(questionType);
  const q = textOf(query);

  if (responseType === "ui_affordance" || mode === "quiet_affordance") {
    return {
      surface_mode: "natural_reply",
      reasoning_budget: "none",
      abstraction_level: "concrete",
      bridge_style: "none",
      acknowledgment_style: "minimal",
      acknowledgment_mode: "minimal",
      surface_prohibitions: [],
      sentence_shape: "one_sentence",
      stance_strength: "none",
      silence_policy: "affordance_only_if_low_signal"
    };
  }

  if (/(privacy|copyright|source|boundary)/.test(`${mode} ${qType}`) || responseType === "boundary") {
    return {
      surface_mode: "boundary_plain",
      reasoning_budget: "hidden_two_step",
      abstraction_level: "concrete",
      bridge_style: "none",
      acknowledgment_style: "none",
      acknowledgment_mode: "none",
      surface_prohibitions: [],
      sentence_shape: "two_clause",
      stance_strength: "firm",
      silence_policy: "never_silent_when_active_context"
    };
  }

  if (fn === "compliment") {
    return {
      surface_mode: "reflective_line",
      reasoning_budget: "none",
      abstraction_level: "mixed",
      bridge_style: "implicit",
      acknowledgment_style: "reflective",
      acknowledgment_mode: "reflective",
      surface_prohibitions: ["generic_thanks", "praise_loop", "assistant_politeness_residue"],
      sentence_shape: "one_sentence",
      stance_strength: "light",
      silence_policy: "never_silent_when_active_context"
    };
  }

  if (fn === "analogy_statement") {
    return {
      surface_mode: "reflective_line",
      reasoning_budget: "one_step",
      abstraction_level: "mixed",
      bridge_style: "implicit",
      acknowledgment_style: "minimal",
      acknowledgment_mode: "minimal",
      surface_prohibitions: ["announced_bridge", "taxonomy_language"],
      sentence_shape: "two_clause",
      stance_strength: "light",
      silence_policy: "never_silent_when_active_context"
    };
  }

  if (fn === "affective_disclosure") {
    return {
      surface_mode: "reflective_line",
      reasoning_budget: "one_step",
      abstraction_level: "concrete",
      bridge_style: "implicit",
      acknowledgment_style: "reflective",
      acknowledgment_mode: "reflective",
      surface_prohibitions: ["taxonomy_language", "therapy_drift"],
      sentence_shape: "two_clause",
      stance_strength: "light",
      silence_policy: "never_silent_when_active_context"
    };
  }

  if (fn === "deepening_invitation") {
    return {
      surface_mode: "deep_question",
      reasoning_budget: "one_step",
      abstraction_level: "mixed",
      bridge_style: "implicit",
      acknowledgment_style: "none",
      acknowledgment_mode: "none",
      surface_prohibitions: ["question_menu", "fake_depth"],
      sentence_shape: "question_back",
      stance_strength: "clear",
      silence_policy: "never_silent_when_active_context"
    };
  }

  if (fn === "confirmation") {
    return {
      surface_mode: "factual_short",
      reasoning_budget: "none",
      abstraction_level: "concrete",
      bridge_style: "none",
      acknowledgment_style: "minimal",
      acknowledgment_mode: "minimal",
      surface_prohibitions: [],
      sentence_shape: "one_sentence",
      stance_strength: "light",
      silence_policy: "never_silent_when_active_context"
    };
  }

  if (fn === "topic_reentry") {
    return {
      surface_mode: "compact_judgment",
      reasoning_budget: "one_step",
      abstraction_level: "mixed",
      bridge_style: "implicit",
      acknowledgment_style: "none",
      acknowledgment_mode: "none",
      surface_prohibitions: ["announced_bridge", "generic_bridge_template"],
      sentence_shape: "two_clause",
      stance_strength: "light",
      silence_policy: "never_silent_when_active_context"
    };
  }

  if (/list/.test(`${style} ${qType}`)) {
    return {
      surface_mode: "list_short",
      reasoning_budget: "one_step",
      abstraction_level: "concrete",
      bridge_style: "none",
      acknowledgment_style: "none",
      acknowledgment_mode: "none",
      surface_prohibitions: [],
      sentence_shape: "short_list",
      stance_strength: "clear",
      silence_policy: "never_silent_when_active_context"
    };
  }

  if (/comparison|abstract_comparison|compare/.test(`${fn} ${style} ${qType}`)) {
    return {
      surface_mode: "compact_judgment",
      reasoning_budget: /为什么|展开|详细|理由|比较一下/.test(q) ? "expanded_only_if_user_asks" : "hidden_two_step",
      abstraction_level: "mixed",
      bridge_style: "implicit",
      acknowledgment_style: "none",
      acknowledgment_mode: "none",
      surface_prohibitions: ["over_abstract_judgment"],
      sentence_shape: "two_clause",
      stance_strength: "clear",
      silence_policy: "never_silent_when_active_context"
    };
  }

  if (isQuestionBackNeeded({ responseMode: mode, binding })) {
    return {
      surface_mode: "natural_reply",
      reasoning_budget: "one_step",
      abstraction_level: "concrete",
      bridge_style: "none",
      acknowledgment_style: "none",
      acknowledgment_mode: "none",
      surface_prohibitions: [],
      sentence_shape: "question_back",
      stance_strength: "clear",
      silence_policy: "never_silent_when_active_context"
    };
  }

  return {
    surface_mode: /culture|explain|evaluation/.test(`${style} ${fn}`) ? "compact_judgment" : "natural_reply",
    reasoning_budget: /为什么|展开|详细|理由/.test(q) ? "expanded_only_if_user_asks" : "one_step",
    abstraction_level: "mixed",
    bridge_style: "none",
    acknowledgment_style: "none",
    acknowledgment_mode: "none",
    surface_prohibitions: [],
    sentence_shape: "two_clause",
    stance_strength: /evaluation|interpretive|judgment/.test(`${fn} ${qType}`) ? "light" : "none",
    silence_policy: "never_silent_when_active_context"
  };
}
