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
