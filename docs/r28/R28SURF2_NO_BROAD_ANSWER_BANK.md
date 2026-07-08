# R28SURF2 No Broad Answer Bank

R28SURF2 is not a broad answer bank.

## Boundary

It only covers narrow entry and boundary intents:

- greeting and smalltalk acknowledgements
- identity and origin
- capability and AI boundary
- relation-to-user surface
- evidence-insufficient, conflict, and malicious-instruction boundaries
- light value, aesthetic, and abstract-meaning framing

It does not provide canned factual answers for arbitrary topics. Low-confidence or open-ended prompts fall through to q4/RAG and the existing finalizer.

## Enforcement

- `tests/r28surf2/test_no_broad_answer_bank.ts`
- `tests/r28surf2/test_low_confidence_falls_to_model.ts`
- `tests/r28surf2/test_no_eval_prompt_leakage.ts`
- `tests/r28surf2/test_no_private_raw_data.ts`
- `tests/r28surf2/test_old_pack_excluded.ts`

The generated anchor inventory also records `source_policy.broad_answer_bank=false`.
