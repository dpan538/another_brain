# R28POSTMERGE18 Private Logic Style Analysis

## Scope

This pass extracts reusable reasoning signals from private Q&A and writing examples without committing raw private text. The result is not training, not a model-weight change, and not a private-source import. It is a runtime reasoning layer: query profiles, retrieval cards, answer shaping rules, and tests that keep Chat answers short while Dashboard remains the place for diagnostics.

No raw private text, row-level content, document text, prompts, checkpoints, or corpus files are written into the repository. The committed material is aggregate style analysis and hand-authored runtime cards only.

## Observable Derivation

The derivation used two separated source classes.

1. Private Q&A answers were inspected as aggregate style signals: answer length, answer mode, and recurring structural markers.
2. Writing examples were inspected as aggregate stylistic signals: sentence rhythm, punctuation density, recurring image fields, and phrase-level movement.

The important design choice is that the system does not copy the user voice as a bank of finished answers. It turns observed patterns into rules:

- answer directly before explaining;
- split false premises before giving a conclusion;
- keep boundaries visible but not bureaucratic;
- prefer short judgment plus one reason;
- treat abstract questions as frame-selection problems before knowledge lookup;
- use literary rhythm as a compression style, not as decorative imitation.

## Aggregate Signals

Private Q&A aggregate:

- 52 usable answer samples.
- Average answer length was about 61.5 characters.
- Median answer length was about 57 characters.
- Suggested answer modes showed a strong preference for direct answer first, then bounded judgment.
- Direct-answer mode appeared 28 times.
- Abstract-reframe mode appeared 16 times.
- Partial-answer and bounded-judgment modes appeared 12 times each.
- Refusal or pressure-resistance modes appeared when the premise or evidence was weak.

Marker pattern:

- The negative pivot marker appeared often enough to justify a rule: when the premise is wrong, answer with correction before expansion.
- Conditional markers appeared often enough to justify split answers: if the standard changes, the conclusion may change.
- Question and judgment markers were frequent, which supports a query-profile stage before answer generation.
- Time markers appeared, but not as a universal topic. This is why time-related cards must not steal infrastructure, art, or social questions.

Writing-example aggregate:

- The sentence rhythm is compressed: many short clauses rather than long explanatory paragraphs.
- The strongest recurring image fields are light, white, time, window, blue, green, voice, city, silence, body, and water.
- The style often places image before abstraction: object first, interpretation second.
- Punctuation density suggests controlled fragments rather than academic exposition.

## Reasoning Structure

The extracted reasoning style is not “always answer philosophically.” It is closer to a four-step judgment habit.

1. Locate the object.
   The answer first identifies what is actually being asked: a fact, a value, an aesthetic judgment, a relation, a method, or a concept boundary.

2. Repair the frame.
   If the question mixes categories, the answer narrows the standard before giving a conclusion. For example, “convenient,” “meaningful,” and “true” are not the same axis.

3. Give a short position.
   The product voice should not sound like a report. It should make one judgment and give one reason, then stop.

4. Leave a boundary.
   If evidence is weak or the concept is too large, the answer lowers claim strength rather than pretending certainty.

This is why the runtime now treats question profile as a first-class layer: the same object can route differently depending on whether the user asks why, whether, how, what if, compared with what, or “this again?”

## Private Voice Rules

The style rules added to runtime cards are:

- direct answer: answer first, qualify second;
- compressed judgment: one claim plus one reason;
- negative pivot: correct the premise before elaborating;
- conditional split: give conclusion under a named standard;
- bounded judgment: name the edge of evidence without exposing machinery;
- pressure resistance: do not overclaim just because the user pushes;
- memory uncertainty: say what is remembered and what is not;
- evidence correction: if evidence changes, update the judgment.

These are implemented as runtime hints, not as canned answers.

## Literature And Art Derivation

The writing examples imply a useful product rule for culture questions: do not answer art, music, or literature as mere trivia. Treat them as form judgments.

Literature lane:

- judge speaker, syntax, pause, image movement, and reader position;
- distinguish theme from form;
- avoid reducing poetry to a paraphrased moral.

Music lane:

- judge motive, rhythm, harmony, sound texture, and social circulation;
- distinguish “catchy” from structurally memorable;
- allow pop and classical to share the same structural vocabulary.

Visual-art lane:

- judge composition, material, color, scale, viewing path, and context;
- distinguish abstraction from randomness by asking whether form choices are necessary;
- avoid “I like it” as the only standard.

## Runtime Mapping

The implementation maps the analysis into four code surfaces.

- `reasoning_cards.json`: aggregate-derived cards for private style, poetic rhythm, literature, art, music, and culture knowledge.
- `static_retriever.js`: independent domain hints for literature, music, and visual art, plus boosts that keep them from collapsing into generic aesthetic fallback.
- `app.js`: customer-facing short answers for literature, music, and art that do not expose q4, RAG, fallback, or internal trace.
- tests: assertions that the new cards are summary-only, that raw private content is absent, and that culture queries produce the intended profile.

## Non-Claims

- No training was run.
- No model weights, q4 shards, checkpoints, or tokenizer artifacts were added.
- No raw private Q&A, raw writing examples, or private source documents were committed.
- No backend inference or external model API was added.
- This is a runtime reasoning and retrieval improvement, not a product model admission.
