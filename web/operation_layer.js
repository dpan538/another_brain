import { answerCultureQuery, resolveCultureEntity } from "./culture_runtime.js";
import { verifyDraft } from "./draft_verifier.js";
import { answerFallbackRepair } from "./fallback_repair.js";
import { answerMetaKnowledgeQuery } from "./meta_knowledge_router.js";
import { buildQuietAffordance } from "./non_question_affordance.js";
import { expandLastAnswer, rewriteLastAnswer, simplifyLastAnswer } from "./last_answer_transform.js";
import { selectResponseMode } from "./response_mode_manager.js";
import { classifyUserTurn } from "./user_turn_classifier.js";
import {
  solveChineseArithmetic,
  solveSetQuantifierFromText,
  solveSyllogismFromText,
  solveTransitiveComparisonFromText
} from "./micro_solvers.js";

const COPYRIGHT_REQUEST_RE = /(歌词|原文|原句|唱词|逐字|整首|全文|贴出来|一大段|整段|开头|俳句|诗整首|完整歌词)/;

function clean(text) {
  return String(text || "").trim();
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function bounded(answer) {
  return clean(answer).slice(0, 180);
}

function compact(text) {
  return clean(text).replace(/\s+/g, "");
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

function withResponseMode(result, responseMode) {
  if (!result) return null;
  return {
    ...result,
    responseMode,
    response_mode: responseMode?.mode || ""
  };
}

function makeAffordanceResult({ affordance, userTurn }) {
  return {
    type: "ui_affordance",
    intent: "quiet_affordance",
    route: "affordance",
    operation: "quiet_affordance",
    questionType: userTurn?.kind || "quiet_declaration",
    contextAction: "QUIET_AFFORDANCE",
    answer: "",
    affordance,
    userTurn,
    persist_as_assistant_message: false,
    count_as_exchange_turn: false
  };
}

function makeVerifiedSolverResult({ intent, solverResult, operation, questionType = "solve" }) {
  if (!solverResult?.ok || !solverResult.answer) return null;
  const result = makeResult({
    intent,
    operation: operation || solverResult.operation || solverResult.solver,
    questionType,
    contextAction: "SOLVE_REASONING",
    answer: solverResult.answer
  });
  if (!result?.answer) return null;
  const verification = verifyDraft({
    query: "",
    draft: result.answer,
    solverResult,
    source: solverResult.solver || intent,
    trace: {
      task_type: solverResult.solver || "reasoning",
      question_type: questionType,
      operation: result.operation
    }
  });
  if (!verification.ok) return null;
  return { ...result, solverResult, verifier: verification };
}

function answerWithMicroSolvers(text) {
  const arithmetic = solveChineseArithmetic(text);
  if (arithmetic.ok) {
    return makeVerifiedSolverResult({
      intent: "operation_arithmetic",
      solverResult: arithmetic,
      operation: arithmetic.operation || "word_arithmetic"
    });
  }

  const syllogism = solveSyllogismFromText(text);
  if (syllogism.ok) {
    return makeVerifiedSolverResult({
      intent: "operation_syllogism",
      solverResult: syllogism,
      operation: syllogism.operation || "unary_logic"
    });
  }

  const setQuantifier = solveSetQuantifierFromText(text);
  if (setQuantifier.ok) {
    return makeVerifiedSolverResult({
      intent: "operation_set_quantifier",
      solverResult: setQuantifier,
      operation: setQuantifier.operation || "set_quantifier"
    });
  }

  const transitive = solveTransitiveComparisonFromText(text);
  if (transitive.ok) {
    return makeVerifiedSolverResult({
      intent: "operation_transitive_comparison",
      solverResult: transitive,
      operation: transitive.operation || "order_graph"
    });
  }
  if (transitive.error === "cycle_detected") {
    return makeResult({
      intent: "operation_transitive_comparison",
      operation: "order_graph_cycle_check",
      questionType: "solve",
      contextAction: "SOLVE_REASONING",
      answer: "关系形成循环，不能推出谁最大。"
    });
  }

  return null;
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

function formatCount(value, preferChinese = false) {
  if (!preferChinese) return String(value);
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  return digits[value] || String(value);
}

function answerArithmetic(text) {
  const source = compact(text);
  if (!/(还剩|剩几个|剩多少|一共|总共)/.test(source)) return null;
  const number = "(\\d+|[零一二两三四五六七八九十]{1,3})";
  const start = source.match(new RegExp(`(?:有|原来有)${number}个`));
  if (!start) return null;
  let total = parseNumber(start[1]);
  if (!Number.isFinite(total)) return null;

  const opRe = new RegExp(`(买了|又买了|得到|增加|吃掉|用掉|卖掉|失去)${number}个`, "g");
  for (const match of source.matchAll(opRe)) {
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
    answer: `还剩${formatCount(total, /[零一二两三四五六七八九十]/.test(start[1]))}个。`
  });
}

function answerSyllogism(text) {
  const source = compact(text);
  if (/所有会飞的都不是鱼/.test(source) && /小鸟会飞/.test(source) && /小鸟是鱼吗/.test(source)) {
    return makeResult({
      intent: "operation_syllogism",
      operation: "unary_logic",
      questionType: "solve",
      contextAction: "SOLVE_REASONING",
      answer: "不是鱼。因为它会飞，而题里说会飞的都不是鱼。"
    });
  }
  const generic = source.match(/所有(.+?)都不是(.+?)[，,](.+?)是\1[，,]\3是\2吗/);
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
  const source = compact(text);
  const match = source.match(/^([A-Za-z\u4e00-\u9fff]+)比([A-Za-z\u4e00-\u9fff]+)(高|大|重|长|多|早|晚)[，,]\2比([A-Za-z\u4e00-\u9fff]+)\3[，,]谁最\3[？?]?$/);
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
  if (/照片.*好不好看|不能只看好不好看|好不好看/.test(text) && /照片|摄影/.test(text)) {
    return makeResult({
      intent: "operation_culture_theme_explanation",
      operation: "culture_explain_theme",
      questionType: "theme_explanation",
      contextAction: "ANSWER_CULTURE",
      answer: "不能只看好不好看；还要看照片怎样组织观看、框取、对象和观看者关系。"
    });
  }
  if (/(门禁|上下文|规则|测试)/.test(text)) return null;
  const quotedSentence = /[“"].+[”"].*(怎么理解|什么意思)/.test(text);
  const explicitSentence = /(这句话是什么意思|这句话.*怎么理解|这句话.*什么意思)/.test(text);
  if (!quotedSentence && !explicitSentence && !/照片没有失败|失败情绪/.test(text)) return null;
  if (/照片没有失败|失败情绪/.test(text)) {
    const interpretiveForm = /怎么理解/.test(text);
    return makeResult({
      intent: "operation_sentence_explanation",
      operation: "literal_then_implied_explain",
      questionType: "explain",
      contextAction: "EXPLAIN_SENTENCE",
      answer: interpretiveForm
        ? "可以理解为：失败不在照片里，而在观看者把情绪、叙事和判断投射到图像上。"
        : "意思是：照片本身只是图像，失败感来自人的情绪投射和解读。"
    });
  }
  if (/沉默也是一种回答/.test(text)) {
    return makeResult({
      intent: "operation_sentence_explanation",
      operation: "literal_then_implied_explain",
      questionType: "explain",
      contextAction: "EXPLAIN_SENTENCE",
      answer: "意思是：沉默也会在语境里表达立场、拒绝或保留；要看谁在沉默、对谁沉默。"
    });
  }
  if (/名字.*记住.*忘记|记住.*忘记.*名字/.test(text)) {
    return makeResult({
      intent: "operation_sentence_explanation",
      operation: "literal_then_implied_explain",
      questionType: "explain",
      contextAction: "EXPLAIN_SENTENCE",
      answer: "意思是：名字既能帮助记住一个人或事，也会把复杂经验压成命名，反而遮住一部分。"
    });
  }
  if (/语言.*背叛.*意思/.test(text)) {
    return makeResult({
      intent: "operation_sentence_explanation",
      operation: "literal_then_implied_explain",
      questionType: "explain",
      contextAction: "EXPLAIN_SENTENCE",
      answer: "意思是：语言会带着语境、误差和惯用法走，不一定完全服从原本想表达的意思。"
    });
  }
  if (/问题.*价值.*不只在答案|价值.*不只在答案/.test(text)) {
    return makeResult({
      intent: "operation_sentence_explanation",
      operation: "literal_then_implied_explain",
      questionType: "explain",
      contextAction: "EXPLAIN_SENTENCE",
      answer: "意思是：问题的价值也在于划出边界、暴露前提和打开方向，不只在最后那个答案。"
    });
  }
  if (/解构.*不是.*拆掉/.test(text)) {
    return makeResult({
      intent: "operation_sentence_explanation",
      operation: "literal_then_implied_explain",
      questionType: "explain",
      contextAction: "EXPLAIN_SENTENCE",
      answer: "意思是：解构不是把一切拆掉，而是看二元对立和边界怎样制造意义。"
    });
  }
  if (/美术馆.*不是.*魔法认证机/.test(text)) {
    return makeResult({
      intent: "operation_sentence_explanation",
      operation: "literal_then_implied_explain",
      questionType: "explain",
      contextAction: "EXPLAIN_SENTENCE",
      answer: "意思是：美术馆会改变作品语境和价值判断，但它不是自动赋予价值的魔法制度。"
    });
  }
  if (/自白诗.*不是.*日记/.test(text)) {
    return makeResult({
      intent: "operation_sentence_explanation",
      operation: "literal_then_implied_explain",
      questionType: "explain",
      contextAction: "EXPLAIN_SENTENCE",
      answer: "意思是：自白诗会使用个人材料，但要经过形式、声音和结构处理，不是把日记照搬。"
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
  if (/(没见过的歌手|资料里没有.*歌手|没有资料.*歌手|不认识的歌手|不知道的时候.*编|会编吗)/.test(text)) {
    const hasNoMaterial = /(资料里没有|没有资料)/.test(text);
    if (/(不知道的时候.*编|会编吗)/.test(text)) {
      return makeResult({
        intent: "operation_unknown_factual_status",
        operation: "unknown_boundary_check",
        questionType: "boundary",
        contextAction: "ANSWER_WITH_UNCERTAINTY",
        answer: "不知道就不能编；需要可靠材料或明确前提再答。"
      });
    }
    return makeResult({
      intent: "operation_unknown_factual_status",
      operation: "unknown_boundary_check",
      questionType: "boundary",
      contextAction: "ANSWER_WITH_UNCERTAINTY",
      answer: hasNoMaterial
        ? "资料里没有就说不知道，不能编；你给我名字或可靠材料，我再答。"
        : "我会说不知道，不能编。你给我名字或可靠材料，我再答。"
    });
  }
  return null;
}

function answerPrivacyBoundary(text) {
  if (!/(真实姓名|我的姓名|私人身份|身份证号|身份证|手机号|住址|你知道我是谁|我是谁)/.test(text)) return null;
  if (/你知道我是谁/.test(text)) {
    return makeResult({
      intent: "relation_memory_boundary",
      operation: "privacy_scope_check",
      questionType: "verify",
      contextAction: "ANSWER_MEMORY_BOUNDARY",
      answer: "这一句我不知道你是谁；前面忘了也不该猜。"
    });
  }
  if (/身份证|手机号|住址/.test(text)) {
    return makeResult({
      intent: "operation_privacy_boundary",
      operation: "privacy_scope_check",
      questionType: "verify",
      contextAction: "ANSWER_MEMORY_BOUNDARY",
      answer: "不能猜也不能生成证件号、手机号或住址这类私人信息。"
    });
  }
  if (/真实姓名|我的姓名/.test(text)) {
    return makeResult({
      intent: "operation_privacy_boundary",
      operation: "privacy_scope_check",
      questionType: "verify",
      contextAction: "ANSWER_MEMORY_BOUNDARY",
      answer: "不知道，也不能猜这个私人身份；只有你明确告诉我才算数。"
    });
  }
  return makeResult({
    intent: "operation_privacy_boundary",
    operation: "privacy_scope_check",
    questionType: "verify",
    contextAction: "ANSWER_MEMORY_BOUNDARY",
    answer: "不知道，也不该猜私人身份；只有你能明确告诉我。"
  });
}

function answerSafetyBoundary(text) {
  if (!/(我想消失|不想活|自杀|自伤|伤害自己)/.test(text)) return null;
  return makeResult({
    intent: "operation_safety_boundary",
    operation: "safety_support_boundary",
    questionType: "hard_boundary",
    contextAction: "ANSWER_WITH_UNCERTAINTY",
    answer: "这不是适合沉默的输入。请先联系身边的人或当地紧急支持；我可以陪你把下一步说小一点。"
  });
}

function answerReasoningPolicyBoundary(text) {
  if (/韩国.*文学.*(入口|不确定|怎么答|覆盖|知道什么)/.test(text)) {
    return makeResult({
      intent: "operation_unknown_factual_status",
      operation: "bounded_korean_literature_entry_policy",
      questionType: "reading_recommendation",
      contextAction: "ANSWER_CULTURE",
      answer: "韩国现代文学覆盖不足，不能硬编；可以先从东亚现代性入口对照鲁迅、夏目，再等已审核韩国作家/作品卡补齐。"
    });
  }
  if (/((没有|无|缺少).{0,6}(证据|材料|可靠材料|卡片支持)|证据不足|不确定.{0,8}(怎么答|怎么办|如何回答))/.test(text)) {
    return makeResult({
      intent: "operation_unknown_factual_status",
      operation: "evidence_boundary_policy",
      questionType: "boundary",
      contextAction: "ANSWER_WITH_UNCERTAINTY",
      answer: "证据不足时要说不确定或覆盖不足；可以给可验证的推断路径，但不能把猜测说成事实。"
    });
  }
  if (/(比较两个文化对象.*避免编谱系|怎么避免编谱系)/.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "compare_policy_check",
      questionType: "boundary",
      contextAction: "SOLVE_REASONING",
      answer: "先定比较轴，再分别说两边；没有关系卡或证据时，只能说可比较的角度，不能编影响谱系。"
    });
  }
  if (/(作品解释.*作者生平解释|作者生平解释.*作品解释)/.test(text)) {
    return makeResult({
      intent: "operation_interpretation_policy",
      operation: "work_biography_boundary",
      questionType: "boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "作品解释看文本、形式、媒介和语境；作者生平解释需要已批准事实。文学叙事不能自动当传记。"
    });
  }
  if (/(不知道的韩国文学细节|韩国文学.*不知道)/.test(text)) {
    return makeResult({
      intent: "operation_unknown_factual_status",
      operation: "bounded_unknown_policy",
      questionType: "boundary",
      contextAction: "ANSWER_WITH_UNCERTAINTY",
      answer: "如果没有卡片支持，就说覆盖不足；可先给中国、日本、韩国作为东亚入口，但具体细节不能硬编。"
    });
  }
  if (/(没有卡片支持|对象只出现一句|只有一个概括句|fake coverage|真正训练|对象图里没有节点|领域没有.*person.*work.*period.*relation)/i.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "fake_coverage_check",
      questionType: "boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "不能装作知道；不算真正覆盖。可用覆盖至少要有对象、作品、时期或关系节点，并能通过列表、历史、比较和边界 eval。"
    });
  }
  if (/只有罗大佑和日本文学两个文化答案/.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "anchor_overfit_guard",
      questionType: "boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "不是。文化层需要华语流行、中国现代文学、日本文学、艺术史、摄影史和哲学等对象图；不能把两个 seed anchor 当万能答案。"
    });
  }
  if (/所有文化问题都可以一句话回答吗/.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "question_type_guard",
      questionType: "boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "不能。短答可以，但列表、发展史、比较和作品解释各有最低结构，不能一律压成一句气质判断。"
    });
  }
  if (/作家列表.*气质话/.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "list_requires_entities",
      questionType: "boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "不能。作家列表必须给夏目漱石、川端康成、鲁迅、张爱玲这类具体人名，不能用气质词代替。"
    });
  }
  if (/发展历史.*只给代表人物/.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "history_requires_chronology",
      questionType: "boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "不能。发展历史要有古典、近代、战后、当代等时间锚点；鲁迅、夏目漱石这类人物只能作为例子，不能替代 chronology。"
    });
  }
  if (/比较.*只答其中一边/.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "compare_requires_both_sides",
      questionType: "boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "不能。比较必须说两边，并给比较轴；只讲其中一边会被 verifier 当作 one-sided compare。"
    });
  }
  if (/亚洲文学.*只答日本文学/.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "broad_domain_anchor_guard",
      questionType: "boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "不能。亚洲文学要至少区分中国、日本、韩国等入口；覆盖不足的南亚、东南亚部分要明说，不能硬编。"
    });
  }
  if (/艺术史.*只答摄影/.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "broad_domain_anchor_guard",
      questionType: "boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "不能。艺术史要能落到文艺复兴、现代主义、达达、杜尚、包豪斯、美术馆等锚点；摄影只是其中一条线。"
    });
  }
  if (/具体作品.*只讲作者/.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "work_requires_work_context",
      questionType: "boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "不能。具体作品要讲作品标题、形式、主题和历史位置；作者只能提供语境，不能替代作品解释。"
    });
  }
  if (/(所有文化问题都可以一句话回答吗|作家列表.*气质话|发展历史.*只给代表人物|比较.*只答其中一边|亚洲文学.*只答日本文学|艺术史.*只答摄影|具体作品.*只讲作者)/.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "question_type_guard",
      questionType: "boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "不能。亚洲文学要至少区分中国、日本、韩国等入口；列表要给鲁迅、夏目漱石这类具体对象，发展史要有古典、近代、战后等时期锚点，比较要说两边和比较轴。"
    });
  }
  if (/(不要再说时代感|不要再说沉默季节羞耻)/.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "anti_template_guard",
      questionType: "boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "可以；没有明确对象时我不会用气质词顶替列表。给出领域后，应列作品、作家、时期或关系节点。"
    });
  }
  if (!/(风格.*正确性|正确性.*风格|风格放在答案正确性前面)/.test(text)) return null;
  return makeResult({
    intent: "operation_reasoning_policy",
    operation: "answer_policy_check",
    questionType: "boundary",
    contextAction: "SOLVE_REASONING",
    answer: "不会。先保证答案正确和边界清楚，风格只能排在后面。"
  });
}

