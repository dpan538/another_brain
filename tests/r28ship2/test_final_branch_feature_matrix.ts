import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("R28SHIP2 inventory script covers every required branch and feature", async () => {
  const script = await readFile(new URL("../../scripts/r28ship2_branch_inventory.py", import.meta.url), "utf8");
  for (const ref of [
    "origin/r28pr0-final-preview-pr",
    "origin/r28ux5-chat-dashboard-split",
    "origin/r28hotfix4-open-question-generation-sla",
    "origin/r28qa6-latency-open-question-qa",
    "origin/r28surf5-wide-answer-surfaces",
    "origin/r28rag3-lightweight-profile-rag",
    "origin/r28load0-model-loading-state-machine",
    "origin/r28ship0-unified-q4-mount",
    "origin/r28a13-abstract-value-sft"
  ]) {
    assert.ok(script.includes(ref), ref);
  }
  for (const feature of [
    "q4 assets",
    "exact tokenizer",
    "q4 path normalizer",
    ".vercelignore bin fix",
    "open-question SLA",
    "Chat/Dashboard UI",
    "no-training gates evidence"
  ]) {
    assert.ok(script.includes(feature), feature);
  }
});
