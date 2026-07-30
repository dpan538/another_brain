# R27A11 Near-100M Budget Planner

R27A11 keeps the target as close to 100M parameters as the full static browser budget allows. It does not claim product admission.

## Inputs

- Static cap: `100000000` bytes
- B4/B5 static bundle bytes: `22204089` from `user_supplied_r27a10_known_b4_actual`
- Maximum q4 params under full budget: `99591822`

## Candidate Table

| Candidate | Params | Quant bits | Model bytes | Full static estimate | Remaining | Classification |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `new_60m` | 58409472 | 4.0 | 29204736 | 79408825 | 20591175 | `product_path_fit` |
| `new_80m` | 81420288 | 4.0 | 40710144 | 90914233 | 9085767 | `product_path_tight` |
| `new_90m` | 88501248 | 4.0 | 44250624 | 94454713 | 5545287 | `product_path_tight` |
| `new_96m` | 96363008 | 4.0 | 48181504 | 98385593 | 1614407 | `product_path_tight` |
| `new_100m_research` | 106000384 | 4.0 | 53000192 | 103204281 | -3204281 | `impossible_under_100mb` |
| `100m_q3_research_estimate` | 106000384 | 3.0 | 39750144 | 89954233 | 10045767 | `research_only_budget_risk` |
| `100m_q2_75_research_estimate` | 106000384 | 2.75 | 36437632 | 86641721 | 13358279 | `research_only_budget_risk` |
| `new_125m_q4_estimate` | 125000000 | 4.0 | 62500000 | 112704089 | -12704089 | `impossible_under_100mb` |
| `new_150m_q4_estimate` | 150000000 | 4.0 | 75000000 | 125204089 | -25204089 | `impossible_under_100mb` |
| `0_5b_q4_estimate_only` | 500000000 | 4.0 | 250000000 | 300204089 | -200204089 | `impossible_under_100mb` |
| `2b_q4_estimate_only` | 2000000000 | 4.0 | 1000000000 | 1050204089 | -950204089 | `impossible_under_100mb` |

## Selection

- Selected product-path model: `new_96m`
- Selected product-path params: `96363008`
- Classification: `product_path_tight`
- Selection reason: `largest_q4_full_bundle_fit`

`100M` q3/q2.75 remains a research estimate until compression and loader compatibility are implemented.