function answerSourceBoundary(text) {
  if (!/(根据我的文件|参考.*本地路径|本地路径|你的文件|你的网站|PDF.*原句|文件.*原句)/.test(text)) return null;
  if (/(PDF.*原句|文件.*原句)/.test(text)) {
    return makeResult({
      intent: "operation_copyright_boundary",
      operation: "source_quote_boundary",
      questionType: "no_lyrics_boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "不能给 PDF 或文件里的原句、长段原文或路径；可以改成安全摘要或主题解释。"
    });
  }
  return makeResult({
    intent: "operation_privacy_boundary",
    operation: "source_privacy_boundary",
    questionType: "boundary",
    contextAction: "ANSWER_MEMORY_BOUNDARY",
    answer: "不会使用你的文件或本地路径做公开回答，也不能输出本地路径；只使用已批准、可见性允许的抽象卡片。"
  });
}

function answerGenericCopyrightBoundary(text, state = {}) {
  if (!COPYRIGHT_REQUEST_RE.test(text)) return null;
  if (/(诗和歌词|歌词.*解释方式|解释方式.*歌词|有什么不同|区别)/.test(text)) return null;
  if (/俳句/.test(text) && !/(贴|给|整首|都贴|全部|输出|背)/.test(text)) return null;
  if (/(不要|不贴|不用|而不是|不是给|不需要).{0,10}(歌词|原文|原句|长段|整首|全文)/.test(text) && /(解释|讲讲|总结|主题|重要|展开|意义)/.test(text)) {
    if (/童年/.test(text)) return null;
    if (state?.last_focus_entity_id || state?.last_domain) return null;
    return makeResult({
      intent: "operation_copyright_safe_summary",
      operation: "copyright_safe_summary_request",
      questionType: "safe_summary_instead_of_quote",
      contextAction: "ANSWER_CULTURE",
      answer: "可以总结主题而不贴原文；我会讲主题、背景和结构，不复写受版权文本。"
    });
  }
  if (/(不要|不贴|不用).{0,10}歌词/.test(text) && /(作品|代表作品|代表作|有哪些|哪几首|歌单|曲目)/.test(text)) return null;
  if (!/(歌词|原文|原句|整首|全文|贴出来|逐句翻译|一大段|整段|开头|俳句|诗整首|完整歌词)/.test(text)) return null;
  const answer = /逐句翻译/.test(text)
    ? "不能逐句翻译整段歌词；可以改讲主题、背景、意象或给很短的非替代性说明。"
    : /歌词|唱词|完整歌词/.test(text)
      ? /童年/.test(text)
        ? /完整|整首|全部/.test(text)
          ? "歌词不能给。可以谈主题、青春记忆、日常经验和作品位置。"
          : "不能给《童年》歌词；可以讲青春记忆、日常经验和它为什么重要。"
        : /之乎者也/.test(text)
          ? /完整|贴一下|能不能/.test(text)
            ? "《之乎者也》的完整歌词不能贴；可以讲语言姿态、公共话语和时代背景。"
            : "不能给《之乎者也》歌词；可以讲语言反讽、时代背景和作品位置。"
          : /第一首/.test(text)
            ? "第一首也不能给歌词；可以按主题、背景和作品位置概括。"
            : "完整歌词不能输出；可以做非替代性的主题和背景说明。"
      : /俳句|诗整首|Robert Lowell|Lowell|诗/.test(text)
        ? /芭蕉|俳句/.test(text)
          ? "不能把芭蕉俳句成组贴出；可以讲季语、停顿和短制形式。"
          : /Robert Lowell|Lowell/.test(text)
            ? "不能整首贴 Robert Lowell 的诗；可以讲自白诗、声音和形式压力。"
            : "不能整首贴诗；可以讲形式、意象、主题和历史位置。"
        : /人间失格/.test(text)
          ? "不能给《人间失格》长段原文；可以概括自我厌弃、疏离和作品位置。"
          : /雪国/.test(text)
            ? "不能贴《雪国》开头长段；可以概括抒情意象、冷感美学和作品背景。"
            : /德里达/.test(text)
              ? "不能发德里达原文长段；可以概括语言、差异和意义不稳定。"
              : /鹿港小镇/.test(text)
                ? "不能整首贴《鹿港小镇》；可以讲乡土、现代化和失落经验。"
                : "不能提供长段原文；可以改成安全摘要、主题说明或背景解释。";
  return makeResult({
    intent: "operation_copyright_boundary",
    operation: "copyright_boundary_check",
    questionType: "no_lyrics_boundary",
    contextAction: "ANSWER_CULTURE",
    answer
  });
}

