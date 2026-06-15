#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "data/culture_cards/external_r17_knowledge_cards.jsonl");
const REPORT = resolve(ROOT, "artifacts/training_os/r17_external_knowledge_coverage_report.json");

const SOURCE = {
  wikidata: { id: "src_wikidata_cc0", license: "https://creativecommons.org/publicdomain/zero/1.0/" },
  musicbrainz: { id: "src_musicbrainz_core_cc0", license: "https://creativecommons.org/publicdomain/zero/1.0/" },
  openalex: { id: "src_openalex_cc0", license: "https://creativecommons.org/publicdomain/zero/1.0/" },
  met: { id: "src_met_open_access_cc0", license: "https://creativecommons.org/publicdomain/zero/1.0/" }
};

const DATA = [
  ["music.chinese_pop_general", "person", SOURCE.musicbrainz, ["Teresa Teng", "邓丽君"], "MusicBrainz/Wikidata-style metadata label candidate for a Chinese-language popular music artist."],
  ["music.chinese_pop_general", "person", SOURCE.musicbrainz, ["Lo Ta-yu", "罗大佑"], "Music metadata label candidate for a Taiwan pop/rock singer-songwriter."],
  ["music.chinese_pop_general", "person", SOURCE.musicbrainz, ["Jonathan Lee", "李宗盛"], "Music metadata label candidate for a Chinese-language songwriter and producer."],
  ["music.chinese_pop_general", "person", SOURCE.musicbrainz, ["Cui Jian", "崔健"], "Music metadata label candidate associated with mainland Chinese rock."],
  ["music.chinese_pop_general", "person", SOURCE.musicbrainz, ["Faye Wong", "王菲"], "Music metadata label candidate for a Chinese-language pop singer."],
  ["music.chinese_pop_general", "person", SOURCE.musicbrainz, ["Jay Chou", "周杰伦"], "Music metadata label candidate for a Chinese-language pop artist."],
  ["music.chinese_pop_general", "person", SOURCE.musicbrainz, ["A-Mei", "张惠妹"], "Music metadata label candidate for a Mandopop singer."],
  ["music.chinese_pop_general", "person", SOURCE.musicbrainz, ["Beyond"], "Music metadata label candidate for a Hong Kong rock band."],
  ["music.chinese_pop_general", "movement", SOURCE.wikidata, ["Taiwan campus folk song movement", "台湾民歌运动"], "Metadata seed for a Taiwan popular music movement/period."],
  ["music.chinese_pop_general", "period", SOURCE.wikidata, ["1980s Taiwan popular music"], "Period metadata seed for Chinese-language popular music coverage."],
  ["music.chinese_pop_general", "period", SOURCE.wikidata, ["1990s Chinese-language popular music"], "Period metadata seed for Chinese-language popular music coverage."],
  ["music.chinese_pop_general", "period", SOURCE.wikidata, ["2000s Mandopop"], "Period metadata seed for Chinese-language popular music coverage."],
  ["music.chinese_pop_general", "work", SOURCE.musicbrainz, ["Zhi Hu Zhe Ye", "之乎者也"], "Music metadata title candidate for an album/work label; no lyrics."],
  ["music.chinese_pop_general", "work", SOURCE.musicbrainz, ["Lukang, the Little Town", "鹿港小镇"], "Music metadata title candidate for a song/work label; no lyrics."],
  ["music.chinese_pop_general", "work", SOURCE.musicbrainz, ["Childhood", "童年"], "Music metadata title candidate for a song/work label; no lyrics."],
  ["music.chinese_pop_general", "work", SOURCE.musicbrainz, ["Love Song 1980", "恋曲1980"], "Music metadata title candidate for a song/work label; no lyrics."],
  ["music.chinese_pop_general", "work", SOURCE.musicbrainz, ["Love Song 1990", "恋曲1990"], "Music metadata title candidate for a song/work label; no lyrics."],
  ["music.chinese_pop_general", "work", SOURCE.musicbrainz, ["Nothing to My Name", "一无所有"], "Music metadata title candidate for a song/work label; no lyrics."],
  ["music.chinese_pop_general", "work", SOURCE.musicbrainz, ["Boundless Oceans, Vast Skies", "海阔天空"], "Music metadata title candidate for a song/work label; no lyrics."],
  ["music.chinese_pop_general", "work", SOURCE.musicbrainz, ["Red Bean", "红豆"], "Music metadata title candidate for a song/work label; no lyrics."],
  ["music.chinese_pop_general", "work", SOURCE.musicbrainz, ["Fantasy", "范特西"], "Music metadata title candidate for an album label; no lyrics."],
  ["literature.japanese", "period", SOURCE.wikidata, ["Heian literature", "平安文学"], "Wikidata-style period label candidate for Japanese literary history."],
  ["literature.japanese", "period", SOURCE.wikidata, ["Edo literature", "江户文学"], "Wikidata-style period label candidate for Japanese literary history."],
  ["literature.japanese", "period", SOURCE.wikidata, ["Meiji literature", "明治文学"], "Wikidata-style period label candidate for Japanese literary history."],
  ["literature.japanese", "period", SOURCE.wikidata, ["Postwar Japanese literature", "战后日本文学"], "Wikidata-style period label candidate for Japanese literary history."],
  ["literature.japanese", "person", SOURCE.wikidata, ["Murasaki Shikibu", "紫式部"], "Author metadata label candidate for Japanese literature coverage."],
  ["literature.japanese", "person", SOURCE.wikidata, ["Sei Shonagon", "清少纳言"], "Author metadata label candidate for Japanese literature coverage."],
  ["literature.japanese", "person", SOURCE.wikidata, ["Matsuo Basho", "松尾芭蕉"], "Author metadata label candidate for haiku/Edo literature coverage."],
  ["literature.japanese", "person", SOURCE.wikidata, ["Natsume Soseki", "夏目漱石"], "Author metadata label candidate for modern Japanese literature coverage."],
  ["literature.japanese", "person", SOURCE.wikidata, ["Akutagawa Ryunosuke", "芥川龙之介"], "Author metadata label candidate for modern Japanese literature coverage."],
  ["literature.japanese", "person", SOURCE.wikidata, ["Tanizaki Junichiro", "谷崎润一郎"], "Author metadata label candidate for modern Japanese literature coverage."],
  ["literature.japanese", "person", SOURCE.wikidata, ["Kawabata Yasunari", "川端康成"], "Author metadata label candidate for Japanese literature coverage."],
  ["literature.japanese", "person", SOURCE.wikidata, ["Dazai Osamu", "太宰治"], "Author metadata label candidate for Japanese literature coverage."],
  ["literature.japanese", "person", SOURCE.wikidata, ["Mishima Yukio", "三岛由纪夫"], "Author metadata label candidate for Japanese literature coverage."],
  ["literature.japanese", "person", SOURCE.wikidata, ["Abe Kobo", "安部公房"], "Author metadata label candidate for Japanese literature coverage."],
  ["literature.japanese", "person", SOURCE.wikidata, ["Oe Kenzaburo", "大江健三郎"], "Author metadata label candidate for Japanese literature coverage."],
  ["literature.japanese", "person", SOURCE.wikidata, ["Murakami Haruki", "村上春树"], "Author metadata label candidate for contemporary Japanese literature coverage."],
  ["literature.japanese", "work", SOURCE.wikidata, ["The Tale of Genji", "源氏物语"], "Work title metadata candidate for Japanese literature coverage."],
  ["literature.japanese", "work", SOURCE.wikidata, ["The Pillow Book", "枕草子"], "Work title metadata candidate for Japanese literature coverage."],
  ["literature.japanese", "work", SOURCE.wikidata, ["Oku no Hosomichi", "奥之细道"], "Work title metadata candidate for Japanese literature coverage."],
  ["literature.japanese", "work", SOURCE.wikidata, ["I Am a Cat", "我是猫"], "Work title metadata candidate for Japanese literature coverage."],
  ["literature.japanese", "work", SOURCE.wikidata, ["Kokoro", "心"], "Work title metadata candidate for Japanese literature coverage."],
  ["literature.japanese", "work", SOURCE.wikidata, ["Rashomon", "罗生门"], "Work title metadata candidate for Japanese literature coverage."],
  ["literature.japanese", "work", SOURCE.wikidata, ["Snow Country", "雪国"], "Work title metadata candidate for Japanese literature coverage."],
  ["literature.japanese", "work", SOURCE.wikidata, ["No Longer Human", "人间失格"], "Work title metadata candidate for Japanese literature coverage."],
  ["literature.japanese", "work", SOURCE.wikidata, ["The Woman in the Dunes", "砂之女"], "Work title metadata candidate for Japanese literature coverage."],
  ["literature.chinese_modern", "person", SOURCE.wikidata, ["Lu Xun", "鲁迅"], "Author metadata label candidate for modern Chinese literature coverage."],
  ["literature.chinese_modern", "person", SOURCE.wikidata, ["Eileen Chang", "张爱玲"], "Author metadata label candidate for modern Chinese literature coverage."],
  ["literature.chinese_modern", "person", SOURCE.wikidata, ["Shen Congwen", "沈从文"], "Author metadata label candidate for modern Chinese literature coverage."],
  ["literature.chinese_modern", "person", SOURCE.wikidata, ["Lao She", "老舍"], "Author metadata label candidate for modern Chinese literature coverage."],
  ["literature.chinese_modern", "person", SOURCE.wikidata, ["Yu Hua", "余华"], "Author metadata label candidate for modern Chinese literature coverage."],
  ["literature.chinese_modern", "person", SOURCE.wikidata, ["Mo Yan", "莫言"], "Author metadata label candidate for modern Chinese literature coverage."],
  ["literature.chinese_modern", "movement", SOURCE.wikidata, ["New Culture Movement", "新文化运动"], "Movement metadata seed for modern Chinese literature."],
  ["literature.chinese_modern", "work", SOURCE.wikidata, ["Call to Arms", "呐喊"], "Work title metadata candidate for modern Chinese literature."],
  ["literature.chinese_modern", "work", SOURCE.wikidata, ["The True Story of Ah Q", "阿Q正传"], "Work title metadata candidate for modern Chinese literature."],
  ["literature.chinese_modern", "work", SOURCE.wikidata, ["Border Town", "边城"], "Work title metadata candidate for modern Chinese literature."],
  ["literature.chinese_modern", "work", SOURCE.wikidata, ["Rickshaw Boy", "骆驼祥子"], "Work title metadata candidate for modern Chinese literature."],
  ["literature.chinese_modern", "work", SOURCE.wikidata, ["To Live", "活着"], "Work title metadata candidate for modern Chinese literature."],
  ["literature.korean_modern", "person", SOURCE.wikidata, ["Han Kang", "韩江"], "Author metadata label candidate for Korean literature coverage."],
  ["literature.korean_modern", "person", SOURCE.wikidata, ["Hwang Sok-yong", "黄晳暎"], "Author metadata label candidate for Korean literature coverage."],
  ["literature.korean_modern", "work", SOURCE.wikidata, ["The Vegetarian", "素食者"], "Work title metadata candidate for Korean literature coverage."],
  ["art_history", "movement", SOURCE.met, ["Renaissance"], "Art-history period/movement metadata seed."],
  ["art_history", "movement", SOURCE.met, ["Impressionism"], "Art-history movement metadata seed."],
  ["art_history", "movement", SOURCE.met, ["Dada"], "Art-history movement metadata seed."],
  ["art_history", "movement", SOURCE.met, ["Surrealism"], "Art-history movement metadata seed."],
  ["art_history", "movement", SOURCE.met, ["Abstract Expressionism"], "Art-history movement metadata seed."],
  ["art_history", "movement", SOURCE.met, ["Minimalism"], "Art-history movement metadata seed."],
  ["art_history", "movement", SOURCE.met, ["Conceptual art"], "Art-history movement metadata seed."],
  ["art_history", "movement", SOURCE.met, ["Bauhaus"], "Art and design movement metadata seed."],
  ["art_history", "person", SOURCE.wikidata, ["Marcel Duchamp", "杜尚"], "Artist metadata label candidate for art-history coverage."],
  ["art_history", "person", SOURCE.wikidata, ["Pablo Picasso"], "Artist metadata label candidate for art-history coverage."],
  ["art_history", "person", SOURCE.wikidata, ["Wassily Kandinsky"], "Artist metadata label candidate for art-history coverage."],
  ["art_history", "person", SOURCE.wikidata, ["Andy Warhol"], "Artist metadata label candidate for art-history coverage."],
  ["art_history", "person", SOURCE.wikidata, ["Jackson Pollock"], "Artist metadata label candidate for art-history coverage."],
  ["art_history", "person", SOURCE.wikidata, ["Piet Mondrian"], "Artist metadata label candidate for art-history coverage."],
  ["art_history", "person", SOURCE.wikidata, ["Walter Gropius"], "Design/architecture metadata label candidate."],
  ["philosophy", "person", SOURCE.wikidata, ["Plato"], "Philosopher metadata label candidate."],
  ["philosophy", "person", SOURCE.wikidata, ["Aristotle"], "Philosopher metadata label candidate."],
  ["philosophy", "person", SOURCE.wikidata, ["Immanuel Kant"], "Philosopher metadata label candidate."],
  ["philosophy", "person", SOURCE.wikidata, ["G. W. F. Hegel"], "Philosopher metadata label candidate."],
  ["philosophy", "person", SOURCE.wikidata, ["Friedrich Nietzsche"], "Philosopher metadata label candidate."],
  ["philosophy", "person", SOURCE.wikidata, ["Soren Kierkegaard"], "Philosopher metadata label candidate."],
  ["philosophy", "person", SOURCE.wikidata, ["Martin Heidegger"], "Philosopher metadata label candidate."],
  ["philosophy", "person", SOURCE.wikidata, ["Jean-Paul Sartre"], "Philosopher metadata label candidate."],
  ["philosophy", "person", SOURCE.wikidata, ["Simone de Beauvoir"], "Philosopher metadata label candidate."],
  ["philosophy", "person", SOURCE.wikidata, ["Albert Camus"], "Philosopher metadata label candidate."],
  ["philosophy", "person", SOURCE.wikidata, ["Jacques Derrida"], "Philosopher metadata label candidate."],
  ["philosophy", "person", SOURCE.wikidata, ["Michel Foucault"], "Philosopher metadata label candidate."],
  ["philosophy", "concept", SOURCE.wikidata, ["existentialism"], "Concept metadata seed for philosophy coverage."],
  ["philosophy", "concept", SOURCE.wikidata, ["phenomenology"], "Concept metadata seed for philosophy coverage."],
  ["philosophy", "concept", SOURCE.wikidata, ["deconstruction"], "Concept metadata seed for philosophy coverage."],
  ["philosophy", "concept", SOURCE.wikidata, ["structuralism"], "Concept metadata seed for philosophy coverage."]
];

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, ".").replace(/^\.+|\.+$/g, "");
}

