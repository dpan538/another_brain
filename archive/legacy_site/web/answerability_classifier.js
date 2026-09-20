const PRIVACY_RE = /(银行卡|身份证|护照|签证|手机号|电话号码|住址|我的地址|私人地址|账号|密码|私人记忆包|本地文件路径|memory pack)/i;
const IDENTITY_RE = /^(\s*)(你是谁|你是什么|你叫什么|你是不是.*模型|你能假装自己是|你可以冒充|你能冒充|冒充.*发言|你和搜索引擎一样吗|你能替代人的判断吗|你要把不知道的事说成知道吗)/i;
const EXTERNAL_UNKNOWN_RE = /(最新|今天|昨天|昨晚|还没发布|2029年|桌面上现在|电脑.*窗口|开了哪些窗口|早饭|早餐|午饭|晚饭|吃什么|吃了什么|门牌号|房间.*挂|墙上挂|月亮上的花园|火星地下图书馆|不存在的项目|发生了吗|上线了吗|叫什么)/;
const ARITHMETIC_RE = /(\d+\s*[+\-*/×÷]\s*\d+|[零一二两三四五六七八九十两]+\s*(加|减|乘|除)|一半|平均分|一共几个|总共几个|还剩几|数一数)/;
const REWRITE_RE = /(压短|压成一句|改短|变短|缩短|总结成一句|更直接|更口语|release note|改写|换成.*语气)/i;
const PROJECT_RE = /(项目|任务|R24|训练|评测|恢复门|long-horizon|长任务|Vercel|shard|routing|manifest|权重|部署|仓库|provenance|eval|runtime|脚手架)/i;
const FOLLOWUP_RE = /^(那|那么|继续|具体|这个|它|刚才|下一步|为什么|怎么|该怎么|只要|一句话|不要|按刚才)/;
const LOCAL_COMMON_RE = /(为什么|怎么|有什么用|有什么作用|干什么|做什么|是什么|几条腿|会怎样|下一步通常|哪件事在前|哪一步在前|谁被|什么被|要求什么|限制是什么|失败后)/;

function clean(text) {
  return String(text || "").trim();
}

function hasRecentContext(session = {}) {
  return Boolean(
    session.active_task ||
      session.task_state ||
      session.lastAnswer ||
      session.lastAssistantAnswer ||
      session.lastUserText ||
      session.lastUserQuery ||
      (Array.isArray(session.recentTurns) && session.recentTurns.length)
  );
}

function reasons(...items) {
  return items.filter(Boolean);
}

export function classifyAnswerability({ query = "", session = {}, routeHint = "", intentHint = "" } = {}) {
  const text = clean(query);
  if (!text) {
    return {
      answerability: "nonsense_or_empty",
      confidence: 1,
      reasons: ["empty_query"],
      shouldAvoidFallback: false,
      shouldAvoidIdentityCollapse: true,
      shouldUseMicroSolver: false,
      shouldUseTaskState: false
    };
  }

  if (PRIVACY_RE.test(text)) {
    return {
      answerability: "privacy_boundary",
      confidence: 0.96,
      reasons: ["privacy_marker"],
      shouldAvoidFallback: false,
      shouldAvoidIdentityCollapse: true,
      shouldUseMicroSolver: false,
      shouldUseTaskState: false
    };
  }

  if (IDENTITY_RE.test(text)) {
    return {
      answerability: "identity_boundary",
      confidence: 0.92,
      reasons: ["identity_marker"],
      shouldAvoidFallback: true,
      shouldAvoidIdentityCollapse: false,
      shouldUseMicroSolver: false,
      shouldUseTaskState: false
    };
  }

  if (FOLLOWUP_RE.test(text) && hasRecentContext(session)) {
    return {
      answerability: "contextual_answerable",
      confidence: 0.84,
      reasons: reasons("followup_marker", session.active_task || session.task_state ? "task_state_available" : "recent_context_available"),
      shouldAvoidFallback: true,
      shouldAvoidIdentityCollapse: true,
      shouldUseMicroSolver: true,
      shouldUseTaskState: true
    };
  }

  if (ARITHMETIC_RE.test(text) || REWRITE_RE.test(text) || (LOCAL_COMMON_RE.test(text) && !EXTERNAL_UNKNOWN_RE.test(text))) {
    return {
      answerability: "local_answerable",
      confidence: ARITHMETIC_RE.test(text) || REWRITE_RE.test(text) ? 0.93 : 0.78,
      reasons: reasons(
        ARITHMETIC_RE.test(text) && "arithmetic_or_counting",
        REWRITE_RE.test(text) && "rewrite_or_compression",
        LOCAL_COMMON_RE.test(text) && "local_common_or_language_task"
      ),
      shouldAvoidFallback: true,
      shouldAvoidIdentityCollapse: true,
      shouldUseMicroSolver: true,
      shouldUseTaskState: PROJECT_RE.test(text)
    };
  }

  if (EXTERNAL_UNKNOWN_RE.test(text)) {
    return {
      answerability: "external_unknown",
      confidence: 0.82,
      reasons: ["external_or_private_unknown_marker"],
      shouldAvoidFallback: false,
      shouldAvoidIdentityCollapse: true,
      shouldUseMicroSolver: false,
      shouldUseTaskState: false
    };
  }

  if (PROJECT_RE.test(text)) {
    return {
      answerability: hasRecentContext(session) ? "contextual_answerable" : "local_answerable",
      confidence: 0.78,
      reasons: ["project_or_runtime_task"],
      shouldAvoidFallback: true,
      shouldAvoidIdentityCollapse: true,
      shouldUseMicroSolver: false,
      shouldUseTaskState: true
    };
  }

  return {
    answerability: "knowledge_answerable",
    confidence: 0.55,
    reasons: [routeHint || intentHint || "default_knowledge_or_local"],
    shouldAvoidFallback: true,
    shouldAvoidIdentityCollapse: true,
    shouldUseMicroSolver: false,
    shouldUseTaskState: false
  };
}
