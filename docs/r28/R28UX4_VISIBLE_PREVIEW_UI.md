# R28UX4 Visible Preview UI

R28UX4 fixes the preview confusion where Vercel `/` still served the old simple root page while `/another_brain_chat/` contained the R28UX3 process-transparent UI.

The root route now acts as a static-only entry/redirect to `/another_brain_chat/?v=r28ux4-visible-preview-ui`.

The chat route visibly shows:

- `R28UX4`
- `r28ux4-visible-preview-ui`
- local/static runtime
- `static_q4_experimental`
- `exact_runtime_tokenizer`
- router enabled
- process panel headed `过程摘要`
- the six public stages: 输入包、本地上下文、检索证据、模型草稿、路由判断、最终回答
- the visible `检查本地模型路径` self-check button

This is a UI and static route patch only. It does not add backend inference or model assets.
