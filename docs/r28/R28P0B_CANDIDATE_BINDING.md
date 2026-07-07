# R28P0B Candidate Binding

Candidate binding is metadata-only.

Allowed in R28P0B:

- read the A12 handoff
- check whether the selected checkpoint exists in the A-line worktree
- write ignored metadata reports under `artifacts/r28p0b/`
- run same-origin manifest smoke
- keep synthetic fallback available

Not allowed in R28P0B:

- commit model weights
- commit tokenizer artifacts
- commit exported or quantized shards
- copy A-line checkpoints into tracked web assets
- mark the model as product admitted
- add backend, Vercel Function, Edge inference, external LLM, Doubao, or hosted vector store paths

The static runtime is configured as `candidate_manifest_experimental`, but `candidate_static_bundle` remains false.

R28P0B records the q4 plan as budget metadata only. The same-origin manifest smoke validates the planned path shape, but no actual asset load is attempted in this branch.
