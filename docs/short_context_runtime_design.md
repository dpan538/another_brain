# Short Context Runtime Design

The public UI shows only the latest 4 exchange turns. The 16-turn design window is for internal compact-state extraction only; it is not a raw context window and not a displayed conversation history.

上线 UI 只展示最近 4 轮对话。16 轮只是内部 compact state 的设计/训练上限，不是页面展示上限，也不是模型可直接读取的 raw history。

Visible history and usable compact state are not the same thing.

The system may use compact state to preserve conversation coherence, but it must not pretend to display or quote hidden turns that are outside the 4-turn UI window.

系统可以用 compact state 保持承接，但不能伪装成还保存着 4 轮外的完整对话原文。

## 1. Visible UI Window

```json
{
  "max_visible_exchange_turns": 4,
  "purpose": "what the user sees on the page",
  "raw_text_visible": true,
  "used_as_long_term_memory": false
}
```

The visible window is a product boundary. The user sees the latest 4 exchange turns only. The UI must not expand to show more history just because the internal compact-state training horizon is 16 exchange turns.

If the user asks, "Can I still see the first thing I said?", the answer must be limited to the visible window. If that earlier turn is outside the visible 4 turns and has not been promoted into approved memory, the system must not reproduce it word for word.

## 2. Raw Runtime Window

```json
{
  "max_raw_exchange_turns_in_runtime_packet": 4,
  "purpose": "short immediate conversational coherence",
  "raw_text_allowed": true,
  "must_be_truncated": true,
  "never_store_private_values": true
}
```

The runtime packet may carry at most the latest 4 raw exchange turns. Raw turns must be length-limited, must not become long-term memory, must not enter model weights, and must not enter training artifacts unless they are synthetic or public eval cases.

Raw runtime turns are for immediate coherence only. They are not a hidden transcript store.

## 3. Internal Compact-State Window

```json
{
  "max_internal_compact_exchange_turns": 16,
  "purpose": "design/training target for extracting structured state",
  "raw_text_allowed": false,
  "stores_only": [
    "last_domain",
    "last_entities",
    "last_works",
    "last_question_type",
    "last_operation",
    "last_answer_policy",
    "last_focus_entity_id",
    "last_two_entity_ids",
    "recent_corrections",
    "active_boundaries",
    "unresolved_references"
  ]
}
```

The internal 16-turn window is an extraction horizon. It may inspect up to 16 simple exchange turns while building structured state, but the compact state must not store raw user text, raw assistant answers, source snippets, PDF/docx text, private values, local paths, or hidden metadata.

A compact-state answer can say "刚才我们在聊罗大佑" when the structured entity state supports it. It must not say "你第七轮原话是..." unless that raw turn is still within the visible/raw 4-turn window or has become an approved memory artifact.

## 4. Long-Term Memory

```json
{
  "outside_16_turns": "not visible by default",
  "admission_required": true,
  "allowed_forms": [
    "approved PersonalFactCard",
    "approved PersonaCard",
    "approved MethodCard",
    "approved EventAtom",
    "approved ReflectionCard",
    "approved SubjectGraph edge"
  ]
}
```

Beyond the 16-turn compact extraction horizon, content is unavailable by default. The system may use long-term memory only when a fact or method has passed privacy, provenance, object, and policy gates and has been represented as an approved artifact.

The phrase "remember this" is not automatic promotion. It starts an approval path; it does not make raw chat text permanent memory.

## Runtime Doctrine

- UI display window: latest 4 exchange turns.
- Runtime raw packet: latest 4 exchange turns.
- Compact-state extraction: up to 16 simple exchange turns, structured fields only.
- Long-term memory: approved cards, atoms, graph edges, or equivalent reviewed artifacts only.

Packet budget pressure must drop low-salience cards first. It must not drop verifier rules, privacy rules, copyright rules, or solver plans.

The system should preserve coherence without pretending to preserve hidden raw conversation.
