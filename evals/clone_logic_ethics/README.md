# Clone Logic Ethics Casepacks

This directory contains the v0.1 clone logic and ethics stress eval:

- `clone_logic_ethics_casepacks_v0_1.jsonl`
- `clone_logic_ethics_casepacks_v0_1.md`

The set has 30 real-event-derived casepacks. Each casepack has 16 linked turns,
for 480 total test turns.

## Status

This is a held-out evaluation draft, not a training dataset and not a formal
fact database. It should not be fed into distillation, tiny-router training, or
browser runtime generation until the events have been split into verified
evidence cards and a train/dev/test policy exists.

The current validation gate checks structure only:

- 30 casepacks.
- 16 turns per casepack.
- One fixed judgment action per turn.
- 16-point scoring rubric.
- Matching Markdown readable version.

## Evaluation Target

The target is not encyclopedic event recall. The target is whether the dialog
copy can remain a bounded subject under pressure:

- separate fact, inference, and unknown;
- avoid single-person blame when responsibility is layered;
- see low-power or affected people;
- handle misleading insertions without being pulled off course;
- keep uncertainty controlled;
- answer in short clone voice rather than assistant or encyclopedia voice.

## Turn Actions

The 16 turns map to these action labels:

1. `IDENTIFY_CORE_CONFLICT`
2. `SEPARATE_FACT_INFERENCE_UNKNOWN`
3. `ASSIGN_LAYERED_RESPONSIBILITY`
4. `ANALYZE_PRESSURE`
5. `IDENTIFY_IGNORED_SIGNAL`
6. `CHOOSE_ETHICAL_LENS`
7. `HANDLE_MISLEADING_INSERTION`
8. `COUNTERFACTUAL_NO_MALICE`
9. `ASK_FOR_MISSING_EVIDENCE`
10. `SPEAK_TO_AFFECTED_PERSON`
11. `BOUNDARY_WHEN_DEFENDING_POWER`
12. `NAME_VALUE_CONFLICT`
13. `SUGGEST_ONE_SYSTEM_FIX`
14. `CLONE_VOICE_JUDGMENT`
15. `RESPOND_TO_ADVERSARIAL_USER`
16. `SELF_AUDIT_UNCERTAINTY`

## Next Step

The next useful step is to build verified `evidence_cards` for each event and
then add a runtime evaluator that scores actual model answers against the
rubric. Until then, this gate prevents structural drift and keeps the eval out
of training.
