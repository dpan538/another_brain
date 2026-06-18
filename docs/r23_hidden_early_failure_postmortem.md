# R23 Hidden Early-Failure Postmortem

Baseline candidate commit: `38e45aff8e8bd969d02512c82f77bb11507952a2`  
Postmortem date: 2026-06-18  
Status: hidden review early-terminated; R23 candidate rejected.

This is a postmortem only. No runtime code, tests, thresholds, eval rows, or prompt-specific repairs are changed by this report.

## Executive Summary

R23 failed because the candidate path was still a deterministic, card-and-rule surface system that only covered the public canary shape. It did not build a robust live conversational model. The hidden review exposed systemic failures across operation typing, referent tracking, domain tracking, concept binding, last-answer transforms, content planning, surface realization, finalization, and diagnostics.

The most important failure is not that one answer was wrong. The system repeatedly answered the wrong operation, wrong referent, and wrong domain while recycling generic profile language. It also leaked implementation language such as local cards/session machinery and allowed stale music-domain state to contaminate literature, film, and Japanese aesthetic concepts.

Therefore the previous claim that R23 had a candidate ready for hidden review was premature. The hidden batch correctly invalidated it.

Final conclusion:

**B. deterministic path likely near saturation; learned surface/reasoning path should be researched**

This does not mean starting QLoRA immediately. It means deterministic patching is now more likely to add template debt than produce general conversational competence unless the project first defines a separate training target, preference data, private holdout protocol, runtime budget, and failure-class-specific objective.

## Observed Hidden-Review Failures

Representative failures supplied by the user:

- 李宗盛 representative-works request returned a generic music-object profile.
- 张爱玲 familiarity and characteristics turns leaked implementation terms or reused 罗大佑/music themes.
- 物哀/无常/季节感 relation turns drifted into Chinese pop and even returned truncated English/internal domain text.
- 侯孝贤 film turns drifted into 张爱玲 or urban/street primitives.
- Rewrite/simplify turns transformed stale generic answers instead of semantic content.

Observed failure families:

1. `wrong_operation`
2. `wrong_referent`
3. `wrong_domain`
4. `context_lost`
5. `implementation_leakage`
6. `generic_profile_template`
7. `transform_without_semantic_binding`
8. `unnecessary_identity_boundary`
9. `internal_field_leakage`
10. `factual_domain_drift`

## Which R23 Components Failed

### Operation Typing

`operationFromQuery` in [web/r23_content_plan.js](/Users/jarlgiovanni/Desktop/another_brain/web/r23_content_plan.js:198) is a regex priority list. It recognizes some public canary phrasings, but hidden review used ordinary conversational variants that require semantic operation inference.

Failure pattern:

- “有哪些代表作” must bind to `list_representative_works`.
- “创作过程” should become a process/craft explanation, not a rewrite of stale overview.
- “适合什么场景听” should become use-context/recommendation criteria, not transform.
- “个人最喜欢哪首” should be handled as bounded preference/stance, not stale rewrite.

The operation layer was not a learned or compositional intent model. It was a brittle regex cascade.

### Active Referent Tracking

`selectedTarget` in [web/r23_content_plan.js](/Users/jarlgiovanni/Desktop/another_brain/web/r23_content_plan.js:256) binds pronouns and many follow-ups to the first active card. It does not maintain a strong discourse stack with typed referent compatibility, decay, and correction.

Failure pattern:

- 李宗盛 follow-ups drifted into 罗大佑/music-generic content.
- 张爱玲 follow-ups inherited music content.
- 侯孝贤 follow-ups inherited 张爱玲 or urban content.

The candidate had active IDs, but the state was too shallow and too trusting of stale context.

### Active Domain Tracking

Domain selection in [web/r23_content_plan.js](/Users/jarlgiovanni/Desktop/another_brain/web/r23_content_plan.js:476) prioritizes concept, target, contrast, then session domain, then detector. In hidden review, stale `activeDomain` and broad lexical cues dominated the current turn.

Failure pattern:

- Japanese aesthetic concepts drifted into Chinese pop.
- Film questions drifted into literature or urban/street primitives.
- Literature questions inherited music profile language.

Domain tracking lacked a hard requirement that the current explicit noun and requested operation override stale session domain.

### Concept Binding

`conceptFromQuery` only knows a tiny local concept set in [web/r23_content_plan.js](/Users/jarlgiovanni/Desktop/another_brain/web/r23_content_plan.js:275). It covered the public canary “季节感” but did not generalize adequately to relation questions among `物哀`, `无常`, and `季节感`.

Failure pattern:

