import fs from "node:fs/promises";
import path from "node:path";

const RUNTIME_DIRS = ["web"];
const EXTRA_RUNTIME_FILES = ["scripts/dialog_runtime.mjs"];
const USER_FILES = [
  "training/llm_corpus/r26e_user_answered_train.jsonl",
  "training/llm_corpus/r26e_user_answered_dev.jsonl",
  "training/llm_corpus/r26e_user_answered_heldout.jsonl",
  "training/llm_corpus/r26g_user_answered_train.jsonl",
  "training/llm_corpus/r26g_user_answered_dev.jsonl",
  "training/llm_corpus/r26g_user_answered_heldout.jsonl"
];
const EVAL = "evals/r27a_p0_reasoning_rag_value/prompts.jsonl";
const TEACHER = "training/current/teacher_probe_pack.r27a.jsonl";
const TEACHER_OUTPUT = "private_sources/teacher_probes/r27a_teacher_outputs.jsonl";

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
}

async function readJsonl(file) {
  const text = await fs.readFile(file, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function meaningful(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

async function main() {
  const runtimeFiles = [...(await Promise.all(RUNTIME_DIRS.map(walk))).flat(), ...EXTRA_RUNTIME_FILES].filter((file) => /\.(js|mjs)$/.test(file));
  const runtimeTexts = new Map();
  for (const file of runtimeFiles) runtimeTexts.set(file, await fs.readFile(file, "utf8"));
  const failures = [];

  const targetAnswers = [];
  for (const file of USER_FILES) {
    for (const row of await readJsonl(file)) {
      const answer = meaningful(row.target_answer);
      if (answer.length >= 32) targetAnswers.push({ sample_id: row.sample_id, answer });
    }
  }
  for (const { sample_id, answer } of targetAnswers) {
    for (const [file, text] of runtimeTexts) {
      if (text.includes(answer)) failures.push({ code: "target_answer_copied_to_runtime", sample_id, file });
    }
  }

  for (const row of await readJsonl(EVAL)) {
    const prompt = meaningful(row.user_prompt);
    if (prompt.length < 24) continue;
    for (const [file, text] of runtimeTexts) {
      if (text.includes(prompt)) failures.push({ code: "eval_prompt_copied_to_runtime", prompt_id: row.prompt_id, file });
    }
  }

  for (const row of await readJsonl(TEACHER)) {
    const prompt = meaningful(row.prompt);
    if (prompt.length < 24) continue;
    for (const [file, text] of runtimeTexts) {
      if (text.includes(prompt)) failures.push({ code: "teacher_probe_copied_to_runtime", probe_id: row.probe_id, file });
    }
  }

  try {
    await fs.access(TEACHER_OUTPUT);
    failures.push({ code: "teacher_output_file_present_in_private_sources", file: TEACHER_OUTPUT, note: "must remain uncommitted and review-gated" });
  } catch {}

  for (const [file, text] of runtimeTexts) {
    if (/teacher_output_used_directly:\s*true|training_allowed:\s*true|final answer bank|answer_bank\s*=\s*\[/.test(text)) {
      failures.push({ code: "runtime_answer_bank_or_teacher_leak_marker", file });
    }
  }

  const report = {
    ok: failures.length === 0,
    runtime_files_checked: runtimeFiles.length,
    target_answers_checked: targetAnswers.length,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
