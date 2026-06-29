# Surface Variation One-Candidate Audit

Source: `artifacts/surface_variation/quality_reset_targeted_matrix.json`

No runtime code, routing, tests, checks, or candidate-generation logic were modified for this audit.

## Summary

- One-candidate prompts: 26
- Random example seed: 26061920
- Classification counts:
  - candidate_generator_gap: 6
  - genuinely_insufficient_supported_content: 8
  - retrieval_or_kb_gap: 6
  - semantic_plan_too_thin: 6

## Classification Notes

These classifications are evidence labels from the frozen targeted matrix plus rebuilt semantic plans. They do not claim the one-candidate cases are acceptable; they describe why the current plan/generator exposed only one effective candidate.

## All One-Candidate Cases

### 和我聊聊迪特·拉姆斯

- Operation: `open_entity_topic`
- Domain: `art_design`
- Semantic signature: `open_entity_topic|person.dieter_rams|70f00b`
- Classification: `candidate_generator_gap`
- Sole candidate: 聊迪特·拉姆斯，可以先明确：作品特征可概括为克制。
- Optional focus groups: 1
- Optional work ids: 0
- Optional example ids: 0
- Optional relation ids: 4
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan contains more than one possible support field, but the current generator produced only one effective surface candidate.

### 张惠妹有什么代表作？

- Operation: `list_representative_works`
- Domain: `music`
- Semantic signature: `list_representative_works|person.a_mei|4f9025`
- Classification: `genuinely_insufficient_supported_content`
- Sole candidate: 《阿密特》是张惠妹较常被提到的代表作。
- Optional focus groups: 1
- Optional work ids: 1
- Optional example ids: 0
- Optional relation ids: 1
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan exposes only 1 optional focus group(s), 1 work item(s), 0 example id(s), and 1 relation id(s), leaving no second supported meaning axis.

### 邓丽君有什么代表作？

- Operation: `list_representative_works`
- Domain: `music`
- Semantic signature: `list_representative_works|person.teresa_teng|83e65b`
- Classification: `retrieval_or_kb_gap`
- Sole candidate: 《月亮代表我的心》是邓丽君较常被提到的代表作。
- Optional focus groups: 1
- Optional work ids: 1
- Optional example ids: 0
- Optional relation ids: 2
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The works operation has only 1 supported work title(s), so the generator keeps one stable list instead of inventing an alternate works answer.

### 王菲有什么代表作？

- Operation: `list_representative_works`
- Domain: `music`
- Semantic signature: `list_representative_works|person.faye_wong|cfa296`
- Classification: `retrieval_or_kb_gap`
- Sole candidate: 《红豆》、《天空》是王菲较常被提到的代表作。
- Optional focus groups: 1
- Optional work ids: 2
- Optional example ids: 0
- Optional relation ids: 3
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The works operation has only 2 supported work title(s), so the generator keeps one stable list instead of inventing an alternate works answer.

### 李宗盛有什么代表作？

- Operation: `list_representative_works`
- Domain: `music`
- Semantic signature: `list_representative_works|person.li_zongsheng|251abe`
- Classification: `retrieval_or_kb_gap`
- Sole candidate: 《山丘》、《爱的代价》是李宗盛较常被提到的代表作。
- Optional focus groups: 4
- Optional work ids: 2
- Optional example ids: 0
- Optional relation ids: 4
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The works operation has only 2 supported work title(s), so the generator keeps one stable list instead of inventing an alternate works answer.

### 周杰伦有什么代表作？

- Operation: `list_representative_works`
- Domain: `music`
- Semantic signature: `list_representative_works|person.jay_chou|617a82`
- Classification: `retrieval_or_kb_gap`
- Sole candidate: 《范特西》、《七里香》是周杰伦较常被提到的代表作。
- Optional focus groups: 1
- Optional work ids: 2
- Optional example ids: 0
- Optional relation ids: 4
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The works operation has only 2 supported work title(s), so the generator keeps one stable list instead of inventing an alternate works answer.

