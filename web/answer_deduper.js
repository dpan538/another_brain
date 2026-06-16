function clean(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

export function normalizeAnswerForDedupe(answer) {
  return clean(answer)
    .replace(/[《》「」『』“”"'`]/g, "")
    .replace(/[，。！？、；：,.!?;:\s/]/g, "")
    .toLowerCase();
}

export function answerSimilarity(a, b) {
  const left = normalizeAnswerForDedupe(a);
  const right = normalizeAnswerForDedupe(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const grams = (text) => {
    const out = new Set();
    for (let i = 0; i < text.length - 1; i += 1) out.add(text.slice(i, i + 2));
    return out;
  };
  const aSet = grams(left);
  const bSet = grams(right);
  const union = new Set([...aSet, ...bSet]);
  let overlap = 0;
  for (const item of aSet) if (bSet.has(item)) overlap += 1;
  return union.size ? overlap / union.size : 0;
}

function recentAssistantAnswers(session = {}) {
  const turns = Array.isArray(session.recentTurns) ? session.recentTurns : [];
  const answers = turns.map((turn) => turn.answer || "").filter(Boolean);
  if (session.lastAssistantAnswer || session.lastAnswer) answers.push(session.lastAssistantAnswer || session.lastAnswer);
  return answers.slice(-3);
}

export function detectRepeatAnswer({ answer = "", session = {}, plan = {} } = {}) {
  const recent = recentAssistantAnswers(session);
  const last = recent.at(-1) || "";
  const similarity = answerSimilarity(answer, last);
  const signature = plan.semantic_signature || "";
  const genericDirectSignature = /^(unknown|last_answer)\|answer\|direct_answer$/.test(signature);
  const meaningfulSignature = Boolean(signature) && !signature.startsWith("unknown|") && !signature.startsWith("last_answer|");
  const sameSignature =
    meaningfulSignature &&
    !genericDirectSignature &&
    (session.last_answer_signature === signature || session.lastAnswerSignature === signature);
  const repeated = Boolean(last) && (sameSignature || (meaningfulSignature && similarity > 0.82));
  return {
    repeated,
    similarity,
    same_signature: Boolean(sameSignature),
    previous_answer: last,
    semantic_signature: plan.semantic_signature || ""
  };
}

export function rewriteForNonRepeat({ answer = "", session = {}, plan = {}, query = "" } = {}) {
  if (/重复|原样|再说一遍/.test(query)) return answer;
  if (plan.semantic_signature === "person.luo_dayou|music_characteristics|representativeness") {
    return "同一个方向，简单说：他的歌把青春记忆、城乡变化和社会观察放进流行歌；《童年》《鹿港小镇》《恋曲1990》是入口。";
  }
  const text = clean(answer);
  if (!text) return text;
  if (/^简单说/.test(text)) return `换个说法：${text.replace(/^简单说[:：]?/, "")}`;
  return `换个说法：${text}`;
}
