import type { LocalSignalPacketV2 } from "./local_signal_packet_v2.ts";
import { assertValidLocalSignalPacketV2 } from "./local_signal_packet_v2_validator.ts";

export const LOCAL_SIGNAL_V2_TOKEN_BUDGET = 100;
export const LOCAL_SIGNAL_V2_PREFERRED_TOKEN_BUDGET = 60;

export interface CompiledLocalSignalV2 {
  instruction: string;
  fields_used: ["anchors", "style"];
  estimated_tokens: number;
}

export function estimateLocalInstructionTokens(value: string): number {
  const compact = value.replace(/\s+/gu, " ").trim();
  const han = compact.match(/\p{Script=Han}/gu)?.length ?? 0;
  const nonHan = compact.replace(/\p{Script=Han}/gu, " ");
  const asciiOrOtherWords = nonHan.match(/[\p{L}\p{N}_-]+/gu)?.length ?? 0;
  const punctuation = nonHan.match(/[^\p{L}\p{N}_\s-]/gu)?.length ?? 0;
  return han + asciiOrOtherWords + punctuation;
}

export function compileLocalSignalPacketV2(packet: LocalSignalPacketV2, currentUserInput: string): CompiledLocalSignalV2 {
  assertValidLocalSignalPacketV2(packet, currentUserInput);
  const quotedAnchors = packet.anchors.map((anchor) => `“${anchor.text.replace(/[“”]/gu, "") }”`).join("、");
  const instruction = `关注：${quotedAnchors}。风格：${packet.style.label}。只控表达；不推断含义、情绪、事实或结论`;
  const estimatedTokens = estimateLocalInstructionTokens(instruction);
  if (estimatedTokens > LOCAL_SIGNAL_V2_TOKEN_BUDGET) {
    throw new Error(`local_signal_v2_instruction_token_budget_exceeded:${estimatedTokens}`);
  }
  return {
    instruction,
    fields_used: ["anchors", "style"],
    estimated_tokens: estimatedTokens,
  };
}
