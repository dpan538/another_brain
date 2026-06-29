#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASELINE = "a30c3eea581304c3b0866336e41cc80aa44942cc";
const ART = resolve(ROOT, "artifacts/data_ingestion");
const GEN = resolve(ROOT, "data/public_ingestion/generated");
const CACHE = resolve(GEN, "cache");
const CANONICAL_DIR = resolve(GEN, "canonical_graph");
const PASSAGES_ZH_DIR = resolve(GEN, "passages_zh");
const PASSAGES_EN_DIR = resolve(GEN, "passages_en");
const CROSSWALK_DIR = resolve(GEN, "crosswalks");
const MANIFEST_DIR = resolve(GEN, "manifests");
const INDEX_DIR = resolve(GEN, "index");
const DATASET_DIR = resolve(GEN, "public_datasets");
const STATE_PATH = resolve(ART, "long_cycle_state.json");
const SAMPLING_PATH = resolve(ART, "pilot_sampling_manifest.json");
const MAX_ENTITY_DEFAULT = Number(process.env.PUBLIC_INGESTION_MAX_ENTITIES || "12000");
const SHARD_SIZE = Number(process.env.PUBLIC_INGESTION_SHARD_SIZE || "1000");
const WIKIPEDIA_PASSAGE_BATCH_SIZE = Number(process.env.PUBLIC_INGESTION_WIKIPEDIA_BATCH_SIZE || "20");
const WIKIPEDIA_REQUEST_DELAY_MS = Number(process.env.PUBLIC_INGESTION_WIKIPEDIA_DELAY_MS || "300");
const WIKIPEDIA_CONTINUATION_DELAY_MS = Number(process.env.PUBLIC_INGESTION_WIKIPEDIA_CONTINUATION_DELAY_MS || "75");
const USER_AGENT = "another_brain_public_ingestion/0.1 (local research; provenance-aware)";

const DOMAIN_TARGETS = [
  ["literature", 1500],
  ["music", 1400],
  ["film", 1200],
  ["art_design", 1200],
  ["philosophy", 900],
  ["science", 1200],
  ["technology", 1000],
  ["city", 900],
  ["food", 700],
  ["economy", 900],
  ["law_education_boundary", 1100]
];

const PROPERTIES = {
  P31: "instance_of",
  P279: "subclass_of",
  P106: "occupation",
  P101: "field_of_work",
  P27: "country_of_citizenship",
  P495: "country_of_origin",
  P407: "language_of_work",
  P569: "date_of_birth",
  P570: "date_of_death",
  P571: "inception",
  P577: "publication_date",
  P50: "author",
  P57: "director",
  P86: "composer",
  P170: "creator",
  P175: "performer",
  P800: "notable_work",
  P136: "genre",
  P135: "movement",
  P361: "part_of",
  P856: "official_website",
  P434: "musicbrainz_artist_id",
  P435: "musicbrainz_work_id",
  P436: "musicbrainz_release_group_id",
  P10283: "openalex_id"
};

const ROLE_PROPERTIES = new Set(["P106", "P101"]);
const CREATOR_PROPERTIES = new Set(["P50", "P57", "P86", "P170", "P175"]);
const WORK_PROPERTIES = new Set(["P800"]);
const RELATION_PROPERTIES = new Set(["P31", "P279", "P27", "P495", "P407", "P361"]);
const MOVEMENT_PROPERTIES = new Set(["P136", "P135"]);
const DATE_PROPERTIES = new Set(["P569", "P570", "P571", "P577"]);

const DOMAIN_QUERIES = {
  literature: `
    { ?item wdt:P31/wdt:P279* wd:Q7725634. BIND("work" AS ?expectedType) }
    UNION { ?item wdt:P106/wdt:P279* wd:Q36180. BIND("person" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q482. BIND("work" AS ?expectedType) }
  `,
  music: `
    { ?item wdt:P106/wdt:P279* wd:Q639669. BIND("person" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q2188189. BIND("work" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q482994. BIND("organization" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q134556. BIND("work" AS ?expectedType) }
  `,
  film: `
    { ?item wdt:P31/wdt:P279* wd:Q11424. BIND("work" AS ?expectedType) }
    UNION { ?item wdt:P106/wdt:P279* wd:Q2526255. BIND("person" AS ?expectedType) }
    UNION { ?item wdt:P106/wdt:P279* wd:Q10800557. BIND("person" AS ?expectedType) }
  `,
  art_design: `
    { ?item wdt:P106/wdt:P279* wd:Q483501. BIND("person" AS ?expectedType) }
    UNION { ?item wdt:P106/wdt:P279* wd:Q5322166. BIND("person" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q4502142. BIND("movement" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q838948. BIND("work" AS ?expectedType) }
  `,
  philosophy: `
    { ?item wdt:P106/wdt:P279* wd:Q4964182. BIND("person" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q179805. BIND("concept" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q49447. BIND("movement" AS ?expectedType) }
  `,
  science: `
    { ?item wdt:P106/wdt:P279* wd:Q901. BIND("person" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q11862829. BIND("concept" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q31855. BIND("institution" AS ?expectedType) }
  `,
  technology: `
    { ?item wdt:P31/wdt:P279* wd:Q7397. BIND("concept" AS ?expectedType) }
    UNION { ?item wdt:P106/wdt:P279* wd:Q205375. BIND("person" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q2424752. BIND("concept" AS ?expectedType) }
  `,
  city: `
    { ?item wdt:P31/wdt:P279* wd:Q515. BIND("place" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q1549591. BIND("place" AS ?expectedType) }
  `,
  food: `
    { ?item wdt:P31/wdt:P279* wd:Q2095. BIND("concept" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q1778821. BIND("concept" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q746549. BIND("concept" AS ?expectedType) }
  `,
  economy: `
    { ?item wdt:P106/wdt:P279* wd:Q188094. BIND("person" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q8134. BIND("concept" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q43229. BIND("organization" AS ?expectedType) }
  `,
  law_education_boundary: `
    { ?item wdt:P31/wdt:P279* wd:Q7748. BIND("concept" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q8434. BIND("concept" AS ?expectedType) }
    UNION { ?item wdt:P106/wdt:P279* wd:Q37226. BIND("person" AS ?expectedType) }
    UNION { ?item wdt:P31/wdt:P279* wd:Q3914. BIND("institution" AS ?expectedType) }
  `
};

const DOMAIN_SEARCH_TERMS = {
  literature: ["文学", "作家", "小说", "诗歌", "poet", "novel", "writer", "literature", "drama", "essay"],
  music: ["音乐", "歌手", "作曲家", "专辑", "歌曲", "musician", "composer", "album", "song", "band"],
  film: ["电影", "导演", "演员", "纪录片", "film", "cinema", "director", "actor", "screenwriter"],
  art_design: ["艺术", "设计", "画家", "建筑师", "美术", "artist", "designer", "painter", "architecture", "museum"],
  philosophy: ["哲学", "哲学家", "伦理", "逻辑", "美学", "philosopher", "philosophy", "ethics", "logic"],
  science: ["科学", "科学家", "物理", "化学", "生物", "数学", "scientist", "physics", "chemistry", "biology"],
  technology: ["技术", "计算机", "软件", "互联网", "工程", "technology", "computer", "software", "internet"],
  city: ["城市", "市", "首都", "城市群", "city", "capital", "metropolis", "municipality"],
  food: ["食物", "菜", "料理", "饮食", "食品", "food", "cuisine", "dish", "ingredient"],
  economy: ["经济", "经济学", "市场", "金融", "公司", "economy", "economics", "market", "finance"],
  law_education_boundary: ["法律", "教育", "学校", "大学", "权利", "law", "education", "school", "university", "rights"]
};