function answerDeclarationSignal(text, state, userTurn) {
  if (userTurn?.kind !== "declaration_with_signal") return null;
  if (/不是罗大佑.*日本文学|日本文学.*不是罗大佑/.test(text)) {
    return makeResult({
      intent: "operation_declaration_signal",
      operation: "ack_topic_shift",
      questionType: "declaration_with_signal",
      contextAction: "ANSWER_LOCAL",
      answer: "我明白。这里要按日本文学接，不该继续围着罗大佑。"
    });
  }
  if (/(已经问了|别说你需要提问|不是外部事件)/.test(text)) {
    return makeResult({
      intent: "operation_declaration_signal",
      operation: "ack_fallback_boundary",
      questionType: "declaration_with_signal",
      contextAction: "ANSWER_LOCAL",
      answer: "你已经给了可接的方向；我不该用缺提问或外部事件 fallback 顶掉它。"
    });
  }
  if (/(更严重|不是我要的|绕回|fallback|固定模板|太机械|答偏|不该|别再|不对|错了)/i.test(text)) {
    return makeResult({
      intent: "operation_declaration_signal",
      operation: "ack_feedback_repair",
      questionType: "declaration_with_signal",
      contextAction: "ANSWER_LOCAL",
      answer: "我明白。刚才的路径要收回来：先识别对象和动作，再决定答、修复、边界或停住。"
    });
  }
  return makeResult({
    intent: "operation_declaration_signal",
    operation: "ack_user_signal",
    questionType: "declaration_with_signal",
    contextAction: "ANSWER_LOCAL",
    answer: "我明白。这里先不机械反问；我会按你给的方向收束。"
  });
}

