# R25AB Personal Color Boundary

Personal color is allowed only when it is reviewed, project-appropriate, and
safe to train. The goal is a Chinese-first model with recognizable project
style and bounded judgment, not a model that leaks private files or invents
personal memory.

## Allowed Sources

- Project-authored style examples.
- User-approved preferences.
- Project decision history.
- Observable project constraints.
- Chinese tone samples written for this repository.
- Public, non-private self-description boundaries.

## Forbidden Sources

- Raw private memory.
- Root PDFs or DOCX files unless explicitly reviewed in a later cycle.
- `data/public_ingestion/` unless explicitly reviewed in a later cycle.
- Hidden prompts.
- Chain-of-thought data.
- Local private paths.
- Secrets.
- Unreviewed personal documents.
- Exact eval prompt copies.
- Medical, legal, or financial private claims without review.
- Pretending personal memory exists when it has not been supplied.

## Training Boundary

R25AB does not add private raw data, does not add personal documents, and does
not train. Future personal-color data must be reviewed as project-authored or
user-approved material before use.

R25AC personal-color coverage is allowed only as reviewed structural coverage:
project continuity, repair after weak answer, local-first browser-static
reasoning, style preference, tool-status honesty, and bounded judgment. The
coverage report is not evidence of private memory and must not fabricate
personal facts.

R25AD keeps the same boundary. Its personal-target audit may count reviewed
R25L labels and project-authored style rows, but it must not introduce private
raw memory, root PDFs/DOCX, `data/public_ingestion/`, exact eval prompt copies,
or chain-of-thought data.

R25AE keeps root PDFs/DOCX, `data/public_ingestion/`, and ignored artifacts as
metadata-only inventory surfaces. It does not train, does not expand corpus,
does not scan outside the repo, and does not commit generated inventory
artifacts or private contents. R25AF is only the intake and transformation
design step. R25AG is the future derived-corpus expansion candidate, and may use
only reviewed project-authored Chinese-personal rows after fresh approval. Any
later training needs separate fresh approval.

R25AF narrows the personal-writing path. User poems, essays, fragments,
preferred answers, and repaired answers are useful as style/source material, but
raw writing is not direct dialogue data and must remain private/local unless
explicitly approved. Future corpus rows must be reviewed transformations:
dialogue rows, preference pairs, repair pairs, style cards, or
project-continuation rows. R25AF does not parse raw personal writing, does not
generate rows, does not train, and does not commit private raw writing. R25AG
may later generate derived rows only after fresh approval; later training still
requires another approval.
