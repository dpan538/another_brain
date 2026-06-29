# R25F Removed Candidate Purge

R25F removes the prior named decoder candidate from the active repository
surface and resets R25 to a model-agnostic decoder intake path.

The earlier candidate-specific references were too specific for an unapproved
model decision. They could make the project look as if a model had already been
chosen, even though no local artifact was admitted, no backend was bound to a
real format, and no user approval marker authorized model assets.

## Current State

- No named model is selected.
- No replacement named candidate is introduced.
- The candidate matrix uses generic decoder-artifact classes.
- Artifact request examples use `browser_decoder_candidate_tbd`.
- The R25 target remains a same-origin static browser decoder LLM.
- R24 remains fallback, verifier, and regression harness.
- No training was run.
- No real weights were added.
- No artifact was admitted.

## Future Decision Rule

The next model decision must happen in a later reviewed step. It may come from a
user-supplied local decoder artifact or from a separate model-selection review,
but it must not be implied by stale docs, scripts, generated matrices, corpus
rows, fixture paths, or package outputs.

The reviewed candidate still must satisfy the existing R25 constraints:

- same-origin static assets only
- browser-side loading and inference only
- no extra backend or external storage
- no remote model API
- explicit artifact metadata, license, provenance, hashes, and review status
- Pro static profile as the primary budget target
- R24/R25 gates green before any production admission
