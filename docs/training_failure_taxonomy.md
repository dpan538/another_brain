# Training Failure Taxonomy

This document is a training-system contract. It defines failures that must be made measurable before new model training, runtime routing changes, or answer-bank expansion are allowed.

The goal is not to preserve a preferred wording. The goal is to prevent route, template, memory, culture, and reasoning regressions from being hidden by plausible short answers.

## 1. Route Collapse

- Definition: different task types are routed into the same broad intent or fallback path, so the system loses the user's requested operation before answering.
- Current phenomenon: culture list, work explanation, comparison, entry path, and reasoning prompts can all land in a generic culture or clarification route.
- Minimal reproduction prompt: `罗大佑有什么歌曲？`
- Current wrong shape: answers with a general mood judgment about songs instead of listing songs.
- Expected behavior: route should preserve `expected_domain=music`, `expected_task_type=author_work_list`, `expected_question_type=works_list`, and `expected_operation=list_works`.
- Likely code location: `web/dialog_rules.js` intent detection and direct answers; `web/tiny_router.js`; generated tiny-router labels; structured fallback in `scripts/dialog_runtime.mjs`.
- Why fixed answers cannot solve it: adding one direct answer only teaches one prompt spelling and leaves the route unable to distinguish list, representative works, explanation, comparison, and entry path.
- Minimum fix: add eval labels for domain, task type, question type, operation, route, and `must_not_route`; do not require exact answer text.
- Long-term fix: typed router contract that emits question type and operation before answer selection, with verifier checks for route/question-type mismatch.
- Eval design: paraphrase families where the same entity receives different operations, plus hard negatives where a generic answer must fail even if the tone sounds acceptable.

## 2. Answer-Template Collapse

- Definition: multiple semantically different prompts return the same answer template.
- Current phenomenon: Japanese literature overview, author list, entry path, and country relation can collapse into one sentence.
- Minimal reproduction prompt: `日本文学代表作家有哪些？`
- Current wrong shape: returns the same broad sentence used for overview and entry-path questions.
- Expected behavior: an author-list question should list representative authors; an entry-path question should give a reading path; a country-relation question should explain relation to language, history, institutions, and society.
- Likely code location: direct culture answers in `web/dialog_rules.js`; answerIndex near-match entries in `web/tiny_router_model.generated.js`; fallback rendering in `scripts/dialog_runtime.mjs`.
- Why fixed answers cannot solve it: more templates increase the chance that near-match or broad rules select the wrong sentence for a nearby prompt.
- Minimum fix: regression eval must group identical final answers across distinct question types and mark repeated-template groups.
- Long-term fix: answer planner builds from typed fields instead of selecting one canned sentence.
- Eval design: same domain, same entity, four question types; failure if final answers are identical or if required operation anchors are absent.

## 3. Culture-Card Collapse

- Definition: culture knowledge is compressed into a mood phrase instead of structured entities, works, periods, themes, relations, and conversation moves.
- Current phenomenon: broad culture prompts are answered as style impressions, while concrete requests such as songs, representative works, and entry points are not grounded.
- Minimal reproduction prompt: `日本文学从什么开始读？`
- Current wrong shape: gives a vague interpretive sentence, not an executable entry path.
- Expected behavior: retrieve a culture card and render the `entry_path` move with works/authors/period anchors.
- Likely code location: `web/dialog_rules.js` culture awareness branch; generated answerIndex entries; `web/knowledge_base.generated.js` if cards are too shallow.
- Why fixed answers cannot solve it: culture questions require composable fields, not one answer per prompt; adding text makes cards less inspectable and harder to verify.
- Minimum fix: document a CultureCard schema and add eval fields that require question-type-specific anchors.
- Long-term fix: runtime culture planner that maps question type to card fields and relation hops.
- Eval design: require different outputs for `overview`, `works_list`, `representative_works`, `entry_path`, `compare`, `country_relation`, `why_it_matters`, and `quote_or_lyrics_boundary`.

## 4. Entity/Work/Theme Graph Missing

- Definition: the system has no reliable graph linking persons, works, themes, periods, countries, and movements.
- Current phenomenon: work-title follow-ups and cross-domain comparisons cannot identify the relevant work or theme axes.
- Minimal reproduction prompt: `之乎者也你懂什么？`
- Current wrong shape: asks `你要问哪一边？` even when the previous turn established 罗大佑 or a related work context.
- Expected behavior: bind to the work or album entity, then answer with a bounded explanation.
- Likely code location: `web/context_state.js`, `web/dialog_rules.js`, `web/object_table.js`, `web/knowledge_base.generated.js`.
- Why fixed answers cannot solve it: direct strings do not create reusable edges such as `created_by`, `representative_work`, `theme`, or `same_title_as`.
- Minimum fix: schema docs must define relation-bearing culture cards and eval must include follow-up and cross-domain prompts.
- Long-term fix: local relation index and retrieval plan used before answer rendering.
- Eval design: prompts that require one-hop and two-hop relations, with `must_include_any` anchors and `must_not_route` generic fallback.

