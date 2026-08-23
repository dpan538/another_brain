export const EFISH_PERSONAL_JUDGE_MODEL_ID = "efish-personal-judge-v1" as const;

export const JUDGE_CONTEXT_CONTRACT = Object.freeze({
  hard_max_tokens: 512,
  normal_target_tokens: 448,
  reserved_tokens: 64,
  overlength_decision: "DEFAULT_PRESENTATION",
  semantic_truncation_allowed: false,
});

export const PERSONAL_FIT_LABELS = Object.freeze([
  "PERSONAL_FIT",
  "NEUTRAL",
  "PERSONAL_MISMATCH",
] as const);

export const VOICE_ISSUE_LABELS = Object.freeze([
  "too_formal",
  "too_verbose",
  "too_assistant_like",
  "too_cold",
  "too_warm",
  "too_explanatory",
  "too_structured",
  "too_generic",
  "too_apologetic",
  "too_enthusiastic",
  "unnecessary_question",
  "unnecessary_disclaimer",
  "repetitive",
  "textbook_tone",
] as const);

export const PRESENTATION_LABELS = Object.freeze([
  "compact",
  "quiet",
  "reflective",
  "direct",
  "playful_light",
  "neutral",
] as const);

export const CONFIDENCE_LABELS = Object.freeze([
  "CONFIDENT_PERSONALIZE",
  "DEFAULT_PRESENTATION",
  "OUT_OF_SCOPE",
] as const);

export const PROFILE_REPRESENTATION_CANDIDATES = Object.freeze([
  "fixed_profile_embedding",
  "categorical_profile_tokens",
  "structured_side_channel",
] as const);

export const FORBIDDEN_JUDGE_OUTPUTS = Object.freeze([
  "natural_language_tokens",
  "factual_correctness",
  "truth_probability",
  "logic_correctness",
  "emotion_diagnosis",
  "personality_inference",
  "sensitive_identity_inference",
] as const);

export const J0_TRAINING_STATE = Object.freeze({
  training_started: false,
  classification_updates: 0,
  examples_seen_by_optimizer: 0,
  checkpoint: null,
  candidate: null,
});

export type PresentationLabel = (typeof PRESENTATION_LABELS)[number];

export type PresentationSettings = Readonly<{
  reveal_rhythm: "fast" | "immediate" | "subtle_slow" | "measured" | "light" | "default";
  spacing: "tight" | "normal" | "open";
  motion: "minimal" | "low" | "subtle" | "light" | "default";
  suggestion_chips: boolean;
}>;

export const PRESENTATION_SETTINGS: Readonly<Record<PresentationLabel, PresentationSettings>> = Object.freeze({
  compact: Object.freeze({ reveal_rhythm: "fast", spacing: "tight", motion: "minimal", suggestion_chips: false }),
  quiet: Object.freeze({ reveal_rhythm: "subtle_slow", spacing: "open", motion: "low", suggestion_chips: false }),
  reflective: Object.freeze({ reveal_rhythm: "measured", spacing: "open", motion: "subtle", suggestion_chips: false }),
  direct: Object.freeze({ reveal_rhythm: "immediate", spacing: "normal", motion: "minimal", suggestion_chips: false }),
  playful_light: Object.freeze({ reveal_rhythm: "light", spacing: "normal", motion: "light", suggestion_chips: false }),
  neutral: Object.freeze({ reveal_rhythm: "default", spacing: "normal", motion: "default", suggestion_chips: false }),
});

export function presentationDecision(answerText: string, mode: PresentationLabel) {
  if (!PRESENTATION_LABELS.includes(mode)) throw new Error("unknown_presentation_mode");
  return Object.freeze({
    answer_text: answerText,
    answer_text_modified: false,
    mode,
    settings: PRESENTATION_SETTINGS[mode],
  });
}

export function judgeInputBudget(totalTokens: number) {
  if (!Number.isInteger(totalTokens) || totalTokens < 0) throw new Error("invalid_judge_token_count");
  if (totalTokens > JUDGE_CONTEXT_CONTRACT.hard_max_tokens) {
    return Object.freeze({
      accepted: false,
      decision: "DEFAULT_PRESENTATION" as const,
      semantic_truncation_performed: false,
      total_tokens: totalTokens,
    });
  }
  return Object.freeze({
    accepted: true,
    decision: totalTokens <= JUDGE_CONTEXT_CONTRACT.normal_target_tokens ? "JUDGE" as const : "JUDGE_WITH_REDUCED_RESERVE" as const,
    semantic_truncation_performed: false,
    total_tokens: totalTokens,
  });
}
