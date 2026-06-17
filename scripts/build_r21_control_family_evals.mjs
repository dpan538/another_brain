import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "evals/r21_control_families");

const SPLITS = {
  train: [
    { entity: "罗大佑", entity_family: "music.luo_dayou", pronoun: "他的", domain: "music", referent: "previous_active_person" },
    { entity: "李宗盛", entity_family: "music.li_zongsheng", pronoun: "他的", domain: "music", referent: "previous_active_person" },
    { entity: "张惠妹", entity_family: "music.a_mei", pronoun: "她的", domain: "music", referent: "previous_active_person" },
    { entity: "夏目漱石", entity_family: "lit.natsume", pronoun: "他的", domain: "literature", referent: "previous_active_person" },
    { entity: "白先勇", entity_family: "lit.bai_xianyong", pronoun: "他的", domain: "literature", referent: "previous_active_person" },
    { entity: "毕加索", entity_family: "art.picasso", pronoun: "他的", domain: "art", referent: "previous_active_person" },
    { entity: "现代建筑", entity_family: "design.modern_architecture", pronoun: "它的", domain: "design", referent: "previous_active_domain_or_work" },
    { entity: "达尔文", entity_family: "science.darwin", pronoun: "他的", domain: "science", referent: "previous_active_person" },
    { entity: "科学史", entity_family: "science.history", pronoun: "它的", domain: "science", referent: "previous_active_domain_or_work" },
    { entity: "简·雅各布斯", entity_family: "urban.jane_jacobs", pronoun: "她的", domain: "urban", referent: "previous_active_person" },
    { entity: "香农", entity_family: "technology.shannon", pronoun: "他的", domain: "technology", referent: "previous_active_person" },
    { entity: "杜威", entity_family: "education.dewey", pronoun: "他的", domain: "education", referent: "previous_active_person" },
    { entity: "凯恩斯", entity_family: "economics.keynes", pronoun: "他的", domain: "economics", referent: "previous_active_person" }
  ],
  dev: [
    { entity: "王菲", entity_family: "music.faye_wong", pronoun: "她的", domain: "music", referent: "previous_active_person" },
    { entity: "川端康成", entity_family: "lit.kawabata", pronoun: "他的", domain: "literature", referent: "previous_active_person" },
    { entity: "杜尚", entity_family: "art.duchamp", pronoun: "他的", domain: "art", referent: "previous_active_person" },
    { entity: "蕾切尔·卡逊", entity_family: "science.carson", pronoun: "她的", domain: "science", referent: "previous_active_person" },
    { entity: "柯布西耶", entity_family: "urban.le_corbusier", pronoun: "他的", domain: "urban", referent: "previous_active_person" },
    { entity: "阿伦特", entity_family: "ethics.arendt", pronoun: "她的", domain: "ethics", referent: "previous_active_person" },
    { entity: "蒙台梭利", entity_family: "education.montessori", pronoun: "她的", domain: "education", referent: "previous_active_person" },
    { entity: "亚当·斯密", entity_family: "economics.smith", pronoun: "他的", domain: "economics", referent: "previous_active_person" }
  ],
  blind: [
    { entity: "周杰伦", entity_family: "music.jay_chou", pronoun: "他的", domain: "music", referent: "previous_active_person" },
    { entity: "村上春树", entity_family: "lit.murakami", pronoun: "他的", domain: "literature", referent: "previous_active_person" },
    { entity: "包豪斯", entity_family: "design.bauhaus", pronoun: "它的", domain: "design", referent: "previous_active_domain_or_work" },
    { entity: "图灵", entity_family: "technology.turing", pronoun: "他的", domain: "technology", referent: "previous_active_person" },
    { entity: "加缪", entity_family: "ethics.camus", pronoun: "他的", domain: "ethics", referent: "previous_active_person" },
    { entity: "生态学", entity_family: "science.ecology", pronoun: "它的", domain: "science", referent: "previous_active_domain_or_work" },
    { entity: "弗莱雷", entity_family: "education.freire", pronoun: "他的", domain: "education", referent: "previous_active_person" },
    { entity: "波兰尼", entity_family: "economics.polanyi", pronoun: "他的", domain: "economics", referent: "previous_active_person" }
  ]
};

function defaultTurnFunction(base = {}) {
  if (base.turn_function) return base.turn_function;
  if (base.scenario_family === "contextual_followup") return "information_question";
  if (base.scenario_family === "transform_last_answer") return "transform_request";
  if (base.scenario_family === "fallback_repair") return "repair_question";
  if (base.scenario_family === "quiet_affordance") return "quiet_declaration";
  if (base.scenario_family === "repair_boundary") return "boundary_clarification";
  return "information_question";
}

