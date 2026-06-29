# R24E Recovery Candidate

R24E turns the R24 recovery work into a clean recovery candidate. It closes the residual semantic misses from R24D, adds a residual-miss analyzer, adds a docs consistency check, and audits the remaining monolithic knowledge build source.

This is not a training patch. No external LLM APIs, model weights, converted artifacts, factual knowledge-card expansion, or chain-of-thought data were added.

R25 demotes R24E to safety harness, fallback layer, regression test suite, and
verifier/finalizer boundary. R24E should not be expanded into the main
intelligence layer. The future product target is a same-origin static browser
decoder LLM whose drafts are checked by the R24 gates and fallback firewall.

## Residual Miss Closure

Before R24E:

- `check:long-horizon`: pass, score `0.9583333333333334`; 23 of 24 seed tasks passed.
- `check:long-horizon-heldout`: pass, score `0.9666666666666667`; 29 of 30 held-out tasks passed.
- `check:r24d-heldout-recovery`: pass, score `0.9537037037037037`; several internal held-out recovery examples still failed.

After R24E:

- `check:intelligence-recovery`: pass, score `1`.
- `check:long-horizon`: pass, score `1`; 24 of 24 seed tasks passed.
- `check:long-horizon-heldout`: pass, score `1`; 30 of 30 held-out tasks passed.
- `check:r24d-heldout-recovery`: pass, score `1`; no internal failed examples.
- `eval:task-state-drift`: pass, score `1`.
- `eval:route-distribution`: pass, no route dominance failures.

The repair stayed general:

- Local-first deployment follow-ups preserve default-local, static Vercel, no-training, and no-cloud-inference markers.
- Template or weak-answer feedback with "do not expand knowledge" becomes behavior-recovery validation, not factual card expansion.
- Shard-first continuation outranks behavior-recovery continuation when the current task is lazy loading, routing, or monolith-import prevention.
- Held-out / split-integrity answers outrank shard-runtime answers when the user asks how to prove a fix is not a collision with existing prompts.

## New Checks

R24E adds:

- `npm run analyze:r24e-residuals`
- `npm run check:docs-r24-consistency`
- `npm run audit:knowledge-build-source`
- `npm run check:r24-recovery-candidate`

The recovery candidate gate is:

```bash
npm run check:r24-recovery-candidate
```

It runs docs consistency, residual analysis, split integrity, no-hardcoding, seed and held-out recovery gates, long-horizon validation, provenance validation, anti-lobotomy, dialogue-boundary, shard runtime, and Vercel checks.

## Docs Consistency

`check:docs-r24-consistency` keeps the story explicit:

- Historical R24A baseline failed.
- Current post-R24E gates are green.
- Training remains disabled by default.
- `web/dialog_rules.js` does not import `web/knowledge_base.generated.js` at runtime.
- No model weights were added.

Historical baseline scores are allowed only when labeled as historical, baseline, starting, or before R24E.

## Knowledge Build Source Audit

R24E originally reported:

- Original R24E build source: `web/knowledge_base.generated.js`.
- Public runtime imports monolith: false.
- Vercel excludes monolith: true.
- Source is tracked: true.
- Source is deployable: false.
- Original R24E recommended target: `artifacts/knowledge/knowledge_base.generated.js`.
- Migration safe now: false.

R24F supersedes that audit result. The build source now lives at
`build_sources/knowledge/knowledge_base.generated.js`, outside `web/`, so clean
checkout builds do not depend on ignored `artifacts/` state. R24G adds
`knowledge_sources/registry.json` and reviewed JSONL chunks as the source of
truth that derive that build source. `audit:knowledge-build-source`,
`audit:knowledge-source-derivation`, `check:clean-knowledge-build`, and
`check:knowledge-source-roundtrip` now verify the path.

## Training Status

Training remains disabled by default. The required flags stay false:

- `llmTrainingEnabledByDefault`
- `experimentalGeneratorEnabledByDefault`
- `personal200mEnabledByDefault`
- `externalSyntheticSamplesEnabledByDefault`
- `staticLlmEnabledByDefault`
- `staticLlmCandidateEnabledByDefault`
- `legacySlmRuntimeEnabledByDefault`
- `legacyPersonal200mEnabledByDefault`

## Before Training Resumes

Future bounded LLM training may resume only after reviewer approval and all of the following remain true:

1. Recovery candidate gate is green.
2. Held-out gates are green.
3. No eval hardcoding is detected.
4. Split integrity is green.
5. Provenance validation is green.
6. No chain-of-thought data is stored.
7. No model weights are committed to repo or `web/`.
8. Any generator is a bounded short-draft generator after deterministic routing, retrieval, verifier, and fallback firewall.
9. Privacy and unknown boundaries remain green.
10. Static LLM assets are same-origin, manifest-admitted, within budget, and do
    not require backend inference or external storage.

## R24F Work

- R24F moved the monolithic build source out of `web/` and kept `check:r24-recovery-candidate` green.
- R24G derives the generated build source from `knowledge_sources/` while keeping shard-first runtime and recovery gates green.
- Add qualitative review notes for any future held-out prompts before using them for training or model selection.

## R25B Boundary

R25B keeps this recovery candidate as a safety harness around a future
same-origin browser decoder LLM. The R24E seed and held-out prompts remain eval
material, not training targets. New LLM training-corpus rows must stay separate,
avoid exact eval prompt reuse, and pass contamination checks before they can be
considered for any later reviewed training run.
