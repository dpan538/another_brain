import { shouldBreakClarificationLoop, rewriteClarificationLoop } from "./clarification_loop_guard.js";
import { answerFallbackRepair, detectFallbackRepairIntent, isGenericBadFallback } from "./fallback_repair.js";
import { classifyFallbackShape } from "./generic_fallback_classifier.js";
import { answerMetaKnowledgeQuery, classifyKnowQuery } from "./meta_knowledge_router.js";
import { answerCultureQuery, detectCultureDomain, resolveCultureEntity } from "./culture_runtime.js";

const QUESTION_CUES_RE = /(谁|什么|吗|嘛|呢|怎么|为什么|为何|哪|哪里|有没有|知道|介绍|代表|有哪些|读过|听过|懂|了解|[?？])/;

function clean(text) {
  return String(text || "").trim();
}

function isPolicyQuestion(query) {
  const text = clean(query);
  return /(如果|当|什么情况下|适合什么问题|怎么答|如何回答|规则|边界|fallback|回退|不确定.*答|事实问题.*眼前)/i.test(text);
}

export function isQuestionLike(query) {
  return QUESTION_CUES_RE.test(clean(query));
}

function detectedKnownCulture(query) {
  const text = clean(query);
  if (!text) return false;
  if (detectCultureDomain(text, {}) !== "generic") return true;
  return resolveCultureEntity(text, {}).some((card) => card && card.entity_type !== "concept");
}

function isExternalLookupQuestion(query) {
  return /(最新|当前|现在|今天|开门|发生过吗|是真的吗|出现过|在哪里|和.+有什么关系|关系是什么|新闻|价格|天气|总统|首相|CEO)/.test(clean(query));
}

function lastAssistantAnswer(state = {}) {
  if (state.lastAnswer) return clean(state.lastAnswer);
  const turns = [
    ...(Array.isArray(state.recentTurns) ? state.recentTurns : []),
    ...(Array.isArray(state.visibleRecentTurns) ? state.visibleRecentTurns : [])
  ].filter(Boolean);
  return clean(turns.at(-1)?.answer || "");
}

function traceQuestionType(trace = {}) {
  return trace.question_type || trace.questionType || trace.questionTypeLabel || "";
}

function traceOperation(trace = {}) {
  return trace.operation || trace.contextAction || trace.context_action || "";
}

function replacementForPolicy(policy, query, state) {
  if (policy === "repair_previous_bad_fallback") {
    return answerFallbackRepair({ query, session: state })?.answer || "我刚才答偏了。这里应该回到上一句的问题，而不是继续用 fallback。";
  }
  if (policy === "help_how_to_ask") {
    return "直接问对象和方向就行：可以问他是谁、有什么作品、从哪里开始、怎么比较，或者把一句话丢给我解释。";
  }
  if (policy === "user_intent_boundary") {
    return answerMetaKnowledgeQuery(query, state)?.answer || "不知道。我只能从这一句判断；你可以直接说目标。";
  }
  if (policy === "capability_boundary") {
    return answerMetaKnowledgeQuery(query, state)?.answer || "我没有人的经历，但可以按本地知识卡和证据边界回答。";
  }
  if (policy === "direct_known_entity_overview") {
    const culture = answerCultureQuery(query, state);
    if (culture?.answer) return culture.answer;
    return "这是可按文化对象回答的问题；我应该先识别对象、作品或领域，再按证据边界给短答。";
  }
  if (policy === "minimal_specific_clarify") {
    return rewriteClarificationLoop({ query, session: state, draft: "" });
  }
  return "我没接住这个问题。你可以直接说对象和方向，我会按证据边界回答。";
}

