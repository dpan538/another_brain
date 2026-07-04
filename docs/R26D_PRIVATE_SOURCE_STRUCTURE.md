# R26D Private Source Structure

R26D uses a concrete ignored intake area so raw materials do not sit loose in the project root and do not become tracked corpus by accident.

## Canonical Local Folders

- `private_sources/question_packs/`
  - answered CSV/XLSX/JSON question packs for approved intake.
- `private_sources/writing_examples/poetry/`
  - user-owned poetry or poem-like writing examples, metadata-only until a later parsing approval.
- `private_sources/writing_examples/essays/`
  - user-owned essays or long-form writing examples, metadata-only until a later parsing approval.
- `private_sources/writing_examples/fragments/`
  - user-owned fragments, notes, and short writing examples, metadata-only until a later parsing approval.
- `private_sources/source_documents/review_needed/`
  - local documents that need classification before any use.

`private_sources/` is ignored by Git. Raw files in this tree are private local source material, not active corpus and not public project files.

## R26D Placement

The answered first question pack is expected at:

`private_sources/question_packs/another_brain_question_pack_001_answered.csv`

The root-level `Church.pdf` and `Poetry_Collection.pdf` writing examples were placed under:

`private_sources/writing_examples/poetry/`

They are not parsed in R26D and are not training input.
