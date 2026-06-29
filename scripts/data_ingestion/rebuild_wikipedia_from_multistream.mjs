#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ART = resolve(ROOT, "artifacts/data_ingestion");
const GEN = resolve(ROOT, "data/public_ingestion/generated");
const SOURCE_DIR = resolve(GEN, "source/wikimedia_multistream");
const WORK_DIR = resolve(GEN, "passage_multistream_work");
const CANONICAL_DIR = resolve(GEN, "canonical_graph");
const PASSAGES_ZH_DIR = resolve(GEN, "passages_zh");
const PASSAGES_EN_DIR = resolve(GEN, "passages_en");
const SHARD_SIZE = Number(process.env.PUBLIC_INGESTION_SHARD_SIZE || "1000");
const STREAM_LIMIT = Number(process.env.PUBLIC_INGESTION_MULTISTREAM_LIMIT || "0");
const LANGUAGES = (process.env.PUBLIC_INGESTION_MULTISTREAM_LANGS || "zh,en").split(",").map((s) => s.trim()).filter(Boolean);
const USER_AGENT = "another_brain_public_ingestion_recovery/0.1 (local dump extraction; provenance-aware)";

function now() {
  return new Date().toISOString();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function ratio(a, b) {
  return b ? Number((a / b).toFixed(4)) : 0;
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function listFiles(dir) {
  try {
    return (await readdir(dir)).sort().map((file) => resolve(dir, file));
  } catch {
    return [];
  }
}

async function readJsonl(path) {
  if (!existsSync(path)) return [];
  const text = await readFile(path, "utf8");
  return text.split(/\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function readAllJsonl(dir) {
  const files = (await listFiles(dir)).filter((file) => file.endsWith(".jsonl"));
  const rows = [];
  for (const file of files) rows.push(...(await readJsonl(file)));
  return rows;
}

async function writeJsonl(path, rows) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

function dumpBase(language) {
  return `https://dumps.wikimedia.org/${language}wiki/latest/${language}wiki-latest-pages-articles-multistream`;
}

function indexUrl(language) {
  return `${dumpBase(language)}-index.txt.bz2`;
}

function dumpUrl(language) {
  return `${dumpBase(language)}.xml.bz2`;
}

function normalizeTitle(title) {
  return String(title || "").normalize("NFKC").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function decodeXml(text) {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTag(body, tag) {
  const match = body.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeXml(match[1]) : "";
}

async function downloadFile(url, path) {
  const marker = `${path}.complete`;
  if (existsSync(path) && existsSync(marker)) return;
  await mkdir(dirname(path), { recursive: true });
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);
    try {
      await unlink(path).catch(() => {});
      const res = await fetch(url, { signal: controller.signal, headers: { "user-agent": USER_AGENT } });
      if (!res.ok) throw new Error(`download failed ${res.status} ${res.statusText}: ${url}`);
      const out = createWriteStream(path);
      await new Promise((resolvePromise, reject) => {
        res.body.pipeTo(Writable.toWeb(out)).then(resolvePromise, reject);
      });
      await writeFile(marker, sha256(await readFile(path)), "utf8");
      return;
    } catch (error) {
      lastError = error;
      await unlink(path).catch(() => {});
      await new Promise((resolveSleep) => setTimeout(resolveSleep, Math.min(30000, 1000 * 2 ** attempt)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function fetchContentLength(url) {
  const res = await fetch(url, { method: "HEAD", headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HEAD failed ${res.status} ${res.statusText}: ${url}`);
  return Number(res.headers.get("content-length") || "0");
}

async function downloadRange(url, start, end, path) {
  const marker = `${path}.complete`;
  if (existsSync(path) && existsSync(marker)) return;
  await mkdir(dirname(path), { recursive: true });
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          range: `bytes=${start}-${end}`
        }
      });
      if (!(res.status === 206 || res.status === 200)) throw new Error(`range download failed ${res.status} ${res.statusText}: ${url}`);
      const out = createWriteStream(path);
      await new Promise((resolvePromise, reject) => {
        res.body.pipeTo(Writable.toWeb(out)).then(resolvePromise, reject);
      });
      await writeFile(marker, sha256(await readFile(path)), "utf8");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolveSleep) => setTimeout(resolveSleep, Math.min(30000, 1000 * 2 ** attempt)));
    }
  }
  throw lastError;
}

async function readIndexMatches(language, entities) {
  const indexPath = resolve(SOURCE_DIR, language, `${language}wiki-latest-pages-articles-multistream-index.txt.bz2`);
  await downloadFile(indexUrl(language), indexPath);
  const targets = new Map();
  for (const entity of entities) {
    const title = entity.wikipedia_sitelinks?.[language]?.title;
    if (!title) continue;
    const key = normalizeTitle(title);
    if (!targets.has(key)) targets.set(key, []);
    targets.get(key).push(entity);
  }
  const distinctOffsets = [];
  const matchesByOffset = new Map();
  let lastOffset = null;
  const proc = spawn("bzip2", ["-dc", indexPath], { stdio: ["ignore", "pipe", "pipe"] });
  const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
  for await (const line of rl) {
    const first = line.indexOf(":");
    const second = line.indexOf(":", first + 1);
    if (first < 0 || second < 0) continue;
    const offset = Number(line.slice(0, first));
    const pageId = Number(line.slice(first + 1, second));
    const title = normalizeTitle(line.slice(second + 1));
    if (Number.isFinite(offset) && offset !== lastOffset) {
      distinctOffsets.push(offset);
      lastOffset = offset;
    }
    const targetEntities = targets.get(title);
    if (!targetEntities) continue;
    if (!matchesByOffset.has(offset)) matchesByOffset.set(offset, []);
    for (const entity of targetEntities) {
      matchesByOffset.get(offset).push({ entity, title, page_id: pageId });
    }
  }
  const exit = await new Promise((resolveExit) => proc.on("close", resolveExit));
  if (exit !== 0) throw new Error(`bzip2 index decode failed for ${language}`);
  const offsetIndex = new Map(distinctOffsets.map((offset, index) => [offset, index]));
  return { distinctOffsets, offsetIndex, matchesByOffset, eligible: [...targets.values()].reduce((sum, items) => sum + items.length, 0) };
}

function cleanWikiText(text) {
  let out = String(text || "").replace(/\r\n/g, "\n");
  out = out.replace(/<!--[\s\S]*?-->/g, " ");
  out = out.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, " ");
  out = out.replace(/<ref\b[^/]*\/>/gi, " ");
  out = out.replace(/\{\|[\s\S]*?\|\}/g, " ");
  for (let i = 0; i < 10 && /\{\{[^{}]*\}\}/.test(out); i += 1) out = out.replace(/\{\{[^{}]*\}\}/g, " ");
  out = out.replace(/\[\[(?:File|Image|Category|文件|图像|分类):[^\]]+\]\]/gi, " ");
  out = out.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1");
  out = out.replace(/\[\[([^\]]+)\]\]/g, "$1");
  out = out.replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g, "$2");
  out = out.replace(/\[(https?:\/\/[^\s\]]+)\]/g, " ");
  out = out.replace(/'{2,}/g, "");
  out = out.replace(/<[^>]+>/g, " ");
  out = out.replace(/^[:;*#]+\s*/gm, "");
  out = out.replace(/__[^_]+__/g, " ");
  out = out.replace(/&nbsp;/g, " ");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function usefulText(content, language) {
  if (/^\s*#(?:REDIRECT|重定向)/i.test(content)) return "";
  const cleaned = cleanWikiText(content);
  const forbidden = /^(参考资料|参考文献|外部链接|参见|延伸阅读|注释|来源|脚注|References|External links|See also|Further reading|Notes|Sources)$/i;
  const sections = [];
  let current = { title: "lead", text: "" };
  for (const line of cleaned.split(/\n/)) {
    const heading = line.match(/^\s*={2,}\s*(.*?)\s*={2,}\s*$/);
    if (heading) {
      if (current.text.trim()) sections.push(current);
      current = { title: heading[1].trim(), text: "" };
    } else {
      current.text += `${line}\n`;
    }
  }
  if (current.text.trim()) sections.push(current);
  return sections
    .filter((section) => !forbidden.test(section.title))
    .slice(0, 4)
    .map((section) => section.text.split(/\n/).map((line) => line.trim()).filter(Boolean).join(language === "zh" ? "" : " "))
    .filter(Boolean)
    .join(language === "zh" ? "\n" : "\n\n");
}

function splitPassages(text, language) {
  const cleaned = String(text || "").replace(/\[[0-9]+\]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const rawParts = language === "zh" ? cleaned.split(/(?<=[。！？])\s*/) : cleaned.split(/(?<=[.!?])\s+/);
  const passages = [];
  let buf = "";
  const min = language === "zh" ? 40 : 3;
  const max = language === "zh" ? 320 : 240;
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
  return passages.filter((p) => !/[{}<>|]/.test(p)).slice(0, 4);
}

function isDisallowed(title, content) {
  return /^List of /i.test(title) || /列表$/.test(title) || /\{\{\s*(disambiguation|消歧义|dab)/i.test(content);
}

function parsePages(xml) {
  const pages = [];
  const re = /<page>([\s\S]*?)<\/page>/g;
  let match;
  while ((match = re.exec(xml))) {
    const body = match[1];
    const revisionBody = body.match(/<revision>([\s\S]*?)<\/revision>/)?.[1] || "";
    pages.push({
      title: normalizeTitle(extractTag(body, "title")),
      page_id: Number(extractTag(body, "id")),
      revision_id: Number(extractTag(revisionBody, "id")),
      text: extractTag(revisionBody, "text")
    });
  }
  return pages;
}

function appendPassages(rows, entity, page, language, dumpVersion) {
  const text = usefulText(page.text, language);
  const parts = splitPassages(text, language);
  if (!parts.length) return false;
  for (let index = 0; index < parts.length; index += 1) {
    rows.push({
      passage_id: `${entity.wikidata_qid}:${language}:${index}`,
      canonical_id: entity.canonical_id,
      qid: entity.wikidata_qid,
      language,
      page_id: page.page_id,
      revision_id: page.revision_id,
      dump_version: dumpVersion,
      title: page.title,
      section: index === 0 ? "lead" : "selected",
      passage_index: index,
      text: parts[index],
      source_url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
      license: "CC BY-SA 4.0 / GFDL",
      attribution_required: true,
      share_alike_required: true,
      extracted_at: now()
    });
  }
  return true;
}

async function extractLanguage(language, entities) {
  const { distinctOffsets, offsetIndex, matchesByOffset, eligible } = await readIndexMatches(language, entities);
  const dumpLength = await fetchContentLength(dumpUrl(language));
  const offsets = [...matchesByOffset.keys()].sort((a, b) => a - b);
  const selectedOffsets = STREAM_LIMIT > 0 ? offsets.slice(0, STREAM_LIMIT) : offsets;
  const statePath = resolve(WORK_DIR, `${language}_multistream_state.json`);
  const rowsPath = resolve(WORK_DIR, `${language}_passages.jsonl`);
  const failuresPath = resolve(WORK_DIR, `${language}_failures.jsonl`);
  const savedState = process.env.PUBLIC_INGESTION_REBUILD_MULTISTREAM === "1" ? null : await readJson(statePath, null);
  const rows = savedState ? await readJsonl(rowsPath) : [];
  const failures = savedState ? await readJsonl(failuresPath) : [];
  const stats = savedState?.stats || {
    eligible_sitelink_entities: eligible,
    matched_index_entities: [...matchesByOffset.values()].reduce((sum, items) => sum + items.length, 0),
    streams_requested: selectedOffsets.length,
    streams_processed: 0,
    pages_found: 0,
    pages_parsed: 0,
    accepted_pages: 0
  };
  const dumpVersion = `${language}wiki-latest-pages-articles-multistream-2026-06-01`;
  for (let i = savedState?.next_offset_index || 0; i < selectedOffsets.length; i += 1) {
    const offset = selectedOffsets[i];
    const nextOffset = distinctOffsets[offsetIndex.get(offset) + 1] || dumpLength;
    const end = Math.max(offset, nextOffset - 1);
    const chunkPath = resolve(SOURCE_DIR, language, "ranges", `${offset}-${end}.xml.bz2`);
    await downloadRange(dumpUrl(language), offset, end, chunkPath);
    const decoded = spawnSync("bzip2", ["-dc", chunkPath], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    if (decoded.status !== 0) {
      for (const target of matchesByOffset.get(offset) || []) failures.push({ qid: target.entity.wikidata_qid, language, title: target.title, reason: "stream_decode_failed" });
      continue;
    }
    const pages = parsePages(decoded.stdout);
    const pagesByTitle = new Map(pages.map((page) => [normalizeTitle(page.title), page]));
    for (const target of matchesByOffset.get(offset) || []) {
      const page = pagesByTitle.get(normalizeTitle(target.title));
      if (!page) {
        failures.push({ qid: target.entity.wikidata_qid, language, title: target.title, reason: "page_not_found_in_stream" });
        continue;
      }
      stats.pages_found += 1;
      if (isDisallowed(page.title, page.text)) {
        failures.push({ qid: target.entity.wikidata_qid, language, title: page.title, reason: "disambiguation_or_list_page" });
        continue;
      }
      stats.pages_parsed += 1;
      if (appendPassages(rows, target.entity, page, language, dumpVersion)) {
        stats.accepted_pages += 1;
      } else {
        failures.push({ qid: target.entity.wikidata_qid, language, title: page.title, reason: "stub_or_empty_extract" });
      }
    }
    stats.streams_processed += 1;
    if (process.env.PUBLIC_INGESTION_KEEP_RANGE_CHUNKS !== "1") {
      await unlink(chunkPath).catch(() => {});
      await unlink(`${chunkPath}.complete`).catch(() => {});
    }
    if (i % 25 === 0 || i === selectedOffsets.length - 1) {
      await writeJsonl(rowsPath, rows);
      await writeJsonl(failuresPath, failures);
      await writeJson(statePath, {
        generated_at: now(),
        language,
        next_offset_index: i + 1,
        total_offsets: selectedOffsets.length,
        stats
      });
      await writeJson(resolve(ART, "wikipedia_multistream_progress.json"), {
        generated_at: now(),
        language,
        offset_index: i + 1,
        total_offsets: selectedOffsets.length,
        stats,
        passage_rows: rows.length,
        failure_rows: failures.length
      });
    }
  }
  await writeJsonl(rowsPath, rows);
  await writeJsonl(failuresPath, failures);
  await writeJson(statePath, {
    generated_at: now(),
    language,
    next_offset_index: selectedOffsets.length,
    total_offsets: selectedOffsets.length,
    stats
  });
  await writeJson(resolve(WORK_DIR, `${language}_stats.json`), stats);
  return { rows, failures, stats };
}

async function writePassageShards(dir, rows) {
  await mkdir(dir, { recursive: true });
  const existing = (await listFiles(dir)).filter((file) => file.endsWith(".jsonl"));
  for (const file of existing) await unlink(file);
  for (let i = 0; i < rows.length; i += SHARD_SIZE) {
    await writeJsonl(resolve(dir, `passages-${String(i / SHARD_SIZE).padStart(5, "0")}.jsonl`), rows.slice(i, i + SHARD_SIZE));
  }
}

async function writeReports(entities, results) {
  for (const language of ["zh", "en"]) {
    if (!results[language]) {
      const rows = await readJsonl(resolve(WORK_DIR, `${language}_passages.jsonl`));
      const failures = await readJsonl(resolve(WORK_DIR, `${language}_failures.jsonl`));
      const stats = await readJson(resolve(WORK_DIR, `${language}_stats.json`), {});
      if (rows.length || failures.length || Object.keys(stats).length) results[language] = { rows, failures, stats };
    }
  }
  const allFailures = Object.values(results).flatMap((result) => result.failures);
  const report = {
    generated_at: now(),
    root_cause: "The earlier MediaWiki extracts importer combined multi-title batches with no excontinue handling; API recovery then hit persistent 429 throttling. This rebuild uses official pages-articles-multistream indexes plus byte-range stream extraction.",
    repair: "Mapped frozen sitelink titles to official multistream offsets, extracted only matching streams, preserved page/revision/dump provenance, and regenerated language passage shards.",
    languages: {}
  };
  for (const language of ["zh", "en"]) {
    const result = results[language] || { rows: [], failures: [], stats: {} };
    const eligible = entities.filter((entity) => entity.wikipedia_sitelinks?.[language]?.title);
    const acceptedQids = new Set(result.rows.map((row) => row.qid));
    const failuresForLanguage = allFailures.filter((failure) => failure.language === language);
    const validDumpEntities = Math.min(result.stats?.matched_index_entities || 0, eligible.length);
    const rejectionReasons = {};
    for (const failure of failuresForLanguage) rejectionReasons[failure.reason] = (rejectionReasons[failure.reason] || 0) + 1;
    report.languages[language] = {
      sampled_entity_count: entities.length,
      eligible_sitelink_entities: eligible.length,
      valid_dump_sitelink_entities: validDumpEntities,
      pages_requested: result.stats?.matched_index_entities || 0,
      pages_fetched: result.stats?.pages_found || 0,
      pages_parsed: result.stats?.pages_parsed || 0,
      pages_rejected: failuresForLanguage.length,
      accepted_entity_pages: acceptedQids.size,
      passage_count: result.rows.length,
      overall_sampled_entity_coverage: ratio(acceptedQids.size, entities.length),
      eligible_entity_coverage: ratio(acceptedQids.size, eligible.length),
      valid_dump_entity_coverage: ratio(acceptedQids.size, validDumpEntities),
      valid_dump_target_met: ratio(acceptedQids.size, validDumpEntities) >= 0.9,
      sitelink_present_fetch_success: ratio(result.stats?.pages_found || 0, eligible.length),
      fetched_page_parse_success: ratio(result.stats?.pages_parsed || 0, result.stats?.pages_found || 0),
      accepted_page_passage_success: ratio(acceptedQids.size, result.stats?.pages_parsed || 0),
      rejection_reasons: rejectionReasons
    };
  }
  await writeJson(resolve(ART, "passage_coverage_root_cause.json"), report);
  await writeJson(resolve(ART, "wikipedia_passage_report.json"), {
    generated_at: now(),
    extraction_mode: "wikimedia_pages_articles_multistream_range",
    source_urls: {
      zh: dumpUrl("zh"),
      en: dumpUrl("en")
    },
    page_stats: Object.fromEntries(Object.entries(results).map(([language, result]) => [language, result.stats])),
    failures: allFailures
  });
  return report;
}

async function main() {
  await mkdir(WORK_DIR, { recursive: true });
  const entities = await readAllJsonl(CANONICAL_DIR);
  const results = {};
  if (LANGUAGES.includes("zh")) {
    results.zh = await extractLanguage("zh", entities);
    await writePassageShards(PASSAGES_ZH_DIR, results.zh.rows);
  }
  if (LANGUAGES.includes("en")) {
    results.en = await extractLanguage("en", entities);
    await writePassageShards(PASSAGES_EN_DIR, results.en.rows);
  }
  const report = await writeReports(entities, results);
  console.log(JSON.stringify({ ok: true, report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
