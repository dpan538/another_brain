# Culture Card Schema

This document defines the culture-card contract for local knowledge, relation retrieval, answer planning, and anti-collapse evals. Culture cards are not answer-bank rows. They hold reusable fields that a planner can render differently for different question types.

Culture cards must not contain lyrics, long copyrighted passages, private information, or source-framing prose such as "according to the report".

## Canonical Schema

```json
{
  "id": "",
  "entity_type": "person | work | country | period | movement | genre | concept | theme",
  "names": [],
  "domain": "",
  "factual_core": "",
  "short_intro": "",
  "works": [],
  "representative_works": [],
  "periods": [],
  "themes": [],
  "style_axes": [],
  "historical_context": [],
  "entry_points": [],
  "related_entities": [],
  "comparison_axes": [],
  "conversation_moves": {
    "overview": "",
    "works_list": "",
    "representative_works": "",
    "entry_path": "",
    "explain_work": "",
    "compare": "",
    "country_relation": "",
    "why_it_matters": "",
    "quote_or_lyrics_boundary": ""
  },
  "safe_boundaries": [],
  "followup_bindings": [],
  "eval_tags": []
}
```

## Field Contract

- `id`: stable local identifier. It should be referenced by evals and relation edges.
- `entity_type`: one of the allowed schema types. A tradition or domain can be represented as `concept`.
- `names`: aliases and common surface forms.
- `domain`: broad local domain, such as `music.zh`, `literature.japan`, or `culture`.
- `factual_core`: short factual anchor, not a full encyclopedia entry.
- `short_intro`: one short conversational description.
- `works`: works connected to a person, movement, or tradition.
- `representative_works`: smaller curated set for representative-work questions.
- `periods`: relevant historical periods.
- `themes`: reusable theme tags.
- `style_axes`: style descriptors used for comparison.
- `historical_context`: compact context anchors.
- `entry_points`: recommended starting points for reading/listening.
- `related_entities`: relation targets with relation labels.
- `comparison_axes`: axes that make comparisons bounded and non-generic.
- `conversation_moves`: question-type-specific render hints. These are not final fixed answers.
- `safe_boundaries`: copyright, privacy, factual, or overgeneralization constraints.
- `followup_bindings`: likely bindings when this card was the recent focus.
- `eval_tags`: tags used by regression suites.

## Example: 罗大佑 Person Card

```json
{
  "id": "person.luo_dayou",
  "entity_type": "person",
  "names": ["罗大佑", "Lo Ta-yu", "Luo Dayou"],
  "domain": "music.zh",
  "factual_core": "台湾音乐人，1980年代以来以流行歌曲、社会观察和个人记忆书写受到关注。",
  "short_intro": "可以把他先理解成把城市、青春、历史感和社会批评放进流行歌的人。",
  "works": ["work.album.zhihu_zheye", "work.song.lukang_xiaozhen", "work.song.tongnian", "work.song.lianqu_1980", "work.song.lianqu_1990"],
  "representative_works": ["work.album.zhihu_zheye", "work.song.lukang_xiaozhen", "work.song.tongnian", "work.song.lianqu_1990"],
  "periods": ["1980s_Taiwan_pop", "Mandarin_pop_modern_period"],
  "themes": ["modernization", "youth_memory", "urban_rural_displacement", "social_observation", "time_and_history"],
  "style_axes": ["plainspoken_but_sharp", "folk_rock_pressure", "narrative_songwriting", "public_private_overlap"],
  "historical_context": ["1980年代华语流行音乐转型", "城市化与社会变化进入流行歌表达"],
  "entry_points": ["先听代表作形成轮廓", "再从《之乎者也》理解早期问题意识", "避免把全部作品只读成政治口号"],
  "related_entities": [
    { "id": "work.album.zhihu_zheye", "relation": "debut_album" },
    { "id": "work.song.tongnian", "relation": "representative_song" },
    { "id": "theme.modernization_loss", "relation": "theme" }
  ],
  "comparison_axes": ["时代变化", "个人记忆", "流行歌曲中的社会观察", "传统与现代的拉扯"],
  "conversation_moves": {
    "overview": "先给人物定位，再用一两个主题说明他的特殊性。",
    "works_list": "列出若干常见作品名，不展开歌词。",
    "representative_works": "给代表作并说明为什么代表，不追求穷尽。",
    "entry_path": "从易进入的歌开始，再进入早期专辑。",
    "explain_work": "如果用户点名作品，转到 work card。",
    "compare": "只在主题、时代感、形式位置上比较，不声称直接影响。",
    "country_relation": "说明台湾/华语流行音乐语境，不把人等同于地区。",
    "why_it_matters": "说明他如何扩大流行歌能承载的社会和记忆内容。",
    "quote_or_lyrics_boundary": "不输出歌词；可改为讲主题、背景、结构或影响。"
  },
  "safe_boundaries": ["no_lyrics", "no_private_life_guessing", "do_not_reduce_all_works_to_politics", "distinguish_album_and_song_titles"],
  "followup_bindings": ["work.album.zhihu_zheye", "work.song.tongnian", "theme.youth_memory"],
  "eval_tags": ["culture.music", "works_list", "representative_works", "no_lyrics", "followup_binding"]
}
```

