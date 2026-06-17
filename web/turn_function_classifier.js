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

  if (/(不像.*对话框|对话框.*能说出来|像.*对话框.*话|不像.*普通助手|普通助手.*你到底是什么|不像.*网页对话框|不像.*工具.*说出来|工具.*能说出来|不像.*工具.*你是谁)/.test(text)) {
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

  if (/(很喜欢你.*(文学|诗歌|艺术|形式|设计|电影|镜头|语言|翻译|意义|科学|叙事|城市|空间|技术|伦理|行动|教育|学习|经验|经济|制度|劳动).*努力|喜欢你在.*(文学|诗歌|艺术|形式|设计|电影|镜头|语言|翻译|意义|科学|叙事|城市|空间|技术|伦理|行动|教育|学习|经验|经济|制度|劳动).*努力|你在.*(文学|诗歌|艺术|形式|设计|电影|镜头|语言|翻译|意义|科学|叙事|城市|空间|技术|伦理|行动|教育|学习|经验|经济|制度|劳动).*努力|喜欢你把.*(音乐|文学|诗歌|艺术|形式|设计|电影|镜头|语言|翻译|意义|科学|城市|技术|伦理|教育|经济|制度).*(连|放|想)|喜欢你在.*(诗性|文学|艺术|形式|设计|电影|镜头|语言|翻译|意义|科学|叙事|城市|空间|技术|伦理|行动|教育|学习|经济|制度).*尝试)/.test(text)) {
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

  if (/(羡慕|让我想到了?|想到童年|想起童年|比较喜欢|有点怀念|把普通物件变成问题|重新看普通东西|羡慕.*(观察|街道|工具|行动|判断|证据|公共空间|学习|课堂|经验|劳动|制度|镜头|翻译|说法|命名)|想到.*(小时候|小时候的|童年|记忆))/.test(text)) {
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

  if (/(和.*(文学|诗歌|诗|小说).*(很像|有点像)|像.*(文学|诗歌|诗|小说)|不只是流行音乐|文学性|很短的形式写故事|有点像诗|像是在写故事|叙事感很强)/.test(text)) {
    return baseResult({
      turn_function: "analogy_statement",
      stance_requirement: "light_judgment",
      judgment_axis: "literature_music_bridge",
      bridge_target: "music_to_literature",
      confidence: 0.9,
      reasons: ["music_literature_analogy"]
    });
  }

  if (/(和.*(设计|建筑|摄影|电影|镜头|语言|翻译|命名|工具|界面|城市|规划|科学观察|实验|政治|伦理|教育|课堂|学习|经济|市场|劳动).*(很像|有点像)|像.*(设计|建筑|摄影|电影|镜头|语言|翻译|命名|工具|界面|城市|规划|科学观察|实验|政治|伦理|教育|课堂|学习|经济|市场|劳动)|不只是.*(艺术|形式|技术|科学|教育|经济|语言).*也.*(设计|建筑|摄影|电影|镜头|城市|文学|经验|制度|翻译)|这个其实和(设计|教育|经济|语言|电影)很像)/.test(text)) {
    return baseResult({
      turn_function: "analogy_statement",
      stance_requirement: "light_judgment",
      judgment_axis: "form",
      bridge_target: /电影/.test(text)
        ? "cinema_form"
        : /(科学|实验|观察)/.test(text)
          ? "science_observation"
          : /(城市|规划|街道)/.test(text)
            ? "urban_form"
            : /(工具|界面|技术)/.test(text)
              ? "technology_form"
              : /(政治|伦理)/.test(text)
                ? "ethics_action"
                : /(教育|课堂|学习)/.test(text)
                  ? "education_experience"
                  : /(经济|市场|劳动)/.test(text)
                    ? "economics_relation"
                    : /(语言|翻译|命名|意义)/.test(text)
                      ? "language_meaning"
                    : "design_form",
      confidence: 0.88,
      reasons: ["form_media_analogy"]
    });
  }

  if (/(像舞台剧|舞台剧|细节和冲突|场景和冲突|镜头和冲突|镜头.*冲突|比较有镜头)/.test(text) && !/(相似|共同|相似性|注意到|能看到)/.test(text)) {
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
      judgment_axis: /(技术|工具|算法|城市|科学|伦理|政治)/.test(text) ? "relation" : "history",
      bridge_target: /(日本文学|台湾文学)/.test(text) ? "literature_cross_region" : "cross_domain",
      confidence: 0.92,
      reasons: ["cross_domain_literature_comparison"]
    });
  }

  if (/(代表作(?:品)?和(?:作家|作者|艺术家)|代表作(?:品)?.*(作家|作者|艺术家|导演)|(?:作家|作者|艺术家|导演).*代表作(?:品)?|电影作者.*代表作品|代表人物|关键人物|经典文本|列举.{0,8}(三个|三位|几个)|能列(?:举)?.*(作家|作者|代表作|代表作品|艺术家|导演|人物|文本|作品)|列.{0,4}(三个|三位).*(作家|作者|作品|艺术家|导演|人物|文本)|(三个|三位).*(作家|作者|作品|艺术家|导演|人物|文本).*(列|列一下|列举))/.test(text)) {
    return baseResult({
      turn_function: "list_request",
      stance_requirement: "none",
      judgment_axis: "literature",
      bridge_target: "previous_topic",
      confidence: 0.9,
      reasons: ["list_request"]
    });
  }

  if (/(专辑.*单曲|单曲.*专辑|现成品.*绘画|绘画.*现成品|照片.*绘画|绘画.*照片|镜头.*剪辑|剪辑.*镜头|建筑.*海报|海报.*建筑|观察.*实验|实验.*观察|算法.*界面|界面.*算法|规划.*街道|街道.*规划|行动.*理论|理论.*行动|教.*学|学.*教|学习.*训练|训练.*学习|市场.*计划|计划.*市场|市场.*制度|制度.*市场|劳动.*资本|资本.*劳动|命名.*翻译|翻译.*命名|语言.*意义|意义.*语言).*(区别|不同|创作模式|创作方式|工作模式|差别|差在哪里)|创作模式.*(专辑|单曲|现成品|绘画|摄影|电影|镜头|剪辑|观察|实验|算法|界面)|创作方式.*(专辑|单曲|现成品|绘画|摄影|电影|镜头)|工作模式.*(观察|实验|算法|界面|规划|街道|学习|训练|市场|计划|制度|劳动|资本|命名|翻译|语言)/.test(text)) {
    return baseResult({
      turn_function: "abstract_comparison",
      stance_requirement: "comparative_judgment",
      judgment_axis: "form",
      bridge_target: /(专辑|单曲)/.test(text)
        ? "music_form"
        : /(观察|实验|科学)/.test(text)
          ? "science_method"
          : /(算法|界面|工具)/.test(text)
            ? "technology_method"
            : /(规划|街道|城市)/.test(text)
              ? "urban_method"
              : /(学习|训练|教育|教学)/.test(text)
                ? "education_method"
                : /(市场|计划|劳动|资本)/.test(text)
                  ? "economics_method"
                  : /(镜头|剪辑|电影)/.test(text)
                    ? "cinema_method"
                    : /(语言|翻译|命名|意义)/.test(text)
                      ? "language_method"
                  : "media_form",
      confidence: 0.91,
      reasons: ["album_single_comparison"]
    });
  }

  if (/(还有其他.*(歌手|作家|作品|导演|电影|科学家|思想家|城市|建筑|工具|教育家|经济学|语言学|哲学|方向).*推荐|推荐.*(歌手|作家|作品|导演|电影|科学家|思想家|城市|建筑|工具|教育家|经济学|语言学|哲学|方向)|可以推荐|还能听谁|还有谁|还能看谁|还有什么入口)/.test(text)) {
    return baseResult({
      turn_function: "recommendation_request",
      stance_requirement: "light_judgment",
      judgment_axis: "craft",
      bridge_target: "previous_topic",
      confidence: 0.88,
      reasons: ["recommendation_request"]
    });
  }

  if (/(讲的真是|真的.*(童年|爱情|乡愁|进步|效率|客观|自由|训练|市场|故事|翻译|意义)|真是在讲|是不是.*讲|它讲的是|叫.*童年.*讲童年|只是在开玩笑|只是开玩笑|只是记录现实|只是记录|真的只是|只是.*(效率|进步|客观|工具|训练|市场|故事|翻译|意义)|真的是.*(进步|效率|客观|自由|训练|市场|故事|翻译|意义)|(童年|进步|效率|客观|自由|训练|市场|故事|翻译|意义).*真的是)/.test(text)) {
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

  if (/(你觉得|你怎么看|你如何看|怎么样|好不好).*(歌|作品|文学|诗|专辑|单曲|电影|镜头|语言|翻译|他|她|它)/.test(text)) {
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

  if (/(是那个|是不是|是那位|是.*吗|对吗|没错吧|就是.*吗)/.test(text) && active && !/(真的是|真的只是|只是)/.test(text)) {
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
