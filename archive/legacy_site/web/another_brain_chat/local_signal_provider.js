// Local signal seam.
//
// This is the interface a project-trained personal model would implement to
// influence an answer without generating it. A provider reads the user's turn
// and returns a LocalSignalPacket: exact anchors from the user's own words, a
// dialogue act, a voice, things to avoid, and a response shape. It asserts no
// fact and produces no answer text.
//
// STATUS: injection is OFF by default in the product path.
//
// Evidence: R29B2M-R4H-R3 ran a temperature- and message-structure-controlled
// replay over 24 blind pairs with an ORACLE (best-case) packet. Injecting the
// compiled packet produced 50.0% overall preference against a 55% requirement,
// 79.2% factual/relevance non-regression against a 95% requirement, and seven
// unsupported facts against a required zero. R29P0 then found 0% safe
// equivalent headroom for a selection-only variant. Both terminal states are
// recorded as blocked. Shipping injection on by default would contradict that
// evidence, so the seam stays wired and disabled until a real personal model
// and a fresh evaluation justify turning it on.

export const LOCAL_SIGNAL_VERSION = "local-signal.v1";

export const AFFECT_LABELS = Object.freeze([
  "neutral", "tired", "frustrated", "relieved", "sad", "excited",
  "uncertain", "embarrassed", "reflective", "playful", "guarded", "warm"
]);

export const DIALOGUE_ACTS = Object.freeze([
  "greeting", "acknowledgement", "emotional_acknowledgement", "direct_daily_question",
  "practical_advice_request", "rewrite_request", "summary_request", "comparison_request",
  "logic_question", "philosophical_question", "uncertainty", "clarification_needed",
  "identity_boundary", "privacy_boundary", "casual_conversation", "opinion_request"
]);

export const STYLE_LABELS = Object.freeze([
  "quiet_warm", "concise", "reflective", "playful_light", "direct", "balanced",
  "gentle", "matter_of_fact", "open_ended", "non_therapeutic", "non_customer_service"
]);

export const AVOID_FLAGS = Object.freeze([
  "bullet_list", "customer_service_tone", "therapy_tone", "excessive_validation",
  "unsolicited_advice", "over_explanation", "forced_optimism", "pretend_certainty",
  "forced_question", "textbook_outline", "moralising", "repeat_user_words",
  "fake_memory", "internal_system_reference"
]);

const AFFECT_RULES = [
  [/累|困|转不动/, "tired", "tired_keep_space", "quiet_warm"],
  [/烦|恼火|被催|生气/, "frustrated", "frustration_acknowledge_before_advice", "quiet_warm"],
  [/松了口气|终于结束|轻松/, "relieved", "relief_match_lightness", "quiet_warm"],
  [/难过|伤心|心里有点沉/, "sad", "sad_warm_without_therapy", "gentle"],
  [/兴奋|开心|激动/, "excited", "excited_match_partial_energy", "playful_light"],
  [/尴尬|丢脸|脸都热/, "embarrassed", "embarrassed_light_normalize", "gentle"],
  [/不确定|拿不准|不知道/, "uncertain", "uncertain_acknowledge_gap", "gentle"],
  [/回头看|想起以前|在想/, "reflective", "reflective_offer_two_views", "reflective"],
  [/好笑|开个玩笑|哈哈/, "playful", "playful_light_no_sarcasm", "playful_light"],
  [/不想细说|不想被问|别追问/, "guarded", "guarded_do_not_press", "gentle"]
];

// An anchor must be a literal span of the user's own message. A packet whose
// anchor is not found in the source text is rejected: that is the guard that
// stops a signal layer from inventing content.
function exactAnchor(text, phrase) {
  const source = Array.from(text);
  const target = Array.from(phrase);
  const start = source.findIndex((_, index) => source.slice(index, index + target.length).join("") === phrase);
  if (start < 0) throw new Error("local_signal_anchor_not_grounded");
  return { text: phrase, start_codepoint: start, end_codepoint: start + target.length, salience: 0.82 };
}

function firstGroundedPhrase(text) {
  const compact = String(text).replace(/[\s，。！？、；：“”「」『』（）()]/g, "");
  if (!compact) throw new Error("local_signal_empty_input");
  const width = Math.min(10, Array.from(compact).length);
  const phrase = Array.from(compact).slice(0, width).join("");
  return text.indexOf(phrase) >= 0
    ? phrase
    : Array.from(text).slice(0, Math.min(8, Array.from(text).length)).join("");
}

