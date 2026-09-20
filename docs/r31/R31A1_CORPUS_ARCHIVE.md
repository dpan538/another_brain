# R31A1 — Corpus Archive

The knowledge base is being rebuilt from owner-authored material. Three corpora
were removed from the active path first, because indexing them would harm the
new one rather than help it.

## Archived

| Corpus | Size | Where it went | Why |
| --- | ---: | --- | --- |
| `data/public_ingestion/` | 352 MB | `~/Desktop/another_brain_archive/data_public_ingestion` | Wikimedia-derived public passages, 2,918 files. Never tracked. General world knowledge that the remote answer layer already has. |
| `knowledge_sources/cards/` | 39 MB | untracked here; copy at `~/Desktop/another_brain_archive/knowledge_sources_cards` | 55,151 template-filled cards. Recoverable from git history. |

The card corpus was not knowledge. Every row carried
`provenance.method = mechanical_extract_from_r24f_build_source`, every row
carried `contains_private_data = false`, and the text was one sentence template
with the label substituted:

```
达盖尔银版摄影 → 达盖尔银版摄影摄影流派常常是在反对上一种看法。
卡罗式摄影     → 卡罗式摄影摄影流派常常是在反对上一种看法。
记忆变化       → 记忆变化是在提醒：记忆和变化都可能改变回答。
记忆一致性     → 记忆一致性是在提醒：记忆和一致性都可能改变回答。
```

The duplicated 摄影摄影 is a substitution artifact. Embedding 55,151 rows of one
template produces a dense cluster of near-identical vectors, which would
dominate nearest-neighbour results and bury the owner-authored cards that the
new knowledge base is for. Archiving it is a precondition for vector retrieval,
not a cleanup afterthought.

`web/knowledge_shards/` still exists and is still read by
`web/knowledge_runtime.js`, the legacy Answer Machine surface. The current chat
product under `web/another_brain_chat/` does not reference it, so the archive
does not touch the shipped product.

## Deliberately not archived yet

`web/another_brain/static_rag/reasoning_cards.json` holds 453 generic reasoning
templates and is a fair archive candidate on content. It is held back because it
is wired into the running product in three places:

- `web/another_brain/asset_manifest.json` declares it as a shipped asset;
- `web/another_brain_chat/static_retriever.js` loads it at startup;
- `tests/r28livefix0/test_diagnostics_contract.ts` asserts the retriever
  references it.

Removing it now would strip most of the local fallback's retrieval material
while its replacement does not exist. It should be archived in the same change
that promotes the first owner-authored cards, so the fallback never runs with an
empty index.

## Recovery

```bash
# public ingestion, moved as-is
ls ~/Desktop/another_brain_archive/data_public_ingestion

# template cards, from git history
git show 950fe5a:knowledge_sources/cards/cards_000.jsonl | head
```
