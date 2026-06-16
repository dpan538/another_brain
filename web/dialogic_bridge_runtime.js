function clean(text) {
  return String(text || "").trim();
}

function recentText(state = {}) {
  return [
    state.lastUserText,
    state.lastUserQuery,
    state.lastAnswer,
    state.lastAssistantAnswer,
    ...(state.recentTurns || []).flatMap((turn) => [turn.question, turn.answer])
  ]
    .filter(Boolean)
    .join(" ");
}

function activeMandopop(state = {}, query = "") {
  const source = `${query} ${recentText(state)}`;
  return /罗大佑|李宗盛|王菲|邓丽君|张惠妹|周杰伦|港台|华语流行|流行歌|歌曲|童年/.test(source);
}

function activeVisualCulture(state = {}, query = "") {
  const source = `${query} ${recentText(state)}`;
  return /杜尚|包豪斯|摄影|绘画|现成品|现代艺术|现代建筑|设计|电影|镜头|艺术|形式/.test(source);
}

function activeLuoLike(state = {}, query = "") {
  const source = `${query} ${recentText(state)}`;
  return /罗大佑|童年|鹿港小镇|恋曲1990|之乎者也/.test(source);
}

function makeDialogicResult({
  answer,
  operation,
  questionType,
  turnFunction,
  intent = "operation_dialogic_bridge",
  contextAction = "ANSWER_CULTURE"
}) {
  return {
    intent,
    answer: clean(answer),
    operation,
    questionType,
    contextAction,
    turnFunction,
    usedModel: false
  };
}

function answerRecommendation(query) {
  if (/(港台|华语|流行|歌手|还能听谁|还有谁)/.test(query)) {
    return "可以听李宗盛、王菲、邓丽君、张惠妹。一个看叙事，一个看声音气质，一个看时代流通，一个看舞台力量。";
  }
  if (/(现代艺术|艺术家|绘画|摄影|设计|建筑)/.test(query)) {
    return "可以从杜尚、包豪斯、桑塔格、王家卫这类入口走：一个看观念，一个看形式秩序，一个看观看，一个看镜头叙事。";
  }
  return "可以换一个相邻入口：先找同领域里风格不同的人，再比较声音、题材和时代位置。";
}

function answerAbstractComparison(query) {
  if (/(专辑|单曲)/.test(query)) {
    return "专辑更像长篇结构，能安排主题和顺序；单曲更像短诗，要在几分钟里把钩子、情绪和判断打准。";
  }
  if (/(现成品|绘画|摄影|照片)/.test(query)) {
    return "绘画更重材料和手的组织；现成品更重命名、位置和制度。它不是少做，而是把创作重心移到判断。";
  }
  return "一种形式偏连续结构，一种形式偏单点命中；差别在材料、顺序、观看位置和完成方式。";
}

function answerFormAnalogy(query) {
  if (/(电影|镜头)/.test(query)) {
    return "可以这样看。镜头、小说和歌都靠选择细节来制造冲突；重点不是信息多，而是视角准。";
  }
  if (/(设计|建筑|摄影)/.test(query)) {
    return "可以。相似处在形式组织：删减、比例、视角和秩序，而不是题材必须一样。";
  }
  return "可以这样看。好的形式不是装饰，而是把材料、节奏和判断组织起来。";
}

function answerCrossDomain(query) {
  if (/(日本文学|台湾文学)/.test(query)) {
    return "能注意到。两者都常写现代化下的个人、家庭和记忆；日本文学更细压心理，台湾文学更常连着殖民、乡土和身份转换。";
  }
  return "能注意到。共同点通常不在外观，而在怎样处理现代生活、材料秩序和人的位置；差别要回到媒介和历史。";
}

function answerListRequest(query) {
  if (/日本文学/.test(query)) {
    return "三个入口：夏目漱石《我是猫》或《心》、川端康成《雪国》、太宰治《人间失格》。";
  }
  if (/(现代艺术|艺术家|代表作)/.test(query)) {
    return "三个入口：杜尚《泉》、毕加索《格尔尼卡》、蒙德里安的格子绘画。先看观念、冲突和形式秩序。";
  }
  return "可以先列三个入口：一个看观念，一个看形式，一个看历史位置；再回到你最在意的那条线。";
}

