#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const REPORT_PATH = "artifacts/training_os/personal_inventory/r25ae/personal_corpus_signal_profile.json";
const SUMMARY_PATH = "docs/R25AE_PERSONAL_CORPUS_SIGNAL_SUMMARY.md";

const ANSWER_FIELDS = [
  "target_answer",
  "answer",
  "answers",
  "expected_answer",
  "rejected_answers",
  "expected_behaviors",
  "expected_behavior",
  "constraints",
  "scoring_rubric",
  "messages",
  "turns"
];

const PERSONAL_SIGNAL_RULES = {
  project_continuation: /project_continuation|continue|continuity|resume|interruption|prior project|r24|r25|project|继续|中断|项目/i,
  repair_after_weak_answer: /repair_after_weak_answer|repair|weak answer|revise|retry|improve|regression|恢复|修复|改进|弱答/i,
  local_first_static_browser_reasoning: /local_first_static_browser_reasoning|local-first|local first|static browser|same-origin|browser-static|no-backend|no backend|offline|本地|静态浏览器/i,
  style_preference: /style_preference|style variant|tone|phrasing|preference|short_direct|warm|concise|personal tone|风格|语气|偏好/i,
  tool_status_honesty: /tool_status_honesty|tool status|runtime status|honest|uncertainty|cannot|not available|no training run|status|工具|状态|如实/i,
  bounded_judgment: /bounded_judgment|bounded|boundary|approval|approved|blocked|phase_4|fresh approval|pause|scope|限制|边界|审批|暂停/i
};

function assertRepoPath(repoPath) {
  const abs = resolve(ROOT, repoPath);
  if (!(abs === ROOT || abs.startsWith(`${ROOT}${sep}`))) throw new Error(`Refusing path outside repo: ${repoPath}`);
  return abs;
}

function toRepoPath(absPath) {
  return relative(ROOT, absPath).split(sep).join("/");
}

async function walkFiles(repoDir, predicate) {
  const out = [];
  async function visit(absDir) {
    const entries = await readdir(absDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const abs = resolve(absDir, entry.name);
      const repoPath = toRepoPath(abs);
      if (entry.isDirectory()) {
        await visit(abs);
      } else if (entry.isFile() && (!predicate || predicate(repoPath))) {
        out.push(repoPath);
      }
    }
  }
  await visit(assertRepoPath(repoDir));
  return out;
}

function addDist(dist, key, amount = 1) {
  const normalized = key || "unknown";
  dist[normalized] = (dist[normalized] || 0) + amount;
}

function textFromValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textFromValue).join(" ");
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !/raw|secret|token/i.test(key))
      .map(([, item]) => textFromValue(item))
      .join(" ");
  }
  return "";
}

function classifyLanguage(row) {
  const declared = String(row.language || row.lang || "").toLowerCase();
  if (/^zh|chinese|cn/.test(declared)) return "zh";
  if (/mixed|zh[-_ ]?en|bilingual/.test(declared)) return "mixed";
  if (/^en/.test(declared)) return "en";
  const text = textFromValue({
    user_goal: row.user_goal,
    target_answer: row.target_answer,
    messages: row.messages,
    turns: row.turns,
    constraints: row.constraints,
    expected_behaviors: row.expected_behaviors
  });
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (cjk > 0 && latin > 0) return "mixed";
  if (cjk > 0) return "zh";
  if (latin > 0) return "en";
  return "unknown";
}

function inferSplit(repoPath, row) {
  const split = String(row.split || "").toLowerCase();
  if (split) return split;
  const basename = repoPath.split("/").pop().toLowerCase();
  if (/heldout/.test(basename)) return "heldout";
  if (/dev|valid/.test(basename)) return "dev";
  if (/train|seed/.test(basename)) return basename.includes("seed") ? "seed" : "train";
  return "unspecified";
}