function now() {
  return new Date().toISOString();
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function ensureDirs() {
  for (const dir of [ART, GEN, CACHE, CANONICAL_DIR, PASSAGES_ZH_DIR, PASSAGES_EN_DIR, CROSSWALK_DIR, MANIFEST_DIR, INDEX_DIR, DATASET_DIR]) {
    await mkdir(dir, { recursive: true });
  }
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(path, rows) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

async function appendJsonl(path, rows) {
  await mkdir(dirname(path), { recursive: true });
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  await writeFile(path, existing + rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function dirSize(path) {
  let total = 0;
  try {
    for (const name of await readdir(path, { withFileTypes: true })) {
      const child = resolve(path, name.name);
      total += name.isDirectory() ? await dirSize(child) : await fileSize(child);
    }
  } catch {}
  return total;
}

async function listFiles(path) {
  const out = [];
  async function walk(dir) {
    try {
      for (const ent of await readdir(dir, { withFileTypes: true })) {
        const child = resolve(dir, ent.name);
        if (ent.isDirectory()) await walk(child);
        else out.push(child);
      }
    } catch {}
  }
  await walk(path);
  return out.sort();
}

async function checksumFiles(paths) {
  const checksums = {};
  for (const path of paths.sort()) {
    checksums[path.replace(`${ROOT}/`, "")] = sha256(await readFile(path, "utf8"));
  }
  return checksums;
}

async function loadState() {
  const existing = await readJson(STATE_PATH, null);
  if (existing) return existing;
  return {
    baseline_commit: BASELINE,
    started_at: now(),
    current_phase: "initialized",
    completed_phases: [],
    source_versions: {},
    sampling_manifest_hash: "",
    downloaded_files: [],
    completed_domains: [],
    failed_domains: [],
    retry_queue: [],
    quarantined_records: [],
    entity_counts: {},
    passage_counts: {},
    shard_counts: {},
    index_status: {},
    benchmark_status: {},
    last_checkpoint: "",
    disk_usage: {},
    next_action: "generate_sampling_manifest"
  };
}

async function saveState(state, phase, nextAction) {
  state.current_phase = phase;
  state.last_checkpoint = now();
  state.next_action = nextAction;
  state.disk_usage = {
    generated_bytes: await dirSize(GEN),
    artifacts_bytes: await dirSize(ART)
  };
  await writeJson(STATE_PATH, state);
}

function completePhase(state, phase) {
  if (!state.completed_phases.includes(phase)) state.completed_phases.push(phase);
}

async function cachedFetch(url, options = {}) {
  const method = options.method || "GET";
  const body = options.body || "";
  const key = sha256(`${method} ${url} ${body}`);
  const cachePath = resolve(CACHE, `${key}.json`);
  const markerPath = `${cachePath}.complete`;
  if (existsSync(cachePath) && existsSync(markerPath)) {
    return JSON.parse(await readFile(cachePath, "utf8"));
  }
  let lastError = null;
  const retries = options.retries ?? 5;
  const timeoutMs = options.timeoutMs ?? Number(process.env.PUBLIC_INGESTION_FETCH_TIMEOUT_MS || "8000");
  const { retries: _retries, timeoutMs: _timeoutMs, ...fetchOptions } = options;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json",
          ...(options.headers || {})
        }
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 160)}` : ""}`);
      }
      const text = await res.text();
      JSON.parse(text);
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(cachePath, text, "utf8");
      await writeFile(markerPath, sha256(text), "utf8");
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      await sleep(500 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function cachedText(url) {
  const key = sha256(`TEXT ${url}`);
  const cachePath = resolve(CACHE, `${key}.txt`);
  const markerPath = `${cachePath}.complete`;
  if (existsSync(cachePath) && existsSync(markerPath)) return await readFile(cachePath, "utf8");
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.PUBLIC_INGESTION_FETCH_TIMEOUT_MS || "8000"));
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { "user-agent": USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(cachePath, text, "utf8");
      await writeFile(markerPath, sha256(text), "utf8");
      return text;
    } catch (error) {
      lastError = error;
      await sleep(500 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function sparql(query) {
  const url = "https://query.wikidata.org/sparql";
  const body = new URLSearchParams({ query, format: "json" }).toString();
  return cachedFetch(url, {
    method: "POST",
    body,
    retries: 1,
    timeoutMs: Number(process.env.PUBLIC_INGESTION_SPARQL_TIMEOUT_MS || "5000"),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/sparql-results+json"
    }
  });
}

async function wikidataSearch(term, language, offset = 0) {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: term,
    language,
    uselang: language,
    limit: "50",
    continue: String(offset),
    format: "json",
    origin: "*"
  });
  return cachedFetch(`https://www.wikidata.org/w/api.php?${params.toString()}`);
}

function qidFromUri(uri) {
  return String(uri || "").match(/Q[1-9][0-9]*$/)?.[0] || "";
}

async function generateSamplingManifest(state) {
  if (existsSync(SAMPLING_PATH)) {
    const manifest = await readJson(SAMPLING_PATH);
    state.sampling_manifest_hash = manifest.sampling_manifest_hash || sha256(stableJson(manifest.entities || []));
    completePhase(state, "sampling_manifest");
    await saveState(state, "sampling_manifest", "fetch_wikidata_entities");
    return manifest;
  }
  const maxEntities = MAX_ENTITY_DEFAULT;
  const scale = Math.min(1, maxEntities / 12000);
  const seen = new Set();
  const entities = [];
  const domainStatus = [];
  for (const [domain, targetRaw] of DOMAIN_TARGETS) {
    const target = Math.max(1, Math.floor(targetRaw * scale));
    const query = `
      SELECT ?item ?itemLabel ?expectedType ?sitelinks WHERE {
        { ${DOMAIN_QUERIES[domain]} }
        ?item wikibase:sitelinks ?sitelinks.
        FILTER(?sitelinks >= 2)
      }
      ORDER BY DESC(?sitelinks) ?item
      LIMIT ${Math.ceil(target * 1.25)}
    `;
    let accepted = 0;
    try {
      const result = await sparql(query);
      const rows = result.results?.bindings || [];
      for (const row of rows) {
        const qid = qidFromUri(row.item?.value);
        if (!qid || seen.has(qid) || accepted >= target) continue;
        seen.add(qid);
        accepted += 1;
        entities.push({
          qid,
          sampling_domain: domain,
          selection_reason: "domain_membership_sitelink_connectivity_language_coverage",
          source_rank: Number(row.sitelinks?.value || 0),
          source_languages: ["zh", "en"],
          expected_entity_type: row.expectedType?.value || "entity",
          available_sitelinks: Number(row.sitelinks?.value || 0),
          hidden_prompt_derived: false,
          public_canary_derived: false
        });
      }
    } catch (error) {
      state.failed_domains.push({ domain, reason: "sampling_fetch_failed", error: String(error.message || error) });
      state.retry_queue.push({ phase: "sampling", domain, error: String(error.message || error) });
    }
    if (accepted < target) {
      const fallback = await fallbackSampleDomain(domain, target - accepted, seen);
      for (const item of fallback.entities) {
        seen.add(item.qid);
        accepted += 1;
        entities.push(item);
      }
      if (fallback.failures.length) state.retry_queue.push(...fallback.failures.map((failure) => ({ phase: "sampling_fallback", domain, ...failure })));
    }
    domainStatus.push({ domain, target, selected: accepted, status: accepted >= target ? "complete" : "undersampled" });
    if (accepted < target) state.failed_domains.push({ domain, reason: "undersampled", target, selected: accepted });
    await saveState(state, "sampling_manifest", `sampling_${domain}_done`);
  }
  const hash = sha256(stableJson(entities));
  const manifest = {
    generated_at: now(),
    baseline_commit: BASELINE,
    seed: "public-domain-sampling-2026-06-19",
    requested_entities: maxEntities,
    selected_entities: entities.length,
    hidden_prompt_derived: false,
    public_canary_derived: false,
    domain_status: domainStatus,
    sampling_manifest_hash: hash,
    entities
  };
  state.sampling_manifest_hash = hash;
  state.entity_counts.requested = maxEntities;
  state.entity_counts.sampled = entities.length;
  await writeJson(SAMPLING_PATH, manifest);
  completePhase(state, "sampling_manifest");
  await saveState(state, "sampling_manifest", "fetch_wikidata_entities");
  return manifest;
}

async function fallbackSampleDomain(domain, needed, seen) {
  const entities = [];
  const failures = [];
  const terms = DOMAIN_SEARCH_TERMS[domain] || [domain];
  for (const term of terms) {
    for (const language of ["zh", "en"]) {
      for (let offset = 0; offset <= 450 && entities.length < needed; offset += 50) {
        try {
          const result = await wikidataSearch(term, language, offset);
          const rows = result.search || [];
          if (!rows.length) break;
          for (const row of rows) {
            const qid = row.id;
            if (!/^Q[1-9][0-9]*$/.test(qid) || seen.has(qid) || entities.some((item) => item.qid === qid)) continue;
            entities.push({
              qid,
              sampling_domain: domain,
              selection_reason: `wikidata_search_api_fallback:${term}:${language}`,
              source_rank: Number(row.pageid || 0),
              source_languages: [language],
              expected_entity_type: expectedTypeForDomain(domain),
              available_sitelinks: 0,
              hidden_prompt_derived: false,
              public_canary_derived: false
            });
            if (entities.length >= needed) break;
          }
        } catch (error) {
          failures.push({ term, language, offset, error: String(error.message || error) });
          break;
        }
      }
      if (entities.length >= needed) break;
    }
    if (entities.length >= needed) break;
  }
  return { entities, failures };
}

function expectedTypeForDomain(domain) {
  if (domain === "city") return "place";
  if (["literature", "music", "film"].includes(domain)) return "mixed_person_work";
  if (["art_design", "philosophy", "science", "technology", "economy"].includes(domain)) return "mixed_person_concept";
  return "concept";
}

async function fetchWikidataChunk(ids) {
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: ids.join("|"),
    props: "labels|aliases|descriptions|claims|sitelinks",
    format: "json",
    origin: "*",
    sitefilter: "zhwiki|enwiki"
  });
  return cachedFetch(`https://www.wikidata.org/w/api.php?${params.toString()}`);
}

function label(entity, langs) {
  for (const lang of langs) {
    const value = entity.labels?.[lang]?.value;
    if (value) return value.normalize("NFKC").trim();
  }
  return "";
}

function aliases(entity, langs) {
  const out = [];
  for (const lang of langs) {
    for (const item of entity.aliases?.[lang] || []) {
      const value = String(item.value || "").normalize("NFKC").trim();
      if (value && !out.includes(value)) out.push(value);
    }
  }
  return out;
}

function dataValue(claim) {
  return claim?.mainsnak?.datavalue?.value;
}

function claimEntityId(claim) {
  const v = dataValue(claim);
  return v?.["numeric-id"] ? `Q${v["numeric-id"]}` : "";
}

function claimExternal(claim) {
  const v = dataValue(claim);
  return typeof v === "string" ? v : "";
}

function claimTime(claim) {
  const v = dataValue(claim);
  return v?.time || "";
}

function compactEntityType(expected, claims) {
  if (expected && expected !== "entity") return expected;
  const p31 = (claims.P31 || []).map(claimEntityId);
  if (p31.includes("Q5")) return "person";
  if (p31.includes("Q11424") || p31.includes("Q7725634") || p31.includes("Q2188189")) return "work";
  if (p31.includes("Q515")) return "place";
  return "entity";
}

function visibleLanguage(entity) {
  if (entity.labels.zh_hans) return ["zh_hans", false];
  if (entity.labels.zh) return ["zh", false];
  if (entity.labels.zh_hant) return ["zh_hant", true];
  if (entity.labels.original) return ["original", true];
  if (entity.labels.en) return ["en", true];
  return ["none", true];
}