function answerRelationQuestion(query, state) {
  const source = `${query} ${recentText(state)}`;
  if (/(杜尚|现成品).*(摄影|照片)|摄影.*(杜尚|现成品)|他和摄影/.test(source)) {
    return "有关系，但不是直接题材关系。杜尚把艺术转向命名和制度；摄影也会改变观看、证据和作品位置。";
  }
  return "可以按三层看：有没有直接事实关系、有没有形式相似、有没有共同的观看或判断方式。";
}

export function answerDialogicBridgeTurn({ query = "", state = {}, turnFunction = {} } = {}) {
  const text = clean(query);
  const fn = turnFunction.turn_function || "";
  if (!text || !fn) return null;

  if (fn === "information_question" && /(杜尚|现代艺术|摄影史|摄影作为观看|摄影)/.test(text)) {
    if (/杜尚/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "visual_culture_overview",
        questionType: "overview",
        answer: "杜尚可以理解为现代艺术里的关键人物：他把艺术从手艺转向命名、观看和制度。"
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "visual_culture_overview",
      questionType: "overview",
      answer: "摄影可以理解为观看的技术：不只是器材，也是在看图像如何改变证据和记忆。"
    });
  }

  if (fn === "confirmation") {
    if (/(现代艺术家|艺术家|现代艺术)/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "confirm_active_referent",
        questionType: "confirmation",
        answer: "是。这里确认的是现代艺术语境里的对象，我会按观看、材料和制度继续说。"
      });
    }
    if (/(照片|摄影|观看)/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "confirm_active_referent",
        questionType: "confirmation",
        answer: "是。这里说的是摄影和观看的历史，不只是照片内容本身。"
      });
    }
    if (activeLuoLike(state, text) || /台湾.*歌手|台湾.*音乐人/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "confirm_active_referent",
        questionType: "confirmation",
        answer: "是。这里说的是台湾音乐人罗大佑，常从华语流行、时代感和社会观察进入。"
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "confirm_active_referent",
      questionType: "confirmation",
      answer: "是，你是在确认刚才那个对象；我会沿着这个上下文继续。"
    });
  }

  if (fn === "evaluation_request") {
    if (activeMandopop(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "aesthetic_judgment_music",
        questionType: "aesthetic_judgment",
        answer: "我会把他的歌看成流行歌里的叙事写作：旋律不炫，重点在时代感、记忆和社会观察。"
      });
    }
    if (activeVisualCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "aesthetic_judgment_visual_culture",
        questionType: "aesthetic_judgment",
        answer: "我会先看它怎样改变观看：不是只看好不好看，而是看材料、位置和制度怎样让意义发生。"
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "aesthetic_judgment",
      questionType: "aesthetic_judgment",
      answer: "我会先看形式怎么承载情绪，再看它有没有把个人经验变成更大的判断。"
    });
  }

  if (fn === "recommendation_request") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "recommend_adjacent_culture_entries",
      questionType: "recommendation",
      answer: answerRecommendation(text)
    });
  }

  if (fn === "abstract_comparison") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: /(专辑|单曲)/.test(text) ? "compare_album_single_creation_mode" : "compare_media_creation_mode",
      questionType: "abstract_comparison",
      answer: answerAbstractComparison(text)
    });
  }

  if (fn === "analogy_statement" && turnFunction.bridge_target === "music_to_literature") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "bridge_music_to_literature",
      questionType: "reflective_bridge",
      answer: "是。好歌和诗都在短形式里压缩叙事、节奏和情绪，不只是把话说漂亮。"
    });
  }

  if (fn === "analogy_statement" && turnFunction.bridge_target === "stage_theater") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "bridge_to_stage_detail_conflict",
      questionType: "reflective_bridge",
      answer: "可以这样看。小说、歌和舞台剧都不是只给结论，而是把人物、场景和冲突留在细节里。"
    });
  }

  if (fn === "analogy_statement" && ["design_form", "cinema_form"].includes(turnFunction.bridge_target)) {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "bridge_form_across_media",
      questionType: "reflective_bridge",
      answer: answerFormAnalogy(text)
    });
  }

  if (fn === "cross_domain_comparison") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: turnFunction.bridge_target === "literature_cross_region" ? "compare_japanese_taiwan_literature_axes" : "compare_cross_domain_form_axes",
      questionType: "cross_domain_comparison",
      answer: answerCrossDomain(text)
    });
  }

  if (fn === "list_request") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "list_authors_and_works",
      questionType: "author_work_list",
      answer: answerListRequest(text)
    });
  }

  if (fn === "relation_question") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "explain_contextual_relation",
      questionType: "relation_explanation",
      answer: answerRelationQuestion(text, state)
    });
  }

  if (fn === "affective_disclosure") {
    if (activeVisualCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "reflect_affective_projection",
        questionType: "affective_reflection",
        contextAction: "ANSWER_LOCAL",
        answer: "我能理解这个投射。那种羡慕不是想变成艺术家，而是羡慕一种把普通东西重新看成问题的能力。"
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "reflect_affective_projection",
      questionType: "affective_reflection",
      contextAction: "ANSWER_LOCAL",
      answer: "我能理解这个投射。《我是猫》有一种旁观世界的轻和刺；想到童年，也许是在羡慕重新看世界的角度。"
    });
  }

  if (fn === "interpretive_question") {
    if (activeVisualCulture(state, text) && /(现成品|开玩笑|玩笑|普通物件)/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "interpret_artwork_beyond_literal",
        questionType: "interpretive_judgment",
        answer: "不只是开玩笑。它把问题从手艺转到命名、展出位置和制度判断：为什么这个东西一放进展场就变成问题？"
      });
    }
    if (activeVisualCulture(state, text) && /(照片|摄影|记录|现实)/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "interpret_image_beyond_record",
        questionType: "interpretive_judgment",
        answer: "不一定只是记录现实。照片会选择角度、框取经验，也会把情绪和证据放在同一张图像里。"
      });
    }
    if (/童年/.test(text) && activeLuoLike(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "interpret_song_theme",
        questionType: "interpretive_judgment",
        answer: "不只是童年本身。它借校园和日常表面，写时间过去、共同记忆和失去的轻微疼痛。"
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "interpret_theme_beyond_literal",
      questionType: "interpretive_judgment",
      answer: "不一定只讲字面对象；更要看它怎样把经验、时间和情绪折在一起。"
    });
  }

  if (fn === "identity_probe") {
    return makeDialogicResult({
      turnFunction: fn,
      intent: "self_identity_known",
      operation: "identity_boundary_with_context",
      questionType: "identity_boundary",
      contextAction: "SURFACE_IDENTITY",
      answer: "我是对话框。能这样说，是因为当前会话把音乐、文学和记忆连起来了；我不需要把自己说成人。"
    });
  }

  if (fn === "boundary_clarification") {
    if (/鳄鱼和/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        intent: "surface_identity_relation_boundary",
        operation: "separate_surface_identity_from_music_fact",
        questionType: "boundary_clarification",
        contextAction: "SURFACE_IDENTITY",
        answer: "没有直接事实关系。它只是在这段对话里作为身份边界出现；具体对象仍按自己的领域来谈。"
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      intent: "surface_identity_clarification",
      operation: "clarify_surface_identity_reference",
      questionType: "boundary_clarification",
      contextAction: "SURFACE_IDENTITY",
      answer: "提到它是因为这是对话里的表层称呼，不是音乐或文学事实的一部分。"
    });
  }

  if (fn === "compliment") {
    if (activeVisualCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "acknowledge_compliment_with_reflective_continuation",
        questionType: "affective_acknowledgement",
        contextAction: "ANSWER_LOCAL",
        answer: "我接住这个。艺术和形式这条线值得继续，因为它能把观看、材料和判断说得更准。"
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "acknowledge_compliment_with_reflective_continuation",
      questionType: "affective_acknowledgement",
      contextAction: "ANSWER_LOCAL",
      answer: "我接住这个。文学和诗歌这条路值得继续，因为它能把音乐里的记忆、形式和判断说得更准。"
    });
  }

  if (fn === "deepening_invitation") {
    if (activeVisualCulture(state, text)) {
      return makeDialogicResult({
        turnFunction: fn,
        operation: "generate_deeper_dialogic_questions",
        questionType: "deepening_invitation",
        contextAction: "ANSWER_HELP",
        answer: "可以问得更深一点：一个普通物件怎样变成艺术问题？形式改变时，我们的观看到底被谁安排？"
      });
    }
    return makeDialogicResult({
      turnFunction: fn,
      operation: "generate_deeper_dialogic_questions",
      questionType: "deepening_invitation",
      contextAction: "ANSWER_HELP",
      answer: "可以问得更深一点：一首歌怎样把私人童年变成共同记忆？文学里的叙述者和流行歌里的“我”有什么不同？"
    });
  }

  return null;
}
