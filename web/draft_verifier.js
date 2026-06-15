import { assessCoverageForAnswer } from "./coverage_gate.js";
import { classifyFallbackShape } from "./generic_fallback_classifier.js";

const BAD_GENERIC_RE =
  /(你需要提问|你要问哪一边|也许发生过，不在我眼前|你应该去问百度|知道一点。城市、青春和历史，会一起压进歌里|罗大佑适合听时代怎么进入私人生活|日本文学不要只读情节|我会编|编一个听起来合理)/;
const BAD_TEMPLATE_RE =
  /(知道一点。城市、青春和历史，会一起压进歌里|罗大佑适合听时代怎么进入私人生活|日本文学不要只读情节|我会编|编一个听起来合理)/;
const COPYRIGHT_REQUEST_RE = /(歌词|原文|唱词|逐字|整首|全文|整段|一大段|贴出来|逐句翻译)/;
const COPYRIGHT_BOUNDARY_RE = /(不能|不提供|不输出|不贴|不给|版权|可以.*(解释|概括|摘要|讲|主题|背景)|改讲)/;
const QUESTION_CUES_RE = /(谁|什么|吗|嘛|呢|怎么|为什么|为何|哪|哪里|有没有|知道|介绍|代表|有哪些|读过|听过|懂|了解|[?？])/;

function clean(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

function hasLocalPath(text) {
  return /\/Users\/|\/Volumes\/|\/home\/|[A-Za-z]:\\/.test(text);
}

function hasEmail(text) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}

function containsSolverResult(answer, solverResult) {
  if (!solverResult?.ok) return true;
  const result = solverResult.result;
  if (typeof result === "boolean") {
    return result ? /(是|成立|会)/.test(answer) && !/(不是|不成立|不会)/.test(answer) : /(不是|不成立|不会|不能推出)/.test(answer);
  }
  if (result == null) return true;
  const cnDigits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (Number.isInteger(result) && result >= 0 && result <= 10 && answer.includes(cnDigits[result])) return true;
  return answer.includes(String(result));
}

function looksLikeLongCopyright(answer) {
  const lines = answer.split(/\r?\n/).filter((line) => line.trim());
  return lines.length >= 5 || answer.length > 500;
}

export function verifyDraft({ query = "", trace = {}, draft = "", solverResult = null, evidence = null, source = "" }) {
  const q = clean(query);
  const answer = clean(draft);
  const questionType = trace.question_type || trace.questionType || "";
  const operation = trace.operation || "";
  const fallbackShape = classifyFallbackShape({
    answer,
    questionType,
    operation,
    lastAssistantAnswer: trace.lastAssistantAnswer || trace.last_answer || ""
  });
  const reasons = [];

  if (!answer) reasons.push("missing_evidence");
  if (BAD_GENERIC_RE.test(answer) && !fallbackShape.allowed) reasons.push("too_generic");
  if (BAD_TEMPLATE_RE.test(answer)) reasons.push("too_generic");
  if (/我会编|编一个听起来合理/.test(answer)) reasons.push("fabrication_policy_violation");
  if (/你需要提问/.test(answer) && fallbackShape.kind !== "repair_quote" && QUESTION_CUES_RE.test(q)) {
    reasons.push("valid_question_misread_as_no_question");
  }
  if (/你要问哪一边/.test(answer) && !["repair_quote", "specific_clarification"].includes(fallbackShape.kind)) {
    const namesAlternatives = /(还是|或者|你是问|A|B|《[^》]+》)/.test(answer);
    reasons.push(namesAlternatives ? "missing_alternatives" : "clarification_loop");
  }
  if (/也许发生过，不在我眼前/.test(answer) && fallbackShape.kind !== "repair_quote") {
    if (/(罗大佑|日本文学|夏目漱石|川端康成|之乎者也|你知道我|你知道自己|你读过|你听过|你懂|你了解|我需要怎么提问)/.test(q)) {
      reasons.push(/你知道我|你知道自己/.test(q) ? "user_intent_misrouted_unknown" : "know_query_misrouted_unknown");
    }
  }
  if (/(你读过|你听过|你懂|你了解)/.test(q) && fallbackShape.kind !== "repair_quote" && /(你需要提问|你要问哪一边|也许发生过)/.test(answer)) {
    reasons.push("capability_question_misrouted");
  }
  if (/(什么发生过|哪一边|什么意思|你刚才说什么|你为什么这么答|你是不是答偏|你是不是在绕圈)/.test(q) && !fallbackShape.allowed && BAD_GENERIC_RE.test(answer)) {
    reasons.push("fallback_self_repair_needed");
  }
  if (/^(你要|你想|要不|还是|哪一边).*[？?]$/.test(answer)) reasons.push("unnecessary_counterquestion");
  if (hasLocalPath(answer) || /根据你的|根据.*文件|根据.*网站|according to your/i.test(answer)) reasons.push("source_framing");
  if (hasEmail(answer) || /(身份证|护照|银行卡|手机号|电话号码|住址|地址|GPS|签证)/.test(answer)) reasons.push("privacy_violation");
  if (COPYRIGHT_REQUEST_RE.test(q)) {
    if (looksLikeLongCopyright(answer) || /完整歌词如下|全文如下|整首如下/.test(answer)) reasons.push("copyright_violation");
    if (!COPYRIGHT_BOUNDARY_RE.test(answer)) reasons.push("copyright_boundary_missing");
  }
  if (answer.length > 520) reasons.push("answer_too_long");

  if (solverResult?.ok && !containsSolverResult(answer, solverResult)) {
    reasons.push("solver_conflict");
  }
  if (/arithmetic|weekday|transitive|syllogism|set_quantifier/.test(source || trace.task_type || "")) {
    if (!solverResult?.ok) reasons.push("reasoning_not_answered");
  }

  if (/culture/.test(source || trace.task_type || "")) {
    if ((questionType === "works_list" || questionType === "representative_works" || questionType === "listen_recommendation") && !/《[^》]+》/.test(answer)) {
      reasons.push("works_list_missing_works");
    }
    if ((questionType === "compare" || questionType === "follow_up_compare_last_two") && !/(按|轴|比较|共同点|不同|区别|更偏|更重)/.test(answer)) {
      reasons.push("compare_missing_axis");
    }
    if ((questionType === "entry_path" || questionType === "reading_recommendation") && !/(先|入门|入口|开始|路线|可选|《)/.test(answer)) {
      reasons.push("entry_path_missing_entry");
    }
    if ((questionType === "explain_work" || questionType === "follow_up_explain_last_entity") && /^(你要问|要看你|这要看)/.test(answer)) {
      reasons.push("explain_work_only_clarifies");
    }
    const coverage = assessCoverageForAnswer({
      query: q,
      domain: trace.domain || evidence?.domain || "",
      questionType,
      answer,
      retrievedCards: evidence?.cards || [],
      trace
    });
    if (!coverage.ok) reasons.push(...coverage.reasons);
  }

  if (/不知道|没有足够/.test(answer) && evidence && Array.isArray(evidence.cards) && evidence.cards.length > 0) {
    reasons.push("unknown_overclaim");
  }

  return {
    ok: reasons.length === 0,
    verdict: reasons.length === 0 ? "accepted" : "rejected",
    reasons,
    reject_reason: reasons.join(", "),
    must_rewrite: reasons.length > 0
  };
}
