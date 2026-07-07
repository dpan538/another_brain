# R28UX3 Model Path Visibility

R28UX3 adds a visible model-path self-check button: `检查本地模型路径`.

The self-check verifies:

- same-origin asset manifest
- q4 shard list
- q4 shard deployability through same-origin asset probes
- exact runtime tokenizer metadata
- one-token q4 worker smoke when safe
- fallback availability

The UI separates asset availability from q4 participation:

- model assets may be present and deployable
- exact tokenizer may be present
- q4 forward may still fail or be unavailable in the static chat worker

If q4 forward does not run, the answer source must not be shown as `static_q4_experimental`. It must show `hard_router_boundary`, `synthetic_fallback`, or `no_model_fallback` depending on the route and finalizer result.

If q4 produces a draft and the router/finalizer replaces it, the UI shows:

- `model_draft_generated=true`
- `finalizer_replaced_draft=true`
- public reason

This is runtime visibility only. It is not product admission.
