#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateProtectedPair } from "../src/hybrid_runtime/protected_feature_signature.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_ROOT = resolve(ROOT, process.argv[2] || "artifacts/r29p0_pairwise_oracle");
const REPORT_ROOT = join(ARTIFACT_ROOT, "reports");
const cases = (await readFile(join(ROOT, "evals/r29p0_pairwise_oracle_v1/cases.jsonl"), "utf8"))
  .trim().split(/\r?\n/u).map((line) => JSON.parse(line));
const records = JSON.parse(await readFile(join(ARTIFACT_ROOT, "raw/live_records.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(ROOT, "evals/r29p0_pairwise_oracle_v1/manifest.json"), "utf8"));
const rows = [];
for (const caseId of manifest.batches.batch_1) {
  const fixture = cases.find((row) => row.case_id === caseId);
  const a = records.find((row) => row.phase === "batch1" && row.case_id === caseId && row.arm === "A");
  const b = records.find((row) => row.phase === "batch1" && row.case_id === caseId && row.arm === "B");
  if (!fixture || !a || !b) throw new Error(`r29p0_guard_latency_source_missing:${caseId}`);
  const source = fixture.messages.map((message) => message.content).join("\n");
  for (let warm = 0; warm < 10; warm += 1) evaluateProtectedPair(source, a.result.response, b.result.response, fixture);
  const iterations = 250;
  const start = performance.now();
  let last;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    last = evaluateProtectedPair(source, a.result.response, b.result.response, fixture);
  }
  rows.push({ case_id: caseId, mean_guard_ms: (performance.now() - start) / iterations, guard_passed: last.passed });
}
const sorted = rows.map((row) => row.mean_guard_ms).sort((left, right) => left - right);
const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
const report = {
  schema_version: "r29p0.guard_latency.v1",
  measurement: "offline warmed deterministic guard microbenchmark",
  case_count: rows.length,
  iterations_per_case: 250,
  p50_ms: percentile(0.5),
  p95_ms: percentile(0.95),
  max_ms: Math.max(...sorted),
  rows,
};
await mkdir(REPORT_ROOT, { recursive: true, mode: 0o700 });
const path = join(REPORT_ROOT, "guard_latency.json");
const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
await rename(temporary, path);
console.log(JSON.stringify({ case_count: report.case_count, p50_ms: report.p50_ms, p95_ms: report.p95_ms, max_ms: report.max_ms }));