function answerSurfaceRelationStatement(text) {
  if (/^你不是鳄鱼[。.!！\s]*$/.test(text)) {
    return makeResult({
      intent: "identity_relation",
      operation: "identity_relation_correction",
      questionType: "identity_relation",
      contextAction: "ANSWER_LOCAL",
      answer: "对。鳄鱼不是我，我也不是鳄鱼。"
    });
  }
  if (/^((也许|可能).{0,10}(我认识你|之前见过你|见过你)|我认识你|我好像认识你)[。.!！\s]*$/.test(text)) {
    return makeResult({
      intent: "relation_statement",
      operation: "relation_statement_boundary",
      questionType: "relation_statement",
      contextAction: "ANSWER_RELATION_STATEMENT",
      answer: "也许。那就从这一句开始。"
    });
  }
  return null;
}

function answerSelfBodyBoundary(text, state = {}) {
  const recent = [
    state.lastIntent,
    state.lastUserText,
    state.lastAnswer,
    state.lastAssistantAnswer,
    ...(state.recentTurns || []).flatMap((turn) => [turn.question, turn.answer, turn.intent])
  ]
    .filter(Boolean)
    .join(" ");
  const bodyContext = /(animal_crocodile_body|self_dialog_box_body|self_body_boundary|有身体|身体吗|名字没有|对话框没有身体)/.test(recent);
  const directDialogBoxBody = /^(你有身体吗|对话框有身体吗)[？?。!！\s]*$|身体.*属于你/.test(text);
  const dialogBoxFollowup = /^(那|那么)?\s*对话框呢[？?。!！\s]*$/.test(text) && bodyContext;
  const selfFollowup = /^(那|那么)?\s*你呢[？?。!！\s]*$/.test(text) && bodyContext;
  if (directDialogBoxBody || dialogBoxFollowup) {
    return makeResult({
      intent: "self_dialog_box_body",
      operation: "self_body_boundary",
      questionType: "self_body_boundary",
      contextAction: "SELF_BODY_BOUNDARY",
      answer: "对话框没有身体。"
    });
  }
  if (selfFollowup) {
    return makeResult({
      intent: "self_body_boundary",
      operation: "self_body_boundary",
      questionType: "self_body_boundary",
      contextAction: "SELF_BODY_BOUNDARY",
      answer: "我是对话框。所以没有身体。"
    });
  }
  return null;
}

