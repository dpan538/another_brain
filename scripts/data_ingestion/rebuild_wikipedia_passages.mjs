#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ART = resolve(ROOT, "artifacts/data_ingestion");
const GEN = resolve(ROOT, "data/public_ingestion/generated");
const CACHE = resolve(GEN, "cache");
const CANONICAL_DIR = resolve(GEN, "canonical_graph");
const PASSAGES_ZH_DIR = resolve(GEN, "passages_zh");
const PASSAGES_EN_DIR = resolve(GEN, "passages_en");
const WORK_DIR = resolve(GEN, "passage_rebuild_work");
const SHARD_SIZE = Number(process.env.PUBLIC_INGESTION_SHARD_SIZE || "1000");
const REQUEST_DELAY_MS = Number(process.env.PUBLIC_INGESTION_WIKIPEDIA_SINGLE_DELAY_MS || "500");
const BATCH_SIZE = Number(process.env.PUBLIC_INGESTION_WIKIPEDIA_BATCH_SIZE || "20");
const CHECKPOINT_EVERY = Number(process.env.PUBLIC_INGESTION_WIKIPEDIA_CHECKPOINT_EVERY || "20");
const USER_AGENT = "another_brain_public_ingestion_recovery/0.1 (local research; provenance-aware)";

function now() {
  return new Date().toISOString();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function ratio(a, b) {
  return b ? Number((a / b).toFixed(4)) : 0;
}

async function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
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

async function cachedFetch(url, options = {}) {
  const key = sha256(`GET ${url}`);
  const cachePath = resolve(CACHE, `${key}.json`);
  const markerPath = `${cachePath}.complete`;
  if (existsSync(cachePath) && existsSync(markerPath)) {
    return JSON.parse(await readFile(cachePath, "utf8"));
  }
  let lastError = null;
  const retries = Number(options.retries || "4");
  const timeoutMs = Number(options.timeoutMs || process.env.PUBLIC_INGESTION_FETCH_TIMEOUT_MS || "12000");
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "application/json" }
      });
      const text = await res.text();
      if (!res.ok) {
        const error = new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 180)}`);
        error.status = res.status;
        throw error;
      }
      JSON.parse(text);
      await mkdir(CACHE, { recursive: true });
      await writeFile(cachePath, text, "utf8");
      await writeFile(markerPath, sha256(text), "utf8");
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      const baseDelay = error?.status === 429 ? 30000 : 750;
      await sleep(Math.min(60000, baseDelay * 2 ** attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function appendPassagesForPage({ rows, entity, page, language }) {
  const parts = splitPassages(page.extract || "", language);
  if (!parts.length) return false;
  const existingCount = rows.filter((row) => row.qid === entity.wikidata_qid && row.language === language).length;
  for (let passageIndex = 0; passageIndex < parts.length; passageIndex += 1) {
    rows.push({
      passage_id: `${entity.wikidata_qid}:${language}:${existingCount + passageIndex}`,
      canonical_id: entity.canonical_id,
      qid: entity.wikidata_qid,
      language,
      page_id: page.pageid,
      revision_id: page.lastrevid,
      dump_version: `mediawiki-api-single-${now().slice(0, 10)}`,
      title: page.title,
      section: passageIndex === 0 ? "lead" : "selected",
      passage_index: existingCount + passageIndex,
      text: parts[passageIndex],
      source_url: page.fullurl || entity.wikipedia_sitelinks?.[language]?.url || "",
      license: "CC BY-SA 4.0 / GFDL",
      attribution_required: true,
      share_alike_required: true,
      extracted_at: now()
    });
  }
  return true;
}

function splitPassages(text, language) {
  const cleaned = String(text || "")
    .replace(/\[[0-9]+\]/g, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const rawParts = language === "zh" ? cleaned.split(/(?<=[。！？])\s*/) : cleaned.split(/(?<=[.!?])\s+/);
  const passages = [];
  let buf = "";
  const min = language === "zh" ? 60 : 45;
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
  return passages
    .filter((p) => !/[{}<>|]/.test(p))
    .filter((p) => !/^(参见|外部链接|参考资料|参考文献|See also|References|External links)$/i.test(p))
    .slice(0, 4);
}

function cleanWikiText(text) {
  let out = String(text || "").replace(/\r\n/g, "\n");
  out = out.replace(/<!--[\s\S]*?-->/g, " ");
  out = out.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, " ");
  out = out.replace(/<ref\b[^/]*\/>/gi, " ");
  out = out.replace(/\{\|[\s\S]*?\|\}/g, " ");
  for (let i = 0; i < 8 && /\{\{[^{}]*\}\}/.test(out); i += 1) {
    out = out.replace(/\{\{[^{}]*\}\}/g, " ");
  }
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
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

function extractUsefulTextFromWikitext(content, language) {
  const cleaned = cleanWikiText(content);
  if (!cleaned) return "";
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
  const selected = [];
  for (const section of sections) {
    if (forbidden.test(section.title)) continue;
    const text = section.text
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^\s*(\||!|\{|})/.test(line))
      .join(language === "zh" ? "" : " ");
    if (text) selected.push(text);
    if (selected.length >= 4) break;
  }
  return selected.join(language === "zh" ? "\n" : "\n\n");
}

function pageUrlBatch(titles, language) {
  const api = language === "zh" ? "https://zh.wikipedia.org/w/api.php" : "https://en.wikipedia.org/w/api.php";
  const params = new URLSearchParams({
    action: "query",
    prop: "revisions|pageprops|info",
    titles: titles.join("|"),
    redirects: "1",
    inprop: "url",
    rvprop: "ids|content",
    rvslots: "main",
    rvlimit: "1",
    formatversion: "2",
    format: "json",
    origin: "*"
  });
  return `${api}?${params.toString()}`;
}

async function fetchPagesBatch(titles, language) {
  const data = await cachedFetch(pageUrlBatch(titles, language));
  const pages = Array.isArray(data.query?.pages) ? data.query.pages : Object.values(data.query?.pages || {});
  const titleAliases = new Map();
  for (const item of data.query?.normalized || []) titleAliases.set(item.from, item.to);
  for (const item of data.query?.redirects || []) titleAliases.set(item.from, item.to);
  return pages.map((page) => {
    const revision = page.revisions?.[0];
    const content = revision?.slots?.main?.content || revision?.["*"] || "";
    const aliases = [page.title];
    for (const [from, to] of titleAliases) {
      if (to === page.title) aliases.push(from);
    }
    return {
      ...page,
      _lookup_titles: aliases,
      lastrevid: revision?.revid || page.lastrevid,
      extract: extractUsefulTextFromWikitext(content, language)
    };
  });
}

function isDisallowedPage(page) {
  return page?.pageprops?.disambiguation !== undefined || /^List of /i.test(page?.title || "") || /列表$/.test(page?.title || "");
}

function countByReason(failures, language) {
  const out = {};
  for (const failure of failures.filter((item) => item.language === language)) out[failure.reason] = (out[failure.reason] || 0) + 1;
  return out;
}

async function writePassageShards(dir, rows) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (let i = 0; i < rows.length; i += SHARD_SIZE) {
    await writeJsonl(resolve(dir, `passages-${String(i / SHARD_SIZE).padStart(5, "0")}.jsonl`), rows.slice(i, i + SHARD_SIZE));
  }
}

async function writeCoverageReport(entities, passages, failures, pageStats) {
  const report = {
    generated_at: now(),
    root_cause: "MediaWiki extracts paginate multi-title batches via excontinue; the previous importer did not follow continuation, so most pages in each batch were misclassified as stub_or_empty_extract.",
    repair: "Rebuilt passages with exact single-title MediaWiki action API requests, local response cache, partial checkpoints, page/revision metadata, and per-language rejection accounting.",
    languages: {}
  };
  for (const language of ["zh", "en"]) {
    const pass = passages[language] || [];
    const eligible = entities.filter((entity) => entity.wikipedia_sitelinks?.[language]?.title);
    const acceptedQids = new Set(pass.map((item) => item.qid));
    const failuresForLanguage = failures.filter((item) => item.language === language);
    const stats = pageStats[language];
    report.languages[language] = {
      sampled_entity_count: entities.length,
      eligible_sitelink_entities: eligible.length,
      pages_requested: stats.requested,
      pages_fetched: stats.fetched,
      pages_parsed: stats.parsed,
      pages_rejected: failuresForLanguage.length,
      accepted_entity_pages: acceptedQids.size,
      passage_count: pass.length,
      overall_sampled_entity_coverage: ratio(acceptedQids.size, entities.length),
      eligible_entity_coverage: ratio(acceptedQids.size, eligible.length),
      sitelink_present_fetch_success: ratio(stats.fetched, eligible.length),
      fetched_page_parse_success: ratio(stats.parsed, stats.fetched),
      accepted_page_passage_success: ratio(acceptedQids.size, stats.parsed),
      rejection_reasons: countByReason(failures, language)
    };
  }
  await writeJson(resolve(ART, "passage_coverage_root_cause.json"), report);
  return report;
}

async function processLanguage(language, entities) {
  const statePath = resolve(WORK_DIR, `${language}_state.json`);
  const rowsPath = resolve(WORK_DIR, `${language}_passages.jsonl`);
  const failuresPath = resolve(WORK_DIR, `${language}_failures.jsonl`);
  const state = await readJson(statePath, { next_index: 0, stats: { requested: 0, fetched: 0, parsed: 0, accepted_pages: 0 } });
  const rows = await readJsonl(rowsPath);
  const failures = await readJsonl(failuresPath);
  const candidates = entities
    .map((entity) => ({ entity, title: entity.wikipedia_sitelinks?.[language]?.title }))
    .filter((item) => item.title);
  state.stats.requested = candidates.length;
  for (let index = state.next_index; index < candidates.length; index += BATCH_SIZE) {
    const batch = candidates.slice(index, Math.min(candidates.length, index + BATCH_SIZE));
    try {
      if (REQUEST_DELAY_MS > 0) await sleep(REQUEST_DELAY_MS);
      const pages = await fetchPagesBatch(batch.map((item) => item.title), language);
      const pagesByTitle = new Map();
      for (const page of pages) {
        for (const lookupTitle of page._lookup_titles || [page.title]) pagesByTitle.set(lookupTitle, page);
      }
      for (const { entity, title } of batch) {
        const page = pagesByTitle.get(title);
        if (!page || page.missing) {
          failures.push({ qid: entity.wikidata_qid, language, title, reason: "wikipedia_page_missing" });
          continue;
        }
        state.stats.fetched += 1;
        if (isDisallowedPage(page)) {
          failures.push({ qid: entity.wikidata_qid, language, title: page.title, reason: "disambiguation_or_list_page" });
        } else {
          state.stats.parsed += 1;
          if (!appendPassagesForPage({ rows, entity, page, language })) {
            failures.push({ qid: entity.wikidata_qid, language, title: page.title, reason: "stub_or_empty_extract" });
          } else {
            state.stats.accepted_pages += 1;
          }
        }
      }
    } catch (error) {
      for (const { entity, title } of batch) {
        failures.push({ qid: entity.wikidata_qid, language, title, reason: "wikipedia_fetch_failed", error: String(error.message || error) });
      }
    }
    state.next_index = Math.min(candidates.length, index + BATCH_SIZE);
    if (index % CHECKPOINT_EVERY === 0 || state.next_index === candidates.length) {
      await writeJsonl(rowsPath, rows);
      await writeJsonl(failuresPath, failures);
      await writeJson(statePath, state);
      await writeJson(resolve(ART, "wikipedia_passage_rebuild_progress.json"), {
        generated_at: now(),
        language,
        next_index: state.next_index,
        total: candidates.length,
        stats: state.stats,
        passage_rows: rows.length,
        failure_rows: failures.length
      });
    }
  }
  await writeJsonl(rowsPath, rows);
  await writeJsonl(failuresPath, failures);
  await writeJson(statePath, state);
  await retryFetchFailures({ language, entities, rows, failures, state, rowsPath, failuresPath, statePath });
  return { rows, failures, stats: state.stats };
}

async function retryFetchFailures({ language, entities, rows, failures, state, rowsPath, failuresPath, statePath }) {
  const byQid = new Map(entities.map((entity) => [entity.wikidata_qid, entity]));
  const remaining = [];
  const retryable = failures.filter((failure) => failure.language === language && failure.reason === "wikipedia_fetch_failed");
  const untouched = failures.filter((failure) => !(failure.language === language && failure.reason === "wikipedia_fetch_failed"));
  for (const failure of retryable) {
    const entity = byQid.get(failure.qid);
    if (!entity) {
      remaining.push(failure);
      continue;
    }
    const title = entity.wikipedia_sitelinks?.[language]?.title || failure.title;
    try {
      if (REQUEST_DELAY_MS > 0) await sleep(Math.max(REQUEST_DELAY_MS, 1000));
      const [page] = await fetchPagesBatch([title], language);
      if (!page || page.missing) {
        remaining.push({ qid: entity.wikidata_qid, language, title, reason: "wikipedia_page_missing_after_retry" });
      } else if (isDisallowedPage(page)) {
        remaining.push({ qid: entity.wikidata_qid, language, title: page.title, reason: "disambiguation_or_list_page" });
      } else {
        state.stats.fetched += 1;
        state.stats.parsed += 1;
        if (appendPassagesForPage({ rows, entity, page, language })) state.stats.accepted_pages += 1;
        else remaining.push({ qid: entity.wikidata_qid, language, title: page.title, reason: "stub_or_empty_extract_after_retry" });
      }
    } catch (error) {
      remaining.push({ ...failure, retry_error: String(error.message || error) });
    }
    if ((remaining.length + untouched.length) % 20 === 0) {
      await writeJsonl(rowsPath, rows);
      await writeJsonl(failuresPath, [...untouched, ...remaining]);
      await writeJson(statePath, state);
    }
  }
  failures.splice(0, failures.length, ...untouched, ...remaining);
  await writeJsonl(rowsPath, rows);
  await writeJsonl(failuresPath, failures);
  await writeJson(statePath, state);
}

async function main() {
  await mkdir(WORK_DIR, { recursive: true });
  const entities = await readAllJsonl(CANONICAL_DIR);
  const zh = await processLanguage("zh", entities);
  const en = await processLanguage("en", entities);
  const passages = { zh: zh.rows, en: en.rows };
  const failures = [...zh.failures, ...en.failures];
  const pageStats = { zh: zh.stats, en: en.stats };
  await writePassageShards(PASSAGES_ZH_DIR, zh.rows);
  await writePassageShards(PASSAGES_EN_DIR, en.rows);
  const coverage = await writeCoverageReport(entities, passages, failures, pageStats);
  await writeJson(resolve(ART, "wikipedia_passage_report.json"), {
    generated_at: now(),
    extraction_mode: "single_title_mediawiki_action_api",
    zh_passages: zh.rows.length,
    en_passages: en.rows.length,
    page_stats: pageStats,
    failures
  });
  console.log(JSON.stringify({ ok: true, coverage }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
