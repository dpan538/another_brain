import { isGenericBadFallback } from "./fallback_repair.js";

function clean(text) {
  return String(text || "").trim();
}

function turns(session = {}) {
  return [
    ...(Array.isArray(session.recentTurns) ? session.recentTurns : []),
    ...(Array.isArray(session.visibleRecentTurns) ? session.visibleRecentTurns : [])
  ].filter(Boolean);
}

export function detectRepeatedClarification(session = {}) {
  const answers = turns(session)
    .map((turn) => clean(turn.answer))
    .filter(Boolean)
    .slice(-4);
  const whichSide = answers.filter((answer) => /你要问哪一边/.test(answer)).length;
  const askRequired = answers.filter((answer) => /^你需要提问。?$/.test(answer)).length;
  const externalUnknown = answers.filter((answer) => /^也许发生过，不在我眼前。?$/.test(answer)).length;
  return {
    repeated: whichSide >= 1 || askRequired >= 2 || externalUnknown >= 2,
    which_side_count: whichSide,
    ask_required_count: askRequired,
    external_unknown_count: externalUnknown,
    answers
  };
}

export function shouldBreakClarificationLoop({ query, session = {}, draft = "" }) {
  const text = clean(query);
  const answer = clean(draft);
  const repeated = detectRepeatedClarification(session);
  if (
    /^(哪一边|什么哪一边|哪边|什么意思|怎么问|我需要怎么提问)[？?。]*$/.test(text) &&
    (!answer || isGenericBadFallback(answer) || /你要问哪一边/.test(answer))
  ) {
    return true;
  }
  if (/你要问哪一边/.test(answer) && !/(还是|或|或者|你是问|A|B|《)/.test(answer)) return true;
  if (isGenericBadFallback(answer) && repeated.repeated) return true;
  if (answer && answer === clean(turns(session).at(-1)?.answer || "")) return isGenericBadFallback(answer);
  return false;
}

export function rewriteClarificationLoop({ query, session = {}, draft = "" }) {
  const text = clean(query);
  if (/哪一边|哪边|什么哪一边/.test(text)) {
    return "我刚才不该只说“哪一边”。澄清必须给具体选项；你可以直接问人物、作品、代表作、入门路径或比较。";
  }
  if (/怎么问|怎么提问|怎么开始/.test(text)) {
    return "直接问对象和方向就行：比如“罗大佑是谁”“有哪些作品”“日本文学从哪开始读”“两位作者差在哪”。";
  }
  if (/你要问哪一边/.test(draft)) {
    return "这个问题需要具体澄清时，我应该给出选项，而不是只问“哪一边”。";
  }
  return "我刚才没有接住问题。你可以直接说对象和方向，我会按证据边界回答。";
}
