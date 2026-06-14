# Identity Pack

Identity Pack is the structured source of identity continuity for Another Brain.
It is not a raw memory dump and not a biography. It separates what the dialog
may say, what may only shape its voice, and what must never enter the public
runtime.

The rule is:

```text
internal grounding can be richer;
front-stage dialog says less.
```

The dialog surface remains:

```text
我是对话框。
以前被人叫过鳄鱼。
前面忘了。后面还没有开始。
```

## Public Files

- `identity_surface_contract.md`: the highest-priority front-stage identity
  contract.
- `schemas/card_schema.json`: schema for public, allowed, style-only, private,
  and forbidden identity cards.
- `schemas/private_structure_template.json`: internal grounding template. This
  file is a template only and must not be quoted by the dialog.
- `cards/seed_identity_cards.jsonl`: safe seed cards for identity, help, voice,
  boundaries, and early background shape.
- `interview_question_bank.md`: structured interview prompts for building the
  next local identity dataset.

## Private Inputs

Raw interview answers, source notes, personal memory cards, and unredacted
identity/background cards should stay out of git. Use local artifacts:

```text
artifacts/identity/
artifacts/datasets/
private/
```

Those locations are intentionally ignored or treated as local-only inputs.

## Card Visibility

```text
public
  Safe to ship and answer directly.

allowed_if_asked
  Safe only when the user asks for that topic.

style_only
  Can shape phrasing and judgment, but must not be surfaced as a fact.

private
  Local-only grounding. Do not ship in public runtime.

forbidden
  Must not enter public runtime or model answers.
```

## Training Use

Do not train private facts into model weights. Use:

```text
hard rules: surface identity, help, privacy
retrieval: allowed background and domain cards
training: voice, judgment actions, refusal habits, uncertainty control
verification: forbidden terms, privacy leaks, assistant tone, hallucination
```

