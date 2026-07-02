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
