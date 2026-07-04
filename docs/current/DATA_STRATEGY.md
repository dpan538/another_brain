# Current Data Strategy

The most valuable new data is user-answered question data. another_brain needs examples of how the user would answer, partially answer, refuse, redirect, reframe, or resist unsupported pressure.

Poems, essays, docs, and project notes are useful as style or question sources. They are not direct dialogue corpus unless transformed, reviewed, and approved.

## Best Future Data

- Natural questions from friends, collaborators, project agents, strangers, and public comments.
- User answers to those questions.
- Bad assistant answer plus user correction.
- Non-answer, refusal, redirection, and counterquestion examples.
- Weird abstract question examples that should be abstracted rather than refused.
- Unsupported challenge examples such as "你说错了？" where concession is not automatic.
- Multi-turn context reasoning with clear relationship and evidence boundaries.

Root DOCX/PDF files and `data/public_ingestion/` remain metadata-only until separately approved. Future collection should be batched, reviewed, and split without eval contamination.

Future teacher output is only candidate/probe material unless explicitly reviewed. It must not enter training corpus automatically.

## R26C Question-Pack Boundary

The first 100-question pack is only partially useful. Question IDs 1-50 are review-only candidates; they are not automatically training rows. Question IDs 51-100 are excluded from training because they are project-meta, training-meta, progress-check, tool-status, or structure-discussion prompts rather than friend-facing answer-as-user material.

Project progress and training-process questions must not become normal dialogue corpus. another_brain should answer friends' or known-context questions as the user, not learn to discuss its own training pipeline as ordinary product behavior. The model should not train on "what phase are we in" or "what should the project do next" questions as user-facing corpus. Those meta questions may remain in docs, cleanup notes, or project-management context only.

Future question packs should focus on external-facing questions, unsupported challenges, weird questions, friend context, non-answer boundaries, and answer-as-user behavior. Replacement rows 51-100 should be generated only after schema review and must avoid project-status or training-pipeline prompts unless they are genuinely framed as external relationship questions.
