#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT_DIR = "artifacts/training_os/small_decoder_pilot/r25m/";
const DEFAULT_PREFIX = "r25m";

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function normalizedDir(path) {
  return path.endsWith("/") ? path : `${path}/`;
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function checkPythonModule(moduleName, snippet, timeoutMs = 90000) {
  const code = [
    "import importlib.util, json",
    `name=${JSON.stringify(moduleName)}`,
    "spec=importlib.util.find_spec(name)",
    "if spec is None:",
    "    print(json.dumps({'available': False, 'module': name}))",
    "    raise SystemExit(3)",
    snippet
  ].join("\n");
  try {
    const { stdout } = await execFileAsync("python3", ["-c", code], {
      cwd: ROOT,
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024
    });
    return JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
  } catch (error) {
    const text = String(error.stdout || "").trim().split(/\r?\n/).at(-1);
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return { available: false, module: moduleName, error: String(error.message || error) };
      }
    }
    return { available: false, module: moduleName, error: String(error.message || error) };
  }
}

async function main() {
  const outputDir = normalizedDir(argValue("--output-dir", DEFAULT_OUTPUT_DIR));
  const prefix = argValue("--prefix", DEFAULT_PREFIX);
  const reportPath = `${outputDir}${prefix}_numeric_backend_report.json`;
  const notes = [
    "Detection uses only local Python imports and does not install packages.",
    "The small decoder pilot prefers an already installed torch backend, then an already installed numpy fallback.",
    "No network access, package registry, remote model, or external inference service is used."
  ];
  const torch = await checkPythonModule("torch", [
    "import torch",
    "print(json.dumps({",
    "  'available': True,",
    "  'module': name,",
    "  'version': getattr(torch, '__version__', 'unknown'),",
    "  'cuda_available': bool(getattr(torch, 'cuda', None) and torch.cuda.is_available())",
    "}))"
  ].join("\n"), 120000);
  if (torch.available) {
    const output = {
      ok: true,
      backend: "python_torch",
      can_run_small_pilot: true,
      reason: "python_torch_available_locally",
      backend_details: torch,
      notes
    };
    await writeJson(reportPath, output);
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const numpy = await checkPythonModule("numpy", [
    "import numpy",
    "print(json.dumps({",
    "  'available': True,",
    "  'module': name,",
    "  'version': getattr(numpy, '__version__', 'unknown')",
    "}))"
  ].join("\n"), 90000);
  if (numpy.available) {
    const output = {
      ok: true,
      backend: "python_numpy",
      can_run_small_pilot: true,
      reason: "python_numpy_available_locally_for_documented_decoder_like_fallback",
      backend_details: numpy,
      notes: [
        ...notes,
        "The numpy path is a decoder-like fallback, not a transformer equivalence claim."
      ]
    };
    await writeJson(reportPath, output);
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const output = {
    ok: true,
    backend: "unavailable",
    can_run_small_pilot: false,
    reason: "no_local_torch_or_numpy_backend_available",
    backend_details: { torch, numpy },
    notes: [
      ...notes,
      "A small decoder pilot may pass in documented blocked mode when no numeric backend is available."
    ]
  };
  await writeJson(reportPath, output);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
