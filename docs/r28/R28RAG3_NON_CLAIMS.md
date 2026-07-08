# R28RAG3 Non-Claims

R28RAG3 does not claim product readiness or model admission.

## Explicit Non-Claims

- not product model
- not product admission
- not browser admission
- not release checkpoint
- no training
- no new model weights
- no q4 shard changes
- no raw checkpoint
- no tokenizer training artifacts
- no private raw data
- no root DOCX/PDF parsing
- no `data/public_ingestion` parsing
- no eval prompt use
- no old `question_pack_001` rows 51-100
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store
- no broad answer bank

## Runtime Boundary

The new RAG3 files are small static runtime assets. They are allowed for runtime use only and are explicitly marked:

- `allowed_for_training: false`
- `private_raw_data: false`
- `review_status: approved_for_runtime`

They can guide local evidence ranking and source display. They cannot be treated as training admission, browser admission, or release checkpoint approval.
