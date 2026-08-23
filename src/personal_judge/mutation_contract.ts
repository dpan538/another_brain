export const R30J0_MUTATION_KINDS = [
  "make_more_formal",
  "make_more_verbose",
  "add_customer_service_opening",
  "add_unnecessary_validation",
  "add_unnecessary_disclaimer",
  "add_bullet_structure",
  "add_textbook_framing",
  "make_too_cold",
  "make_too_warm",
  "add_unnecessary_question",
  "add_repetition",
  "make_overly_enthusiastic",
  "make_overly_apologetic",
] as const;

export type R30J0MutationKind = (typeof R30J0_MUTATION_KINDS)[number];

export interface R30J0MutationProtectionMetadata {
  /** Exact public-safe names or named values that must remain present verbatim. */
  namedValues?: string[];
  /** Exact condition clauses whose presence is required. */
  protectedConditions?: string[];
  /** Exact conclusion text whose presence is required. */
  logicConclusion?: string | null;
}

export interface R30J0MutationProtectedSignature {
  arabic_numbers: string[];
  chinese_numerals: string[];
  dates: string[];
  times: string[];
  currencies: string[];
  percentages: string[];
  urls: string[];
  emails: string[];
  quoted_strings: string[];
  named_values: string[];
  negation_markers: string[];
  condition_clauses: string[];
  protected_conditions: string[];
  logic_conclusions: string[];
}

export interface R30J0MutationValidationResult {
  accepted: boolean;
  discard: boolean;
  changed: boolean;
  protected_fact_mismatches: Array<keyof R30J0MutationProtectedSignature>;
  reasons: string[];
  source_signature: R30J0MutationProtectedSignature;
  mutated_signature: R30J0MutationProtectedSignature;
  deterministic_guard_is_semantic_equivalence_proof: false;
  owner_or_reviewer_review_still_required: true;
}

