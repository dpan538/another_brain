export const DEBUG_REPORT_SCHEMA_VERSION = 1;

function cleanString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 1000) / 1000) : 0;
}

function cleanTraceEvent(event = {}) {
  return {
    route: cleanString(event.route || event.answerSource || "unknown"),
    intent: cleanString(event.intent || "unknown"),
    context_action: cleanString(event.contextAction || event.context_action || "unknown"),
    answer_source: cleanString(event.answerSource || event.answer_source || event.route || "unknown"),
    sanitizer_changed: Boolean(event.sanitizerChanged ?? event.sanitizer_changed),
    latency_ms: cleanNumber(event.latencyMs ?? event.latency_ms),
    failure_tag: cleanString(event.failureTag || event.failure_tag || "none", "none")
  };
}

export function buildDebugReport(options = {}) {
  const includeTranscript = Boolean(options.includeTranscript);
  const report = {
    schema_version: DEBUG_REPORT_SCHEMA_VERSION,
    kind: "another_brain_local_debug_report",
    generated_at: new Date().toISOString(),
    app_version: cleanString(options.appVersion || "0.1.0", "0.1.0"),
    commit: cleanString(options.commit || "unknown", "unknown"),
    model_version: cleanString(options.modelVersion || "unknown", "unknown"),
    include_transcript: includeTranscript,
    last_event: cleanTraceEvent(options.lastEvent || {}),
    runtime: {
      visible_context_turn_limit: Number(options.visibleContextTurnLimit || 4),
      raw_runtime_context_turn_limit: Number(options.rawRuntimeContextTurnLimit || 4),
      internal_compact_context_turn_limit: Number(options.internalCompactContextTurnLimit || 16)
    }
  };

  if (includeTranscript) {
    report.transcript = Array.isArray(options.transcript)
      ? options.transcript.slice(-Number(options.rawRuntimeContextTurnLimit || 4)).map((turn) => ({
          question: cleanString(turn.question),
          answer: cleanString(turn.answer),
          intent: cleanString(turn.intent || "unknown")
        }))
      : [];
  }

  return report;
}

export function validateDebugReport(report) {
  const failures = [];
  if (!report || typeof report !== "object") failures.push("not_object");
  if (report?.schema_version !== DEBUG_REPORT_SCHEMA_VERSION) failures.push("schema_version");
  if (report?.kind !== "another_brain_local_debug_report") failures.push("kind");
  if (!report?.last_event || typeof report.last_event !== "object") failures.push("last_event");
  for (const key of ["route", "intent", "context_action", "answer_source", "failure_tag"]) {
    if (!report?.last_event?.[key]) failures.push(`last_event.${key}`);
  }
  if (typeof report?.last_event?.sanitizer_changed !== "boolean") failures.push("last_event.sanitizer_changed");
  if (typeof report?.last_event?.latency_ms !== "number") failures.push("last_event.latency_ms");
  return { ok: failures.length === 0, failures };
}

export function downloadDebugReport(report) {
  const payload = JSON.stringify(report, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `another-brain-debug-${Date.now()}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
