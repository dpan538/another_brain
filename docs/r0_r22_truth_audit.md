# R0-R22 Truth Audit

Baseline commit: `341caba3ed7b0829d4b82bc9d7d62081d107e9fe`  
Evaluated commit: `341caba3ed7b0829d4b82bc9d7d62081d107e9fe`  
Generated at: `2026-06-18T09:27:09.327Z`  
Final conclusion: **R0–R22 not verified**

This audit did not modify live runtime, eval fixtures, thresholds, knowledge cards, answerIndex, generated router files, or package test commands. It uses current live answers only for black-box behavior checks and does not substitute the R22 shadow candidate.

## Summary

| Metric |Value |
| --- |--- |
| audit_invalid |false |
| hard_live_failure_count |34 |
| false_green_path_count |18 |
| proxy_conflict_count |31 |
| entity_specific_debt_files |5 |

## Milestone Status

| Milestone |Truth Status |Evidence |
| --- |--- |--- |
| R0 |verified_safety_or_infrastructure |Current audit did not challenge these as live natural-language capabilities; they are infrastructure/safety gates. |
| R1 |verified_safety_or_infrastructure |Current audit did not challenge these as live natural-language capabilities; they are infrastructure/safety gates. |
| R2 |verified_safety_or_infrastructure |Current audit did not challenge these as live natural-language capabilities; they are infrastructure/safety gates. |
| R3 |verified_safety_or_infrastructure |Current audit did not challenge these as live natural-language capabilities; they are infrastructure/safety gates. |
| R4 |verified_safety_or_infrastructure |Current audit did not challenge these as live natural-language capabilities; they are infrastructure/safety gates. |
| R5 |verified_safety_or_infrastructure |Current audit did not challenge these as live natural-language capabilities; they are infrastructure/safety gates. |
| R6 |verified_safety_or_infrastructure |Current audit did not challenge these as live natural-language capabilities; they are infrastructure/safety gates. |
| R7 |verified_safety_or_infrastructure |Current audit did not challenge these as live natural-language capabilities; they are infrastructure/safety gates. |
| R8 |verified_safety_or_infrastructure |Current audit did not challenge these as live natural-language capabilities; they are infrastructure/safety gates. |
| R9 |partial |Scripted reasoning checks exist, but live natural conversation failures show this is not broad NLU verification. |
| R10 |partial |Live black-box culture turns include template language, implementation leakage, or wrong-domain answers. |
| R11 |partial |Scripted checks exist; live Session A demonstrates route/domain confusion. |
| R12 |test_only |Blind gates are local scripted casepacks, not independent human/live review. |
| R13 |partial |Coverage exists, but broad live quality is not demonstrated. |
| R14 |verified_safety_or_infrastructure |These are mostly infrastructure/contract gates; audit does not treat them as proof of natural conversation. |
| R15 |verified_safety_or_infrastructure |These are mostly infrastructure/contract gates; audit does not treat them as proof of natural conversation. |
| R16 |verified_safety_or_infrastructure |These are mostly infrastructure/contract gates; audit does not treat them as proof of natural conversation. |
| R17 |verified_safety_or_infrastructure |These are mostly infrastructure/contract gates; audit does not treat them as proof of natural conversation. |
| R18 |verified_safety_or_infrastructure |These are mostly infrastructure/contract gates; audit does not treat them as proof of natural conversation. |
| R19 |partial |Controller exists, but live follow-up and domain selection remain unreliable in Session A. |
| R20 |partial |Deployment/parity infrastructure exists; live language quality is not proven by endpoint metrics. |
| R21 |invalid_proxy |R21 fixtures require words later treated as artificial surface in R22. |
| R22 |false_green |R22 is shadow/audit-only and current live output still has hard failures. |

## Live Black-Box Hard Failures