function normalize(value: string): string {
  return String(value).normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function sortedMatches(text: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))]
    .map((match) => normalize(match[0]))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function exactMentions(text: string, values: string[] | undefined): string[] {
  const normalizedText = normalize(text);
  return (values ?? [])
    .map(normalize)
    .filter((value) => value.length > 0 && normalizedText.includes(value))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

const CONDITION_CLAUSE =
  /(?:只有[^，,。.;；！!？?\n]{0,80}才[^，,。.;；！!？?\n]{0,80}|除非[^，,。.;；！!？?\n]{0,120}|只要[^，,。.;；！!？?\n]{0,120}|否则[^，,。.;；！!？?\n]{0,120}|如果[^，,。.;；！!？?\n]{0,120}|假如[^，,。.;；！!？?\n]{0,120}|若是?[^，,。.;；！!？?\n]{0,120}|前提是[^，,。.;；！!？?\n]{0,120}|取决于[^，,。.;；！!？?\n]{0,120})/gu;

export function buildMutationProtectedSignature(
  rawText: string,
  metadata: R30J0MutationProtectionMetadata = {},
): R30J0MutationProtectedSignature {
  const text = normalize(rawText);
  return {
    arabic_numbers: sortedMatches(text, /[-+]?\d+(?:[.,]\d+)?/gu),
    chinese_numerals: sortedMatches(text, /[零〇一二两三四五六七八九十百千万亿]+/gu),
    dates: sortedMatches(
      text,
      /(?:\d{4}[年./-]\d{1,2}(?:[月./-]\d{1,2}日?)?|\d{1,2}月\d{1,2}日|(?:周|星期)[一二三四五六日天])/gu,
    ),
    times: sortedMatches(
      text,
      /(?:[01]?\d|2[0-3])[:：][0-5]\d(?:\s*(?:am|pm))?|(?:上午|下午|晚上|中午|凌晨)?\s*(?:[零〇一二两三四五六七八九十百千万亿\d]+)点(?:半|[零〇一二两三四五六七八九十百千万亿\d]+分)?/giu,
    ),
    currencies: sortedMatches(
      text,
      /(?:人民币|rmb|cny|¥|￥|\$|美元|元|块)\s*[-+]?\d+(?:[.,]\d+)?|[-+]?\d+(?:[.,]\d+)?\s*(?:人民币|rmb|cny|美元|元|块)/giu,
    ),
    percentages: sortedMatches(
      text,
      /(?:[-+]?\d+(?:[.,]\d+)?|[零〇一二两三四五六七八九十百千万亿]+)\s*(?:%|％|百分之)/gu,
    ),
    urls: sortedMatches(text, /https?:\/\/[^\s<>"'，。！？]+/giu),
    emails: sortedMatches(
      text,
      /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/giu,
    ),
    quoted_strings: sortedMatches(
      text,
      /“[^”]{1,160}”|‘[^’]{1,160}’|「[^」]{1,160}」|『[^』]{1,160}』|"[^"\n]{1,160}"|'[^'\n]{1,160}'/gu,
    ),
    named_values: exactMentions(text, metadata.namedValues),
    negation_markers: sortedMatches(
      text,
      /并非|不是|不能|不会|不可|不必|不要|无需|没有|没能|未必|未曾|无法|禁止|拒绝|不|没|无|未/gu,
    ),
    condition_clauses: sortedMatches(text, CONDITION_CLAUSE),
    protected_conditions: exactMentions(text, metadata.protectedConditions),
    logic_conclusions: [
      ...sortedMatches(text, /(?:答案|结论|所以|因此|由此)(?:是|为|：|:)?[^，,。.;；！!？?\n]{1,80}/gu),
      ...exactMentions(text, metadata.logicConclusion ? [metadata.logicConclusion] : []),
    ].sort((left, right) => left.localeCompare(right, "zh-CN")),
  };
}

export function compareMutationProtectedSignatures(
  source: R30J0MutationProtectedSignature,
  mutated: R30J0MutationProtectedSignature,
): Array<keyof R30J0MutationProtectedSignature> {
  return (Object.keys(source) as Array<keyof R30J0MutationProtectedSignature>).filter(
    (field) => JSON.stringify(source[field]) !== JSON.stringify(mutated[field]),
  );
}

export function validateControlledMutation(
  sourceText: string,
  mutatedText: string,
  metadata: R30J0MutationProtectionMetadata = {},
): R30J0MutationValidationResult {
  const source = normalize(sourceText);
  const mutated = normalize(mutatedText);
  const source_signature = buildMutationProtectedSignature(source, metadata);
  const mutated_signature = buildMutationProtectedSignature(mutated, metadata);
  const protected_fact_mismatches = compareMutationProtectedSignatures(source_signature, mutated_signature);
  const changed = source !== mutated;
  const reasons: string[] = [];
  if (!source) reasons.push("empty_source");
  if (!mutated) reasons.push("empty_mutation");
  if (!changed) reasons.push("mutation_not_applied");
  for (const field of protected_fact_mismatches) reasons.push(`protected_fact_changed:${field}`);
  const accepted = reasons.length === 0;
  return {
    accepted,
    discard: !accepted,
    changed,
    protected_fact_mismatches,
    reasons,
    source_signature,
    mutated_signature,
    deterministic_guard_is_semantic_equivalence_proof: false,
    owner_or_reviewer_review_still_required: true,
  };
}

export interface R30J0ControlledMutationRecord {
  mutation_kind: R30J0MutationKind;
  source_text: string;
  mutated_text: string;
  public_safe: true;
  allowed_for_training: false;
  owner_review_status: "pending";
}

export function createUnreviewedMutationRecord(
  mutationKind: R30J0MutationKind,
  sourceText: string,
  mutatedText: string,
): R30J0ControlledMutationRecord {
  if (!R30J0_MUTATION_KINDS.includes(mutationKind)) throw new Error("unsupported_r30j0_mutation_kind");
  return {
    mutation_kind: mutationKind,
    source_text: sourceText,
    mutated_text: mutatedText,
    public_safe: true,
    allowed_for_training: false,
    owner_review_status: "pending",
  };
}
