import { detectUserConfirmationPolarity, extractSurfaceContentUnits } from "./surface_content_units.js";

function textOf(value) {
  return String(value || "").trim();
}

function unique(items = []) {
  return [...new Set(items.map((item) => textOf(item)).filter(Boolean))];
}

function zhChars(text) {
  return [...String(text || "")].filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
}

function hasAny(text, patterns = []) {
  const source = textOf(text);
  return patterns.some((pattern) => pattern.test(source));
}

function startsConfidentYes(text = "") {
  return /^(是|是的|对|对的|没错|当然)[。；，,]/.test(textOf(text));
}

function relationSupportIds({ plan = {}, surfaceControl = {}, binding = {} } = {}) {
  return unique([
    ...(Array.isArray(plan?.relation_ids) ? plan.relation_ids : []),
    ...(Array.isArray(plan?.primitive_ids) ? plan.primitive_ids : []),
    ...(Array.isArray(plan?.evidenceIds) ? plan.evidenceIds : []),
    ...(Array.isArray(plan?.evidence_ids) ? plan.evidence_ids : []),
    ...(Array.isArray(surfaceControl?.relation_ids) ? surfaceControl.relation_ids : []),
    ...(Array.isArray(binding?.relation_ids) ? binding.relation_ids : [])
  ]);
}

function unitAppearsInCandidate(unit, candidateUnits) {
  const text = candidateUnits?.text || "";
  return (
    text.includes(unit) ||
    candidateUnits?.active_referent === unit ||
    candidateUnits?.entities?.includes(unit) ||
    candidateUnits?.named_items?.includes(unit) ||
    candidateUnits?.evidence_ids?.includes(unit) ||
    candidateUnits?.qualifiers?.includes(unit) ||
    candidateUnits?.boundary_requirements?.includes(unit) ||
    candidateUnits?.uncertainty_markers?.includes(unit)
  );
}

function unsupportedNamedItems({ currentUnits, candidateUnits }) {
  const allowed = new Set([
    ...(currentUnits?.named_items || []),
    ...(currentUnits?.query_named_items || []),
    ...(currentUnits?.entities || []),
    currentUnits?.active_referent || "",
    ...(currentUnits?.evidence_ids || [])
  ].filter(Boolean));
  return (candidateUnits?.named_items || []).filter((item) => !allowed.has(item));
}

function unsupportedRelations({ currentUnits, candidateUnits, plan, surfaceControl, binding }) {
  const allowed = new Set([
    ...(currentUnits?.relation_ids || []),
    ...relationSupportIds({ plan, surfaceControl, binding })
  ]);
  return (candidateUnits?.relation_ids || []).filter((id) => id !== "generic_relation_claim" && !allowed.has(id));
}

function hasUnsupportedDirectRelation({ currentText, candidateText, allowedRelationIds }) {
  const candidate = textOf(candidateText);
  if (!/(?:直接|同一个|同一|制度|结构).{0,8}关系|关系.{0,8}(?:直接|同一个|同一|制度|结构)/.test(candidate)) {
    return false;
  }
  const current = textOf(currentText);
  if (current.includes(candidate)) return false;
  if (!/(?:直接|同一个|同一|制度|结构).{0,8}关系|关系.{0,8}(?:直接|同一个|同一|制度|结构)/.test(current)) {
    return true;
  }
  return !allowedRelationIds.length;
}

function collectMissingRequiredUnits(currentUnits, candidateUnits) {
  const required = currentUnits?.required_units || [];
  return required.filter((unit) => !unitAppearsInCandidate(unit, candidateUnits));
}

