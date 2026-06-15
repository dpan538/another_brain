# Internal Session Memory Contract

The deployed runtime keeps a 16-exchange-turn internal session memory. The public UI displays only the latest 4 exchange turns. The 16-turn memory is not merely a training target; it is the active short-term session memory used by the runtime/model for referent binding, correction, follow-up, topic continuity, and verifier context. It is not long-term memory. Anything beyond 16 turns requires approved memory artifacts.

成品 runtime 内部保留最近 16 轮 exchange 作为 session memory。上线 UI 只展示最近 4 轮。16 轮不是只用于训练，而是 deployed runtime 的短期工作记忆，用于指代绑定、纠错、follow-up、主题承接和 verifier context。但它不是长期记忆，超过 16 轮的信息必须通过 approved memory artifacts 才能继续使用。

```json
{
  "visible_ui_exchange_turns": 4,
  "internal_runtime_memory_exchange_turns": 16,
  "model_usable_session_context_exchange_turns": 16,
  "persistent_memory_requires_approval": true
}
```

## Layer Rules

| Layer | Window | Contains | Must Not Contain |
| --- | ---: | --- | --- |
| Visible UI history | 4 exchange turns | User-visible recent transcript | 16-turn hidden transcript |
| Internal runtime memory | 16 exchange turns | Redacted session turns, entities, works, corrections, domains, boundaries | Persistent claims, raw private values, local paths |
| Model usable session context | 16 exchange turns | Short-term redacted session context for binder/planner/verifier | Long-term memory or raw private source text |
| Persistent memory | Approved artifacts only | PersonalFactCard, PersonaCard, MethodCard, EventAtom, ReflectionCard, SubjectGraph edge | Automatic chat-log promotion |

## Runtime Behavior

- UI displays only the latest 4 exchange turns.
- Runtime internally keeps the latest 16 exchange turns for the active session.
- The model, operation layer, binder, and verifier may use the latest 16 exchange turns.
- Within 16 turns, questions such as “刚才我们聊到谁”, “那本呢”, “那首为什么重要”, or “谁更冷” may bind through session memory.
- Within 16 turns, corrections should affect later answers.
- Beyond 16 turns, session information is unavailable by default.
- Beyond 16 turns, continued use requires approved PersonalFactCard, EventAtom, MethodCard, ReflectionCard, or SubjectGraph promotion.
- 16-turn session memory is not private long-term memory.
- Session memory must not enter model weights.
- UI must not display complete history beyond 4 exchange turns.
- Privacy, copyright, and source-path content must not leak even when it appears inside the 16-turn session window.

## Visibility Doctrine

The system may say it still has short-term session memory for hidden turns within the 16-turn window. It must not imply the user can still see those turns in the UI.

Good:

```text
页面上只显示最近 4 轮；但这个会话里我还能用刚才的短期上下文承接。
```

Bad:

```text
页面上还能看到第 1 轮。
```

## Promotion Boundary

“记住这个” is a request, not automatic memory admission. Promotion requires privacy, provenance, object, visibility, and policy gates. Culture facts remain world knowledge; they do not become persona memory. Private facts never become public memory unless explicitly approved through the relevant artifact policy.
