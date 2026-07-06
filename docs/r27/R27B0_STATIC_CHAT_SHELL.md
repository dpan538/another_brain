# R27B0 Static Chat Shell

R27B0 adds a static browser shell for the future another_brain conversation product at `web/another_brain_chat/`.

The shell is a local-only chat window with:

- message list
- input box and send button
- local-only indicator
- model loading placeholder
- retrieval packet debug toggle
- verifier and fallback status display
- no backend inference badge

The current runtime is deterministic mock code only. It demonstrates the intended packet path:

`input/state packet -> local retrieval -> browser local decoder draft -> verifier/finalizer/fallback -> answer`

No checkpoint, tokenizer artifact, backend inference endpoint, hosted vector store, or external LLM API is used.
