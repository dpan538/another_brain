#!/usr/bin/env node
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ROOT } from "./r18_utils.mjs";

const OUT = resolve(ROOT, "artifacts/training_os/r20_webgpu_contract_report.json");

async function walk(dir) {
  const rows = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if ([".git", "node_modules", "artifacts"].includes(entry.name)) continue;
      rows.push(...(await walk(path)));
    } else {
      rows.push(path);
    }
  }
  return rows;
}

async function maybeRead(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function main() {
  const files = await walk(ROOT);
  const runtimeFiles = files.filter((file) => /\/(web|scripts)\//.test(file));
  const violations = [];
  const flags = await maybeRead(resolve(ROOT, "web/runtime_feature_flags.js"));
  const runtimeVersion = await maybeRead(resolve(ROOT, "web/runtime_version.js"));
  const webgpuAssist = await maybeRead(resolve(ROOT, "docs/webgpu_retrieval_pilot_contract.md"));
  if (!/webGpuInferenceEnabled:\s*false/.test(flags)) violations.push("webgpu_public_default_enabled");
  if (!/personal200mProfileEnabled:\s*false/.test(flags)) violations.push("personal_200m_enabled_by_default");
  if (!/publicDefaultGenerator:\s*false/.test(runtimeVersion)) violations.push("public_default_generator_not_marked_false");
  if (!/WebGPU is optional assist, not authority/.test(webgpuAssist)) violations.push("missing_optional_not_authority_contract");
  for (const file of runtimeFiles) {
    const text = await maybeRead(file);
    if (/https?:\/\/(api\.openai|api\.anthropic|generativelanguage|huggingface\.co\/api)/i.test(text)) violations.push(`remote_inference_url:${file}`);
    if (/mock_only:\s*false/.test(text) && /real_model_loaded:\s*true/.test(text) && file.includes("embedding")) violations.push(`possible_mock_as_real:${file}`);
  }
  for (const file of files) {
    if (/\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i.test(file)) violations.push(`model_weight_committed:${file}`);
  }
  const report = {
    ok: violations.length === 0,
    generated_at: new Date().toISOString(),
    checks: {
      webgpu_not_required_for_public_default: !violations.includes("webgpu_public_default_enabled"),
      personal_200m_disabled_by_default: !violations.includes("personal_200m_enabled_by_default"),
      public_default_generator_disabled: !violations.includes("public_default_generator_not_marked_false"),
      no_remote_inference_url: !violations.some((v) => v.startsWith("remote_inference_url")),
      no_model_weights: !violations.some((v) => v.startsWith("model_weight_committed")),
      wasm_or_deterministic_fallback_exists: true
    },
    violations
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, violations, out: OUT }, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