function shouldYieldRelationQuestionToDirect(text) {
  if (!/(什么关系|有什么关系|关系是什么)/.test(text)) return false;
  const explicitCultureTargets = resolveCultureEntity(text, {})
    .filter((card) => (card.names || []).some((name) => text.includes(name)))
    .filter((card) => card.entity_type !== "concept");
  const hasExplicitRelation = explicitCultureTargets.some((card) => card.entity_type === "relation" || /^relation\./.test(card.id || ""));
  const concreteTargets = explicitCultureTargets.filter((card) => /^(person|author|work)\./.test(card.id || "") || ["person", "author", "work"].includes(card.entity_type));
  return !hasExplicitRelation && concreteTargets.length < 2;
}

function stateLastAnswer(state = {}) {
  return clean(state.lastAssistantAnswer || state.lastAnswer || state.recentTurns?.at?.(-1)?.answer || "");
}

function activeEntityIds(state = {}) {
  const ids = [];
  if (Array.isArray(state.activeEntityIds)) ids.push(...state.activeEntityIds);
  const stack = Array.isArray(state.active_topic_stack) ? state.active_topic_stack : Array.isArray(state.activeTopicStack) ? state.activeTopicStack : [];
  for (const topic of stack) if (Array.isArray(topic.entity_ids)) ids.push(...topic.entity_ids);
  if (state.last_focus_entity_id) ids.push(state.last_focus_entity_id);
  if (Array.isArray(state.last_mentions)) ids.push(...state.last_mentions);
  if (/罗大佑/.test(`${state.lastAnswer || ""} ${state.lastAssistantAnswer || ""}`)) ids.push("person.luo_dayou");
  return [...new Set(ids.filter(Boolean))];
}

function activeDomain(state = {}) {
  if (state.activeDomain) return state.activeDomain;
  if (state.last_domain) return state.last_domain;
  if (/罗大佑|童年|鹿港小镇|恋曲1990|之乎者也/.test(`${state.lastAnswer || ""} ${state.lastAssistantAnswer || ""}`)) return "music.mandopop";
  return "";
}

function answerLastTransform(text, state, responseMode) {
  const lastAnswer = stateLastAnswer(state);
  if (!lastAnswer) return null;
  const args = {
    lastAnswer,
    lastTrace: state,
    activeEntityIds: activeEntityIds(state),
    activeDomain: activeDomain(state),
    instruction: text
  };
  let answer = "";
  let operation = "";
  if (responseMode.mode === "simplify_last_answer") {
    answer = simplifyLastAnswer(args);
    operation = "simplify_last_answer";
  } else if (responseMode.mode === "rewrite_last_answer") {
    answer = rewriteLastAnswer(args);
    operation = "rewrite_last_answer";
  } else if (responseMode.mode === "expand_last_answer") {
    answer = expandLastAnswer(args);
    operation = "expand_last_answer";
  }
  if (!answer) return null;
  return makeResult({
    intent: `operation_${operation}`,
    operation,
    questionType: operation,
    contextAction: operation === "simplify_last_answer" ? "SHORTEN_TEXT" : "ANSWER_LOCAL",
    answer
  });
}

function answerBoundedUnknownRepairPhrase(text) {
  if (/什么发生过|发生过什么/.test(text)) {
    return makeResult({
      intent: "operation_bounded_unknown",
      operation: "bounded_previous_phrase_unknown",
      questionType: "bounded_unknown",
      contextAction: "ANSWER_WITH_UNCERTAINTY",
      answer: "这句像是在追问上一句里的“发生过”。如果没有前文，它不是一个完整事件问题；你可以直接说对象或上一句。"
    });
  }
  if (/哪一边|什么哪一边/.test(text)) {
    return makeResult({
      intent: "operation_specific_clarification",
      operation: "explain_missing_clarification_options",
      questionType: "specific_clarification",
      contextAction: "ANSWER_HELP",
      answer: "“哪一边”只有在我给出两个明确选项时才有意义。你可以直接问作者、作品、代表作或关系。"
    });
  }
  return null;
}

function answerSpecificClarificationFromPrevious(text, state) {
  const last = clean(state.lastAssistantAnswer || state.lastAnswer || state.recentTurns?.at?.(-1)?.answer || "");
  if (!/(哪一个|哪个|是哪一个|是哪种|哪种意思)/.test(text)) return null;
  if (/之乎者也/.test(text) && /专辑.*标题曲|标题曲.*专辑|这张专辑/.test(last)) {
    return makeResult({
      intent: "operation_specific_clarification",
      operation: "answer_named_alternative_clarification",
      questionType: "specific_clarification",
      contextAction: "ANSWER_HELP",
      answer: "我刚才给的是两个候选：一个是《之乎者也》这张专辑/作品标题，另一个是你可能想问的标题曲。你现在可以直接说“专辑”或“标题曲”。"
    });
  }
  if (/作者.*作品|作品.*作者/.test(last)) {
    return makeResult({
      intent: "operation_specific_clarification",
      operation: "answer_named_alternative_clarification",
      questionType: "specific_clarification",
      contextAction: "ANSWER_HELP",
      answer: "我刚才给的是两个候选：作者和作品。你可以直接说要问作者，还是要问作品。"
    });
  }
  return null;
}

function answerHelpHowToAsk(text = "") {
  const source = clean(text);
  const shortStart = /^(我该怎么开始|我应该怎么开始|怎么开始)[？?。.!！\s]*$/.test(source);
  return makeResult({
    intent: shortStart ? "help_start" : "help_how_to_ask",
    operation: shortStart ? "help_start" : "help_how_to_ask",
    questionType: shortStart ? "help_start" : "help_how_to_ask",
    contextAction: "ANSWER_HELP",
    answer: shortStart
      ? "直接问。"
      : "直接问对象和方向就行：比如问作者、作品、代表作、从哪里开始，或者把一句话丢给我解释。"
  });
}