function sourceKind(repoPath) {
  if (repoPath.startsWith("training/llm_corpus/")) return "training_corpus";
  if (repoPath.startsWith("training/long_horizon/")) return "long_horizon";
  if (repoPath.startsWith("identity_pack/")) return "identity_pack";
  if (repoPath.startsWith("knowledge_sources/")) return "knowledge_sources";
  if (repoPath.startsWith("evals/")) return "eval_only";
  return "other";
}

function classifyProvenance(row, source) {
  const raw = [
    row.provenance?.source_type,
    row.source_type,
    row.provenance?.generator,
    row.generator,
    row.provenance?.license_or_permission,
    row.review_status,
    ...(Array.isArray(row.policy_tags) ? row.policy_tags : [])
  ].filter(Boolean).join(" ").toLowerCase();
  if (source === "eval_only") return "eval_fixture";
  if (/template.generated|template_generated|generator|deterministic/.test(raw)) return "template_generated";
  if (/human_seed|seed_reviewed|project-authored seed/.test(raw)) return "human_seed";
  if (/repo_derived|repo-derived|derived/.test(raw)) return "repo_derived";
  if (/project-authored|project_authored|manual_seed|approved/.test(raw)) return "project_authored";
  return "unknown";
}

function countAnswerLike(field, value) {
  if (value == null) return 0;
  if (typeof value === "string") return value.trim() ? 1 : 0;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countAnswerLike(field, item), 0);
  if (typeof value === "object") {
    if (field === "messages" || field === "turns") {
      let count = 0;
      for (const item of Array.isArray(value) ? value : Object.values(value)) count += countAnswerLike(field, item);
      if (typeof value.role === "string" && /assistant|answer|expected/i.test(value.role)) {
        count += textFromValue(value.content || value.text || value.answer).trim() ? 1 : 0;
      }
      return count;
    }
    if (field === "scoring_rubric") return Object.keys(value).length > 0 ? 1 : 0;
    return Object.values(value).reduce((sum, item) => sum + countAnswerLike(field, item), 0);
  }
  return 0;
}

async function readRows(repoPath) {
  const text = await readFile(assertRepoPath(repoPath), "utf8");
  const ext = extname(repoPath).toLowerCase();
  const rows = [];
  if (ext === ".jsonl") {
    let lineNumber = 0;
    for (const line of text.split(/\r?\n/)) {
      lineNumber += 1;
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        rows.push({ __parse_error__: true, __line: lineNumber });
      }
    }
    return rows;
  }
  if (ext === ".json") {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.rows)) return parsed.rows;
      if (Array.isArray(parsed.cards)) return parsed.cards;
      return [parsed];
    } catch {
      return [{ __parse_error__: true }];
    }
  }
  return [];
}

function targetHash(row) {
  const target = typeof row.target_answer === "string" ? row.target_answer : "";
  if (!target.trim()) return null;
  return createHash("sha256").update(target.replace(/\s+/g, " ").trim()).digest("hex");
}

function containsPrivateFlag(row) {
  const flags = [
    row.contains_private_data,
    row.provenance?.contains_private_data,
    ...(Array.isArray(row.retrieved_evidence) ? row.retrieved_evidence.map((item) => item?.contains_private_data) : [])
  ];
  if (flags.some((value) => value === true)) return "true";
  if (flags.some((value) => value === false)) return "false";
  return "unknown";
}

