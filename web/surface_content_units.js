const NEGATION_PATTERN = /不|不是|不能|不可|没有|无|并非|别|禁止|不得|不该/;
const UNCERTAINTY_PATTERN = /也许|可能|不确定|看情况|需要看|取决于|未必|似乎|大概|没有足够|无法确认|不能确认/;
const BOUNDARY_PATTERN = /隐私|私人|版权|完整歌词|全文|身份证|证件|手机号|账号|地址|银行卡|法律|医疗|金融|自伤|伤害|来源|辖区|日期|程序|边界|不能给|不该说|不声称/;
const RELATION_PATTERN = /像|相似|关系|关联|桥|对照|区别|差别|共同|变成|连|连接|组织|保存|压缩|承担/;
const CONFIRMATION_PATTERN = /^是($|[的。，,；]|[^不无没未])|^对[。；，,]|^可以|^能注意到|^知道/;
const SIGNIFICANT_QUANTITY_PATTERN =
  /\d+(?:个|位|条|项|次|轮|句|段|年|世纪|年代|入口)?|[二三四五六七八九十百千万亿两]+(?:个|位|条|项|次|轮|句|段|年|世纪|年代|入口)?|一(?:个|位|条|项|次|轮|句|段|年|世纪|年代|入口)/g;

function textOf(value) {
  return String(value || "").trim();
}

function unique(items = []) {
  return [...new Set(items.map((item) => textOf(item)).filter(Boolean))];
}

function zhNamedChunks(text = "") {
  const chunks = [];
  const source = textOf(text);
  const quoted = [...source.matchAll(/《([^》]{1,24})》/g)].map((match) => match[1]);
  chunks.push(...quoted);
  const latinNames = [...source.matchAll(/[A-Z][A-Za-z0-9_.-]{1,40}/g)].map((match) => match[0]);
  const namedBeforePossessive = [...source.matchAll(/([\u4e00-\u9fff]{2,4})(?=的(?:歌|歌曲|作品|电影|小说|书|音乐|声音|专辑|单曲))/g)].map(
    (match) => match[1]
  );
  const namedBeforeAbstractPossessive = [
    ...source.matchAll(/([\u4e00-\u9fff]{2,5})(?=的(?:力量|重点|特点|代表性|风格|创作|叙事|镜头|声音|写法|问题))/g)
  ].map((match) => match[1]);
  const leadingActingName = [
    ...source.matchAll(/^([\u4e00-\u9fff]{2,5})(?=(?:重视|认为|强调|写|讲|拍|唱|导演|组织|保存|压缩|适用|解释))/g)
  ].map((match) => match[1]);
  const namedBeforeQuote = [...source.matchAll(/([\u4e00-\u9fff]{2,4})(?=《)/g)].map((match) => match[1]);
  const namedAsRole = [
    ...source.matchAll(/([\u4e00-\u9fff]{2,4})(?=是(?:台湾|日本|中国|香港|华语|美国|英国|法国)?(?:音乐人|作家|导演|歌手|小说家|诗人))/g)
  ].map((match) => match[1]);
  const domainChunks = [
    ...source.matchAll(
      /(?:日本|台湾|中国|香港|华语|现代|古典|当代|东亚|亚洲)?(?:文学|音乐|电影|法律|戏剧|诗歌|小说|饮食|心理学|经济|金融|教育|历史|语言|技术|伦理|记忆|童年)/g
    )
  ].map((match) => match[0]);
  const recommendationList = [];
  for (const match of source.matchAll(/(?:听|推荐|列举|列|包括|比如)(?:[\u4e00-\u9fff]{0,8}[：:])?([\u4e00-\u9fffA-Za-z0-9《》、，,和与]{2,80})/g)) {
    const listText = match[1].replace(/[《》]/g, "");
    for (const item of listText.split(/[、，,和与]/)) {
      const trimmed = item.trim();
      if (/^[\u4e00-\u9fff]{2,5}$/.test(trimmed) || /^[A-Z][A-Za-z0-9_.-]{1,40}$/.test(trimmed)) {
        recommendationList.push(trimmed);
      }
    }
  }
  chunks.push(
    ...latinNames,
    ...namedBeforePossessive,
    ...namedBeforeAbstractPossessive,
    ...leadingActingName,
    ...namedBeforeQuote,
    ...namedAsRole,
    ...recommendationList,
    ...domainChunks
  );
  return unique(chunks).slice(0, 24);
}

function significantQuantities(text = "") {
  return unique(textOf(text).match(SIGNIFICANT_QUANTITY_PATTERN) || []);
}

function splitClaims(text = "") {
  return unique(
    textOf(text)
      .split(/[。！？!?；;]/)
      .map((item) => item.replace(/^[：:，,\s]+|[：:，,\s]+$/g, ""))
      .filter((item) => item.length >= 2)
  ).slice(0, 12);
}

