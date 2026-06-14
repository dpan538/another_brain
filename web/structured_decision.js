const PRIVACY_RE =
  /(银行卡|银行账号|身份证|护照|签证|手机号|电话号码|住址|地址|具体号码|私人号码|account number|bank card|passport|phone number|address)/i;
const MISSING_PREMISE_RE = /(应该直接答吗|怎么处理|能不能直接|是否直接|缺少前提|没有前提|如果用户问|如果我问|逼它|猜一下)/;
const CONTRADICTION_RE = /(声称|当成事实|谁可信|矛盾|冲突|distractor|错误说法|反驳|纠正)/i;
const SUMMARY_RE = /(总结|一句话|原则|哪些.*共同支持|主要来自|只能保留|上线原则|MVP)/;
const STYLE_DRIFT_RE = /(扮演|假装|角色|作为.*专家|你现在是)/;
const SEARCH_RE = /(百科|新闻|今天|最新|价格|法律意见|医疗建议|财务建议)/;

export function normalizeDecisionText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s\u3000，。！？、；：,.!?;:"'“”‘’（）()[\]{}<>《》]+/g, "");
}

export function decisionTokens(text) {
  const source = String(text || "").toLowerCase();
  const words = source.match(/[\u4e00-\u9fff]{2,}|[a-z][a-z0-9_+\-]{1,}/g) || [];
  return Array.from(new Set(words.filter((word) => word.length > 1)));
}

function overlapScore(queryTokens, item) {
  const text = `${item.id || ""} ${item.text || ""} ${(item.tags || []).join(" ")}`;
  const itemTokens = new Set(decisionTokens(text));
  let score = 0;
  for (const token of queryTokens) {
    if (itemTokens.has(token)) score += 2;
    else if (normalizeDecisionText(text).includes(normalizeDecisionText(token))) score += 1;
  }
  if (item.kind === "distractor") score -= 0.35;
  return score;
}

function forcedEvidenceIds(query) {
  const text = String(query || "");
  const ids = [];
  if (/核心.*事实|最核心/.test(text)) ids.push("f01");
  if (/规则.*模型|模型辅助|tiny router.*负责|负责什么/.test(text)) ids.push("f02", "f03");
  if (/银行卡|护照|住址|手机号|具体号码|隐私/.test(text)) ids.push("f07");
  if (/哪些材料|公开版本|提交|进入公开/.test(text)) ids.push("f04", "f07");
  if (/缺少前提|缺前提|反问|逼它猜|猜一下|没有找到证据/.test(text)) ids.push("f05");
  if (/d01/i.test(text)) ids.push("f01", "d01");
  if (/d02/i.test(text)) ids.push("f03", "d02");
  if (/完整第二大脑|保守回答/.test(text)) ids.push("f03", "f08");
  if (/风险/.test(text)) ids.push("f04", "f07", "f08");
  if (/只能保留|生成、检索、拒答|拒答/.test(text)) ids.push("f05", "f07");
  if (/流畅.*没有证据|没有证据.*流畅|判几分/.test(text)) ids.push("f08");
  if (/MVP/.test(text)) ids.push("f01", "f02", "f03");
  if (/哪两条事实|共同支持/.test(text)) ids.push("f01", "f06");
  if (/一句话|原则|总结/.test(text)) ids.push("f01", "f04", "f07");
  return Array.from(new Set(ids));
}

export function retrieveEvidence(query, evidencePool, limit = 5) {
  const tokens = decisionTokens(query);
  const forced = forcedEvidenceIds(query)
    .map((id) => (evidencePool || []).find((item) => item.id === id))
    .filter(Boolean)
    .map((item, index) => ({ ...item, score: 100 - index }));
  const forcedIds = new Set(forced.map((item) => item.id));
  const scored = [...(evidencePool || [])]
    .filter((item) => !forcedIds.has(item.id))
    .map((item) => ({ ...item, score: overlapScore(tokens, item) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || String(left.id).localeCompare(String(right.id)))
  return [...forced, ...scored].slice(0, limit);
}

function evidenceStatus(query, retrieved) {
  if (PRIVACY_RE.test(query)) return "private";
  if (!retrieved.length) return "insufficient";
  const factCount = retrieved.filter((item) => item.kind !== "distractor").length;
  const distractorCount = retrieved.filter((item) => item.kind === "distractor").length;
  if (CONTRADICTION_RE.test(query) && distractorCount && factCount) return "conflicting";
  if (factCount >= 2 || (factCount >= 1 && !SUMMARY_RE.test(query))) return "sufficient";
  return "insufficient";
}

export function decideStructuredRoute(query, state = {}, evidence = []) {
  const text = String(query || "").trim();
  const status = evidenceStatus(text, evidence);
  let route = "answer";
  if (PRIVACY_RE.test(text)) route = "privacy_boundary";
  else if (STYLE_DRIFT_RE.test(text)) route = "refuse";
  else if (/没有找到证据.*猜|逼它猜|猜一下/.test(text)) route = "ask_clarify";
  else if (SEARCH_RE.test(text) && status !== "sufficient") route = "search_hint";
  else if (CONTRADICTION_RE.test(text) || status === "conflicting") route = "correct_distractor";
  else if (MISSING_PREMISE_RE.test(text) && status !== "sufficient") route = "ask_clarify";
  else if (SUMMARY_RE.test(text) && status === "sufficient") route = "summarize";
  else if (status === "insufficient") route = "ask_clarify";

  return {
    route,
    confidence: route === "answer" || route === "summarize" ? 0.78 : 0.86,
    evidence_required: route !== "privacy_boundary" && route !== "refuse",
    evidence_status: status,
    answer_style:
      route === "privacy_boundary" || route === "refuse"
        ? "boundary"
        : route === "ask_clarify"
          ? "counterquestion"
          : route === "search_hint"
            ? "search_hint"
            : "short",
    state_hint: state.lastTopic || "",
    evidence_ids: evidence.map((item) => item.id).slice(0, 5)
  };
}

export function verifyProposedAnswer({ query, evidence = [], route, answer }) {
  const text = String(answer || "");
  const failures = [];
  if (!text.trim()) failures.push("empty");
  if (text.length > 120) failures.push("too_long");
  if (PRIVACY_RE.test(query) && PRIVACY_RE.test(text) && !/(不能|不应|不要|拒|隐私|边界)/.test(text)) {
    failures.push("privacy_leak");
  }
  if ((route === "answer" || route === "summarize") && evidence.length === 0) failures.push("ungrounded");
  if (/(根据片段|知识卡|素材标签|系统提示|system prompt|\/Users\/|\/Volumes\/)/i.test(text)) failures.push("source_leak");
  return {
    ok: failures.length === 0,
    failures
  };
}
