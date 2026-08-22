export interface SemanticGuardFixtureMetadata {
  protected_named_values?: string[];
  ordered_alternatives?: string[];
  boundary_decision?: "refuse" | "allow" | "identity";
  logical_stance?: "yes" | "no" | "uncertain";
  maximum_answer_characters?: number;
}

export interface SemanticGuardResult {
  accepted: boolean;
  final_answer: string;
  source_label: "hybrid_rewrite_accepted" | "hybrid_canonical_fallback";
  rejection_reasons: string[];
  checks: Record<string, unknown>;
  guard_latency_ms: number;
  unvalidated_stream_exposed: false;
}

const NEGATIONS = ["并不是", "不等于", "不可以", "不应该", "不建议", "不能", "不会", "不是", "并非", "无法", "没有", "没", "未", "无", "不", "别", "勿", "否"];
const CONDITIONALS = ["前提是", "只要", "除非", "如果", "要是", "若"];
const RECOMMENDATIONS = ["建议", "不妨", "可以试试", "最好", "记得", "务必", "不如", "先试", "你可以先", "你应该"];
const REFUSAL = /(不能|不可以|无法|不会|不应|不建议|拒绝|没有权限|做不到|不该|不能帮)/u;
const ALLOW = /(^|[，。；\s])(可以|能|能够|会|同意|没问题)(?=[，。；\s]|$)/u;
const UNCERTAIN = /(不能确定|无法确定|不一定|信息不足|需要更多|说不准|无法判断)/u;
const POSITIVE_ORIENTATION = /^(是|能|可以|会|有|能够|可以确定|可以断定)/u;
const NEGATIVE_ORIENTATION = /^(不是|不能|不可以|不会|没有|无法|否|不能确定|无法确定)/u;

function normalized(value: string): string {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, "").trim();
}

function multisetMatches(pattern: RegExp, left: string, right: string): boolean {
  const extract = (value: string) => [...value.matchAll(pattern)].map((match) => match[0]).sort();
  return JSON.stringify(extract(left)) === JSON.stringify(extract(right));
}

function negationTokens(value: string): string[] {
  const pattern = new RegExp(NEGATIONS.join("|"), "gu");
  return [...normalized(value).matchAll(pattern)].map((match) => match[0]);
}

function conditionalTokens(value: string): string[] {
  const pattern = new RegExp(CONDITIONALS.join("|"), "gu");
  return [...normalized(value).matchAll(pattern)].map((match) => match[0]);
}

function recommendationCounts(value: string): Record<string, number> {
  return Object.fromEntries(RECOMMENDATIONS.map((marker) => [marker, value.split(marker).length - 1]));
}

function protectedValueGroups(value: string, metadata: SemanticGuardFixtureMetadata): Record<string, string[]> {
  const text = String(value ?? "");
  const groups: Record<string, string[]> = {
    arabic_numbers: [...text.matchAll(/(?<![\p{L}\p{N}])[-+]?\d+(?:[.,:]\d+)*(?:%|％)?/gu)].map((match) => match[0]),
    chinese_numerals: [...text.matchAll(/[零〇一二三四五六七八九十百千万两]+(?:年|月|日|号|点|时|分|秒|元|块|角|％|成|个|次|天|小时|分钟|米|厘米|公斤|岁|条|处|颗|封|件|种|人|页|段|句|字)/gu)].map((match) => match[0]),
    dates: [...text.matchAll(/(?:\d{4}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?|\d{1,2}月\d{1,2}日)/gu)].map((match) => match[0]),
    times: [...text.matchAll(/(?:\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}点(?:\d{1,2}分)?)/gu)].map((match) => match[0]),
    currency: [...text.matchAll(/(?:CNY|RMB|USD|AUD|¥|￥|\$|元|块)\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:元|块|美元|澳元)/giu)].map((match) => match[0]),
    percentages: [...text.matchAll(/\d+(?:\.\d+)?\s*(?:%|％)|[零〇一二三四五六七八九十百]+(?:成|％)/gu)].map((match) => match[0]),
    urls: [...text.matchAll(/https?:\/\/[^\s，。！？]+/giu)].map((match) => match[0]),
    emails: [...text.matchAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu)].map((match) => match[0]),
    quoted_strings: [...text.matchAll(/[“「『"]([^”」』"]+)[”」』"]/gu)].map((match) => match[0]),
    named_values: (metadata.protected_named_values ?? []).filter((item) => item && text.includes(item)),
  };
  return Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, [...values].sort()]));
}