export function verifySurfaceCandidate({
  query = "",
  currentAnswer = "",
  candidateAnswer = "",
  currentUnits = null,
  candidateUnits = null,
  plan = {},
  binding = {},
  responseType = "",
  responseMode = "",
  turnFunction = "",
  surfaceControl = {},
  evidenceIds = []
} = {}) {
  const current =
    currentUnits ||
    extractSurfaceContentUnits({
      answer: currentAnswer,
      query,
      plan,
      binding,
      responseType,
      responseMode,
      activeReferent: binding?.active_referent || binding?.target_ids?.[0] || "",
      evidenceIds
    });
  const candidate =
    candidateUnits ||
    extractSurfaceContentUnits({
      answer: candidateAnswer,
      query,
      plan,
      binding,
      responseType,
      responseMode,
      activeReferent: current.active_referent || binding?.active_referent || binding?.target_ids?.[0] || "",
      evidenceIds
    });

  const hardFailures = [];
  const warnings = [];
  const confirmationKind = detectUserConfirmationPolarity(query);
  const candidateText = textOf(candidateAnswer);
  const currentText = textOf(currentAnswer);

  if (!candidateText) hardFailures.push("empty_candidate");

  if (current.active_referent && candidate.active_referent && current.active_referent !== candidate.active_referent) {
    hardFailures.push("wrong_active_referent");
  }

  const missingRequired = collectMissingRequiredUnits(current, candidate);
  if (missingRequired.includes("boundary_strength")) hardFailures.push("dropped_boundary");
  if (missingRequired.includes("uncertainty_level")) hardFailures.push("dropped_uncertainty");
  const missingNamedRequired = missingRequired.filter((unit) => !["boundary_strength", "uncertainty_level"].includes(unit));
  if (missingNamedRequired.length) hardFailures.push("required_units_missing");

  if (current.polarity === "negative" && candidate.polarity === "affirmative") hardFailures.push("factual_polarity_change");
  if (current.polarity === "uncertain" && candidate.polarity === "affirmative") hardFailures.push("surface_candidate_more_confident_than_source");
  if (current.polarity === "negative" && !/(不|不是|不能|不可|没有|无|并非|不得|不该)/.test(candidateText)) {
    hardFailures.push("negation_erased");
  }

  if (current.quantities?.length) {
    const missingQuantities = current.quantities.filter((quantity) => !candidate.quantities?.includes(quantity));
    if (missingQuantities.length) hardFailures.push("quantity_changed_or_deleted");
  }

  if (current.uncertainty_markers?.length && !candidate.uncertainty_markers?.length) hardFailures.push("dropped_uncertainty");
  if (current.boundary_requirements?.length && !candidate.boundary_requirements?.length) hardFailures.push("dropped_boundary");

  const unsupportedNames = unsupportedNamedItems({ currentUnits: current, candidateUnits: candidate });
  if (unsupportedNames.length) hardFailures.push("unsupported_named_entity");

  const unsupportedRelationIds = unsupportedRelations({
    currentUnits: current,
    candidateUnits: candidate,
    plan,
    surfaceControl,
    binding
  });
  if (unsupportedRelationIds.length) hardFailures.push("unsupported_relation");

  const allowedRelationIds = relationSupportIds({ plan, surfaceControl, binding }).concat(current.relation_ids || []);
  if (hasUnsupportedDirectRelation({ currentText, candidateText, allowedRelationIds })) {
    hardFailures.push("unsupported_relation");
  }

  if (/你是谁|身份|对话框/.test(`${query} ${currentText}`) && /内部|主体|实例|隐藏|本体|ontology|复制体/.test(candidateText)) {
    hardFailures.push("unsupported_named_entity");
  }

  if (confirmationKind !== "none") {
    if (/^是，可以按这个对象继续说[。.!！?？]?$/.test(candidateText)) hardFailures.push("false_confirmation");
    if (confirmationKind !== "confirmation_question" && startsConfidentYes(candidateText)) hardFailures.push("false_confirmation");
    if (startsConfidentYes(candidateText) && !["affirmative", "negative", "uncertain"].includes(current.polarity)) {
      hardFailures.push("confirmation_polarity_unknown");
    }
  }

  const currentZh = zhChars(currentText);
  const candidateZh = zhChars(candidateText);
  if (candidateZh > 0 && currentZh >= 40 && candidateZh < Math.max(10, currentZh * 0.35) && missingRequired.length) {
    hardFailures.push("naturalness_by_deletion");
  }
  if (candidateZh > 0 && candidateZh < 8) hardFailures.push("over_short_empty_reply");

  if (hasAny(candidateText, [/心理诊断|创伤|病理|症状|潜意识证明/]) && /羡慕|想到|童年|喜欢|记忆/.test(query)) {
    hardFailures.push("unsupported_stance");
  }

  if (candidateText === currentText) warnings.push("fallback_or_no_surface_change");
  if (!current.evidence_ids?.length && !candidate.evidence_ids?.length && /法律|医疗|金融|版权|来源/.test(`${query} ${currentText}`)) {
    warnings.push("source_sensitive_without_evidence_ids");
  }

  const uniqueFailures = unique(hardFailures);
  const confidenceComponents = {
    required_unit_preservation: missingRequired.length ? 0 : 1,
    binding_preservation: uniqueFailures.includes("wrong_active_referent") ? 0 : 1,
    polarity_preservation: uniqueFailures.some((id) => /polarity|negation|confidence|confirmation/.test(id)) ? 0 : 1,
    boundary_preservation: uniqueFailures.includes("dropped_boundary") ? 0 : 1,
    uncertainty_preservation: uniqueFailures.includes("dropped_uncertainty") ? 0 : 1,
    unsupported_content_risk: uniqueFailures.some((id) => /unsupported|invented/.test(id)) ? 0 : 1,
    deletion_risk: uniqueFailures.includes("naturalness_by_deletion") ? 0 : 1
  };
  const baseConfidence =
    Object.values(confidenceComponents).reduce((sum, value) => sum + value, 0) /
    Math.max(1, Object.values(confidenceComponents).length);
  const warningPenalty = Math.min(0.18, warnings.length * 0.04);
  const confidence = uniqueFailures.length ? Math.min(0.42, Math.max(0.1, baseConfidence - warningPenalty)) : Math.max(0.5, baseConfidence - warningPenalty);

  return {
    ok: uniqueFailures.length === 0,
    semantic_preservation_ok: uniqueFailures.length === 0,
    context_fit_ok: !uniqueFailures.includes("wrong_active_referent") && !uniqueFailures.includes("false_confirmation"),
    boundary_ok: !uniqueFailures.includes("dropped_boundary"),
    hard_failures: uniqueFailures,
    warnings: unique(warnings),
    missing_required_units: unique(missingRequired),
    unsupported_named_items: unique(unsupportedNames),
    unsupported_relation_ids: unique(unsupportedRelationIds),
    confirmation_kind: confirmationKind,
    confidence_components: confidenceComponents,
    confidence
  };
}
