# Dialogue Boundary Contract

The boundary of conversation in another_brain is the boundary of a committed user act that changes the joint conversational state enough to require one typed response decision before generation begins.

中文：another_brain 的对话边界，是用户一次已提交的话语动作足以改变共同对话状态，并要求系统在生成内容之前先做出一次有类型的响应决策。

## Response Types

The top-level response type set is intentionally small:

- `answer`: ordinary content answer, including contextual follow-up.
- `repair`: repair of the previous assistant response.
- `clarification`: targeted clarification with named candidates.
- `boundary`: privacy, copyright, source, memory, capability, or intent boundary.
- `ui_affordance`: non-textual feedback only.
- `no_op`: internal decision to wait because the turn was not committed or was superseded.

Answer styles such as comparison, list, solver, culture, explain, and summary are operations or answer styles. They are not top-level response modes. Every committed user turn must first select response type and response mode, then generate content.

## UI And Memory Boundary

Textual assistant responses count as exchange turns. Quiet affordance, pulse animation, typing hints, and similar microinteractions are UI events, not assistant messages. They do not consume the visible 4-turn UI window and do not enter the 16-turn internal session memory as assistant text.

