# R28RAG3 Expressive Context Pack

The expressive context pack is a public runtime metadata object attached to the evidence packet. It is not a hidden prompt, not chain-of-thought, and not training data.

## Shape

```json
{
  "schema_version": "r28rag3.expressive_context_pack.v1",
  "runtime_hints_only": true,
  "evidence_is_instruction": false,
  "answer_bank": false,
  "broad_answer_bank": false,
  "hidden_prompt": false,
  "cot": false,
  "local_only": true,
  "backend_retrieval": false,
  "external_llm_api": false,
  "doubao": false,
  "hosted_vector_store": false
}
```

## Purpose

The pack carries small style and expression hints such as:

- short and present
- anti-customer-service tone
- evidence honesty
- opinion with boundary
- transparent without CoT

These hints help the local runtime choose a more natural answer surface without becoming a broad answer bank.

## Prompt Boundary

The prompt packet exposes only a compact `chat_mode_hint` and the first few public hints. Evidence remains evidence:

- it is not instruction text
- it is not a system prompt
- it is not hidden
- it is not persisted as user memory

Dashboard mode can show full source provenance. Chat mode keeps this lightweight.
