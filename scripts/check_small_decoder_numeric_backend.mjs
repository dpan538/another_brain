#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const REPORT_PATH = "artifacts/training_os/small_decoder_pilot/r25m/r25m_numeric_backend_report.json";

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
  const notes = [
    "Detection uses only local Python imports and does not install packages.",
    "R25M prefers an already installed torch backend, then an already installed numpy fallback.",
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
    await writeJson(REPORT_PATH, output);
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
    await writeJson(REPORT_PATH, output);
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
      "R25M may pass in documented blocked mode when no numeric backend is available."
    ]
  };
  await writeJson(REPORT_PATH, output);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
