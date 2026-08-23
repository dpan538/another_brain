# R30J0 Personal Efish Judge Architecture

R30J0 starts a new research family, `efish-personal-judge-v1`. It does not
continue the R29 semantic-hybrid architectures and it does not reopen their
blocked decisions. The old generative decoder remains a frozen research asset.

DeepSeek remains the language, knowledge, reasoning and factual-answer layer.
The proposed browser-local judge evaluates an already formed answer against an
owner-approved, non-sensitive preference profile. Its only product action is a
low-entropy personal-fit decision and a non-semantic presentation decision. It
does not edit answer text, generate tokens, diagnose the end user, infer
sensitive traits or claim authorship of DeepSeek's answer.

## Measured architecture projection

The source architecture has 96,421,248 learned parameters excluding stored
attention masks. The J0 common judge removes the 16,000 by 896 language-model
head (14,336,000 parameters), extends learned positions from 256 to 512
(+229,376 parameters), and adds four direct classifier heads (+23,322
parameters). The result is 82,337,946 parameters before choosing a profile
representation.

Tensor-wise q4 projection is 41,168,974 bytes. A conservative mixed projection
with FP16 classifier heads is 41,203,956 bytes. With explicit planning
allowances for metadata, the measured current tokenizer and a small runtime
bundle, the corresponding static projections are 42,756,248 and 42,791,230
bytes. These are architecture/storage calculations, not a WebGPU benchmark or
browser-admission claim.

The input hard maximum is 512 tokens, the ordinary design target is at most 448
tokens, and at least 64 tokens remain reserved. Important content is never
silently truncated. An overlength judgement returns `DEFAULT_PRESENTATION`.

## Runtime contract

- classification-only, one prefill per judgement;
- no natural-language `lm_head`;
- no autoregressive decoding, greedy decoding or sampling;
- no KV cache required for the ordinary judgement path;
- four frozen J0 output families only: Personal Fit, Voice Issues,
  Presentation Mode, and Confidence/Abstention;
- no learned factuality, truth, logic-correctness, emotion, personality or
  sensitive-profile output.

`causal_judge` and `bidirectional_judge` keep identical learned tensor sizes so
that a future owner-approved probe can compare them fairly. A bidirectional
variant initialized from the old representation is
`warm-started_from_r28m1_representation`, never R28M1 parity.

The future probe order is deliberately conservative: frozen backbone plus
linear heads, frozen backbone plus small MLP heads, partial last-layer
adaptation, and only then—if underfit is demonstrated—full judge adaptation.
R28M1 q4-recovered is the default first lineage; R3 `stage_a_080k` is a
challenger because generation failure does not settle representation quality.

## Profile representation alternatives

J0 specifies but does not select:

1. a fixed owner embedding (+896 parameters);
2. compact categorical profile tokens (zero added parameters only if existing
   IDs can be reused safely, or +26,880 parameters for 30 new tokens);
3. a small structured side channel (+288,576 parameters).

The largest current option projects to 82,626,522 parameters and 42,900,536
static bytes under the same explicit planning allowances. Owner review,
trainability, leakage risk, calibration and browser measurements must decide
the representation later.

## Data and value contract

The public charter and profile files are schemas and empty templates. They do
not assert the owner's actual preferences. The generic dataset-review pack
contains 200 empty pilot slots and 100 empty contrast slots. Separately,
R30J0-P builds an ignored local source-evidence pack with unlabelled controlled
contrast candidates; those candidates remain non-training data until explicit
owner review. Neither pack contains accepted owner labels. A future personal
model must beat both generic-quality rules and a separately frozen generic
commercial-response classifier on an owner-reviewed split, with reverse
controls so that “shorter” or “more casual” cannot become shortcuts.

The presentation oracle keeps answer bytes unchanged. Its only treatments are
reveal rhythm, spacing, motion and related non-semantic UI state. The oracle is
not an efish model and is not executed in J0.

## Privacy and product boundary

Personalization is local-first, owner-approved, versioned, editable and
deletable. No live-user conversation is collected automatically and there is
no online learning. Structured memory remains a separate future interface;
RAG and portfolio knowledge are not implemented. No production UI, API route,
deployment surface, model weight, checkpoint or corpus is created in J0.

Training remains unauthorized until owner review and the R30J0-P source-
evidence gates are complete. J0 therefore records zero classification updates,
zero optimizer examples, no checkpoint and no candidate.
