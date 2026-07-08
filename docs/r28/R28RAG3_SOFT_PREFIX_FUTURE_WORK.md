# R28RAG3 Soft-Prefix Future Work

Soft-prefix behavior is not implemented in R28RAG3.

This document records future work only. The current release ships:

- static JSON profile/style/boundary cards
- lightweight retrieval ranking
- expressive context metadata
- dashboard source/provenance display

Future soft-prefix work would need a separate review because it could blur the line between public runtime hints and hidden conditioning. Any future implementation must preserve:

- no hidden prompt disclosure surface
- no CoT storage or display
- no training data promotion
- no broad answer bank
- no backend inference
- no external LLM API
- no hosted vector store

R28RAG3 deliberately stops before that line.
