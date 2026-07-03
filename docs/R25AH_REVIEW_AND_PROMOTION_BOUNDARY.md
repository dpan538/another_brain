# R25AH Review And Promotion Boundary

R25AH candidate rows are ignored artifacts. They are not committed corpus rows, not product data, and not training evidence by themselves.

Before any R25AH row can enter a tracked corpus file, R25AI must approve promotion of reviewed rows only. Review should check:

- Chinese-first value and personal/project color.
- No eval prompt copying or held-out contamination.
- No private raw data or hidden prompts.
- No root PDF, DOC, or DOCX source use.
- No `data/public_ingestion` or `private_sources` use.
- No factual knowledge-card expansion as an intelligence substitute.
- No copied long source passage.
- Correct provenance, source hashes, and review status.

Promotion is still not training. Future training requires another explicit approval after promoted rows pass corpus checks. Phase_4 scaled training remains unapproved.

## R25AJ Boundary Update

R25AI blocked before promotion because the R25AH target-answer pool was too repetitive. R25AJ is a repair step only: it diagnoses the blocker, adds a rubric, and regenerates ignored unique candidates. It does not promote rows. Any future promotion must use the inert R25AK template and a fresh explicit approval.
