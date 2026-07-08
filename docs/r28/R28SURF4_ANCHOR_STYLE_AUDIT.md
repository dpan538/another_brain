# R28SURF4 Anchor Style Audit

R28SURF4 audits approved tracked summaries and manifests to derive a narrow daily-answer style profile. It does not parse root DOCX/PDF files, `data/public_ingestion`, eval prompts, private raw data, or old `question_pack_001` rows 51-100.

## Command

```bash
python3 scripts/r28surf4_anchor_style_audit.py
```

## Output

```text
data/training_registry/r28surf4_style_profile.json
```

## Result

- `approved_anchor_count`: 98
- `router_surface_candidates`: 98
- `excluded_eval`: true
- `excluded_old_pack_51_100`: true
- `private_raw_data_used`: false
- `source_policy.broad_answer_bank`: false

## Style Summary

The approved anchor summaries support a short, bounded, non-service voice:

- short by default
- boundary before helpfulness
- evidence before correction
- stance allowed without universalizing
- no broad answer bank

SURF4 uses this profile only for high-frequency entry and boundary intents. Ordinary open questions still fall through to q4/RAG/router/finalizer.
