# R25C Static Artifact Intake

R25C prepares the local intake pipeline for a real same-origin static decoder
LLM artifact. It does not train, download, convert, benchmark, or admit model
weights by default.

## Intake Paths

Approved local-only intake paths:

- `static_llm/inbox/`
- `static_llm/models_staging/`

Real model-like files in those paths are ignored by default. They must stay
unstaged unless the user explicitly approves a later production admission after
the artifact passes metadata, manifest, budget, no-backend, and R24/R25 gates.

## Required Metadata

Each local candidate needs `artifact_metadata.json` with model identity,
architecture, parameter count, quantization, context length, tokenizer type,
license, source provenance, conversion provenance, review status, reviewer,
target profile, expected size, and `contains_private_data: false`.

Example or dummy metadata cannot be admitted. Encoder-only artifacts cannot be
the final product target. Decoder-only remains preferred.

## Decision Boundary

The primary review class is reset to a model-agnostic decoder-only browser
candidate. No named model is selected until a later reviewed decision or a
user-supplied local artifact is provided. It is not admitted unless a local
artifact passes the R25C gate. A q4-ish artifact in the
hundreds of MB can be acceptable for `pro_static_llm_full` if it stays below
the policy budget and shard limits. `hobby_static_llm_lite` may reject it.

R25C makes no real browser performance claim. Actual runtime capability depends
on a later admitted artifact and a browser inference backend.

## Admission Requirements

Before real weights can be committed:

- metadata review status is `reviewed` or `approved`
- reviewer, license, license URL, source revision, and conversion provenance
  are present
- all manifest file hashes are real sha256 values
- paths are same-origin static paths under approved asset directories
- `same_origin_only: true`
- `external_urls_allowed: false`
- `backend_required: false`
- Pro static profile budget passes
- no backend, external API, or storage product is used for model loading
- R24 recovery, shard, Vercel, R25A, R25B, and R25C gates remain green

If no local artifact exists, the correct R25C result is a green blocked state:
no admitted model, fixture-only loader checks, and draft generation disabled.

R25D builds on that blocked state by adding a fixture first-token backend and
worker shell. If no artifact has been admitted, production first-token smoke
must be skipped with an explicit `no_admitted_static_llm_manifest` reason.

R25E is the first step that attempts local artifact admission. Without a
candidate under `static_llm/inbox/` or `static_llm/models_staging/`, it should
stop in a green blocked state and request a reviewed browser-ready decoder
artifact rather than inventing progress.
