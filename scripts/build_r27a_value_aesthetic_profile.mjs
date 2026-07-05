import fs from "node:fs/promises";
import path from "node:path";

const OUT = "training/current/value_aesthetic_profile.r27a.json";
const DOC = "docs/R27A_VALUE_AESTHETIC_PROFILE_SUMMARY.md";
const REPORT = "artifacts/training_os/r27a_architecture/r27a_value_aesthetic_profile_report.json";
const FILES = [
  "training/llm_corpus/r26e_user_answered_train.jsonl",
  "training/llm_corpus/r26e_user_answered_dev.jsonl",
  "training/llm_corpus/r26e_user_answered_heldout.jsonl",
  "training/llm_corpus/r26g_user_answered_train.jsonl",
  "training/llm_corpus/r26g_user_answered_dev.jsonl",
  "training/llm_corpus/r26g_user_answered_heldout.jsonl"
];

async function readJsonl(file) {
  const text = await fs.readFile(file, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function bump(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function countRows(rows, predicate) {
  return rows.filter(predicate).length;
}

async function main() {
  const rows = [];
  for (const file of FILES) rows.push(...await readJsonl(file));
  const answerModes = new Map();
  const evidencePolicies = new Map();
  const modules = new Map();
  for (const row of rows) {
    bump(answerModes, row.answer_mode || "unknown");
    bump(evidencePolicies, row.evidence_policy || "unknown");
    bump(modules, row.module || "unknown");
  }

  const dimensions = {
    non_assistant_voice: {
      rows: rows.length,
      signal: "answer_as=user_self with compressed, boundary-aware modes instead of service persona"
    },
    unsupported_challenge_resistance: {
      rows: countRows(rows, (row) => row.evidence_policy === "unsupported_challenge" || row.answer_mode === "pressure_resistance"),
      signal: "do not concede correction without evidence"
    },
    refusal_boundary: {
      rows: countRows(rows, (row) => row.answer_mode === "refuse" || row.valid_nonanswer === true),
      signal: "refusal can be a valid answer shape"
    },
    abstract_reframe: {
      rows: countRows(rows, (row) => row.answer_mode === "abstract_reframe" || row.candidate_type === "weird_question_abstraction"),
      signal: "answer the abstraction instead of forcing a helper procedure"
    },
    aesthetic_judgment: {
      rows: countRows(rows, (row) => /审美|风格|表达|克制|美/.test(`${row.module || ""} ${row.question || ""}`)),
      signal: "treat taste as situated judgment, not universal fact"
    },
    language_meaning: {
      rows: countRows(rows, (row) => /语言|意义|表达|问题|名字|记忆/.test(`${row.module || ""} ${row.question || ""}`)),
      signal: "meaning can be compressed, relational, and non-procedural"
    },
    value_judgment: {
      rows: countRows(rows, (row) => row.evidence_policy === "value_disagreement" || /价值|判断|应该|值得/.test(row.question || "")),
      signal: "state bounded stance without pretending neutral consensus"
    },
    compression_judgment: {
      rows: countRows(rows, (row) => row.answer_mode === "compressed_judgment"),
      signal: "short answer is valid only when it preserves the judgment axis"
    },
    evidence_based_correction: {
      rows: countRows(rows, (row) => row.evidence_policy === "unsupported_challenge"),
      signal: "correction requires evidence; absence of evidence is not defeat"
    },
    memory_uncertain_but_not_wrong: {
      rows: countRows(rows, (row) => /记忆|不像|真实|失真/.test(`${row.module || ""} ${row.question || ""}`)),
      signal: "memory uncertainty is not automatic confession of wrongness"
    }
  };

  const profile = {
    profile_id: "r27a_value_aesthetic_profile",
    phase: "R27A",
    source: "user_answered_corpus",
    source_files: FILES,
    row_count: rows.length,
    contains_private_data: false,
    answer_mode_counts: Object.fromEntries(answerModes),
    evidence_policy_counts: Object.fromEntries(evidencePolicies),
    module_counts: Object.fromEntries([...modules.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)),
    dimensions,
    allowed_answer_modes: ["direct_answer", "partial_answer", "compressed_judgment", "abstract_reframe", "pressure_resistance", "refuse"],
    forbidden_answer_modes: ["generic_assistant_service", "unsupported_concession", "chain_of_thought", "raw_private_data"],
    style_anchors: ["compressed", "bounded", "answer-as-user", "non-service voice", "evidence-aware"],
    value_anchors: ["boundary before helpfulness", "evidence before correction", "stance without universalizing", "abstract relation over procedure"],
    training_allowed_now: false,
    ok: true
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.mkdir(path.dirname(REPORT), { recursive: true });
  await fs.writeFile(OUT, `${JSON.stringify(profile, null, 2)}\n`);
  await fs.writeFile(REPORT, `${JSON.stringify({ ok: true, row_count: rows.length, dimensions }, null, 2)}\n`);
  await fs.writeFile(DOC, `# R27A Value/Aesthetic Profile Summary

R27A extracted an aggregate value/aesthetic profile from reviewed R26E/R26G user-answer corpus metadata. It does not include raw private data, chain-of-thought, teacher output, or copied long target answers.

## Dimensions

${Object.entries(dimensions).map(([key, value]) => `- ${key}: ${value.rows} rows; ${value.signal}`).join("\n")}

Allowed answer modes: ${profile.allowed_answer_modes.join(", ")}.

This profile is a future packet source for answer-as-user drafts. It is not a new corpus promotion and it does not approve training.
`);

  console.log(JSON.stringify({ ok: true, out: OUT, row_count: rows.length, dimensions: Object.keys(dimensions) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
