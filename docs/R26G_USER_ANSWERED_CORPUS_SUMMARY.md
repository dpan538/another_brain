# R26G User-Answered Corpus Summary

R26G fixes R26E response-obligation metadata and intakes replacement 51-100 as a new pack. R26G does not train, run tokenizer dry-run, use old excluded question_pack_001 rows 51-100, call external APIs, call Doubao, commit raw private sources, commit artifacts, or commit weights.

## Result

- R26E metadata fix: passed_from_committed_corpus
- R26E target preservation: validated_by_check_r26g_r26e_target_preserved
- omitted first-50 promoted source rows: 2, 29, 47
- replacement 51-100 parsed rows: 50
- replacement 51-100 promoted rows: 50
- combined user_answered rows after R26G: 98
- combined training corpus rows after R26G: 1858
- old excluded question_pack_001 rows 51-100: excluded
- fresh-clone artifact fallback used: true

## R26G Split Counts

```json
{
  "dev": 5,
  "heldout": 5,
  "train": 43
}
```

## Category Distribution

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

R26H performs the next readiness review. It may run one tokenizer dry-run over
the tracked reviewed corpus, but it does not train, promote more rows, mutate
`training/llm_corpus`, approve phase_4, or commit tokenizer artifacts/weights.
R26I is not automatic and requires fresh approval.
