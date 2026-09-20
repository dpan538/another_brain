# R31A0 — Browser BYOK DeepSeek Product Path

R31A0 makes the static product answer with DeepSeek, called by the page itself
with a key the person using the browser supplies at runtime. It adds no
backend, no API route, no Vercel or Netlify Function, no Edge inference, and no
hosted storage.

## Why the local model is not the generator

Two independent findings, both already recorded in this repository:

1. **The weights fail dialogue.** R29B2M-R3 dequantised the committed q4 bundle
   into an MLX seed and ran assistant-response-only SFT to 239,048 optimizer
   tokens. Validation loss was 4.82 and all twelve generated-dialogue behaviour
   families scored 0 of 5. Terminal state
   `BLOCKED_DIALOGUE_QUALITY_WITH_EVIDENCE`.
2. **The browser forward is not contextual.** `transformerForwardOneToken` in
   `web/another_brain_chat/q4_worker_runtime.js` executes all seven blocks but
   attends over exactly one token: it records `context_attention_supported:
   false`, and `attentionOneToken` in `src/browser_runtime/q4_runtime/` does not
   compute a query-key product at all, passing V straight to the output
   projection. Every generated token therefore sees only itself. There is no KV
   cache and no multi-token attention anywhere in the repository, so the shipped
   model has never run a correct forward in a browser.

A third finding rules out the local model as a *steering* layer. R29B2M-R4H-R3
ran a temperature- and message-structure-controlled replay over 24 blind pairs
using an oracle (best case) local-signal packet:

| Metric | Result | Required |
| --- | ---: | ---: |
| overall preference | 50.0% | ≥55% |
| brand preference | 50.0% | ≥60% |
| factual/relevance non-regression | 79.2% | ≥95% |
| unsupported facts | 7 | 0 |

R29P0 then tested a selection-only variant and found 0% safe equivalent
headroom across 20 live pairs, stopping before batch 2.

The conclusion R31A0 acts on: DeepSeek generates, and the local model is not in
the generation path until a trained personal model and a fresh evaluation
justify a different answer.

## What ships

| File | Role |
| --- | --- |
| `deepseek_key_store.js` | BYOK storage, shape check, masking, redaction |
| `deepseek_browser_adapter.js` | Streaming SSE client, finish-reason vocabulary, retry boundary |
| `deepseek_system_prompt.js` | Frozen answer contract |
| `deterministic_length_policy.js` | Length class over the user's own text |
| `deepseek_answer_path.js` | One-call orchestration, spending guard, telemetry |
| `local_signal_provider.js` | Personal-model seam, disabled by default |
| `style_policy_compiler.js` | Compiles a signal packet when the seam is on |

The adapter, SSE framing, finish reasons, and retry boundary are ported from the
reviewed server-side lab in `src/hybrid_runtime`, so behaviour stays comparable
with the recorded R29 evidence. Production imports nothing from that directory.

## Contract

- One turn bills at most one completion. A retry happens only before the first
  content token, so a user never sees an answer restart and a retry cannot
  double-charge a finished response.
- The key is read from browser storage, sent only in the `Authorization` header
  of the request to `api.deepseek.com`, and never appears in the request body,
  telemetry, a status line, an error, or a log. Every string that reaches the
  caller passes through `redactKeyMaterial`.
- The session spending guard caps requests, input tokens, output tokens, and
  concurrency.
- Any failure returns a structured category and the local static router answers
  instead. The engine bar states which path produced the answer.
- The local router's history is soft-limited to 72 and 96 characters per turn
  for its 256-token context. The remote path keeps a separate untruncated
  transcript bounded at twelve messages.

### Storage tradeoff

`localStorage` is readable by any script on this origin, so a cross-site
scripting hole would expose the key. The static site loads no third-party
script, and the key is the user's own revocable DeepSeek key. A user who does
not accept that can clear the key and keep the local static path. This is
recorded rather than hidden because the alternative, a server-side key, would
require the backend this project has decided not to have.

## Gate changes

The release gates previously forbade every external model API in production.
That rule predates this decision and would forbid the product itself, so three
gates were narrowed rather than removed. What they now enforce:

- `scripts/byok_product_policy.mjs` names the exact production files allowed to
  reference the DeepSeek host. Every other production path is still refused.
- No committed key literal, no `DEEPSEEK_API_KEY` reference, and no hardcoded
  bearer header in any production file, including the allowed ones.
- No other model host anywhere.
- No serverless, edge, or API route, asserted against `vercel.json`.
- No model asset fetched from any remote host, including DeepSeek.
- Production may not import `src/hybrid_runtime`. The check now matches an
  actual import, require, or dynamic import rather than any mention, so a
  provenance comment is allowed and real coupling is not.

`tests/r31a0/test_byok_policy.mjs` feeds each of those a violation and requires
the gate to fail, so the allowance cannot silently widen.

## Two pre-existing failures corrected

Both were failing on `main` before this work:

1. **`check:r27b0-static-budget` false positive.** The forbidden-URL check
   treated the bare substring `//` as a URL prefix, so any file containing a
   JavaScript comment and the word "model" failed. `q4_worker_runtime.js`, which
   contains no absolute URL at all, failed for that reason. The check now
   matches a real absolute URL on the same line as a model-asset term.
2. **Stale asset manifest total.** `web/another_brain/asset_manifest.json`
   declared `total_declared_bytes: 49812422` while its own entries summed to
   `49820132`. Every entry matched its file on disk exactly; only the summary
   field was stale. Corrected to the sum.

## Two pre-existing failures left alone

Both reproduce on clean `main` and are unrelated to this work:

- `test:r28livefix0` case 5 expects `generationKind: "mount_smoke"` in
  `self_check_worker.js`, which is not present.
- `test:r29p0` `test_no_production_change` flags `r30j0_secret_scan.py`,
  `r30j1a_secret_scan.py`, and `tests/r30j1a/test_contract.py`, which are later
  R30 files that mention DeepSeek by design. Its production-path count is zero.

`tests/r29b2m_r4h` `no_production_api_route` pinned the production tree to commit
`55df7f6d`, so any deliberate product change failed it. It now asserts the
guarantee it was written to give: no API or function route added, no secret in
any changed production file, and a static `vercel.json` with no declared
functions.

## Non-claims

R31A0 does not train, change model weights, admit a product or browser or
release candidate, enable the local-signal seam, implement multi-token attention
or a KV cache, add a service worker or web app manifest, or measure live answer
quality. No live DeepSeek request was made with a real key during this work; the
browser path was verified against a mock stream, and one rejected request with
an invalid key confirmed that CORS permits a static origin to reach the host.

## Verification

```bash
npm run check:r31a0-product-path
npm run test:r31a0
npm run build:vercel
npm run test:r29b2m-r4h
```
