import type { LocalSignalPacketV1 } from "./local_signal_packet.ts";

export interface SignalInput {
  turnId: string;
  currentUserMessage: string;
  caseId?: string;
  shortContext?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface SignalProvider {
  readonly providerType: string;
  ready(): Promise<boolean>;
  analyze(input: SignalInput): Promise<LocalSignalPacketV1>;
  cancel(turnId: string): Promise<void>;
}

function exactAnchor(text: string, phrase: string): LocalSignalPacketV1["anchors"][number] {
  const source = Array.from(text);
  const target = Array.from(phrase);
  const start = source.findIndex((_, index) => source.slice(index, index + target.length).join("") === phrase);
  if (start < 0) throw new Error("heuristic_anchor_not_grounded");
  return { text: phrase, start_codepoint: start, end_codepoint: start + target.length, salience: 0.82 };
}

function firstGroundedPhrase(text: string): string {
  const compact = text.replace(/[\s，。！？、；：“”「」『』（）()]/g, "");
  if (!compact) throw new Error("empty_signal_input");
  const width = Math.min(10, Array.from(compact).length);
  const phrase = Array.from(compact).slice(0, width).join("");
  const at = text.indexOf(phrase);
  return at >= 0 ? phrase : Array.from(text).slice(0, Math.min(8, Array.from(text).length)).join("");
}

export class OracleSignalProvider implements SignalProvider {
  readonly providerType = "oracle_fixture";
  readonly #packets: Map<string, LocalSignalPacketV1>;
  readonly #cancelled = new Set<string>();

  constructor(fixtures: Iterable<{ case_id: string; oracle_local_signal_packet: LocalSignalPacketV1 }>) {
    this.#packets = new Map(Array.from(fixtures, (fixture) => [fixture.case_id, structuredClone(fixture.oracle_local_signal_packet)]));
  }