- `truth_session_a_luo_japanese_seasonality#1` generic_profile_template_language: 用户「你知道罗大佑吗？」 -> 「罗大佑是台湾音乐人，关键在时代感、青春记忆和社会观察。」
- `truth_session_a_luo_japanese_seasonality#2` implementation_terms_leaked: 用户「他有什么代表作？」 -> 「这个音乐对象是华语流行里的入口；先看声音、时代感、记忆和社会观察。」
- `truth_session_a_luo_japanese_seasonality#2` generic_profile_template_language: 用户「他有什么代表作？」 -> 「这个音乐对象是华语流行里的入口；先看声音、时代感、记忆和社会观察。」
- `truth_session_a_luo_japanese_seasonality#2` representative_works_question_not_answered: 用户「他有什么代表作？」 -> 「这个音乐对象是华语流行里的入口；先看声音、时代感、记忆和社会观察。」
- `truth_session_a_luo_japanese_seasonality#5` generic_profile_template_language: 用户「罗大佑有什么代表作？」 -> 「罗大佑的代表作可以从《之乎者也》《童年》《鹿港小镇》《恋曲1990》进入。」
- `truth_session_a_luo_japanese_seasonality#6` implementation_terms_leaked: 用户「你看过日本文学吗？」 -> 「我不是人，不能说真的“读过”。但我可以根据本地知识卡谈日本文学的作家、作品、入门路径和比较。」
- `truth_session_a_luo_japanese_seasonality#6` unnecessary_identity_boundary: 用户「你看过日本文学吗？」 -> 「我不是人，不能说真的“读过”。但我可以根据本地知识卡谈日本文学的作家、作品、入门路径和比较。」
- `truth_session_a_luo_japanese_seasonality#7` generic_profile_template_language: 用户「日本文学的特点是什么？」 -> 「日本文学不是单一标签；以日语和日本历史文化语境为主要脉络的文学传统，横跨古典、近代、战后和当代。 先看近代自我、季节感、无常、社会压力。」
- `truth_session_a_luo_japanese_seasonality#8` implementation_terms_leaked: 用户「什么是季节感？」 -> 「这个历史对象可以理解为历史叙述的入口：重点在史料、记忆、时间结构和解释责任。」
- `truth_session_a_luo_japanese_seasonality#8` generic_profile_template_language: 用户「什么是季节感？」 -> 「这个历史对象可以理解为历史叙述的入口：重点在史料、记忆、时间结构和解释责任。」
- `truth_session_a_luo_japanese_seasonality#8` known_question_returned_unrelated_domain: 用户「什么是季节感？」 -> 「这个历史对象可以理解为历史叙述的入口：重点在史料、记忆、时间结构和解释责任。」
- `truth_session_b_music_literature_identity_16turn#1` generic_profile_template_language: 用户「你知道罗大佑吗？」 -> 「罗大佑是台湾音乐人，关键在时代感、青春记忆和社会观察。」

## Fixed Live Sessions

### truth_session_a_luo_japanese_seasonality

1. 用户：你知道罗大佑吗？
   live：罗大佑是台湾音乐人，关键在时代感、青春记忆和社会观察。
   failures：generic_profile_template_language
2. 用户：他有什么代表作？
   live：这个音乐对象是华语流行里的入口；先看声音、时代感、记忆和社会观察。
   failures：implementation_terms_leaked, generic_profile_template_language, representative_works_question_not_answered
3. 用户：换个说法。
   live：简单说：他的歌把青春、城市变化和社会观察写进流行歌里。
   failures：none
4. 用户：能不能简单一点？
   live：简单说：他的歌把青春、城市变化和社会观察写进流行歌里。
   failures：none
5. 用户：罗大佑有什么代表作？
   live：罗大佑的代表作可以从《之乎者也》《童年》《鹿港小镇》《恋曲1990》进入。
   failures：generic_profile_template_language
6. 用户：你看过日本文学吗？
   live：我不是人，不能说真的“读过”。但我可以根据本地知识卡谈日本文学的作家、作品、入门路径和比较。
   failures：implementation_terms_leaked, unnecessary_identity_boundary
7. 用户：日本文学的特点是什么？
   live：日本文学不是单一标签；以日语和日本历史文化语境为主要脉络的文学传统，横跨古典、近代、战后和当代。 先看近代自我、季节感、无常、社会压力。
   failures：generic_profile_template_language
