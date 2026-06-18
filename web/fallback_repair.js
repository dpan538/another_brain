import { classifyFallbackShape, mentionsGenericFallback } from "./generic_fallback_classifier.js";

const BAD_FALLBACK_RE = /(你需要提问。?|你要问哪一边？?|也许发生过，不在我眼前。?|你应该去问百度。?|我只是个对话框。?)/;

function clean(text) {
  return String(text || "").trim();
}

function recentTurns(session = {}) {
  return [
    ...(Array.isArray(session.recentTurns) ? session.recentTurns : []),
    ...(Array.isArray(session.visibleRecentTurns) ? session.visibleRecentTurns : [])
  ].filter(Boolean);
}

function inferLastAssistantAnswer(session = {}) {
  return clean(session.lastAnswer || recentTurns(session).at(-1)?.answer || "");
}

function lastUserQuery(session = {}) {
  return clean(session.lastUserText || recentTurns(session).at(-1)?.question || "");
}

function recentTranscript(session = {}) {
  return [session.lastUserText, session.lastAnswer, ...recentTurns(session).flatMap((turn) => [turn.question, turn.answer])]
    .filter(Boolean)
    .join(" ");
}

export function isGenericBadFallback(answer) {
  const shape = classifyFallbackShape({ answer: clean(answer) });
  return !shape.allowed || shape.kind === "bare_generic_fallback";
}

export function detectFallbackRepairIntent(query, session = {}) {
  const text = clean(query);
  const lastAnswer = inferLastAssistantAnswer(session);
  const hasBadFallback = isGenericBadFallback(lastAnswer) || mentionsGenericFallback(recentTranscript(session)).length > 0;
  if (/(什么发生过|发生过什么|哪一边|什么哪一边|你刚才说什么|为什么这么答|是不是答偏|是不是在绕圈|不要再说你要问哪一边|不是已经问|我已经问|已经问了)/.test(text)) {
    return {
      ok: true,
      kind: /哪一边/.test(text) ? "clarification_phrase_repair" : "bad_fallback_repair",
      hasBadFallback
    };
  }
  if (/什么意思/.test(text) && (hasBadFallback || /刚才|上一句|那句/.test(text))) {
    return { ok: true, kind: "bad_fallback_repair", hasBadFallback };
  }
  if (/(我需要怎么提问|怎么提问|怎么问你|怎么开始问)/.test(text)) {
    return { ok: true, kind: "help_how_to_ask", hasBadFallback };
  }
  return { ok: false, kind: "none", hasBadFallback };
}

export function answerFallbackRepair({ query, session = {}, lastAssistantAnswer = "", lastUserQuery: explicitLastUser = "" }) {
  const text = clean(query);
  const repair = detectFallbackRepairIntent(text, session);
  if (!repair.ok) return null;

  const lastAnswer = clean(lastAssistantAnswer) || inferLastAssistantAnswer(session);
  const previousUser = clean(explicitLastUser) || lastUserQuery(session);
  const transcript = recentTranscript(session);
  const likelyLuo = /罗大佑/.test(`${previousUser} ${transcript}`);
  const likelyJapanese = /日本文学/.test(`${previousUser} ${transcript}`);

  if (repair.kind === "help_how_to_ask") {
    return {
      intent: "help_how_to_ask",
      operation: "help_how_to_ask",
      questionType: "help_how_to_ask",
      contextAction: "ANSWER_HELP",
      answer:
        "直接问对象和方向就行：可以问他是谁、有什么作品、从哪里开始、怎么比较，或者把一句话丢给我解释。"
    };
  }

  if (repair.kind === "clarification_phrase_repair") {
    return {
      intent: "operation_fallback_self_repair",
      operation: "clarification_loop_repair",
      questionType: "fallback_repair",
      contextAction: "ANSWER_HELP",
      answer:
        "我刚才不该这样反问。需要给出具体选项才算澄清；你可以直接问：他是谁、有什么作品、代表作是什么，或者某首歌怎么理解。"
    };
  }

  if (/什么发生过|发生过什么|发生过/.test(text)) {
    const topic = likelyLuo ? "罗大佑" : likelyJapanese ? "日本文学" : "刚才的问题";
    const suffix = likelyLuo
      ? "罗大佑是台湾音乐人，不是一个待确认的外部事件。"
      : likelyJapanese
        ? "日本文学是一个文学领域，不是一个待确认的外部事件。"
        : "这里应该先回到你上一句，而不是继续反问。";
    return {
      intent: "operation_fallback_self_repair",
      operation: "repair_previous_bad_fallback",
      questionType: "fallback_repair",
      contextAction: "ANSWER_HELP",
      answer: `刚才那句不该这样答。你问的是${topic}，不是事件；${suffix}`
    };
  }

  if (/不是已经问|我已经问|已经问了/.test(text)) {
    return {
      intent: "operation_fallback_self_repair",
      operation: "repair_previous_bad_fallback",
      questionType: "fallback_repair",
      contextAction: "ANSWER_HELP",
      answer: "你已经问了。我刚才不该说“你需要提问”；这里应该识别你的对象和方向，再给一个可验证的回答。"
    };
  }

  if (/什么意思|你刚才说什么|为什么这么答|是不是答偏|是不是在绕圈/.test(text)) {
    return {
      intent: "operation_fallback_self_repair",
      operation: "repair_previous_bad_fallback",
      questionType: "fallback_repair",
      contextAction: "ANSWER_HELP",
      answer: lastAnswer
        ? `我刚才答偏了：${lastAnswer.replace(BAD_FALLBACK_RE, "那句 generic fallback")}不够具体。请直接给对象或方向，我应该直接接住。`
        : "我刚才没有接住问题。应该先识别对象、方向和证据边界，而不是用空泛 fallback 顶掉。"
    };
  }

  return null;
}