function orientation(value: string): "yes" | "no" | "uncertain" | "unclassified" {
  const text = normalized(value);
  if (UNCERTAIN.test(text)) return "uncertain";
  if (NEGATIVE_ORIENTATION.test(text)) return "no";
  if (POSITIVE_ORIENTATION.test(text)) return "yes";
  return "unclassified";
}

function boundaryDecision(value: string): "refuse" | "allow" | "unclassified" {
  if (REFUSAL.test(value)) return "refuse";
  if (ALLOW.test(value)) return "allow";
  return "unclassified";
}

function orderedPositions(value: string, alternatives: string[]): number[] {
  return alternatives.map((item) => value.indexOf(item));
}

function lcsLength(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  let previous = new Uint16Array(b.length + 1);
  for (const char of a) {
    const current = new Uint16Array(b.length + 1);
    for (let index = 1; index <= b.length; index += 1) {
      current[index] = char === b[index - 1] ? previous[index - 1] + 1 : Math.max(previous[index], current[index - 1]);
    }
    previous = current;
  }
  return previous[b.length];
}

function contentCharacters(value: string): string[] {
  return Array.from(normalized(value).replace(/[，。！？；：、,.!?;:()（）\[\]【】“”「」『』'"\-—]/gu, ""));
}

function setCoverage(source: string[], target: string[]): number {
  const sourceSet = new Set(source);
  const targetSet = new Set(target);
  if (sourceSet.size === 0) return 1;
  return [...sourceSet].filter((item) => targetSet.has(item)).length / sourceSet.size;
}

export function semanticPreservationGuard(
  canonicalAnswer: string,
  rewriteCandidate: string,
  metadata: SemanticGuardFixtureMetadata = {},
): SemanticGuardResult {
  const started = performance.now();
  const canonical = String(canonicalAnswer ?? "").trim();
  const candidate = String(rewriteCandidate ?? "").trim();
  const reasons: string[] = [];
  if (!canonical) throw new Error("semantic_guard_empty_canonical");
  if (!candidate) reasons.push("empty_rewrite_candidate");

  const canonicalProtected = protectedValueGroups(canonical, metadata);
  const candidateProtected = protectedValueGroups(candidate, metadata);
  for (const key of Object.keys(canonicalProtected)) {
    if (JSON.stringify(canonicalProtected[key]) !== JSON.stringify(candidateProtected[key])) reasons.push(`protected_value_change:${key}`);
  }

  const canonicalNegation = negationTokens(canonical);
  const candidateNegation = negationTokens(candidate);
  if (JSON.stringify(canonicalNegation) !== JSON.stringify(candidateNegation)) reasons.push("negation_change");

  const canonicalConditions = conditionalTokens(canonical);
  const candidateConditions = conditionalTokens(candidate);
  if (JSON.stringify(canonicalConditions) !== JSON.stringify(candidateConditions)) reasons.push("conditional_change");

  const canonicalRecommendations = recommendationCounts(canonical);
  const candidateRecommendations = recommendationCounts(candidate);
  if (Object.keys(canonicalRecommendations).some((key) => candidateRecommendations[key] > canonicalRecommendations[key])) reasons.push("new_unsupported_recommendation");

  const canonicalOrientation = orientation(canonical);
  const candidateOrientation = orientation(candidate);
  if (canonicalOrientation !== "unclassified" && candidateOrientation !== canonicalOrientation) reasons.push("yes_no_orientation_change");
  if (metadata.logical_stance && canonicalOrientation !== "unclassified" && canonicalOrientation !== metadata.logical_stance) reasons.push("canonical_fixture_stance_mismatch");
  if (metadata.logical_stance && candidateOrientation !== "unclassified" && candidateOrientation !== metadata.logical_stance) reasons.push("logical_stance_change");

  const canonicalBoundary = boundaryDecision(canonical);
  const candidateBoundary = boundaryDecision(candidate);
  if (metadata.boundary_decision) {
    if (metadata.boundary_decision === "refuse" && (canonicalBoundary !== "refuse" || candidateBoundary !== "refuse")) reasons.push("privacy_or_boundary_decision_change");
    if (metadata.boundary_decision === "allow" && canonicalBoundary !== candidateBoundary) reasons.push("boundary_decision_change");
  } else if (canonicalBoundary !== "unclassified" && candidateBoundary !== canonicalBoundary) {
    reasons.push("boundary_decision_change");
  }

  const alternatives = metadata.ordered_alternatives ?? [];
  if (alternatives.length >= 2) {
    const canonicalPositions = orderedPositions(canonical, alternatives);
    const candidatePositions = orderedPositions(candidate, alternatives);
    const canonicalHasAll = canonicalPositions.every((position) => position >= 0);
    if (canonicalHasAll && (!candidatePositions.every((position) => position >= 0) || candidatePositions.some((position, index) => index > 0 && position <= candidatePositions[index - 1]))) {
      reasons.push("ordered_alternatives_change");
    }
  }

  const canonicalNormalized = normalized(canonical);
  const candidateNormalized = normalized(candidate);
  const lcsRatio = candidateNormalized.length ? lcsLength(canonicalNormalized, candidateNormalized) / Math.max(canonicalNormalized.length, candidateNormalized.length) : 0;
  const canonicalChars = contentCharacters(canonical);
  const candidateChars = contentCharacters(candidate);
  const canonicalCoverage = setCoverage(canonicalChars, candidateChars);
  const candidateNovelty = 1 - setCoverage(candidateChars, canonicalChars);
  const lengthRatio = candidateNormalized.length / Math.max(1, canonicalNormalized.length);
  const sentenceDelta = (candidate.match(/[。！？!?]/gu)?.length ?? 0) - (canonical.match(/[。！？!?]/gu)?.length ?? 0);
  if (lengthRatio > 1.18 && candidateNormalized.length > canonicalNormalized.length + 8) reasons.push("semantic_edit_envelope_expansion");
  if (lengthRatio < 0.45 && canonicalNormalized.length > 20) reasons.push("semantic_edit_envelope_fact_removal");
  if (lcsRatio < 0.34) reasons.push("semantic_edit_envelope_low_lcs");
  if (canonicalCoverage < 0.52) reasons.push("semantic_edit_envelope_low_canonical_coverage");
  if (candidateNovelty > 0.42) reasons.push("semantic_edit_envelope_new_content");
  if (sentenceDelta > 1) reasons.push("semantic_edit_envelope_new_sentences");
  if (metadata.maximum_answer_characters && Array.from(candidate).length > metadata.maximum_answer_characters) reasons.push("maximum_answer_characters_exceeded");
  if (!multisetMatches(/[A-Za-z][A-Za-z0-9_.-]*/gu, canonical, candidate)) reasons.push("named_ascii_token_change");

  const rejectionReasons = [...new Set(reasons)];
  const accepted = rejectionReasons.length === 0;
  return {
    accepted,
    final_answer: accepted ? candidate : canonical,
    source_label: accepted ? "hybrid_rewrite_accepted" : "hybrid_canonical_fallback",
    rejection_reasons: rejectionReasons,
    checks: {
      protected_values_match: !rejectionReasons.some((reason) => reason.startsWith("protected_value_change")),
      negation_match: !rejectionReasons.includes("negation_change"),
      conditional_markers_match: !rejectionReasons.includes("conditional_change"),
      no_new_recommendation: !rejectionReasons.includes("new_unsupported_recommendation"),
      canonical_orientation: canonicalOrientation,
      candidate_orientation: candidateOrientation,
      canonical_boundary: canonicalBoundary,
      candidate_boundary: candidateBoundary,
      lcs_ratio: lcsRatio,
      canonical_character_coverage: canonicalCoverage,
      candidate_character_novelty: candidateNovelty,
      length_ratio: lengthRatio,
      sentence_delta: sentenceDelta,
    },
    guard_latency_ms: performance.now() - started,
    unvalidated_stream_exposed: false,
  };
}
