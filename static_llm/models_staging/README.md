# Static LLM Models Staging

This directory is for local staged static decoder artifacts after inspection
planning. It may hold local model files while R25C tools generate dry-run
reports and candidate manifests.

Real model files remain ignored and unstaged by default. Production admission
requires explicit user approval after the R25C report, reviewed metadata,
profile budget pass, real hashes, same-origin static paths, and no backend or
external storage dependency.
