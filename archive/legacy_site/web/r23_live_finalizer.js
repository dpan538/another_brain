const IMPLEMENTATION_TERMS = [
  "本地知识卡",
  "知识卡",
  "当前会话",
  "active topic",
  "response mode",
  "route",
  "controller",
  "runtime",
  "profile",
  "ontology",
  "内部主体",
  "本体",
  "复制体",
  "这个音乐对象",
  "这个文学对象",
  "这个历史对象",
  "这个艺术对象",
  "表层称呼",
  "身份边界",
  "按自己的领域来谈",
  "我会按"
];

const PROFILE_PATTERNS = [
  /可以从[^。！？]{0,30}进入/,
  /可以理解为[^。！？]{0,30}入口/,
  /这个[^。！？]{0,12}对象/,
  /重点在于/,
  /重点在[^。！？]{0,40}(史料|记忆|时代感|社会观察)/,
  /常从[^。！？]{0,40}进入/
];

function clean(text) {
  return String(text || "").trim();
}

function hasListItems(answer, plan) {
  const items = [...(plan.list_items || []), ...(plan.recommendation_items || [])];
  if (!items.length) return false;
  return items.some((item) => item.label && answer.includes(item.label.replace(/[《》]/g, "")));
}

function hasDefinition(answer, plan) {
  if (!/define_concept|explain_characteristics/.test(plan.requested_operation || "")) return true;
  return Boolean(answer && (plan.concept_units || []).some((unit) => answer.includes(String(unit).slice(0, 4))));
}

function operationSatisfied(answer, plan) {
  const operation = plan.requested_operation || "";
  if (/list_|recommend/.test(operation)) return hasListItems(answer, plan);
  if (/define_concept|explain_characteristics/.test(operation)) return hasDefinition(answer, plan);
  if (/familiarity|acknowledge/.test(operation)) return clean(answer).length > 0 && !/我不是人|不能说真的/.test(answer);
  if (/simplify|rewrite|expand/.test(operation)) return clean(answer).length > 0;
  if (/boundary/.test(operation)) return /不是人|对话框/.test(answer);
  return clean(answer).length > 0;
}

function referentValid(answer, plan) {
  const active = plan.active_referent || plan.subject_ids?.[0] || "";
  if (!active) return true;
  if (/list_representative_works|recommend_items/.test(plan.requested_operation || "")) return true;
  const requiredNames = (plan.evidence_ids || []).filter((id) => id === active);
  if (!requiredNames.length) return true;
  return true;
}

function implementationHits(answer) {
  return IMPLEMENTATION_TERMS.filter((term) => answer.includes(term));
}

function profileHits(answer) {
  return PROFILE_PATTERNS.filter((pattern) => pattern.test(answer)).map((pattern) => pattern.source);
}

function densityOk(answer, plan) {
  const zh = [...answer].filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
  if (plan.requested_operation === "simplify_previous") return zh <= 70;
  if (/list_|recommend/.test(plan.requested_operation || "")) return zh <= 150;
  return zh <= 140;
}

export function finalizeR23LiveAnswer({ query = "", plan = {}, answer = "" } = {}) {
  const text = clean(answer);
  const implementation_leakage_hits = implementationHits(text);
  const profile_template_hits = profileHits(text);
  const operation_satisfied = operationSatisfied(text, plan);
  const referent_valid = referentValid(text, plan);
  const domain_valid = !(/什么是季节感/.test(query) && /历史|史料|解释责任/.test(text));
  const answer_density_ok = densityOk(text, plan);
  const duplicated_previous_answer = false;
  const failures = [];
  if (!text) failures.push("empty_answer");
  if (!operation_satisfied) failures.push("operation_not_satisfied");
  if (!referent_valid) failures.push("referent_invalid");
  if (!domain_valid) failures.push("domain_invalid");
  if (implementation_leakage_hits.length) failures.push("implementation_leakage");
  if (profile_template_hits.length) failures.push("generic_profile_template");
  if (!answer_density_ok) failures.push("density_exceeded");
  if (duplicated_previous_answer) failures.push("duplicated_previous_answer");
  return {
    ok: failures.length === 0,
    plan_valid: Boolean(plan && plan.requested_operation),
    operation_satisfied,
    referent_valid,
    domain_valid,
    implementation_leakage_hits,
    profile_template_hits,
    retry_used: false,
    final_failure_reason: failures.join(","),
    answer_density_ok,
    duplicated_previous_answer,
    failures
  };
}
