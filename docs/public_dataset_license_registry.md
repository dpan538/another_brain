# Public Dataset License Registry

Baseline: `a30c3eea581304c3b0866336e41cc80aa44942cc`

This registry is frozen for public QA and retrieval resources. These datasets are not runtime rules, not hidden-review substitutes, and not product acceptance evidence.

| Dataset | Role | License status | Commercial use | Redistribution | Project use |
| --- | --- | --- | --- | --- | --- |
| CMRC 2018 | Chinese grounded answer extraction and answerability | CC BY-SA 4.0, verified from official repository metadata | Allowed with attribution/share-alike | Allowed with attribution/share-alike | `qa_training_data`, `public_evaluation_data`; no runtime prompt branches |
| DRCD | Traditional Chinese MRC | License unclear from verified public source | Not approved | Not approved | Registry only; quarantine until license proof is explicit |
| MIRACL Chinese | Chinese retrieval and reranking | Apache-2.0 repository license; corpus text inherits Wikipedia licensing | Allowed for code/labels under Apache-2.0; corpus passages require Wikimedia attribution/share-alike handling | Allowed subject to source licenses | `retrieval_training_data`, `public_evaluation_data`; keep corpus text in passage shards |
| Natural Questions | Natural query distribution and no-answer behavior | Repository license not sufficient alone; dataset terms require separate review | Not approved until license terms are recorded from official distribution | Not approved until license terms are recorded | Candidate only; no training import in this task |
| MKQA | Cross-language answer consistency | Dataset CC BY-SA 3.0; code Apache-2.0 | Allowed with attribution/share-alike | Allowed with attribution/share-alike | `public_evaluation_data`; do not train on labels |
| KILT | Provenance-aware knowledge task evaluation | Code MIT; KILT data/knowledge source has mixed upstream obligations, based on Wikipedia dump | Code allowed; data requires per-task/upstream license review | Test answers withheld; preserve official split boundaries | `public_evaluation_data` and provenance schema reference only |

## Split Governance

Train, dev, and test splits remain separate. Public test labels must not be used as training data. Public test questions must not become runtime rules or exact prompt branches. Official labels and expected outputs must not be modified.

## Admission Rule

A dataset enters an importer only when its license URL, license text URL, redistribution status, commercial-use status, attribution requirements, and share-alike obligations are present in `artifacts/data_ingestion/dataset_registry.json`.

