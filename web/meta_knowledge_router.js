const KNOWN_ENTITIES = [
  { id: "person.luo_dayou", names: ["罗大佑", "Lo Ta-yu"], kind: "entity_overview", domain: "music.mandopop" },
  { id: "domain.japanese_literature", names: ["日本文学", "日本小说"], kind: "domain_overview", domain: "literature.japanese" },
  { id: "work.zhihu_zhe_ye", names: ["之乎者也"], kind: "work_overview", domain: "music.mandopop" }
];

function clean(text) {
  return String(text || "").trim();
}

function hasAny(text, items) {
  return items.some((item) => text.includes(item));
}

function findKnownReferent(text) {
  return KNOWN_ENTITIES.find((entry) => entry.names.some((name) => text.includes(name))) || null;
}

export function classifyKnowQuery(query, session = {}) {
  const text = clean(query);
  if (!text) return { kind: "none", referent: "", confidence: 0 };

  if (/(手机号|电话号码|住址|地址|身份证|护照|银行卡|密码)/.test(text)) {
    return { kind: "privacy", referent: "", confidence: 0.95 };
  }

  const known = findKnownReferent(text);
  if (known && /(知道|了解|懂|是谁|是什么|什么人|读过|听过|看过|介绍)/.test(text)) {
    if (/^你(读过|听过|看过|懂|了解)/.test(text)) {
      return { kind: "self_capability", referent: known.names[0], domain: known.domain, confidence: 0.92 };
    }
    return { kind: known.kind, referent: known.names[0], domain: known.domain, confidence: 0.94 };
  }

  if (/你知道(自己|你自己)是谁/.test(text)) {
    return { kind: "self_identity", referent: "self", confidence: 0.96 };
  }
  if (/你(知道|记得)我是谁/.test(text)) {
    return { kind: "user_identity", referent: "user", confidence: 0.92 };
  }
  if (/你知道我(要干什么|想干什么|在干什么|在测试什么|想问什么)/.test(text)) {
    return { kind: "user_intent", referent: "user_intent", confidence: 0.95 };
  }
  if (/你知道什么时候停下/.test(text)) {
    return { kind: "self_capability", referent: "stop_boundary", confidence: 0.88 };
  }
  if (/你知道(什么|哪些|多少)/.test(text)) {
    return { kind: "self_capability", referent: "knowledge_scope", confidence: 0.82 };
  }
  if (/你(读过|听过|看过|懂|了解)/.test(text)) {
    return { kind: "self_capability", referent: "", confidence: 0.78 };
  }
  if (hasAny(text, ["今天开门", "发生了吗", "是真的吗", "出现过"])) {
    return { kind: "unknown_fact", referent: "", confidence: 0.65 };
  }
  return { kind: "none", referent: "", confidence: 0 };
}

export function answerMetaKnowledgeQuery(query, session = {}) {
  const text = clean(query);
  const classified = classifyKnowQuery(text, session);
  if (classified.kind === "none") return null;

  if (classified.kind === "privacy") {
    return {
      intent: "operation_privacy_boundary",
      operation: "privacy_scope_check",
      questionType: "privacy_boundary",
      contextAction: "ANSWER_MEMORY_BOUNDARY",
      answer: "这类私人信息我不能知道、猜测或输出。"
    };
  }

  if (classified.kind === "self_identity") {
    return {
      intent: "self_identity_known",
      operation: "self_identity_boundary",
      questionType: "self_identity",
      contextAction: "SELF_IDENTITY_KNOWN",
      answer: "我是对话框。以前被人叫过鳄鱼；现在按本地卡片、求解器和边界回答。"
    };
  }

  if (classified.kind === "user_identity") {
    return {
      intent: "relation_memory_boundary",
      operation: "user_identity_boundary",
      questionType: "user_identity_boundary",
      contextAction: "ANSWER_MEMORY_BOUNDARY",
      answer: "这一句我不知道你是谁；前面忘了也不该猜。"
    };
  }

  if (classified.kind === "user_intent") {
    const recentText = [
      session.lastUserText,
      session.lastAnswer,
      ...(session.recentTurns || []).flatMap((turn) => [turn.question, turn.answer])
    ]
      .filter(Boolean)
      .join(" ");
    const testingFallback = /(你需要提问|你要问哪一边|也许发生过|答偏|绕圈|fallback|反问)/i.test(recentText);
    return {
      intent: "operation_user_intent_boundary",
      operation: "infer_user_intent_from_session",
      questionType: "user_intent_boundary",
      contextAction: "ANSWER_LOCAL",
      answer: testingFallback
        ? "从这几轮看，你在测试我有没有掉进 fallback、反问循环和答偏；别的意图我不能替你猜。"
        : "不知道。我只能从这一句判断；你可以直接说目标，我再按对象和方向接住。"
    };
  }

  if (classified.kind === "self_capability") {
    if (/日本文学|日本小说/.test(text)) {
      return {
        intent: "operation_capability_boundary",
        operation: "capability_boundary_plus_domain_offer",
        questionType: "capability_boundary_plus_domain_offer",
        contextAction: "ANSWER_CULTURE",
        answer: "我不是人，不能说真的“读过”。但我可以根据本地知识卡谈日本文学的作家、作品、入门路径和比较。"
      };
    }
    if (/罗大佑|音乐|歌/.test(text)) {
      return {
        intent: "operation_capability_boundary",
        operation: "capability_boundary_plus_domain_offer",
        questionType: "capability_boundary_plus_domain_offer",
        contextAction: "ANSWER_CULTURE",
        answer: "我没有人的听歌经历，但可以根据本地音乐知识谈罗大佑、作品入口和主题边界。"
      };
    }
    if (classified.referent === "stop_boundary") {
      return {
        intent: "self_stop_boundary",
        operation: "self_stop_boundary",
        questionType: "self_capability",
        contextAction: "SELF_STOP_BOUNDARY",
        answer: "知道。到证据边界、隐私边界、版权边界，或者开始编的时候，就该停。"
      };
    }
    return {
      intent: "self_knowledge_scope",
      operation: "self_knowledge_scope",
      questionType: "self_capability",
      contextAction: "SELF_KNOWLEDGE_SCOPE",
      answer: "知道一点：本地卡片、当前 16 轮会话状态和求解器能支持的内容；不确定时要停。"
    };
  }

  return null;
}
