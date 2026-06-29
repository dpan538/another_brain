#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(".");
const GEN = resolve(ROOT, "data/public_ingestion/generated");
const ART = resolve(ROOT, "artifacts/data_ingestion");
const WEB_OUT = resolve(ROOT, "web/public_knowledge");
const PACK_JS = resolve(ROOT, "web/public_knowledge_pack.generated.js");
const SHARD_COUNT = 32;
const CORE_LIMIT = Number(process.env.PUBLIC_RUNTIME_CORE_LIMIT || "800");

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function listJsonl(dir) {
  return (await readdir(dir)).filter((file) => file.endsWith(".jsonl")).sort().map((file) => resolve(dir, file));
}

async function readJsonlDir(dir) {
  const rows = [];
  for (const file of await listJsonl(dir)) {
    const text = await readFile(file, "utf8");
    rows.push(...text.split(/\n/).filter(Boolean).map((line) => JSON.parse(line)));
  }
  return rows;
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeName(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\-＿_—–~～`"'“”‘’.,，。!?！？:：;；、()[\]{}<>《》「」『』〉》]/g, "")
    .trim();
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function hashShard(qid) {
  const n = Number(String(qid || "").replace(/^Q/, "")) || 0;
  return n % SHARD_COUNT;
}

function compactEntity(entity, passageMap) {
  const labels = entity.labels || {};
  const aliases = entity.aliases || {};
  const names = uniq([
    labels.zh_hans,
    labels.zh,
    labels.zh_hant,
    labels.original,
    labels.en,
    ...(aliases.zh_hans || []),
    ...(aliases.zh_hant || []),
    ...(aliases.original || []).slice(0, 12),
    ...(aliases.en || []).slice(0, 12)
  ]);
  const qid = entity.wikidata_qid;
  return {
    qid,
    canonical_id: entity.canonical_id,
    entity_type: entity.entity_type,
    domains: entity.domains || [],
    labels: {
      zh_hans: labels.zh_hans || "",
      zh: labels.zh || "",
      zh_hant: labels.zh_hant || "",
      original: labels.original || "",
      en: labels.en || ""
    },
    aliases: {
      zh_hans: aliases.zh_hans || [],
      zh_hant: aliases.zh_hant || [],
      original: (aliases.original || []).slice(0, 12),
      en: (aliases.en || []).slice(0, 12)
    },
    names,
    normalized_names: uniq(names.map(normalizeName)),
    descriptions: entity.descriptions || {},
    roles: (entity.occupations_or_roles || []).slice(0, 8),
    countries_or_regions: (entity.countries_or_regions || []).slice(0, 8),
    languages: (entity.languages || []).slice(0, 8),
    dates: entity.dates || {},
    work_ids: (entity.work_ids || []).slice(0, 12),
    relation_ids: (entity.related_entity_ids || []).slice(0, 12),
    movement_or_genre_ids: (entity.movement_or_genre_ids || []).slice(0, 12),
    passages: {
      zh: (passageMap.zh.get(qid) || []).slice(0, 2).map((p) => ({ title: p.title, text: p.text, source_url: p.source_url, revision_id: p.revision_id })),
      en: (passageMap.en.get(qid) || []).slice(0, 1).map((p) => ({ title: p.title, text: p.text, source_url: p.source_url, revision_id: p.revision_id }))
    },
    license_class: entity.license_class,
    visible_text_eligible: Boolean(entity.visible_text_eligible)
  };
}

function groupByQid(passages) {
  const map = new Map();
  for (const passage of passages) {
    if (!map.has(passage.qid)) map.set(passage.qid, []);
    map.get(passage.qid).push(passage);
  }
  return map;
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function main() {
  const entities = await readJsonlDir(resolve(GEN, "canonical_graph"));
  const zhPassages = await readJsonlDir(resolve(GEN, "passages_zh"));
  const enPassages = await readJsonlDir(resolve(GEN, "passages_en"));
  const passageMap = { zh: groupByQid(zhPassages), en: groupByQid(enPassages) };
  const byQid = new Map(entities.map((entity) => [entity.wikidata_qid, entity]));
  const acceptedQids = new Set([...passageMap.zh.keys(), ...passageMap.en.keys()]);
  const compactRows = entities.map((entity) => compactEntity(entity, passageMap));

  const entityIndex = compactRows.map((entity) => ({
    qid: entity.qid,
    canonical_id: entity.canonical_id,
    entity_type: entity.entity_type,
    label_zh: entity.labels.zh_hans || entity.labels.zh || entity.labels.zh_hant || "",
    label_en: entity.labels.en || "",
    names: entity.names.slice(0, 20),
    normalized_names: entity.normalized_names.slice(0, 20),
    domains: entity.domains,
    shard: `shards/public-knowledge-${String(hashShard(entity.qid)).padStart(2, "0")}.json`
  }));

  const shards = Array.from({ length: SHARD_COUNT }, () => []);
  for (const entity of compactRows) shards[hashShard(entity.qid)].push(entity);
  await mkdir(resolve(WEB_OUT, "shards"), { recursive: true });
  await writeJson(resolve(WEB_OUT, "entity_index.json"), entityIndex);
  const shardFiles = [];
  for (let i = 0; i < shards.length; i += 1) {
    const file = resolve(WEB_OUT, "shards", `public-knowledge-${String(i).padStart(2, "0")}.json`);
    await writeJson(file, { shard: i, entities: shards[i] });
    shardFiles.push(file);
  }

  const coreRows = compactRows
    .filter((entity) => acceptedQids.has(entity.qid) && (entity.labels.zh_hans || entity.labels.zh || entity.labels.zh_hant || entity.labels.en))
    .sort((a, b) => {
      const az = a.passages.zh.length ? 0 : 1;
      const bz = b.passages.zh.length ? 0 : 1;
      if (az !== bz) return az - bz;
      return a.qid.localeCompare(b.qid, "en", { numeric: true });
    })
    .slice(0, CORE_LIMIT);
  const corePack = {
    generated_at: new Date().toISOString(),
    source: "public_encyclopedia_ingestion_runtime_pack",
    entity_count: coreRows.length,
    shard_manifest: "public_knowledge/manifest.json",
    entities: coreRows
  };
  await writeFile(PACK_JS, `export const PUBLIC_KNOWLEDGE_PACK = Object.freeze(${JSON.stringify(corePack)});\n`, "utf8");

  const manifest = {
    generated_at: new Date().toISOString(),
    source: "public_encyclopedia_ingestion_runtime_pack",
    entity_index: "entity_index.json",
    shard_count: SHARD_COUNT,
    core_pack_js: "public_knowledge_pack.generated.js",
    entity_count: entities.length,
    indexed_entity_count: entityIndex.length,
    core_pack_entity_count: coreRows.length,
    zh_passage_count: zhPassages.length,
    en_passage_count: enPassages.length,
    license: {
      graph: "CC0-1.0",
      passages: "CC BY-SA 4.0 / GFDL"
    },
    files: {
      entity_index_bytes: await fileSize(resolve(WEB_OUT, "entity_index.json")),
      core_pack_js_bytes: await fileSize(PACK_JS)
    }
  };
  await writeJson(resolve(WEB_OUT, "manifest.json"), manifest);
  await writeJson(resolve(ART, "runtime_pack_selection_report.json"), {
    generated_at: new Date().toISOString(),
    active_entity_index_size_bytes: manifest.files.entity_index_bytes,
    core_pack_js_bytes: manifest.files.core_pack_js_bytes,
    shard_count: SHARD_COUNT,
    core_pack_entity_count: coreRows.length,
    selected_by: "accepted evidence, Chinese-first labels, deterministic QID order",
    no_public_runtime_switch: false
  });
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