export class HeuristicSignalProvider {
  constructor() {
    this.providerType = "heuristic_simulator";
    this.isModel = false;
  }

  async ready() {
    return true;
  }

  async analyze({ turnId, currentUserMessage }) {
    const text = String(currentUserMessage || "");
    const affectRule = AFFECT_RULES.find(([pattern]) => pattern.test(text));
    const affect = affectRule?.[1] ?? "neutral";
    const rule = affectRule?.[2] ?? "ordinary_do_not_problem_solve";
    const style = affectRule?.[3] ?? "concise";
    const phrase = affectRule ? (text.match(affectRule[0])?.[0] ?? firstGroundedPhrase(text)) : firstGroundedPhrase(text);

    let act = /？|\?|怎么|怎样/.test(text) ? "direct_daily_question" : "casual_conversation";
    if (/改写|改得|写得|缩短|压成/.test(text)) act = "rewrite_request";
    if (/总结|概括/.test(text)) act = "summary_request";
    if (/比较|还是|哪个|取舍/.test(text)) act = "comparison_request";
    if (/为什么|能推出|断定|逻辑/.test(text)) act = "logic_question";
    if (/自由|意义|价值|公平|选择/.test(text)) act = "philosophical_question";
    if (/密码|住址|聊天记录|私人/.test(text)) act = "privacy_boundary";
    if (/你是谁|称呼你|完整替身|身份复制/.test(text)) act = "identity_boundary";
    if (/那个|第二个|原来的|之前说的/.test(text) && /？|\?|帮我|按/.test(text)) act = "clarification_needed";

    const avoid = ["customer_service_tone", "over_explanation"];
    if (affect !== "neutral") avoid.push("therapy_tone", "excessive_validation");
    if (act === "clarification_needed") avoid.push("pretend_certainty");
    if (act === "identity_boundary" || act === "privacy_boundary") avoid.push("internal_system_reference");

    const deep = act === "logic_question" || act === "philosophical_question";
    return {
      version: LOCAL_SIGNAL_VERSION,
      source: "heuristic_simulator",
      turn_id: String(turnId || ""),
      anchors: [exactAnchor(text, phrase)],
      affect: { label: affect, intensity: affect === "neutral" ? 0.15 : 0.6, confidence: affectRule ? 0.74 : 0.58 },
      dialogue_act: { label: act, confidence: 0.72 },
      style: {
        primary: style,
        secondary: ["concise", "non_customer_service"].filter((item) => item !== style),
        confidence: 0.7
      },
      emotional_rule_ids: [rule],
      avoid_flags: [...new Set(avoid)],
      response_shape: {
        maximum_characters: deep ? 180 : 100,
        preferred_sentences: deep ? 3 : 2,
        question_policy: act === "clarification_needed" ? "required_one" : "allowed"
      },
      confidence: 0.68
    };
  }

  async cancel() {}
}

// The slot a project-trained personal model fills. It reports not-ready, so the
// orchestrator skips injection rather than guessing.
export class ProjectModelSignalProvider {
  constructor() {
    this.providerType = "project_personal_model";
    this.isModel = true;
  }

  async ready() {
    return false;
  }

  async analyze() {
    throw new Error("project_personal_signal_model_not_implemented");
  }

  async cancel() {}
}

export function assertPacketGrounded(packet, sourceText) {
  if (!packet || packet.version !== LOCAL_SIGNAL_VERSION) throw new Error("local_signal_version_mismatch");
  const source = Array.from(String(sourceText || ""));
  for (const anchor of packet.anchors || []) {
    const span = source.slice(anchor.start_codepoint, anchor.end_codepoint).join("");
    if (span !== anchor.text) throw new Error("local_signal_anchor_not_grounded");
  }
  if (!AFFECT_LABELS.includes(packet.affect?.label)) throw new Error("local_signal_affect_unknown");
  if (!DIALOGUE_ACTS.includes(packet.dialogue_act?.label)) throw new Error("local_signal_act_unknown");
  if (!STYLE_LABELS.includes(packet.style?.primary)) throw new Error("local_signal_style_unknown");
  for (const flag of packet.avoid_flags || []) {
    if (!AVOID_FLAGS.includes(flag)) throw new Error("local_signal_avoid_flag_unknown");
  }
  return true;
}