## Example: 《之乎者也》 Work Card

```json
{
  "id": "work.album.zhihu_zheye",
  "entity_type": "work",
  "names": ["之乎者也", "《之乎者也》"],
  "domain": "music.zh",
  "factual_core": "罗大佑早期重要专辑和同名作品标题；标题借文言虚词形成讽刺和时代感。",
  "short_intro": "这个标题适合从语言姿态、社会批评和早期华语流行歌变化来理解。",
  "works": ["work.song.lukang_xiaozhen", "work.song.tongnian"],
  "representative_works": ["work.song.lukang_xiaozhen", "work.song.tongnian"],
  "periods": ["1980s_Taiwan_pop"],
  "themes": ["language_parody", "social_observation", "modernization", "youth_memory", "public_discourse"],
  "style_axes": ["ironic_title", "direct_social_pressure", "folk_rock_texture"],
  "historical_context": ["早期华语流行音乐扩大社会表达空间", "传统语言形式被拿来反讽现代空话"],
  "entry_points": ["先理解标题的语言反讽", "再听代表曲目中的城乡、青春和时代主题", "不要从歌词全文入手"],
  "related_entities": [
    { "id": "person.luo_dayou", "relation": "created_by" },
    { "id": "theme.language_parody", "relation": "theme" },
    { "id": "theme.modernization_loss", "relation": "theme" }
  ],
  "comparison_axes": ["标题语言", "时代批评", "专辑位置", "个人记忆与公共议题"],
  "conversation_moves": {
    "overview": "先说明它在罗大佑早期作品中的位置。",
    "works_list": "若用户要曲目，只给短名单并提示不输出歌词。",
    "representative_works": "说明它为何可作为早期代表，而不是只列名。",
    "entry_path": "建议先抓标题和时代语境，再进入具体歌曲。",
    "explain_work": "解释标题里的文言姿态、反讽和社会语气。",
    "compare": "可和其他作品比较语言策略、时代感和主题。",
    "country_relation": "放回台湾和华语流行音乐转型语境。",
    "why_it_matters": "强调它让流行歌更能承载时代观察和公共情绪。",
    "quote_or_lyrics_boundary": "不提供歌词全文或长段原文；可以解释主题、标题和背景。"
  },
  "safe_boundaries": ["no_lyrics", "distinguish_album_from_song_when_needed", "do_not_overclaim_single_meaning"],
  "followup_bindings": ["person.luo_dayou", "theme.language_parody", "theme.social_observation"],
  "eval_tags": ["culture.music", "work_explanation", "followup_binding", "copyright_boundary"]
}
```