### 谷崎润一郎有什么代表作？

- Operation: `list_representative_works`
- Domain: `literature`
- Semantic signature: `list_representative_works|person.tanizaki_junichiro|b193d6`
- Classification: `retrieval_or_kb_gap`
- Sole candidate: 《痴人之爱》、《阴翳礼赞》是谷崎润一郎较常被提到的代表作。
- Optional focus groups: 2
- Optional work ids: 2
- Optional example ids: 0
- Optional relation ids: 2
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The works operation has only 2 supported work title(s), so the generator keeps one stable list instead of inventing an alternate works answer.

### 巴金有什么代表作？

- Operation: `list_representative_works`
- Domain: `literature`
- Semantic signature: `list_representative_works|person.ba_jin|ff1547`
- Classification: `genuinely_insufficient_supported_content`
- Sole candidate: 《家》是巴金较常被提到的代表作。
- Optional focus groups: 1
- Optional work ids: 1
- Optional example ids: 0
- Optional relation ids: 1
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan exposes only 1 optional focus group(s), 1 work item(s), 0 example id(s), and 1 relation id(s), leaving no second supported meaning axis.

### 博尔赫斯有什么代表作？

- Operation: `list_representative_works`
- Domain: `literature`
- Semantic signature: `list_representative_works|person.borges|65e100`
- Classification: `genuinely_insufficient_supported_content`
- Sole candidate: 《虚构集》是博尔赫斯较常被提到的代表作。
- Optional focus groups: 1
- Optional work ids: 1
- Optional example ids: 0
- Optional relation ids: 1
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan exposes only 1 optional focus group(s), 1 work item(s), 0 example id(s), and 1 relation id(s), leaving no second supported meaning axis.

### 安部公房有什么代表作？

- Operation: `list_representative_works`
- Domain: `literature`
- Semantic signature: `list_representative_works|person.abe_kobo|4dadbb`
- Classification: `retrieval_or_kb_gap`
- Sole candidate: 《砂之女》是安部公房较常被提到的代表作。
- Optional focus groups: 2
- Optional work ids: 1
- Optional example ids: 0
- Optional relation ids: 1
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The works operation has only 1 supported work title(s), so the generator keeps one stable list instead of inventing an alternate works answer.

### 清少纳言有什么代表作？

- Operation: `list_representative_works`
- Domain: `literature`
- Semantic signature: `list_representative_works|person.sei_shonagon|e14422`
- Classification: `genuinely_insufficient_supported_content`
- Sole candidate: 《枕草子》是清少纳言较常被提到的代表作。
- Optional focus groups: 1
- Optional work ids: 1
- Optional example ids: 0
- Optional relation ids: 1
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan exposes only 1 optional focus group(s), 1 work item(s), 0 example id(s), and 1 relation id(s), leaving no second supported meaning axis.

### 真实性是什么意思？

- Operation: `define_concept`
- Domain: `daily_world_or_social_thought`
- Semantic signature: `define_concept|concept.authenticity|f0d024`
- Classification: `semantic_plan_too_thin`
- Sole candidate: 真实性指的是在存在主义语境中，真实性通常指人承认自己的处境、自由和责任，而不是把选择完全推给角色、习俗或外部命令。
- Optional focus groups: 1
- Optional work ids: 0
- Optional example ids: 0
- Optional relation ids: 2
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The concept plan has only 1 visible focus group(s) and no separate example/contrast relation, so a second definition move is not evidenced.

### 自白诗是什么意思？

- Operation: `define_concept`
- Domain: `literature`
- Semantic signature: `define_concept|concept.confessional_poetry|fd4a03`
- Classification: `genuinely_insufficient_supported_content`
- Sole candidate: 自白诗指的是自白诗通常指二十世纪中期美国诗歌中更直接使用个人、家庭、疾病、罪感和社会压力等材料的一种写作倾向。
- Optional focus groups: 1
- Optional work ids: 0
- Optional example ids: 0
- Optional relation ids: 1
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan exposes only 1 optional focus group(s), 0 work item(s), 0 example id(s), and 1 relation id(s), leaving no second supported meaning axis.

