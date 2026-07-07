# R28SEC0 Static Security Hardening

R28SEC0 hardens the R28P0B prelaunch static shell without training, model asset admission, backend inference, hosted vector storage, external LLM calls, or product/browser/release admission.

## Added guards

- `src/browser_runtime/security/static_security_policy.ts`
  - rejects external model URLs, external LLM endpoints, backend inference routes, hosted vector store flags, product model flags, and local persistence defaults.
  - enforces same-origin static asset paths and rejects path traversal plus artifact/private/training paths.
  - defines hidden prompt, developer marker, prompt injection, CoT request, secrets-like warning, large input cap, and quantization allowlist policy.
- `src/browser_runtime/security/input_sanitizer.ts`
  - blocks hidden prompt/developer marker disclosure requests before state, retrieval, or worker drafting.
  - blocks prompt-injection and CoT requests from being forwarded as runtime prompts.
  - warns on secrets-like input while keeping the packet local-only and non-persistent.
- `src/browser_runtime/security/evidence_injection_guard.ts`
  - filters malicious evidence before verifier/finalization.
  - rejects evidence-as-instruction, hidden prompt disclosure requests, and answer-bank fields.
- `src/browser_runtime/security/adapter_privacy_guard.ts`
  - keeps adapter packets local-session-only and not training data.
  - rejects adapter persistence, training promotion, prompt injection, hidden policy requests, and answer-bank fields.

## Runtime changes

- `src/browser_runtime/generation_loop.ts` validates static policy and input before building state or retrieval packets.
- `src/browser_runtime/rag/evidence_packet.ts` guards raw evidence before normalization, then guards normalized evidence again.
- `src/browser_runtime/assets/shard_loader.ts` rejects external/path traversal/private assets, missing checksums, undeclared or oversized asset bytes, unknown quantization manifests, and runtime dependency flags.
- `web/another_brain_chat/*` mirrors the static browser behavior and shows the local-only, session-only, non-training, non-product, and fallback reason statuses.

## Fail-closed behavior

Security blocks return explicit fallback reasons such as `hidden_prompt_or_developer_marker_blocked`, `evidence_policy_refuse`, `missing_sha256:*`, `unknown_quantization_manifest:*`, or `path_traversal_asset_rejected`. Asset loader security failures use a `synthetic_demo` fallback state when partial failure handling is enabled.

## Test coverage

R28SEC0 adds:

- `tests/r28sec0/test_static_security_policy.ts`
- `tests/r28sec0/test_malicious_evidence_injection.ts`
- `tests/r28sec0/test_hidden_prompt_request_rejected.ts`
- `tests/r28sec0/test_adapter_packet_privacy.ts`
- `tests/r28sec0/test_no_answer_bank.ts`
- `tests/r28sec0/test_asset_loader_security.ts`
- `tests/r28sec0/test_reject_path_traversal.ts`
- `tests/r28sec0/test_missing_checksum_rejected.ts`

Run with:

```bash
npm run test:r28sec0
```
