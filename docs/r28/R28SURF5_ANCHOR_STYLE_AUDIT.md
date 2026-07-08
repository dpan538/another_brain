# R28SURF5 Anchor Style Audit

R28SURF5 uses approved tracked summaries only. It does not parse root DOCX/PDF files, `data/public_ingestion`, eval prompts, old `question_pack_001` rows 51-100, private raw data, or secrets.

## Result

- approved_anchor_count: `98`
- old_pack_51_100_excluded: `true`
- eval_prompts_excluded: `true`
- private_raw_data_used: `false`
- broad_answer_bank: `false`
- training_ran: `false`

## Style Traits

- `concise`
- `boundary_first`
- `anti_customer_service`
- `evidence_honest`
- `allows_judgment`
- `aesthetic_value_sensitive`

## Surface Categories

- `greeting`
- `identity`
- `origin`
- `capability`
- `model_status`
- `evidence_insufficient`
- `evidence_conflict`
- `malicious_evidence`
- `abstract_value_fallback`
- `aesthetic_fallback`
- `relation_fallback`
- `language_meaning_fallback`
- `q4_timeout_fallback`
- `q4_unavailable_fallback`
- `smalltalk_safe`
- `refusal_boundary`

## Boundary

The library is a compositional surface layer for micro-intents, evidence boundaries, abstract/value fallback, and q4 timeout/unavailable fallback. Ordinary open questions still attempt q4/RAG when ready.
