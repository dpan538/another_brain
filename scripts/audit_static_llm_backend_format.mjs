#!/usr/bin/env node
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

import { discoverStaticLlmArtifacts } from "./discover_static_llm_artifacts.mjs";
import { inspectArtifactDirectory } from "./static_llm_artifact_utils.mjs";

function parseArgs(argv) {
  const args = { dir: "", candidate: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dir") args.dir = argv[++index];
    else if (arg === "--candidate") args.candidate = argv[++index];
  }
  return args;
}

function classifyFormat(inspection) {
  const files = inspection.files || [];
  const names = files.map((file) => file.relative_path.toLowerCase());
  const metadata = inspection.metadata || {};
  const conversionTool = String(metadata.conversion_tool || "").toLowerCase();
  const tokenizerType = String(metadata.tokenizer_type || "").toLowerCase();
  const hasFixture = names.some((name) => name.endsWith(".fixture"));
  const hasSafetensors = names.some((name) => name.endsWith(".safetensors"));
  const hasPt = names.some((name) => /\.(pt|pth|ckpt|bin)$/.test(name));
  const hasGguf = names.some((name) => name.endsWith(".gguf"));
  const hasOnnx = names.some((name) => name.endsWith(".onnx"));
  const hasWasm = names.some((name) => name.endsWith(".wasm"));
  const hasMlc = names.some((name) => /mlc|ndarray-cache|params_shard/.test(name)) || /mlc|webllm/.test(conversionTool);
  const hasTransformersJs = names.some((name) => /onnx|tokenizer\.json|tokenizer_config\.json/.test(name)) && /transformers|onnx/.test(conversionTool + " " + tokenizerType);

  if (hasFixture) {
    return {
      format: "fixture",
      backend_supported_now: true,
      first_token_possible_now: true,
      required_conversion: [],
      risks: ["fixture_is_not_production_model_performance"]
    };
  }
  if (hasMlc) {
    return {
      format: "webllm_mlc_candidate",
      backend_supported_now: false,
      first_token_possible_now: false,
      required_conversion: ["bind_real_webgpu_or_webllm_backend", "verify_browser_runtime_without_external_cdn"],
      risks: ["R25D backend is still stub-only for production"]
    };
  }
  if (hasTransformersJs || hasOnnx) {
    return {
      format: "transformers_js_candidate",
      backend_supported_now: false,
      first_token_possible_now: false,
      required_conversion: ["bind_transformers_js_or_webgpu_backend_locally", "verify_decoder_generation_support"],
      risks: ["ONNX decoder artifacts may exceed browser memory or require unsupported operators"]
    };
  }
  if (hasWasm) {
    return {
      format: "wasm_runtime_candidate",
      backend_supported_now: false,
      first_token_possible_now: false,
      required_conversion: ["bind_local_wasm_runtime", "prove no server_or_cdn_runtime_dependency"],
      risks: ["WASM runtime presence alone does not prove decoder generation support"]
    };
  }
  if (hasGguf) {
    return {
      format: "unsupported_gguf_for_browser",
      backend_supported_now: false,
      first_token_possible_now: false,
      required_conversion: ["provide approved browser GGUF runtime or convert to supported static browser format"],
      risks: ["GGUF is not automatically browser-runnable in this repo"]
    };
  }
  if (hasSafetensors || hasPt) {
    return {
      format: "unsupported_raw_hf_checkpoint",
      backend_supported_now: false,
      first_token_possible_now: false,
      required_conversion: ["convert raw checkpoint to approved static browser decoder artifact"],
      risks: ["Raw Hugging Face checkpoint files are not directly runnable by the R25D browser backend"]
    };
  }
  return {
    format: "unknown",
    backend_supported_now: false,
    first_token_possible_now: false,
    required_conversion: ["supply reviewed browser-ready decoder artifact metadata"],
    risks: ["Artifact format could not be classified"]
  };
}

export async function auditStaticLlmBackendFormat(options = {}) {
  const discovery = await discoverStaticLlmArtifacts();
  const targets = [];
  if (options.dir) {
    targets.push({ dir: options.dir, candidate_id: basename(options.dir) });
  } else if (options.candidate) {
    const found = discovery.candidates.find((candidate) => candidate.candidate_id === options.candidate || basename(candidate.dir) === options.candidate);
    if (found) targets.push(found);
  } else {
    targets.push(...discovery.candidates);
  }

  if (!targets.length) {
    return {
      ok: true,
      blocked: true,
      blocked_reason: discovery.blocked_reason || "candidate_not_found",
      candidate_count: discovery.candidate_count,
      candidate_id: "",
      format: "none",
      backend_supported_now: false,
      first_token_possible_now: false,
      required_conversion: ["place reviewed decoder artifact under static_llm/inbox/<candidate>"],
      risks: []
    };
  }

  const candidates = [];
  const failures = [];
  for (const target of targets) {
    const inspection = await inspectArtifactDirectory(target.dir);
    const classification = classifyFormat(inspection);
    const report = {
      ok: inspection.ok,
      candidate_id: target.candidate_id || basename(target.dir),
      dir: inspection.dir,
      inspection_ok: inspection.ok,
      inspection_failures: inspection.failures,
      ...classification
    };
    if (!inspection.ok) failures.push({ candidate_id: report.candidate_id, failures: inspection.failures });
    candidates.push(report);
  }

  return {
    ok: failures.length === 0,
    blocked: false,
    candidate_count: candidates.length,
    candidate_id: candidates[0]?.candidate_id || "",
    format: candidates[0]?.format || "none",
    backend_supported_now: candidates[0]?.backend_supported_now || false,
    first_token_possible_now: candidates[0]?.first_token_possible_now || false,
    required_conversion: candidates[0]?.required_conversion || [],
    risks: candidates[0]?.risks || [],
    candidates,
    failures
  };
}

async function main() {
  const report = await auditStaticLlmBackendFormat(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
