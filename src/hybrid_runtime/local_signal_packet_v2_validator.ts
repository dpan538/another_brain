import {
  ANCHOR_ROLES_V2,
  LOCAL_SIGNAL_V2_VERSION,
  STYLE_LABELS_V2,
  type LocalSignalPacketV2,
} from "./local_signal_packet_v2.ts";

const ROOT_KEYS = ["version", "anchors", "style"] as const;
const ANCHOR_KEYS = ["text", "start_codepoint", "end_codepoint", "salience", "role"] as const;
const STYLE_KEYS = ["label"] as const;
const CJK = /\p{Script=Han}/gu;
const MEANINGFUL_NON_CJK = /[\p{L}\p{N}]/u;

export interface PacketV2ValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string, errors: string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    errors.push(`${path}:unexpected_properties`);
  }
}

function enumMember(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

function validAnchorText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const codepoints = Array.from(value);
  if (codepoints.length === 0 || codepoints.length > 48 || value.trim() !== value || !value.trim()) return false;
  const hanCount = value.match(CJK)?.length ?? 0;
  if (hanCount > 0) return hanCount >= 2;
  return MEANINGFUL_NON_CJK.test(value);
}

export function validateLocalSignalPacketV2(packet: unknown, currentUserInput: string): PacketV2ValidationResult {
  const errors: string[] = [];
  if (!isRecord(packet)) return { valid: false, errors: ["packet:not_object"] };
  exactKeys(packet, ROOT_KEYS, "packet", errors);

  if (packet.version !== LOCAL_SIGNAL_V2_VERSION) errors.push("version:unsupported");
  const grounding = Array.from(String(currentUserInput ?? ""));
  if (!String(currentUserInput ?? "").trim() || grounding.length > 4_000) errors.push("grounding:invalid_current_user_input");

  const validatedRanges: Array<{ start: number; end: number; index: number }> = [];
  if (!Array.isArray(packet.anchors) || packet.anchors.length < 1 || packet.anchors.length > 4) {
    errors.push("anchors:count");
  } else {
    for (const [index, anchor] of packet.anchors.entries()) {
      if (!isRecord(anchor)) {
        errors.push(`anchors.${index}:not_object`);
        continue;
      }
      exactKeys(anchor, ANCHOR_KEYS, `anchors.${index}`, errors);
      if (!validAnchorText(anchor.text)) errors.push(`anchors.${index}:text_not_meaningful`);
      if (typeof anchor.salience !== "number" || !Number.isFinite(anchor.salience) || anchor.salience < 0 || anchor.salience > 1) {
        errors.push(`anchors.${index}:salience`);
      }
      if (!enumMember(anchor.role, ANCHOR_ROLES_V2)) errors.push(`anchors.${index}:role`);

      const start = anchor.start_codepoint;
      const end = anchor.end_codepoint;
      if (!Number.isInteger(start) || !Number.isInteger(end) || Number(start) < 0 || Number(end) <= Number(start) || Number(end) > grounding.length) {
        errors.push(`anchors.${index}:offsets`);
        continue;
      }
      if (grounding.slice(Number(start), Number(end)).join("") !== anchor.text) {
        errors.push(`anchors.${index}:not_exact_current_input_substring`);
        continue;
      }
      validatedRanges.push({ start: Number(start), end: Number(end), index });
    }
  }

  const sortedRanges = [...validatedRanges].sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < sortedRanges.length; index += 1) {
    const previous = sortedRanges[index - 1];
    const current = sortedRanges[index];
    if (current.start < previous.end) {
      errors.push(`anchors.${current.index}:overlap_with_${previous.index}`);
    }
  }

  if (!isRecord(packet.style)) {
    errors.push("style:not_object");
  } else {
    exactKeys(packet.style, STYLE_KEYS, "style", errors);
    if (!enumMember(packet.style.label, STYLE_LABELS_V2)) errors.push("style:unknown_label");
  }

  if (JSON.stringify(packet).length > 8_000) errors.push("packet:oversized");
  return { valid: errors.length === 0, errors };
}

export function assertValidLocalSignalPacketV2(packet: unknown, currentUserInput: string): asserts packet is LocalSignalPacketV2 {
  const result = validateLocalSignalPacketV2(packet, currentUserInput);
  if (!result.valid) throw new Error(`invalid_local_signal_packet_v2:${result.errors.join(",")}`);
}
