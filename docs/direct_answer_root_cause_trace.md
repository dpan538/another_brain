# Direct Answer Root Cause Trace

Baseline SHA: a17ee68fffc45d22fb7064bbab088afd99e5b42e
Generated: 2026-06-18T16:54:42.075Z

## Bad Phrase Sources
- 华语流行里的入口: web/dialogic_domain_profiles.js music.overview -> softenEntrySkeleton in web/dialogic_bridge_runtime.js. Profile overview emits '可以理解为华语流行里的入口：重点在声音、时代感、记忆和社会观察。'; bridge softener rewrites it to '是华语流行里的入口；先看...'.
- 这个音乐对象: web/dialogic_domain_profiles.js music.overview fallback subject. When extractKnowSubject fails, music.overview uses subject || '这个音乐对象'.
- 先看声音、时代感、记忆和社会观察: web/dialogic_domain_profiles.js music.overview + web/dialogic_bridge_runtime.js softenEntrySkeleton. Profile axes are serialized as direct prose by the bridge softener.
- 我明白。这里先不机械反问……: web/operation_layer.js answerDeclarationSignal fallback branch. The literal phrase is emitted by the declaration/reflection branch when a topic-opening turn is not typed as a direct entity operation.
- Contemporary Chinese writer…: culture card factual_core serialized by web/culture_planner.js answerExplain fallback. answerExplain returns `${name}：${focus.factual_core}...`; the Mo Yan card factual_core is English.
- 先看rural: web/culture_planner.js answerExplain fallback themes() + LABELS miss. answerExplain appends `先看${themeText}`; LABELS lacks rural, so raw schema/theme value is visible.
- 目前卡片覆盖还不完整: web/culture_planner.js answerWorksList partial prefix. answerWorksList sets partial when works.length < 3 and exposes card coverage to users.
- 不能贴歌词: web/culture_planner.js answerWorksList representative branch. Representative works answer appends a lyric boundary even when the user only asks for works.

## Public Regression Trace
### 罗大佑是谁？
- normalized_user_text: 罗大佑是谁
- selected_entity_id: person.luo_dayou
- selected_domain: music.taiwan
- question_type: explain_work
- requested_operation: culture_explain_entity_from_card
- selected_turn_function: information_question
- retrieved_card_ids: person.luo_dayou, work.album.zhihu_zheye, work.song.tongnian, work.song.lukang_xiaozhen, theme.modernization_loss
- final_visible_answer_source: operation
- exact_final_visible_output: 罗大佑：台湾音乐人，1980年代以来以华语流行歌曲、社会观察和个人记忆书写受到关注。 先看现代化、青春记忆、城乡变化、社会观察。
- hard_invariant_failures: 先看
### 邓丽君是谁？
- normalized_user_text: 邓丽君是谁
- selected_entity_id: person.teresa_teng
- selected_domain: music.taiwan
- question_type: explain_work
- requested_operation: culture_explain_entity_from_card
- selected_turn_function: information_question
- retrieved_card_ids: person.teresa_teng, work.song.yueliang_daibiao_wodexin, work.moon_represents_my_heart
- final_visible_answer_source: operation
- exact_final_visible_output: 邓丽君：Singer whose transregional Mandarin pop voice became a major bridge across Chinese-language listening pub。
- hard_invariant_failures: none
### 周杰伦是谁》
- normalized_user_text: 周杰伦是谁
- selected_entity_id: person.jay_chou
- selected_domain: music.chinese_pop_general
- question_type: explain_work
- requested_operation: culture_explain_entity_from_card
- selected_turn_function: information_question
- retrieved_card_ids: person.jay_chou, work.album.fantasy, work.song.qilixiang, work.album_jay, work.fantasy_jay
- final_visible_answer_source: operation
- exact_final_visible_output: 周杰伦：Singer-songwriter/producer whose 2000s albums mixed R&B, hip-hop, Chinese-style motifs, and dense product。
- hard_invariant_failures: none
### 和我聊聊王菲
- normalized_user_text: 和我聊聊王菲
- selected_entity_id: person.faye_wong
- selected_domain: music.hongkong
- question_type: user_asks_interpretation
- requested_operation: culture_interpretation_with_cards
- selected_turn_function: reflection
- retrieved_card_ids: person.faye_wong, work.song.hongdou, work.red_bean_faye, work.sky_faye
- final_visible_answer_source: operation
- exact_final_visible_output: 王菲可放在hongkong语境里看；关键是声音辨识度、香港流行语境、另类流行质地。
- hard_invariant_failures: none
### 莫言是谁？
- normalized_user_text: 莫言是谁
- selected_entity_id: person.mo_yan
- selected_domain: literature.chinese_modern
- question_type: explain_work
- requested_operation: culture_explain_entity_from_card
- selected_turn_function: information_question
- retrieved_card_ids: person.mo_yan, work.red_sorghum
- final_visible_answer_source: operation
- exact_final_visible_output: 莫言：Contemporary Chinese writer associated with rural history, sensory narration, and mythic realism. 先看rural 。
- hard_invariant_failures: 先看, rural, Contemporary Chinese writer
### 莫言有什么代表作吗？
- normalized_user_text: 莫言有什么代表作吗
- selected_entity_id: person.mo_yan
- selected_domain: literature.chinese_modern
- question_type: representative_works
- requested_operation: culture_list_representative_works_from_cards
- selected_turn_function: information_question
- retrieved_card_ids: person.mo_yan, work.red_sorghum, concept.representative_work_spine
- final_visible_answer_source: operation
- exact_final_visible_output: 目前卡片覆盖还不完整，所以先给已确认入口：代表作可先抓《红高粱》；它们分别通向不同主题入口，不能贴歌词。
- hard_invariant_failures: 入口, 卡片, 不能贴歌词

