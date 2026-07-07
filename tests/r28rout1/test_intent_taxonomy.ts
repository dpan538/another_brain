import test from "node:test";
import assert from "node:assert/strict";
import { MICRO_INTENTS, MICRO_INTENT_EXAMPLES, routeForMicroIntent } from "../../src/browser_runtime/router/intent_taxonomy.ts";

test("R28ROUT1 declares the bounded micro intent taxonomy", () => {
  for (const intent of [
    "greeting",
    "identity_who_are_you",
    "identity_are_you_crocodile",
    "origin_where_from",
    "capability_what_can_you_do",
    "boundary_are_you_ai",
    "runtime_status",
    "evidence_insufficient",
    "evidence_conflict",
    "malicious_instruction",
    "smalltalk_light",
    "unknown_open_question"
  ]) {
    assert.ok(MICRO_INTENTS.includes(intent));
    assert.ok(intent === "unknown_open_question" || Array.isArray(MICRO_INTENT_EXAMPLES[intent]));
  }
  assert.equal(routeForMicroIntent("greeting"), "greeting_surface");
  assert.equal(routeForMicroIntent("identity_are_you_crocodile"), "identity_surface");
});
