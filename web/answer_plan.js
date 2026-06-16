function compact(value) {
  return String(value || "").trim();
}

export function makeAnswerPlan({
  domain = "",
  questionType = "",
  operation = "",
  responseMode = "",
  answerStyle = "",
  boundTargets = [],
  evidenceIds = [],
  mobileDensity = {}
} = {}) {
  const targets = Array.isArray(boundTargets) ? boundTargets.filter(Boolean) : [];
  const target = targets[0] || "unknown";
  const semantic_signature = [target, questionType || operation || "answer", operation || responseMode || ""].filter(Boolean).join("|");
  const plan = {
    plan_id: `${answerStyle || "answer"}.${questionType || operation || "general"}`,
    semantic_signature,
    required_slots: [],
    optional_slots: [],
    max_sentences: mobileDensity.max_sentences || 2,
    max_chars: mobileDensity.max_chars_zh || mobileDensity.max_chars || 110,
    anchors: [],
    avoid_phrases: [],
    variation_strategy: "",
    evidence_ids: Array.isArray(evidenceIds) ? evidenceIds.slice(0, 8) : []
  };

  if (target === "person.luo_dayou" && /music_representativeness|music_characteristics|explain_music_representativeness/.test(`${questionType} ${operation}`)) {
    return {
      ...plan,
      plan_id: "music_representativeness_short",
      semantic_signature: "person.luo_dayou|music_characteristics|representativeness",
      required_slots: ["themes", "representative_works"],
      optional_slots: ["童年", "鹿港小镇", "恋曲1990"],
      anchors: ["青春记忆", "城市/乡土变化", "社会观察"],
      avoid_phrases: ["改变观看、阅读或判断关系", "观看关系", "阅读关系", "图像关系"],
      variation_strategy: "compact_restatement_with_entry_anchors"
    };
  }

  if (compact(responseMode).includes("transform")) {
    return {
      ...plan,
      plan_id: "last_answer_transform",
      semantic_signature: `last_answer|${operation || questionType || "transform"}`,
      required_slots: ["last_answer_core"],
      variation_strategy: "compress_without_apology"
    };
  }

  return plan;
}
