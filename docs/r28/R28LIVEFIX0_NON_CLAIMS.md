# R28LIVEFIX0 Public Runtime Boundaries

R28LIVEFIX0 keeps the public runtime boundary small and explicit:

- static browser runtime only.
- no product-model admission claim.
- no release checkpoint or phase approval.
- no training in this release gate.
- no new model weights or q4 shards.
- no tokenizer training artifacts.
- no raw, clean, or processed corpus dumps.
- no backend, Function, Edge, external LLM, or hosted vector runtime path.

R28LIVEFIX0 changed only the public static runtime and diagnostics:

- live-preview branch marker correction.
- GET/Range/body-byte q4 shard probe correction.
- dashboard probe observability.
- manual diagnostics function.
- merge readiness correction that blocks `merge_ready` until live q4 mount is proven.
