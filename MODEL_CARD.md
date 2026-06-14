# Model Card: Another Brain Tiny Router Web SLM

## Intended Use

Browser-side route-and-answer auxiliary for a bounded dialog copy. It helps
choose response strategies and return compact calibrated answers inside the
public static runtime.

## Not Intended Use

This artifact is not intended for general-purpose generation, legal, medical, or
financial advice, identity inference, private file reconstruction, open-ended
factual answering without retrieval, or autonomous decision-making.

## Architecture

Character n-gram classifier plus conservative answer index. It is a
route-and-answer Web SLM artifact, not a generative language model.

The runtime path is:

```text
deterministic dialog rules
  -> static knowledge lookup
  -> tiny router route-and-answer artifact
  -> structured route/evidence/verifier fallback
  -> controlled fallback
```

## Training Data

The artifact is built from deterministic teacher cases, public dialog cases,
model-gate cases, correction pairs, common-knowledge cards, reasoning and
counterquestion calibration, context-window calibration, relationship-repetition
calibration, and persona alignment.

## Privacy

No raw personal memory cards are shipped in the public runtime. Private local
artifacts, drive inventories, source materials, model checkpoints, and LoRA
adapters are ignored by git and are not licensed for distribution.

## Known Limitations

- Not a generative model.
- Not an omniscient assistant or generic chatbot.
- Relies on deterministic rules and knowledge lookup.
- Weak open-domain reasoning outside calibrated routes.
- Weak paraphrase generalization compared with true language models.
- Exact-answer bias from the answer index.
- No independent factual authority without retrieval.
- Mobile memory and first-load performance still require device profiling.

## Current Snapshot

- Web artifact: 1,723,288 bytes.
- Feature weights: 18,000.
- Answer index: 787.
- Family-holdout accuracy: 0.9540 across 7,223 held-out examples from unseen source/tag/id families.
- Route accuracy: 0.9385.
- Public model-gate usage: 37/790 cases.
- Synthetic casepack capability eval: 10 casepacks, 160 questions, 0 failures.
- Knowledge shard validation: 43 shards, 55,151 cards, max shard size 179,996 bytes, full round-trip against the monolithic public artifact.