export class FallbackFirewall {
  assess({ query, state = {}, trace = {}, candidateAnswer = "", fallbackId = "" }) {
    const q = clean(query);
    const answer = clean(candidateAnswer);
    const shape = classifyFallbackShape({
      answer,
      questionType: traceQuestionType(trace),
      operation: traceOperation(trace),
      lastAssistantAnswer: lastAssistantAnswer(state)
    });
    const know = classifyKnowQuery(q, state);
    const repair = detectFallbackRepairIntent(q, state);
    const questionLike = isQuestionLike(q);
    const policyQuestion = isPolicyQuestion(q);
    const knownCulture = detectedKnownCulture(q) || ["entity_overview", "work_overview", "domain_overview"].includes(know.kind);

    if (shape.kind === "bare_generic_fallback" && shape.fallback_id === "search_redirect" && isExternalLookupQuestion(q) && !knownCulture && know.kind === "none") {
      return {
        checked: true,
        shape: shape.kind,
        allowed: true,
        reason: "allowed_external_search_redirect",
        fallback_ids: shape.fallback_ids || ["search_redirect"],
        rewrite_required: false,
        replacement_policy: "",
        exemption: "external_lookup_boundary"
      };
    }

    if (!shape.allowed) {
      return {
        checked: true,
        shape: shape.kind,
        allowed: false,
        reason: shape.kind,
        fallback_ids: shape.fallback_ids || [],
        rewrite_required: true,
        replacement_policy:
          repair.kind === "help_how_to_ask"
            ? "help_how_to_ask"
            : repair.ok
              ? "repair_previous_bad_fallback"
              : knownCulture
                ? "direct_known_entity_overview"
                : "minimal_specific_clarify",
        exemption: "none"
      };
    }

    if (shape.kind === "repair_quote") {
      return {
        checked: true,
        shape: shape.kind,
        allowed: true,
        reason: "allowed_repair_quote",
        fallback_ids: shape.fallback_ids || [],
        rewrite_required: false,
        replacement_policy: "",
        exemption: "repair_quote"
      };
    }

    if (shape.kind === "specific_clarification") {
      return {
        checked: true,
        shape: shape.kind,
        allowed: true,
        reason: "allowed_specific_clarification",
        fallback_ids: shape.fallback_ids || [],
        rewrite_required: false,
        replacement_policy: "",
        exemption: "named_alternatives"
      };
    }

    if (shouldBreakClarificationLoop({ query: q, session: state, draft: answer })) {
      return {
        checked: true,
        shape: shape.kind,
        allowed: false,
        reason: "clarification_loop",
        fallback_ids: shape.fallback_ids || [],
        rewrite_required: true,
        replacement_policy: repair.kind === "help_how_to_ask" ? "help_how_to_ask" : "minimal_specific_clarify",
        exemption: "none"
      };
    }

    if (!isGenericBadFallback(answer)) {
      return {
        checked: true,
        shape: shape.kind,
        allowed: true,
        reason: "not_generic_fallback",
        fallback_ids: shape.fallback_ids || [],
        rewrite_required: false,
        replacement_policy: "",
        exemption: shape.exemption || "none"
      };
    }

    if (policyQuestion && !repair.ok && !knownCulture) {
      return {
        checked: true,
        shape: shape.kind,
        allowed: true,
        reason: "policy_question_about_fallback",
        fallback_ids: shape.fallback_ids || [],
        rewrite_required: false,
        replacement_policy: "",
        exemption: "policy_question"
      };
    }

    if (/你需要提问/.test(answer)) {
      if (questionLike || knownCulture || know.kind !== "none") {
        return {
          checked: true,
          shape: shape.kind,
          allowed: false,
          reason: "valid_question_misread_as_no_question",
          fallback_ids: shape.fallback_ids || ["ask_required"],
          rewrite_required: true,
          replacement_policy: repair.kind === "help_how_to_ask" ? "help_how_to_ask" : knownCulture ? "direct_known_entity_overview" : "unknown_but_not_event",
          exemption: "none"
        };
      }
    }

    if (/你要问哪一边/.test(answer)) {
      return {
        checked: true,
        shape: shape.kind,
        allowed: false,
        reason: "bare_which_side_fallback",
        fallback_ids: shape.fallback_ids || ["which_side"],
        rewrite_required: true,
        replacement_policy: repair.ok ? "repair_previous_bad_fallback" : "minimal_specific_clarify",
        exemption: "none"
      };
    }

    if (/也许发生过，不在我眼前/.test(answer)) {
      if (knownCulture || /你知道我|你知道自己|你读过|你听过|你了解|我需要怎么提问/.test(q) || know.kind !== "none") {
        return {
          checked: true,
          shape: shape.kind,
          allowed: false,
          reason: knownCulture ? "know_query_misrouted_unknown" : "user_intent_misrouted_unknown",
          fallback_ids: shape.fallback_ids || ["external_event_unknown"],
          rewrite_required: true,
          replacement_policy:
            know.kind === "user_intent"
              ? "user_intent_boundary"
              : know.kind === "self_capability"
                ? "capability_boundary"
                : repair.ok
                ? "repair_previous_bad_fallback"
                  : "direct_known_entity_overview",
          exemption: "none"
        };
      }
    }

    return {
      checked: true,
      shape: shape.kind,
      allowed: true,
      reason: "generic_fallback_allowed_by_policy",
      fallback_ids: shape.fallback_ids || [],
      rewrite_required: false,
      replacement_policy: "",
      exemption: shape.exemption || "none"
    };
  }
}

export function finalizeWithFallbackFirewall({ query, state = {}, trace = {}, candidateAnswer = "", intent = "", route = "" }) {
  const firewall = new FallbackFirewall();
  const assessment = firewall.assess({ query, state, trace, candidateAnswer, fallbackId: route });
  if (assessment.allowed) {
    return { answer: clean(candidateAnswer), intent, route, firewall: assessment };
  }
  const replacement = replacementForPolicy(assessment.replacement_policy, query, state);
  const second = firewall.assess({ query, state, trace, candidateAnswer: replacement, fallbackId: "firewall_rewrite" });
  return {
    answer: second.allowed ? replacement : "我没接住这个问题。你可以直接说对象和方向，我会按证据边界回答。",
    intent: assessment.replacement_policy === "help_how_to_ask" ? "help_how_to_ask" : intent || "fallback_firewall_rewrite",
    route: "fallback_firewall",
    firewall: {
      ...assessment,
      rewrite_answer: replacement,
      second_pass: second
    }
  };
}

export { isGenericBadFallback };