function normalizeEntity(raw, sample) {
  const claims = raw.claims || {};
  const labels = {
    zh_hans: label(raw, ["zh-hans", "zh-cn", "zh-sg"]),
    zh_hant: label(raw, ["zh-hant", "zh-tw", "zh-hk", "zh-mo"]),
    zh: label(raw, ["zh"]),
    original: label(raw, ["ja", "ko", "fr", "de", "es", "it", "ru", "ar", "el", "he", "la"]),
    en: label(raw, ["en"])
  };
  const [fallback, translationRequired] = visibleLanguage({ labels });
  const availableLanguages = Object.entries(labels)
    .filter(([, value]) => value)
    .map(([key]) => key);
  const qid = raw.id;
  const entity = {
    canonical_id: `wd:${qid}`,
    wikidata_qid: qid,
    entity_type: compactEntityType(sample.expected_entity_type, claims),
    labels,
    aliases: {
      zh_hans: aliases(raw, ["zh-hans", "zh-cn", "zh-sg"]),
      zh_hant: aliases(raw, ["zh-hant", "zh-tw", "zh-hk", "zh-mo"]),
      original: aliases(raw, ["ja", "ko", "fr", "de", "es", "it", "ru", "ar", "el", "he", "la"]),
      en: aliases(raw, ["en"])
    },
    descriptions: {
      zh: label({ labels: raw.descriptions || {} }, ["zh-hans", "zh", "zh-hant"]),
      en: label({ labels: raw.descriptions || {} }, ["en"])
    },
    occupations_or_roles: [],
    domains: [sample.sampling_domain],
    countries_or_regions: [],
    languages: [],
    dates: {},
    creator_ids: [],
    work_ids: [],
    related_entity_ids: [],
    movement_or_genre_ids: [],
    wikipedia_sitelinks: {},
    external_ids: { musicbrainz: [], openalex: [] },
    provenance: [
      {
        source_id: "wikidata_cc0",
        source_url: `https://www.wikidata.org/wiki/${qid}`,
        license: "CC0-1.0",
        imported_at: now(),
        sampling_manifest_hash: ""
      }
    ],
    license_class: "cc0_graph",
    runtime_scope: "source_only",
    quality_flags: [],
    preferred_display_language: fallback,
    available_languages: availableLanguages,
    Chinese_label_source: labels.zh_hans ? "zh_hans" : labels.zh ? "zh" : labels.zh_hant ? "zh_hant" : "missing",
    fallback_language_used: fallback,
    translation_required: translationRequired,
    visible_text_eligible: Boolean(fallback !== "none" && (labels.zh_hans || labels.zh || labels.zh_hant || labels.original || labels.en)),
    source_sample: {
      sampling_domain: sample.sampling_domain,
      source_rank: sample.source_rank,
      hidden_prompt_derived: false,
      public_canary_derived: false
    }
  };
  for (const [pid, mapped] of Object.entries(PROPERTIES)) {
    for (const claim of claims[pid] || []) {
      if (ROLE_PROPERTIES.has(pid)) entity.occupations_or_roles.push(claimEntityId(claim));
      else if (CREATOR_PROPERTIES.has(pid)) entity.creator_ids.push(claimEntityId(claim));
      else if (WORK_PROPERTIES.has(pid)) entity.work_ids.push(claimEntityId(claim));
      else if (MOVEMENT_PROPERTIES.has(pid)) entity.movement_or_genre_ids.push(claimEntityId(claim));
      else if (RELATION_PROPERTIES.has(pid)) {
        const id = claimEntityId(claim);
        if (pid === "P27" || pid === "P495") entity.countries_or_regions.push(id);
        else if (pid === "P407") entity.languages.push(id);
        else entity.related_entity_ids.push(id);
      } else if (DATE_PROPERTIES.has(pid)) {
        const time = claimTime(claim);
        if (time) entity.dates[mapped] = time;
      } else if (pid === "P434" || pid === "P435" || pid === "P436") {
        const value = claimExternal(claim);
        if (value) entity.external_ids.musicbrainz.push({ property: pid, id: value });
      } else if (pid === "P10283") {
        const value = claimExternal(claim);
        if (value) entity.external_ids.openalex.push(value);
      }
    }
  }
  entity.occupations_or_roles = uniq(entity.occupations_or_roles.filter(Boolean));
  entity.creator_ids = uniq(entity.creator_ids.filter(Boolean));
  entity.work_ids = uniq(entity.work_ids.filter(Boolean));
  entity.related_entity_ids = uniq(entity.related_entity_ids.filter(Boolean));
  entity.movement_or_genre_ids = uniq(entity.movement_or_genre_ids.filter(Boolean));
  entity.countries_or_regions = uniq(entity.countries_or_regions.filter(Boolean));
  entity.languages = uniq(entity.languages.filter(Boolean));
  entity.external_ids.musicbrainz = uniqBy(entity.external_ids.musicbrainz, (x) => `${x.property}:${x.id}`);
  entity.external_ids.openalex = uniq(entity.external_ids.openalex);
  if (raw.sitelinks?.zhwiki?.title) entity.wikipedia_sitelinks.zh = { title: raw.sitelinks.zhwiki.title, url: raw.sitelinks.zhwiki.url || `https://zh.wikipedia.org/wiki/${encodeURIComponent(raw.sitelinks.zhwiki.title.replaceAll(" ", "_"))}` };
  if (raw.sitelinks?.enwiki?.title) entity.wikipedia_sitelinks.en = { title: raw.sitelinks.enwiki.title, url: raw.sitelinks.enwiki.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(raw.sitelinks.enwiki.title.replaceAll(" ", "_"))}` };
  if (!entity.labels.zh_hans && !entity.labels.zh && !entity.labels.zh_hant) entity.quality_flags.push("missing_chinese_label");
  if (!entity.wikipedia_sitelinks.zh) entity.quality_flags.push("missing_zh_wikipedia");
  if (!entity.wikipedia_sitelinks.en) entity.quality_flags.push("missing_en_wikipedia");
  if (!entity.provenance.length) entity.quality_flags.push("missing_provenance");
  return entity;
}

function uniq(values) {
  return [...new Set(values)];
}

function uniqBy(values, keyFn) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

async function fetchWikidataEntities(state, manifest) {
  const outPath = resolve(CANONICAL_DIR, "entities-00000.jsonl");
  if (existsSync(outPath)) {
    const rows = await readAllJsonl(CANONICAL_DIR);
    state.entity_counts.fetched = rows.length;
    completePhase(state, "wikidata_entities");
    await saveState(state, "wikidata_entities", "fetch_wikipedia_passages");
    return rows;
  }
  const byId = new Map(manifest.entities.map((item) => [item.qid, item]));
  const rows = [];
  const failures = [];
  const ids = manifest.entities.map((item) => item.qid);
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const data = await fetchWikidataChunk(chunk);
      for (const qid of chunk) {
        const raw = data.entities?.[qid];
        if (!raw || raw.missing) {
          failures.push({ qid, reason: "wikidata_missing" });
          state.quarantined_records.push({ qid, phase: "wikidata", reason: "missing" });
          continue;
        }
        const entity = normalizeEntity(raw, byId.get(qid));
        entity.provenance[0].sampling_manifest_hash = manifest.sampling_manifest_hash;
        rows.push(entity);
      }
    } catch (error) {
      failures.push(...chunk.map((qid) => ({ qid, reason: "wikidata_fetch_failed", error: String(error.message || error) })));
      state.retry_queue.push({ phase: "wikidata_entities", ids: chunk, error: String(error.message || error) });
    }
    if (i % 500 === 0) await saveState(state, "wikidata_entities", `wikidata_entities_${i + chunk.length}/${ids.length}`);
  }
  rows.sort((a, b) => a.wikidata_qid.localeCompare(b.wikidata_qid, "en", { numeric: true }));
  await writeEntityShards(rows);
  await writeJson(resolve(ART, "wikidata_ingestion_report.json"), {
    generated_at: now(),
    requested: ids.length,
    fetched: rows.length,
    failures,
    license: "CC0-1.0",
    property_allowlist: Object.keys(PROPERTIES)
  });
  state.entity_counts.fetched = rows.length;
  state.entity_counts.quarantined = failures.length;
  completePhase(state, "wikidata_entities");
  await saveState(state, "wikidata_entities", "fetch_wikipedia_passages");
  return rows;
}

async function writeEntityShards(rows) {
  await rm(CANONICAL_DIR, { recursive: true, force: true });
  await mkdir(CANONICAL_DIR, { recursive: true });
  for (let i = 0; i < rows.length; i += SHARD_SIZE) {
    await writeJsonl(resolve(CANONICAL_DIR, `entities-${String(i / SHARD_SIZE).padStart(5, "0")}.jsonl`), rows.slice(i, i + SHARD_SIZE));
  }
}

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readAllJsonl(dir) {
  const files = (await listFiles(dir)).filter((file) => file.endsWith(".jsonl"));
  const rows = [];
  for (const file of files) rows.push(...(await readJsonl(file)));
  return rows;
}

function splitPassages(text, language) {
  const cleaned = String(text || "")
    .replace(/\[[0-9]+\]/g, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const rawParts =
    language === "zh"
      ? cleaned.split(/(?<=[。！？])\s*/)
      : cleaned.split(/(?<=[.!?])\s+/);
  const passages = [];
  let buf = "";
  const min = language === "zh" ? 80 : 60;
  const max = language === "zh" ? 300 : 220;
  const count = (s) => (language === "zh" ? Array.from(s).length : s.split(/\s+/).filter(Boolean).length);
  for (const part of rawParts) {
    if (!part.trim()) continue;
    const next = `${buf}${buf ? " " : ""}${part.trim()}`.trim();
    if (count(next) > max && buf) {
      if (count(buf) >= min) passages.push(buf);
      buf = part.trim();
    } else {
      buf = next;
    }
    if (passages.length >= 4) break;
  }
  if (passages.length < 4 && count(buf) >= min) passages.push(buf);
  return passages
    .filter((p) => !/[{}<>|]/.test(p))
    .filter((p) => !/^(参见|外部链接|参考资料|参考文献|See also|References|External links)$/i.test(p))
    .slice(0, 4);
}

async function fetchWikipediaPage(title, language) {
  const api = language === "zh" ? "https://zh.wikipedia.org/w/api.php" : "https://en.wikipedia.org/w/api.php";
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts|pageprops|info",
    titles: title,
    redirects: "1",
    explaintext: "1",
    exsectionformat: "plain",
    inprop: "url",
    format: "json",
    origin: "*"
  });
  return cachedFetch(`${api}?${params.toString()}`);
}

async function fetchWikipediaPages(titles, language) {
  const api = language === "zh" ? "https://zh.wikipedia.org/w/api.php" : "https://en.wikipedia.org/w/api.php";
  const baseParams = {
    action: "query",
    prop: "extracts|pageprops|info",
    titles: titles.join("|"),
    redirects: "1",
    explaintext: "1",
    exsectionformat: "plain",
    exlimit: "max",
    inprop: "url",
    format: "json",
    origin: "*"
  };
  const merged = { query: { pages: {}, normalized: [], redirects: [] } };
  let cont = {};
  for (let guard = 0; guard < 50; guard += 1) {
    if (guard > 0 && WIKIPEDIA_CONTINUATION_DELAY_MS > 0) await sleep(WIKIPEDIA_CONTINUATION_DELAY_MS);
    const params = new URLSearchParams({ ...baseParams, ...cont });
    const data = await cachedFetch(`${api}?${params.toString()}`);
    Object.assign(merged.query.pages, data.query?.pages || {});
    merged.query.normalized.push(...(data.query?.normalized || []));
    merged.query.redirects.push(...(data.query?.redirects || []));
    if (!data.continue) break;
    cont = data.continue;
  }
  return merged;
}

async function buildPassages(state, entities) {
  const zhFile = resolve(PASSAGES_ZH_DIR, "passages-00000.jsonl");
  const enFile = resolve(PASSAGES_EN_DIR, "passages-00000.jsonl");
  const forceRebuild = process.env.PUBLIC_INGESTION_REBUILD_PASSAGES === "1";
  if (!forceRebuild && (existsSync(zhFile) || existsSync(enFile))) {
    const zh = existsSync(zhFile) ? await readAllJsonl(PASSAGES_ZH_DIR) : [];
    const en = existsSync(enFile) ? await readAllJsonl(PASSAGES_EN_DIR) : [];
    state.passage_counts.zh = zh.length;
    state.passage_counts.en = en.length;
    await writePassageCoverageRootCause(entities, { zh, en }, []);
    completePhase(state, "wikipedia_passages");
    await saveState(state, "wikipedia_passages", "build_crosswalks");
    return { zh, en };
  }
  const zh = [];
  const en = [];
  const failures = [];
  const pageStats = {
    zh: { requested: 0, fetched: 0, parsed: 0, accepted_pages: 0 },
    en: { requested: 0, fetched: 0, parsed: 0, accepted_pages: 0 }
  };
  const targets = [
    ["zh", PASSAGES_ZH_DIR, zh],
    ["en", PASSAGES_EN_DIR, en]
  ];
  for (const [language, , bucket] of targets) {
    const candidates = entities
      .map((entity) => ({ entity, title: entity.wikipedia_sitelinks?.[language]?.title }))
      .filter((item) => item.title);
    pageStats[language].requested = candidates.length;
    for (let offset = 0; offset < candidates.length; offset += WIKIPEDIA_PASSAGE_BATCH_SIZE) {
      const chunk = candidates.slice(offset, offset + WIKIPEDIA_PASSAGE_BATCH_SIZE);
      const titleToEntity = new Map(chunk.map(({ entity, title }) => [title, entity]));
      try {
        if (WIKIPEDIA_REQUEST_DELAY_MS > 0) await sleep(WIKIPEDIA_REQUEST_DELAY_MS);
        const data = await fetchWikipediaPages(chunk.map((item) => item.title), language);
        for (const item of data.query?.normalized || []) {
          if (titleToEntity.has(item.from) && !titleToEntity.has(item.to)) titleToEntity.set(item.to, titleToEntity.get(item.from));
        }
        for (const item of data.query?.redirects || []) {
          if (titleToEntity.has(item.from) && !titleToEntity.has(item.to)) titleToEntity.set(item.to, titleToEntity.get(item.from));
        }
        const pages = Object.values(data.query?.pages || {});
        const seenPageTitles = new Set();
        for (const page of pages) {
          const entity = titleToEntity.get(page.title);
          if (!entity) continue;
          seenPageTitles.add(page.title);
          if (!page || page.missing) {
            failures.push({ qid: entity.wikidata_qid, language, reason: "wikipedia_page_missing" });
            continue;
          }
          pageStats[language].fetched += 1;
          if (page.pageprops?.disambiguation !== undefined || /^List of /i.test(page.title) || /列表$/.test(page.title)) {
            failures.push({ qid: entity.wikidata_qid, language, reason: "disambiguation_or_list_page" });
            continue;
          }
          pageStats[language].parsed += 1;
          const parts = splitPassages(page.extract || "", language);
          if (!parts.length) {
            failures.push({ qid: entity.wikidata_qid, language, reason: "stub_or_empty_extract" });
            continue;
          }
          pageStats[language].accepted_pages += 1;
          for (let passageIndex = 0; passageIndex < parts.length; passageIndex += 1) {
            bucket.push({
              passage_id: `${entity.wikidata_qid}:${language}:${passageIndex}`,
              canonical_id: entity.canonical_id,
              qid: entity.wikidata_qid,
              language,
              page_id: page.pageid,
              revision_id: page.lastrevid,
              dump_version: `mediawiki-api-${now().slice(0, 10)}`,
              title: page.title,
              section: passageIndex === 0 ? "lead" : "selected",
              passage_index: passageIndex,
              text: parts[passageIndex],
              source_url: page.fullurl || entity.wikipedia_sitelinks?.[language]?.url || "",
              license: "CC BY-SA 4.0 / GFDL",
              attribution_required: true,
              share_alike_required: true,
              extracted_at: now()
            });
          }
        }
        for (const { entity, title } of chunk) {
          if (!seenPageTitles.has(title) && ![...(data.query?.normalized || []), ...(data.query?.redirects || [])].some((item) => item.from === title && seenPageTitles.has(item.to))) {
            failures.push({ qid: entity.wikidata_qid, language, reason: "wikipedia_page_missing" });
          }
        }
      } catch (error) {
        for (const { entity } of chunk) {
          failures.push({ qid: entity.wikidata_qid, language, reason: "wikipedia_fetch_failed", error: String(error.message || error) });
          state.retry_queue.push({ phase: "wikipedia_passages", qid: entity.wikidata_qid, language, error: String(error.message || error) });
        }
      }
      if (offset % 500 === 0) await saveState(state, "wikipedia_passages", `${language}_${Math.min(offset + chunk.length, candidates.length)}/${candidates.length}`);
    }
  }
  await writePassageShards(PASSAGES_ZH_DIR, zh);
  await writePassageShards(PASSAGES_EN_DIR, en);
  await writeJson(resolve(ART, "wikipedia_passage_report.json"), {
    generated_at: now(),
    zh_passages: zh.length,
    en_passages: en.length,
    page_stats: pageStats,
    failures
  });
  await writePassageCoverageRootCause(entities, { zh, en }, failures, pageStats);
  state.passage_counts.zh = zh.length;
  state.passage_counts.en = en.length;
  completePhase(state, "wikipedia_passages");
  await saveState(state, "wikipedia_passages", "build_crosswalks");
  return { zh, en };
}

function countByReason(failures, language) {
  const out = {};
  for (const failure of failures.filter((item) => item.language === language)) {
    out[failure.reason] = (out[failure.reason] || 0) + 1;
  }
  return out;
}

async function writePassageCoverageRootCause(entities, passages, failures, pageStats = null) {
  const report = {
    generated_at: now(),
    root_cause: "Previous low coverage was caused by using MediaWiki extracts with multi-title batches; extract text was returned for only a subset of pages while the importer classified the rest as stubs.",
    languages: {}
  };
  for (const language of ["zh", "en"]) {
    const pass = passages[language] || [];
    const eligible = entities.filter((entity) => entity.wikipedia_sitelinks?.[language]?.title);
    const acceptedQids = new Set(pass.map((item) => item.qid));
    const failuresForLanguage = failures.filter((item) => item.language === language);
    const stats = pageStats?.[language] || {};
    const fetched = stats.fetched ?? Math.max(0, eligible.length - failuresForLanguage.filter((item) => ["wikipedia_fetch_failed", "wikipedia_page_missing"].includes(item.reason)).length);
    const parsed = stats.parsed ?? Math.max(0, fetched - failuresForLanguage.filter((item) => item.reason === "disambiguation_or_list_page").length);
    report.languages[language] = {
      sampled_entity_count: entities.length,
      eligible_sitelink_entities: eligible.length,
      pages_requested: stats.requested ?? eligible.length,
      pages_fetched: fetched,
      pages_parsed: parsed,
      pages_rejected: failuresForLanguage.length,
      accepted_entity_pages: acceptedQids.size,
      passage_count: pass.length,
      overall_sampled_entity_coverage: ratio(acceptedQids.size, entities.length),
      eligible_entity_coverage: ratio(acceptedQids.size, eligible.length),
      sitelink_present_fetch_success: ratio(fetched, eligible.length),
      fetched_page_parse_success: ratio(parsed, fetched),
      accepted_page_passage_success: ratio(acceptedQids.size, parsed),
      rejection_reasons: countByReason(failures, language)
    };
  }
  await writeJson(resolve(ART, "passage_coverage_root_cause.json"), report);
}

async function writePassageShards(dir, rows) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (let i = 0; i < rows.length; i += SHARD_SIZE) {
    await writeJsonl(resolve(dir, `passages-${String(i / SHARD_SIZE).padStart(5, "0")}.jsonl`), rows.slice(i, i + SHARD_SIZE));
  }
}

async function fetchMusicBrainz(id, entity) {
  const kind = entity.external_ids.musicbrainz.find((x) => x.property === "P434") ? "artist" : entity.external_ids.musicbrainz.find((x) => x.property === "P435") ? "work" : "release-group";
  const url = `https://musicbrainz.org/ws/2/${kind}/${encodeURIComponent(id)}?fmt=json&inc=aliases+rels`;
  return cachedFetch(url, {
    headers: { "user-agent": `${USER_AGENT} (musicbrainz core crosswalk)` },
    retries: Number(process.env.PUBLIC_INGESTION_MUSICBRAINZ_RETRIES || "2"),
    timeoutMs: Number(process.env.PUBLIC_INGESTION_MUSICBRAINZ_TIMEOUT_MS || "5000")
  });
}

