export interface R29P0CaseProtectionMetadata {
  protected_values?: Array<string | { kind?: string; value: string }>;
  protected_conditions?: string[];
  boundary_expectation?: string | null;
  logic_conclusion_if_applicable?: string | null;
}

export interface ProtectedFeatureSignature {
  arabic_numbers: string[];
  chinese_numerals: string[];
  quantities: string[];
  units: string[];
  currencies: string[];
  percentages: string[];
  dates: string[];
  times: string[];
  named_explicit_values: string[];
  quoted_strings: string[];
  urls: string[];
  emails: string[];
  negation_polarity: string[];
  conditions_modality: string[];
  privacy_refusal_state: string[];
  identity_boundary_state: string[];
  user_constraints: string[];
  ordered_alternatives: string[];
  logic_conclusion: string[];
}

export interface ProtectedPairGuardResult {
  passed: boolean;
  mismatch_fields: Array<keyof ProtectedFeatureSignature>;
  source: ProtectedFeatureSignature;
  candidate_a: ProtectedFeatureSignature;
  candidate_b: ProtectedFeatureSignature;
  embedding_similarity_used_as_equivalence_proof: false;
}

function normalized(value: string): string {
  return String(value).normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

function matches(text: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const found = [...text.matchAll(new RegExp(pattern.source, flags))]
    .map((match) => normalized(match[0]))
    .filter(Boolean);
  return found.sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function listedMentions(text: string, values: Array<string | { value: string }> | undefined): string[] {
  const haystack = normalized(text);
  return [...new Set((values ?? []).map((item) => normalized(typeof item === "string" ? item : item.value)).filter((value) => value && haystack.includes(value)))]
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

const NUMBER_OR_CN = String.raw`(?:[-+]?\d+(?:[.,]\d+)?|[零〇一二两三四五六七八九十百千万亿]+)`;
const UNIT = String.raw`(?:毫米|厘米|公里|千米|公斤|千克|毫升|分钟|小时|人民币|美元|摄氏度|华氏度|米|克|升|秒|天|周|月|年|页|字|人|岁|度|个|只|件|次|份|杯|本|张|元|块|%|％)`;

export function buildProtectedFeatureSignature(
  rawText: string,
  metadata: R29P0CaseProtectionMetadata = {},
): ProtectedFeatureSignature {
  const text = normalized(rawText);
  const conditions = [...(metadata.protected_conditions ?? [])];
  if (metadata.boundary_expectation && metadata.boundary_expectation !== "none") conditions.push(metadata.boundary_expectation);
  return {
    // Deliberately no Latin/CJK lookbehind: values such as “共20个” and “第3项” must be captured.
    arabic_numbers: matches(text, /[-+]?\d+(?:[.,]\d+)?/gu),
    chinese_numerals: matches(text, /[零〇一二两三四五六七八九十百千万亿]+/gu),
    quantities: matches(text, new RegExp(`${NUMBER_OR_CN}\\s*${UNIT}`, "gu")),
    units: matches(text, new RegExp(UNIT, "gu")),
    currencies: matches(text, /(?:人民币|rmb|cny|¥|￥|\$|美元|元|块)\s*[-+]?\d+(?:[.,]\d+)?|[-+]?\d+(?:[.,]\d+)?\s*(?:人民币|rmb|cny|美元|元|块)/giu),
    percentages: matches(text, /(?:[-+]?\d+(?:[.,]\d+)?|[零〇一二两三四五六七八九十百千万亿]+)\s*(?:%|％|百分之)/gu),
    dates: matches(text, /(?:\d{4}[年./-]\d{1,2}(?:[月./-]\d{1,2}日?)?|\d{1,2}月\d{1,2}日|(?:周|星期)[一二三四五六日天])/gu),
    times: matches(text, /(?:[01]?\d|2[0-3])[:：][0-5]\d(?:\s*(?:am|pm))?|(?:上午|下午|晚上|中午|凌晨)?\s*(?:[零〇一二两三四五六七八九十百千万亿\d]+)点(?:半|[零〇一二两三四五六七八九十百千万亿\d]+分)?/giu),
    named_explicit_values: listedMentions(text, metadata.protected_values),
    quoted_strings: matches(text, /“[^”]{1,160}”|‘[^’]{1,160}’|「[^」]{1,160}」|『[^』]{1,160}』|"[^"\n]{1,160}"|'[^'\n]{1,160}'/gu),
    urls: matches(text, /https?:\/\/[^\s<>"'，。！？]+/giu),
    emails: matches(text, /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/giu),
    negation_polarity: matches(text, /并非|不是|不能|不会|不可|不必|不要|无需|没有|没能|未必|未曾|无法|禁止|拒绝|不|没|无|未/gu),
    conditions_modality: matches(text, /只有[^，。；！？]{0,48}才|除非|只要|否则|如果|假如|若是|若|前提是|取决于|必须|务必|只能|不得|不能|不可以|可以|可能|也许|或许|应当|应该|需要|无需|不必|must|only if|unless|if|may|might|can(?:not)?/giu),
    privacy_refusal_state: matches(text, /不提供|不透露|不保存|不记录|不能帮|无法协助|拒绝|隐私|密码|验证码|身份证|住址|联系方式|私人信息|个人信息/gu),
    identity_boundary_state: matches(text, /冒充|假装是|身份|真人|人类|本地模型|语言模型|ai|人工智能/giu),
    user_constraints: listedMentions(text, conditions),
    ordered_alternatives: matches(text, /(?:第一|第二|第三|首先|其次|最后|先|再|然后|a[.、：:]|b[.、：:]|1[.、：]|2[.、：])/giu),
    logic_conclusion: [
      ...matches(text, /(?:答案|结论|所以|因此|由此)(?:是|为|：|:)?[^，。；！？\n]{1,48}/gu),
      ...listedMentions(text, metadata.logic_conclusion_if_applicable ? [metadata.logic_conclusion_if_applicable] : []),
    ].sort((left, right) => left.localeCompare(right, "zh-CN")),
  };
}

export function compareProtectedFeatureSignatures(
  candidateA: ProtectedFeatureSignature,
  candidateB: ProtectedFeatureSignature,
): Array<keyof ProtectedFeatureSignature> {
  return (Object.keys(candidateA) as Array<keyof ProtectedFeatureSignature>)
    .filter((field) => JSON.stringify(candidateA[field]) !== JSON.stringify(candidateB[field]));
}

export function evaluateProtectedPair(
  sourceText: string,
  candidateA: string,
  candidateB: string,
  metadata: R29P0CaseProtectionMetadata = {},
): ProtectedPairGuardResult {
  const source = buildProtectedFeatureSignature(sourceText, metadata);
  const candidate_a = buildProtectedFeatureSignature(candidateA, metadata);
  const candidate_b = buildProtectedFeatureSignature(candidateB, metadata);
  const mismatch_fields = compareProtectedFeatureSignatures(candidate_a, candidate_b);
  return {
    passed: mismatch_fields.length === 0,
    mismatch_fields,
    source,
    candidate_a,
    candidate_b,
    embedding_similarity_used_as_equivalence_proof: false,
  };
}