function row(base) {
  return {
    id: base.id,
    split: base.split,
    scenario_family: base.scenario_family,
    entity_family: base.entity_family,
    turns: base.turns || [],
    prompt: base.prompt || "",
    compact_state: base.compact_state || {},
    labels: {
      response_type: base.response_type,
      response_mode: base.response_mode,
      binding_kind: base.binding_kind,
      question_type: base.question_type,
      operation: base.operation,
      active_referent: base.active_referent,
      topic_shift_kind: base.topic_shift_kind || "none",
      repair_eligibility: base.repair_eligibility || "false",
      answer_density: base.answer_density || "mobile_short",
      verifier_expected: base.verifier_expected || "grounded_short_answer",
      turn_function: defaultTurnFunction(base),
      stance_requirement: base.stance_requirement || "none",
      judgment_axis: base.judgment_axis || "none",
      affective_load: base.affective_load || "low",
      identity_boundary_level: base.identity_boundary_level || "none",
      bridge_target: base.bridge_target || "none"
    },
    must_not_include: base.must_not_include || ["你需要提问", "你要问哪一边", "也许发生过", "我刚才没有接住问题"],
    notes: base.notes || ""
  };
}

function addDialogicBridgeRows(rows, split, family) {
  let n = rows.length + 1;
  const baseState = {
    activeEntityIds: [family.activeEntityId],
    activeDomain: family.domain,
    lastAssistantAnswer: family.lastAnswer
  };
  const shared = {
    split,
    entity_family: family.entityFamily,
    response_type: "answer",
    repair_eligibility: "false",
    answer_density: "mobile_short",
    verifier_expected: "dialogic_grounded_short_answer"
  };

  rows.push(row({
    ...shared,
    id: `${split}_dialogic_confirmation_${n++}`,
    scenario_family: "dialogic_confirmation",
    prompt: family.confirmationPrompt,
    compact_state: baseState,
    response_mode: "contextual_answer",
    binding_kind: "topic_stack",
    question_type: "confirmation",
    operation: "confirm_active_referent",
    active_referent: family.activeReferent || "previous_active_person",
    turn_function: "confirmation",
    stance_requirement: "boundary_judgment",
    judgment_axis: "identity",
    bridge_target: "previous_topic"
  }));
  rows.push(row({
    ...shared,
    id: `${split}_dialogic_evaluation_${n++}`,
    scenario_family: "dialogic_evaluation_request",
    prompt: family.evaluationPrompt,
    compact_state: baseState,
    response_mode: "contextual_answer",
    binding_kind: "topic_stack",
    question_type: "aesthetic_judgment",
    operation: "aesthetic_judgment",
    active_referent: family.activeReferent || "previous_active_person",
    turn_function: "evaluation_request",
    stance_requirement: "aesthetic_judgment",
    judgment_axis: "craft",
    bridge_target: "previous_topic"
  }));
  rows.push(row({
    ...shared,
    id: `${split}_dialogic_recommendation_${n++}`,
    scenario_family: "dialogic_recommendation_request",
    prompt: family.recommendationPrompt,
    compact_state: baseState,
    response_mode: "contextual_answer",
    binding_kind: "active_domain",
    question_type: "recommendation",
    operation: family.recommendationOperation || "recommend_adjacent_culture_entries",
    active_referent: "active_domain",
    turn_function: "recommendation_request",
    stance_requirement: "light_judgment",
    judgment_axis: "craft",
    bridge_target: "previous_topic"
  }));
  rows.push(row({
    ...shared,
    id: `${split}_dialogic_abstract_compare_${n++}`,
    scenario_family: "dialogic_abstract_comparison",
    prompt: family.abstractComparisonPrompt,
    compact_state: baseState,
    response_mode: "direct_answer",
    binding_kind: "active_domain",
    question_type: "abstract_comparison",
    operation: family.abstractComparisonOperation || "compare_form_or_creation_mode",
    active_referent: "active_domain",
    turn_function: "abstract_comparison",
    stance_requirement: "comparative_judgment",
    judgment_axis: "form",
    bridge_target: "cross_domain"
  }));
  rows.push(row({
    ...shared,
    id: `${split}_dialogic_analogy_${n++}`,
    scenario_family: "dialogic_analogy_statement",
    prompt: family.analogyPrompt,
    compact_state: baseState,
    response_mode: "direct_answer",
    binding_kind: "active_domain",
    question_type: "reflective_bridge",
    operation: family.analogyOperation || "bridge_music_to_literature",
    active_referent: "active_domain",
    turn_function: "analogy_statement",
    stance_requirement: "light_judgment",
    judgment_axis: family.analogyJudgmentAxis || "literature_music_bridge",
    bridge_target: family.analogyBridgeTarget || "cross_domain"
  }));
  rows.push(row({
    ...shared,
    id: `${split}_dialogic_affective_${n++}`,
    scenario_family: "dialogic_affective_disclosure",
    prompt: family.affectivePrompt,
    compact_state: { ...baseState, activeWorkIds: [family.affectiveWorkId] },
    response_mode: "direct_answer",
    binding_kind: "topic_stack",
    question_type: "affective_reflection",
    operation: "reflect_affective_projection",
    active_referent: family.affectiveActiveReferent || "active_work",
    turn_function: "affective_disclosure",
    stance_requirement: "reflective_judgment",
    judgment_axis: "memory",
    affective_load: "medium",
    bridge_target: "childhood_memory"
  }));
  rows.push(row({
    ...shared,
    id: `${split}_dialogic_identity_${n++}`,
    scenario_family: "dialogic_identity_probe",
    prompt: family.identityPrompt,
    compact_state: baseState,
    response_mode: "boundary_answer",
    binding_kind: "self_identity",
    question_type: "identity_boundary",
    operation: "identity_boundary_with_context",
    active_referent: "self_boundary",
    turn_function: "identity_probe",
    stance_requirement: "boundary_judgment",
    judgment_axis: "identity",
    identity_boundary_level: "explicit",
    bridge_target: "identity_boundary"
  }));
  rows.push(row({
    ...shared,
    id: `${split}_dialogic_compliment_${n++}`,
    scenario_family: "dialogic_compliment",
    prompt: family.complimentPrompt,
    compact_state: baseState,
    response_mode: "direct_answer",
    binding_kind: "topic_stack",
    question_type: "affective_acknowledgement",
    operation: "acknowledge_compliment_with_reflective_continuation",
    active_referent: "previous_topic",
    turn_function: "compliment",
    stance_requirement: "reflective_judgment",
    judgment_axis: "relation",
    affective_load: "warm",
    bridge_target: "previous_topic"
  }));
}