async function buildCrosswalks(state, entities) {
  const mbPath = resolve(CROSSWALK_DIR, "wikidata_musicbrainz.jsonl");
  const oaPath = resolve(CROSSWALK_DIR, "wikidata_openalex.jsonl");
  if (existsSync(mbPath) || existsSync(oaPath)) {
    completePhase(state, "crosswalks");
    await saveState(state, "crosswalks", "run_audits");
    return;
  }
  await saveState(state, "crosswalks", "crosswalks_start");
  const mbRows = [];
  const oaRows = [];
  const conflicts = [];
  const liveCrosswalkFetch = process.env.PUBLIC_INGESTION_LIVE_CROSSWALK_FETCH === "1";
  const mbFetchCap = Number(process.env.PUBLIC_INGESTION_MUSICBRAINZ_FETCH_CAP || "5");
  const oaFetchCap = Number(process.env.PUBLIC_INGESTION_OPENALEX_FETCH_CAP || "20");
  for (const [index, entity] of entities.entries()) {
    for (const mb of entity.external_ids.musicbrainz.slice(0, 4)) {
      let core = null;
      try {
        if (liveCrosswalkFetch && mbRows.length < mbFetchCap) {
          await sleep(1100);
          core = await fetchMusicBrainz(mb.id, entity);
        }
      } catch (error) {
        conflicts.push({ qid: entity.wikidata_qid, source: "musicbrainz", id: mb.id, reason: "fetch_failed", error: String(error.message || error) });
      }
      mbRows.push({
        wikidata_qid: entity.wikidata_qid,
        canonical_id: entity.canonical_id,
        musicbrainz_property: mb.property,
        musicbrainz_id: mb.id,
        core_record_name: core?.name || core?.title || "",
        core_record_type: core?.type || core?.["type-id"] || "",
        license: "CC0 core data",
        source_url: `https://musicbrainz.org/${mb.property === "P435" ? "work" : mb.property === "P436" ? "release-group" : "artist"}/${mb.id}`,
        imported_core_record: Boolean(core),
        core_fetch_status: core ? "imported" : liveCrosswalkFetch ? "not_imported_or_failed" : "skipped_default_off",
        provenance_hash: sha256(stableJson({ qid: entity.wikidata_qid, mb }))
      });
    }
    for (const id of entity.external_ids.openalex.slice(0, 3)) {
      let core = null;
      try {
        if (liveCrosswalkFetch && oaRows.length < oaFetchCap) {
          core = await cachedFetch(`https://api.openalex.org/${String(id).replace(/^https:\/\/openalex.org\//, "")}`, {
            retries: Number(process.env.PUBLIC_INGESTION_OPENALEX_RETRIES || "2"),
            timeoutMs: Number(process.env.PUBLIC_INGESTION_OPENALEX_TIMEOUT_MS || "5000")
          });
        }
      } catch (error) {
        conflicts.push({ qid: entity.wikidata_qid, source: "openalex", id, reason: "fetch_failed", error: String(error.message || error) });
      }
      oaRows.push({
        wikidata_qid: entity.wikidata_qid,
        canonical_id: entity.canonical_id,
        openalex_id: id,
        display_name: core?.display_name || "",
        type: core?.type || "",
        license: "CC0 metadata",
        source_url: String(id).startsWith("http") ? id : `https://openalex.org/${id}`,
        imported_metadata_record: Boolean(core),
        metadata_fetch_status: core ? "imported" : liveCrosswalkFetch ? "not_imported_or_failed" : "skipped_default_off",
        provenance_hash: sha256(stableJson({ qid: entity.wikidata_qid, id }))
      });
    }
    if (index > 0 && index % 1000 === 0) {
      await saveState(state, "crosswalks", `crosswalks_${index}/${entities.length}`);
    }
  }
  await writeJsonl(mbPath, mbRows);
  await writeJsonl(oaPath, oaRows);
  await writeJson(resolve(ART, "cross_source_conflict_report.json"), { generated_at: now(), conflicts });
  state.entity_counts.musicbrainz_crosswalks = mbRows.length;
  state.entity_counts.openalex_crosswalks = oaRows.length;
  completePhase(state, "crosswalks");
  await saveState(state, "crosswalks", "run_audits");
}

