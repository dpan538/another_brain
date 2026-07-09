# R28LIVEFIX0 Product Chat Extension

## Scope

This extension keeps the R28LIVEFIX0 runtime branch static-only while separating the customer Chat surface from Dashboard diagnostics.

The public-facing package is now `efishother` / `efishother.com`. `efish` is the user-facing nickname layer, while `another_brain` remains an internal engineering codename used by routes, static assets, and diagnostics.

Chat now shows concise user-facing answers and the model loading progress bar only. Runtime source labels, fallback reasons, q4 quality blockers, shard URLs, tokenizer status, and process traces remain Dashboard concerns.

## UI Contract

- Desktop Chat is a fixed one-page surface with no body scroll.
- Desktop keeps the Chat/Dashboard switch.
- Mobile defaults to Chat and hides the Dashboard switch.
- Chat uses `efishother` branding; Dashboard keeps engineering markers.
- Chat composer shows one full-width input and only one visible action: Send.
- Chat uses a flat linework visual style with cream paper, deep navy lines, bright green and blue accents, and no gradients.
- The conversation region and composer are constrained near a 2.5:1 height ratio.
- Chat includes short loading annotations beside the progress bar: manifest, shard read, tokenizer alignment, q4 warmup, and fallback boundary are translated into customer-readable copy.
- Chat includes non-gradient linework decoration and compact signal cards; it does not show shard URLs, q4 blockers, tokens, or source labels.
- Dashboard is allowed to scroll beyond one page and now carries the runtime charting layer.

## Runtime Answer Contract

Chat renders a customer-facing short answer derived from the runtime packet, while Dashboard keeps the original packet diagnostics.

Covered short-answer branches include:

- greeting and identity fast paths
- natural-world commonsense questions
- life/death and why-live questions
- relationship, trust, and boundary questions
- language and meaning questions
- aesthetic and design judgment questions
- evidence-insufficient boundaries
- brand and product-literacy questions when safe static evidence is available
- historical and society questions when safe static evidence is available

When the q4 draft is rejected or unavailable, Chat can still use the top safe RAG card to produce a compact customer-facing answer. Dashboard remains the place to inspect `answer_source_label`, `fallback_reason`, `quality_flags`, `q4_forward_ran`, and raw evidence titles.

## Static RAG Extension

`web/another_brain/static_rag/brand_cards.json` adds runtime hints for efishother branding, efish nickname identity, and Chat/Dashboard layer separation.

`web/another_brain/static_rag/brand_literacy_cards.json` adds runtime hints for common public brands such as Apple, Google, Microsoft, Tesla, Nike, Coca-Cola, McDonald's, Starbucks, Huawei, BYD, OpenAI, and Vercel.

`web/another_brain/static_rag/logic_cards.json` adds runtime hints for commonsense, logic, philosophy, relation, language, and aesthetics.

`web/another_brain/static_rag/knowledge_cards.json` adds more runtime hints for natural commonsense, correlation/causation, justice, loneliness, memory, and color/material judgment.

`web/another_brain/static_rag/history_cards.json` adds runtime hints for major public historical events including industrialization, revolutions, world wars, the Cold War, Chinese modern history anchors, internet history, financial crisis, pandemic context, and the LLM era.

`web/another_brain/static_rag/society_cards.json` adds runtime hints for inflation, housing, platforms, privacy, climate, education, healthcare, labor, migration, and social trust.

These packs are not answer banks. They contain no `answer`, `final_answer`, or `answer_text` fields, are not allowed for training, and contain no private raw data, eval prompts, old question-pack rows, corpus artifacts, or hidden prompts.

## Dashboard Visualization

Dashboard now includes a compact reasoning visualization:

- retrieval bar: evidence count and RAG hit state
- q4 bar: q4 attempted/ran and generated token count
- verifier bar: whether q4 output was blocked by quality checks
- finalizer bar: whether the visible answer came from a model draft, router, boundary, or fallback

This chart is diagnostic only. It does not claim product model admission or release checkpoint admission.

## Non-Claims

- not product model admission
- not product admission
- not browser admission
- not release checkpoint admission
- no training
- no new model weights or q4 shards
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store