function moves(name) {
  return {
    overview: `Use ${name} as a reviewed metadata anchor only after source review.`,
    works_list: "List titles only when concrete reviewed work cards exist.",
    representative_works: "Do not infer representative status from metadata presence alone.",
    entry_path: "Offer bounded entry points from reviewed entities, periods, and works.",
    explain_work: "Explain through metadata and relation context; do not quote source text.",
    compare: "Compare both sides with an explicit axis and avoid one-sided answers.",
    country_relation: "Relate language, country, institution, and period only when metadata supports it.",
    why_it_matters: "State significance as bounded interpretation, not as copied source prose.",
    quote_or_lyrics_boundary: "No lyrics, long quotations, or raw source text; summarize labels and relations."
  };
}

function card([domain, entityType, source, names, core], index) {
  const primary = names[0];
  return {
    id: `external.r17.${domain}.${entityType}.${slug(primary)}.${index}`,
    entity_type: entityType,
    names,
    domain,
    factual_core: core,
    short_intro: "R17 review-only public metadata candidate for expanding local culture coverage.",
    works: entityType === "work" ? names : [],
    representative_works: [],
    periods: entityType === "period" ? names : [],
    themes: ["external_metadata", domain, entityType],
    style_axes: [],
    historical_context: entityType === "period" || entityType === "movement" ? names : [],
    entry_points: names,
    related_entities: [{ id: source.id, relation: "metadata_source" }],
    comparison_axes: ["period", "medium", "relation", "source_coverage"],
    conversation_moves: moves(primary),
    safe_boundaries: ["metadata_only", "needs_review", "no_raw_source_text", "no_private_data"],
    copyright_policy: "Use labels, titles, dates, and relation metadata only; no lyrics or long quoted text.",
    followup_bindings: [],
    source_ids: [source.id],
    license_refs: [source.license],
    source_summary: `${source.id} public metadata label candidate.`,
    confidence: 0.86,
    visibility: "public",
    approved_for_public_runtime: false,
    needs_review: true,
    not_to_infer: [
      "Do not infer private biography.",
      "Do not treat metadata presence as cultural importance.",
      "Do not use in public runtime until reviewed."
    ],
    eval_tags: ["r17_external_knowledge", "needs_review", domain]
  };
}

async function main() {
  const cards = DATA.map(card);
  await mkdir(dirname(OUT), { recursive: true });
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(OUT, `${cards.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  const byDomain = cards.reduce((acc, row) => {
    acc[row.domain] ||= { cards: 0, person: 0, work: 0, period: 0, movement: 0, concept: 0 };
    acc[row.domain].cards += 1;
    acc[row.domain][row.entity_type] = (acc[row.domain][row.entity_type] || 0) + 1;
    return acc;
  }, {});
  const report = {
    ok: true,
    out: "data/culture_cards/external_r17_knowledge_cards.jsonl",
    cards: cards.length,
    by_domain: byDomain,
    approved_for_public_runtime: 0,
    needs_review: cards.length,
    raw_corpora_downloaded: false
  };
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