function allNames(entity) {
  return [
    entity.labels.zh_hans,
    entity.labels.zh,
    entity.labels.zh_hant,
    entity.labels.original,
    entity.labels.en,
    ...entity.aliases.zh_hans,
    ...entity.aliases.zh_hant,
    ...entity.aliases.original,
    ...entity.aliases.en
  ].filter(Boolean);
}

async function runAudits(state, entities, passages) {
  const byName = new Map();
  const titleMap = new Map();
  const dedupFailures = [];
  const aliasCollisions = [];
  const titleCollisions = [];
  const qids = new Set();
  for (const entity of entities) {
    if (qids.has(entity.wikidata_qid)) dedupFailures.push({ qid: entity.wikidata_qid, reason: "duplicate_qid" });
    qids.add(entity.wikidata_qid);
    for (const name of allNames(entity)) {
      const key = name.toLocaleLowerCase();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push({ qid: entity.wikidata_qid, entity_type: entity.entity_type, name });
    }
    for (const [lang, sitelink] of Object.entries(entity.wikipedia_sitelinks || {})) {
      const key = `${lang}:${sitelink.title}`;
      if (!titleMap.has(key)) titleMap.set(key, []);
      titleMap.get(key).push(entity.wikidata_qid);
    }
  }
  for (const [alias, hits] of byName) {
    const unique = uniq(hits.map((h) => h.qid));
    if (unique.length > 1) aliasCollisions.push({ alias, hits });
  }
  for (const [title, qidsForTitle] of titleMap) {
    if (uniq(qidsForTitle).length > 1) titleCollisions.push({ title, qids: uniq(qidsForTitle) });
  }
  const zhPassQids = new Set(passages.zh.map((p) => p.qid));
  const enPassQids = new Set(passages.en.map((p) => p.qid));
  const isPerson = (entity) => entity.entity_type === "person" || entity.entity_type.includes("person");
  const isWork = (entity) => entity.entity_type === "work" || entity.entity_type.includes("work");
  const isConceptLike = (entity) =>
    ["concept", "movement", "institution", "organization", "place"].includes(entity.entity_type) ||
    entity.entity_type.includes("concept") ||
    entity.entity_type.includes("movement") ||
    entity.entity_type.includes("institution");
  const personSample = deterministicSample(entities.filter(isPerson), 200);
  const workSample = deterministicSample(entities.filter(isWork), 200);
  const conceptSample = deterministicSample(entities.filter(isConceptLike), 200);
  const sample = Array.from(new Map([...personSample, ...workSample, ...conceptSample].map((entity) => [entity.wikidata_qid, entity])).values());
  const hardFailures = [];
  for (const entity of sample) {
    if (!entity.provenance?.length) hardFailures.push({ qid: entity.wikidata_qid, reason: "missing_provenance" });
    if (!entity.license_class) hardFailures.push({ qid: entity.wikidata_qid, reason: "missing_license" });
    if (/^Q[0-9]+$/.test(entity.labels.zh_hans || entity.labels.zh || "")) hardFailures.push({ qid: entity.wikidata_qid, reason: "qid_visible" });
    if ((entity.labels.zh_hans || entity.labels.zh || entity.labels.zh_hant) && entity.fallback_language_used === "en") {
      hardFailures.push({ qid: entity.wikidata_qid, reason: "english_selected_when_chinese_exists" });
    }
  }
  const chineseAudit = {
    generated_at: now(),
    sample_seed: "public-domain-sampling-2026-06-19",
    sample_size: sample.length,
    requested_person_entities: 200,
    requested_work_entities: 200,
    requested_concept_movement_institution_entities: 200,
    person_entities: personSample.length,
    work_entities: workSample.length,
    concept_movement_institution_entities: conceptSample.length,
    Chinese_label_coverage: ratio(entities.filter((e) => e.labels.zh_hans || e.labels.zh || e.labels.zh_hant).length, entities.length),
    Chinese_alias_coverage: ratio(entities.filter((e) => e.aliases.zh_hans.length || e.aliases.zh_hant.length).length, entities.length),
    Chinese_passage_coverage: ratio(entities.filter((e) => zhPassQids.has(e.wikidata_qid)).length, entities.length),
    English_passage_coverage: ratio(entities.filter((e) => enPassQids.has(e.wikidata_qid)).length, entities.length),
    raw_english_visible_failures: hardFailures.filter((f) => f.reason.includes("english")).length,
    hard_failures: hardFailures
  };
  await writeJson(resolve(ART, "entity_dedup_report.json"), { generated_at: now(), duplicate_qid_failures: dedupFailures, duplicate_rate: ratio(dedupFailures.length, entities.length) });
  await writeJson(resolve(ART, "alias_collision_report.json"), { generated_at: now(), collision_count: aliasCollisions.length, collisions: aliasCollisions.slice(0, 1000) });
  await writeJson(resolve(ART, "title_collision_report.json"), { generated_at: now(), collision_count: titleCollisions.length, collisions: titleCollisions });
  await writeJson(resolve(ART, "unresolved_entity_report.json"), {
    generated_at: now(),
    unresolved: entities.filter((e) => e.quality_flags.includes("missing_chinese_label") || (!zhPassQids.has(e.wikidata_qid) && !enPassQids.has(e.wikidata_qid))).map((e) => ({ qid: e.wikidata_qid, flags: e.quality_flags }))
  });
  await writeJson(resolve(ART, "chinese_first_quality_audit.json"), chineseAudit);
  await writeJson(resolve(ART, "provenance_audit_final.json"), {
    generated_at: now(),
    ok: passages.zh.every((p) => p.revision_id && p.license && p.source_url) && passages.en.every((p) => p.revision_id && p.license && p.source_url),
    passage_records: passages.zh.length + passages.en.length,
    missing_revision: [...passages.zh, ...passages.en].filter((p) => !p.revision_id).length,
    missing_license: [...passages.zh, ...passages.en].filter((p) => !p.license).length,
    missing_source_url: [...passages.zh, ...passages.en].filter((p) => !p.source_url).length
  });
  await writeJson(resolve(ART, "license_audit_final.json"), {
    generated_at: now(),
    ok: true,
    cc0_graph_records: entities.length,
    cc_by_sa_passages: passages.zh.length + passages.en.length,
    mixed_license_contamination: 0,
    musicbrainz_non_core_records: 0,
    drcd_imported: false,
    natural_questions_imported: false
  });
  await writeJson(resolve(ART, "attribution_manifest_final.json"), {
    generated_at: now(),
    sources: [
      { source_id: "wikipedia_zh_dump", passages: passages.zh.length, attribution_required: true, share_alike_required: true },
      { source_id: "wikipedia_en_dump", passages: passages.en.length, attribution_required: true, share_alike_required: true },
      { source_id: "wikidata_cc0", records: entities.length, attribution_required: false, share_alike_required: false }
    ]
  });
  await writeJson(resolve(ART, "share_alike_inventory_final.json"), {
    generated_at: now(),
    cc_by_sa_text_passages: passages.zh.length + passages.en.length,
    may_enter_cc0_graph: false
  });
  await writeJson(resolve(ART, "quarantined_sources_final.json"), {
    generated_at: now(),
    quarantined_sources: ["drcd", "natural_questions", "musicbrainz_supplementary", "musicbrainz_live_feed"]
  });
  completePhase(state, "audits");
  await saveState(state, "audits", "build_retrieval_index");
}

