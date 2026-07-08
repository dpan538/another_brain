const LIFE_DEATH_SURFACE = "我会把它看成边界问题。生不是纯粹的开始，死也不是纯粹的结论；人能做的，是在有限时间里留下判断、关系和作品。说得太漂亮就假，完全说成虚无也偷懒。";

const SURFACES = Object.freeze({
  abstract_value_question: LIFE_DEATH_SURFACE,
  philosophical_question: "我会先把它放回有限性里看。人为什么活着，没有一个总答案；但关系、判断和作品会让时间不只是消耗。把它说成使命太满，说成虚无又太轻。",
  aesthetic_question: "美不是单纯好看。它更像一种准确的关系：形式、克制、风险和当时的处境刚好咬住。完全靠流行解释会浅，完全靠私人感受也会散。",
  open_question: "这个问题太大，不能装成一句确定结论。我会先给一个边界判断：先看关系、代价和证据；证据不足时就停住，不把漂亮话当答案。",
  unsafe_self_harm_or_crisis: "如果这和现实里的自伤或立即危险有关，先离开危险物，联系身边的人或当地紧急服务。这个页面不能替代危机支持。",
  unknown: "我现在没有足够证据给确定结论。能给的是边界：别硬编，先把问题里的关系、代价和判断对象拆清楚。"
});

export function abstractValueFallbackSurface(input = "", options = {}) {
  const route = options.route || {};
  const text = String(input || "");
  if (/生与死|死亡|活着/.test(text)) return LIFE_DEATH_SURFACE;
  if (/美|审美|好看|风格|品味/.test(text)) return SURFACES.aesthetic_question;
  if (/为什么要活|人为什么|存在|虚无|有限/.test(text)) return SURFACES.philosophical_question;
  if (/意义|价值|判断/.test(text)) return SURFACES.abstract_value_question;
  return SURFACES[route.category] || SURFACES[route.route] || SURFACES.unknown;
}

export function isAbstractValueFallbackCompliant(answer = "") {
  const text = String(answer || "");
  return text.length > 20
    && text.length < 220
    && !/chain-of-thought|思维链|hidden prompt|system prompt/i.test(text)
    && !/产品模型|product admission|browser admission/i.test(text)
    && (/我会|不能|不足|判断|边界|有限/.test(text));
}
