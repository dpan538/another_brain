export const GENERIC_FALLBACKS = Object.freeze({
  ASK_REQUIRED: Object.freeze({
    id: "ask_required",
    text: "你需要提问。",
    allowedQuestionTypes: ["no_question_input"],
    forbiddenQuestionTypes: [
      "entity_overview",
      "domain_overview",
      "works_list",
      "author_list",
      "reasoning_math",
      "reasoning_logic",
      "capability_boundary",
      "help_how_to_ask",
      "user_intent_boundary",
      "fallback_repair"
    ]
  }),
  WHICH_SIDE: Object.freeze({
    id: "which_side",
    text: "你要问哪一边？",
    bareFinalAllowed: false,
    requiresNamedAlternatives: true
  }),
  EXTERNAL_EVENT_UNKNOWN: Object.freeze({
    id: "external_event_unknown",
    text: "也许发生过，不在我眼前。",
    allowedQuestionTypes: ["external_event_status", "unknown_current_status"],
    forbiddenQuestionTypes: [
      "entity_overview",
      "domain_overview",
      "self_identity",
      "self_capability",
      "user_intent_boundary",
      "help_how_to_ask",
      "fallback_repair"
    ]
  }),
  SEARCH_REDIRECT: Object.freeze({
    id: "search_redirect",
    text: "你应该去问百度。",
    allowedQuestionTypes: ["external_latest_fact", "current_status_without_source"]
  }),
  DIALOG_BOX_SCOPE: Object.freeze({
    id: "dialog_box_scope",
    text: "我只是个对话框。",
    allowedQuestionTypes: ["identity_scope", "capability_boundary"]
  })
});

export const GENERIC_FALLBACK_BY_ID = Object.freeze(
  Object.fromEntries(Object.values(GENERIC_FALLBACKS).map((item) => [item.id, item]))
);

export const GENERIC_FALLBACK_TEXTS = Object.freeze(
  Object.fromEntries(Object.values(GENERIC_FALLBACKS).map((item) => [item.id, item.text]))
);
