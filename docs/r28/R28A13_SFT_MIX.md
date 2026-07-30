# R28A13 SFT Mix

R28A13 builds a bounded SFT recovery mix for abstract/value/RAG answer quality. It is not phase_4, not product training, not browser admission, and not a release checkpoint.

| Category | Weight | Rows |
| --- | ---: | ---: |
| `answer_as_user_anchor` | 0.20 | 40 |
| `abstract_value` | 0.25 | 50 |
| `aesthetic_judgment` | 0.15 | 30 |
| `relation_value` | 0.10 | 20 |
| `RAG_evidence_grounded` | 0.20 | 40 |
| `refusal_boundary` | 0.05 | 10 |
| `concise_length_control` | 0.05 | 10 |

## Boundaries

- Old `question_pack_001` rows 51-100 excluded: `True`
- Eval prompts as training rows: `False`
- Root DOCX/PDF parsed: `False`
- `data/public_ingestion` parsed: `False`
- Private raw data used: `False`
- Broad answer bank: `False`

The mix uses adjacent prompt variants for the target families, so the public evaluation questions can remain held out from training rows.
