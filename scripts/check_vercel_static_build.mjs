#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";
import {
  discoverStaticLlmManifestPaths,
  readStaticLlmManifest,
  validateStaticLlmManifestFile
} from "./static_llm_manifest_utils.mjs";
import {
  MODEL_WEIGHT_EXTENSIONS,
  STATIC_LLM_POLICY,
  manifestAssetPathToRepoCandidates,
  normalizeRepoPath,
  pathInApprovedStaticLlmAssetDir
} from "./static_llm_policy.mjs";

const REQUIRED_FILES = [
  "vercel.json",
  "package.json",
  "web/index.html",
  "web/app.js",
  "web/runtime_version.js",
  "web/dialog_rules.js",
  "web/knowledge_runtime.js",
  "web/operation_layer.js",
  "web/conversation_controller.js",
  "web/static_llm_runtime.js",
  "web/static_llm_backend.js",
  "web/static_llm_tokenizer.js",
  "web/static_llm_worker.js",
  "web/static_llm_worker_client.js",
  "web/llm_answer_contract.js",
  "web/tiny_router_model.generated.js",
  "web/culture_cards.generated.js",
  "web/knowledge_shards/manifest.json",
  "web/knowledge_shards/routing.json",
  "web/site.webmanifest",
  "web/robots.txt"
];

const MAX_PUBLIC_JS_JSON_BYTES = 20_000_000;
const MAX_KNOWLEDGE_SHARD_BYTES = 180_000;
const MONOLITHIC_KNOWLEDGE_FILE = "web/knowledge_base.generated.js";
const KNOWLEDGE_BUILD_SOURCE = "build_sources/knowledge/knowledge_base.generated.js";
const KNOWLEDGE_SOURCE_OF_TRUTH = "knowledge_sources/registry.json";

const FORBIDDEN_DEPLOY_EXTS = new Set([
  ".docx",
  ".pdf"
]);

const FORBIDDEN_DEPLOY_PATHS = [
  "web/brain_pack.js",
  "web/models",
  "web/vendor"
];