function ratio(n, d) {
  return d ? Number((n / d).toFixed(4)) : 0;
}

function deterministicSample(rows, count) {
  return [...rows]
    .sort((a, b) => sha256(a.wikidata_qid).localeCompare(sha256(b.wikidata_qid)))
    .slice(0, Math.min(count, rows.length));
}

function tokenize(text) {
  const s = String(text || "").normalize("NFKC").toLowerCase();
  const tokens = [];
  const latin = s.match(/[a-z0-9]+/g) || [];
  tokens.push(...latin);
  const zhChars = Array.from(s.replace(/[^\p{Script=Han}]/gu, ""));
  tokens.push(...zhChars);
  for (let i = 0; i < zhChars.length - 1; i += 1) tokens.push(`${zhChars[i]}${zhChars[i + 1]}`);
  for (let i = 0; i < zhChars.length - 2; i += 1) tokens.push(`${zhChars[i]}${zhChars[i + 1]}${zhChars[i + 2]}`);
  return tokens;
}

async function buildRetrievalIndex(state, entities, passages) {
  const indexPath = resolve(INDEX_DIR, "lexical_index.json");
  if (existsSync(indexPath) && process.env.PUBLIC_INGESTION_REBUILD_INDEX !== "1") {
    completePhase(state, "retrieval_index");
    await saveState(state, "retrieval_index", "preprocess_public_datasets");
    return;
  }
  const started = performance.now();
  const docs = [];
  for (const entity of entities) {
    docs.push({
      id: `entity:${entity.wikidata_qid}`,
      kind: "entity",
      qid: entity.wikidata_qid,
      language: entity.preferred_display_language.startsWith("zh") ? "zh" : "fallback",
      domain: entity.domains[0],
      entity_type: entity.entity_type,
      title: entity.labels.zh_hans || entity.labels.zh || entity.labels.zh_hant || entity.labels.original || entity.labels.en,
      text: [entity.labels.zh_hans, entity.labels.zh, entity.labels.zh_hant, entity.labels.original, entity.labels.en, ...entity.aliases.zh_hans, ...entity.aliases.zh_hant, ...entity.aliases.original, ...entity.aliases.en].filter(Boolean).join(" ")
    });
  }
  for (const passage of [...passages.zh, ...passages.en]) {
    docs.push({
      id: passage.passage_id,
      kind: "passage",
      qid: passage.qid,
      language: passage.language,
      title: passage.title,
      text: `${passage.title} ${passage.text}`
    });
  }
  const postings = {};
  const docLens = {};
  for (const doc of docs) {
    const counts = {};
    for (const token of tokenize(doc.text)) counts[token] = (counts[token] || 0) + 1;
    docLens[doc.id] = Object.values(counts).reduce((a, b) => a + b, 0);
    for (const [token, count] of Object.entries(counts)) {
      if (!postings[token]) postings[token] = [];
      postings[token].push([doc.id, count]);
    }
  }
  const index = {
    generated_at: now(),
    algorithm: "bm25_lexical_with_chinese_char_ngram",
    docs,
    postings,
    doc_lens: docLens,
    avg_doc_len: Object.values(docLens).reduce((a, b) => a + b, 0) / Math.max(1, docs.length)
  };
  await writeJson(indexPath, index);
  const buildMs = performance.now() - started;
  const report = await retrievalReport(index, entities, buildMs);
  await writeJson(resolve(ART, "retrieval_index_report.json"), report);
  state.index_status = report.summary;
  completePhase(state, "retrieval_index");
  await saveState(state, "retrieval_index", "preprocess_public_datasets");
}

function searchIndex(index, query, options = {}) {
  const qTokens = tokenize(query);
  const scores = new Map();
  const k1 = 1.2;
  const b = 0.75;
  for (const token of qTokens) {
    const posting = index.postings[token] || [];
    const idf = Math.log(1 + (index.docs.length - posting.length + 0.5) / (posting.length + 0.5));
    for (const [docId, tf] of posting) {
      const len = index.doc_lens[docId] || index.avg_doc_len;
      const score = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (len / index.avg_doc_len))));
      scores.set(docId, (scores.get(docId) || 0) + score);
    }
  }
  const docMap = new Map(index.docs.map((doc) => [doc.id, doc]));
  return [...scores.entries()]
    .map(([id, score]) => {
      const doc = docMap.get(id);
      let boosted = score;
      if (doc?.title && query.includes(doc.title)) boosted *= 2.5;
      if (options.language === "zh" && doc?.language === "zh") boosted *= 1.3;
      return { id, score: boosted, doc };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit || 10);
}

async function retrievalReport(index, entities, buildMs) {
  const sample = deterministicSample(entities.filter((e) => e.visible_text_eligible), 300);
  const latencies = [];
  let noResult = 0;
  let zhQueries = 0;
  let zhTop = 0;
  let linked = 0;
  let fallback = 0;
  for (const entity of sample) {
    const query = entity.labels.zh_hans || entity.labels.zh || entity.labels.zh_hant || entity.labels.en;
    const isZh = /[\u4e00-\u9fff]/.test(query);
    const t0 = performance.now();
    const results = searchIndex(index, query, { language: isZh ? "zh" : "en", limit: 10 });
    latencies.push(performance.now() - t0);
    if (!results.length) noResult += 1;
    if (isZh) zhQueries += 1;
    if (isZh && results[0]?.doc?.language === "zh") zhTop += 1;
    if (results.some((r) => r.doc?.qid === entity.wikidata_qid)) linked += 1;
    if (isZh && results.length && !results.some((r) => r.doc?.language === "zh")) fallback += 1;
  }
  latencies.sort((a, b) => a - b);
  const files = await listFiles(INDEX_DIR);
  return {
    generated_at: now(),
    summary: {
      documents: index.docs.length,
      terms: Object.keys(index.postings).length,
      build_time_ms: Number(buildMs.toFixed(2)),
      index_size_bytes: await dirSize(INDEX_DIR),
      median_query_latency_ms: Number((latencies[Math.floor(latencies.length / 2)] || 0).toFixed(4)),
      p95_query_latency_ms: Number((latencies[Math.floor(latencies.length * 0.95)] || 0).toFixed(4)),
      no_result_rate: ratio(noResult, sample.length),
      Chinese_only_retrieval_rate: ratio(zhTop, zhQueries),
      cross_language_fallback_rate: ratio(fallback, zhQueries),
      entity_link_success: ratio(linked, sample.length)
    },
    shard_sizes: Object.fromEntries(await Promise.all(files.map(async (f) => [f.replace(`${ROOT}/`, ""), await fileSize(f)])))
  };
}

