export const LOCAL_CRITIC_VERSION = "local-critic.v1" as const;

export const CRITIC_STYLE_TARGETS = [
  "quiet_warm",
  "concise_direct",
  "reflective",
  "playful_light",
  "balanced",
  "matter_of_fact",
] as const;

export const CRITIC_ISSUES = [
  "too_formal",
  "too_verbose",
  "too_cold",
  "too_warm",
  "customer_service_tone",
  "textbook_tone",
  "repetitive",
  "unnaturally_structured",
  "none",
] as const;

export type CriticStyleTarget = typeof CRITIC_STYLE_TARGETS[number];
export type CriticIssue = typeof CRITIC_ISSUES[number];

export interface LocalCriticPacketV1 {
  version: typeof LOCAL_CRITIC_VERSION;
  style_target: CriticStyleTarget;
  issues: CriticIssue[];
  preferred_spans: Array<{ text: string }>;
}
