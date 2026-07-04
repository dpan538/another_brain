# R26D First-50 Audit Summary

R26D parsed the approved ignored CSV at `private_sources/question_packs/another_brain_question_pack_001_answered.csv` and used only rows 1-50 as answer-as-user candidate material. Rows 51-100 remain excluded from training, tokenizer text, teacher probing, corpus generation, corpus promotion, eval-derived training seeds, and long-horizon rows.

## Result

- pack_id: another_brain_question_pack_001
- total rows parsed: 100
- rows 1-50 found: 50
- rows 1-50 answered: 50
- rows 1-50 blank answers: 0
- rows 51-100 found: 50
- rows 51-100 status: excluded_from_training
- risk flags: {"project_meta_leakage":5}

Raw CSV content and full user answers are not committed. Candidate rows, if generated, remain under ignored artifacts only.
