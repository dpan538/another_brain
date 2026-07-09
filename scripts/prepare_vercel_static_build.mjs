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
  const vercelEnv = process.env.VERCEL_ENV || "";

  return `export const RUNTIME_VERSION = Object.freeze({
  commit: "${cleanString(commit)}",
  commitShort: "${cleanString(commitShort)}",
  branch: "${cleanString(branch)}",
  buildTime: "${cleanString(buildTime)}",
  deploymentIdAvailable: ${process.env.VERCEL_DEPLOYMENT_ID ? "true" : "false"},
  vercelEnv: "${cleanString(vercelEnv)}",
  p0FallbackFirewall: true,
  r19ConversationController: true,
  r20EndpointAcceptance: true,
  publicDefaultGenerator: false,
  staticLlmEnabledByDefault: false,
  staticLlmCandidateEnabledByDefault: false,
  staticLlmAssetsAllowedInRepo: false,
  staticLlmRequiresSameOriginAssets: true,
  staticLlmNoBackendInference: true,
  staticLlmNoExternalStorage: true,
  r24FallbackHarnessEnabled: true,
  legacySlmRuntimeEnabledByDefault: false,
  legacyPersonal200mEnabledByDefault: false,
  llmTrainingEnabledByDefault: false,
  experimentalGeneratorEnabledByDefault: false,
  personal200mEnabledByDefault: false,
  externalSyntheticSamplesEnabledByDefault: false,
  longHorizonTrainingScaffoldEnabled: true,
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

async function updateJsonFile(path, transform) {
  const before = await readFile(path, "utf8");
  const data = JSON.parse(before);
  const afterData = transform(data);
  const after = `${JSON.stringify(afterData, null, 2)}\n`;
  if (after !== before) await writeFile(path, after, "utf8");
  return before !== after;
}

function patchR28livefix0Html(text, commitShort, buildTime) {
  return text
    .replace(
      /(<meta name="another-brain-commit-short" content=")[^"]+(" \/>)/,
      `$1${cleanString(commitShort)}$2`
    )
    .replace(
      /(R28LIVEFIX0 · r28livefix0-live-q4-mount · )[^<]+/g,
      `$1${cleanString(commitShort)}`
    )
    .replace(
      /(R28LIVEFIX0 \/ r28livefix0-live-q4-mount \/ )[^/]+( \/ )[^<]+/g,
      `$1${cleanString(commitShort)}$2${cleanString(buildTime)}`
    );
}

function patchChatHtmlAssetTokens(text, versionToken) {
  return text
    .replace(/\.\/app\.js\?v=[^"']+/g, `./app.js?v=${versionToken}`)
    .replace(/\/another_brain_chat\/app\.js\?v=[^"']+/g, `/another_brain_chat/app.js?v=${versionToken}`)
    .replace(/\/another_brain_chat\/styles\.css\?v=[^"']+/g, `/another_brain_chat/styles.css?v=${versionToken}`);
}

function patchChatModuleAssetTokens(text, versionToken) {
  return text
    .replace(/\.\/browser_runtime\.js\?v=[^"')]+/g, `./browser_runtime.js?v=${versionToken}`)
    .replace(/\.\/context_bridge\.js\?v=[^"')]+/g, `./context_bridge.js?v=${versionToken}`)
    .replace(/\.\/runtime_worker\.js\?v=[^"')]+/g, `./runtime_worker.js?v=${versionToken}`)
    .replace(/\.\/self_check_worker\.js\?v=[^"')]+/g, `./self_check_worker.js?v=${versionToken}`)
    .replace(/\.\/q4_worker_runtime\.js\?v=[^"')]+/g, `./q4_worker_runtime.js?v=${versionToken}`);
}

async function main() {
  if (!isVercelBuild()) {
    console.log(JSON.stringify({ skipped: true, reason: "not_vercel_build" }, null, 2));
    return;
  }

  const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local";
  const versionToken = commit === "local" ? String(Date.now()) : commit.slice(0, 12);
  const commitShort = commit === "local" ? "local" : commit.slice(0, 7);
  const buildTime = new Date().toISOString();
  const runtimePath = resolve(ROOT, "web/runtime_version.js");
  const indexPath = resolve(ROOT, "web/index.html");
  const appPath = resolve(ROOT, "web/app.js");
  const chatIndexPath = resolve(ROOT, "web/another_brain_chat/index.html");
  const chatFlatPath = resolve(ROOT, "web/another_brain_chat.html");
  const chatAppPath = resolve(ROOT, "web/another_brain_chat/app.js");
  const chatBrowserRuntimePath = resolve(ROOT, "web/another_brain_chat/browser_runtime.js");
  const chatRuntimeWorkerPath = resolve(ROOT, "web/another_brain_chat/runtime_worker.js");
  const chatSelfCheckWorkerPath = resolve(ROOT, "web/another_brain_chat/self_check_worker.js");
  const runtimeModePath = resolve(ROOT, "web/another_brain/runtime_mode.json");
  const assetManifestPath = resolve(ROOT, "web/another_brain/asset_manifest.json");

  await writeFile(runtimePath, buildRuntimeVersionSource(), "utf8");
  const indexChanged = await updateTextFile(indexPath, (text) =>
    patchR28livefix0Html(
      patchChatHtmlAssetTokens(text, versionToken),
      commitShort,
      buildTime
    )
  );
  const chatIndexChanged = await updateTextFile(chatIndexPath, (text) =>
    patchChatHtmlAssetTokens(patchR28livefix0Html(text, commitShort, buildTime), versionToken)
  );
  const chatFlatChanged = await updateTextFile(chatFlatPath, (text) =>
    patchChatHtmlAssetTokens(patchR28livefix0Html(text, commitShort, buildTime), versionToken)
  );
  const appChanged = await updateTextFile(appPath, (text) =>
    text.replace(/\.\/runtime_version\.js\?v=[^"']+/g, `./runtime_version.js?v=${versionToken}`)
  );
  const chatAppChanged = await updateTextFile(chatAppPath, (text) =>
    patchChatModuleAssetTokens(text, versionToken)
      .replace(/const R28LIVEFIX0_SOURCE_COMMIT = "[^"]+";/, `const R28LIVEFIX0_SOURCE_COMMIT = "${cleanString(commitShort)}";`)
      .replace(/ui_build_timestamp: "[^"]+"/, `ui_build_timestamp: "${cleanString(buildTime)}"`)
  );
  const chatBrowserRuntimeChanged = await updateTextFile(chatBrowserRuntimePath, (text) =>
    patchChatModuleAssetTokens(text, versionToken)
  );
  const chatRuntimeWorkerChanged = await updateTextFile(chatRuntimeWorkerPath, (text) =>
    patchChatModuleAssetTokens(text, versionToken)
  );
  const chatSelfCheckWorkerChanged = await updateTextFile(chatSelfCheckWorkerPath, (text) =>
    patchChatModuleAssetTokens(text, versionToken)
  );
  const runtimeModeChanged = await updateJsonFile(runtimeModePath, (data) => ({
    ...data,
    build_commit_short: commitShort,
    ui_build_timestamp: buildTime
  }));
  const assetManifestChanged = await updateJsonFile(assetManifestPath, (data) => ({
    ...data,
    build_commit_short: commitShort,
    ui_build_timestamp: buildTime
  }));

  console.log(
    JSON.stringify(
      {
        skipped: false,
        commit,
        commitShort,
        versionToken,
        buildTime,
        runtimeVersionWritten: true,
        indexChanged,
        appChanged,
        chatIndexChanged,
        chatFlatChanged,
        chatAppChanged,
        chatBrowserRuntimeChanged,
        chatRuntimeWorkerChanged,
        chatSelfCheckWorkerChanged,
        runtimeModeChanged,
        assetManifestChanged
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
