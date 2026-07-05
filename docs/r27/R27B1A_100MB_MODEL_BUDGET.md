# R27B1A 100MB Model Budget

Budget: `{'total_budget_bytes': 100000000, 'model_weight_budget_bytes': 70000000, 'tokenizer_budget_bytes': 5000000, 'runtime_budget_bytes': 15000000, 'rag_gate_budget_bytes': 10000000}`.

| Candidate | Params | int8 bytes | q4 bytes | int8 fits 70MB | q4 fits 70MB |
| --- | ---: | ---: | ---: | --- | --- |
| current candidate 7.5M | 7528128 | 7528132 | 3764068 | True | True |
| 30M q4 estimate | 30000000 | 30000004 | 15000004 | True | True |
| 60M q4 estimate | 60000000 | 60000004 | 30000004 | True | True |
| 100M q4 estimate | 100000000 | 100000004 | 50000004 | False | True |
| 0.5B q4 estimate | 500000000 | 500000004 | 250000004 | False | False |
| 2B q4 estimate | 2000000000 | 2000000004 | 1000000004 | False | False |

Recommendation: Largest listed q4 estimate that fits 70MB model budget: 100M q4 estimate.
