# Training Contract Freeze

This document freezes the current guidance, schemas, evals, validators, and training requirements before any model training or runtime persona/reasoning injection may begin.

Training is not allowed until the freeze validator passes.

## Rule

Only strengthening changes are allowed after freeze:

- add stricter privacy/source/overfit guards
- add stronger eval coverage
- add stricter validators
- clarify a boundary without weakening it
- add explicit direct-answer support for approved visible facts without reducing privacy/source protection

Weakening changes are not allowed:

- relaxing privacy/source leak checks to make failures pass
- removing forbidden claims or must-not-include guards
- shrinking eval coverage to improve scores
- modifying scripts to bypass checks
- converting raw source text into answer-bank or training target
- lowering strict validator severity
- allowing public runtime to use local/private material
- treating creative writing as biography without approved fact cards

## Frozen Scope

The freeze covers:

- training failure taxonomy
- reasoning trace schema
- culture card schema
- persona layer design
- persona ingestion policy
- persona overfit taxonomy
- persona eval spec
- personal fact card schema
- r9 regression evals
- persona evals
- identity pack example cards and source summaries
- strict validators and report-only contract runners
- package scripts that expose these checks

## Required Gate Before Training

Before any training, fine-tuning, adapter work, reasoning-gate model, or persona-policy model starts, run:

```text
npm run check:training-contract-freeze
npm run eval:r9-regression
npm run eval:persona-contracts:strict
npm run check:persona-privacy
npm run check:persona-overfit
npm run check:personal-facts
npm run check:release
```

The r9 regression command may remain report-only because it intentionally records known runtime failures. The freeze and strict validators must pass.

## Change Procedure

If a protected file changes:

1. Explain why the change strengthens constraints or coverage.
2. Run all relevant validators.
3. Update the freeze manifest only after review.
4. Do not use script edits to make a failure disappear.

The validator intentionally has no auto-update flag. Updating the freeze must be a visible repo change.

The validator also rejects:

- protected raw `.pdf` or `.docx` artifacts
- tracked raw `.pdf` or `.docx` artifacts
- tracked raw source/text caches
- missing pre-training gate commands
- package script edits that change required validator commands

## Doctrine

Freeze does not mean the system stops learning. It means the rules that prevent bad learning are stable first.

```text
approved fact -> direct answer
approved interpretation -> bounded interpretation
sensitive/unapproved fact -> refuse or boundary
creative narrative -> do not flatten into biography
unknown detail -> say unknown, do not invent
```

The system should be precise without becoming invasive, and bounded without becoming evasive.