const API_OR_FUNCTION_DIRS = [
  "api",
  "pages/api",
  "app/api",
  "functions",
  "vercel/functions"
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

async function collectAdmittedStaticLlmAssets(failures) {
  const admittedAssetPaths = new Set();
  const manifestPaths = await discoverStaticLlmManifestPaths(ROOT);
  const validations = [];
  for (const path of manifestPaths) {
    const validation = await validateStaticLlmManifestFile(path, { root: ROOT });
    validations.push(validation);
    for (const failure of validation.failures) {
      failures.push(`static_llm_manifest_invalid:${validation.file}:${failure.code}`);
    }
    if (!validation.ok || !validation.admitted) continue;
    const manifest = await readStaticLlmManifest(path);
    for (const file of manifest.files || []) {
      for (const candidate of manifestAssetPathToRepoCandidates(file.path)) {
        admittedAssetPaths.add(normalizeRepoPath(candidate));
      }
    }
  }
  return { admittedAssetPaths, validations };
}

async function checkApiFunctionInference(failures) {
  for (const dir of API_OR_FUNCTION_DIRS) {
    const abs = resolve(ROOT, dir);
    if (!(await exists(abs))) continue;
    const files = await walk(abs);
    for (const file of files) {
      const rel = relative(ROOT, file);
      const ext = extname(file);
      if (![".js", ".mjs", ".ts", ".tsx", ".jsx", ".json"].includes(ext)) continue;
      const text = await readFile(file, "utf8").catch(() => "");
      if (/llm|model|inference|generate|completion|static_llm/i.test(text)) {
        failures.push(`api_or_function_llm_inference_surface:${rel}`);
      }
    }
  }
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
  const knowledgeManifest = parseJson(
    await readFile(resolve(ROOT, "web/knowledge_shards/manifest.json"), "utf8"),
    "web/knowledge_shards/manifest.json",
    failures
  );
  const staticLlm = await collectAdmittedStaticLlmAssets(failures);
  await checkApiFunctionInference(failures);
  const knowledgeRouting = parseJson(
    await readFile(resolve(ROOT, "web/knowledge_shards/routing.json"), "utf8"),
    "web/knowledge_shards/routing.json",
    failures
  );

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
  const dialogRules = await readFile(resolve(ROOT, "web/dialog_rules.js"), "utf8");
  if (!/type="module" src="\.\/app\.js\?v=/.test(index)) failures.push("index_missing_versioned_app_module");
  if (!/runtime_version\.js\?v=/.test(app)) failures.push("app_missing_versioned_runtime_version_import");
  if (/knowledge_base\.generated\.js/.test(dialogRules)) {
    failures.push("dialog_rules_imports_monolithic_knowledge");
  }
  for (const required of [
    "p0FallbackFirewall: true",
    "r19ConversationController: true",
    "r20EndpointAcceptance: true",
    "publicDefaultGenerator: false",
    "staticLlmEnabledByDefault: false",
    "staticLlmCandidateEnabledByDefault: false",
    "staticLlmAssetsAllowedInRepo: false",
    "staticLlmRequiresSameOriginAssets: true",
    "staticLlmNoBackendInference: true",
    "staticLlmNoExternalStorage: true",
    "r24FallbackHarnessEnabled: true",
    "legacySlmRuntimeEnabledByDefault: false",
    "legacyPersonal200mEnabledByDefault: false",
    "llmTrainingEnabledByDefault: false",
    "experimentalGeneratorEnabledByDefault: false",
    "personal200mEnabledByDefault: false",
    "externalSyntheticSamplesEnabledByDefault: false",
    "longHorizonTrainingScaffoldEnabled: true",
    "webgpuRetrievalPilot: true"
  ]) {
    if (!runtimeVersion.includes(required)) failures.push(`runtime_version_missing:${required}`);
  }

  for (const deployPath of FORBIDDEN_DEPLOY_PATHS) {
    if ((await exists(resolve(ROOT, deployPath))) && !isIgnoredByVercel(deployPath, vercelIgnoreEntries)) {
      failures.push(`forbidden_deploy_path_present:${deployPath}`);
    }
  }
  if (
    await exists(resolve(ROOT, MONOLITHIC_KNOWLEDGE_FILE))
  ) {
    failures.push("monolithic_knowledge_source_must_not_exist_in_web");
  }
  if (!(await exists(resolve(ROOT, KNOWLEDGE_BUILD_SOURCE)))) {
    failures.push(`missing_knowledge_build_source:${KNOWLEDGE_BUILD_SOURCE}`);
  }
  if (!(await exists(resolve(ROOT, KNOWLEDGE_SOURCE_OF_TRUTH)))) {
    failures.push(`missing_knowledge_source_of_truth:${KNOWLEDGE_SOURCE_OF_TRUTH}`);
  }

  const webFiles = await walk(resolve(ROOT, "web"));
  const actualShardFiles = new Set(
    webFiles
      .map((file) => relative(ROOT, file))
      .filter((rel) => /^web\/knowledge_shards\/shard_\d+\.json$/.test(rel))
  );
  const manifestShards = Array.isArray(knowledgeManifest.shards) ? knowledgeManifest.shards : [];
  if (knowledgeManifest.shard_count !== manifestShards.length) {
    failures.push("knowledge_manifest_shard_count_mismatch");
  }
  if (knowledgeManifest.shard_count !== actualShardFiles.size) {
    failures.push(`knowledge_manifest_actual_shard_count_mismatch:${knowledgeManifest.shard_count}:${actualShardFiles.size}`);
  }
  if (knowledgeManifest.source?.path !== KNOWLEDGE_BUILD_SOURCE) {
    failures.push(`knowledge_manifest_source_must_be_build_source:${knowledgeManifest.source?.path || ""}`);
  }
  if (knowledgeManifest.source_of_truth?.path !== KNOWLEDGE_SOURCE_OF_TRUTH) {
    failures.push(`knowledge_manifest_source_of_truth_mismatch:${knowledgeManifest.source_of_truth?.path || ""}`);
  }
  if (knowledgeRouting.schema_version !== 1) failures.push("knowledge_routing_schema_version_invalid");
  if (knowledgeRouting.shard_count !== knowledgeManifest.shard_count) failures.push("knowledge_routing_shard_count_mismatch");
  if (knowledgeRouting.source_path !== KNOWLEDGE_BUILD_SOURCE) {
    failures.push(`knowledge_routing_source_must_be_build_source:${knowledgeRouting.source_path || ""}`);
  }
  if (knowledgeRouting.source_of_truth?.path !== KNOWLEDGE_SOURCE_OF_TRUTH) {
    failures.push(`knowledge_routing_source_of_truth_mismatch:${knowledgeRouting.source_of_truth?.path || ""}`);
  }
  for (const shard of manifestShards) {
    const rel = `web/knowledge_shards/${shard.file}`;
    if (!actualShardFiles.has(rel)) failures.push(`knowledge_manifest_missing_shard_file:${rel}`);
  }
  for (const file of webFiles) {
    const rel = relative(ROOT, file);
    if (isIgnoredByVercel(rel, vercelIgnoreEntries)) continue;
    const ext = extname(file);
    if (FORBIDDEN_DEPLOY_EXTS.has(ext)) failures.push(`forbidden_deploy_extension:${rel}`);
    if (MODEL_WEIGHT_EXTENSIONS.has(ext)) {
      const normalized = normalizeRepoPath(rel);
      if (!pathInApprovedStaticLlmAssetDir(normalized)) {
        failures.push(`model_weight_outside_approved_static_llm_assets:${rel}`);
      } else if (!staticLlm.admittedAssetPaths.has(normalized)) {
        failures.push(`model_weight_missing_admitted_static_llm_manifest:${rel}`);
      }
    }
    const fileInfo = await stat(file);
    if ((ext === ".js" || ext === ".json") && fileInfo.size > MAX_PUBLIC_JS_JSON_BYTES) {
      failures.push(`public_js_json_file_too_large:${rel}:${fileInfo.size}`);
    }
    if (/^web\/knowledge_shards\/shard_\d+\.json$/.test(rel) && fileInfo.size > MAX_KNOWLEDGE_SHARD_BYTES) {
      failures.push(`knowledge_shard_too_large:${rel}:${fileInfo.size}`);
    }
    const textLike = [".html", ".js", ".css", ".json", ".txt", ".xml", ".webmanifest"].includes(ext);
    if (!textLike) continue;
    const text = await readFile(file, "utf8");
    if (ext === ".js" && /knowledge_base\.generated\.js/.test(text)) {
      failures.push(`public_runtime_imports_monolithic_knowledge:${rel}`);
    }
    if (/\/Users\/|\/private\/var\/|\/private\/tmp\//.test(text)) failures.push(`local_path_leak:${rel}`);
    if (/BEGIN (RSA|OPENSSH|PRIVATE) KEY/.test(text)) failures.push(`private_key_leak:${rel}`);
    if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) failures.push(`api_key_like_token:${rel}`);
    if (/api\.openai\.com|openai\.com\/v1|anthropic\.com|replicate\.com|huggingface\.co/i.test(text) && /llm|model|weight|inference|static_llm|asset/i.test(text)) {
      failures.push(`external_model_host_reference_in_public_runtime:${rel}`);
    }
    if (/Vercel Blob|AI Gateway|KV|Postgres|Redis|Upstash|Neon|hosted vector|vector store/i.test(text) && /llm|model|weight|asset|static_llm|loading/i.test(text)) {
      failures.push(`external_storage_reference_for_model_loading:${rel}`);
    }
  }

  const report = {
    ok: failures.length === 0,
    failures,
    warnings,
    buildCommand: vercelJson.buildCommand || "",
    outputDirectory: vercelJson.outputDirectory || "",
    jsCacheControl: jsCache,
    requiredFilesChecked: REQUIRED_FILES.length,
    deployedFilesScanned: webFiles.length,
    staticLlmPolicy: {
      profiles: STATIC_LLM_POLICY.profiles,
      approvedAssetPrefixes: STATIC_LLM_POLICY.approvedAssetPrefixes,
      targetShardFileBytes: STATIC_LLM_POLICY.targetShardFileBytes,
      maxShardFileBytes: STATIC_LLM_POLICY.maxShardFileBytes
    },
    staticLlmManifestsChecked: staticLlm.validations.length,
    admittedStaticLlmAssets: staticLlm.admittedAssetPaths.size
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
