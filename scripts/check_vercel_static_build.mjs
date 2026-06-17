#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

const REQUIRED_FILES = [
  "vercel.json",
  "package.json",
  "web/index.html",
  "web/app.js",
  "web/runtime_version.js",
  "web/dialog_rules.js",
  "web/operation_layer.js",
  "web/conversation_controller.js",
  "web/tiny_router_model.generated.js",
  "web/culture_cards.generated.js",
  "web/knowledge_shards/manifest.json",
  "web/site.webmanifest",
  "web/robots.txt"
];

const FORBIDDEN_DEPLOY_EXTS = new Set([
  ".docx",
  ".pdf",
  ".safetensors",
  ".gguf",
  ".bin",
  ".pt",
  ".pth",
  ".onnx",
  ".mlmodel",
  ".mlpackage",
  ".ckpt"
]);

const FORBIDDEN_DEPLOY_PATHS = [
  "web/brain_pack.js",
  "web/models",
  "web/vendor"
];

function loadIgnoreEntries(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"));
}

function isIgnoredByVercel(rel, ignoreEntries) {
  return ignoreEntries.some((entry) => {
    const normalized = entry.replace(/\/+$/, "");
    if (entry.endsWith("/**")) return rel === normalized.slice(0, -3) || rel.startsWith(`${normalized.slice(0, -3)}/`);
    return rel === normalized || rel.startsWith(`${normalized}/`);
  });
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

function parseJson(text, label, failures) {
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${label}: invalid_json:${error.message}`);
    return {};
  }
}

async function main() {
  const failures = [];
  const warnings = [];

  for (const file of REQUIRED_FILES) {
    if (!(await exists(resolve(ROOT, file)))) failures.push(`missing_required_file:${file}`);
  }

  const packageJson = parseJson(await readFile(resolve(ROOT, "package.json"), "utf8"), "package.json", failures);
  const vercelJson = parseJson(await readFile(resolve(ROOT, "vercel.json"), "utf8"), "vercel.json", failures);
  const vercelIgnoreEntries = loadIgnoreEntries(await readFile(resolve(ROOT, ".vercelignore"), "utf8"));
  parseJson(await readFile(resolve(ROOT, "web/site.webmanifest"), "utf8"), "web/site.webmanifest", failures);
  parseJson(await readFile(resolve(ROOT, "web/knowledge_shards/manifest.json"), "utf8"), "web/knowledge_shards/manifest.json", failures);

  if (vercelJson.framework !== null) failures.push("vercel_framework_must_be_null_for_static_other");
  if (vercelJson.outputDirectory !== "web") failures.push("vercel_output_directory_must_be_web");
  if (vercelJson.buildCommand !== "npm run build:vercel") failures.push("vercel_build_command_must_use_build_vercel");
  if (!packageJson.scripts?.["build:vercel"]) failures.push("missing_package_script:build:vercel");
  if (!packageJson.scripts?.["check:vercel-build"]) failures.push("missing_package_script:check:vercel-build");

  const jsHeader = (vercelJson.headers || []).find((item) => item.source === "/(.*).js");
  const jsCache = jsHeader?.headers?.find((item) => item.key.toLowerCase() === "cache-control")?.value || "";
  if (/immutable/i.test(jsCache)) failures.push("vercel_js_cache_must_not_be_immutable");
  if (!/must-revalidate/i.test(jsCache)) warnings.push("vercel_js_cache_should_revalidate");

  const index = await readFile(resolve(ROOT, "web/index.html"), "utf8");
  const app = await readFile(resolve(ROOT, "web/app.js"), "utf8");
  const runtimeVersion = await readFile(resolve(ROOT, "web/runtime_version.js"), "utf8");
  if (!/type="module" src="\.\/app\.js\?v=/.test(index)) failures.push("index_missing_versioned_app_module");
  if (!/runtime_version\.js\?v=/.test(app)) failures.push("app_missing_versioned_runtime_version_import");
  for (const required of [
    "p0FallbackFirewall: true",
    "r19ConversationController: true",
    "r20EndpointAcceptance: true",
    "publicDefaultGenerator: false",
    "personal200mEnabledByDefault: false",
    "webgpuRetrievalPilot: true"
  ]) {
    if (!runtimeVersion.includes(required)) failures.push(`runtime_version_missing:${required}`);
  }

  for (const deployPath of FORBIDDEN_DEPLOY_PATHS) {
    if ((await exists(resolve(ROOT, deployPath))) && !isIgnoredByVercel(deployPath, vercelIgnoreEntries)) {
      failures.push(`forbidden_deploy_path_present:${deployPath}`);
    }
  }

  const webFiles = await walk(resolve(ROOT, "web"));
  for (const file of webFiles) {
    const rel = relative(ROOT, file);
    if (isIgnoredByVercel(rel, vercelIgnoreEntries)) continue;
    const ext = extname(file);
    if (FORBIDDEN_DEPLOY_EXTS.has(ext)) failures.push(`forbidden_deploy_extension:${rel}`);
    const textLike = [".html", ".js", ".css", ".json", ".txt", ".xml", ".webmanifest"].includes(ext);
    if (!textLike) continue;
    const text = await readFile(file, "utf8");
    if (/\/Users\/|\/private\/var\/|\/private\/tmp\//.test(text)) failures.push(`local_path_leak:${rel}`);
    if (/BEGIN (RSA|OPENSSH|PRIVATE) KEY/.test(text)) failures.push(`private_key_leak:${rel}`);
    if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) failures.push(`api_key_like_token:${rel}`);
  }

  const report = {
    ok: failures.length === 0,
    failures,
    warnings,
    buildCommand: vercelJson.buildCommand || "",
    outputDirectory: vercelJson.outputDirectory || "",
    jsCacheControl: jsCache,
    requiredFilesChecked: REQUIRED_FILES.length,
    deployedFilesScanned: webFiles.length
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
