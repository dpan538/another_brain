# R28SOFTP0 Soft Prefix Feasibility

R28SOFTP0 is an audit-only feasibility note. It does not train, create prefix vectors, change runtime code, change model assets, or make product claims.

## Short Answer

- Current model has LoRA: no.
- Soft-prefix is the same as LoRA: no.
- Current model path: static q4 engineering candidate under `web/another_brain/model_assets/r28m1/`.
- Current runtime mode: `static_q4_experimental`.
- Current tokenizer: `exact_runtime_tokenizer`.
- Suitable for prelaunch insertion: no.
- Suitable for R29 experiment: yes, if bounded and explicitly non-product.

## Why Soft Prefix Is Not LoRA

LoRA adds low-rank trainable weight deltas to selected model layers. A continuous soft-prefix or P-Tuning v2 style method adds learned virtual-token embeddings, prefix key/value tensors, or prompt-embedding injections without treating them as ordinary text tokens.

Both are parameter-efficient adaptation methods, but they touch different runtime contracts:

- LoRA changes layer computation by applying adapter deltas.
- Soft-prefix changes the input/prefix state seen by attention, either through embeddings or prefix KV cache.
- Neither should be represented as a hand-authored answer bank.

## Required Runtime Changes

To support soft-prefix in the browser static q4 runtime, later work would need:

- prefix embedding asset loading and checksum metadata
- prefix KV or prompt embedding injection point before generation
- q4 forward compatibility for prefixed sequence length and cache layout
- tokenizer/runtime agreement that virtual prefix slots are not normal text tokens
- asset manifest fields for prefix version, shape, dtype, bytes, checksum, and intended route
- static budget checks for prefix bytes under the 100MB target
- route/debug visibility that prefix was or was not active
- fallback behavior when prefix assets are absent, corrupt, incompatible, or over budget

## Prelaunch Decision

Soft-prefix should not be inserted into the current prelaunch/product-preview path.

Reasons:

- It would require runtime forward-path changes.
- It would introduce new model-adjacent assets.
- It would need training or at least prefix-vector generation in a later approved experiment.
- It would create a new compatibility surface with q4 shard loading, exact tokenizer behavior, and cache layout.
- It would risk confusing current non-product q4 preview status with a new adaptation claim.

## R29 Experiment Shape

Soft-prefix is reasonable as an R29 experiment only if bounded:

- separate branch
- no product path mutation
- explicit approval before any prefix-vector training
- tiny public-safe or synthetic-only smoke scope first
- no external LLM API or Doubao
- no hosted vector store
- prefix assets kept out of product deploy unless separately admitted
- metrics focus on feasibility: loadability, q4 compatibility, latency, bytes, and answer-quality deltas

## Non-Claims

R28SOFTP0 does not claim:

- product model admission
- browser admission
- release checkpoint admission
- training approval
- prefix-vector training
- runtime support for soft-prefix
- LoRA support
- backend inference
- external LLM API use
- Doubao use
- hosted vector store use
