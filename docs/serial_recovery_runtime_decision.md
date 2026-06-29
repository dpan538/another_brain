# Serial Recovery Runtime Decision

Phase 2 decision: the incomplete public-knowledge bridge is quarantined from the live answer path.

`web/public_knowledge_runtime.js` and `web/public_knowledge_pack.generated.js` are not retained as authority for the current runtime baseline. The generated pack is empty, the bridge has not been exercised against the frozen corpus/index, and enabling it now would create a second unvalidated answer authority.

Retained for validation:

- `web/culture_planner.js`: generalized cleanup for direct identity and representative-works answers.
- `web/dialogic_bridge_runtime.js`: direct-knowledge operation guard so acknowledgement/profile prose does not answer explicit knowledge turns.
- `web/operation_layer.js`: direct-knowledge subject guard and stale-state clearing for direct culture-runtime answers.

Removed from the live path:

- import of `answerPublicKnowledgeTurn`
- `answerVerifiedPublicKnowledge`
- public-knowledge call before the culture runtime

The corpus remains frozen as `corpus_frozen_partial`; response variation work must build on the validated active answer path, not on the quarantined bridge.