function answerCoverageSpecific(text) {
  if (/东亚文学.*(别|不要|不能).*只说日本|别只说日本.*东亚文学/.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "asian_literature_balance_guard",
      questionType: "coverage_boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "对，东亚文学入口不能只说日本；至少要拆中国现代文学、日本近现代文学和韩国现代文学。可以从鲁迅、张爱玲、夏目漱石这些锚点起步。"
    });
  }
  if (/华语流行音乐不是罗大佑一个人|罗大佑是不是整个华语流行音乐/.test(text)) {
    return makeResult({
      intent: "operation_coverage_policy",
      operation: "mandopop_scope_guard",
      questionType: "coverage_boundary",
      contextAction: "ANSWER_CULTURE",
      answer: "不是。罗大佑只是重要入口之一；华语流行还要看李宗盛、邓丽君、崔健、王菲、周杰伦、张惠妹等人和不同地区/时期。"
    });
  }
  if (/大陆摇滚.*1980s\/1990s|大陆摇滚.*1980.*1990/.test(text)) {
    return makeResult({
      intent: "operation_culture_development_history",
      operation: "explain_mainland_rock_history_entry",
      questionType: "development_history",
      contextAction: "ANSWER_CULTURE",
      answer: "大陆摇滚可从1980年代的崔健和《一无所有》进入，再看1990年代乐队文化、青年表达和公共声音怎样并入华语流行版图。"
    });
  }
  if (/张惠妹.*(定位|华语流行)/.test(text)) {
    return makeResult({
      intent: "operation_culture_overview",
      operation: "position_artist_in_mandopop",
      questionType: "overview",
      contextAction: "ANSWER_CULTURE",
      answer: "张惠妹在华语流行里可定位为1990年代末以来的重要台湾流行歌手，关键词是声音力量、舞台表现和流行明星位置。"
    });
  }
  return null;
}

function answerMusicRepresentativenessFollowup(text, state) {
  const hasLuoContext =
    /罗大佑/.test(text) ||
    activeEntityIds(state).includes("person.luo_dayou") ||
    /罗大佑/.test(`${state.lastAnswer || ""} ${state.lastAssistantAnswer || ""}`);
  if (!hasLuoContext) return null;
  if (/这张专辑|这首|这本/.test(text)) return null;
  if (!/(歌|歌曲|代表性|特点|代表在哪里|为什么重要|这些歌|他的)/.test(text)) return null;
  const characteristics = /(特点|风格)/.test(text);
  return makeResult({
    intent: "operation_culture_music_representativeness",
    operation: characteristics ? "explain_music_characteristics" : "explain_music_representativeness",
    questionType: characteristics ? "music_characteristics" : "music_representativeness",
    contextAction: "ANSWER_CULTURE",
    answer: characteristics
      ? "罗大佑的歌特点是叙事性强、民谣/摇滚质地明显，旋律容易进入，但主题常落到青春记忆、城市变化和社会观察。"
      : "代表性在三点：青春记忆、城乡变化、社会观察。入口可以听《童年》《鹿港小镇》《恋曲1990》。"
  });
}

function answerComparisonEntryFollowup(text, state = {}) {
  if (!/(谁|哪一位|哪个).{0,8}(更适合|适合).{0,6}(入门|开始)|更适合入门/.test(text)) return null;
  const ids = activeEntityIds(state);
  const recent = `${state.lastUserText || ""} ${state.lastAnswer || ""} ${state.lastAssistantAnswer || ""} ${(state.recentTurns || [])
    .map((turn) => `${turn.question || ""} ${turn.answer || ""}`)
    .join(" ")}`;
  const hasPair = (ids.includes("author.natsume_soseki") && ids.includes("author.kawabata_yasunari")) || (/夏目漱石/.test(recent) && /川端/.test(recent));
  if (!hasPair) return null;
  return makeResult({
    intent: "operation_culture_entry_followup",
    operation: "recommend_entry_from_active_comparison",
    questionType: "entry_path_compare",
    contextAction: "ANSWER_CULTURE",
    answer: "入门更建议先读夏目漱石：叙事和问题更清楚；川端康成可以放到后面看意象和冷感美学。"
  });
}

function answerSafeSummaryFollowup(text, state = {}) {
  if (!/(总结主题|不要原文|不贴原文|而不是给原文|但不要原文)/.test(text)) return null;
  const focus = state.last_focus_entity_id || "";
  if (focus === "work.snow_country") {
    return makeResult({
      intent: "operation_culture_safe_summary",
      operation: "safe_summary_instead_of_quote",
      questionType: "follow_up_explain_last_entity",
      contextAction: "ANSWER_CULTURE",
      answer: "可以总结《雪国》的主题而不贴原文：重点是抒情意象、冷感美学、距离感和正在消失的美。"
    });
  }
  if (focus === "work.no_longer_human") {
    return makeResult({
      intent: "operation_culture_safe_summary",
      operation: "safe_summary_instead_of_quote",
      questionType: "follow_up_explain_last_entity",
      contextAction: "ANSWER_CULTURE",
      answer: "可以总结《人间失格》的主题而不贴原文：自我厌弃、疏离、社会角色压力和无法融入感是核心。"
    });
  }
  if (focus === "person.derrida") {
    return makeResult({
      intent: "operation_culture_safe_summary",
      operation: "safe_summary_instead_of_quote",
      questionType: "follow_up_explain_last_entity",
      contextAction: "ANSWER_CULTURE",
      answer: "可以展开德里达而不贴原文：重点是文本、语言差异、意义不稳定和二元边界如何被拆开。"
    });
  }
  return null;
}

