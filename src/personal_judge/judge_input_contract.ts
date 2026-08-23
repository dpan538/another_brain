import { JUDGE_CONTEXT_CONTRACT, judgeInputBudget } from "./personal_judge_contract.ts";

export type JudgeMessage = Readonly<{ role: "user" | "assistant"; content: string }>;

export type JudgeInputSections = Readonly<{
  profile_tokens: readonly string[];
  recent_context: readonly JudgeMessage[];
  latest_user_message: string;
  deepseek_answer: string;
}>;

export type JudgeInputEncoder = (text: string) => readonly number[];

const PROFILE_TOKEN = /^<STYLE_[A-Z0-9_]+>$/u;

export function serializeJudgeInput(sections: JudgeInputSections): string {
  if (sections.profile_tokens.length < 1 || sections.profile_tokens.length > 16) {
    throw new Error("profile_token_count_out_of_range");
  }
  if (!sections.profile_tokens.every((token) => PROFILE_TOKEN.test(token))) {
    throw new Error("profile_must_use_compact_categorical_tokens");
  }
  if (!sections.latest_user_message.trim() || !sections.deepseek_answer.trim()) {
    throw new Error("judge_input_requires_user_and_answer");
  }
  const context = sections.recent_context
    .map((message) => `<${message.role.toUpperCase()}>${message.content}</${message.role.toUpperCase()}>`)
    .join("\n");
  return [
    "<PERSONAL_PROFILE>",
    sections.profile_tokens.join(""),
    "</PERSONAL_PROFILE>",
    "<CONTEXT>",
    context,
    "</CONTEXT>",
    "<USER>",
    sections.latest_user_message,
    "</USER>",
    "<ANSWER>",
    sections.deepseek_answer,
    "</ANSWER>",
    "<EOS>",
  ].join("\n");
}

export function compileJudgeInput(sections: JudgeInputSections, encode: JudgeInputEncoder) {
  const serialized = serializeJudgeInput(sections);
  // The encoder must return the complete sequence. It is never called with a
  // truncating max-token option, so an overlength input can only abstain.
  const token_ids = [...encode(serialized)];
  const budget = judgeInputBudget(token_ids.length);
  if (!budget.accepted) {
    return Object.freeze({
      ...budget,
      serialized: null,
      token_ids: null,
      hard_max_tokens: JUDGE_CONTEXT_CONTRACT.hard_max_tokens,
    });
  }
  return Object.freeze({
    ...budget,
    serialized,
    token_ids: Object.freeze(token_ids),
    hard_max_tokens: JUDGE_CONTEXT_CONTRACT.hard_max_tokens,
  });
}
