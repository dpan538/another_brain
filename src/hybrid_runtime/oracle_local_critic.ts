import type { LocalCriticPacketV1 } from "./local_critic_packet_v1.ts";
import { assertValidLocalCriticPacketV1 } from "./local_critic_packet_v1_validator.ts";

export interface OracleCriticFixture {
  version: "oracle-critic-fixture.v1";
  style_target: LocalCriticPacketV1["style_target"];
  issues: LocalCriticPacketV1["issues"];
  preferred_span_policy: "protect_first_conclusion_or_named_value";
}

function sentenceSpans(value: string): string[] {
  return value.match(/[^。！？!?]+[。！？!?]?/gu)?.map((item) => item.trim()).filter(Boolean) ?? [];
}

export function materializeOracleCriticPacket(
  fixture: OracleCriticFixture,
  canonicalAnswer: string,
  protectedNamedValues: string[] = [],
): LocalCriticPacketV1 {
  const sentences = sentenceSpans(canonicalAnswer);
  const preferred: string[] = [];
  for (const value of protectedNamedValues) {
    const sentence = sentences.find((item) => item.includes(value));
    if (sentence && !preferred.includes(sentence)) preferred.push(sentence);
    if (preferred.length === 2) break;
  }
  if (preferred.length === 0 && sentences[0] && Array.from(sentences[0]).length <= 80) preferred.push(sentences[0]);
  const packet: LocalCriticPacketV1 = {
    version: "local-critic.v1",
    style_target: fixture.style_target,
    issues: [...fixture.issues],
    preferred_spans: preferred.slice(0, 2).map((text) => ({ text })),
  };
  assertValidLocalCriticPacketV1(packet, canonicalAnswer);
  return packet;
}
