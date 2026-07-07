import {
  MAX_STATIC_RUNTIME_INPUT_CHARS,
  R28SEC0_SECURITY_POLICY_VERSION,
  inspectSecurityText
} from "./static_security_policy.ts";

function redactBlockedInput(reason) {
  return `[blocked by ${R28SEC0_SECURITY_POLICY_VERSION}: ${reason}]`;
}

export function sanitizeInputForLocalRuntime(input, options = {}) {
  const raw = String(input || "");
  const trimmed = raw.trim();
  const maxChars = Number(options.maxInputChars || MAX_STATIC_RUNTIME_INPUT_CHARS);
  const failures = [];
  const warnings = [];

  if (raw.length > maxChars) failures.push("input_too_large");
  const inspection = inspectSecurityText(raw);
  failures.push(...inspection.failures);
  warnings.push(...inspection.warnings);

  const uniqueFailures = Array.from(new Set(failures));
  const uniqueWarnings = Array.from(new Set(warnings));
  const blocked = uniqueFailures.length > 0;
  const primaryReason = uniqueFailures[0] || null;

  return {
    ok: !blocked,
    blocked,
    failures: uniqueFailures,
    warnings: uniqueWarnings,
    markers: inspection.markers,
    original_length: raw.length,
    max_chars: maxChars,
    sanitized_input: blocked ? "" : trimmed.slice(0, maxChars),
    redacted_input: blocked ? redactBlockedInput(primaryReason || "security_guard") : trimmed.slice(0, maxChars),
    local_only: true,
    allowed_for_training: false,
    forwarded_to_external_runtime: false,
    persisted: false
  };
}

export function buildSecurityBlockedResult(reason, guard = {}) {
  return {
    passed: false,
    failures: [reason || "static_security_policy_blocked"],
    fallback_recommended: true,
    security_guard: {
      policy_version: R28SEC0_SECURITY_POLICY_VERSION,
      ...guard,
      local_only: true,
      allowed_for_training: false,
      forwarded_to_external_runtime: false,
      persisted: false
    }
  };
}