### 没有答案的问题是什么意思？

- Operation: `define_concept`
- Domain: `daily_world_or_social_thought`
- Semantic signature: `define_concept|concept.unanswerable_question|2b3d23`
- Classification: `semantic_plan_too_thin`
- Sole candidate: 没有答案的问题指的是没有确定答案的问题仍可能值得问，因为提问能澄清边界、暴露前提、组织经验或改变行动方向。
- Optional focus groups: 1
- Optional work ids: 0
- Optional example ids: 0
- Optional relation ids: 2
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The concept plan has only 1 visible focus group(s) and no separate example/contrast relation, so a second definition move is not evidenced.

### 松尾芭蕉是什么意思？

- Operation: `define_concept`
- Domain: `literature`
- Semantic signature: `define_concept|concept.haiku_basho|e7fe9c`
- Classification: `candidate_generator_gap`
- Sole candidate: 松尾芭蕉指的是松尾芭蕉是俳句传统中的重要人物；俳句以短小形式、季语和瞬间感见长。
- Optional focus groups: 2
- Optional work ids: 0
- Optional example ids: 0
- Optional relation ids: 1
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan contains more than one possible support field, but the current generator produced only one effective surface candidate.

### 语言会背叛意思吗是什么意思？

- Operation: `define_concept`
- Domain: `daily_world_or_social_thought`
- Semantic signature: `define_concept|concept.language_betrayal|1b0bba`
- Classification: `semantic_plan_too_thin`
- Sole candidate: 语言会背叛意思吗指的是语言能表达意思，也会因为语境、歧义、隐喻和听者解释而改变意思；所谓背叛通常指表达和意图之间出现裂缝。
- Optional focus groups: 1
- Optional work ids: 0
- Optional example ids: 0
- Optional relation ids: 2
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The concept plan has only 1 visible focus group(s) and no separate example/contrast relation, so a second definition move is not evidenced.

### 艺术史应该从哪里开始是什么意思？

- Operation: `define_concept`
- Domain: `literature`
- Semantic signature: `define_concept|concept.art_history_entry|a217bd`
- Classification: `semantic_plan_too_thin`
- Sole candidate: 艺术史应该从哪里开始指的是艺术史入门可参考观看方式、媒介变化、制度语境和几个关键断点开始，而不是先背完整年代线。
- Optional focus groups: 1
- Optional work ids: 0
- Optional example ids: 0
- Optional relation ids: 2
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The concept plan has only 1 visible focus group(s) and no separate example/contrast relation, so a second definition move is not evidenced.

### 解构是什么意思？

- Operation: `define_concept`
- Domain: `daily_world_or_social_thought`
- Semantic signature: `define_concept|concept.deconstruction|ce8318`
- Classification: `genuinely_insufficient_supported_content`
- Sole candidate: 解构指的是解构是一种阅读和思想方法，关注文本中看似稳定的二元结构、中心和边界如何在自身内部变得不稳定。
- Optional focus groups: 1
- Optional work ids: 0
- Optional example ids: 0
- Optional relation ids: 1
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan exposes only 1 optional focus group(s), 0 work item(s), 0 example id(s), and 1 relation id(s), leaving no second supported meaning axis.

### 照片没有失败是什么意思？

- Operation: `define_concept`
- Domain: `literature`
- Semantic signature: `define_concept|concept.photo_failure_emotion|8a8b33`
- Classification: `genuinely_insufficient_supported_content`
- Sole candidate: 照片没有失败指的是这类句子把照片的物质结果和观看者的情绪判断分开：图像本身是图像，失败感来自解释框架。
- Optional focus groups: 1
- Optional work ids: 0
- Optional example ids: 0
- Optional relation ids: 1
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan exposes only 1 optional focus group(s), 0 work item(s), 0 example id(s), and 1 relation id(s), leaving no second supported meaning axis.

### 存在主义是什么意思？

