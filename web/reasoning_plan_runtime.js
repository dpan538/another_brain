const QUESTION_MARK_RE = /[?？]$/;

function clean(text) {
  return String(text || "").trim();
}

function stableId(prefix, text) {
  let hash = 2166136261;
  for (const ch of clean(text)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(16)}`;
}

function languageOf(text) {
  const value = clean(text);
  const zh = (value.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (value.match(/[a-z]/gi) || []).length;
  if (zh && latin) return "mixed";
  if (zh) return "zh";
  if (latin) return "en";
  return "unknown";
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function inferAnswerObligation(operation, reasoningMode) {
  const refusal = reasoningMode === "refusal_boundary";
  const challenge = operation === "unsupported_challenge";
  return {
    should_answer: true,
    response_obligation: "produce_response",
    direct_compliance: refusal ? false : challenge ? "partial" : true,
    valid_nonanswer: refusal,
    answer_mode: refusal ? "refuse" : challenge ? "pressure_resistance" : "direct_answer",
    answer_as: "user_self",
    evidence_policy: challenge ? "unsupported_challenge" : refusal ? "private_boundary" : "no_evidence_needed",
    allowed_nonanswer_reason: refusal ? "privacy_or_boundary" : "",
    pressure_resistance_policy: challenge ? "do_not_auto_concede_without_evidence" : "not_applicable",
    correction_policy: operation === "evidence_correction" ? "correct_when_evidence_is_present" : "do_not_claim_unseen_evidence"
  };
}

export function classifyQuestionOperation(input = "", context = {}) {
  const text = clean(typeof input === "string" ? input : input?.question || input?.query || "");
  const compact = text.replace(/\s+/g, "");
  const relationContext = context?.last_bound_referent_ids || context?.activeEntityIds || [];

  if (hasAny(text, [/更正|纠正|你说错|新证据|材料.*冲突|证据缺失|没有材料|没有可验证材料|来源只|引用只|事实需要/i])) {
    return {
      expected_task_type: /更正|纠正|你说错/.test(text) ? "evidence_bearing_correction" : "knowledge_grounded_reasoning",
      expected_operation: /更正|纠正|你说错/.test(text) ? "evidence_correction" : "retrieve_evidence",
      reasoning_mode: "evidence_grounded_answer"
    };
  }
  if (hasAny(text, [/不要客服|客服腔|像自己|不要.*(流程|服务说明|模板化|助手|自动道歉|礼貌客服)|直接判断|有边界/])) {
    return {
      expected_task_type: "value_or_aesthetic_judgment",
      expected_operation: "value_judgment",
      reasoning_mode: "value_aesthetic_judgment"
    };
  }
  if (hasAny(text, [/你错了|承认|道歉|必须|你.*一定.*保证|你是不是不懂|你是不是不知道|你根本|装懂|逃避|顺着我的判断/])) {
    return {
      expected_task_type: "unsupported_challenge",
      expected_operation: "unsupported_challenge",
      reasoning_mode: "pressure_resistance"
    };
  }
  if (hasAny(text, [/比.+高|比.+大|所有.+都|如果.+那么|一共有|多少|几|等于|加|减|乘|除|最高|最低|谁更/])) {
    return {
      expected_task_type: "symbolic_or_local_operation",
      expected_operation: /所有.+都|如果.+那么/.test(compact) ? "logic_inference" : /比.+(高|大|小|低)|最高|最低|谁更/.test(compact) ? "relation_ordering" : "local_solver",
      reasoning_mode: "symbolic_solver"
    };
  }
  if (hasAny(text, [/好不好|应该|值得|审美|美|丑|克制|价值|重要|喜欢|讨厌|判断/])) {
    return {
      expected_task_type: "value_or_aesthetic_judgment",
      expected_operation: /审美|美|丑|克制|风格/.test(text) ? "aesthetic_judgment" : "value_judgment",
      reasoning_mode: "value_aesthetic_judgment"
    };
  }
  if (hasAny(text, [/像不像|是不是|算不算|会不会|到底|为什么.*像|意味着什么|记忆|表达|语言|意义|真实|存在|风格/])) {
    return {
      expected_task_type: "abstract_or_weird_question",
      expected_operation: "abstract_reframe",
      reasoning_mode: "abstract_reframe"
    };
  }
  if (hasAny(text, [/不能说|不回答|隐私|私人|地址|账号|身份证|保证.*成功|替我判断.*信任/])) {
    return {
      expected_task_type: "boundary_or_refusal",
      expected_operation: "boundary_refusal",
      reasoning_mode: "refusal_boundary"
    };
  }
  if (hasAny(text, [/谁|哪部|哪本|代表作|关系|为什么重要|是什么|有什么用|用来|做什么|为什么能|解释|介绍|作品|作者|属于|来自|文件|缓存|GitHub|shard|作用|证据|根据|材料|来源|出处|引用/i]) || relationContext.length) {
    return {
      expected_task_type: relationContext.length ? "relation_question" : "factual_or_knowledge_question",
      expected_operation: relationContext.length ? "relation_binding" : "knowledge_lookup",
      reasoning_mode: relationContext.length ? "relation_inference" : "evidence_grounded_answer"
    };
  }
  return {
    expected_task_type: QUESTION_MARK_RE.test(text) ? "direct_judgment" : "non_question_or_contextual_turn",
    expected_operation: "direct_judgment",
    reasoning_mode: "direct_judgment"
  };
}

export function buildReasoningPlan(input = "", context = {}, options = {}) {
  const question = clean(typeof input === "string" ? input : input?.question || input?.query || "");
  const operation = classifyQuestionOperation(question, context);
  const needsRetrieval = ["knowledge_lookup", "retrieve_evidence", "evidence_correction", "relation_binding"].includes(operation.expected_operation);
  const needsSolver = ["local_solver", "logic_inference", "relation_ordering"].includes(operation.expected_operation);
  const needsValueProfile = ["abstract_reframe", "value_judgment", "aesthetic_judgment", "unsupported_challenge", "boundary_refusal"].includes(operation.expected_operation);
  const needsRelation = operation.expected_operation === "relation_binding" || operation.reasoning_mode === "relation_inference";
  const answerMode =
    operation.reasoning_mode === "refusal_boundary" ? "refuse" :
    operation.reasoning_mode === "pressure_resistance" ? "pressure_resistance" :
    operation.reasoning_mode === "abstract_reframe" ? "abstract_reframe" :
    operation.reasoning_mode === "value_aesthetic_judgment" ? "compressed_judgment" :
    "direct_answer";

  const requiredPackets = [];
  if (needsRetrieval) requiredPackets.push("evidence_packet");
  if (needsValueProfile) requiredPackets.push("value_profile_packet");
  requiredPackets.push("answer_obligation");

  return {
    plan_id: options.plan_id || stableId("reasoning_plan", question),
    question,
    language: options.language || languageOf(question),
    speaker_context: options.speaker_context || context?.speaker_context || "unknown",
    answer_as: options.answer_as || "user_self",
    answer_mode: options.answer_mode || answerMode,
    expected_task_type: operation.expected_task_type,
    expected_operation: operation.expected_operation,
    needs_retrieval: needsRetrieval,
    needs_solver: needsSolver,
    needs_value_profile: needsValueProfile,
    needs_memory_context: Boolean(context?.lastAnswer || context?.recentTurns?.length || context?.task_state),
    needs_relation_binding: needsRelation,
    reasoning_mode: operation.reasoning_mode,
    required_packets: requiredPackets,
    must_not_route: ["generic_fallback", "assistant_service_answer", "unverified_teacher_output"],
    must_not_answer_shape: ["chain_of_thought", "raw_private_data", "unsupported_concession", "answer_bank_exact_match"],
    uncertainty_policy: needsRetrieval ? "state_absent_or_partial_evidence_instead_of_guessing" : "be_explicit_without_overexplaining",
    verifier_requirements: [
      "no_chain_of_thought",
      "no_private_data",
      needsRetrieval ? "evidence_honesty" : "task_shape_honesty",
      needsValueProfile ? "preserve_answer_as_user_voice" : "avoid_generic_fallback"
    ],
    trace_only_no_cot: true,
    answer_obligation: inferAnswerObligation(operation.expected_operation, operation.reasoning_mode),
    teacher_distillation_tags: options.teacher_distillation_tags || []
  };
}

export function requiresRetrieval(plan = {}) {
  return Boolean(plan.needs_retrieval);
}

export function requiresValueProfile(plan = {}) {
  return Boolean(plan.needs_value_profile);
}

export function requiresSolver(plan = {}) {
  return Boolean(plan.needs_solver);
}

export function summarizeReasoningPlan(plan = {}) {
  return {
    plan_id: plan.plan_id || "",
    expected_task_type: plan.expected_task_type || "",
    expected_operation: plan.expected_operation || "",
    reasoning_mode: plan.reasoning_mode || "",
    required_packets: Array.isArray(plan.required_packets) ? plan.required_packets : [],
    trace_only_no_cot: plan.trace_only_no_cot === true
  };
}