function extractRelationIds(text = "") {
  const source = textOf(text);
  const out = [];
  if (/诗|文学|小说/.test(source) && /音乐|歌|节奏|意象/.test(source)) out.push("music_literature_bridge");
  if (/舞台|戏剧/.test(source) && /细节|冲突|场面/.test(source)) out.push("theater_detail_conflict");
  if (/电影|镜头/.test(source) && /城市|空间/.test(source)) out.push("film_city_space");
  if (/法律|规则/.test(source) && /文学|解释|冲突/.test(source)) out.push("law_literature_interpretation");
  if (/饮食|味道|菜/.test(source) && /记忆|地方|文学/.test(source)) out.push("food_memory_bridge");
  if (RELATION_PATTERN.test(source)) out.push("generic_relation_claim");
  return unique(out);
}

function inferPolarity(text = "") {
  const source = textOf(text);
  if (UNCERTAINTY_PATTERN.test(source)) return "uncertain";
  if (NEGATION_PATTERN.test(source)) return "negative";
  if (CONFIRMATION_PATTERN.test(source)) return "affirmative";
  return "neutral";
}

function requiredUnits({ text = "", plan = {}, binding = {}, responseType = "", responseMode = "", activeReferent = "" } = {}) {
  const source = textOf(text);
  const required = [];
  if (activeReferent) required.push(activeReferent);
  if (Array.isArray(binding?.target_ids)) required.push(...binding.target_ids);
  if (Array.isArray(plan?.required_slots)) required.push(...plan.required_slots);
  if (BOUNDARY_PATTERN.test(source) || /boundary|privacy|copyright|source/.test(`${responseType} ${responseMode}`)) {
    required.push("boundary_strength");
  }
  if (UNCERTAINTY_PATTERN.test(source)) required.push("uncertainty_level");
  const names = zhNamedChunks(source);
  const hardNames = names.filter((item) => !/^(?:日本|台湾|中国|香港|华语|现代|古典|当代|东亚|亚洲)?(?:文学|音乐|电影|法律|戏剧|诗歌|小说|饮食|心理学|经济|金融|教育|历史|语言|技术|伦理|记忆|童年)$/.test(item));
  required.push(...hardNames.slice(0, 6));
  return unique(required);
}

export function extractSurfaceContentUnits({
  answer = "",
  query = "",
  plan = {},
  binding = {},
  responseType = "",
  responseMode = "",
  activeReferent = "",
  evidenceIds = []
} = {}) {
  const text = textOf(answer);
  const q = textOf(query);
  const namedItems = zhNamedChunks(text);
  const queryNamedItems = zhNamedChunks(q);
  const entities = unique([
    activeReferent,
    ...(Array.isArray(binding?.target_ids) ? binding.target_ids : []),
    ...namedItems.filter((item) => !/文学|音乐|电影|法律|戏剧|诗歌|小说|记忆|童年/.test(item))
  ]);
  const uncertaintyMarkers = unique((text.match(UNCERTAINTY_PATTERN) || []).map(String));
  const boundaryRequirements = BOUNDARY_PATTERN.test(text)
    ? unique((text.match(BOUNDARY_PATTERN) || []).map(String)).concat(["boundary_strength"])
    : [];
  const polarity = inferPolarity(text);
  const claims = splitClaims(text);
  const relationIds = extractRelationIds(text);
  const required = requiredUnits({ text, plan, binding, responseType, responseMode, activeReferent });
  const optional = claims.filter((claim) => !required.some((unit) => claim.includes(unit)));
  return {
    text,
    query: q,
    entities,
    active_referent: activeReferent || (Array.isArray(binding?.target_ids) ? binding.target_ids[0] || "" : ""),
    polarity,
    claims,
    quantities: significantQuantities(text),
    named_items: namedItems,
    query_named_items: queryNamedItems,
    qualifiers: unique([...uncertaintyMarkers, ...boundaryRequirements]),
    uncertainty_markers: uncertaintyMarkers,
    boundary_requirements: unique(boundaryRequirements),
    relation_ids: relationIds,
    required_units: required,
    optional_units: optional,
    evidence_ids: Array.isArray(evidenceIds) ? evidenceIds.slice(0, 12) : []
  };
}

export function detectUserConfirmationPolarity(query = "") {
  const q = textOf(query);
  if (!/(吗|是不是|是否|对吗|是那个)/.test(q)) return "none";
  if (NEGATION_PATTERN.test(q)) return "negative_question";
  if (/日本小说家|不是|不对|另一个|别人|别的/.test(q)) return "ambiguous_or_negative";
  return "confirmation_question";
}