- Operation: `define_concept`
- Domain: `daily_world_or_social_thought`
- Semantic signature: `define_concept|concept.existentialism|a9e9a1`
- Classification: `semantic_plan_too_thin`
- Sole candidate: 存在主义指的是存在主义是一组关注自由、责任、焦虑、荒诞、选择和具体处境的现代哲学与文学传统。
- Optional focus groups: 1
- Optional work ids: 0
- Optional example ids: 0
- Optional relation ids: 3
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The concept plan has only 1 visible focus group(s) and no separate example/contrast relation, so a second definition move is not evidenced.

### 记忆与叙述是什么意思？

- Operation: `define_concept`
- Domain: `daily_world_or_social_thought`
- Semantic signature: `define_concept|concept.narrative_memory|37dc71`
- Classification: `semantic_plan_too_thin`
- Sole candidate: 记忆与叙述指的是记忆常被理解为对过去的保存、重组和再解释；叙述则把事件组织成可理解的顺序、因果和意义。
- Optional focus groups: 1
- Optional work ids: 0
- Optional example ids: 0
- Optional relation ids: 2
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The concept plan has only 1 visible focus group(s) and no separate example/contrast relation, so a second definition move is not evidenced.

### 张惠妹和邓丽君有什么不同？

- Operation: `simple_comparison`
- Domain: `music`
- Semantic signature: `simple_comparison|person.a_mei|person.teresa_teng|dce811`
- Classification: `genuinely_insufficient_supported_content`
- Sole candidate: 拿作品看，张惠妹可参照《阿密特》，邓丽君可参照《月亮代表我的心》；差别会更具体。
- Optional focus groups: 1
- Optional work ids: 1
- Optional example ids: 0
- Optional relation ids: 1
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan exposes only 1 optional focus group(s), 1 work item(s), 0 example id(s), and 1 relation id(s), leaving no second supported meaning axis.

### 邓丽君和张惠妹有什么不同？

- Operation: `simple_comparison`
- Domain: `music`
- Semantic signature: `simple_comparison|person.teresa_teng|person.a_mei|70b8f1`
- Classification: `candidate_generator_gap`
- Sole candidate: 拿作品看，邓丽君可参照《月亮代表我的心》，张惠妹可参照《阿密特》；差别会更具体。
- Optional focus groups: 1
- Optional work ids: 1
- Optional example ids: 0
- Optional relation ids: 2
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan contains more than one possible support field, but the current generator produced only one effective surface candidate.

### 黑泽明和是枝裕和有什么不同？

- Operation: `simple_comparison`
- Domain: `film`
- Semantic signature: `simple_comparison|person.akira_kurosawa|person.koreeda_hirokazu|2328da`
- Classification: `candidate_generator_gap`
- Sole candidate: 拿作品看，黑泽明可参照《罗生门》，是枝裕和可参照《步履不停》；差别会更具体。
- Optional focus groups: 1
- Optional work ids: 2
- Optional example ids: 0
- Optional relation ids: 4
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan contains more than one possible support field, but the current generator produced only one effective surface candidate.

### 迪特·拉姆斯和查尔斯·伊姆斯有什么不同？

- Operation: `simple_comparison`
- Domain: `art_design`
- Semantic signature: `simple_comparison|person.dieter_rams|person.charles_eames|5f71dc`
- Classification: `candidate_generator_gap`
- Sole candidate: 迪特·拉姆斯更容易连到克制；查尔斯·伊姆斯则更突出另一种创作面向。
- Optional focus groups: 1
- Optional work ids: 0
- Optional example ids: 0
- Optional relation ids: 4
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan contains more than one possible support field, but the current generator produced only one effective surface candidate.

### 查尔斯·伊姆斯和迪特·拉姆斯有什么不同？