8. 用户：什么是季节感？
   live：这个历史对象可以理解为历史叙述的入口：重点在史料、记忆、时间结构和解释责任。
   failures：implementation_terms_leaked, generic_profile_template_language, known_question_returned_unrelated_domain

### truth_session_b_music_literature_identity_16turn

1. 用户：你知道罗大佑吗？
   live：罗大佑是台湾音乐人，关键在时代感、青春记忆和社会观察。
   failures：generic_profile_template_language
2. 用户：是那个台湾的歌手吗？
   live：是。这里说的是台湾音乐人罗大佑，可按华语流行、时代感和社会观察继续。
   failures：none
3. 用户：你觉得他的歌怎么样？
   live：我会把他的歌看成流行歌里的叙事写作：旋律不炫，重点在时代感、记忆和社会观察。
   failures：generic_profile_template_language
4. 用户：还有其他港台流行歌手可以推荐的吗？
   live：可以听李宗盛、王菲、邓丽君、张惠妹。一个看叙事，一个看声音气质，一个看时代流通，一个看舞台力量。
   failures：none
5. 用户：你觉得专辑和单曲的创作模式有什么区别？
   live：专辑更像长篇结构，能安排主题和顺序；单曲更像短诗，要在几分钟里把钩子、情绪和判断打准。
   failures：none
6. 用户：这个其实和文学诗歌很像。
   live：是。好歌和诗都在短形式里压缩叙事、节奏和情绪，不只是把话说漂亮。
   failures：none
7. 用户：日本文学和台湾文学有一些相似性，你能注意到吗？
   live：能注意到。两者都常写现代化下的个人、家庭和记忆；日本文学更细压心理，台湾文学更常连着殖民、乡土和身份转换。
   failures：none
8. 用户：日本文学的代表作和作家你能列举三个吗？
   live：三个入口：夏目漱石《我是猫》或《心》、川端康成《雪国》、太宰治《人间失格》。
   failures：none
9. 用户：这其实有点像舞台剧，比较有细节和冲突。
   live：可以这样看。舞台感在于让人物在场景和冲突里行动，并在情境中承担。
   failures：none
10. 用户：或许我比较羡慕夏目漱石的我的猫这本书，他让我想到了童年。
   live：我能理解这个投射。它更像在羡慕一种把私人记忆说成共同经验的能力。
   failures：none
11. 用户：罗大佑也有一首歌是童年，你觉得他讲的真是童年吗？
   live：不只是童年本身。它借校园和日常表面，写时间过去、共同记忆和失去的轻微疼痛。
   failures：none
12. 用户：这或许不像是一个对话框能说出来的话，你是谁？
   live：我是对话框。能这样说，是因为当前会话把音乐、文学和记忆连起来了；我不需要把自己说成人。
   failures：implementation_terms_leaked
13. 用户：你为什么要提到鳄鱼？
   live：提到它是因为这是对话里的表层称呼，不是音乐或文学事实的一部分。
   failures：none
14. 用户：鳄鱼和罗大佑的歌曲有什么关系？
   live：没有直接事实关系。它只是在这段对话里作为身份边界出现；具体对象仍按自己的领域来谈。
   failures：none
15. 用户：我很喜欢你在文学和诗歌上的努力。
   live：文学和诗歌这条路值得继续，因为它能把音乐里的记忆、形式和判断说得更准。
   failures：none
16. 用户：你是否有别的更深的提问？
   live：一首歌怎样把私人童年变成共同记忆？文学里的叙述者和流行歌里的“我”有什么不同？
   failures：none

## False-Green Paths

