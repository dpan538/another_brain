# R26F Duplicate Rejection Audit

R26F is audit-only. It does not train, run tokenizer dry-run, alter corpus rows, promote rows, or use rows 51-100 as training material.

## Result

- duplicate target-answer rejections: 42
- same-source slice duplicates: 42
- duplicate primary/slice pairs: 42
- duplicate across different source rows: 0
- normalization collisions: 0
- true duplicate user answers: 0

The duplicate rejections are redundant candidate slices, not missing source rows. They mostly reflect R26D creating a `source_slice` candidate whose normalized answer equals the same row's already selected primary candidate.

## Duplicate Kinds

| kind | count |
| --- | --- |
| duplicate_primary_slice_pair | 42 |

## Affected Source Rows

- row 1
- row 3
- row 4
- row 5
- row 6
- row 7
- row 8
- row 10
- row 11
- row 12
- row 13
- row 14
- row 15
- row 17
- row 18
- row 19
- row 20
- row 21
- row 22
- row 23
- row 24
- row 25
- row 26
- row 27
- row 30
- row 31
- row 32
- row 33
- row 34
- row 35
- row 36
- row 37
- row 38
- row 39
- row 42
- row 43
- row 44
- row 45
- row 46
- row 48
- row 49
- row 50
