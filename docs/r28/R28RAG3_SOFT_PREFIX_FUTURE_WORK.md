# R28RAG3 Soft-Prefix Future Work

This document is feasibility-only. R28RAG3 does not implement soft-prefixing in the current release.

## Feasible Direction

A later branch could convert selected runtime cards into compact soft-prefix features for the browser decoder prompt. That would require:

- a strict prompt-size budget
- deterministic card selection
- public process trace disclosure that cards were used
- no hidden prompt or chain-of-thought content
- no training-data use
- no private raw text
- no eval prompt text
- no old excluded rows

## Current Decision

R28RAG3 keeps cards as evidence/tone hints in the static RAG packet only. The model draft path remains q4/RAG/router/finalizer without a new soft-prefix mechanism.
