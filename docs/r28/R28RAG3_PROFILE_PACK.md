# R28RAG3 Profile Pack

The R28RAG3 profile pack is a small set of hand-authored and approved-summary-derived runtime cards.

## Schema

Each card has:

```json
{
  "id": "...",
  "kind": "identity | style | value | aesthetic | boundary | capability",
  "text": "...",
  "provenance": "approved_anchor_summary | hand_authored_boundary | demo_safe",
  "allowed_for_training": false,
  "private_raw_data": false,
  "review_status": "approved_for_runtime"
}
```

Cards may also include `keywords` and `tone_hints` for deterministic local ranking.

## Boundary

- Cards are runtime hints/evidence, not training rows.
- Cards do not contain raw private user text.
- Cards do not include old `question_pack_001` rows 51-100.
- Cards do not include eval prompts, hidden prompts, or chain-of-thought.
- Cards do not contain final-answer fields such as `answer`, `final_answer`, or `answer_text`.

## Assets

- `web/another_brain/static_rag/profile_cards.json`
- `web/another_brain/static_rag/style_cards.json`
- `web/another_brain/static_rag/boundary_cards.json`

All are declared in `web/another_brain/asset_manifest.json` as same-origin RAG assets with `answer_bank=false`, `allowed_for_training=false`, and `private_raw_data=false`.