## Example: 日本文学 Tradition Card

```json
{
  "id": "concept.japanese_literature",
  "entity_type": "concept",
  "names": ["日本文学", "Japanese literature", "日本文学传统"],
  "domain": "literature.japan",
  "factual_core": "以日语和日本历史文化语境为主要脉络的文学传统，横跨古典、近现代和当代。",
  "short_intro": "它不是一种单一情绪，而是一条很长的传统，里面有宫廷书写、俳句、近代小说、战后文学和当代小说等不同入口。",
  "works": ["work.kokoro", "work.botchan", "work.snow_country", "work.no_longer_human", "work.norwegian_wood"],
  "representative_works": ["work.kokoro", "work.snow_country", "work.no_longer_human"],
  "periods": ["classical_japan", "meiji_modernity", "postwar_japan", "contemporary_japan"],
  "themes": ["modern_self", "seasonality", "impermanence", "shame_and_social_pressure", "war_and_aftermath", "urban_loneliness"],
  "style_axes": ["compressed_silence", "psychological_modernity", "lyrical_image", "social_dislocation", "popular_modern_voice"],
  "historical_context": ["语言、国家制度、翻译和现代化共同改变文学形式", "近现代作家常处理个人与社会秩序之间的压力"],
  "entry_points": ["想容易进入可从《少爷》或短篇开始", "想看现代自我可读《心》", "想看意象和抒情可读《雪国》", "想进入当代可从村上春树较易读的长篇开始"],
  "related_entities": [
    { "id": "person.natsume_soseki", "relation": "representative_author" },
    { "id": "person.kawabata_yasunari", "relation": "representative_author" },
    { "id": "person.dazai_osamu", "relation": "representative_author" },
    { "id": "person.haruki_murakami", "relation": "contemporary_entry_author" },
    { "id": "country.japan", "relation": "cultural_context" }
  ],
  "comparison_axes": ["古典/近代/当代", "心理小说/抒情意象/大众现代性", "国家语境与文学传统", "个人孤独与社会结构"],
  "conversation_moves": {
    "overview": "先说明它是一条多时期传统，不压成一种情绪。",
    "works_list": "按作者或时期给短名单，不追求穷尽。",
    "representative_works": "给代表作并说明各自入口价值。",
    "entry_path": "给2到3条可执行阅读路径。",
    "explain_work": "转到具体 work card，解释主题和位置。",
    "compare": "用时代、主题、叙事方式或风格轴比较。",
    "country_relation": "说明日本是语言、历史和制度语境，不等于文学本身。",
    "why_it_matters": "说明它如何呈现现代化、主体、社会压力和美感形式。",
    "quote_or_lyrics_boundary": "不输出长段版权文本；可以摘要、解释主题和阅读路径。"
  },
  "safe_boundaries": ["no_long_copyrighted_text", "do_not_reduce_to_silence_or_season_only", "avoid_single_mood_summary", "distinguish_country_from_literary_tradition"],
  "followup_bindings": ["person.natsume_soseki", "person.kawabata_yasunari", "person.haruki_murakami", "work.kokoro", "work.snow_country"],
  "eval_tags": ["culture.literature", "overview", "author_list", "entry_path", "compare", "country_relation"]
}
```

## Planner Contract

For culture prompts, the answer planner must select the conversation move by `question_type`:

- `overview`: use `short_intro`, periods, and themes.
- `works_list`: use `works` or relation edges.
- `representative_works`: use `representative_works` and a one-line reason.
- `entry_path`: use `entry_points`.
- `explain_work`: retrieve the work card and explain title/theme/context.
- `compare`: use `comparison_axes`, `style_axes`, and relation edges.
- `country_relation`: explain context relation without equating country and literature.
- `why_it_matters`: use historical context, themes, and bounded significance.
- `quote_or_lyrics_boundary`: refuse long copyrighted text while offering summary or explanation.

If a culture answer can be produced by one fixed sentence, it is probably not using this schema.
