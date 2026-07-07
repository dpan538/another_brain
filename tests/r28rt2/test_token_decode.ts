import test from "node:test";
import assert from "node:assert/strict";
import { decodeTokenIdsToText } from "../../src/browser_runtime/tokenizer/token_decode.ts";

test("RT2 display decoder returns readable text without exposing token ids by default", () => {
  const decoded = decodeTokenIdsToText([11720, 15284, 13947, 42], { tokenizer: { vocab_size: 16000 } });
  assert.equal(decoded.ok, true);
  assert.ok(decoded.text.trim().length > 0);
  assert.equal(decoded.text.includes("token_id:"), false);
  assert.equal(decoded.exact_decode, false);
  assert.equal(decoded.decode_status, "lossy_runtime_display_codec_emergency_fallback");
  assert.equal(decoded.quality_status, "quality_not_ready");
});

test("RT2 display decoder keeps token ids in debug metadata only", () => {
  const decoded = decodeTokenIdsToText([11720], { tokenizer: { vocab_size: 16000 }, debugTokenIds: true });
  assert.deepEqual(decoded.debug_token_ids, [11720]);
  assert.equal(decoded.text.includes("11720"), false);
});
