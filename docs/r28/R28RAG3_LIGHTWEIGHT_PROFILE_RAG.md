# R28RAG3 Lightweight Profile RAG

R28RAG3 upgrades the static RAG layer from a demo memory fixture into a small runtime profile/context pack. It remains browser-side and static-only.

## Assets

- `web/another_brain/static_rag/profile_cards.json`
- `web/another_brain/static_rag/style_cards.json`
- `web/another_brain/static_rag/boundary_cards.json`

The existing `demo_memory.json` remains available. `asset_manifest.json` now declares all four RAG assets with exact bytes and SHA-256.

## Card Contract

Each card is a runtime evidence hint:

```json
{
  "id": "r28rag3_profile_identity_crocodile",
  "kind": "identity",
  "text": "...",
  "provenance": "approved_anchor_summary",
  "allowed_for_training": false,
  "private_raw_data": false,
  "review_status": "approved_for_runtime"
}
```

Allowed kinds are `identity`, `style`, `value`, `aesthetic`, `boundary`, and `capability`.

Allowed provenance values are `approved_anchor_summary`, `hand_authored_boundary`, and `demo_safe`.

## Runtime Path

`src/browser_runtime/rag/profile_retriever.ts` validates cards and ranks them with the existing lightweight token/character matching strategy. It adds kind-aware boosts for identity, style, boundary, capability, value, and aesthetic questions.

`src/browser_runtime/rag/expressive_rag.ts` merges profile card evidence with the existing static evidence packet. It adds an `expressive_context_pack` that is explicitly marked as runtime hints only.

No vector index is created. No hosted vector store is used.

## Source Display

Dashboard trace sources now include:

- `source_id`
- `title`
- `trust_level`
- `retrieval_score`
- `provenance`
- `kind`
- `review_status`

Chat mode only uses a compact hint summary and keeps the user-facing surface minimal.

## Verification

Covered by `npm run test:r28rag3`:

- card schema validation
- same-origin profile asset loading
- retrieval ranking
- expressive context pack shape
- dashboard provenance markers
- no broad answer bank
- no backend or external runtime surface