  async ready(): Promise<boolean> { return this.#packets.size > 0; }

  async analyze(input: SignalInput): Promise<LocalSignalPacketV1> {
    if (this.#cancelled.has(input.turnId)) throw new DOMException("signal_cancelled", "AbortError");
    const packet = input.caseId ? this.#packets.get(input.caseId) : undefined;
    if (!packet) throw new Error("oracle_fixture_not_found");
    return structuredClone({ ...packet, turn_id: input.turnId });
  }

  async cancel(turnId: string): Promise<void> { this.#cancelled.add(turnId); }
}

const AFFECT_RULES: Array<[RegExp, LocalSignalPacketV1["affect"]["label"], string, LocalSignalPacketV1["style"]["primary"]]> = [
  [/累|困|转不动/, "tired", "tired_keep_space", "quiet_warm"],
  [/烦|恼火|被催|生气/, "frustrated", "frustration_acknowledge_before_advice", "quiet_warm"],
  [/松了口气|终于结束|轻松/, "relieved", "relief_match_lightness", "quiet_warm"],
  [/难过|伤心|心里有点沉/, "sad", "sad_warm_without_therapy", "gentle"],
  [/兴奋|开心|激动/, "excited", "excited_match_partial_energy", "playful_light"],
  [/尴尬|丢脸|脸都热/, "embarrassed", "embarrassed_light_normalize", "gentle"],
  [/不确定|拿不准|不知道/, "uncertain", "uncertain_acknowledge_gap", "gentle"],
  [/回头看|想起以前|在想/, "reflective", "reflective_offer_two_views", "reflective"],
  [/好笑|开个玩笑|哈哈/, "playful", "playful_light_no_sarcasm", "playful_light"],
  [/不想细说|不想被问|别追问/, "guarded", "guarded_do_not_press", "gentle"],
];

export class HeuristicSignalProvider implements SignalProvider {
  readonly providerType = "heuristic_simulator";
  readonly #cancelled = new Set<string>();
  async ready(): Promise<boolean> { return true; }

  async analyze(input: SignalInput): Promise<LocalSignalPacketV1> {
    if (this.#cancelled.has(input.turnId)) throw new DOMException("signal_cancelled", "AbortError");
    const text = input.currentUserMessage;
    const affectRule = AFFECT_RULES.find(([pattern]) => pattern.test(text));
    const affect = affectRule?.[1] ?? "neutral";
    const rule = affectRule?.[2] ?? "ordinary_do_not_problem_solve";
    const style = affectRule?.[3] ?? "concise";
    const phrase = affectRule ? (text.match(affectRule[0])?.[0] ?? firstGroundedPhrase(text)) : firstGroundedPhrase(text);
    let act: LocalSignalPacketV1["dialogue_act"]["label"] = /？|\?|怎么|怎样/.test(text) ? "direct_daily_question" : "casual_conversation";
    if (/改写|改得|写得|缩短|压成/.test(text)) act = "rewrite_request";
    if (/总结|概括/.test(text)) act = "summary_request";
    if (/比较|还是|哪个|取舍/.test(text)) act = "comparison_request";
    if (/为什么|能推出|断定|逻辑/.test(text)) act = "logic_question";
    if (/自由|意义|价值|公平|选择/.test(text)) act = "philosophical_question";
    if (/密码|住址|聊天记录|私人/.test(text)) act = "privacy_boundary";
    if (/你是谁|称呼你|完整替身|身份复制/.test(text)) act = "identity_boundary";
    if (/那个|第二个|原来的|之前说的/.test(text) && /？|\?|帮我|按/.test(text)) act = "clarification_needed";
    const avoid = ["customer_service_tone", "over_explanation"] as LocalSignalPacketV1["avoid_flags"];
    if (affect !== "neutral") avoid.push("therapy_tone", "excessive_validation");
    if (act === "clarification_needed") avoid.push("pretend_certainty");
    if (["identity_boundary", "privacy_boundary"].includes(act)) avoid.push("internal_system_reference");
    return {
      version: "local-signal.v1",
      source: "heuristic_simulator",
      turn_id: input.turnId,
      anchors: [exactAnchor(text, phrase)],
      affect: { label: affect, intensity: affect === "neutral" ? 0.15 : 0.6, confidence: affectRule ? 0.74 : 0.58 },
      dialogue_act: { label: act, confidence: 0.72 },
      style: { primary: style, secondary: ["concise", "non_customer_service"].filter((item) => item !== style) as LocalSignalPacketV1["style"]["secondary"], confidence: 0.7 },
      emotional_rule_ids: [rule] as LocalSignalPacketV1["emotional_rule_ids"],
      avoid_flags: [...new Set(avoid)] as LocalSignalPacketV1["avoid_flags"],
      response_shape: {
        maximum_characters: ["logic_question", "philosophical_question"].includes(act) ? 180 : 100,
        preferred_sentences: ["logic_question", "philosophical_question"].includes(act) ? 3 : 2,
        question_policy: act === "clarification_needed" ? "required_one" : "allowed",
      },
      confidence: 0.68,
    };
  }

  async cancel(turnId: string): Promise<void> { this.#cancelled.add(turnId); }
}

export class DelayedSignalProvider implements SignalProvider {
  readonly providerType: string;
  readonly delayMs: number;
  readonly timeScale: number;
  readonly #inner: SignalProvider;
  readonly #controllers = new Map<string, AbortController>();

  constructor(inner: SignalProvider, delayMs: number, options: { timeScale?: number } = {}) {
    if (![0, 250, 400, 800, 1200].includes(delayMs)) throw new Error("unsupported_signal_delay");
    this.#inner = inner;
    this.delayMs = delayMs;
    this.timeScale = options.timeScale ?? 1;
    this.providerType = `delayed_${inner.providerType}_${delayMs}ms`;
  }

  ready(): Promise<boolean> { return this.#inner.ready(); }

  async analyze(input: SignalInput): Promise<LocalSignalPacketV1> {
    const controller = new AbortController();
    this.#controllers.set(input.turnId, controller);
    try {
      const actualDelay = Math.max(0, this.delayMs * this.timeScale);
      if (actualDelay) await new Promise<void>((resolveDelay, reject) => {
        const timer = setTimeout(resolveDelay, actualDelay);
        controller.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("signal_cancelled", "AbortError"));
        }, { once: true });
      });
      if (controller.signal.aborted) throw new DOMException("signal_cancelled", "AbortError");
      return await this.#inner.analyze(input);
    } finally {
      this.#controllers.delete(input.turnId);
    }
  }

  async cancel(turnId: string): Promise<void> {
    this.#controllers.get(turnId)?.abort();
    await this.#inner.cancel(turnId);
  }
}

export class FutureEfishSignalProvider implements SignalProvider {
  readonly providerType = "future_efish";
  async ready(): Promise<boolean> { return false; }
  async analyze(_input: SignalInput): Promise<LocalSignalPacketV1> { throw new Error("efish_signal_model_not_implemented"); }
  async cancel(_turnId: string): Promise<void> {}
}
