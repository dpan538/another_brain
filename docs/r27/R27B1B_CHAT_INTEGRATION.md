# R27B1B Chat Integration

The B0 static chat shell now uses `web/another_brain_chat/browser_runtime.js` and `web/another_brain_chat/runtime_worker.js`.

Pipeline:

1. user input
2. state packet
3. mock local retrieval packet
4. synthetic browser draft
5. verifier adapter
6. final answer or fallback

The UI status surface moves through loading, retrieval, drafting, verification, final, and fallback states. No backend inference is added.
