import test from "node:test";
import assert from "node:assert/strict";
import { SyntheticTinyRuntime, runGenerationLoop } from "../../src/browser_runtime/generation_loop.ts";

test("generation loop honors abort before generation", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => runGenerationLoop(new SyntheticTinyRuntime(), "hello", { signal: controller.signal }),
    /generation_aborted/
  );
});
