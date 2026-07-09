import { toSameOriginAssetUrl } from "./asset_path_normalizer.ts";

export const R28LIVEFIX0_LIVE_ASSET_PROBE_VERSION = "r28livefix0-live-asset-probe-v1";

async function readProbeBytes(response, limit = 16) {
  const capped = Math.max(1, Number(limit || 16));
  if (response?.body?.getReader) {
    const reader = response.body.getReader();
    try {
      const chunk = await reader.read();
      const bytes = chunk?.value?.byteLength || chunk?.value?.length || 0;
      return Math.min(bytes, capped);
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  const buffer = await response.arrayBuffer();
  return Math.min(buffer.byteLength || 0, capped);
}

function contentLengthHeader(response) {
  const value = response?.headers?.get?.("content-length");
  return value == null ? "" : String(value);
}

function buildReport({ path, url, method, response = null, bytesRead = 0, ok = false, failureReason = "" }) {
  return {
    requested_path: path,
    normalized_url: url?.href || "",
    normalized_path: url?.pathname || "",
    method,
    status: Number(response?.status || 0),
    content_length_header: contentLengthHeader(response),
    bytes_read: Number(bytesRead || 0),
    ok: ok === true,
    failure_reason: failureReason,
    probe_strategy: "get_range_then_get_body",
    version: R28LIVEFIX0_LIVE_ASSET_PROBE_VERSION
  };
}

export async function liveProbeSameOriginAsset(path, options = {}) {
  const url = toSameOriginAssetUrl(path, {
    origin: options.origin || globalThis.location?.origin || ["http:", "", "localhost"].join("/"),
    basePath: options.basePath
  });
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch_unavailable_for_live_asset_probe");
  const rangeHeaders = { Range: `bytes=0-${Math.max(0, Number(options.rangeEnd ?? 15))}` };
  const cache = options.cache || "no-store";

  let rangeResponse = null;
  try {
    rangeResponse = await fetchImpl(url.href, { method: "GET", headers: rangeHeaders, cache, signal: options.signal });
    const rangeBytes = rangeResponse?.ok ? await readProbeBytes(rangeResponse, Number(options.byteLimit || 16)) : 0;
    const rangeOk = rangeResponse?.status === 206 && rangeBytes > 0;
    if (rangeOk) {
      return buildReport({ path, url, method: "GET_RANGE", response: rangeResponse, bytesRead: rangeBytes, ok: true });
    }
    if (rangeResponse?.status === 200 && rangeBytes > 0) {
      return buildReport({ path, url, method: "GET_RANGE_AS_200", response: rangeResponse, bytesRead: rangeBytes, ok: true });
    }
  } catch (error) {
    rangeResponse = { status: 0, headers: new Map(), error };
  }

  let getResponse = null;
  try {
    getResponse = await fetchImpl(url.href, { method: "GET", cache, signal: options.signal });
    const getBytes = getResponse?.ok ? await readProbeBytes(getResponse, Number(options.byteLimit || 16)) : 0;
    if (getResponse?.ok && getBytes > 0) {
      return buildReport({ path, url, method: "GET_BODY", response: getResponse, bytesRead: getBytes, ok: true });
    }
    return buildReport({
      path,
      url,
      method: "GET_BODY",
      response: getResponse,
      bytesRead: getBytes,
      ok: false,
      failureReason: `asset_probe_failed:${url.pathname}:${getResponse?.status || 0}:${getBytes}`
    });
  } catch (error) {
    return buildReport({
      path,
      url,
      method: "GET_BODY",
      response: getResponse,
      bytesRead: 0,
      ok: false,
      failureReason: error?.message || `asset_probe_failed:${url.pathname}:0:0`
    });
  }
}