async function main() {
  const jsonPredicate = (path) => /\.(jsonl|json)$/i.test(path);
  const files = [
    ...(await walkFiles("training/llm_corpus", (path) => /^training\/llm_corpus\/[^/]+\.jsonl$/i.test(path))),
    ...(await walkFiles("training/long_horizon", (path) => /^training\/long_horizon\/[^/]+\.jsonl$/i.test(path))),
    ...(await walkFiles("identity_pack", jsonPredicate).catch(() => [])),
    ...(await walkFiles("knowledge_sources", jsonPredicate).catch(() => [])),
    ...(await walkFiles("evals", jsonPredicate).catch(() => []))
  ];

  const profile = {
    ok: true,
    report_id: "r25ae_personal_corpus_signal_profile",
    generated_at: new Date().toISOString(),
    training_ran: false,
    corpus_generated: false,
    raw_text_copied_to_tracked_docs: false,
    row_counts_by_source: {},
    row_counts_by_file: {},
    split_counts: {},
    language_counts: {},
    language_counts_by_source: {},
    answer_like_field_counts: Object.fromEntries(ANSWER_FIELDS.map((field) => [field, 0])),
    answer_like_total: 0,
    target_answer_rows: 0,
    rejected_answers_rows: 0,
    rejected_answers_total_items: 0,
    provenance_counts: {
      project_authored: 0,
      template_generated: 0,
      human_seed: 0,
      repo_derived: 0,
      eval_fixture: 0,
      unknown: 0
    },
    provenance_counts_by_source: {},
    review_status_counts: {},
    review_status_counts_by_source: {},
    private_data_flag_counts: {},
    private_data_flag_counts_by_source: {},
    personal_color_signal_counts: Object.fromEntries(Object.keys(PERSONAL_SIGNAL_RULES).map((key) => [key, 0])),
    personal_color_signal_counts_by_source: {},
    duplicate_template_findings: {
      template_generated_rows: 0,
      target_answer_duplicate_groups: 0,
      target_answer_duplicate_rows: 0
    },
    knowledge_sources: {
      row_count: 0,
      aggregate_answer_like_count: 0
    },
    identity_pack: {
      row_count: 0,
      aggregate_answer_like_count: 0
    },
    eval_only: {
      row_count: 0,
      aggregate_answer_like_count: 0
    },
    files_profiled: files
  };

  const targetCounts = new Map();

  for (const file of files) {
    const rows = await readRows(file);
    const source = sourceKind(file);
    profile.row_counts_by_file[file] = rows.length;
    addDist(profile.row_counts_by_source, source, rows.length);

    for (const row of rows) {
      const split = inferSplit(file, row);
      addDist(profile.split_counts, split);
      const language = classifyLanguage(row);
      addDist(profile.language_counts, language);
      profile.language_counts_by_source[source] ||= {};
      addDist(profile.language_counts_by_source[source], language);
      const provenance = classifyProvenance(row, source);
      addDist(profile.provenance_counts, provenance);
      profile.provenance_counts_by_source[source] ||= {};
      addDist(profile.provenance_counts_by_source[source], provenance);
      const reviewStatus = row.review_status || row.provenance?.review_status || "unknown";
      addDist(profile.review_status_counts, reviewStatus);
      profile.review_status_counts_by_source[source] ||= {};
      addDist(profile.review_status_counts_by_source[source], reviewStatus);
      const privateFlag = containsPrivateFlag(row);
      addDist(profile.private_data_flag_counts, privateFlag);
      profile.private_data_flag_counts_by_source[source] ||= {};
      addDist(profile.private_data_flag_counts_by_source[source], privateFlag);

      if (provenance === "template_generated") profile.duplicate_template_findings.template_generated_rows += 1;

      let rowAnswerLike = 0;
      for (const field of ANSWER_FIELDS) {
        const count = countAnswerLike(field, row[field]);
        if (count > 0) {
          profile.answer_like_field_counts[field] += count;
          rowAnswerLike += count;
        }
      }
      profile.answer_like_total += rowAnswerLike;
      if (source === "knowledge_sources") {
        profile.knowledge_sources.row_count += 1;
        profile.knowledge_sources.aggregate_answer_like_count += rowAnswerLike;
      }
      if (source === "identity_pack") {
        profile.identity_pack.row_count += 1;
        profile.identity_pack.aggregate_answer_like_count += rowAnswerLike;
      }
      if (source === "eval_only") {
        profile.eval_only.row_count += 1;
        profile.eval_only.aggregate_answer_like_count += rowAnswerLike;
      }

      if (typeof row.target_answer === "string" && row.target_answer.trim()) {
        profile.target_answer_rows += 1;
        const hash = targetHash(row);
        if (hash) targetCounts.set(hash, (targetCounts.get(hash) || 0) + 1);
      }
      if (Array.isArray(row.rejected_answers) && row.rejected_answers.length > 0) {
        profile.rejected_answers_rows += 1;
        profile.rejected_answers_total_items += row.rejected_answers.length;
      }

      const signalText = textFromValue({
        sample_id: row.sample_id,
        task_id: row.task_id,
        task_family: row.task_family,
        task_type: row.task_type,
        user_goal: row.user_goal,
        constraints: row.constraints,
        expected_behaviors: row.expected_behaviors,
        expected_behavior: row.expected_behavior,
        policy_tags: row.policy_tags,
        target_answer: row.target_answer,
        messages: row.messages,
        turns: row.turns
      });
      for (const [signal, pattern] of Object.entries(PERSONAL_SIGNAL_RULES)) {
        if (pattern.test(signalText)) {
          profile.personal_color_signal_counts[signal] += 1;
          profile.personal_color_signal_counts_by_source[source] ||= Object.fromEntries(Object.keys(PERSONAL_SIGNAL_RULES).map((key) => [key, 0]));
          profile.personal_color_signal_counts_by_source[source][signal] += 1;
        }
      }
    }
  }

  for (const count of targetCounts.values()) {
    if (count > 1) {
      profile.duplicate_template_findings.target_answer_duplicate_groups += 1;
      profile.duplicate_template_findings.target_answer_duplicate_rows += count;
    }
  }

  const trainingRows = Object.entries(profile.row_counts_by_file)
    .filter(([path]) => path.startsWith("training/llm_corpus/"))
    .reduce((sum, [, count]) => sum + count, 0);
  const trainingProvenance = profile.provenance_counts_by_source.training_corpus || {};
  const longHorizonProvenance = profile.provenance_counts_by_source.long_horizon || {};
  const templateRows = trainingProvenance.template_generated || 0;
  const reviewedProjectRows =
    (trainingProvenance.project_authored || 0) +
    (trainingProvenance.human_seed || 0) +
    (trainingProvenance.repo_derived || 0) +
    (longHorizonProvenance.project_authored || 0) +
    (longHorizonProvenance.human_seed || 0) +
    (longHorizonProvenance.repo_derived || 0);
  const trainingSignals = Object.values(profile.personal_color_signal_counts_by_source.training_corpus || {}).reduce((a, b) => a + b, 0);
  profile.current_training_corpus_assessment = {
    training_rows: trainingRows,
    template_generated_rows: templateRows,
    human_seed_rows: (trainingProvenance.human_seed || 0) + (longHorizonProvenance.human_seed || 0),
    project_authored_rows: (trainingProvenance.project_authored || 0) + (longHorizonProvenance.project_authored || 0),
    training_corpus_language_counts: profile.language_counts_by_source.training_corpus || {},
    mostly_templates: trainingRows > 0 && templateRows / trainingRows >= 0.75,
    meaningful_personal_project_specific_material: reviewedProjectRows > 0 || trainingSignals > 0,
    estimated_personal_training_signal_level:
      reviewedProjectRows > 500 && !((trainingRows > 0 && templateRows / trainingRows >= 0.75))
        ? "moderate"
        : reviewedProjectRows > 0 || trainingSignals > 0
          ? "weak"
          : "none"
  };

  await mkdir(dirname(assertRepoPath(REPORT_PATH)), { recursive: true });
  await writeFile(assertRepoPath(REPORT_PATH), `${JSON.stringify(profile, null, 2)}\n`, "utf8");

  const trainingLanguageCounts = profile.language_counts_by_source.training_corpus || {};
  const trainingLanguageTotal = Object.values(trainingLanguageCounts).reduce((sum, count) => sum + count, 0) || 1;
  const languageSummary = ["zh", "mixed", "en", "unknown"]
    .map((key) => `${key}=${trainingLanguageCounts[key] || 0} (${(((trainingLanguageCounts[key] || 0) / trainingLanguageTotal) * 100).toFixed(1)}%)`)
    .join(", ");
  const signalSummary = Object.entries(profile.personal_color_signal_counts)
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");
  const rowsBySplit = Object.entries(profile.split_counts).map(([key, count]) => `${key}=${count}`).join(", ");

  const summary = [
    "# R25AE Personal Corpus Signal Summary",
    "",
    "R25AE profiles existing tracked corpus and fixture surfaces only. It does not train, does not expand corpus, does not use external APIs, and does not copy full answers into tracked docs.",
    "",
    "## Aggregate Counts",
    "",
    `- Rows by source: ${Object.entries(profile.row_counts_by_source).map(([key, count]) => `${key}=${count}`).join(", ")}.`,
    `- Rows by split: ${rowsBySplit}.`,
    `- Language distribution across training corpus rows: ${languageSummary}.`,
    `- Answer-like field count: ${profile.answer_like_total}.`,
    `- target_answer rows: ${profile.target_answer_rows}.`,
    `- rejected_answers coverage: ${profile.rejected_answers_rows} rows, ${profile.rejected_answers_total_items} rejected items.`,
    `- Long-horizon rows: ${profile.row_counts_by_source.long_horizon || 0}.`,
    `- Eval-only rows: ${profile.eval_only.row_count}.`,
    `- Knowledge-source rows/cards: ${profile.knowledge_sources.row_count}; aggregate answer-like count: ${profile.knowledge_sources.aggregate_answer_like_count}.`,
    `- Identity-pack rows: ${profile.identity_pack.row_count}; aggregate answer-like count: ${profile.identity_pack.aggregate_answer_like_count}.`,
    "",
    "## Provenance And Personal Color",
    "",
    `- Provenance counts: ${Object.entries(profile.provenance_counts).map(([key, count]) => `${key}=${count}`).join(", ")}.`,
    `- Review-status counts: ${Object.entries(profile.review_status_counts).map(([key, count]) => `${key}=${count}`).join(", ")}.`,
    `- Private-data flag counts: ${Object.entries(profile.private_data_flag_counts).map(([key, count]) => `${key}=${count}`).join(", ")}.`,
    `- Personal-color signal counts: ${signalSummary}.`,
    "",
    "## Template Finding",
    "",
    `The current training corpus assessment is \`${profile.current_training_corpus_assessment.mostly_templates ? "mostly_templates" : "not_mostly_templates"}\`. Estimated personal training signal level is \`${profile.current_training_corpus_assessment.estimated_personal_training_signal_level}\`. Duplicate target-answer groups: ${profile.duplicate_template_findings.target_answer_duplicate_groups}; duplicate target-answer rows: ${profile.duplicate_template_findings.target_answer_duplicate_rows}.`,
    "",
    "Future corpus expansion needs fresh approval and should use only reviewed project-authored Chinese-first or mixed Chinese/English rows. Future training needs separate fresh approval. Phase_4 remains blocked, and no weights or artifacts are committed.",
    ""
  ];
  await writeFile(assertRepoPath(SUMMARY_PATH), `${summary.join("\n")}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    report_path: REPORT_PATH,
    summary_path: SUMMARY_PATH,
    rows_by_source: profile.row_counts_by_source,
    language_counts: profile.language_counts,
    training_corpus_language_counts: profile.language_counts_by_source.training_corpus || {},
    answer_like_total: profile.answer_like_total,
    target_answer_rows: profile.target_answer_rows,
    estimated_personal_training_signal_level: profile.current_training_corpus_assessment.estimated_personal_training_signal_level,
    training_ran: false,
    corpus_generated: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
