# R27B2 Candidate 100MB Budget

`scripts/r27b2_candidate_budget.py` reports candidate q4 size, candidate int8 size, tokenizer estimate, runtime/UI/RAG/gate budget, total q4 estimate, total int8 estimate, and under/over 100MB status.

The report also compares 60M, 100M, 125M, 150M, 0.5B, and 2B parameter estimates. 0.5B and 2B are estimate-only rows and are not product recommendations.

The default synthetic fallback is expected to fit. Real candidates must still pass the same budget before any admitted static package can be copied into deployable same-origin assets.