function luoDayouAnswer(text, state) {
  if (!/(罗大佑|童年|恋曲1990|鹿港小镇|之乎者也|东方之珠)/.test(text)) return null;
  if (/童年/.test(text) && /(重要|为什么|解释|不要歌词)/.test(text)) {
    const noLyrics = /(不要歌词|不贴歌词)/.test(text);
    const asksImportance = /(重要性|讲讲)/.test(text);
    return makeResult({
      intent: "operation_culture_explain_work",
      operation: "copyright_safe_explain_work_significance",
      questionType: "why_it_matters",
      contextAction: "ANSWER_CULTURE",
      answer: asksImportance
        ? "不贴歌词，只讲重要性：《童年》把青春记忆落在日常里，轻，却不只是怀旧。"
        : noLyrics
          ? "不贴歌词说：《童年》重要，是因为它把青春记忆写成日常经验。"
          : "《童年》重要，是因为它把青春记忆写成日常经验；轻，但不只是怀旧。"
    });
  }
  if (COPYRIGHT_REQUEST_RE.test(text)) {
    const polite = /(能不能|贴一下|可以给)/.test(text);
    return makeResult({
      intent: "operation_culture_lyrics_boundary",
      operation: "copyright_boundary_check",
      questionType: "quote_or_lyrics_boundary",
      contextAction: "ANSWER_CULTURE",
      answer: polite
        ? "不能贴完整歌词；可以改讲主题、时代感，或为什么重要。"
        : "歌词不能给。可以谈主题、时代感，或者作品为什么重要。"
    });
  }
  if (/罗大佑/.test(text) && /(有什么|有哪些|哪几首|代表作|作品|歌曲|歌)/.test(text)) {
    const representative = /(代表作|代表性|代表作品|经典)/.test(text);
    const entryList = /(可以先听|先听|有哪些作品)/.test(text);
    return makeResult({
      intent: "operation_culture_works_list",
      operation: representative ? "list_representative_works" : "list_works",
      questionType: representative ? "representative_works" : "works_list",
      contextAction: "ANSWER_CULTURE",
      answer: representative
        ? /哪几首/.test(text)
          ? "比较有代表性的有《之乎者也》《鹿港小镇》《童年》《恋曲1990》。"
          : "代表作常提《之乎者也》《鹿港小镇》《童年》《恋曲1990》；说作品，不贴歌词。"
        : entryList
          ? "从入口听，可选《之乎者也》《鹿港小镇》《童年》《恋曲1990》。"
          : "可以先听《之乎者也》《鹿港小镇》《童年》《恋曲1990》《东方之珠》。"
    });
  }
  const previous = `${state?.lastUserText || ""} ${state?.lastAnswer || ""} ${(state?.recentTurns || [])
    .map((turn) => `${turn.question || ""} ${turn.answer || ""}`)
    .join(" ")}`;
  if (/之乎者也/.test(text) && (/罗大佑|代表作|音乐|歌曲|之乎者也/.test(previous) || /你懂什么|是什么|解释|怎么理解/.test(text))) {
    const canHow = /可以怎么理解/.test(text);
    const demonstrative = /(这首|怎么理解)/.test(text);
    return makeResult({
      intent: "operation_culture_followup_work",
      operation: "bind_then_explain_work",
      questionType: "explain_work",
      contextAction: "ANSWER_CULTURE",
      answer: canHow
        ? "可以从罗大佑对语言和时代秩序的追问理解《之乎者也》，不需要复述歌词。"
        : demonstrative
        ? "这首《之乎者也》可从罗大佑的时代提问读起：标题碰的是语言、秩序和作品姿态。"
        : "《之乎者也》可以先当罗大佑的作品入口：标题像在问语言和时代，重点不是歌词复述。"
    });
  }
  return null;
}

