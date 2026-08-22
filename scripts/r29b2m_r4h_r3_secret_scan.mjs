#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SECRET_PATH = join(ROOT, ".env.deepseek.local");
const ARTIFACT_ROOT = join(ROOT, "artifacts/r29b2m_r4h_r3");
const REPORT_PATH = join(ARTIFACT_ROOT, "reports/secret_scan.json");
const TEXT_EXTENSIONS = new Set(["", ".cjs", ".css", ".html", ".js", ".json", ".jsonl", ".md", ".mjs", ".py", ".sh", ".ts", ".txt", ".yaml", ".yml"]);

async function walk(path) {
  try {
    const info = await stat(path);
    if (info.isFile()) return [path];
    const files = [];
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) files.push(...await walk(child));
      else files.push(child);
    }
    return files;
  } catch {
    return [];
  }
}

function loadSecretValue(text) {
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  if (lines.length !== 1 || !lines[0].startsWith("DEEPSEEK_API_KEY=")) throw new Error("secret_contract_invalid");
  let value = lines[0].slice("DEEPSEEK_API_KEY=".length).trim();
  if (value.length >= 2 && value[0] === value.at(-1) && ["\"", "'"].includes(value[0])) value = value.slice(1, -1);
  if (!value) throw new Error("secret_contract_invalid");
  return value;
}

let secret;
try {
  secret = loadSecretValue(await readFile(SECRET_PATH, "utf8"));
} catch {
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  const report = { pass: false, key_present: false, key_value_logged: false, error: "secret_configuration_unavailable" };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(report));
  process.exit(2);
}

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
const repositoryText = [...new Set([...tracked, ...untracked])].filter((path) => TEXT_EXTENSIONS.has(extname(path).toLowerCase()));
let trackedSecretMatches = 0;
for (const path of repositoryText) {
  try {
    if ((await readFile(join(ROOT, path), "utf8")).includes(secret)) trackedSecretMatches += 1;
  } catch {
    // Non-text tracked files are outside this scan.
  }
}

let artifactSecretMatches = 0;
let authorizationValueMatches = 0;
const artifactFiles = await walk(ARTIFACT_ROOT);
for (const path of artifactFiles) {
  if (resolve(path) === resolve(REPORT_PATH)) continue;
  try {
    const text = await readFile(path, "utf8");
    if (text.includes(secret)) artifactSecretMatches += 1;
    if (/Authorization\s*[:=]\s*(?!\[?REDACTED\]?|false|null)[^\s,;}]+/iu.test(text)) authorizationValueMatches += 1;
  } catch {
    // Ignored binary artifacts are outside this text scan.
  }
}

const ignored = spawnSync("git", ["check-ignore", "--quiet", ".env.deepseek.local"], { cwd: ROOT }).status === 0;
const secretFileTracked = tracked.includes(".env.deepseek.local");
const records = await readFile(join(ARTIFACT_ROOT, "raw/live_records.json"), "utf8").then(JSON.parse).catch(() => []);
const recordContractViolations = records.filter((record) => record.headers_recorded !== false || record.authorization_recorded !== false || record.raw_env_recorded !== false).length;
const report = {
  pass: trackedSecretMatches === 0 && artifactSecretMatches === 0 && authorizationValueMatches === 0 && recordContractViolations === 0 && ignored && !secretFileTracked,
  key_present: true,
  key_value_logged: false,
  tracked_secret_matches: trackedSecretMatches,
  artifact_secret_matches: artifactSecretMatches,
  authorization_value_matches: authorizationValueMatches,
  record_contract_violations: recordContractViolations,
  secret_file_ignored: ignored,
  secret_file_tracked: secretFileTracked,
  scanned_repository_text_files: repositoryText.length,
  scanned_artifact_files: artifactFiles.length,
  secret_prefix_recorded: false,
  secret_suffix_recorded: false,
  secret_length_recorded: false,
  secret_hash_recorded: false,
};
await mkdir(dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ pass: report.pass, key_present: true, key_value_logged: false, tracked_secret_matches: trackedSecretMatches, artifact_secret_matches: artifactSecretMatches, authorization_value_matches: authorizationValueMatches, secret_file_ignored: ignored, secret_file_tracked: secretFileTracked }));
if (!report.pass) process.exit(2);
