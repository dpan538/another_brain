# R26G Replacement 51-100 Parse Summary

R26G parses only the approved ignored private source path. It does not train, run tokenizer dry-run, use old excluded question_pack_001 rows 51-100, or commit the raw DOCX/CSV.

## Result

- ok: true
- raw input path used: `private_sources/question_packs/another_brain_question_pack_002_replacement_51_100.docx`
- pack_id: `another_brain_question_pack_002_abstract_values`
- replacement_for_pack_id: `another_brain_question_pack_001`
- parsed rows: 50
- display_id range: 51-100
- internal source_row_id range: 1-50

## Type Counts

```json
{
  "价值观": 10,
  "审美": 9,
  "审美 / 哲学": 1,
  "怪问题": 10,
  "抽象判断": 10,
  "语言与意义": 10
}
```

Replacement 51-100 is treated as a new pack. The old question_pack_001 rows 51-100 remain excluded.
