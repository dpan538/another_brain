# R28SHIP0 Branch Feature Inventory

R28SHIP0 starts from `origin/r28ux5-chat-dashboard-split` and keeps the UX5 minimal Chat/Dashboard shell. `origin/r28hotfix3-q4-asset-path-fix`, `origin/r28hotfix2-nonblocking-selfcheck`, and `origin/r28rout1-fuzzy-intent-surfaces` are already ancestors of UX5. `origin/r28load0-model-loading-state-machine`, `origin/r28surf3-anchor-natural-surfaces`, and `origin/r28rag3-lightweight-profile-rag` are not ancestors, so R28SHIP0 integrates the required runtime behavior without replacing UX5 UI.

The inventory script records commit, subject, and feature evidence for:

- `origin/r28hotfix3-q4-asset-path-fix`
- `origin/r28load0-model-loading-state-machine`
- `origin/r28hotfix2-nonblocking-selfcheck`
- `origin/r28rout1-fuzzy-intent-surfaces`
- `origin/r28surf3-anchor-natural-surfaces`
- `origin/r28rag3-lightweight-profile-rag`
- `origin/r28ux5-chat-dashboard-split`

Feature checklist:

- q4 asset path normalizer
- absolute same-origin shard URL
- non-blocking self-check
- loading state machine
- route loop fix
- fuzzy intent router
- natural answer surfaces
- minimal chat/dashboard split
- exact tokenizer
- q4 runtime smoke

Run:

```bash
python3 scripts/r28ship0_branch_feature_inventory.py
```

Output:

```text
artifacts/r28ship0/reports/branch_feature_inventory.json
```
