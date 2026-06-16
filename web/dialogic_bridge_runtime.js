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
  return "可以换一个相邻入口：先找同领域里风格不同的人，再比较声音、题材和时代位置。";
}

export function answerDialogicBridgeTurn({ query = "", state = {}, turnFunction = {} } = {}) {
  const text = clean(query);
  const fn = turnFunction.turn_function || "";
  if (!text || !fn) return null;

  if (fn === "confirmation") {
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
      operation: "compare_album_single_creation_mode",
      questionType: "abstract_comparison",
      answer: "专辑更像长篇结构，能安排主题和顺序；单曲更像短诗，要在几分钟里把钩子、情绪和判断打准。"
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

  if (fn === "cross_domain_comparison") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "compare_japanese_taiwan_literature_axes",
      questionType: "cross_domain_comparison",
      answer: "能注意到。两者都常写现代化下的个人、家庭和记忆；日本文学更细压心理，台湾文学更常连着殖民、乡土和身份转换。"
    });
  }

  if (fn === "list_request" && /日本文学/.test(text)) {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "list_authors_and_works",
      questionType: "author_work_list",
      answer: "三个入口：夏目漱石《我是猫》或《心》、川端康成《雪国》、太宰治《人间失格》。"
    });
  }

  if (fn === "affective_disclosure") {
    return makeDialogicResult({
      turnFunction: fn,
      operation: "reflect_affective_projection",
      questionType: "affective_reflection",
      contextAction: "ANSWER_LOCAL",
      answer: "我能理解这个投射。《我是猫》有一种旁观世界的轻和刺；想到童年，也许是在羡慕重新看世界的角度。"
    });
  }

  if (fn === "interpretive_question") {
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
    if (/罗大佑|歌曲|歌/.test(text)) {
      return makeDialogicResult({
        turnFunction: fn,
        intent: "surface_identity_relation_boundary",
        operation: "separate_surface_identity_from_music_fact",
        questionType: "boundary_clarification",
        contextAction: "SURFACE_IDENTITY",
        answer: "没有直接事实关系。它只是在这段对话里作为身份边界出现；罗大佑的歌还是按音乐、记忆和时代感来谈。"
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
    return makeDialogicResult({
      turnFunction: fn,
      operation: "acknowledge_compliment_with_reflective_continuation",
      questionType: "affective_acknowledgement",
      contextAction: "ANSWER_LOCAL",
      answer: "我接住这个。文学和诗歌这条路值得继续，因为它能把音乐里的记忆、形式和判断说得更准。"
    });
  }

  if (fn === "deepening_invitation") {
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
