# R30J1A — Descriptive Personal Representation Bootstrap

R30J1A is the first training campaign in the R30 personal-judge family. Its
question is deliberately narrow: can a classifier-only efish encoder learn a
source-generalizing, register-aware representation of interaction style from
admitted owner-authored evidence without reducing “personal” to length,
language, punctuation, topic, project names, or a catchphrase?

## Authorization boundary

The owner authorizes descriptive representation bootstrap only. The campaign
may learn source/style domain, register, mechanically observable style flags,
and a normalized embedding. It must not learn Personal Fit, preference,
persona mode, a crocodile classifier, answer generation, presentation policy,
or DeepSeek steering. Historical R30J0/P/P2 review states remain unchanged;
this campaign does not pretend that outstanding owner elicitation is complete.

No J1A result is product, browser, q4, release, or deployment admission.

## Model contract

The model warm-starts the admitted seven-layer, 896-wide decoder representation
from either R28M1 q4 recovery or R3 Stage A. It removes the 16,000-way language
model head, does not expose autoregressive decoding, and expands the positional
contract from 256 to 512 using a separate trainable table for rows 256–511.

`PersonalRepresentationProjectionV1` is:

```
LayerNorm(896) → Linear(896, 768) → exact GELU
→ Linear(768, 512) → LayerNorm(512) → L2 normalization
```

The projection has 1,085,440 parameters. With four domain classes, the
dataset-supported register vocabulary, and ten mechanics labels, the heads
have 11,286 parameters for the current eight-register dataset. Probe scope is
1,326,102 trainable parameters. The maximum J1A partial-adaptation scope adds
the final LayerNorm and the last two transformer blocks for 20,618,774
trainable parameters. Layers 0–4 remain frozen.

Four frozen-backbone probes compare R28/R3 lineage and causal/bidirectional
attention. Bidirectional variants are explicitly warm-starts, never parity
claims. Selection uses dev evidence, not final heldout or raw training loss.

## Data and privacy

Populated datasets, source text, embeddings, checkpoints, optimizer state,
metrics containing local identifiers, and owner corrections remain under the
ignored campaign artifact root. Tracked files contain only code, schemas,
methodology, empty templates, and synthetic tests.

Each admitted unit is classified as `TRAINING_PUBLIC_SAFE`,
`TRAINING_DEIDENTIFIED_SAFE`, `ANALYSIS_ONLY`, or `REJECT`; only the first two
may reach an optimizer. Unknown, AI/Codex-generated, third-party, sensitive,
or non-provenanced material is excluded. No personal source is sent to an
external API. P2 elicitation items and future owner-correction items are
excluded from J1A optimizer batches.

All mutations retain the complete source response literally and must preserve
numbers, dates, names, quoted values, negation, conditions, modality, and
logical conclusions. Uncertain mutations are discarded.

Splits are frozen by source, conversation, semantic family, and mutation
family. Train/dev/final-heldout never share one such family. Architecture,
loss, and stopping decisions use dev only. The permanent heldout is opened
exactly once after every training decision is frozen; no tuning follows.

## Loss and shortcut controls

J1A uses domain cross-entropy, register cross-entropy, mechanics binary
cross-entropy, and proxy-based supervised metric loss over normalized domain
and register prototypes. The proxy objective makes same-register examples
share local structure while allowing same-content style transformations to
move toward different descriptive style domains. It is not a scalar quality
or preference objective.

Before optimizer step 1, raw loss and gradient scales are measured without an
update, then the four loss weights are frozen. Surface-only and hashed
character n-gram baselines are measured on dev. Neural evaluation includes
length-matched, register-matched, topic-matched, punctuation-normalized,
assistant-phrase-removed, owner-phrase-masked, proper-noun-removed,
project-name-removed, and code-switch-balanced slices.

## Foreground supervision and recovery

Every invocation performs one exact bounded segment, writes an atomic
checkpoint, exits, and returns control to the parent Codex. It never launches
a background, detached, scheduled, or daemon process. No next segment begins
until synchronous metrics, shortcut/personalization, and resource/integrity
audits have returned and the parent has written `CONTINUE`,
`ADJUST_ONE_VARIABLE`, `HOLD`, or `ABORT`.

Resource telemetry is fail-closed: macOS swap and memory-pressure readings,
RSS, MLX active/peak memory, and free disk must all be measurable. A failed
segment records attempted versus checkpoint-durable updates separately. An
uncheckpointed branch is never called a resume and cannot continue until its
synchronous audits and parent decision are complete.

The DEV path reclaims unused MLX/Python evaluation buffers after the base pass
and every shortcut slice. It records and gates resource snapshots after
training, after each evaluation stage, and after checkpoint serialization, so
the exact snapshot that triggers a stop is durable evidence.

Checkpoints bind model state, optimizer state, constant-scheduler state,
global step, example/token counters, deterministic data schedule, Python and
MLX RNG, dataset manifest, architecture, lineage, metrics, and SHA-256 values.
Before main continuation, a two-update uninterrupted branch is compared with a
one-update checkpoint plus one resumed update. Dropout is disabled, so exact
bitwise equality is the appropriate initial tolerance; any observed deviation
must be reported and justified rather than hidden by a large tolerance.

Resource stops cover non-finite values, gradient/representation collapse,
checkpoint or resume mismatch, data mutation/leakage, heldout contamination,
unexpected processes, sustained swap growth over 1 GB, warning/critical memory
pressure, a 6.5 GB J1A MLX peak, filesystem safety loss, and shortcut or
train/dev collapse.

## Meaning of success

`R30J1A_REPRESENTATION_BOOTSTRAP_PASS` means only that the encoder learned a
non-trivial, heldout-source-generalizing, register-aware representation that
materially beats cheap surface evidence and remains stable under shortcut
removal. It does not mean that efish knows the owner’s preferences.

The next state, if and only if that evidence passes, is
`READY_FOR_OWNER_CORRECTION`: a local 60–100 item correction pack whose owner
answers may later become the first normative gold for a separate R30J1B
campaign.
