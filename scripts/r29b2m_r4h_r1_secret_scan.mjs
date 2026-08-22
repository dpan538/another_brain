#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SECRET_PATH = join(ROOT, ".env.deepseek.local");
const REPORT_PATH = join(ROOT, "artifacts/r29b2m_r4h_r1/reports/secret_scan.json");
const secret = process.env.DEEPSEEK_API_KEY;

if (!secret) throw new Error("deepseek_api_key_unavailable");

function gitPaths(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "buffer" });
  if (result.status !== 0) throw new Error("git_inventory_failed");
  return result.stdout.toString("utf8").split("\0").filter(Boolean).map((path) => join(ROOT, path));
}

async function exactMatches(path) {
  if (path === SECRET_PATH) return 0;
  const needle = Buffer.from(secret, "utf8");
  let overlap = Buffer.alloc(0);
  let count = 0;
  try {
    for await (const chunk of createReadStream(path)) {
      const combined = Buffer.concat([overlap, chunk]);
      let offset = 0;
      while ((offset = combined.indexOf(needle, offset)) !== -1) {
        count += 1;
        offset += needle.byteLength;
      }
      overlap = combined.subarray(Math.max(0, combined.byteLength - Math.max(0, needle.byteLength - 1)));
    }
  } catch (error) {
    if (error?.code !== "EISDIR" && error?.code !== "ENOENT") throw error;
  }
  return count;
}

async function walk(root) {
  const { readdir } = await import("node:fs/promises");
  const files = [];
  async function visit(path) {
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (child === SECRET_PATH || entry.name === ".git") continue;
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) files.push(child);
    }
  }
  await visit(root);
  return files;
}

const tracked = gitPaths(["ls-files", "-z"]);
const untrackedCandidates = gitPaths(["ls-files", "--others", "--exclude-standard", "-z"]);
const artifactFiles = await walk(join(ROOT, "artifacts/r29b2m_r4h_r1"));
const allCandidates = [...new Set([...tracked, ...untrackedCandidates, ...artifactFiles])];
const browserCandidates = allCandidates.filter((path) => /(?:^|\/)(?:browser|web|public|dist)(?:\/|$)/u.test(path));

let trackedSecretMatches = 0;
for (const path of tracked) trackedSecretMatches += await exactMatches(path);
let browserSecretMatches = 0;
for (const path of browserCandidates) browserSecretMatches += await exactMatches(path);
let authorizationValueMatches = 0;
for (const path of allCandidates) authorizationValueMatches += await exactMatches(path);

const secretFileTracked = tracked.includes(SECRET_PATH);
const report = {
  secret_scan_passed: trackedSecretMatches === 0 && browserSecretMatches === 0 && authorizationValueMatches === 0 && !secretFileTracked,
  tracked_secret_matches: trackedSecretMatches,
  browser_secret_matches: browserSecretMatches,
  authorization_value_matches: authorizationValueMatches,
  secret_file_tracked: secretFileTracked,
};

await mkdir(dirname(REPORT_PATH), { recursive: true });
const temporary = `${REPORT_PATH}.tmp-${process.pid}`;
await writeFile(temporary, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
await rename(temporary, REPORT_PATH);
console.log(JSON.stringify(report));
if (!report.secret_scan_passed) process.exitCode = 2;
