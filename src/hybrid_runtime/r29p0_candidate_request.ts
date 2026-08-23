import { DEEPSEEK_MODEL, type DeepSeekMessage, type DeepSeekRequest } from "./deepseek_adapter.ts";

export const R29P0_MAX_TOKENS = 192 as const;
export const R29P0_TEMPERATURE = 0 as const;

export interface R29P0ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export function buildR29P0CandidateRequest(
  systemPrompt: string,
  conversation: R29P0ConversationMessage[],
): DeepSeekRequest {
  if (!systemPrompt.trim()) throw new Error("r29p0_system_prompt_required");
  if (!conversation.length || conversation.at(-1)?.role !== "user") {
    throw new Error("r29p0_latest_message_must_be_user");
  }
  const messages: DeepSeekMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversation.map((message) => ({ role: message.role, content: String(message.content) })),
  ];
  return {
    model: DEEPSEEK_MODEL,
    messages,
    thinking: { type: "disabled" },
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: R29P0_MAX_TOKENS,
    temperature: R29P0_TEMPERATURE,
  };
}

export function buildR29P0CandidatePair(
  systemPrompt: string,
  conversation: R29P0ConversationMessage[],
): { candidateA: DeepSeekRequest; candidateB: DeepSeekRequest } {
  const candidateA = buildR29P0CandidateRequest(systemPrompt, conversation);
  const candidateB = buildR29P0CandidateRequest(systemPrompt, conversation);
  if (JSON.stringify(candidateA) !== JSON.stringify(candidateB)) {
    throw new Error("r29p0_candidate_request_mismatch");
  }
  return { candidateA, candidateB };
}

export function buildR29P0DeterministicRequest(
  systemPrompt: string,
  conversation: R29P0ConversationMessage[],
  policy: { guidance: string; maximum_answer_characters: number; density: string },
): DeepSeekRequest {
  const deterministicPrompt = [
    systemPrompt.trim(),
    "",
    "固定表达控制（不得改变语义或增加事实）：",
    policy.guidance,
    `回答上限：${policy.maximum_answer_characters} 个中文字符左右。`,
    `表达密度：${policy.density}`,
  ].join("\n");
  return buildR29P0CandidateRequest(deterministicPrompt, conversation);
}

export async function dispatchR29P0Pair<T>(
  candidateA: DeepSeekRequest,
  candidateB: DeepSeekRequest,
  send: (arm: "A" | "B", request: DeepSeekRequest) => Promise<T>,
): Promise<{ candidateA: T; candidateB: T }> {
  if (JSON.stringify(candidateA) !== JSON.stringify(candidateB)) {
    throw new Error("r29p0_candidate_request_mismatch");
  }
  const promiseA = send("A", candidateA);
  const promiseB = send("B", candidateB);
  const [resultA, resultB] = await Promise.all([promiseA, promiseB]);
  return { candidateA: resultA, candidateB: resultB };
}
