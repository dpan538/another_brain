# R25AG Legacy Scan Reconciliation

R25AG reconciled earlier hard-drive/source-scan signs inside the repository only. It did not follow external paths, parse root PDF/DOCX content, parse `data/public_ingestion` content, or generate corpus rows.

## Findings

- Possible scan-output files: 3175
- Path-inventory-only candidates: 2944
- Imported-text signal files: 118
- Referenced by package scripts: 49
- Feed `training/llm_corpus`: 0
- Feed `identity_pack`: 13
- Feed `knowledge_sources`: 52

## Conclusion

- Early hard-drive scan appears to have imported useful training material: no
- Root personal files currently ingested into training corpus: no
- data/public_ingestion currently ingested into training corpus: no

Detailed path-level metadata is kept in ignored artifacts; this tracked summary avoids long path lists and raw private text.