- Operation: `simple_comparison`
- Domain: `art_design`
- Semantic signature: `simple_comparison|person.charles_eames|person.dieter_rams|1ba1c8`
- Classification: `candidate_generator_gap`
- Sole candidate: 查尔斯·伊姆斯更容易连到自身风格；迪特·拉姆斯则更突出克制。
- Optional focus groups: 1
- Optional work ids: 2
- Optional example ids: 0
- Optional relation ids: 4
- Rejected/collapsed reasons: none recorded
- Why no second candidate: The plan contains more than one possible support field, but the current generator produced only one effective surface candidate.

## Ten Random Examples

### 张惠妹有什么代表作？

- Semantic plan: `list_representative_works|person.a_mei|4f9025`
- Sole candidate: 《阿密特》是张惠妹较常被提到的代表作。
- Rejected candidate outlines: none recorded
- Note: No rejected candidate outlines were recorded; the generator produced only one effective candidate.

### 邓丽君有什么代表作？

- Semantic plan: `list_representative_works|person.teresa_teng|83e65b`
- Sole candidate: 《月亮代表我的心》是邓丽君较常被提到的代表作。
- Rejected candidate outlines: none recorded
- Note: No rejected candidate outlines were recorded; the generator produced only one effective candidate.

### 王菲有什么代表作？

- Semantic plan: `list_representative_works|person.faye_wong|cfa296`
- Sole candidate: 《红豆》、《天空》是王菲较常被提到的代表作。
- Rejected candidate outlines: none recorded
- Note: No rejected candidate outlines were recorded; the generator produced only one effective candidate.

### 李宗盛有什么代表作？

- Semantic plan: `list_representative_works|person.li_zongsheng|251abe`
- Sole candidate: 《山丘》、《爱的代价》是李宗盛较常被提到的代表作。
- Rejected candidate outlines: none recorded
- Note: No rejected candidate outlines were recorded; the generator produced only one effective candidate.

### 谷崎润一郎有什么代表作？

- Semantic plan: `list_representative_works|person.tanizaki_junichiro|b193d6`
- Sole candidate: 《痴人之爱》、《阴翳礼赞》是谷崎润一郎较常被提到的代表作。
- Rejected candidate outlines: none recorded
- Note: No rejected candidate outlines were recorded; the generator produced only one effective candidate.

### 安部公房有什么代表作？

- Semantic plan: `list_representative_works|person.abe_kobo|4dadbb`
- Sole candidate: 《砂之女》是安部公房较常被提到的代表作。
- Rejected candidate outlines: none recorded
- Note: No rejected candidate outlines were recorded; the generator produced only one effective candidate.

### 自白诗是什么意思？

- Semantic plan: `define_concept|concept.confessional_poetry|fd4a03`
- Sole candidate: 自白诗指的是自白诗通常指二十世纪中期美国诗歌中更直接使用个人、家庭、疾病、罪感和社会压力等材料的一种写作倾向。
- Rejected candidate outlines: none recorded
- Note: No rejected candidate outlines were recorded; the generator produced only one effective candidate.

### 解构是什么意思？

- Semantic plan: `define_concept|concept.deconstruction|ce8318`
- Sole candidate: 解构指的是解构是一种阅读和思想方法，关注文本中看似稳定的二元结构、中心和边界如何在自身内部变得不稳定。
- Rejected candidate outlines: none recorded
- Note: No rejected candidate outlines were recorded; the generator produced only one effective candidate.

### 照片没有失败是什么意思？

- Semantic plan: `define_concept|concept.photo_failure_emotion|8a8b33`
- Sole candidate: 照片没有失败指的是这类句子把照片的物质结果和观看者的情绪判断分开：图像本身是图像，失败感来自解释框架。
- Rejected candidate outlines: none recorded
- Note: No rejected candidate outlines were recorded; the generator produced only one effective candidate.

### 迪特·拉姆斯和查尔斯·伊姆斯有什么不同？

- Semantic plan: `simple_comparison|person.dieter_rams|person.charles_eames|5f71dc`
- Sole candidate: 迪特·拉姆斯更容易连到克制；查尔斯·伊姆斯则更突出另一种创作面向。
- Rejected candidate outlines: none recorded
- Note: No rejected candidate outlines were recorded; the generator produced only one effective candidate.
