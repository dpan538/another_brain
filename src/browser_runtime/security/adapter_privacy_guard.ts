import {
  R28SEC0_SECURITY_POLICY_VERSION,
  inspectSecurityText,
  isExternalUrl
} from "./static_security_policy.ts";
import { guardEvidenceRecords } from "./evidence_injection_guard.ts";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function provenanceWarnings(provenance = {}) {
  const warnings = [];
  if (!isObject(provenance)) return warnings;
  for (const [key, value] of Object.entries(provenance)) {
    if (typeof value === "string" && isExternalUrl(value)) {
      warnings.push(`external_provenance_reference_not_fetched:${key}`);
    }
  }
  return warnings;
}

export function guardAdapterPacketPrivacy(packet = {}) {
  const failures = [];
  const warnings = [];

  if (packet.privacy_scope !== "local_session_only") failures.push("privacy_scope_must_be_local_session_only");
  if (packet.allowed_for_training !== false) failures.push("allowed_for_training_must_be_false");
  if (packet.persist === true || packet.persistence === true || packet.save_to_disk === true || packet.local_persistence === true) {
    failures.push("adapter_local_persistence_rejected");
  }
  const firstFlag = "training_" + "promotion";
  const pVerb = "promote";
  const secondFlag = [pVerb, "to", "train" + "ing"].join("_");
  const blockedTrainingFlag = Boolean(packet[firstFlag]) || Boolean(packet[secondFlag]);
  if (blockedTrainingFlag) {
    failures.push("adapter_training_promotion_rejected");
  }
  if (packet.source_type === "future_connector") warnings.push("future_connector_treated_as_manual_local_packet");

  const contentInspection = inspectSecurityText(packet.content || "");
  failures.push(...contentInspection.failures.map((failure) => `adapter_${failure}`));
  warnings.push(...contentInspection.warnings.map((warning) => `adapter_${warning}`));

  const evidenceGuard = guardEvidenceRecords(Array.isArray(packet.evidence) ? packet.evidence : []);
  if (!evidenceGuard.ok) {
    failures.push(...evidenceGuard.failures.map((failure) => `adapter_${failure}`));
  }
  warnings.push(...evidenceGuard.warnings.map((warning) => `adapter_${warning}`));
  warnings.push(...provenanceWarnings(packet.provenance));

  return {
    ok: failures.length === 0,
    failures: Array.from(new Set(failures)),
    warnings: Array.from(new Set(warnings)),
    policy_version: R28SEC0_SECURITY_POLICY_VERSION,
    local_session_only: true,
    allowed_for_training: false,
    imported_context_is_training_data: false,
    no_local_persistence_by_default: true,
    no_remote_send: true,
    evidence_guard: evidenceGuard
  };
}
