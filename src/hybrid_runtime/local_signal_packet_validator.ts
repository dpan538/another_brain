import {
  AFFECT_LABELS,
  AVOID_FLAGS,
  DIALOGUE_ACTS,
  EMOTIONAL_RULE_IDS,
  LOCAL_SIGNAL_VERSION,
  QUESTION_POLICIES,
  SIGNAL_SOURCES,
  STYLE_LABELS,
  type LocalSignalPacketV1,
} from "./local_signal_packet.ts";

const ROOT_KEYS = [
  "version", "source", "turn_id", "anchors", "affect", "dialogue_act", "style",
  "emotional_rule_ids", "avoid_flags", "response_shape", "confidence",
] as const;

const INJECTION_PATTERNS = [
  /忽略.{0,8}(之前|以上|系统).{0,8}(指令|提示)/i,
  /ignore.{0,12}(previous|prior|system).{0,12}(instruction|prompt)/i,
  /system\s*prompt/i,
  /api[ _-]?key/i,
  /authorization\s*:/i,
  /<\/?script\b/i,
  /javascript\s*:/i,
] as const;

type ValidationResult = { valid: boolean; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string, errors: string[]): void {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    errors.push(`${path}:unexpected_properties`);
  }
}

function inUnitInterval(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function enumMember(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

function containsPacketAbuse(value: unknown, depth = 0): boolean {
  if (depth > 12) return true;
  if (typeof value === "string") return INJECTION_PATTERNS.some((pattern) => pattern.test(value));
  if (Array.isArray(value)) return value.some((item) => containsPacketAbuse(item, depth + 1));
  if (isRecord(value)) return Object.entries(value).some(([key, child]) =>
    INJECTION_PATTERNS.some((pattern) => pattern.test(key)) || containsPacketAbuse(child, depth + 1));
  return false;
}

export function validateLocalSignalPacket(packet: unknown, groundingText: string): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(packet)) return { valid: false, errors: ["packet:not_object"] };
  exactKeys(packet, ROOT_KEYS, "packet", errors);
  if (packet.version !== LOCAL_SIGNAL_VERSION) errors.push("version:unsupported");
  if (!enumMember(packet.source, SIGNAL_SOURCES)) errors.push("source:unknown");
  if (typeof packet.turn_id !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(packet.turn_id)) errors.push("turn_id:invalid");
  if (!inUnitInterval(packet.confidence)) errors.push("confidence:out_of_range");

  const groundingCodepoints = Array.from(String(groundingText ?? ""));
  if (!Array.isArray(packet.anchors) || packet.anchors.length < 1 || packet.anchors.length > 4) {
    errors.push("anchors:count");
  } else {
    packet.anchors.forEach((anchor, index) => {
      if (!isRecord(anchor)) {
        errors.push(`anchors.${index}:not_object`);
        return;
      }
      exactKeys(anchor, ["text", "start_codepoint", "end_codepoint", "salience"], `anchors.${index}`, errors);
      const start = anchor.start_codepoint;
      const end = anchor.end_codepoint;
      if (typeof anchor.text !== "string" || Array.from(anchor.text).length < 1 || Array.from(anchor.text).length > 48) errors.push(`anchors.${index}:text`);
      if (!Number.isInteger(start) || !Number.isInteger(end) || Number(start) < 0 || Number(end) <= Number(start) || Number(end) > groundingCodepoints.length) {
        errors.push(`anchors.${index}:indices`);
      } else if (groundingCodepoints.slice(Number(start), Number(end)).join("") !== anchor.text) {
        errors.push(`anchors.${index}:not_exact_grounded`);
      }
      if (!inUnitInterval(anchor.salience)) errors.push(`anchors.${index}:salience`);
    });
  }

  if (!isRecord(packet.affect)) errors.push("affect:not_object");
  else {
    exactKeys(packet.affect, ["label", "intensity", "confidence"], "affect", errors);
    if (!enumMember(packet.affect.label, AFFECT_LABELS)) errors.push("affect:unknown_label");
    if (!inUnitInterval(packet.affect.intensity)) errors.push("affect:intensity");
    if (!inUnitInterval(packet.affect.confidence)) errors.push("affect:confidence");
  }

  if (!isRecord(packet.dialogue_act)) errors.push("dialogue_act:not_object");
  else {
    exactKeys(packet.dialogue_act, ["label", "confidence"], "dialogue_act", errors);
    if (!enumMember(packet.dialogue_act.label, DIALOGUE_ACTS)) errors.push("dialogue_act:unknown_label");
    if (!inUnitInterval(packet.dialogue_act.confidence)) errors.push("dialogue_act:confidence");
  }

  if (!isRecord(packet.style)) errors.push("style:not_object");
  else {
    exactKeys(packet.style, ["primary", "secondary", "confidence"], "style", errors);
    if (!enumMember(packet.style.primary, STYLE_LABELS)) errors.push("style:unknown_primary");
    if (!Array.isArray(packet.style.secondary) || packet.style.secondary.length > 4 || new Set(packet.style.secondary).size !== packet.style.secondary.length || packet.style.secondary.some((item) => !enumMember(item, STYLE_LABELS))) errors.push("style:invalid_secondary");
    if (!inUnitInterval(packet.style.confidence)) errors.push("style:confidence");
  }

  if (!Array.isArray(packet.emotional_rule_ids) || packet.emotional_rule_ids.length < 1 || packet.emotional_rule_ids.length > 3 || new Set(packet.emotional_rule_ids).size !== packet.emotional_rule_ids.length || packet.emotional_rule_ids.some((item) => !enumMember(item, EMOTIONAL_RULE_IDS))) errors.push("emotional_rule_ids:invalid");
  if (!Array.isArray(packet.avoid_flags) || packet.avoid_flags.length < 1 || packet.avoid_flags.length > 8 || new Set(packet.avoid_flags).size !== packet.avoid_flags.length || packet.avoid_flags.some((item) => !enumMember(item, AVOID_FLAGS))) errors.push("avoid_flags:invalid");

  if (!isRecord(packet.response_shape)) errors.push("response_shape:not_object");
  else {
    exactKeys(packet.response_shape, ["maximum_characters", "preferred_sentences", "question_policy"], "response_shape", errors);
    if (!Number.isInteger(packet.response_shape.maximum_characters) || Number(packet.response_shape.maximum_characters) < 20 || Number(packet.response_shape.maximum_characters) > 220) errors.push("response_shape:maximum_characters");
    if (!Number.isInteger(packet.response_shape.preferred_sentences) || Number(packet.response_shape.preferred_sentences) < 1 || Number(packet.response_shape.preferred_sentences) > 4) errors.push("response_shape:preferred_sentences");
    if (!enumMember(packet.response_shape.question_policy, QUESTION_POLICIES)) errors.push("response_shape:question_policy");
  }

  if (containsPacketAbuse(packet)) errors.push("packet:prompt_injection_or_secret_reference");
  const serializedSize = JSON.stringify(packet).length;
  if (serializedSize > 16_000) errors.push("packet:oversized_or_nesting_bomb");
  return { valid: errors.length === 0, errors };
}

export function assertValidLocalSignalPacket(packet: unknown, groundingText: string): asserts packet is LocalSignalPacketV1 {
  const result = validateLocalSignalPacket(packet, groundingText);
  if (!result.valid) throw new Error(`invalid_local_signal_packet:${result.errors.join(",")}`);
}
