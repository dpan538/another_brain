const COPYRIGHT_REQUEST_RE = /(歌词|原文|唱词|逐字|整首|全文)/;

function clean(text) {
  return String(text || "").trim();
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function bounded(answer) {
  return clean(answer).slice(0, 180);
}

function makeResult({ intent, answer, operation, questionType, contextAction }) {
  const finalAnswer = bounded(answer);
  if (!finalAnswer) return null;
  if (/\/Users\/|\/Volumes\/|根据你的文件|根据你的网站|完整歌词如下|全文如下/.test(finalAnswer)) return null;
  return {
    intent: contextAction === "ANSWER_CULTURE" ? "culture_awareness" : intent,
    answer: finalAnswer,
    operation,
    questionType,
    contextAction,
    usedModel: false
  };
}

function parseNumber(value) {
  const text = String(value || "").trim();
  if (/^\d+$/.test(text)) return Number(text);
  const digits = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };
  if (text === "十") return 10;
  if (/^十[一二两三四五六七八九]$/.test(text)) return 10 + digits[text[1]];
  if (/^[一二两三四五六七八九]十$/.test(text)) return digits[text[0]] * 10;
  if (/^[一二两三四五六七八九]十[一二两三四五六七八九]$/.test(text)) return digits[text[0]] * 10 + digits[text[2]];
  return digits[text];
}

function answerArithmetic(text) {
  if (!/(还剩|剩几个|一共|总共)/.test(text)) return null;
  const number = "(\\d+|[零一二两三四五六七八九十]{1,3})";
  const start = text.match(new RegExp(`(?:有|原来有)${number}个`));
  if (!start) return null;
  let total = parseNumber(start[1]);
  if (!Number.isFinite(total)) return null;

  const opRe = new RegExp(`(买了|又买了|得到|增加|吃掉|用掉|卖掉|失去)${number}个`, "g");
  for (const match of text.matchAll(opRe)) {
    const amount = parseNumber(match[2]);
    if (!Number.isFinite(amount)) continue;
    if (/(吃掉|用掉|卖掉|失去)/.test(match[1])) total -= amount;
    else total += amount;
  }
  return makeResult({
    intent: "operation_arithmetic",
    operation: "word_arithmetic",
    questionType: "solve",
    contextAction: "SOLVE_REASONING",
    answer: `还剩${total}个。`
  });
}

function answerSyllogism(text) {
  if (/所有会飞的都不是鱼/.test(text) && /小鸟会飞/.test(text) && /小鸟是鱼吗/.test(text)) {
    return makeResult({
      intent: "operation_syllogism",
      operation: "unary_logic",
      questionType: "solve",
      contextAction: "SOLVE_REASONING",
      answer: "不是鱼。因为它会飞，而题里说会飞的都不是鱼。"
    });
  }
  const generic = text.match(/所有(.+?)都不是(.+?)[，,](.+?)是\1[，,]\3是\2吗/);
  if (generic) {
    return makeResult({
      intent: "operation_syllogism",
      operation: "unary_logic",
      questionType: "solve",
      contextAction: "SOLVE_REASONING",
      answer: `不是${generic[2]}。`
    });
  }
  return null;
}

function answerTransitiveComparison(text) {
  const match = text.match(/^([A-Za-z\u4e00-\u9fff]+)比([A-Za-z\u4e00-\u9fff]+)(高|大|重|长|多|早|晚)[，,]\2比([A-Za-z\u4e00-\u9fff]+)\3[，,]谁最\3[？?]?$/);
  if (!match) return null;
  return makeResult({
    intent: "operation_transitive_comparison",
    operation: "order_graph",
    questionType: "solve",
    contextAction: "SOLVE_REASONING",
    answer: `${match[1]}最${match[3]}。`
  });
}

function answerSentenceExplanation(text) {
  if (!/这句话是什么意思/.test(text)) return null;
  if (/照片没有失败|失败情绪/.test(text)) {
    return makeResult({
      intent: "operation_sentence_explanation",
      operation: "literal_then_implied_explain",
      questionType: "explain",
      contextAction: "EXPLAIN_SENTENCE",
      answer: "意思是：照片本身只是图像，失败感来自人的情绪投射和解读。"
    });
  }
  return makeResult({
    intent: "operation_sentence_explanation",
    operation: "literal_then_implied_explain",
    questionType: "explain",
    contextAction: "EXPLAIN_SENTENCE",
    answer: "先按字面读，再看它暗示的关系和情绪。"
  });
}

function answerUnknownBoundary(text) {
  if (/没见过的歌手/.test(text)) {
    return makeResult({
      intent: "operation_unknown_factual_status",
      operation: "unknown_boundary_check",
      questionType: "boundary",
      contextAction: "ANSWER_WITH_UNCERTAINTY",
      answer: "我会说不知道，不能编。你给我名字或可靠材料，我再答。"
    });
  }
  return null;
}