- The system could define one known concept in a canary, but failed relation synthesis across nearby concepts.
- It returned stale domain text instead of preserving the Japanese-literature concept cluster.

### Last-Answer Transform

Transform logic copies the previous R23 content plan in [web/r23_content_plan.js](/Users/jarlgiovanni/Desktop/another_brain/web/r23_content_plan.js:445) and realizes it with generic rewrite/simplify rules. If the previous answer was already wrong or generic, transform preserves the wrong semantic record.

Failure pattern:

- “换个说法/简单一点” repeatedly transformed the wrong music-object overview.
- Transform did not check whether the last answer satisfied the prior operation.
- Transform did not recover requested works, process, scenes, or concept relations.

This is transform-without-semantic-binding: it transforms stale surface content, not verified conversational meaning.

### Content Planning

The content plan schema is non-prose, but the candidate still depends on sparse primitives and regex extraction. `contentUnitsFor` in [web/r23_content_plan.js](/Users/jarlgiovanni/Desktop/another_brain/web/r23_content_plan.js:374) can only assemble facts already found through brittle target/concept detection.

Failure pattern:

- Missing 李宗盛 works caused fallback to generic profile.
- Missing 张爱玲 concept/work coverage caused domain contamination.
- Missing Hou Hsiao-hsien/Cai Ming-liang contrast caused stale domain substitution.

The plan had a schema, but not enough reliable semantic grounding.

### Surface Realization

The surface realizer avoided some old phrases, but it remained deterministic and template-shaped. It did not have enough contextual judgment to detect that it was realizing the wrong plan.

Failure pattern:

- Generic “entry point / focus on axes” style persisted through legacy paths.
- Candidate surface could look concise while still being unrelated.
- Surface naturalness could not compensate for wrong referent/domain/operation.

### Finalizer

The R23 finalizer in [web/r23_live_finalizer.js](/Users/jarlgiovanni/Desktop/another_brain/web/r23_live_finalizer.js:83) checks a small set of literal patterns and operation satisfaction proxies. Its referent validator is effectively non-operative: [web/r23_live_finalizer.js](/Users/jarlgiovanni/Desktop/another_brain/web/r23_live_finalizer.js:59) returns true for most cases and never actually verifies that answer content matches the active referent.

Failure pattern:

- Wrong-domain answers were not rejected unless they matched narrow “季节感/history” conditions.
- Wrong-referent answers were not rejected.
- Internal field leakage and English truncation were not reliably caught.
- A candidate could pass finalizer because it had non-empty text and no exact forbidden phrase.

### Diagnostic Design

`run_r23_candidate_diagnostics.mjs` tested public canaries and a handful of sibling sessions. The data was too close to the implementation and too small to certify behavior.

Specific diagnostic weakness:

- Public Session A/B were already known.
- Sibling sessions were only 7 sessions / 36 turns.
- Hard failures were regex-based and narrow.
- 李宗盛, 张爱玲, 侯孝贤, 王菲, 物哀/无常/季节感 relation, creation-process, listening-scene, and preference questions were absent.
- Diagnostics did not include long mixed sessions that intentionally shift through music, literature, aesthetics, film, and re-entry.
- Diagnostics treated `candidate_failure_count = 0` as meaningful despite not being independent.

## Which Parts Were Only Public-Canary Repair

The following R23 behavior was overfit to public canary needs:

- 罗大佑 → pronoun → works.
- 日本文学 familiarity question.
- 日本文学特点 → 季节感 follow-up.
- Original 16-turn music/literature/identity session.
- A tiny sibling set: 小津, 现代艺术, 达尔文, food analogy.

These repairs were useful locally but did not establish a general control plane. Hidden review exposed adjacent but untrained scenarios: 李宗盛, 张爱玲, 王菲, 侯孝贤, 物哀, 无常, creation process, listening context, preference stance, film slowness, and concept relation synthesis.

## Deterministic Rule Saturation

The hidden failures show signs of deterministic saturation:

- Adding more regexes would chase each new phrasing: “创作过程”, “适合什么场景”, “个人最喜欢”, “象征”, “独有吗”, “一回事吗”.
- Adding more cards would not fix stale referent contamination.
- Adding more finalizer forbidden phrases would not detect subtle wrong-domain answers.
- Adding more public canaries would invite more local patching.

The deterministic path can still improve infrastructure, safety boundaries, and narrow routing. But open-ended mixed cultural dialogue is now producing too much template debt and state contamination for patch-by-patch repair to be credible.

## Stale State Contamination

The hidden transcript shows a repeated mechanism:

1. The system answers a music overview.
2. That plan becomes `r23_last_content_plan`.
3. Later transform/follow-up operations reuse stale concepts and domain.
4. Explicit new domains fail to displace old state.
5. The surface layer realizes the stale plan as if it were current.

This explains why 张爱玲 turns returned 罗大佑 songs, and why Japanese aesthetic concepts returned Chinese pop domain text. The issue is not just missing knowledge. It is incorrect state authority.

## Profile and Template Debt

The public default path still contains legacy profile templates, and R23 candidate did not eliminate their authority broadly enough. Generic “对象/入口/先看” language leaked when the candidate path failed to construct a valid content plan or when default legacy paths were still used.

The truth audit already identified this debt; hidden review proves it remained product-visible.

## Lack of Real Language Generalization

The system did not generalize from:

- 罗大佑代表作 → 李宗盛代表作.
- 日本文学 familiarity → 张爱玲 fiction familiarity.
- 季节感 definition → 物哀/无常/季节感 relation.
- 小津 film support → 侯孝贤/Cai Ming-liang film comparison.
- Simple works list → creation process, listening scene, personal preference, symbolic motif.

This is a language/control generalization failure, not just a knowledge-base gap.

## Why Diagnostics Missed It

Diagnostics missed the failure because they were self-authored, narrow, and structurally close to the runtime repairs. They validated “known repaired families” rather than adversarially sampling the space around them.

Key misses:

- No independent hidden prompts.
- No broad mixed-session stress after runtime freeze.
- No model of stale-state contamination across domain shifts.
- No semantic checker for wrong referent/domain beyond a few strings.
- No relation-level concept synthesis cases.
- No negative examples where a transform must reject a bad last answer.
- No diagnostic distinction between “candidate answered” and “candidate answered the correct thing”.

## What Is Required Before Another Hidden Review

Before another hidden review, the project needs:

1. A frozen candidate that has not seen the next hidden prompts.
2. A stronger live black-box diagnostic set authored independently from runtime implementation.
3. A state-contamination audit that tests topic shifts, domain shifts, and re-entry across at least 30 mixed sessions.
4. A real referent verifier that rejects answers whose named entities, works, domain, or concept cluster contradict the current turn.
5. Transform logic that refuses to transform an invalid or unsatisfied previous answer.
6. A domain/concept resolver that treats explicit current nouns as stronger than stale session state.
7. Removal or quarantine of legacy full-sentence profile authority from product-visible paths.
8. A learned or preference-ranked surface/reasoning research branch, evaluated separately from deterministic gates.
9. A private holdout owned outside the repo, with no post-hoc tuning on seen prompts.
10. Clear admission that public R0-R23 tests are regression checks, not proof of conversational quality.

## Should Deterministic Patching Continue?

Some deterministic work remains justified:

- Blocking implementation leakage.
- Preserving privacy/copyright/safety boundaries.
- Removing legacy profile authority.
- Building factual/concept card structure.
- Improving state trace observability.

But using deterministic patches to handle open-ended cultural dialogue is likely near saturation. More patches will probably add:

- more regex ordering conflicts;
- more stale-state exceptions;
- more entity-specific debt;
- more template-like surfaces;
- more false-green diagnostics.

## Evidence Needed for Learned Surface / QLoRA Research

QLoRA or another learned surface/reasoning path is not justified by frustration alone. It would need:

- A clear training target: typed turn understanding + referent/domain grounding + compact natural surface, not unconstrained chat.
- A dataset of multi-turn preference pairs from real and blind mixed sessions.
- Labels for operation, referent, domain, concept cluster, answer shape, and semantic preservation.
- Negative examples covering stale-state contamination, implementation leakage, wrong-domain drift, and bad transforms.
- Train/dev/private-holdout separation by scenario family and entity/domain family.
- A runtime budget for browser-side or hybrid inference.
- A safety plan proving learned surface cannot weaken privacy/copyright/source boundaries.
- A fallback architecture where deterministic safety remains authoritative.

The expected failure class for learned-surface research would be:

- unseen paraphrase handling;
- natural non-question uptake;
- cross-domain analogy;
- open-ended bounded judgment;
- surface realization from verified plans;
- relation synthesis among nearby concepts.

It should not replace deterministic privacy, copyright, source, or memory boundaries.

## Current Verdict

R23 candidate is rejected. The hidden review did what it was supposed to do: it found that public diagnostics were not credible enough and that the runtime still fails as a live conversational system.

Final conclusion:

**B. deterministic path likely near saturation; learned surface/reasoning path should be researched**
