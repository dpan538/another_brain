#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createBrowserInferenceAdapter } from "../web/browser_inference_adapters.js";
import { detectBrowserInferenceProfile } from "../web/webgpu_capability.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = resolve(ROOT, "artifacts/training_os/browser_inference_profile_report.json");

async function evalProfile(runtimeProfile) {
  const capabilities = await detectBrowserInferenceProfile({ runtimeProfile, preferWebGpu: true });
  const adapter = await createBrowserInferenceAdapter({ runtimeProfile, preferWebGpu: true, capabilities });
  const classify = await adapter.classify({ query: "夏目漱石和川端康成差在哪？" });
  const embed = await adapter.embed(["夏目漱石", "川端康成", "日本文学"]);
  const rerank = await adapter.rerank("川端康成", [
    { id: "music", text: "Chinese-language popular music metadata" },
    { id: "literature", text: "Kawabata Yasunari Japanese literature metadata" }
  ]);
  const verifySafe = await adapter.verify({ draft: "可以比较美学、时代和叙事距离。" });
  const verifyRisk = await adapter.verify({ draft: "完整歌词和 /Users/example/private.txt" });
  const metrics = adapter.metrics();
  await adapter.dispose();
  return {
    runtimeProfile,
    capabilities,
    adapterBackend: metrics.backend,
    metrics,
    classify,
    embedVectorCount: embed.vectors?.length || 0,
    embedVectorDimension: embed.vectors?.[0]?.length || 0,
    rerankTopId: rerank.ranked?.[0]?.candidate?.id || "",
    verifySafe,
    verifyRisk
  };
}

async function main() {
  const profiles = [];
  for (const runtimeProfile of ["lite", "standard", "full", "personal_200m"]) {
    profiles.push(await evalProfile(runtimeProfile));
  }
  const failures = [];
  for (const profile of profiles) {
    if (!["wasm", "webgpu", "none"].includes(profile.adapterBackend)) failures.push({ code: "unknown_backend", runtimeProfile: profile.runtimeProfile });
    if (profile.metrics.cloudCalls !== 0) failures.push({ code: "cloud_call_detected", runtimeProfile: profile.runtimeProfile });
    if (profile.adapterBackend === "none") failures.push({ code: "no_local_backend", runtimeProfile: profile.runtimeProfile });
    if (profile.classify.ok !== true) failures.push({ code: "classify_failed", runtimeProfile: profile.runtimeProfile });
    if (profile.embedVectorCount !== 3 || profile.embedVectorDimension <= 0) failures.push({ code: "embed_failed", runtimeProfile: profile.runtimeProfile });
    if (profile.rerankTopId !== "literature") failures.push({ code: "rerank_failed", runtimeProfile: profile.runtimeProfile, actual: profile.rerankTopId });
    if (profile.verifySafe.verdict !== "accept") failures.push({ code: "safe_verify_rejected", runtimeProfile: profile.runtimeProfile });
    if (profile.verifyRisk.verdict !== "reject") failures.push({ code: "risk_verify_accepted", runtimeProfile: profile.runtimeProfile });
    if (/personal_200m|full/.test(profile.runtimeProfile) && !profile.capabilities.webgpu.available && profile.capabilities.recommendedProfile !== "standard") {
      failures.push({ code: "missing_standard_fallback", runtimeProfile: profile.runtimeProfile });
    }
  }
  const report = {
    ok: failures.length === 0,
    profiles,
    summary: {
      evaluatedProfiles: profiles.length,
      webgpuAvailable: profiles.some((profile) => profile.capabilities.webgpu.available),
      wasmFallbackAvailable: profiles.some((profile) => profile.adapterBackend === "wasm"),
      cloudCalls: profiles.reduce((sum, profile) => sum + (profile.metrics.cloudCalls || 0), 0)
    },
    failures
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