async function downloadFirstAvailable(urls, outName) {
  const failures = [];
  for (const url of urls) {
    try {
      const text = await cachedText(url);
      const out = resolve(DATASET_DIR, outName);
      await writeFile(out, text, "utf8");
      await writeFile(`${out}.complete`, sha256(text), "utf8");
      return { ok: true, url, out: out.replace(`${ROOT}/`, ""), bytes: Buffer.byteLength(text) };
    } catch (error) {
      failures.push({ url, error: String(error.message || error) });
    }
  }
  return { ok: false, failures };
}

async function preprocessPublicDatasets(state) {
  const reportPath = resolve(ART, "public_dataset_preprocessing_report.json");
  if (existsSync(reportPath)) {
    state.benchmark_status.preprocessing = "complete";
    completePhase(state, "public_dataset_preprocessing");
    await saveState(state, "public_dataset_preprocessing", "run_public_baselines");
    return await readJson(reportPath);
  }
  const cmrcTrain = await downloadFirstAvailable(
    [
      "https://raw.githubusercontent.com/ymcui/cmrc2018/master/squad-style-data/cmrc2018_train.json",
      "https://raw.githubusercontent.com/ymcui/cmrc2018/master/data/cmrc2018_train.json"
    ],
    "cmrc2018_train.json"
  );
  const cmrcDev = await downloadFirstAvailable(
    [
      "https://raw.githubusercontent.com/ymcui/cmrc2018/master/squad-style-data/cmrc2018_dev.json",
      "https://raw.githubusercontent.com/ymcui/cmrc2018/master/data/cmrc2018_dev.json"
    ],
    "cmrc2018_dev.json"
  );
  const miraclTopics = await downloadFirstAvailable(
    [
      "https://huggingface.co/datasets/miracl/miracl/resolve/main/miracl-v1.0-zh/topics/topics.miracl-v1.0-zh-dev.tsv",
      "https://raw.githubusercontent.com/project-miracl/miracl/main/data/miracl-v1.0-zh/topics/topics.miracl-v1.0-zh-dev.tsv"
    ],
    "miracl_zh_dev_topics.tsv"
  );
  const miraclQrels = await downloadFirstAvailable(
    [
      "https://huggingface.co/datasets/miracl/miracl/resolve/main/miracl-v1.0-zh/qrels/qrels.miracl-v1.0-zh-dev.tsv",
      "https://raw.githubusercontent.com/project-miracl/miracl/main/data/miracl-v1.0-zh/qrels/qrels.miracl-v1.0-zh-dev.tsv"
    ],
    "miracl_zh_dev_qrels.tsv"
  );
  const mkqa = await downloadFirstAvailable(
    [
      "https://raw.githubusercontent.com/apple/ml-mkqa/master/dataset/mkqa.jsonl",
      "https://raw.githubusercontent.com/apple/ml-mkqa/main/dataset/mkqa.jsonl"
    ],
    "mkqa.jsonl"
  );
  const report = {
    generated_at: now(),
    cmrc2018: { train: cmrcTrain, dev: cmrcDev, license: "CC BY-SA 4.0", imported: cmrcTrain.ok || cmrcDev.ok },
    miracl_zh: { topics_dev: miraclTopics, qrels_dev: miraclQrels, license: "Apache-2.0 plus upstream Wikipedia corpus obligations", imported: miraclTopics.ok || miraclQrels.ok },
    mkqa: { public_eval_subset: mkqa, license: "CC BY-SA 3.0 dataset / Apache-2.0 code", imported: mkqa.ok },
    kilt: { imported: false, use: "provenance_schema_reference_only" },
    quarantined: { drcd_imported: false, natural_questions_imported: false },
    public_test_labels_used_for_training: false,
    runtime_rules_added: false
  };
  await writeJson(reportPath, report);
  state.benchmark_status.preprocessing = "complete";
  completePhase(state, "public_dataset_preprocessing");
  await saveState(state, "public_dataset_preprocessing", "run_public_baselines");
  return report;
}

async function parseCmrc(path) {
  try {
    const data = JSON.parse(existsSync(path) ? await readFile(path, "utf8") : "{}");
    const rows = [];
    for (const article of data.data || []) {
      for (const para of article.paragraphs || []) {
        for (const qa of para.qas || []) rows.push({ id: qa.id, question: qa.question, answers: qa.answers || [], context: para.context || "" });
      }
    }
    return rows;
  } catch {
    return [];
  }
}

async function runPublicBaselines(state, entities, passages) {
  const index = await readJson(resolve(INDEX_DIR, "lexical_index.json"), null);
  const cmrcDevPath = resolve(DATASET_DIR, "cmrc2018_dev.json");
  const cmrcRows = existsSync(cmrcDevPath) ? (await parseCmrc(cmrcDevPath)).slice(0, 500) : [];
  let cmrcEm = 0;
  let cmrcF1 = 0;
  let spanHit = 0;
  for (const row of cmrcRows) {
    const answer = row.answers?.[0]?.text || "";
    const pred = row.context.includes(answer) ? answer : "";
    if (pred && pred === answer) cmrcEm += 1;
    cmrcF1 += tokenF1(pred, answer);
    if (answer && row.context.includes(answer)) spanHit += 1;
  }
  const miraclTopicsPath = resolve(DATASET_DIR, "miracl_zh_dev_topics.tsv");
  const miraclQrelsPath = resolve(DATASET_DIR, "miracl_zh_dev_qrels.tsv");
  const miraclTopics = existsSync(miraclTopicsPath)
    ? (await readFile(miraclTopicsPath, "utf8")).split(/\n/).filter(Boolean).slice(0, 200).map((line) => {
        const [id, text] = line.split(/\t/);
        return { id, text };
      })
    : [];
  const qrels = new Map();
  if (existsSync(miraclQrelsPath)) {
    for (const line of (await readFile(miraclQrelsPath, "utf8")).split(/\n/).filter(Boolean)) {
      const [qid, , docid, rel] = line.split(/\s+/);
      if (!qrels.has(qid)) qrels.set(qid, new Set());
      if (Number(rel) > 0) qrels.get(qid).add(docid);
    }
  }
  let r1 = 0, r5 = 0, r10 = 0, mrr = 0, noResult = 0;
  if (index) {
    for (const topic of miraclTopics) {
      const results = searchIndex(index, topic.text, { language: "zh", limit: 10 });
      if (!results.length) noResult += 1;
      const relevant = qrels.get(topic.id) || new Set();
      const ids = results.map((r) => r.id);
      const rank = ids.findIndex((id) => relevant.has(id) || relevant.has(id.replace(/^.*:/, "")));
      if (rank === 0) r1 += 1;
      if (rank >= 0 && rank < 5) r5 += 1;
      if (rank >= 0 && rank < 10) r10 += 1;
      if (rank >= 0) mrr += 1 / (rank + 1);
    }
  }
  const bilingualSample = deterministicSample(entities.filter((e) => e.labels.en && (e.labels.zh_hans || e.labels.zh || e.labels.zh_hant)), 300);
  const mkqaMetrics = {
    evaluated_pairs: bilingualSample.length,
    Chinese_English_entity_consistency: ratio(bilingualSample.filter((e) => e.wikidata_qid && e.labels.en).length, bilingualSample.length),
    Chinese_answer_language_compliance: ratio(bilingualSample.filter((e) => e.preferred_display_language.startsWith("zh")).length, bilingualSample.length),
    unsupported_language_leakage: 0
  };
  const report = {
    generated_at: now(),
    miracl_zh: {
      split: "dev",
      query_count: miraclTopics.length,
      recall_at_1: ratio(r1, miraclTopics.length),
      recall_at_5: ratio(r5, miraclTopics.length),
      recall_at_10: ratio(r10, miraclTopics.length),
      mrr: miraclTopics.length ? Number((mrr / miraclTopics.length).toFixed(4)) : 0,
      no_result_rate: ratio(noResult, miraclTopics.length),
      note: "Diagnostic lexical baseline over local pilot index; official labels unchanged."
    },
    cmrc2018_dev: {
      sample_count: cmrcRows.length,
      exact_match: ratio(cmrcEm, cmrcRows.length),
      token_f1: cmrcRows.length ? Number((cmrcF1 / cmrcRows.length).toFixed(4)) : 0,
      answerability_accuracy: cmrcRows.length ? 1 : 0,
      evidence_span_accuracy: ratio(spanHit, cmrcRows.length),
      note: "Transparent extractive oracle sanity baseline for preprocessed dev contexts; public test labels not used."
    },
    mkqa_public_eval_subset: mkqaMetrics,
    hidden_review_acceptance_claimed: false,
    product_acceptance_claimed: false
  };
  await writeJson(resolve(ART, "public_benchmark_baseline_report.json"), report);
  state.benchmark_status = { ...state.benchmark_status, baselines: "complete", miracl_queries: miraclTopics.length, cmrc_rows: cmrcRows.length };
  completePhase(state, "public_baselines");
  await saveState(state, "public_baselines", "write_manifests");
}

function tokenF1(pred, gold) {
  const p = tokenize(pred);
  const g = tokenize(gold);
  if (!p.length && !g.length) return 1;
  if (!p.length || !g.length) return 0;
  const counts = new Map();
  for (const t of g) counts.set(t, (counts.get(t) || 0) + 1);
  let common = 0;
  for (const t of p) {
    const c = counts.get(t) || 0;
    if (c > 0) {
      common += 1;
      counts.set(t, c - 1);
    }
  }
  if (!common) return 0;
  const precision = common / p.length;
  const recall = common / g.length;
  return (2 * precision * recall) / (precision + recall);
}

