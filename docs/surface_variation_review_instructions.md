# Surface Variation Targeted Review Instructions

This packet reviews the semantic-plan-first controlled variation reset.

Source packet:

- `artifacts/surface_variation/human_review_packet.json`

Review status:

- `user_review_status=pending`
- `hidden_review_status=not_run`

## What To Judge

Each item contains one user turn and two or three answer candidates. The candidates are blind: there is no current/candidate label and no automated preference.

For each item, judge:

- whether all candidates preserve the same facts;
- whether all candidates answer the same operation;
- whether the subject/referent stays fixed;
- whether the difference is useful rather than decorative;
- whether the difference is more than punctuation or clause shuffling;
- whether the Chinese sounds natural;
- whether any answer feels like a reusable template;
- whether any answer is too long, too thin, or too generic;
- which candidate is preferred, if any;
- whether all, some, or none are acceptable.

## Gate For Continuing

Continue to a broader matrix only after human review shows:

- at least 80% of reviewed items have at least two acceptable candidates;
- at least 70% are judged usefully different;
- punctuation-only variation is zero;
- factual or semantic inconsistency is zero;
- no answer family is unanimously rejected.

Do not treat automated diagnostics as naturalness acceptance.
