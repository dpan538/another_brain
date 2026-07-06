# R27A12 Budgetfit Model Selection

R27A12 keeps the near-100M target but only selects a q4 product-path model that fits the full static 100MB budget and has prior MPS smoke evidence.

| Candidate | Params | Remaining bytes | Budget class | Selection blockers |
| --- | ---: | ---: | --- | --- |
| `new_96m` | 96363008 | 1614407 | `product_path_tight` | `[]` |
| `new_90m` | 88501248 | 5545287 | `product_path_tight` | `[]` |
| `new_80m` | 81420288 | 9085767 | `product_path_tight` | `['mps_smoke_missing_or_failed']` |
| `new_60m` | 58409472 | 20591175 | `product_path_fit` | `['mps_smoke_missing_or_failed']` |
| `new_100m_research` | 106000384 | -3204281 | `impossible_under_100mb` | `[]` |

## Decision

- Selected model: `new_96m`
- Selected params: `96363008`
- Selected device: `mps`
- Blockers: `[]`

`100M` q4 remains research-only because it exceeds the full static 100MB bundle. q3/q2.75 remain research-only until compatible browser packing and loader support exist.
