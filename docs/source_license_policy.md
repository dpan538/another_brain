# Source License And Provenance Policy

R16 external sources enter another_brain only through a license/provenance gate.

## Hard Rules

1. License proof is mandatory.
2. Every admitted source needs source URL, license URL, and license text URL.
3. Attribution obligations must be tracked.
4. ShareAlike obligations must be tracked before any downstream use.
5. NC and ND sources are excluded from public runtime and public training.
6. Unclear licenses are excluded from admission.
7. Modern copyrighted raw text is excluded.
8. Lyrics are excluded.
9. Public metadata is allowed only when the source license supports reuse.
10. Every generated card or training row must carry `source_id` and a license reference.
11. Dataset-card license metadata is not sufficient proof by itself.
12. If a source license is unclear, the source stays rejected or candidate only.

## Allowed By Default

- CC0 metadata graphs.
- CC0 museum collection metadata.
- CC0 music core metadata without lyrics or user-contributed commentary.
- Metadata rows with verified permissive source license and no private/contact fields.

## Candidate Only

- ShareAlike sources without a downstream obligation plan.
- Attribution-heavy sources until notice generation is implemented for the target artifact.
- Public-domain text collections until work-level rights, jurisdiction, and trademark/terms risks are checked.
- Reasoning benchmarks whose license is likely permissive but not verified by primary source in the registry.

## Rejected

- Lyrics and lyric sites.
- Raw web crawls without per-document license/provenance gates.
- Mixed-rights OCR/full-text dumps.
- Proprietary APIs or platform terms that forbid training/runtime reuse.
- Raw private data, local paths, personal documents, PDF/docx text, or source snippets.

## Generated Artifact Requirements

Every external card/training row must include:

```json
{
  "source_id": "",
  "source_url": "",
  "license_name": "",
  "license_url": "",
  "provenance_hash": "",
  "visibility": "public",
  "approved_for_public_runtime": false,
  "needs_review": true
}
```

No source may bypass privacy, copyright, source-framing, or overfit validators.