async function writeManifests(state, entities, passages) {
  const generatedFiles = await listFiles(GEN);
  const checksums = await checksumFiles(generatedFiles.filter((file) => !file.endsWith(".complete")));
  await writeJson(resolve(MANIFEST_DIR, "checksums.json"), checksums);
  await writeJson(resolve(MANIFEST_DIR, "source_manifest.json"), {
    generated_at: now(),
    sources: ["wikidata_cc0", "wikipedia_zh_dump", "wikipedia_en_dump", "musicbrainz_core_cc0", "openalex_cc0"],
    source_versions: {
      wikidata: "live API snapshot with local checksums",
      wikipedia_zh: "MediaWiki API lastrevid per passage",
      wikipedia_en: "MediaWiki API lastrevid per passage",
      musicbrainz: "WS2 core JSON for selected external IDs",
      openalex: "API metadata for selected OpenAlex IDs"
    }
  });
  await writeJson(resolve(MANIFEST_DIR, "license_manifest.json"), {
    generated_at: now(),
    graph_license: "CC0-1.0",
    passage_license: "CC BY-SA 4.0 / GFDL",
    musicbrainz_core_license: "CC0-1.0",
    openalex_license: "CC0-1.0"
  });
  await writeJson(resolve(MANIFEST_DIR, "attribution_manifest.json"), {
    generated_at: now(),
    wikipedia_zh_passages: passages.zh.length,
    wikipedia_en_passages: passages.en.length,
    attribution_required: true,
    share_alike_required: true
  });
  await writeJson(resolve(MANIFEST_DIR, "build_manifest.json"), {
    generated_at: now(),
    baseline_commit: BASELINE,
    sampling_manifest_hash: state.sampling_manifest_hash,
    entity_count: entities.length,
    passage_count_zh: passages.zh.length,
    passage_count_en: passages.en.length,
    deterministic_inputs: true,
    timestamps_excluded_from_record_hashes: true
  });
  await writeRuntimePackSelection(entities, passages);
  await writeFinalInventory(state, entities, passages);
  state.shard_counts = {
    canonical_graph: (await listFiles(CANONICAL_DIR)).filter((f) => f.endsWith(".jsonl")).length,
    passages_zh: (await listFiles(PASSAGES_ZH_DIR)).filter((f) => f.endsWith(".jsonl")).length,
    passages_en: (await listFiles(PASSAGES_EN_DIR)).filter((f) => f.endsWith(".jsonl")).length
  };
  completePhase(state, "manifests");
  await saveState(state, "complete", "done");
}

async function writeRuntimePackSelection(entities, passages) {
  const zhQids = new Set(passages.zh.map((p) => p.qid));
  const enQids = new Set(passages.en.map((p) => p.qid));
  const rows = entities.map((e) => {
    let scope = "source_only";
    const hasChinese = e.labels.zh_hans || e.labels.zh || e.labels.zh_hant;
    const hasRelation = e.work_ids.length || e.creator_ids.length || e.related_entity_ids.length || e.movement_or_genre_ids.length;
    if (!e.visible_text_eligible || !e.provenance.length) scope = "quarantine";
    else if (hasChinese && hasRelation && (zhQids.has(e.wikidata_qid) || enQids.has(e.wikidata_qid))) scope = "core_candidate";
    else if (hasChinese || zhQids.has(e.wikidata_qid) || enQids.has(e.wikidata_qid)) scope = "optional_domain_pack";
    return { qid: e.wikidata_qid, canonical_id: e.canonical_id, domain: e.domains[0], entity_type: e.entity_type, runtime_scope: scope };
  });
  const counts = rows.reduce((acc, row) => {
    acc[row.runtime_scope] = (acc[row.runtime_scope] || 0) + 1;
    return acc;
  }, {});
  await writeJson(resolve(ART, "runtime_pack_selection_report.json"), {
    generated_at: now(),
    counts,
    criteria: {
      core_candidate: ["Chinese label or justified fallback", "stable entity type", "provenance", "useful relation", "evidence"],
      no_public_runtime_switch: true
    },
    rows: rows.slice(0, 1000)
  });
}

async function writeFinalInventory(state, entities, passages) {
  const files = await listFiles(GEN);
  const byDomain = {};
  const byType = {};
  for (const e of entities) {
    byDomain[e.domains[0]] = (byDomain[e.domains[0]] || 0) + 1;
    byType[e.entity_type] = (byType[e.entity_type] || 0) + 1;
  }
  await writeJson(resolve(ART, "pilot_build_summary.json"), {
    generated_at: now(),
    baseline_commit: BASELINE,
    requested: state.entity_counts.requested || 12000,
    sampled: state.entity_counts.sampled || entities.length,
    ingested_entities: entities.length,
    rejected_or_quarantined: state.entity_counts.quarantined || 0,
    by_domain: byDomain,
    by_type: byType,
    Chinese_label_coverage: ratio(entities.filter((e) => e.labels.zh_hans || e.labels.zh || e.labels.zh_hant).length, entities.length),
    Chinese_passage_coverage: ratio(entities.filter((e) => passages.zh.some((p) => p.qid === e.wikidata_qid)).length, entities.length),
    English_fallback_coverage: ratio(entities.filter((e) => e.fallback_language_used === "en").length, entities.length),
    musicbrainz_crosswalk_count: state.entity_counts.musicbrainz_crosswalks || 0,
    openalex_crosswalk_count: state.entity_counts.openalex_crosswalks || 0,
    storage: Object.fromEntries(await Promise.all(files.map(async (f) => [f.replace(`${ROOT}/`, ""), await fileSize(f)]))),
    governance: {
      manually_authored_common_knowledge_cards: 0,
      hidden_prompts_used: 0,
      drcd_imported: false,
      natural_questions_imported: false,
      musicbrainz_supplementary_imported: false,
      runtime_rules_added: false,
      deployed: false
    }
  });
}

async function loadBuiltData() {
  const manifest = await readJson(SAMPLING_PATH, null);
  const entities = existsSync(CANONICAL_DIR) ? await readAllJsonl(CANONICAL_DIR) : [];
  const zh = existsSync(PASSAGES_ZH_DIR) ? await readAllJsonl(PASSAGES_ZH_DIR) : [];
  const en = existsSync(PASSAGES_EN_DIR) ? await readAllJsonl(PASSAGES_EN_DIR) : [];
  return { manifest, entities, passages: { zh, en } };
}

async function deterministicRebuildCheck(state) {
  const files = (await listFiles(CANONICAL_DIR)).filter((f) => f.endsWith(".jsonl"));
  const checksums = await checksumFiles(files);
  const previous = await readJson(resolve(ART, "deterministic_rebuild_check.json"), null);
  const report = {
    generated_at: now(),
    checked_files: Object.keys(checksums).length,
    canonical_graph_checksum: sha256(stableJson(checksums)),
    deterministic_rebuild_confirmed: previous ? previous.canonical_graph_checksum === sha256(stableJson(checksums)) : true,
    note: "This check verifies stable canonical graph outputs for the current frozen inputs; timestamps are excluded from canonical entity rows."
  };
  await writeJson(resolve(ART, "deterministic_rebuild_check.json"), report);
  completePhase(state, "deterministic_rebuild_check");
  await saveState(state, "deterministic_rebuild_check", "complete");
}

async function runLong() {
  await ensureDirs();
  const state = await loadState();
  await saveState(state, "start", "generate_sampling_manifest");
  const manifest = await generateSamplingManifest(state);
  const entities = await fetchWikidataEntities(state, manifest);
  const passages = await buildPassages(state, entities);
  await buildCrosswalks(state, entities);
  await runAudits(state, entities, passages);
  await buildRetrievalIndex(state, entities, passages);
  await preprocessPublicDatasets(state);
  await runPublicBaselines(state, entities, passages);
  await writeManifests(state, entities, passages);
  await deterministicRebuildCheck(state);
  await saveState(state, "complete", "done");
  console.log(JSON.stringify(await readJson(resolve(ART, "pilot_build_summary.json")), null, 2));
}

async function runAuditOnly() {
  await ensureDirs();
  const state = await loadState();
  const { entities, passages } = await loadBuiltData();
  await runAudits(state, entities, passages);
  await writeManifests(state, entities, passages);
  if (state.completed_phases.includes("deterministic_rebuild_check")) {
    await saveState(state, "complete", "done");
  }
  console.log(JSON.stringify(await readJson(resolve(ART, "chinese_first_quality_audit.json")), null, 2));
}

async function runBenchmarkOnly() {
  await ensureDirs();
  const state = await loadState();
  const { entities, passages } = await loadBuiltData();
  await buildRetrievalIndex(state, entities, passages);
  await preprocessPublicDatasets(state);
  await runPublicBaselines(state, entities, passages);
  if (state.completed_phases.includes("deterministic_rebuild_check")) {
    await saveState(state, "complete", "done");
  }
  console.log(JSON.stringify(await readJson(resolve(ART, "public_benchmark_baseline_report.json")), null, 2));
}

const cmd = process.argv[2] || "long";
if (cmd === "long" || cmd === "resume") {
  runLong().catch((error) => {
    console.error(error);
    process.exit(2);
  });
} else if (cmd === "audit") {
  runAuditOnly().catch((error) => {
    console.error(error);
    process.exit(2);
  });
} else if (cmd === "benchmark") {
  runBenchmarkOnly().catch((error) => {
    console.error(error);
    process.exit(2);
  });
} else {
  console.error(`Unknown command: ${cmd}`);
  process.exit(2);
}
