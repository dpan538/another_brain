const SENSITIVE_PROFILE_KEYS = new Set([
  "health_status",
  "diagnosis",
  "religion",
  "politics",
  "sexuality",
  "criminal_history",
  "private_diary",
  "private_chat_logs",
  "password",
  "identifier",
  "api_key",
]);

export const PERSONAL_JUDGE_DATA_POLICY = Object.freeze({
  local_first: true,
  explicit_owner_approval_required: true,
  versioned: true,
  editable: true,
  deletable: true,
  automatic_live_user_collection: false,
  background_online_learning: false,
  hidden_behavioural_profiling: false,
  private_raw_chat_source_allowed: false,
});

export const END_USER_ADAPTATION_BOUNDARY = Object.freeze({
  implemented_in_r30j0: false,
  allowed_future_explicit_fields: Object.freeze([
    "preferred_name",
    "language",
    "response_density",
    "explicit_stable_preferences",
    "explicitly_approved_session_notes",
  ]),
  vector_database_allowed: false,
  hidden_long_term_embeddings_allowed: false,
});

export const PORTFOLIO_KNOWLEDGE_BOUNDARY = Object.freeze({
  implemented_in_r30j0: false,
  ordinary_dialogue_integration: false,
  future_mode: "opt_in_portfolio_only",
  approved_public_corpus_required: true,
});

export function sensitiveProfileKeys(value: unknown, path = "$"): string[] {
  if (value === null || typeof value !== "object") return [];
  const failures: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const child = `${path}.${key}`;
    if (SENSITIVE_PROFILE_KEYS.has(key.toLowerCase())) failures.push(child);
    failures.push(...sensitiveProfileKeys(nested, child));
  }
  return failures;
}

export function validatePublicSafeProfile(value: unknown) {
  const forbidden_keys = sensitiveProfileKeys(value);
  return Object.freeze({
    valid: forbidden_keys.length === 0,
    forbidden_keys,
    sensitive_inference_allowed: false,
    end_user_psychological_profiling_allowed: false,
  });
}
