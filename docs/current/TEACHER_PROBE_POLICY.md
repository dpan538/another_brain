# Teacher Probe Policy

Doubao or any teacher model is an optional side track only. R26B does not call Doubao, automate the desktop, call external APIs, or download models.

No private data may be sent to a teacher. Teacher output must be labeled `external_teacher_probe`, must not include chain-of-thought, and must not enter the training corpus automatically.

Teacher probes may be used later to compare weird-question abstraction, non-malicious fallback behavior, and answer-as-user framing. They cannot become a product runtime dependency.

Any R26T teacher probe requires fresh approval.
