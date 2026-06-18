import { cardNameForR23 } from "./r23_content_plan.js";

function clean(text) {
  return String(text || "").trim();
}

function sentence(text) {
  const value = clean(text).replace(/\//g, "和");
  if (!value) return "";
  return /[。！？?]$/.test(value) ? value : `${value}。`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function joinItems(items = []) {
  return items.map((item) => item.label || item).filter(Boolean).join("、");
}

function joinPeopleWithWorks(items = []) {
  return items
    .map((item) => {
      if (!item?.label) return "";
      return item.work_label ? `${item.label}${item.work_label}` : item.label;
    })
    .filter(Boolean)
    .join("、");
}

function subjectName(plan = {}) {
  return cardNameForR23(plan.subject_ids?.[0] || plan.active_referent || "") || "";
}

function compactFact(plan = {}) {
  return clean(plan.factual_units?.[0] || "");
}

function firstConcepts(plan = {}, count = 3) {
  return unique(plan.concept_units || [])
    .filter((item) => !/^[a-z_]+$/.test(item))
    .slice(0, count);
}

function firstRelations(plan = {}, count = 2) {
  return unique(plan.relation_units || [])
    .filter((item) => !/^[a-z_]+$/.test(item))
    .slice(0, count);
}

function realizeFamiliarity(plan) {
  const name = subjectName(plan);
  const fact = compactFact(plan);
  if (!name && !fact) return "";
  if (plan.response_act === "state_boundary") return "我不是人；可以按你给出的对象和文本继续分析。";
  if (name && fact) return `知道。${name}${fact.startsWith(name) ? fact.slice(name.length) : `：${fact}`}。`.replace(/。。/g, "。");
  return `知道。${fact}`;
}

function realizeConfirmation(plan) {
  const name = subjectName(plan);
  if (!name) return "";
  const fact = compactFact(plan);
  const short = fact ? fact.replace(/^.*?，/, "").replace(/。$/, "") : "";
  return short ? `是，指的是${name}：${short}。` : `是，指的是${name}。`;
}

function realizeListWorks(plan) {
  const items = plan.list_items || [];
  if (!items.length) return "";
  const name = subjectName(plan);
  const prefix = name ? `${name}的代表作：` : "代表作：";
  return `${prefix}${joinItems(items)}。`;
}

function realizeListPeople(plan) {
  const items = plan.list_items || [];
  if (!items.length) return "";
  const joined = items.some((item) => item.work_label) ? joinPeopleWithWorks(items.slice(0, 3)) : joinItems(items.slice(0, 3));
  return `三个入口：${joined}。`;
}

function realizeDefinition(plan) {
  if (plan.requested_operation === "explain_characteristics") {
    const name = subjectName(plan);
    const concepts = firstConcepts(plan, 4);
    if (name && concepts.length) return sentence(`${name}的特点可以先抓：${concepts.join("、")}`);
    if (concepts.length) return sentence(`特点可以先抓：${concepts.join("、")}`);
  }
  if (plan.response_act === "define_concept" && plan.concept_units?.length) {
    const units = plan.concept_units.slice(0, 2);
    const domainHint = /literature|poetry/.test(plan.domain || "") ? "在文学里，" : "";
    return sentence(`${domainHint}${units.join("；")}`);
  }
  const name = subjectName(plan);
  const concepts = firstConcepts(plan, 4);
  if (name && concepts.length) return sentence(`${name}的特点可以先抓${concepts.join("、")}`);
  const fact = compactFact(plan);
  return fact ? sentence(fact) : "";
}

function realizeEvaluation(plan) {
  if ((plan.relation_units || []).includes("childhood_to_shared_memory")) {
    return "不只是童年本身。它更像借校园和日常，写时间过去后留下的共同记忆。";
  }
  const name = subjectName(plan);
  const concepts = firstConcepts(plan, 2);
  const relations = firstRelations(plan, 1);
  if (name && (concepts.length || relations.length)) {
    const axis = [...concepts, ...relations].slice(0, 2).join("、");
    if (String(plan.domain || "").startsWith("music")) return sentence(`${name}的好处在于${axis}，能把个人感受和时代背景放在一起`);
    return sentence(`${name}的好处在于${axis}`);
  }
  return "";
}

function realizeRecommendation(plan) {
  const items = plan.recommendation_items || [];
  if (!items.length) return "";
  const pairs = items.slice(0, 4).map((item) => (item.criterion ? `${item.label}看${item.criterion}` : item.label));
  return `可以先听：${pairs.join("，")}。`;
}

function realizeComparison(plan) {
  const text = clean(plan.factual_units?.[0] || "");
  const contrast = clean(plan.contrast_units?.[0] || "");
  if (text && contrast) return sentence(`${text}；差别在${contrast}`);
  if (text) return sentence(text);
  const concepts = firstConcepts(plan, 2);
  if (concepts.length >= 2) return `差别先看${concepts[0]}和${concepts[1]}。`;
  return "";
}

function realizeAnalogy(plan) {
  const fact = clean(plan.factual_units?.[0] || "");
  if (fact) return sentence(`是，${fact}`);
  const concepts = firstConcepts(plan, 2);
  const relations = firstRelations(plan, 2);
  const axes = [...concepts, ...relations].slice(0, 2);
  if (axes.length) return `是，像在同一处发力：${axes.join("和")}。`;
  return "是，像在用很短的形式压住情绪和判断。";
}

function realizeAffective(plan) {
  const name = subjectName(plan);
  const concepts = firstConcepts(plan, 1);
  if (name && concepts.length) return `这个联想很轻，但不空：${name}把${concepts[0]}变成了可回头看的东西。`;
  return "这个联想很轻，但不空：它把经验变成了可回头看的东西。";
}

function realizeCompliment(plan) {
  const concepts = firstConcepts(plan, 2);
  if (concepts.length) return `我也喜欢这样看：${concepts.join("和")}会把话说得更准。`;
  return "我也喜欢这样看：作品、形式和感受会互相照亮。";
}

function realizeDeepening(plan) {
  const name = subjectName(plan);
  const concepts = firstConcepts(plan, 2);
  if (name && concepts.length) return `${name}怎样把${concepts[0]}变成别人也能认出的经验？`;
  if (concepts.length >= 2) return `${concepts[0]}和${concepts[1]}什么时候会互相改变？`;
  return "一个作品什么时候不只是表达自己，而是改变别人理解经验的方式？";
}

function realizeRelation(plan, query = "") {
  if (plan.uncertainty === "no_direct_factual_relation") return "没有直接事实关系；如果它出现在前文，只能算一次跑偏的联想。";
  const name = subjectName(plan);
  const relations = firstRelations(plan, 2);
  if (name && relations.length) return `${name}和这里的关系，先看${relations.join("、")}。`;
  return "";
}

function realizeBoundary(plan) {
  return "我是对话框，不是人；能做的是沿着你给出的文本、作品和关系继续判断。";
}

function realizeTransform(plan) {
  const items = plan.list_items || [];
  if (plan.requested_operation === "simplify_previous") {
    if (items.length) return `简单说：先抓${joinItems(items.slice(0, 3))}。`;
    const concepts = firstConcepts(plan, 2);
    if (concepts.length) return `简单说：重点是${concepts.join("、")}。`;
    return clean(plan.factual_units?.[0] || "");
  }
  if (plan.requested_operation === "rewrite_previous") {
    if (items.length) return `换句话说，先看这几个：${joinItems(items.slice(0, 4))}。`;
    const concepts = firstConcepts(plan, 3);
    if (concepts.length) return `换句话说，先抓${concepts.join("、")}。`;
    return clean(plan.factual_units?.[0] || "");
  }
  const fact = clean(plan.factual_units?.[0] || "");
  const concepts = firstConcepts(plan, 3);
  return [fact, concepts.length ? `可以再看${concepts.join("、")}。` : ""].filter(Boolean).join("");
}

export function realizeR23Surface({ plan, query = "" } = {}) {
  if (!plan) return { answer: "", realization_shape: "", content_units_used: [], warnings: ["missing_plan"] };
  let answer = "";
  switch (plan.response_act) {
    case "acknowledge_familiarity":
      answer = plan.requested_operation === "confirm_referent" ? realizeConfirmation(plan) : realizeFamiliarity(plan);
      break;
    case "list_works":
      answer = realizeListWorks(plan);
      break;
    case "list_people":
      answer = realizeListPeople(plan);
      break;
    case "define_concept":
      answer = realizeDefinition(plan);
      break;
    case "evaluate_bounded":
      answer = realizeEvaluation(plan);
      break;
    case "recommend_items":
      answer = realizeRecommendation(plan);
      break;
    case "compare_forms":
      answer = realizeComparison(plan);
      break;
    case "respond_to_analogy":
      answer = realizeAnalogy(plan);
      break;
    case "respond_to_affective_disclosure":
      answer = realizeAffective(plan);
      break;
    case "acknowledge_compliment":
      answer = realizeCompliment(plan);
      break;
    case "ask_deepening_question":
      answer = realizeDeepening(plan);
      break;
    case "explain_relation":
      answer = realizeRelation(plan, query);
      break;
    case "state_boundary":
      answer = realizeBoundary(plan);
      break;
    case "transform_previous_answer":
      answer = realizeTransform(plan);
      break;
    default:
      answer = realizeDefinition(plan) || realizeFamiliarity(plan);
  }
  const content_units_used = [
    ...(plan.factual_units || []).slice(0, 2),
    ...(plan.concept_units || []).slice(0, 4),
    ...(plan.relation_units || []).slice(0, 3),
    ...(plan.list_items || []).map((item) => item.id),
    ...(plan.recommendation_items || []).map((item) => item.id)
  ].filter(Boolean);
  return {
    answer: clean(answer).replace(/\s+/g, " "),
    realization_shape: plan.answer_shape || "",
    content_units_used,
    warnings: answer ? [] : ["empty_realization"]
  };
}
