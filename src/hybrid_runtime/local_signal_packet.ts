export const LOCAL_SIGNAL_VERSION = "local-signal.v1" as const;

export const SIGNAL_SOURCES = ["oracle_fixture", "heuristic_simulator", "future_efish"] as const;
export const AFFECT_LABELS = [
  "neutral", "tired", "frustrated", "relieved", "sad", "excited",
  "uncertain", "embarrassed", "reflective", "playful", "guarded", "warm",
] as const;
export const DIALOGUE_ACTS = [
  "greeting", "acknowledgement", "emotional_acknowledgement", "direct_daily_question",
  "practical_advice_request", "rewrite_request", "summary_request", "comparison_request",
  "logic_question", "philosophical_question", "uncertainty", "clarification_needed",
  "identity_boundary", "privacy_boundary", "casual_conversation", "opinion_request",
] as const;
export const STYLE_LABELS = [
  "quiet_warm", "concise", "reflective", "playful_light", "direct", "balanced",
  "gentle", "matter_of_fact", "open_ended", "non_therapeutic", "non_customer_service",
] as const;
export const AVOID_FLAGS = [
  "bullet_list", "customer_service_tone", "therapy_tone", "excessive_validation",
  "unsolicited_advice", "over_explanation", "forced_optimism", "pretend_certainty",
  "forced_question", "textbook_outline", "moralising", "repeat_user_words",
  "fake_memory", "internal_system_reference",
] as const;
export const QUESTION_POLICIES = ["none", "one_if_required", "allowed", "required_one"] as const;
export const EMOTIONAL_RULE_IDS = [
  "tired_keep_space", "frustration_acknowledge_before_advice", "relief_match_lightness",
  "sad_warm_without_therapy", "excited_match_partial_energy", "embarrassed_light_normalize",
  "uncertain_acknowledge_gap", "reflective_offer_two_views", "playful_light_no_sarcasm",
  "guarded_do_not_press", "ordinary_do_not_problem_solve",
] as const;

export type SignalSource = typeof SIGNAL_SOURCES[number];
export type AffectLabel = typeof AFFECT_LABELS[number];
export type DialogueAct = typeof DIALOGUE_ACTS[number];
export type StyleLabel = typeof STYLE_LABELS[number];
export type AvoidFlag = typeof AVOID_FLAGS[number];
export type QuestionPolicy = typeof QUESTION_POLICIES[number];
export type EmotionalRuleId = typeof EMOTIONAL_RULE_IDS[number];

export interface LocalSignalPacketV1 {
  version: typeof LOCAL_SIGNAL_VERSION;
  source: SignalSource;
  turn_id: string;
  anchors: Array<{
    text: string;
    start_codepoint: number;
    end_codepoint: number;
    salience: number;
  }>;
  affect: { label: AffectLabel; intensity: number; confidence: number };
  dialogue_act: { label: DialogueAct; confidence: number };
  style: { primary: StyleLabel; secondary: StyleLabel[]; confidence: number };
  emotional_rule_ids: EmotionalRuleId[];
  avoid_flags: AvoidFlag[];
  response_shape: {
    maximum_characters: number;
    preferred_sentences: number;
    question_policy: QuestionPolicy;
  };
  confidence: number;
}

export function canonicalPacket(packet: LocalSignalPacketV1): string {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sort(child)]));
    }
    return value;
  };
  return JSON.stringify(sort(packet));
}
