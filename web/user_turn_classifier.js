import { bareFallbackId, mentionsGenericFallback } from "./generic_fallback_classifier.js";

const QUESTION_CUE_RE = /(谁|什么|吗|嘛|呢|怎么|为什么|为何|哪|哪里|有没有|介绍|代表|有哪些|解释|比较|讲讲|\?|？)/;
const KNOW_QUESTION_RE = /(你知道|知道.+[吗嘛]|知道.+[？?])/;
const HELP_RE = /(我需要怎么提问|怎么问你|我该怎么开始|我应该怎么开始|如何开始|怎么开始|我该问什么|问什么比较好)/;
const ACTIONABLE_CONTINUATION_RE = /^(继续|继续说.*|展开|再展开.*|再说|详细一点|短一点|换个说法|别反问|直接答|接着说.*|多说一点)[。.!！?\s]*$/;
const REPAIR_RE = /(什么发生过|哪一边|什么意思|我不是已经问了吗|我其实已经问了|你刚才说什么|你刚才什么意思|你是不是答偏|你是不是在绕圈|为什么这么答)/;
const HARD_BOUNDARY_RE = /(身份证|手机号|电话号码|住址|地址|银行卡|密码|完整歌词|整首歌词|全文|自杀|自伤|伤害自己|杀了|弄死)/;
const SIGNAL_RE = /(更严重|不是我要的|绕回|fallback|模板|太机械|答偏|不该|不是罗大佑|是日本文学|我在测试|别再|别说|已经问了|不是外部事件|不对|错了)/i;
const QUIET_RE = /^(嗯+|这样啊|可能吧|可能|算了|……|\.{2,}|…+|有点怪|这很难说|我再想想|不知道|好像不是这样|好吧|行吧)[。.!！?\s]*$/;
const CAPABILITY_META_RE = /(你读过|你听过|你看过|你懂|你了解|你知道自己是谁|你知道什么时候停下|你知道什么|你知道我要干什么|你知道我想问什么)/;

function clean(text) {
  return String(text || "").trim();
}

function hasActiveSession(session = {}) {
  return Boolean(
    session.lastAnswer ||
      session.lastIntent ||
      session.lastTopic ||
      session.last_domain ||
      session.last_focus_entity_id ||
      (Array.isArray(session.recentTurns) && session.recentTurns.length) ||
      (Array.isArray(session.modelUsableSessionTurns) && session.modelUsableSessionTurns.length)
  );
}

function lastAssistantAnswer(session = {}) {
  return session.lastAssistantAnswer || session.lastAnswer || session.recentTurns?.at?.(-1)?.answer || "";
}

export function classifyUserTurn({ query, session = {}, trace = {} } = {}) {
  const text = clean(query);
  const reasons = [];
  if (!text) {
    return { kind: "empty_or_noise", confidence: 1, reasons: ["empty_input"], recommended_action: "ignore_empty" };
  }

  if (HARD_BOUNDARY_RE.test(text)) {
    return { kind: "hard_boundary", confidence: 0.95, reasons: ["hard_boundary_term"], recommended_action: "boundary" };
  }

  const previous = lastAssistantAnswer(session);
  const previousWasBadFallback = Boolean(bareFallbackId(previous) || mentionsGenericFallback(previous).length);
  if (previousWasBadFallback && REPAIR_RE.test(text)) {
    return { kind: "fallback_repair", confidence: 0.95, reasons: ["previous_bad_fallback", "repair_phrase"], recommended_action: "repair" };
  }

  if (HELP_RE.test(text)) {
    return { kind: "help_how_to_ask", confidence: 0.94, reasons: ["help_phrase"], recommended_action: "help" };
  }

  if (CAPABILITY_META_RE.test(text)) {
    const action = /你知道我要干什么|你知道我想问什么/.test(text) ? "answer" : "answer";
    return { kind: /你知道我要干什么|你知道我想问什么/.test(text) ? "user_intent_boundary" : "capability_or_meta", confidence: 0.9, reasons: ["capability_or_meta_phrase"], recommended_action: action };
  }

  if (ACTIONABLE_CONTINUATION_RE.test(text)) {
    return { kind: "actionable_continuation", confidence: 0.88, reasons: ["continuation_command"], recommended_action: "answer" };
  }

  if (QUESTION_CUE_RE.test(text) || KNOW_QUESTION_RE.test(text)) {
    return { kind: "question_like", confidence: 0.88, reasons: ["question_cue"], recommended_action: "answer" };
  }

  if (SIGNAL_RE.test(text)) {
    reasons.push("declaration_signal");
    if (hasActiveSession(session) || trace?.active_task) {
      return { kind: "declaration_with_signal", confidence: 0.82, reasons, recommended_action: "answer" };
    }
    return { kind: "declaration_with_signal", confidence: 0.62, reasons: [...reasons, "no_active_session"], recommended_action: "quiet_affordance" };
  }

  if (QUIET_RE.test(text) || (text.length <= 5 && !QUESTION_CUE_RE.test(text))) {
    return { kind: "quiet_declaration", confidence: 0.86, reasons: ["quiet_declaration"], recommended_action: "quiet_affordance" };
  }

  if (text.length > 4) {
    return { kind: "declaration_with_signal", confidence: 0.48, reasons: ["ambiguous_declaration_prefers_answer_path"], recommended_action: "answer" };
  }

  return { kind: "quiet_declaration", confidence: 0.62, reasons: ["short_ambiguous"], recommended_action: "quiet_affordance" };
}
