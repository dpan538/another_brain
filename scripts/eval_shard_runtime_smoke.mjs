#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { OBJECT_TABLE } from "../web/object_table.js?v=5";
import { directAnswerForObjectQuery } from "../web/dialog_rules.js?v=60";
import {
  cachedKnowledgeCards,
  configureKnowledgeRuntime,
  knowledgeRuntimeStats,
  warmKnowledgeForQuery
} from "../web/knowledge_runtime.js?v=1";

const WEB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../web");

configureKnowledgeRuntime({
  shardBase: "knowledge_shards/",
  fetchImpl: async (url) => {
    const cleanPath = String(url || "").replace(/^\.\//, "");
    try {
      const text = await readFile(resolve(WEB_DIR, cleanPath), "utf8");
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(text)
      };
    } catch {
      return {
        ok: false,
        status: 404,
        json: async () => ({})
      };
    }
  },
  reset: true
});

const CASES = [
  {
    query: "毛巾是什么？",
    label: "毛巾",
    markers: ["擦", "水", "织物"]
  },
  {
    query: "白平衡有什么用？",
    label: "白平衡",
    markers: ["颜色", "色", "冷暖", "照片"]
  },
  {
    query: "GitHub有什么用？",
    label: "GitHub",
    markers: ["代码", "协作", "保存"]
  }
];

function hasMarker(text, markers) {
  return markers.some((marker) => String(text || "").includes(marker));
}

async function main() {
  const failures = [];
  const results = [];

  for (const item of CASES) {
    await warmKnowledgeForQuery(item.query, { maxShards: 2 });
    const cached = cachedKnowledgeCards();
    const card = cached.find((candidate) => candidate.label === item.label);
    const answer = directAnswerForObjectQuery(OBJECT_TABLE, item.query);
    if (!card) failures.push(`missing_cached_card:${item.label}`);
    if (!answer) failures.push(`missing_direct_answer:${item.query}`);
    if (answer && !hasMarker(answer, item.markers)) failures.push(`answer_missing_marker:${item.query}:${answer}`);
    results.push({
      query: item.query,
      label: item.label,
      cached: Boolean(card),
      answer
    });
  }

  const stats = knowledgeRuntimeStats();
  if (stats.shardCount && stats.loadedShardCount >= stats.shardCount) {
    failures.push(`loaded_all_shards:${stats.loadedShardCount}/${stats.shardCount}`);
  }

  const report = {
    ok: failures.length === 0,
    failures,
    results,
    runtime_stats: stats
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
