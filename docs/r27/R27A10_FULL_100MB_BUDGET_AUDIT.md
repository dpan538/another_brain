# R27A10 Full 100MB Budget Audit

R27A10 replaces the prior model-only q4 budget interpretation with a full static browser bundle budget.

## Components

- Static cap: `100000000` bytes
- B4 static bundle bytes: `22204089` from `user_supplied_r27a10_known_b4_actual`
- Tokenizer estimate: `4000000` bytes
- Runtime/manifest/shard overhead: `8000000` bytes
- RAG/gates estimate: `8000000` bytes
- Safety margin: `8000000` bytes

## Candidate Table

| Candidate | Params | Quant | Model bytes | Full static estimate | Remaining | Classification |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `a8b_100m_q4_candidate` | 106000384 | 4.0 | 53000192 | 103204281 | -3204281 | `impossible_under_100mb` |
| `new_60m_q4_candidate` | 58409472 | 4.0 | 29204736 | 79408825 | 20591175 | `product_path_fit` |
| `a8b_100m_q3_estimate_unimplemented` | 106000384 | 3.0 | 39750144 | 89954233 | 10045767 | `research_only_budget_risk` |
| `new_125m_q4_estimate` | 133726208 | 4.0 | 66863104 | 117067193 | -17067193 | `impossible_under_100mb` |
| `new_150m_q4_estimate` | 164597760 | 4.0 | 82298880 | 132502969 | -32502969 | `impossible_under_100mb` |
| `0_5b_q4_estimate_only` | 500000000 | 4.0 | 250000000 | 300204089 | -200204089 | `impossible_under_100mb` |
| `2b_q4_estimate_only` | 2000000000 | 4.0 | 1000000000 | 1050204089 | -950204089 | `impossible_under_100mb` |

## Conclusion

The A8B 100M q4 candidate is `impossible_under_100mb` under full static bundle accounting. It should be treated as research-only unless a later compression/export path proves the total bundle fits with margin. The 60M q4 path is the current product-size direction.