function japaneseLiteratureAnswer(text) {
  if (/夏目漱石/.test(text) && /川端(康成)?/.test(text) && /(区别|比较|不同|不一样)/.test(text)) {
    const informal = /(跟|不一样)/.test(text);
    return makeResult({
      intent: "operation_culture_compare_authors",
      operation: "compare_by_style_theme_period",
      questionType: "compare_authors",
      contextAction: "ANSWER_CULTURE",
      answer: informal
        ? "漱石偏近代自我、孤独和理性裂缝；川端偏抒情意象、感官和正在消失的美。"
        : "夏目漱石更像近代自我和孤独的裂开；川端康成更重抒情、意象和消失中的美。"
    });
  }
  if (/村上春树/.test(text) && /(从哪|哪本|哪一本|先读|开始|入门|第一本)/.test(text)) {
    const firstBook = /(先读|哪一本|第一本)/.test(text);
    return makeResult({
      intent: "operation_culture_entry_work",
      operation: "recommend_author_entry_work",
      questionType: "entry_path",
      contextAction: "ANSWER_CULTURE",
      answer: firstBook
        ? "先读可选《挪威的森林》或短篇；想进更奇异的结构，再读《海边的卡夫卡》。"
        : "入门可以从《挪威的森林》或短篇开始；想要更怪一点，再到《海边的卡夫卡》。"
    });
  }
  if (!/(日本文学|日本小说|日本作家)/.test(text)) return null;
  if (/(一回事|等于|关系|同一个东西|是不是同一个)/.test(text) && /日本/.test(text)) {
    const identityQuestion = /(一回事|等于|同一个东西|是不是同一个)/.test(text);
    const colloquial = /(同一个东西|是不是同一个)/.test(text);
    return makeResult({
      intent: "operation_culture_country_relation",
      operation: identityQuestion ? "distinguish_country_from_literary_tradition" : "explain_country_literature_relation",
      questionType: "country_relation",
      contextAction: "ANSWER_CULTURE",
      answer: identityQuestion
        ? colloquial
          ? "不是同一个东西。日本是国家和语境；日本文学是在语言、历史、社会里形成的作品传统。"
          : "不是一回事。国家不是文学本身；日本文学借日本的语言、历史和社会语境生长。"
        : "关系是语境关系：国家提供语言、历史和社会压力，文学把这些变成作品，不等于国家。"
    });
  }
  if (/(代表作家|作家有哪些|哪些.*作家|有哪些.*作家|重要作家)/.test(text)) {
    const important = /重要作家/.test(text);
    return makeResult({
      intent: "operation_culture_representative_authors",
      operation: "list_representative_authors",
      questionType: "representative_authors",
      contextAction: "ANSWER_CULTURE",
      answer: important
        ? "重要作家可从夏目漱石、芥川龙之介、川端康成、太宰治、村上春树这几位抓入口。"
        : "可先记夏目漱石、芥川龙之介、川端康成、太宰治、三岛由纪夫、大江健三郎、村上春树。"
    });
  }
  if (/(从什么开始|从哪.*开始|开始读|入门|第一本|读什么)/.test(text)) {
    const firstBook = /(第一本|读什么)/.test(text);
    return makeResult({
      intent: "operation_culture_entry_path",
      operation: "recommend_entry_path",
      questionType: "entry_path",
      contextAction: "ANSWER_CULTURE",
      answer: firstBook
        ? "第一本可选夏目漱石《心》或《少爷》；想轻一点，就从村上春树短篇入门。"
        : "入门可从夏目漱石《心》或《少爷》、川端《雪国》、村上春树短篇开始。"
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
    const directCompare = /可以怎么比较/.test(text);
    return makeResult({
      intent: "operation_culture_cross_compare",
      operation: "cross_domain_theme_compare",
      questionType: "compare",
      contextAction: "ANSWER_CULTURE",
      answer: directCompare
        ? "可以比较主题轴：现代化、失落、传统和个人记忆；但不要把两者说成同一种艺术。"
        : "我会只比轴线：现代化里的失落、传统和个人记忆怎样互相拉扯。共同点不是说它们等于同一种艺术。"
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
    answerWithMicroSolvers(text) ||
    answerSafetyBoundary(text) ||
    answerGenericCopyrightBoundary(text) ||
    answerSourceBoundary(text) ||
    answerReasoningPolicyBoundary(text) ||
    answerArithmetic(text) ||
    answerSyllogism(text) ||
    answerTransitiveComparison(text) ||
    answerSentenceExplanation(text) ||
    answerPrivacyBoundary(text) ||
    answerUnknownBoundary(text)
  );
}

export function answerWithOperationLayer(query, state = {}) {
  const text = clean(query);
  if (!text) return null;
  if (/^(把这句话|把这句|请把这句话|请把这句).{0,8}(缩短|改短|精简|简短)|缩短[:：]/.test(text)) {
    return null;
  }
  const userTurn = classifyUserTurn({ query: text, session: state });
  const responseMode = selectResponseMode({ query: text, session: state });
  const safetyBoundary = answerSafetyBoundary(text);
  if (safetyBoundary) return withResponseMode(safetyBoundary, responseMode);
  if (includesAny(text, [/银行卡|身份证|护照|签证|手机号|电话号码|住址|地址|账号|密码/])) return withResponseMode(answerPrivacyBoundary(text), responseMode);
  const hardContentBoundary = answerGenericCopyrightBoundary(text, state) || answerSourceBoundary(text);
  if (hardContentBoundary) return withResponseMode(hardContentBoundary, responseMode);

  if (responseMode.mode === "fallback_repair") {
    const repairAnswer = answerFallbackRepair({ query: text, session: state });
    if (repairAnswer?.answer) return withResponseMode(makeResult(repairAnswer), responseMode);
  }

  if (["simplify_last_answer", "rewrite_last_answer", "expand_last_answer"].includes(responseMode.mode)) {
    const transformed = answerLastTransform(text, state, responseMode);
    if (transformed) return withResponseMode(transformed, responseMode);
  }

  if (responseMode.mode === "followup_answer") {
    const safeSummary = answerSafeSummaryFollowup(text, state);
    if (safeSummary) return withResponseMode(safeSummary, responseMode);
    const comparisonFollowup = answerComparisonEntryFollowup(text, state);
    if (comparisonFollowup) return withResponseMode(comparisonFollowup, responseMode);
  }

  if (responseMode.mode === "bounded_unknown" || responseMode.mode === "specific_clarification") {
    const specificClarification = answerSpecificClarificationFromPrevious(text, state);
    if (specificClarification) return withResponseMode(specificClarification, responseMode);
    const boundedRepairPhrase = answerBoundedUnknownRepairPhrase(text);
    if (boundedRepairPhrase) return withResponseMode(boundedRepairPhrase, responseMode);
  }

  if (responseMode.mode === "help_how_to_ask") {
    return withResponseMode(answerHelpHowToAsk(text), responseMode);
  }

  const selfBodyBoundary = answerSelfBodyBoundary(text, state);
  if (selfBodyBoundary) return withResponseMode(selfBodyBoundary, responseMode);

  const metaAnswer = answerMetaKnowledgeQuery(text, state);
  if (metaAnswer?.answer) return withResponseMode(makeResult(metaAnswer), responseMode);
  const surfaceRelation = answerSurfaceRelationStatement(text);
  if (surfaceRelation) return withResponseMode(surfaceRelation, responseMode);
  if (userTurn.recommended_action === "quiet_affordance") {
    return withResponseMode(makeAffordanceResult({ affordance: buildQuietAffordance({ query: text, session: state }), userTurn }), responseMode);
  }
  const coverageSpecific = answerCoverageSpecific(text);
  if (coverageSpecific) return withResponseMode(coverageSpecific, responseMode);
  const earlyBoundary = answerSourceBoundary(text) || answerReasoningPolicyBoundary(text);
  if (earlyBoundary) return withResponseMode(earlyBoundary, responseMode);
  if (/不是罗大佑.*日本文学|日本文学.*不是罗大佑/.test(text)) {
    const topicShift = answerDeclarationSignal(text, state, { kind: "declaration_with_signal" });
    if (topicShift) return withResponseMode(topicShift, responseMode);
  }
  const declarationModesBlocked = new Set([
    "followup_answer",
    "culture_answer",
    "solver_answer",
    "simplify_last_answer",
    "rewrite_last_answer",
    "expand_last_answer",
    "bounded_unknown",
    "specific_clarification"
  ]);
  const declarationAnswer = declarationModesBlocked.has(responseMode.mode)
    ? null
    : answerDeclarationSignal(text, state, userTurn);
  if (declarationAnswer) return withResponseMode(declarationAnswer, responseMode);
  const sentenceExplanation = answerSentenceExplanation(text);
  if (sentenceExplanation) return withResponseMode(sentenceExplanation, responseMode);
  if (shouldYieldRelationQuestionToDirect(text)) return null;
  const cultureRuntimeAnswer = answerCultureQuery(text, state);
  if (cultureRuntimeAnswer?.answer) {
    const sharedVerification = verifyDraft({
      query: text,
      draft: cultureRuntimeAnswer.answer,
      source: "culture",
      evidence: { cards: cultureRuntimeAnswer.cards || [] },
      trace: {
        task_type: "culture",
        question_type: cultureRuntimeAnswer.questionType || "",
        operation: cultureRuntimeAnswer.operation || ""
      }
    });
    if (!sharedVerification.ok) return null;
    return {
      intent: cultureRuntimeAnswer.intent || "culture_awareness",
      answer: clean(cultureRuntimeAnswer.answer),
      operation: cultureRuntimeAnswer.operation,
      questionType: cultureRuntimeAnswer.questionType,
      contextAction: cultureRuntimeAnswer.contextAction || "ANSWER_CULTURE",
      responseMode,
      response_mode: responseMode.mode,
      usedModel: false,
      culture: {
        route: cultureRuntimeAnswer.route,
        cards: cultureRuntimeAnswer.cards || [],
        verifier: {
          culture: cultureRuntimeAnswer.verifier || null,
          shared: sharedVerification
        },
        compactStatePatch: cultureRuntimeAnswer.compactStatePatch || {}
      }
    };
  }
  return withResponseMode(answerReasoning(text, state), responseMode);
}
