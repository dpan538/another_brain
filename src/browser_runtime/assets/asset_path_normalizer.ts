export const R28HOTFIX3_ASSET_PATH_NORMALIZER_VERSION = "r28hotfix3-asset-path-normalizer-v1";

export function normalizeBrowserAssetPath(value, options = {}) {
  if (!value || typeof value !== "string") throw new Error("missing_asset_path");
  const raw = value.trim();
  if (!raw) throw new Error("missing_asset_path");
  if (raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    throw new Error("external_asset_url_rejected");
  }

  let path = raw.replace(/\\/g, "/");
  const basePath = options.basePath ? normalizeBrowserAssetPath(options.basePath) : "";
  if (path.startsWith("web/another_brain/")) {
    path = path.slice("web/".length);
  }

  if (path.startsWith("./")) {
    if (!basePath) throw new Error("relative_asset_base_missing");
    path = `${basePath.replace(/\/+$/, "")}/${path.slice(2)}`;
  } else if (!path.startsWith("/") && !path.startsWith("another_brain/")) {
    if (basePath) path = `${basePath.replace(/\/+$/, "")}/${path}`;
  }

  if (path.startsWith("another_brain/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");

  const segments = path.split("/").filter(Boolean);
  if (segments.some((part) => part === "." || part === ".." || decodeURIComponentSafe(part) === "..")) {
    throw new Error("path_traversal_rejected");
  }
  if (!path.startsWith("/another_brain/")) throw new Error(`asset_path_not_public_another_brain:${raw}`);
  if (path.includes("/artifacts/") || path.startsWith("/artifacts/")) throw new Error("artifact_path_rejected");
  if (path.includes("/data/public_ingestion/") || path.startsWith("/data/public_ingestion/")) {
    throw new Error("public_ingestion_path_rejected");
  }
  return path;
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function toSameOriginAssetUrl(value, options = {}) {
  const origin = options.origin || "http://localhost";
  const normalizedPath = normalizeBrowserAssetPath(value, options);
  const url = new URL(normalizedPath, origin);
  return url;
}
