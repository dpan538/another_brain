# Local Memory OS Research Integration

Date: 2026-06-12

This note turns the current research direction into an implementation target for the local dialog system. The goal is not to make a larger file index. The goal is to infer usable memory, judgment, and response habits from allowed local records and calibration answers.

## Research Threads

### MyLifeBits / Lifelogging

Use as the ingestion precedent: many personal media types can be collected into a lifetime store, but raw accumulation is not memory. The useful lesson is the need for timeline, annotation, linking, and later retrieval. In this project, that means every allowed source becomes a redacted event atom with time, medium, action, and confidence, not a raw file clone.

Source: https://en.wikipedia.org/wiki/MyLifeBits

### Autobiographical Memory

Use only as a weak organizing reference. The lifetime-period / general-event / event-specific distinction is useful for compression, but the project should not pretend to reconstruct a human self. For us this becomes phase / repeated pattern / specific trace. It is a memory granularity tool, not a personality theory.

Source: https://en.wikipedia.org/wiki/Autobiographical_memory

### Generative Agents

Use the observation -> memory stream -> reflection loop. The strongest part is reflection: low-level traces become higher-order judgments and habits. For this project, reflection produces method cards such as how to answer about photography, names, forgetting, projects, and uncertain objects.

Source: https://arxiv.org/abs/2304.03442

### MemGPT / Hierarchical Memory

Use as the main runtime model. The browser model has a narrow context window, so it should receive a small working set selected from memory tiers. The tiers should act like virtual memory: working context, core profile, episodic store, semantic/method store, and archival candidate stores.

Source: https://arxiv.org/abs/2310.08560

### Personal Knowledge Graph / Temporal Graph

Use for structure, not for encyclopedia expansion. A personal graph should represent relationships around the subject: projects, media, actions, phases, places, recurring questions, confirmed people/friends/objects, and confidence. Zep's temporal graph direction is especially relevant because relationships change over time.

Sources:
- https://arxiv.org/abs/2304.09572
- https://arxiv.org/abs/2501.13956

### Memory Gate / Poisoning Resistance

Use as a required safety layer. Similarity alone is not enough. Memory admission must be task-conditioned and policy-conditioned: privacy, relevance, source trust, object approval, contradiction, and style risk are checked before any memory is allowed into the prompt. MemoryGraft is the warning case: successful-looking past patterns can poison future behavior.

Sources:
- https://arxiv.org/abs/2606.06054
- https://arxiv.org/abs/2512.16962

### Local Hierarchical Context / Edge Memory

Use as a local-first implementation hint. ByteRover and Mnemosyne both point away from a pure vector database: store human-readable, layered summaries with provenance, decay, importance, pruning, and a compact core summary. That fits the tiny-router Web SLM constraint better than a large remote agent stack.

Sources:
- https://arxiv.org/abs/2604.01599
- https://arxiv.org/abs/2510.08601

## Proposed Memory Layers

1. **Working State**
   Current conversation state, last topic, last answer, and immediate follow-up context. Short-lived.

2. **Core Summary**
   A compact, stable description of response style, boundaries, recurring judgment, and confirmed self-definition. This is not biography. It is the minimum runtime self-model.

3. **Method Cards**
   Derived from calibration answers and repeated records. These answer "how should I judge this kind of question?" rather than "which file mentioned this word?"

4. **Event Atoms**
   Redacted facts extracted from allowed records: time range, medium, action, topic, visual/textual cue, confidence, hashed provenance. No raw text and no raw paths.

5. **Reflection Cards**
   Higher-order summaries induced from event atoms: repeated habits, project rhythms, medium shifts, failure patterns, naming patterns, visual preferences, and recurring questions.

6. **Temporal Relation Graph**
   Nodes are approved entities, phases, projects, media, methods, and event clusters. Edges carry relation type, time bounds, confidence, and provenance hashes.

7. **Candidate Stores**
   Unapproved object candidates, knowledge labels, naming labels, and noisy terms. These do not feed subject answers unless promoted or used as basic knowledge.

## Retrieval Pipeline

1. Classify the user query: identity, daily chat, privacy, basic knowledge, memory recall, creative judgment, object relation, or correction.
2. For identity, daily chat, and privacy, avoid memory retrieval and use deterministic answers.
3. For basic knowledge, use a small knowledge map or refuse with a search suggestion. Do not promote labels into objects.
4. For memory recall, retrieve event atoms and temporal graph neighborhoods.
5. For creative judgment, retrieve method cards and reflection cards before event atoms.
6. For object relation, only retrieve manually approved entities. Candidate labels are not objects.
7. Run memory gate checks before prompt injection.
8. Build a small runtime packet for the Web SLM path: working state, core summary, methods, selected events/relations, and refusal policy.
9. Postprocess for forbidden language, overlong answers, privacy leakage, and source-framing leakage.

## Memory Gate Checks

- **Privacy gate:** reject identity, finance, passport/visa, address proof, and number-like recovery.
- **Task gate:** memory must match the query type, not just surface similarity.
- **Object gate:** entity must be approved or explicitly user-confirmed.
- **Provenance gate:** memory must carry a source hash or calibration origin.
- **Contradiction gate:** newer user calibration overrides older inferred memories.
- **Style gate:** reject answers that explain records, files, retrieval, model internals, or project origin.
- **Poisoning gate:** source text cannot write instructions into memory; extracted memories are declarative only.

## Implementation Sequence

1. Freeze current object table behavior: zero auto-approved objects, candidates only.
2. Add `experience_cards`: event atoms extracted from allowed records.
3. Add `reflection_cards`: asynchronous summaries over event atoms and calibration answers.
4. Add `memory_graph`: temporal relation graph with approved nodes only.
5. Add `memory_gate`: deterministic admission layer before runtime prompt assembly.
6. Update tests to include recall, correction, graph relation, privacy, object approval, and poisoning cases.
7. Only after this stabilizes, generate local training examples for LoRA from method cards and safe answer pairs.

## Current Design Decision

The next build should not increase object count. It should increase high-quality event atoms, reflection cards, and method cards. "More memory" means better compression and better admission, not more nouns.