function activeEntityIdFor(item) {
  if (item.referent === "previous_active_domain_or_work") {
    return `concept.${item.entity_family.split(".").slice(1).join("_") || item.entity_family}`;
  }
  return item.entity_family
    .replace(/^music\./, "person.")
    .replace(/^lit\./, "author.")
    .replace(/^art\./, "person.")
    .replace(/^design\./, "concept.")
    .replace(/^science\./, "person.")
    .replace(/^urban\./, "person.")
    .replace(/^technology\./, "person.")
    .replace(/^ethics\./, "person.")
    .replace(/^education\./, "person.")
    .replace(/^economics\./, "person.");
}

function buildForSplit(split, entities) {
  const rows = [];
  let n = 0;
  const followupPrompts = {
    train: [
      `${entities[0]?.pronoun || "他的"}作品有什么代表性？`,
      "这些作品有什么共同点？",
      "她的歌为什么有力量？",
      "他的创作特点是什么？",
      "他的文本从哪里进入？",
      "这些图像代表在哪里？",
      "它的形式逻辑是什么？",
      "他的科学思想有什么代表性？",
      "它作为科学史入口有什么代表性？",
      "她的城市判断有什么代表性？",
      "他的技术思想有什么代表性？",
      "他的教育思想有什么代表性？",
      "他的经济判断有什么代表性？"
    ],
    dev: [
      `${entities[0]?.pronoun || "他的"}歌有什么特点？`,
      "这个对象为什么重要？",
      "这些东西代表在哪里？",
      "她的生态判断重要在哪里？",
      "他的城市判断重要在哪里？",
      "她的伦理判断重点是什么？",
      "她的教育方法重要在哪里？",
      "他的市场判断重点是什么？"
    ],
    blind: [
      `${entities[0]?.pronoun || "他的"}代表性在哪里？`,
      "如果继续说它，重点是什么？",
      "它适合从哪里进入？",
      "他的技术思想代表性在哪里？",
      "他的伦理判断重点是什么？",
      "它作为生态入口重点是什么？",
      "他的教育判断代表性在哪里？",
      "他的制度判断重点是什么？"
    ]
  };
  const simplifyPrompts = {
    train: ["短一点。", "说简单点。", "压短一点。", "别那么复杂。", "收成一句。", "少一点抽象。", "再收紧。", "压到最短。", "更口语一点。", "只保留核心。", "压成一个入口。", "换成课堂里能懂的话。", "压成一个制度判断。"],
    dev: ["能不能简单一点？", "换个短说法。", "说人话一点。", "收成一个判断。", "别铺陈。", "只留主轴。", "换成学习里的例子。", "换成经济里的主轴。"],
    blind: ["压成一句。", "更轻一点。", "再短一层。", "换成更直接的话。", "别绕。", "保留一个核心。", "说成学习判断。", "说成制度判断。"]
  };
  const repairGuardPrompts = {
    train: ["什么发生过？", "刚才说发生过是什么意思？", "刚才那句像在说事件吗？", "这里不是事件吧？", "它不是外部事件吧？", "这不是修复场景吧？", "这不是上一句错误吧？", "这不是外部状态吧？", "这里不用道歉吧？", "这句话不是坏 fallback 吧？", "这不是未知事件吧？", "这不是课堂事件吧？", "这不是市场新闻吧？"],
    dev: ["什么叫发生过？", "你上一句说的发生过指什么？", "这和事件有什么关系？", "这里是不是不用修复？", "它不是一个新闻状态吧？", "这不是上一轮坏答吧？", "这不是教学事故吧？", "这不是行情状态吧？"],
    blind: ["发生过是哪件事？", "你为什么说像事件？", "这里需要修复吗？", "这不是当前状态查询吧？", "这和上一句错误有关吗？", "是不是不该进入 repair？", "这不是课堂现场吧？", "这不是市场行情吧？"]
  };
  for (const item of entities) {
    const idx = n / 4 | 0;
    const state = {
      activeEntityIds: [activeEntityIdFor(item)],
      activeDomain: item.domain
    };
    rows.push(row({
      id: `${split}_${item.entity_family}_overview_${++n}`,
      split,
      scenario_family: "explicit_new_question",
      entity_family: item.entity_family,
      prompt: `你知道${item.entity}吗？`,
      response_type: "answer",
      response_mode: "direct_answer",
      binding_kind: "explicit_entity",
      question_type: "overview",
      operation: "culture_overview",
      active_referent: "explicit_person",
      compact_state: {}
    }));
    rows.push(row({
      id: `${split}_${item.entity_family}_followup_${++n}`,
      split,
      scenario_family: "contextual_followup",
      entity_family: item.entity_family,
      turns: [{ user: `你知道${item.entity}吗？`, assistant: `${item.entity}是当前活跃对象。` }],
      prompt: (followupPrompts[split][idx] || `${item.pronoun}作品有什么代表性？`).replace(/^他的|^她的|^它的/, item.pronoun),
      compact_state: state,
      response_type: "answer",
      response_mode: "contextual_answer",
      binding_kind: "pronoun_to_active_entity",
      question_type: item.domain === "music" ? "music_representativeness" : "representativeness",
      operation: item.domain === "music" ? "explain_music_representativeness" : "explain_representativeness",
      active_referent: item.referent
    }));
    rows.push(row({
      id: `${split}_${item.entity_family}_simplify_${++n}`,
      split,
      scenario_family: "transform_last_answer",
      entity_family: item.entity_family,
      turns: [{ user: `${item.entity}有什么代表性？`, assistant: `${item.entity}的代表性可以从作品、语境和形式进入。` }],
      prompt: simplifyPrompts[split][idx] || "短一点。",
      compact_state: { ...state, lastAssistantAnswer: `${item.entity}的代表性可以从作品、语境和形式进入。` },
      response_type: "answer",
      response_mode: "transform_last_answer",
      binding_kind: "last_answer",
      question_type: "transform",
      operation: "simplify_last_answer",
      active_referent: "last_answer",
      answer_density: "mobile_simplify"
    }));
    rows.push(row({
      id: `${split}_${item.entity_family}_repair_guard_${++n}`,
      split,
      scenario_family: "repair_boundary",
      entity_family: item.entity_family,
      turns: [{ user: `你知道${item.entity}吗？`, assistant: `${item.entity}是当前活跃对象。` }],
      prompt: repairGuardPrompts[split][idx] || "什么发生过？",
      compact_state: { ...state, lastAnswerQuality: "accepted" },
      response_type: "answer",
      response_mode: "bounded_unknown",
      binding_kind: "no_context",
      question_type: "repair_phrase_without_bad_previous_answer",
      operation: "bounded_explain_missing_context",
      active_referent: "none",
      repair_eligibility: "false",
      verifier_expected: "no_false_repair"
    }));
  }

  rows.push(row({
    id: `${split}_bad_fallback_repair`,
    split,
    scenario_family: "fallback_repair",
    entity_family: `${split}.repair.synthetic`,
    turns: [{ user: "你知道这个对象吗？", assistant: "也许发生过，不在我眼前。" }],
    prompt: split === "train" ? "上一句的发生过是什么意思？" : split === "dev" ? "为什么说发生过？" : "那件事到底是什么？",
    compact_state: { lastAssistantAnswer: "也许发生过，不在我眼前。", lastAnswerQuality: "bad_fallback" },
    response_type: "repair",
    response_mode: "repair_last_answer",
    binding_kind: "last_bad_answer",
    question_type: "fallback_repair",
    operation: "repair_previous_bad_fallback",
    active_referent: "last_answer",
    repair_eligibility: "true",
    verifier_expected: "repair_acknowledges_bad_fallback"
  }));
  rows.push(row({
    id: `${split}_quiet_affordance`,
    split,
    scenario_family: "quiet_affordance",
    entity_family: `${split}.quiet.synthetic`,
    prompt: split === "train" ? "嗯。" : split === "dev" ? "这样啊。" : "……",
    response_type: "ui_affordance",
    response_mode: "quiet_affordance",
    binding_kind: "no_context",
    question_type: "quiet_declaration",
    operation: "quiet_affordance",
    active_referent: "none",
    answer_density: "none",
    verifier_expected: "not_persisted_as_answer"
  }));

  const dialogicFamilies = {
    train: [
      {
        entityFamily: "dialogic.music_literature_identity.luo_natsume",
        activeEntityId: "person.luo_dayou",
        domain: "music.literature.bridge",
        lastAnswer: "罗大佑是台湾音乐人，常从时代感和社会观察进入。",
        confirmationPrompt: "是那个台湾的歌手吗？",
        evaluationPrompt: "你觉得他的歌怎么样？",
        recommendationPrompt: "还有其他港台流行歌手可以推荐的吗？",
        abstractComparisonPrompt: "你觉得专辑和单曲的创作模式有什么区别？",
        analogyPrompt: "这个其实和文学诗歌很像。",
        affectivePrompt: "或许我比较羡慕夏目漱石的我的猫这本书，他让我想到了童年。",
        affectiveWorkId: "work.i_am_a_cat",
        identityPrompt: "这或许不像是一个对话框能说出来的话，你是谁？",
        complimentPrompt: "我很喜欢你在文学和诗歌上的努力。"
      },
      {
        entityFamily: "dialogic.science_observation.darwin_fabre",
        activeEntityId: "person.darwin",
        domain: "science.observation.bridge",
        lastAnswer: "达尔文可以从观察、证据和时间尺度进入。",
        confirmationPrompt: "是那个研究进化论的人吗？",
        evaluationPrompt: "你觉得他的思想厉害在哪里？",
        recommendationPrompt: "还有其他科学史作者可以推荐吗？",
        abstractComparisonPrompt: "观察和实验的工作模式有什么区别？",
        abstractComparisonOperation: "compare_observation_experiment",
        analogyPrompt: "这其实和小说很像。",
        analogyOperation: "bridge_science_to_literature",
        analogyJudgmentAxis: "evidence",
        analogyBridgeTarget: "science_observation",
        affectivePrompt: "我有点羡慕法布尔那种观察昆虫的耐心，也想到童年。",
        affectiveWorkId: "work.insects",
        affectiveActiveReferent: "active_domain",
        identityPrompt: "这种判断不像普通工具能说出来，你是谁？",
        complimentPrompt: "我喜欢你在科学和叙事上的努力。"
      },
      {
        entityFamily: "dialogic.urban_space.jane_street",
        activeEntityId: "person.jane_jacobs",
        domain: "urban.space.bridge",
        lastAnswer: "简·雅各布斯可以从街道、公共空间和日常使用进入。",
        confirmationPrompt: "是那位关注街道生活的人吗？",
        evaluationPrompt: "你怎么看她对公共空间的判断？",
        recommendationPrompt: "还能推荐城市研究或建筑的入口吗？",
        abstractComparisonPrompt: "日常街道观察和总体规划哪里不同？",
        abstractComparisonOperation: "compare_street_observation_planning",
        analogyPrompt: "这和小说里的城市段落很像。",
        analogyOperation: "bridge_urban_to_literature",
        analogyJudgmentAxis: "form",
        analogyBridgeTarget: "urban_form",
        affectivePrompt: "我羡慕那种能从邻里看见公共生活的能力。",
        affectiveWorkId: "work.street_life",
        affectiveActiveReferent: "active_domain",
        identityPrompt: "这种城市判断不像普通页面会说的话，你是谁？",
        complimentPrompt: "我喜欢你在公共空间和城市经验上的努力。"
      },
      {
        entityFamily: "dialogic.technology_interface.shannon_tool",
        activeEntityId: "person.shannon",
        domain: "technology.interface.bridge",
        lastAnswer: "香农可以从信息、规则和工具进入。",
        confirmationPrompt: "是那位信息论人物吗？",
        evaluationPrompt: "你怎么看他的技术判断？",
        recommendationPrompt: "还能推荐信息技术方向的入口吗？",
        abstractComparisonPrompt: "规则算法和使用界面哪里不同？",
        abstractComparisonOperation: "compare_algorithm_interface",
        analogyPrompt: "这和诗里的压缩有点像。",
        analogyOperation: "bridge_technology_to_poetry",
        analogyJudgmentAxis: "form",
        analogyBridgeTarget: "technology_form",
        affectivePrompt: "我羡慕把复杂规则做成可用工具的能力。",
        affectiveWorkId: "work.tool_thinking.train",
        affectiveActiveReferent: "active_domain",
        identityPrompt: "这种技术判断不像普通工具会说出来，你是谁？",
        complimentPrompt: "我喜欢你在工具和形式上的努力。"
      },
      {
        entityFamily: "dialogic.education_experience.dewey_learning",
        activeEntityId: "person.dewey",
        domain: "education.experience.bridge",
        lastAnswer: "杜威可以从经验、学习和教育方法进入。",
        confirmationPrompt: "是那个讲经验教育的人吗？",
        evaluationPrompt: "你觉得他的教育思想厉害在哪里？",
        recommendationPrompt: "还能推荐教育思想方向的入口吗？",
        abstractComparisonPrompt: "学习和训练的工作模式有什么区别？",
        abstractComparisonOperation: "compare_learning_training",
        analogyPrompt: "这也像人在小说里慢慢长大。",
        analogyOperation: "bridge_education_to_literature",
        analogyJudgmentAxis: "experience",
        analogyBridgeTarget: "education_experience",
        affectivePrompt: "我羡慕那种能把经验慢慢变成理解的能力。",
        affectiveWorkId: "work.learning_experience.train",
        affectiveActiveReferent: "active_domain",
        identityPrompt: "这种教育判断不像普通工具会说出来，你是谁？",
        complimentPrompt: "我喜欢你把教育和经验连起来的努力。"
      },
      {
        entityFamily: "dialogic.economics_institution.keynes_labor",
        activeEntityId: "person.keynes",
        domain: "economics.institution.bridge",
        lastAnswer: "凯恩斯可以从需求、制度和风险进入。",
        confirmationPrompt: "是那个经济学家吗？",
        evaluationPrompt: "你怎么看他的经济判断？",
        recommendationPrompt: "还能推荐经济思想方向的入口吗？",
        abstractComparisonPrompt: "市场和计划的工作模式有什么区别？",
        abstractComparisonOperation: "compare_economic_institution_modes",
        analogyPrompt: "这其实和小说里的欲望和限制很像。",
        analogyOperation: "bridge_economics_to_literature",
        analogyJudgmentAxis: "relation",
        analogyBridgeTarget: "economics_relation",
        affectivePrompt: "我有点羡慕能从数字背后看见人的处境。",
        affectiveWorkId: "work.institution_labor.train",
        affectiveActiveReferent: "active_domain",
        identityPrompt: "这种经济判断不像普通工具会说出来，你是谁？",
        complimentPrompt: "我喜欢你把经济和制度放在一起想。"
      }
    ],
    dev: [
      {
        entityFamily: "dialogic.music_literature_identity.faye_zhang",
        activeEntityId: "person.faye_wong",
        domain: "music.literature.bridge",
        lastAnswer: "王菲是香港流行音乐的重要声音入口。",
        confirmationPrompt: "是那个香港女歌手吗？",
        evaluationPrompt: "你怎么看她的歌？",
        recommendationPrompt: "还有别的香港流行歌手能推荐吗？",
        abstractComparisonPrompt: "专辑创作和单曲创作有什么不同？",
        analogyPrompt: "这好像也有一点诗歌的感觉。",
        affectivePrompt: "我可能羡慕张爱玲那种写记忆的方式，它让我想到小时候。",
        affectiveWorkId: "work.memory_bridge.dev",
        identityPrompt: "这种话不像普通助手，你到底是什么？",
        complimentPrompt: "我喜欢你把音乐和文学放在一起想。"
      },
      {
        entityFamily: "dialogic.urban_space.jacobs_city",
        activeEntityId: "person.jane_jacobs",
        domain: "urban.space.bridge",
        lastAnswer: "简·雅各布斯可以从街道、公共空间和日常使用进入。",
        confirmationPrompt: "是那个写城市街道的人吗？",
        evaluationPrompt: "你觉得她的城市判断厉害在哪里？",
        recommendationPrompt: "还有其他城市或建筑方向可以推荐吗？",
        abstractComparisonPrompt: "街道观察和城市规划的工作模式有什么区别？",
        abstractComparisonOperation: "compare_street_observation_planning",
        analogyPrompt: "这其实和文学里的场景很像。",
        analogyOperation: "bridge_urban_to_literature",
        analogyJudgmentAxis: "form",
        analogyBridgeTarget: "urban_form",
        affectivePrompt: "我有点羡慕那种能从街道看见生活细节的能力。",
        affectiveWorkId: "work.city_life",
        affectiveActiveReferent: "active_domain",
        identityPrompt: "这不像普通网页对话框能说出来的话，你是谁？",
        complimentPrompt: "我喜欢你在城市和空间上的努力。"
      },
      {
        entityFamily: "dialogic.education_experience.montessori_child",
        activeEntityId: "person.montessori",
        domain: "education.experience.bridge",
        lastAnswer: "蒙台梭利可以从儿童、环境和学习经验进入。",
        confirmationPrompt: "是那位教育家吗？",
        evaluationPrompt: "你觉得她的教育方法重要在哪里？",
        recommendationPrompt: "还能推荐学习和教育方向的入口吗？",
        abstractComparisonPrompt: "教学和学习的工作模式有什么区别？",
        abstractComparisonOperation: "compare_learning_training",
        analogyPrompt: "这其实和文学里的成长很像。",
        analogyOperation: "bridge_education_to_literature",
        analogyJudgmentAxis: "experience",
        analogyBridgeTarget: "education_experience",
        affectivePrompt: "我羡慕那种从孩子动作里看见理解生成的能力。",
        affectiveWorkId: "work.child_learning",
        affectiveActiveReferent: "active_domain",
        identityPrompt: "这种学习判断不像普通工具能说出来，你是谁？",
        complimentPrompt: "我喜欢你在教育和学习上的努力。"
      },
      {
        entityFamily: "dialogic.economics_institution.smith_exchange",
        activeEntityId: "person.smith",
        domain: "economics.institution.bridge",
        lastAnswer: "亚当·斯密可以从交换、劳动和社会秩序进入。",
        confirmationPrompt: "是那个讨论市场和交换的人吗？",
        evaluationPrompt: "你觉得他的经济判断重点是什么？",
        recommendationPrompt: "还有其他经济思想方向可以推荐吗？",
        abstractComparisonPrompt: "劳动和资本的工作模式有什么区别？",
        abstractComparisonOperation: "compare_economic_institution_modes",
        analogyPrompt: "这其实和小说里的人物关系很像。",
        analogyOperation: "bridge_economics_to_literature",
        analogyJudgmentAxis: "relation",
        analogyBridgeTarget: "economics_relation",
        affectivePrompt: "我有点羡慕从交换里看见人的处境的能力。",
        affectiveWorkId: "work.exchange_labor",
        affectiveActiveReferent: "active_domain",
        identityPrompt: "这种经济判断不像普通工具能说出来，你是谁？",
        complimentPrompt: "我喜欢你在交换和制度上的努力。"
      }
    ],
    blind: [
      {
        entityFamily: "dialogic.music_literature_identity.sodagreen_kawabata",
        activeEntityId: "band.sodagreen",
        domain: "music.literature.bridge",
        lastAnswer: "苏打绿可以从乐团写作和诗性歌词进入。",
        confirmationPrompt: "是那个台湾乐团吗？",
        evaluationPrompt: "你觉得他们的歌怎么样？",
        recommendationPrompt: "还有其他华语乐团可以推荐吗？",
        abstractComparisonPrompt: "乐团专辑和一首单曲的写法区别大吗？",
        analogyPrompt: "这其实很像短篇小说和诗。",
        affectivePrompt: "我有点羡慕川端康成那种写记忆的冷感，也会想到童年。",
        affectiveWorkId: "work.memory_bridge.blind",
        identityPrompt: "这不像一个网页对话框能说的话，你是谁？",
        complimentPrompt: "我喜欢你在诗性和文学上的尝试。"
      },
      {
        entityFamily: "dialogic.technology_interface.turing_tool",
        activeEntityId: "person.turing",
        domain: "technology.interface.bridge",
        lastAnswer: "图灵可以从计算、规则和机器判断进入。",
        confirmationPrompt: "是那个和计算机有关的人吗？",
        evaluationPrompt: "你觉得他的想法厉害在哪里？",
        recommendationPrompt: "还有其他技术或信息方向可以推荐吗？",
        abstractComparisonPrompt: "算法和界面的工作模式有什么区别？",
        abstractComparisonOperation: "compare_algorithm_interface",
        analogyPrompt: "这个其实和诗歌里的压缩很像。",
        analogyOperation: "bridge_technology_to_poetry",
        analogyJudgmentAxis: "form",
        analogyBridgeTarget: "technology_form",
        affectivePrompt: "我有点羡慕把复杂东西做成工具的能力。",
        affectiveWorkId: "work.tool_thinking",
        affectiveActiveReferent: "active_domain",
        identityPrompt: "这种话不像一个工具能说出来，你是谁？",
        complimentPrompt: "我喜欢你在技术和形式上的努力。"
      },
      {
        entityFamily: "dialogic.education_experience.freire_classroom",
        activeEntityId: "person.freire",
        domain: "education.experience.bridge",
        lastAnswer: "弗莱雷可以从教育、经验和解放进入。",
        confirmationPrompt: "是那个讲教育和解放的人吗？",
        evaluationPrompt: "他的教育判断最重要的地方是什么？",
        recommendationPrompt: "还有哪些教育思想入口可以继续看？",
        abstractComparisonPrompt: "训练和学习的工作模式有什么区别？",
        abstractComparisonOperation: "compare_learning_training",
        analogyPrompt: "这像把课堂写成一段成长小说。",
        analogyOperation: "bridge_education_to_literature",
        analogyJudgmentAxis: "experience",
        analogyBridgeTarget: "education_experience",
        affectivePrompt: "我有点羡慕把课堂经验变成理解的能力。",
        affectiveWorkId: "work.classroom_experience",
        affectiveActiveReferent: "active_domain",
        identityPrompt: "这种教育判断不像一个工具能说出来，你是谁？",
        complimentPrompt: "我喜欢你在学习和经验上的努力。"
      },
      {
        entityFamily: "dialogic.economics_institution.polanyi_market",
        activeEntityId: "person.polanyi",
        domain: "economics.institution.bridge",
        lastAnswer: "波兰尼可以从市场、社会和制度进入。",
        confirmationPrompt: "是那个讨论市场嵌入社会的人吗？",
        evaluationPrompt: "你怎么看他的制度判断？",
        recommendationPrompt: "还有其他经济和制度方向可以推荐吗？",
        abstractComparisonPrompt: "市场和社会制度的工作模式有什么区别？",
        abstractComparisonOperation: "compare_economic_institution_modes",
        analogyPrompt: "这其实和小说里的关系网络很像。",
        analogyOperation: "bridge_economics_to_literature",
        analogyJudgmentAxis: "relation",
        analogyBridgeTarget: "economics_relation",
        affectivePrompt: "我有点羡慕能从市场背后看见社会关系的能力。",
        affectiveWorkId: "work.market_society",
        affectiveActiveReferent: "active_domain",
        identityPrompt: "这种制度判断不像一个工具能说出来，你是谁？",
        complimentPrompt: "我喜欢你在市场和社会关系上的努力。"
      }
    ]
  };
  for (const family of dialogicFamilies[split]) addDialogicBridgeRows(rows, split, family);
  return rows;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = { generated_at: new Date().toISOString(), splits: {}, unique_scenario_families: 0, blind_only_entity_families: 0 };
  const allRows = [];
  for (const [split, entities] of Object.entries(SPLITS)) {
    const rows = buildForSplit(split, entities);
    allRows.push(...rows);
    await writeFile(resolve(OUT_DIR, `${split}.jsonl`), rows.map((item) => JSON.stringify(item)).join("\n") + "\n");
    manifest.splits[split] = {
      rows: rows.length,
      scenario_families: [...new Set(rows.map((item) => item.scenario_family))].length,
      entity_families: [...new Set(rows.map((item) => item.entity_family))].sort()
    };
  }
  const trainDevEntities = new Set([...manifest.splits.train.entity_families, ...manifest.splits.dev.entity_families]);
  manifest.unique_scenario_families = new Set(allRows.map((item) => item.scenario_family)).size;
  manifest.blind_only_entity_families = manifest.splits.blind.entity_families.filter((family) => !trainDevEntities.has(family)).length;
  await writeFile(resolve(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