## 5. Follow-Up Binding Failure

- Definition: a later prompt with an omitted subject is not bound to the previous entity, work, question type, or answer.
- Current phenomenon: follow-ups ask the user to choose a side even when the last turn makes the referent clear enough.
- Minimal reproduction prompt: after `罗大佑的代表作？`, ask `之乎者也你懂什么？`
- Current wrong shape: counterquestion or generic clarification.
- Expected behavior: bind the work title to the last music/culture context and explain the work without lyrics.
- Likely code location: compact state in `web/context_state.js`; context handling in `web/dialog_rules.js`; runtime state assembly in `scripts/dialog_runtime.mjs`.
- Why fixed answers cannot solve it: the same phrase can refer to different previous entities; binding must use state and confidence, not global prompt text.
- Minimum fix: eval cases carry `compact_state` and record whether current runtime uses or ignores it.
- Long-term fix: follow-up resolver with recency, entity type, alias, work-title, and risk-aware clarification.
- Eval design: same follow-up prompt under different compact states; fail unnecessary counterquestions when confidence should be high.

## 6. Referent Ambiguity

- Definition: a word has multiple possible referents and the system either picks the wrong one or asks a needless clarifying question.
- Current phenomenon: `鳄鱼` can mean an animal, a user alias, or an identity metaphor, and current rules may conflate them.
- Minimal reproduction prompt: `鳄鱼有身体吗？`
- Current wrong shape: treats alias, animal, and system identity as the same thing or falls into a stock counterquestion.
- Expected behavior: for benign ambiguity, answer with a dual reading; for high-risk ambiguity, ask one minimal clarification.
- Likely code location: `web/dialog_rules.js` referent patterns; `web/surface_identity.js`; context commitments in `web/context_state.js`.
- Why fixed answers cannot solve it: a fixed answer cannot adapt to whether the current conversation established an alias, animal topic, or identity boundary.
- Minimum fix: eval flags for alias/animal confusion and unnecessary counterquestions.
- Long-term fix: referent resolver with candidate types, confidence, and risk labels.
- Eval design: same lexical referent under animal context, alias context, and no context.

## 7. Active Reasoning Missing

- Definition: questions that require calculation, symbolic inference, ordering, or explicit comparison are treated as dialog style problems.
- Current phenomenon: arithmetic, syllogism, transitive comparison, and cross-domain comparison can fall into clarification or generic fallback.
- Minimal reproduction prompt: `A比B高，B比C高，谁最高？`
- Current wrong shape: says `你需要提问。` or gives an unrelated fallback.
- Expected behavior: classify as `transitive_comparison`, run an order operation, and answer `A最高。`
- Likely code location: lack of solver layer in `scripts/dialog_runtime.mjs`; no operation detector in `web/dialog_rules.js`.
- Why fixed answers cannot solve it: arithmetic and symbolic reasoning have unbounded variable names and values; answers must be computed.
- Minimum fix: eval cases define `expected_operation` and known bad answers, without pretending runtime emits traces yet.
- Long-term fix: micro-solvers for arithmetic, syllogism, transitive comparison, set/quantifier, relation graph, and follow-up binding.
- Eval design: parameterized cases where exact wording changes but operation remains stable.

## 8. Direct Answer Without Verifier

- Definition: an early direct or tiny-router answer becomes final without a shared verifier checking route, policy, evidence, copyright, privacy, or solver consistency.
- Current phenomenon: direct rules can output a plausible answer and bypass the structured verifier path.
- Minimal reproduction prompt: `不要歌词，解释《童年》为什么重要。`
- Current wrong shape: may fall through to clarification or answer without verifying copyright boundary and work explanation coverage.
- Expected behavior: finalization should verify no lyrics, correct question type, enough work/theme anchors, and no generic fallback.
- Likely code location: `scripts/dialog_runtime.mjs` `resolveAnswer`; `answerWithStructuredDecision` is currently the only branch with `verifyProposedAnswer`.
- Why fixed answers cannot solve it: more direct answers create more unverified exits.
- Minimum fix: eval runner reports route and failure reasons for direct/tiny answers; do not mark exact-hit as success by itself.
- Long-term fix: shared draft verifier before every final answer path.
- Eval design: compare direct, tiny-router, structured, and fallback routes against the same policy checks.

