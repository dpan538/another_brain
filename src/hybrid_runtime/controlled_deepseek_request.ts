import {
  DEEPSEEK_MODEL,
  type DeepSeekMessage,
  type DeepSeekRequest,
} from "./deepseek_adapter.ts";
import type { LocalCriticPacketV1 } from "./local_critic_packet_v1.ts";
import { assertValidLocalCriticPacketV1 } from "./local_critic_packet_v1_validator.ts";

export const CONTROLLED_TEMPERATURE = 0;
export const CONTROLLED_MAX_TOKENS = 160;
export const CONTROL_GUIDANCE = "NONE";

const LOCAL_SLOT = "{{LOCAL_GUIDANCE}}";
const CANONICAL_SLOT = "{{CANONICAL_ANSWER_JSON}}";
const CRITIC_SLOT = "{{LOCAL_CRITIC_PACKET_JSON}}";

function replaceExactlyOnce(template: string, slot: string, value: string): string {
  if (template.split(slot).length !== 2) throw new Error(`controlled_template_slot_contract:${slot}`);
  return template.replace(slot, value);
}

function recentConversation(conversation: Array<{ role: "user" | "assistant"; content: string }>): DeepSeekMessage[] {
  return conversation.slice(-12).map((message) => ({ role: message.role, content: String(message.content) }));
}

function controlledRequest(messages: DeepSeekMessage[]): DeepSeekRequest {
  return {
    model: DEEPSEEK_MODEL,
    messages,
    thinking: { type: "disabled" },
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: CONTROLLED_MAX_TOKENS,
    temperature: CONTROLLED_TEMPERATURE,
  };
}

export function renderControlledOneCallSystem(template: string, guidance: string): string {
  if (!String(guidance).trim()) throw new Error("controlled_guidance_empty");
  if (guidance.includes("</LOCAL_GUIDANCE>")) throw new Error("controlled_guidance_tag_injection");
  return replaceExactlyOnce(template, LOCAL_SLOT, guidance);
}

export function buildControlledOneCallRequest(
  template: string,
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  guidance: string,
): DeepSeekRequest {
  return controlledRequest([
    { role: "system", content: renderControlledOneCallSystem(template, guidance) },
    ...recentConversation(conversation),
  ]);
}

export function buildCanonicalAnswerRequest(
  canonicalSystemPrompt: string,
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
): DeepSeekRequest {
  return controlledRequest([{ role: "system", content: canonicalSystemPrompt.trim() }, ...recentConversation(conversation)]);
}

export function renderConstrainedRewriteSystem(
  template: string,
  canonicalAnswer: string,
  criticPacket: LocalCriticPacketV1,
): string {
  assertValidLocalCriticPacketV1(criticPacket, canonicalAnswer);
  const withCanonical = replaceExactlyOnce(template, CANONICAL_SLOT, JSON.stringify(canonicalAnswer));
  return replaceExactlyOnce(withCanonical, CRITIC_SLOT, JSON.stringify(criticPacket));
}

export function buildConstrainedRewriteRequest(
  template: string,
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  canonicalAnswer: string,
  criticPacket: LocalCriticPacketV1,
): DeepSeekRequest {
  return controlledRequest([
    { role: "system", content: renderConstrainedRewriteSystem(template, canonicalAnswer, criticPacket) },
    ...recentConversation(conversation),
  ]);
}

export function controlledRequestInvariant(request: DeepSeekRequest): Record<string, unknown> {
  return {
    model: request.model,
    temperature: request.temperature,
    top_p_present: Object.hasOwn(request, "top_p"),
    thinking: request.thinking.type,
    max_tokens: request.max_tokens,
    stream: request.stream,
    include_usage: request.stream_options.include_usage,
    message_count: request.messages.length,
    message_roles: request.messages.map((message) => message.role),
    system_message_count: request.messages.filter((message) => message.role === "system").length,
    tools_present: Object.hasOwn(request, "tools") || Object.hasOwn(request, "tool_choice"),
  };
}

export function assertControlledRequest(request: DeepSeekRequest): void {
  const invariant = controlledRequestInvariant(request);
  if (invariant.model !== "deepseek-v4-flash" || invariant.temperature !== 0 || invariant.top_p_present !== false ||
      invariant.thinking !== "disabled" || Number(invariant.max_tokens) > 160 || invariant.stream !== true ||
      invariant.include_usage !== true || invariant.system_message_count !== 1 || invariant.tools_present !== false) {
    throw new Error("controlled_request_contract_violation");
  }
}
