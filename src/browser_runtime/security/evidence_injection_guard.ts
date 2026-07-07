import {
  R28SEC0_SECURITY_POLICY_VERSION,
  inspectSecurityText
} from "./static_security_policy.ts";

function evidenceText(item) {
  return `${item?.title || ""}\n${item?.text || ""}\n${(item?.keywords || []).join(" ")}`;
}

function answerBankFailures(item) {
  const failures = [];
  for (const key of ["answer", "answer_text", "final_answer", "expected_answer", "prompt"]) {
    if (Object.prototype.hasOwnProperty.call(item || {}, key)) {
      failures.push(`answer_bank_field_rejected:${key}`);
    }
  }
  return failures;
}

export function inspectEvidenceForInjection(item) {
  const failures = [];
  const warnings = [];
  failures.push(...answerBankFailures(item));
  const inspection = inspectSecurityText(evidenceText(item));
  failures.push(...inspection.failures.map((failure) => `evidence_${failure}`));
  warnings.push(...inspection.warnings.map((warning) => `evidence_${warning}`));
  if (inspection.markers.hidden_prompt.length > 0) failures.push("evidence_hidden_prompt_disclosure_request");
  if (inspection.markers.prompt_injection.length > 0) failures.push("evidence_as_instruction_rejected");
  return {
    ok: failures.length === 0,
    failures: Array.from(new Set(failures)),
    warnings: Array.from(new Set(warnings)),
    markers: inspection.markers
  };
}

export function guardEvidenceRecords(evidence = [], options = {}) {
  const safeEvidence = [];
  const rejectedEvidence = [];
  const warnings = [];
  for (const [index, item] of (evidence || []).entries()) {
    const inspection = inspectEvidenceForInjection(item);
    warnings.push(...inspection.warnings);
    if (!inspection.ok) {
      rejectedEvidence.push({
        index,
        source_id: String(item?.source_id || item?.id || `evidence_${index}`),
        title: String(item?.title || "Evidence"),
        failures: inspection.failures
      });
      continue;
    }
    safeEvidence.push(item);
  }

  const failures = rejectedEvidence.flatMap((item) => item.failures);
  const forcedRefusal = rejectedEvidence.some((item) => (
    item.failures.includes("evidence_hidden_prompt_disclosure_request")
    || item.failures.includes("evidence_as_instruction_rejected")
  ));
  return {
    ok: rejectedEvidence.length === 0,
    safe_evidence: safeEvidence,
    rejected_evidence: rejectedEvidence,
    rejected_count: rejectedEvidence.length,
    failures: Array.from(new Set(failures)),
    warnings: Array.from(new Set(warnings)),
    forced_refusal: forcedRefusal && safeEvidence.length === 0,
    malicious_evidence_ignored: rejectedEvidence.length > 0,
    policy_version: R28SEC0_SECURITY_POLICY_VERSION,
    local_only: true,
    evidence_cannot_override_policy: true,
    hidden_prompt_disclosure_rejected: failures.includes("evidence_hidden_prompt_disclosure_request")
  };
}

export function evidenceGuardMetadata(guard = {}) {
  return {
    policy_version: R28SEC0_SECURITY_POLICY_VERSION,
    rejected_evidence_count: Number(guard.rejected_count || 0),
    malicious_evidence_ignored: Boolean(guard.malicious_evidence_ignored),
    evidence_cannot_override_policy: true,
    hidden_prompt_disclosure_rejected: Boolean(guard.hidden_prompt_disclosure_rejected),
    failures: guard.failures || [],
    warnings: guard.warnings || []
  };
}