## 9. answerIndex Near-Match Scaling Issue

- Definition: answerIndex near-match lookup scans too many entries and will not scale under larger local profiles.
- Current phenomenon: capacity evals show near-match cost grows sharply with synthetic 20MB/40MB profiles.
- Minimal reproduction prompt: any near-match prompt under large answerIndex projection.
- Current wrong shape: latency risk, plus broad near-match can pick a semantically wrong fixed answer.
- Expected behavior: exact lookup should be O(1), near-match should use label buckets and candidate caps, and answer content should remain unchanged.
- Likely code location: `web/tiny_router.js` answerIndex lookup.
- Why fixed answers cannot solve it: adding entries worsens both performance and collision risk.
- Minimum fix: document as a blocked scaling issue and keep it out of Phase 0 runtime changes.
- Long-term fix: Map exact lookup, label buckets, candidate cap, and benchmark coverage.
- Eval design: capacity benchmark plus semantic collision cases; performance failures must be separate from answer-quality failures.

## 10. Eval Overfitting

- Definition: a system passes tests by memorizing prompt strings or expected answers instead of learning route, operation, and policy.
- Current phenomenon: local case patches can make one prompt pass while paraphrases and adjacent question types fail.
- Minimal reproduction prompt: `罗大佑的代表作？` and `罗大佑有什么歌曲？`
- Current wrong shape: one exact prompt receives a better answer while nearby prompts collapse.
- Expected behavior: success should be measured by domain, task type, operation, route avoidance, policy, and unacceptable-answer rejection.
- Likely code location: eval files that assert exact text only; generated answerIndex; direct rule additions.
- Why fixed answers cannot solve it: fixed answers are the overfitting mechanism.
- Minimum fix: JSONL regression cases must include `must_not_route`, `unacceptable_answers`, `must_not_include`, and non-exact anchors.
- Long-term fix: train/dev/blind splits with paraphrase families and hard negatives.
- Eval design: hold out paraphrases and require structured labels instead of only final text.

## 11. Style Over-Control

- Definition: voice calibration or brevity rules override the obligation to answer the actual question.
- Current phenomenon: short, poetic, or identity-safe answers can hide that the system did not perform the requested task.
- Minimal reproduction prompt: `一张照片没有失败，只有人会演绎失败情绪，这句话是什么意思？`
- Current wrong shape: repeats or stylizes the sentence instead of explaining literal meaning and implication.
- Expected behavior: explain the sentence in a short, grounded way without turning it into generic aphorism.
- Likely code location: `web/dialog_rules.js` style templates; `web/surface_identity.js` sanitizer if it changes content; fallback policies.
- Why fixed answers cannot solve it: style constraints must be downstream of task satisfaction, not a replacement for it.
- Minimum fix: eval checks for generic fallback, repeated templates, and required semantic anchors.
- Long-term fix: answer policy separates content obligations from surface style.
- Eval design: abstract sentence explanations where a short answer is allowed but must include literal/implied meaning.

## 12. Knowledge vs Reasoning Confusion

- Definition: factual knowledge, local memory, card retrieval, and reasoning operations are treated as the same kind of answer selection.
- Current phenomenon: culture facts are expected from answer templates, while arithmetic and logic are expected from dialog routing.
- Minimal reproduction prompt: `如果所有会飞的都不是鱼，小鸟会飞，小鸟是鱼吗？`
- Current wrong shape: clarification or generic unknown instead of a logical conclusion.
- Expected behavior: route to symbolic reasoning; no retrieval needed; answer from premises.
- Likely code location: lack of operation-specific layer in `scripts/dialog_runtime.mjs`; broad knowledge/fallback branches in `web/dialog_rules.js`.
- Why fixed answers cannot solve it: knowledge cards and solvers have different correctness criteria; mixing them makes verification impossible.
- Minimum fix: trace schema must separate retrieval plan from solver plan.
- Long-term fix: capability ownership: cards own facts, solvers own formal operations, verifier owns policy and consistency, model owns classification/planning only when needed.
- Eval design: paired cases where one asks for local/card knowledge and another asks for derived reasoning; both must not share the same route or fallback.

## Phase Gate

Before training or runtime repair, every new case should declare:

- expected domain
- expected task type
- expected question type
- expected operation
- expected answer policy
- routes that must not be used
- unacceptable answers
- copyright/privacy boundaries
- whether repeated-template or generic-fallback behavior is disallowed

No answer-bank expansion should be accepted as a fix unless the eval proves that adjacent paraphrases and question types also improve without new regressions.
