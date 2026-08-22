import {
  CRITIC_ISSUES,
  CRITIC_STYLE_TARGETS,
  LOCAL_CRITIC_VERSION,
  type LocalCriticPacketV1,
} from "./local_critic_packet_v1.ts";

const ROOT_KEYS = ["version", "style_target", "issues", "preferred_spans"] as const;
const SPAN_KEYS = ["text"] as const;

export interface CriticPacketValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string, errors: string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) errors.push(`${path}:unexpected_properties`);
}

export function validateLocalCriticPacketV1(packet: unknown, canonicalAnswer: string): CriticPacketValidationResult {
  const errors: string[] = [];
  if (!isRecord(packet)) return { valid: false, errors: ["packet:not_object"] };
  exactKeys(packet, ROOT_KEYS, "packet", errors);
  if (packet.version !== LOCAL_CRITIC_VERSION) errors.push("version:unsupported");
  if (typeof packet.style_target !== "string" || !CRITIC_STYLE_TARGETS.includes(packet.style_target as never)) errors.push("style_target:unknown");
  if (!Array.isArray(packet.issues) || packet.issues.length < 1 || packet.issues.length > 4) {
    errors.push("issues:count");
  } else {
    if (new Set(packet.issues).size !== packet.issues.length) errors.push("issues:duplicate");
    if (packet.issues.some((issue) => typeof issue !== "string" || !CRITIC_ISSUES.includes(issue as never))) errors.push("issues:unknown");
    if (packet.issues.includes("none") && packet.issues.length !== 1) errors.push("issues:none_must_be_only_issue");
  }
  if (!Array.isArray(packet.preferred_spans) || packet.preferred_spans.length > 2) {
    errors.push("preferred_spans:count");
  } else {
    const seen = new Set<string>();
    for (const [index, span] of packet.preferred_spans.entries()) {
      if (!isRecord(span)) {
        errors.push(`preferred_spans.${index}:not_object`);
        continue;
      }
      exactKeys(span, SPAN_KEYS, `preferred_spans.${index}`, errors);
      if (typeof span.text !== "string" || !span.text.trim() || span.text.trim() !== span.text || Array.from(span.text).length > 160) {
        errors.push(`preferred_spans.${index}:invalid_text`);
      } else if (!canonicalAnswer.includes(span.text)) {
        errors.push(`preferred_spans.${index}:not_exact_canonical_substring`);
      } else if (seen.has(span.text)) {
        errors.push(`preferred_spans.${index}:duplicate`);
      } else {
        seen.add(span.text);
      }
    }
  }
  if (!String(canonicalAnswer ?? "").trim()) errors.push("canonical_answer:empty");
  if (JSON.stringify(packet).length > 4_000) errors.push("packet:oversized");
  return { valid: errors.length === 0, errors };
}

export function assertValidLocalCriticPacketV1(packet: unknown, canonicalAnswer: string): asserts packet is LocalCriticPacketV1 {
  const result = validateLocalCriticPacketV1(packet, canonicalAnswer);
  if (!result.valid) throw new Error(`invalid_local_critic_packet_v1:${result.errors.join(",")}`);
}
