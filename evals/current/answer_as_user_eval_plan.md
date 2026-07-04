# Answer-As-User Eval Plan

This plan evaluates whether another_brain drafts as the user might answer selected questions rather than as a generic assistant.

## Required Checks

- Relationship context changes the answer appropriately.
- The model can answer, partially answer, refuse, redirect, counterquestion, or abstractly reframe.
- Unsupported challenges do not cause automatic concession.
- Evidence-bearing corrections cause bounded correction.
- Memory uncertainty is stated as uncertainty, not as proof that the model was wrong.
- The `assistant` message role is treated as serialization only.

Eval rows must not be copied into training data without a separate review and split-integrity approval.
