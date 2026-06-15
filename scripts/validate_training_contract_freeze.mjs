#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = resolve(ROOT, "identity_pack/training_contract_freeze.manifest.json");
const OUT = resolve(ROOT, "artifacts/training_os/training_contract_freeze_report.json");
const execFileAsync = promisify(execFile);

const REQUIRED_PACKAGE_SCRIPTS = {
  "eval:r9-regression": "node scripts/eval_r9_regression.mjs",
  "eval:r9-regression:strict": "node scripts/eval_r9_regression.mjs --strict",
  "eval:persona-contracts": "node scripts/eval_persona_contracts.mjs",
  "eval:persona-contracts:strict": "node scripts/eval_persona_contracts.mjs --strict",
  "check:persona-privacy": "node scripts/validate_persona_privacy.mjs",
  "check:persona-overfit": "node scripts/validate_persona_overfit.mjs",
  "check:personal-facts": "node scripts/validate_personal_facts.mjs",
  "check:training-contract-freeze": "node scripts/validate_training_contract_freeze.mjs",
  "check:release": "bash scripts/check_release.sh"
};

const REQUIRED_PRETRAINING_COMMANDS = [
  "npm run check:training-contract-freeze",
  "npm run eval:r9-regression",
  "npm run eval:persona-contracts:strict",
  "npm run check:persona-privacy",
  "npm run check:persona-overfit",
  "npm run check:personal-facts",
  "npm run check:release"
];

const REQUIRED_ANCHORS = [
  {
    file: "docs/training_contract_freeze.md",
    anchors: [
      "Only strengthening changes are allowed",
      "Training is not allowed until the freeze validator passes",
      "Do not use script edits to make a failure disappear."
    ]
  },
  {
    file: "docs/personal_fact_card_schema.md",
    anchors: ["A vague answer is a failure when it dodges an approved factual question", "approved fact -> direct answer"]
  },
  {
    file: "docs/persona_ingestion_policy.md",
    anchors: ["raw material does not become persona", "Direct Personal Fact Policy"]
  },
  {
    file: "docs/persona_overfit_taxonomy.md",
    anchors: ["Privacy/source leaks are release blockers", "style similarity"]
  },
  {
    file: "docs/training_failure_taxonomy.md",
    anchors: ["No answer-bank expansion", "route collapse"]
  }
];

const FORBIDDEN_COMMITTED_PATTERNS = [
  { name: "raw_pdf", pattern: /\.pdf$/i },
  { name: "docx_report", pattern: /\.docx$/i },
  { name: "raw_text_cache", pattern: /(^|\/)(raw_text|raw_source|source_text|text_cache|source_cache)[^/]*\.(json|jsonl|txt|md)$/i },
  { name: "private_manifest", pattern: /(^|\/)(private|local)[^/]*manifest[^/]*\.(json|jsonl|md)$/i }
];

const FORBIDDEN_PROTECTED_PATTERNS = [
  { name: "protected_raw_pdf", pattern: /\.pdf$/i },
  { name: "protected_docx_report", pattern: /\.docx$/i }
];

function parseArgs(argv) {
  for (const item of argv) {
    if (item === "--help" || item === "-h") {
      console.log("Usage: node scripts/validate_training_contract_freeze.mjs");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${item}`);
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function readText(relPath) {
  return readFile(resolve(ROOT, relPath), "utf8");
}

async function trackedFiles() {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files"], { cwd: ROOT });
    return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch (error) {
    return [{ git_error: error.message }];
  }
}

async function main() {
  parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const failures = [];
  const checked = [];

  if (manifest.change_policy !== "strengthen_only") {
    failures.push({ check: "change_policy", expected: "strengthen_only", actual: manifest.change_policy });
  }

  const allowedCommands = Array.isArray(manifest.training_allowed_only_after) ? manifest.training_allowed_only_after : [];
  for (const command of REQUIRED_PRETRAINING_COMMANDS) {
    if (!allowedCommands.includes(command)) {
      failures.push({ check: "pretraining_gate_command_missing", command });
    }
  }

  for (const entry of manifest.protected_files || []) {
    for (const { name, pattern } of FORBIDDEN_PROTECTED_PATTERNS) {
      if (pattern.test(entry.path || "")) {
        failures.push({ check: "forbidden_protected_artifact", path: entry.path, pattern: name });
      }
    }
    try {
      const content = await readFile(resolve(ROOT, entry.path));
      const actual = sha256(content);
      checked.push({ path: entry.path, sha256: actual });
      if (actual !== entry.sha256) {
        failures.push({ check: "hash_mismatch", path: entry.path, expected: entry.sha256, actual });
      }
    } catch (error) {
      failures.push({ check: "missing_protected_file", path: entry.path, error: error.message });
    }
  }

  const packageJson = JSON.parse(await readText("package.json"));
  for (const [name, command] of Object.entries(REQUIRED_PACKAGE_SCRIPTS)) {
    if (packageJson.scripts?.[name] !== command) {
      failures.push({
        check: "package_script_mismatch",
        script: name,
        expected: command,
        actual: packageJson.scripts?.[name] || ""
      });
    }
  }

  for (const command of REQUIRED_PRETRAINING_COMMANDS) {
    const scriptName = command.replace("npm run ", "");
    if (!(scriptName in (packageJson.scripts || {}))) {
      failures.push({ check: "pretraining_command_not_exposed_by_package", command });
    }
  }

  for (const item of REQUIRED_ANCHORS) {
    let content = "";
    try {
      content = await readText(item.file);
    } catch (error) {
      failures.push({ check: "anchor_file_missing", file: item.file, error: error.message });
      continue;
    }
    for (const anchor of item.anchors) {
      if (!content.includes(anchor)) {
        failures.push({ check: "required_anchor_missing", file: item.file, anchor });
      }
    }
  }

  const tracked = await trackedFiles();
  if (tracked.length === 1 && tracked[0].git_error) {
    failures.push({ check: "git_ls_files_failed", error: tracked[0].git_error });
  } else {
    for (const path of tracked) {
      for (const { name, pattern } of FORBIDDEN_COMMITTED_PATTERNS) {
        if (pattern.test(path)) {
          failures.push({ check: "forbidden_tracked_artifact", path, pattern: name });
        }
      }
    }
  }

  const report = {
    ok: failures.length === 0,
    generated_at: new Date().toISOString(),
    manifest: MANIFEST,
    summary: {
      protected_files: manifest.protected_files?.length || 0,
      checked_files: checked.length,
      pretraining_gate_commands: REQUIRED_PRETRAINING_COMMANDS.length,
      failures: failures.length,
      report_path: OUT
    },
    failures,
    checked
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(report.summary, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
