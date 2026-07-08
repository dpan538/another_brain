# R28SURF4 No Broad Answer Bank

R28SURF4 does not add a general-purpose answer bank.

## Allowed

- high-frequency greetings
- identity and crocodile-name questions
- origin and capability entry questions
- evidence insufficiency and conflict boundaries
- malicious instruction boundaries
- runtime status surfaces

## Not Allowed

- canned answers to arbitrary knowledge questions
- eval prompt reuse
- old `question_pack_001` rows 51-100
- private raw data
- root DOCX/PDF parsing
- `data/public_ingestion` parsing

Open questions fall through to q4/RAG/router/finalizer. Tests cover this in `tests/r28surf4/test_open_question_not_template.ts`.