## Root Cause Classification
### 罗大佑是谁？
- primary_root_cause: method_profile_leakage
- secondary_root_causes: answer_source_authority
- evidence: 罗大佑：台湾音乐人，1980年代以来以华语流行歌曲、社会观察和个人记忆书写受到关注。 先看现代化、青春记忆、城乡变化、社会观察。
- affected_files: web/dialogic_bridge_runtime.js, web/dialogic_domain_profiles.js, web/culture_runtime.js, web/culture_planner.js, web/response_mode_manager.js
- why_the_KB_card_count_did_not_help: The selected answer authority could be a dialogic domain profile, generic planner branch, or raw card serialization path; adding cards does not force explicit entity + operation authority.
- sibling_entities_affected: true
- generalized_repair_point: Add a type-driven direct entity operation path that resolves explicit current-turn entity IDs before stale context/profile authority and realizes identity/topic/works answers from cards and relations.
- prohibited_local_patch: Do not branch on specific names, exact prompts, or expected answer strings.
### 邓丽君是谁？
- primary_root_cause: content_planning
- secondary_root_causes: none
- evidence: 邓丽君：Singer whose transregional Mandarin pop voice became a major bridge across Chinese-language listening pub。
- affected_files: web/dialogic_bridge_runtime.js, web/dialogic_domain_profiles.js, web/culture_runtime.js, web/culture_planner.js, web/response_mode_manager.js
- why_the_KB_card_count_did_not_help: The selected answer authority could be a dialogic domain profile, generic planner branch, or raw card serialization path; adding cards does not force explicit entity + operation authority.
- sibling_entities_affected: true
- generalized_repair_point: Add a type-driven direct entity operation path that resolves explicit current-turn entity IDs before stale context/profile authority and realizes identity/topic/works answers from cards and relations.
- prohibited_local_patch: Do not branch on specific names, exact prompts, or expected answer strings.
### 周杰伦是谁》
- primary_root_cause: content_planning
- secondary_root_causes: none
- evidence: 周杰伦：Singer-songwriter/producer whose 2000s albums mixed R&B, hip-hop, Chinese-style motifs, and dense product。
- affected_files: web/dialogic_bridge_runtime.js, web/dialogic_domain_profiles.js, web/culture_runtime.js, web/culture_planner.js, web/response_mode_manager.js
- why_the_KB_card_count_did_not_help: The selected answer authority could be a dialogic domain profile, generic planner branch, or raw card serialization path; adding cards does not force explicit entity + operation authority.
- sibling_entities_affected: true
- generalized_repair_point: Add a type-driven direct entity operation path that resolves explicit current-turn entity IDs before stale context/profile authority and realizes identity/topic/works answers from cards and relations.
- prohibited_local_patch: Do not branch on specific names, exact prompts, or expected answer strings.
### 和我聊聊王菲
- primary_root_cause: content_planning
- secondary_root_causes: none
- evidence: 王菲可放在hongkong语境里看；关键是声音辨识度、香港流行语境、另类流行质地。
- affected_files: web/dialogic_bridge_runtime.js, web/dialogic_domain_profiles.js, web/culture_runtime.js, web/culture_planner.js, web/response_mode_manager.js
- why_the_KB_card_count_did_not_help: The selected answer authority could be a dialogic domain profile, generic planner branch, or raw card serialization path; adding cards does not force explicit entity + operation authority.
- sibling_entities_affected: true
- generalized_repair_point: Add a type-driven direct entity operation path that resolves explicit current-turn entity IDs before stale context/profile authority and realizes identity/topic/works answers from cards and relations.
- prohibited_local_patch: Do not branch on specific names, exact prompts, or expected answer strings.
### 莫言是谁？
- primary_root_cause: method_profile_leakage
- secondary_root_causes: language_normalization, answer_source_authority
- evidence: 莫言：Contemporary Chinese writer associated with rural history, sensory narration, and mythic realism. 先看rural 。
- affected_files: web/dialogic_bridge_runtime.js, web/dialogic_domain_profiles.js, web/culture_runtime.js, web/culture_planner.js, web/response_mode_manager.js
- why_the_KB_card_count_did_not_help: The selected answer authority could be a dialogic domain profile, generic planner branch, or raw card serialization path; adding cards does not force explicit entity + operation authority.
- sibling_entities_affected: true
- generalized_repair_point: Add a type-driven direct entity operation path that resolves explicit current-turn entity IDs before stale context/profile authority and realizes identity/topic/works answers from cards and relations.
- prohibited_local_patch: Do not branch on specific names, exact prompts, or expected answer strings.
### 莫言有什么代表作吗？
- primary_root_cause: method_profile_leakage
- secondary_root_causes: card_serialization, fallback_selection, answer_source_authority
- evidence: 目前卡片覆盖还不完整，所以先给已确认入口：代表作可先抓《红高粱》；它们分别通向不同主题入口，不能贴歌词。
- affected_files: web/dialogic_bridge_runtime.js, web/dialogic_domain_profiles.js, web/culture_runtime.js, web/culture_planner.js, web/response_mode_manager.js
- why_the_KB_card_count_did_not_help: The selected answer authority could be a dialogic domain profile, generic planner branch, or raw card serialization path; adding cards does not force explicit entity + operation authority.
- sibling_entities_affected: true
- generalized_repair_point: Add a type-driven direct entity operation path that resolves explicit current-turn entity IDs before stale context/profile authority and realizes identity/topic/works answers from cards and relations.
- prohibited_local_patch: Do not branch on specific names, exact prompts, or expected answer strings.

## Frozen Sibling Sample
Seed: 240619
Selected count: 20
- music: person.lin_xi (林夕)
- music: person.a_mei (张惠妹)
- music: person.cui_jian (崔健)
- music: person.beyond (Beyond)
- music: person.li_zongsheng (李宗盛)
- literature: person.murasaki_shikibu (紫式部)
- literature: person.kafka (卡夫卡)
- literature: person.ba_jin (巴金)
- literature: person.natsume_soseki (夏目漱石)
- literature: person.lu_xun (鲁迅)
- film: person.ann_hui (许鞍华)
- film: person.koreeda_hirokazu (是枝裕和)
- film: person.wong_kar_wai (王家卫)
- film: person.edward_yang (杨德昌)
- film: person.hou_hsiao_hsien (侯孝贤)
- art_design_science_technology: person.alan_kay (艾伦·凯)
- art_design_science_technology: person.walter_gropius (Walter Gropius)
- art_design_science_technology: person.ted_nelson (泰德·尼尔森)
- art_design_science_technology: person.warhol (沃霍尔)
- art_design_science_technology: person.tim_berners_lee (蒂姆·伯纳斯-李)

## Phase A Status
Runtime code was not modified before this trace and classification were generated.
