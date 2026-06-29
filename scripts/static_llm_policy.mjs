import { extname, normalize, relative, resolve, sep } from "node:path";

export const STATIC_LLM_POLICY = Object.freeze({
  profiles: Object.freeze({
    hobby_static_llm_lite: Object.freeze({
      maxTotalBytes: 95_000_000,
      label: "Hobby static/source upload budget target"
    }),
    pro_static_llm_full: Object.freeze({
      maxTotalBytes: 950_000_000,
      label: "Pro static/source upload budget target"
    })
  }),
  sourceFileCountTarget: 15_000,
  buildTimeTargetMinutes: 45,
  targetShardFileBytes: 32_000_000,
  maxShardFileBytes: 64_000_000,
  approvedAssetPrefixes: Object.freeze([
    "static_llm/assets/",
    "web/static_llm/assets/"
  ]),
  approvedManifestPrefixes: Object.freeze([
    "static_llm/",
    "static_llm/manifests/",
    "web/static_llm/"
  ]),
  manifestSchemaPath: "static_llm/llm_manifest.schema.json"
});

export const MODEL_WEIGHT_EXTENSIONS = Object.freeze(new Set([
  ".safetensors",
  ".gguf",
  ".bin",
  ".pt",
  ".pth",
  ".onnx",
  ".mlmodel",
  ".mlpackage",
  ".ckpt"
]));

export function normalizeRepoPath(path = "") {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

export function manifestAssetPathToRepoCandidates(path = "") {
  const normalizedPath = normalizeRepoPath(path);
  if (normalizedPath.startsWith("web/static_llm/assets/")) return [normalizedPath];
  if (normalizedPath.startsWith("static_llm/assets/")) {
    return [`web/${normalizedPath}`, normalizedPath];
  }
  return [normalizedPath];
}

export function isExternalUrl(value = "") {
  return /^(?:https?:)?\/\//i.test(String(value || "")) || /^(data|blob|file):/i.test(String(value || ""));
}

export function isValidSha256(value = "") {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

export function isExampleSha256(value = "") {
  return /^example[_-].*do[_-]?not[_-]?admit/i.test(String(value || ""));
}

export function isModelWeightPath(path = "") {
  return MODEL_WEIGHT_EXTENSIONS.has(extname(String(path || "")).toLowerCase());
}

export function pathInApprovedStaticLlmAssetDir(path = "") {
  const normalizedPath = normalizeRepoPath(path);
  return STATIC_LLM_POLICY.approvedAssetPrefixes.some((prefix) => normalizedPath.startsWith(prefix));
}

export function repoRelativePath(root, path) {
  return normalizeRepoPath(relative(root, path));
}

export function resolveInsideRoot(root, relPath) {
  const resolved = resolve(root, relPath);
  const relativePath = relative(root, resolved);
  if (relativePath.startsWith("..") || relativePath === "" || relativePath.split(sep).includes("..")) return null;
  return resolved;
}

export function profileBudgetBytes(profile) {
  return STATIC_LLM_POLICY.profiles[profile]?.maxTotalBytes || 0;
}