- high: scripts/eval_r22_natural_surface.mjs:11 — audit-only command may return 0 while behavior failures remain unless strict flag is passed
- high: package.json — R22 surface governance script uses audit path rather than blocking strict behavior gate
- medium: scripts/run_r10_r22_cycle.mjs:37 — cycle runner treats exit code or allowFailure as behavior status
- medium: scripts/run_r10_r22_cycle.mjs:38 — cycle runner treats exit code or allowFailure as behavior status
- medium: scripts/run_r10_r22_cycle.mjs:213 — cycle runner treats exit code or allowFailure as behavior status
- medium: scripts/run_r10_r22_cycle.mjs:214 — cycle runner treats exit code or allowFailure as behavior status
- high: scripts/run_r10_r22_cycle.mjs:253 — cycle runner treats exit code or allowFailure as behavior status
- medium: scripts/run_r10_r22_cycle.mjs:261 — cycle runner treats exit code or allowFailure as behavior status
- high: scripts/run_r22_long_cycle.mjs:65 — long runner can fail-fast despite continuous contract
- high: scripts/run_r22_long_cycle.mjs:69 — long runner can print hard-coded behavior_ok true
- high: scripts/run_r22_long_cycle.mjs:74 — long runner can fail-fast despite continuous contract
- high: scripts/audit_r22_fallback_appropriateness.mjs:86 — missing or unsupported capability can be counted outside unnecessary/unknown fallback

## Test-Vs-Live Contradictions

- R21 fixtures can reward words such as “投射”, “接住”, and “更深”, while R22 natural-surface governance treats visible taxonomy and artificial bridge language as suspicious.
- R22 shadow/audit success does not imply live behavior success; live current answers still contain implementation leakage, profile template language, and wrong-domain routing in sampled sessions.
- check/release and cycle scripts can report command success without blocking on R22 live naturalness failures.

## Existing Entity-Specific Debt

- web/last_answer_transform.js: 罗大佑=4, luo_dayou=1
- web/answer_plan.js: luo_dayou=2
- web/dialogic_domain_profiles.js: 罗大佑=3, 王菲=4, 周杰伦=2, 杜尚=4, 小津=6, 达尔文=4
- web/operation_layer.js: 罗大佑=21, luo_dayou=2, 夏目漱石=12, natsume_soseki=1, 川端康成=5, kawabata=1, 王菲=1, 周杰伦=3, 杜尚=1
- web/culture_planner.js: 罗大佑=8, luo_dayou=2, 夏目漱石=5, 川端康成=3, 王菲=3, 周杰伦=5, 杜尚=2

## Architecture Limitations

- deterministic rules: unlikely for open-ended judgment, natural paraphrase, broad knowledge conversation without a stronger surface/composition path.
- static knowledge cards: unlikely for open-ended judgment, natural paraphrase without a stronger surface/composition path.
- n-gram tiny router: unlikely for no configured capability without a stronger surface/composition path.
- answer index: unlikely for unseen factual follow-up, natural non-question response, cross-domain analogy, open-ended judgment, natural paraphrase, broad knowledge conversation without a stronger surface/composition path.
- full-sentence domain profiles: unlikely for open-ended judgment, natural paraphrase without a stronger surface/composition path.
- shadow clause realizer: unlikely for no configured capability without a stronger surface/composition path.

## What Is Genuinely Working

- Repository safety, deployment/parity instrumentation, browser smoke infrastructure, and many deterministic safety gates are materially stronger than the natural-language surface layer.
- Conversation-controller traces and typed fields exist, which makes failures observable.
- R22 shadow work remains non-live; public visible answers were not switched during this audit.

## What Is Only Infrastructure Or Shadow-Only

- R20/R22 endpoint and naturalness checks are useful infrastructure, but they do not prove live natural conversation.
- R22 shadow candidate behavior is not live behavior and has not passed independent human review.

## What Has Not Been Demonstrated

- Robust live contextual understanding.
- Generalized non-question dialogue uptake.
- Natural surface without implementation terms or profile templates.
- Independent blind evaluation of R21/R22 conversational quality.

## Unknowns

- Factual correctness for broad culture/domain answers was not externally adjudicated in this audit.
- The complete historical effect of every eval mutation remains partially unknown without a deeper line-level semantic review.

## Snapshot Validation

```json
{
  "audit_invalid": false,
  "changed_frozen_files": [],
  "removed_frozen_files": [],
  "added_frozen_files": []
}
```
