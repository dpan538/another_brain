import test from "node:test";
import assert from "node:assert/strict";
import { generationWatchdogProfile, isTerminalGenerationStatus, watchdogFallbackReason } from "../../src/browser_runtime/generation/generation_watchdog.ts";

test("generation watchdog exposes desktop and mobile SLA", () => {
  const desktop = generationWatchdogProfile({ userAgent: "Chrome Desktop" });
  assert.equal(desktop.start_timeout_ms, 1500);
  assert.equal(desktop.first_token_timeout_ms, 6000);
  assert.equal(desktop.max_total_generation_ms, 12000);
  assert.equal(desktop.max_new_tokens, 24);

  const mobile = generationWatchdogProfile({ userAgent: "iPhone MicroMessenger", network: "3g" });
  assert.equal(mobile.first_token_timeout_ms, 10000);
  assert.equal(mobile.max_total_generation_ms, 20000);
  assert.equal(mobile.max_new_tokens, 12);
});

test("generation watchdog terminal states map to fallback reasons", () => {
  for (const status of ["completed", "timeout", "failed", "aborted", "fallback"]) {
    assert.equal(isTerminalGenerationStatus(status), true);
  }
  assert.equal(watchdogFallbackReason("timeout"), "q4_generation_timeout");
  assert.equal(watchdogFallbackReason("start_failed"), "q4_generation_start_failed");
});
