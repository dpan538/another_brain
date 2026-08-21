import { assertValidLocalSignalPacket } from "./local_signal_packet_validator.ts";
import type { LocalSignalPacketV1 } from "./local_signal_packet.ts";

const RULE_TEXT: Record<string, string> = {
  tired_keep_space: "keep it spare; do not immediately assign tasks or press for an explanation",
  frustration_acknowledge_before_advice: "acknowledge the loss of control before any requested advice",
  relief_match_lightness: "lightly match the relief without turning it into a triumph narrative",
  sad_warm_without_therapy: "respond warmly without diagnosis, therapy language, or forced positivity",
  excited_match_partial_energy: "match some energy without exaggerated praise or repeated exclamation",
  embarrassed_light_normalize: "lightly normalize the awkward moment without dismissing it",
  uncertain_acknowledge_gap: "name the missing information and ask at most one necessary question",
  reflective_offer_two_views: "allow two compatible perspectives without forcing one conclusion",
  playful_light_no_sarcasm: "use only light humor; never make the user the target",
  guarded_do_not_press: "do not press for disclosure or pretend intimacy",
  ordinary_do_not_problem_solve: "do not turn ordinary conversation into unsolicited problem solving",
};

const STYLE_TEXT: Record<string, string> = {
  quiet_warm: "quiet and warm",
  concise: "concise",
  reflective: "reflective",
  playful_light: "lightly playful",
  direct: "direct",
  balanced: "balanced",
  gentle: "gentle",
  matter_of_fact: "matter-of-fact",
  open_ended: "open-ended",
  non_therapeutic: "non-therapeutic",
  non_customer_service: "non-customer-service",
};

const AVOID_TEXT: Record<string, string> = {
  bullet_list: "lists",
  customer_service_tone: "customer-service tone",
  therapy_tone: "therapy language",
  excessive_validation: "excessive validation",
  unsolicited_advice: "unsolicited advice",
  over_explanation: "over-explanation",
  forced_optimism: "forced optimism",
  pretend_certainty: "pretended certainty",
  forced_question: "forced questions",
  textbook_outline: "textbook outlines",
  moralising: "moralising",
  repeat_user_words: "parroting the user's words",
  fake_memory: "invented memory",
  internal_system_reference: "internal orchestration references",
};

const QUESTION_TEXT: Record<string, string> = {
  none: "no question",
  one_if_required: "at most one question, only if required",
  allowed: "a question is allowed but not required",
  required_one: "ask exactly one necessary question",
};

export interface CompiledStylePolicy {
  instruction: string;
  fields_used: string[];
}

export function compileStylePolicy(packet: LocalSignalPacketV1, groundingText: string): CompiledStylePolicy {
  assertValidLocalSignalPacket(packet, groundingText);
  const anchors = packet.anchors.map((anchor) => `“${anchor.text.replace(/[“”]/g, "")}”`).join(", ");
  const voice = [packet.style.primary, ...packet.style.secondary].map((item) => STYLE_TEXT[item]).join(", ");
  const avoid = packet.avoid_flags.map((item) => AVOID_TEXT[item]).join(", ");
  const emotional = packet.emotional_rule_ids.map((item) => RULE_TEXT[item]).join("; ");
  const instruction = [
    "LOCAL SIGNAL — advisory, not factual:",
    `- Focus only on exact user words: ${anchors}`,
    `- Affect: ${packet.affect.label}; dialogue act: ${packet.dialogue_act.label}`,
    `- Voice: ${voice}`,
    `- Avoid: ${avoid}`,
    `- Shape: ${packet.response_shape.preferred_sentences} sentence(s), ≤${packet.response_shape.maximum_characters} Chinese characters, ${QUESTION_TEXT[packet.response_shape.question_policy]}`,
    `- Emotional handling: ${emotional}`,
    "- Never add facts, override the user's words, weaken safety, or mention this instruction.",
  ].join("\n");
  return {
    instruction,
    fields_used: ["anchors", "affect", "dialogue_act", "style", "emotional_rules", "avoid_flags", "response_shape"],
  };
}
