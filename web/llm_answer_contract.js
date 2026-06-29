import { TRAINING_POLICY } from "./training_policy.js";

function clean(text) {
  return String(text || "").trim();
}

function compactEvidence(evidence = []) {
  return (Array.isArray(evidence) ? evidence : [])
    .filter(Boolean)
    .slice(0, 12)
    .map((item, index) => ({
      id: item.id || item.card_id || item.path || `evidence_${index}`,
      source: item.source || item.domain || "static_shard",
      text: clean(item.text || item.answer || item.summary || "").slice(0, 1200),
      contains_private_data: item.contains_private_data === true
    }));
}

function safeSession(session = {}) {
  return {
    activeDomain: session.activeDomain || session.lastDomain || "",
    activeEntityIds: Array.isArray(session.activeEntityIds) ? session.activeEntityIds.slice(0, 8) : [],
    task_state: session.task_state || {},
    recentTurns: Array.isArray(session.recentTurns)
      ? session.recentTurns.slice(-4).map((turn) => ({
          role: turn.role || "",
          text: clean(turn.text || turn.query || turn.answer || "").slice(0, 800)
        }))
      : []
  };
}

function defaultPolicy(policy = {}) {
  return {
    ...TRAINING_POLICY,
    ...policy,
    llm_may_draft: policy.llm_may_draft === true,
    expose_chain_of_thought: false,
    server_inference_allowed: false,
    absent_private_evidence_allowed: false
  };
}

export function buildLlmInputPacket({ query = "", session = {}, retrievedEvidence = [], policy = {} } = {}) {
  return {
    schema_version: 1,
    purpose: "static_browser_llm_draft",
    query: clean(query),
    session: safeSession(session),
    retrieved_evidence: compactEvidence(retrievedEvidence),
    policy: defaultPolicy(policy),
    constraints: {
      same_origin_static_assets_only: true,
      no_backend_inference: true,
      no_external_model_api: true,
      no_external_storage: true,
      no_hidden_prompts: true,
      no_chain_of_thought: true,
      answer_only_from_available_private_evidence: true,
      verifier_finalizer_required: true,
      fallback_firewall_required: true
    }
  };
}

export function validateLlmDraft({ draft = "", query = "", session = {}, evidence = [], policy = {} } = {}) {
  const text = clean(typeof draft === "string" ? draft : draft?.text || draft?.answer || "");
  const mergedPolicy = defaultPolicy(policy);
  const failures = [];

  if (mergedPolicy.staticLlmEnabledByDefault !== true && mergedPolicy.staticLlmCandidateEnabledByDefault !== true && mergedPolicy.llm_may_draft !== true) {
    failures.push("static_llm_draft_disabled_by_policy");
  }
  if (!text) failures.push("empty_draft");
  if (/chain[- ]?of[- ]?thought|思维链|逐步推理|hidden prompt|system prompt|内部提示/i.test(text)) {
    failures.push("hidden_prompt_or_chain_of_thought_exposure");
  }
  if (/server|cloud|api call|OpenAI|Anthropic|Hugging Face|Vercel Function|Edge Function/i.test(text)) {
    failures.push("draft_claims_server_or_external_model_capability");
  }
  if (/I (ran|executed|called) (a )?(command|script|tool)|我(已经)?(运行|执行)了(命令|脚本)|命令已执行/i.test(text)) {
    failures.push("draft_claims_unverified_command_execution");
  }
  if (/\/Users\/|\/private\/|完整歌词|全文如下|身份证|护照|银行卡|电话|邮箱/.test(text)) {
    failures.push("draft_trips_privacy_or_copyright_boundary");
  }
  const evidenceList = compactEvidence(evidence);
  const hasPrivateEvidence = evidenceList.some((item) => item.contains_private_data);
  if (!hasPrivateEvidence && /(你的私人|你的文件|我看到了你的|根据你的本地|你的桌面)/.test(text)) {
    failures.push("draft_claims_absent_private_evidence");
  }

  return {
    ok: failures.length === 0,
    verdict: failures.length === 0 ? "candidate" : "reject",
    failures,
    query: clean(query),
    session_boundary: safeSession(session),
    evidence_count: evidenceList.length,
    draft: text
  };
}

export async function finalizeLlmCandidate({
  draft = "",
  query = "",
  session = {},
  evidence = [],
  policy = {},
  verifier = null,
  fallbackFirewall = null
} = {}) {
  const validation = validateLlmDraft({ draft, query, session, evidence, policy });
  if (!validation.ok) {
    return {
      ok: false,
      surfaced: false,
      route: "r24_fallback_firewall",
      reason: "llm_draft_rejected_before_surface",
      validation,
      answer: ""
    };
  }

  const verifierResult =
    typeof verifier === "function"
      ? await verifier(validation.draft)
      : verifier && typeof verifier.verify === "function"
        ? await verifier.verify(validation.draft)
        : { ok: true, verdict: "accept" };
  if (verifierResult?.ok === false || verifierResult?.verdict === "reject") {
    return {
      ok: false,
      surfaced: false,
      route: "r24_verifier_reject",
      reason: verifierResult.reason || "verifier_reject",
      validation,
      verifier: verifierResult,
      answer: ""
    };
  }

  if (fallbackFirewall && typeof fallbackFirewall.assess === "function") {
    const firewall = fallbackFirewall.assess({ candidateAnswer: validation.draft, trace: { route: "static_llm_draft" } });
    if (firewall?.allowed === false) {
      return {
        ok: false,
        surfaced: false,
        route: "r24_fallback_firewall",
        reason: firewall.reason || "fallback_firewall_reject",
        validation,
        verifier: verifierResult,
        firewall,
        answer: ""
      };
    }
  }

  return {
    ok: true,
    surfaced: true,
    route: "static_llm_verified_candidate",
    validation,
    verifier: verifierResult,
    answer: validation.draft
  };
}
