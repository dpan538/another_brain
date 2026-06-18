import { buildR23ContentPlan } from "./r23_content_plan.js";
import { finalizeR23LiveAnswer } from "./r23_live_finalizer.js";
import { realizeR23Surface } from "./r23_surface_realizer.js";
import { updateTopicStack, activeTopic } from "./topic_stack.js";

function clean(text) {
  return String(text || "").trim();
}

function responseModeFor(plan = {}) {
  if (/simplify|rewrite|expand/.test(plan.requested_operation || "")) return "transform_last_answer";
  if (plan.binding?.kind === "active_referent" || plan.binding?.kind === "recent_concept") return "contextual_answer";
  if (plan.response_act === "state_boundary") return "boundary_answer";
  return "direct_answer";
}

function answerStyleFor(plan = {}) {
  if (/list/.test(plan.requested_operation || "")) return "list";
  if (/compare/.test(plan.requested_operation || "")) return "comparison";
  if (/simplify|rewrite/.test(plan.requested_operation || "")) return "summary";
  if (/familiarity|characteristics|evaluate|recommend|relation|deepening|analogy|affective|compliment/.test(plan.requested_operation || "")) return "culture";
  return "direct";
}

function responseTypeFor(plan = {}) {
  if (plan.response_act === "state_boundary") return "boundary";
  return "answer";
}

function nextSessionFromPlan({ session = {}, query = "", answer = "", plan = {} } = {}) {
  const subjectIds = plan.subject_ids || [];
  const entityIds = subjectIds.filter((id) => /^person\.|^author\./.test(id));
  const workIds = [
    ...subjectIds.filter((id) => /^work\./.test(id)),
    ...(plan.list_items || []).map((item) => item.id).filter((id) => /^work\./.test(id))
  ];
  const topicStack = updateTopicStack({
    session: {
      ...session,
      activeEntityIds: entityIds.length ? entityIds : session.activeEntityIds,
      activeWorkIds: workIds.length ? workIds : session.activeWorkIds,
      activeDomain: plan.domain || session.activeDomain
    },
    query,
    boundReferents: subjectIds,
    domain: plan.domain || "",
    operation: plan.requested_operation || ""
  });
  return {
    activeEntityIds: entityIds.length ? entityIds : session.activeEntityIds || [],
    active_entity_ids: entityIds.length ? entityIds : session.active_entity_ids || [],
    activeWorkIds: workIds.slice(0, 8),
    active_work_ids: workIds.slice(0, 8),
    activeDomain: plan.domain || session.activeDomain || "",
    active_domain: plan.domain || session.active_domain || "",
    active_topic_stack: topicStack,
    r23_active_referent_ids: subjectIds,
    r23_active_concepts: plan.active_concepts || [],
    r23_last_content_plan: plan,
    r23_last_answer: answer,
    r23_last_operation: plan.requested_operation || "",
    last_bound_referent_ids: subjectIds,
    lastOperation: plan.requested_operation || "",
    last_operation: plan.requested_operation || ""
  };
}

export function handleR23CandidateTurn({ query = "", session = {}, runtimeProfile = "standard", uiProfile = "mobile" } = {}) {
  const text = clean(query);
  const plan = buildR23ContentPlan({ query: text, session });
  const realization = realizeR23Surface({ plan, query: text });
  const finalizer = finalizeR23LiveAnswer({ query: text, plan, answer: realization.answer });
  const answer = finalizer.ok
    ? realization.answer
    : plan.binding?.ambiguity_reason
      ? "我需要先确认你指的是哪一个对象或概念。"
      : realization.answer || "这句我只能先保守处理：需要一个更明确的对象或概念。";
  const mode = responseModeFor(plan);
  const answerStyle = answerStyleFor(plan);
  const responseType = responseTypeFor(plan);
  const nextSession = nextSessionFromPlan({ session, query: text, answer, plan });
  const trace = {
    r23_candidate: true,
    user_turn_kind: plan.requested_operation,
    turn_function: plan.response_act,
    response_type: responseType,
    response_mode: mode,
    answer_style: answerStyle,
    question_type: plan.requested_operation,
    operation: plan.requested_operation,
    binding: plan.binding,
    active_topic: activeTopic(nextSession) || null,
    content_plan: plan,
    surface_realization: realization,
    finalizer,
    density_policy: { ui_profile: uiProfile },
    verifier: { ok: finalizer.ok, reasons: finalizer.failures },
    webgpu_assist: { available: false, authoritative: false, runtime_profile: runtimeProfile }
  };
  return {
    response: {
      type: "answer",
      answer,
      trace,
      intent: "r23_candidate",
      route: "r23_candidate",
      persist_as_assistant_message: true,
      count_as_exchange_turn: true
    },
    nextSession,
    trace,
    resolved: {
      intent: "r23_candidate",
      route: "r23_candidate",
      responseMode: { mode, confidence: 0.8, reasons: ["r23_candidate_path"], should_skip_repair: true },
      controllerMode: mode,
      answerStyle,
      responseType,
      questionType: plan.requested_operation,
      operation: plan.requested_operation,
      turnFunction: { turn_function: plan.response_act },
      binding: plan.binding,
      culture: { compactStatePatch: { last_domain: plan.domain } },
      answerPlan: {
        plan_id: `r23.${plan.requested_operation}`,
        semantic_signature: `${plan.subject_ids?.join("+") || "none"}|${plan.requested_operation}|${plan.domain}`,
        evidenceIds: plan.evidence_ids || []
      },
      activeTopicStack: nextSession.active_topic_stack,
      lastAnswerQuality: finalizer.ok ? "accepted" : "verifier_rejected",
      verifier: { ok: finalizer.ok, reasons: finalizer.failures },
      r23ContentPlan: plan
    },
    finalized: {
      answer,
      intent: "r23_candidate",
      route: "r23_candidate",
      firewall: { checked: true, allowed: finalizer.ok, reason: finalizer.ok ? "r23_finalizer_ok" : finalizer.final_failure_reason }
    }
  };
}
