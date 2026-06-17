#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

function isVercelBuild() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_GIT_COMMIT_SHA);
}

function cleanString(value, fallback = "") {
  return String(value || fallback).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildRuntimeVersionSource() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local";
  const commitShort = commit === "local" ? "local" : commit.slice(0, 12);
  const buildTime = new Date().toISOString();
  const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || "";
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || "";
  const vercelEnv = process.env.VERCEL_ENV || "";

  return `export const RUNTIME_VERSION = Object.freeze({
  commit: "${cleanString(commit)}",
  commitShort: "${cleanString(commitShort)}",
  branch: "${cleanString(branch)}",
  buildTime: "${cleanString(buildTime)}",
  deploymentId: "${cleanString(deploymentId)}",
  vercelEnv: "${cleanString(vercelEnv)}",
  p0FallbackFirewall: true,
  r19ConversationController: true,
  r20EndpointAcceptance: true,
  publicDefaultGenerator: false,
  personal200mEnabledByDefault: false,
  webgpuRetrievalPilot: true,
  generatedAt: "${cleanString(buildTime)}"
});
`;
}

async function updateTextFile(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after !== before) await writeFile(path, after, "utf8");
  return before !== after;
}

async function main() {
  if (!isVercelBuild()) {
    console.log(JSON.stringify({ skipped: true, reason: "not_vercel_build" }, null, 2));
    return;
  }

  const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local";
  const versionToken = commit === "local" ? String(Date.now()) : commit.slice(0, 12);
  const runtimePath = resolve(ROOT, "web/runtime_version.js");
  const indexPath = resolve(ROOT, "web/index.html");
  const appPath = resolve(ROOT, "web/app.js");

  await writeFile(runtimePath, buildRuntimeVersionSource(), "utf8");
  const indexChanged = await updateTextFile(indexPath, (text) =>
    text.replace(/\.\/app\.js\?v=[^"']+/g, `./app.js?v=${versionToken}`)
  );
  const appChanged = await updateTextFile(appPath, (text) =>
    text.replace(/\.\/runtime_version\.js\?v=[^"']+/g, `./runtime_version.js?v=${versionToken}`)
  );

  console.log(
    JSON.stringify(
      {
        skipped: false,
        commit,
        versionToken,
        runtimeVersionWritten: true,
        indexChanged,
        appChanged
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
