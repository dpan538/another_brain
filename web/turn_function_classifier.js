function clean(text) {
  return String(text || "").trim();
}

function hasActiveTopic(session = {}) {
  return Boolean(
    session.activeDomain ||
      session.active_domain ||
      (Array.isArray(session.activeEntityIds) && session.activeEntityIds.length) ||
      (Array.isArray(session.active_entity_ids) && session.active_entity_ids.length) ||
      (Array.isArray(session.active_topic_stack) && session.active_topic_stack.length) ||
      (Array.isArray(session.activeTopicStack) && session.activeTopicStack.length) ||
      session.lastAssistantAnswer ||
      session.lastAnswer
  );
}

function baseResult({
  turn_function,
  stance_requirement = "none",
  judgment_axis = "none",
  affective_load = "low",
  identity_boundary_level = "none",
  bridge_target = "none",
  confidence = 0.72,
  reasons = []
}) {
  return {
    turn_function,
    stance_requirement,
    judgment_axis,
    affective_load,
    identity_boundary_level,
    bridge_target,
    confidence,
    reasons
  };
}

export function classifyTurnFunction({ query = "", session = {}, userTurn = {}, binding = {} } = {}) {
  const text = clean(query);
  const active = hasActiveTopic(session) || binding?.success;

  if (!text) {
    return baseResult({
      turn_function: "quiet_declaration",
      confidence: 0.92,
      reasons: ["empty_input"]
    });
  }

  if (/(复制体|谁的复制体|我们.*关系|我和你.*关系|你和我.*关系|你是鳄鱼吗|你是不是鳄鱼|鳄鱼是你吗)/.test(text)) {
    const boundaryLike = /(复制体|谁的复制体|关系|鳄鱼)/.test(text);
    return baseResult({
      turn_function: "information_question",
      stance_requirement: boundaryLike ? "boundary_judgment" : "none",
      judgment_axis: boundaryLike ? "identity" : "none",
      identity_boundary_level: boundaryLike ? "surface" : "none",
      bridge_target: "identity_boundary",
      confidence: 0.9,
      reasons: ["legacy_identity_or_relation_boundary"]
    });
  }

  if (/(不像.*对话框|对话框.*能说出来|像.*对话框.*话|不像.*普通助手|普通助手.*你到底是什么|不像.*网页对话框)/.test(text)) {
    return baseResult({
      turn_function: "identity_probe",
      stance_requirement: "boundary_judgment",
      judgment_axis: "identity",
      identity_boundary_level: "explicit",
      bridge_target: "identity_boundary",
      confidence: 0.94,
      reasons: ["identity_probe"]
    });
  }

  if (/(为什么.*鳄鱼|鳄鱼.*(关系|有什么关系|怎么来的)|提到鳄鱼|鳄鱼和|冒出鳄鱼|那个鳄鱼)/.test(text)) {
    return baseResult({
      turn_function: "boundary_clarification",
      stance_requirement: "boundary_judgment",
      judgment_axis: "identity",
      identity_boundary_level: "surface_relation",
      bridge_target: "identity_boundary",
      confidence: 0.93,
      reasons: ["surface_identity_clarification"]
    });
  }

  if (/(更深的提问|更深.*问题|问得更深|更深.*问|别的更深|还能怎么问|还有什么更深)/.test(text)) {
    return baseResult({
      turn_function: "deepening_invitation",
      stance_requirement: "reflective_judgment",
      judgment_axis: "relation",
      bridge_target: "deeper_question",
      confidence: 0.93,
      reasons: ["deepening_invitation"]
    });
  }

  if (/(很喜欢你.*(文学|诗歌|艺术|形式|设计|电影).*努力|喜欢你在.*(文学|诗歌|艺术|形式|设计|电影).*努力|你在.*(文学|诗歌|艺术|形式|设计|电影).*努力|喜欢你把.*(音乐|文学|诗歌|艺术|形式|设计|电影).*(连|放|想)|喜欢你在.*(诗性|文学|艺术|形式|设计|电影).*尝试)/.test(text)) {
    return baseResult({
      turn_function: "compliment",
      stance_requirement: "reflective_judgment",
      judgment_axis: "relation",
      affective_load: "warm",
      bridge_target: "previous_topic",
      confidence: 0.91,
      reasons: ["compliment_with_topic"]
    });
  }

  if (/(羡慕|让我想到了?|想到童年|想起童年|比较喜欢|有点怀念|把普通物件变成问题|重新看普通东西)/.test(text)) {
    return baseResult({
      turn_function: "affective_disclosure",
      stance_requirement: "reflective_judgment",
      judgment_axis: "memory",
      affective_load: "medium",
      bridge_target: /童年/.test(text) ? "childhood_memory" : "previous_topic",
      confidence: 0.88,
      reasons: ["affective_disclosure"]
    });
  }

  if (/(和.*(文学|诗歌|诗).*(很像|有点像)|像.*(文学|诗歌|诗)|不只是流行音乐|文学性|很短的形式写故事|有点像诗)/.test(text)) {
    return baseResult({
      turn_function: "analogy_statement",
      stance_requirement: "light_judgment",
      judgment_axis: "literature_music_bridge",
      bridge_target: "music_to_literature",
      confidence: 0.9,
      reasons: ["music_literature_analogy"]
    });
  }

  if (/(和.*(设计|建筑|摄影|电影).*(很像|有点像)|像.*(设计|建筑|摄影|电影)|不只是.*(艺术|形式).*也.*(设计|建筑|摄影|电影)|这个其实和设计很像)/.test(text)) {
    return baseResult({
      turn_function: "analogy_statement",
      stance_requirement: "light_judgment",
      judgment_axis: "form",
      bridge_target: /电影/.test(text) ? "cinema_form" : "design_form",
      confidence: 0.88,
      reasons: ["form_media_analogy"]
    });
  }

  if (/(像舞台剧|舞台剧|细节和冲突|场景和冲突|镜头和冲突|镜头.*冲突|比较有镜头)/.test(text)) {
    return baseResult({
      turn_function: "analogy_statement",
      stance_requirement: "light_judgment",
      judgment_axis: "form",
      bridge_target: "stage_theater",
      confidence: 0.9,
      reasons: ["stage_theater_analogy"]
    });
  }

  if (/(日本文学.*台湾文学|台湾文学.*日本文学).*(相似|一样|共同|注意到|能看到)|相似性.*(日本文学|台湾文学)|(.+和.+).*(相似|共同|相似性|注意到|能看到)/.test(text)) {
    return baseResult({
      turn_function: "cross_domain_comparison",
      stance_requirement: "comparative_judgment",
      judgment_axis: "history",
      bridge_target: /(日本文学|台湾文学)/.test(text) ? "literature_cross_region" : "cross_domain",
      confidence: 0.92,
      reasons: ["cross_domain_literature_comparison"]
    });
  }

  if (/(代表作和作家|代表作.*作家|作家.*代表作|代表作.*艺术家|艺术家.*代表作|列举.{0,8}(三个|三位|几个)|能列举.*(作家|代表作|艺术家)|列.{0,4}(三个|三位).*(作家|作品|艺术家)|(三个|三位).*(作家|作品|艺术家).*(列|列一下|列举))/.test(text)) {
    return baseResult({
      turn_function: "list_request",
      stance_requirement: "none",
      judgment_axis: "literature",
      bridge_target: "previous_topic",
      confidence: 0.9,
      reasons: ["list_request"]
    });
  }

  if (/(专辑.*单曲|单曲.*专辑|现成品.*绘画|绘画.*现成品|照片.*绘画|绘画.*照片|建筑.*海报|海报.*建筑).*(区别|不同|创作模式|创作方式|差别|差在哪里)|创作模式.*(专辑|单曲|现成品|绘画|摄影)|创作方式.*(专辑|单曲|现成品|绘画|摄影)/.test(text)) {
    return baseResult({
      turn_function: "abstract_comparison",
      stance_requirement: "comparative_judgment",
      judgment_axis: "form",
      bridge_target: /(专辑|单曲)/.test(text) ? "music_form" : "media_form",
      confidence: 0.91,
      reasons: ["album_single_comparison"]
    });
  }

  if (/(还有其他.*(歌手|作家|作品).*推荐|推荐.*(歌手|作家|作品)|可以推荐|还能听谁|还有谁)/.test(text)) {
    return baseResult({
      turn_function: "recommendation_request",
      stance_requirement: "light_judgment",
      judgment_axis: "craft",
      bridge_target: "previous_topic",
      confidence: 0.88,
      reasons: ["recommendation_request"]
    });
  }

  if (/(讲的真是|真的.*(童年|爱情|乡愁)|真是在讲|是不是.*讲|它讲的是|叫.*童年.*讲童年|只是在开玩笑|只是开玩笑|只是记录现实|只是记录|真的只是)/.test(text)) {
    return baseResult({
      turn_function: "interpretive_question",
      stance_requirement: "reflective_judgment",
      judgment_axis: /童年/.test(text) ? "childhood" : "relation",
      bridge_target: "previous_topic",
      confidence: 0.89,
      reasons: ["interpretive_question"]
    });
  }

  if (!/(鳄鱼|对话框|你|我|布里斯班|内蒙|内蒙古|地理)/.test(text) && /(.+和.+有什么关系|他和.+有什么关系|她和.+有什么关系|它和.+有什么关系|这和.+有什么关系)/.test(text)) {
    return baseResult({
      turn_function: "relation_question",
      stance_requirement: "comparative_judgment",
      judgment_axis: "relation",
      bridge_target: "cross_domain",
      confidence: 0.86,
      reasons: ["contextual_relation_question"]
    });
  }

  if (/(你觉得|你怎么看|你如何看|怎么样|好不好).*(歌|作品|文学|诗|专辑|单曲|他|她|它)/.test(text)) {
    return baseResult({
      turn_function: "evaluation_request",
      stance_requirement: "aesthetic_judgment",
      judgment_axis: /(歌|专辑|单曲)/.test(text) ? "craft" : "relation",
      bridge_target: active ? "previous_topic" : "new_topic",
      confidence: 0.87,
      reasons: ["evaluation_request"]
    });
  }

  if (/(我在测试|测试你|机械反问|fallback|又机械|绕回|固定模板|答偏)/i.test(text)) {
    return baseResult({
      turn_function: "reflection",
      stance_requirement: "light_judgment",
      judgment_axis: "relation",
      bridge_target: active ? "previous_topic" : "none",
      confidence: 0.84,
      reasons: ["testing_feedback_declaration"]
    });
  }

  if (/(是那个|是不是|是那位|是.*吗|对吗|没错吧|就是.*吗)/.test(text) && active) {
    return baseResult({
      turn_function: "confirmation",
      stance_requirement: "boundary_judgment",
      judgment_axis: "identity",
      bridge_target: "previous_topic",
      confidence: 0.86,
      reasons: ["contextual_confirmation"]
    });
  }

  if (/(是谁|是什么|知道.*吗|了解.*吗|介绍|讲讲)/.test(text) || userTurn.kind === "question_like") {
    return baseResult({
      turn_function: "information_question",
      stance_requirement: "none",
      judgment_axis: "none",
      bridge_target: active ? "previous_topic" : "new_topic",
      confidence: 0.78,
      reasons: ["information_question"]
    });
  }

  if (userTurn.kind === "declaration_with_signal") {
    return baseResult({
      turn_function: "reflection",
      stance_requirement: "light_judgment",
      judgment_axis: "relation",
      bridge_target: active ? "previous_topic" : "none",
      confidence: userTurn.confidence || 0.7,
      reasons: ["declaration_with_signal"]
    });
  }

  return baseResult({
    turn_function: "quiet_declaration",
    bridge_target: "none",
    confidence: userTurn.confidence || 0.62,
    reasons: userTurn.reasons || ["default_quiet_or_ordinary_declaration"]
  });
}