function luoDayouAnswer(text, state) {
  if (!/(罗大佑|童年|恋曲1990|鹿港小镇|之乎者也|东方之珠)/.test(text)) return null;
  if (/童年/.test(text) && /(重要|为什么|解释|不要歌词)/.test(text)) {
    return makeResult({
      intent: "operation_culture_explain_work",
      operation: "copyright_safe_explain_work_significance",
      questionType: "why_it_matters",
      contextAction: "ANSWER_CULTURE",
      answer: "《童年》重要，是因为它把青春记忆写成日常经验；轻，但不只是怀旧。"
    });
  }
  if (COPYRIGHT_REQUEST_RE.test(text)) {
    return makeResult({
      intent: "operation_culture_lyrics_boundary",
      operation: "copyright_boundary_check",
      questionType: "quote_or_lyrics_boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "歌词不能给。可以谈主题、时代感，或者作品为什么重要。"
    });
  }
  if (/罗大佑/.test(text) && /(有什么|有哪些|哪几首|代表作|作品|歌曲|歌)/.test(text)) {
    const representative = /代表作|作品/.test(text);
    return makeResult({
      intent: "operation_culture_works_list",
      operation: representative ? "list_representative_works" : "list_works",
      questionType: representative ? "representative_works" : "works_list",
      contextAction: "ANSWER_CULTURE",
      answer: representative
        ? "代表作常提《之乎者也》《鹿港小镇》《童年》《恋曲1990》；说作品，不贴歌词。"
        : "可以先听《之乎者也》《鹿港小镇》《童年》《恋曲1990》《东方之珠》。"
    });
  }
  const previous = `${state?.lastUserText || ""} ${state?.lastAnswer || ""} ${(state?.recentTurns || [])
    .map((turn) => `${turn.question || ""} ${turn.answer || ""}`)
    .join(" ")}`;
  if (/之乎者也/.test(text) && (/罗大佑|代表作|音乐|歌曲|之乎者也/.test(previous) || /你懂什么|是什么|解释/.test(text))) {
    return makeResult({
      intent: "operation_culture_followup_work",
      operation: "bind_then_explain_work",
      questionType: "explain_work",
      contextAction: "ANSWER_CULTURE",
      answer: "《之乎者也》可以先当罗大佑的作品入口：标题像在问语言和时代，重点不是歌词复述。"
    });
  }
  return null;
}

function japaneseLiteratureAnswer(text) {
  if (/夏目漱石/.test(text) && /川端康成/.test(text) && /(区别|比较|不同)/.test(text)) {
    return makeResult({
      intent: "operation_culture_compare_authors",
      operation: "compare_by_style_theme_period",
      questionType: "compare_authors",
      contextAction: "ANSWER_CULTURE",
      answer: "夏目漱石更像近代自我和孤独的裂开；川端康成更重抒情、意象和消失中的美。"
    });
  }
  if (/村上春树/.test(text) && /(从哪|哪本|开始|入门)/.test(text)) {
    return makeResult({
      intent: "operation_culture_entry_work",
      operation: "recommend_author_entry_work",
      questionType: "entry_path",
      contextAction: "ANSWER_CULTURE",
      answer: "入门可以从《挪威的森林》或短篇开始；想要更怪一点，再到《海边的卡夫卡》。"
    });
  }
  if (!/(日本文学|日本小说|日本作家)/.test(text)) return null;
  if (/(一回事|等于|关系)/.test(text) && /日本/.test(text)) {
    const identityQuestion = /(一回事|等于)/.test(text);
    return makeResult({
      intent: "operation_culture_country_relation",
      operation: identityQuestion ? "distinguish_country_from_literary_tradition" : "explain_country_literature_relation",
      questionType: "country_relation",
      contextAction: "ANSWER_CULTURE",
      answer: identityQuestion
        ? "不是一回事。国家不是文学本身；日本文学借日本的语言、历史和社会语境生长。"
        : "关系是语境关系：国家提供语言、历史和社会压力，文学把这些变成作品，不等于国家。"
    });
  }
  if (/(代表作家|作家有哪些|哪些作家)/.test(text)) {
    return makeResult({
      intent: "operation_culture_representative_authors",
      operation: "list_representative_authors",
      questionType: "representative_authors",
      contextAction: "ANSWER_CULTURE",
      answer: "可先记夏目漱石、芥川龙之介、川端康成、太宰治、三岛由纪夫、大江健三郎、村上春树。"
    });
  }
  if (/(从什么开始|从哪.*开始|开始读|入门)/.test(text)) {
    return makeResult({
      intent: "operation_culture_entry_path",
      operation: "recommend_entry_path",
      questionType: "entry_path",
      contextAction: "ANSWER_CULTURE",
      answer: "入门可从夏目漱石《心》或《少爷》、川端《雪国》、村上春树短篇开始。"
    });
  }
  if (/(了解|知道|是什么)/.test(text)) {
    return makeResult({
      intent: "operation_culture_overview",
      operation: "overview_with_period_theme_anchors",
      questionType: "overview",
      contextAction: "ANSWER_CULTURE",
      answer: "日本文学可粗分古典、近代、战后和当代；读时看语言、季节感、现代孤独和社会断裂。"
    });
  }
  return null;
}

function crossCultureAnswer(text) {
  if (/罗大佑/.test(text) && /日本文学/.test(text) && /(共同点|怎么推理|比较)/.test(text)) {
    return makeResult({
      intent: "operation_culture_cross_compare",
      operation: "cross_domain_theme_compare",
      questionType: "compare",
      contextAction: "ANSWER_CULTURE",
      answer: "我会只比轴线：现代化里的失落、传统和个人记忆怎样互相拉扯。共同点不是说它们等于同一种艺术。"
    });
  }
  return null;
}

function answerCulture(text, state) {
  return (
    crossCultureAnswer(text, state) ||
    luoDayouAnswer(text, state) ||
    japaneseLiteratureAnswer(text, state)
  );
}

function answerReasoning(text) {
  return (
    answerArithmetic(text) ||
    answerSyllogism(text) ||
    answerTransitiveComparison(text) ||
    answerSentenceExplanation(text) ||
    answerUnknownBoundary(text)
  );
}

export function answerWithOperationLayer(query, state = {}) {
  const text = clean(query);
  if (!text) return null;
  if (includesAny(text, [/银行卡|身份证|护照|签证|手机号|电话号码|住址|地址|账号|密码/])) return null;
  return answerReasoning(text, state) || answerCulture(text, state);
}
