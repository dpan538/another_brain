# R28SHIP2 Branch Inventory

R28SHIP2 scans the selected remote R28 refs with `scripts/r28ship2_branch_inventory.py`.

Output:

- `artifacts/r28ship2/reports/branch_feature_matrix.json`

Required feature columns:

- q4 assets
- exact tokenizer
- q4 path normalizer
- `.vercelignore` bin fix
- route loop fix
- non-blocking self-check
- model loading state machine
- retry before fallback
- open-question SLA
- QA6 latency matrix
- fuzzy intent router
- natural answer surfaces
- lightweight RAG/profile pack
- Chat/Dashboard UI
- mobile loading UI
- build:vercel pass evidence
- no-training gates evidence

Source-of-truth notes:

- `r28qa6-latency-open-question-qa` is the strongest answer/no-hang lineage because it includes SHIP0, HOTFIX4, SURF5, and QA6.
- `r28load0-model-loading-state-machine` is selectively integrated for its loading state schema and tests without replacing QA6 runtime/UI.
- `r28rag3-lightweight-profile-rag` is reviewed as profile-RAG evidence; the final runtime keeps the QA6-compatible static profile pack and adds expressive-context compatibility.
- `r28a13-abstract-value-sft` is evidence only and is not admitted.
