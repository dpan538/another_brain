import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = process.cwd();
const OUT = resolve(ROOT, "artifacts/training_os/r21_anti_overfit_invariants_report.json");

const STRICT_CONTROL_FILES = [
  "web/contextual_question_resolver.js",
  "web/response_mode_manager.js",
  "web/conversation_controller.js",
  "web/topic_stack.js",
  "web/conversation_state_schema.js"
];
const DEBT_FILES = ["web/operation_layer.js", "web/culture_planner.js", "web/last_answer_transform.js", "web/fallback_firewall.js"];
const SURFACE_GOVERNANCE_FILES = [
  "web/answer_plan.js",
  "web/dialogic_bridge_runtime.js",
  "web/dialogic_domain_profiles.js",
  "web/dialogic_profile_primitives.js",
  "web/natural_surface_realizer.js",
  "web/surface_control_policy.js"
];
const ENTITY_PATTERNS = [/person\.luo_dayou/, /author\.natsume_soseki/, /author\.kawabata_yasunari/, /罗大佑/, /夏目漱石/, /川端康成/];
const BASELINE = "56713f5192e75f068c7efac0346ff024e6d5bcc9";
const FAILURE_BANK = "data/failure_bank/r21_failure_bank.jsonl";
const BLIND_SIBLINGS = "evals/r21_mixed_dialogic/blind_sibling_sessions.jsonl";

function jsonlRows(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function countPatterns(path) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  const hits = [];
  for (const pattern of ENTITY_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, "g")) || [];
    if (matches.length) hits.push({ pattern: pattern.source, count: matches.length });
  }
  return hits;
}

function gitDiff(path) {
  try {
    return execFileSync("git", ["diff", "-U0", BASELINE, "--", path], { cwd: ROOT, encoding: "utf8" });
  } catch {
    return "";
  }
}

async function countExactPromptLogic(path) {
  let text = "";
  try {
    text = await readFile(resolve(ROOT, path), "utf8");
  } catch {
    return { file: path, exact_prompt_logic_count: 0, examples: [] };
  }
  const matches = text
    .split(/\r?\n/)
    .filter((line) => /(?:query|prompt|text)\s*(?:===|==|\.includes\()/.test(line) && /["'`].{4,80}["'`]/.test(line))
    .map((line) => line.trim());
  return { file: path, exact_prompt_logic_count: matches.length, examples: matches.slice(0, 20) };
}

async function countFullAnswerSentences(path) {
  let text = "";
  try {
    text = await readFile(resolve(ROOT, path), "utf8");
  } catch {
    return { file: path, full_answer_sentence_count: 0 };
  }
  const quotedStrings = [];
  for (const line of text.split(/\r?\n/)) {
    const matches = line.match(/(["'`])(.{12,220}?[。！？].*?)\1/g) || [];
    quotedStrings.push(...matches);
  }
  const longChineseSentences = quotedStrings.filter((item) => {
    const zh = [...item].filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
    return zh >= 18;
  });
  return { file: path, full_answer_sentence_count: longChineseSentences.length };
}

function zhCount(text) {
  return [...String(text || "")].filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
}

function addedLinesFor(path) {
  return gitDiff(path)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

async function countNewHardcodedSurfaceSentences(path) {
  const examples = [];
  const patterns = [
    /\b(?:sentence|question)\(\s*(["'`])([^"'`]{8,220})\1\s*\)/g,
    /\breturn\s+(["'`])([^"'`]{8,220})\1/g,
    /=>\s+(["'`])([^"'`]{8,220})\1/g
  ];
  for (const line of addedLinesFor(path)) {
    for (const pattern of patterns) {
      for (const match of line.matchAll(pattern)) {
        const value = match[2] || "";
        if (zhCount(value) >= 14) examples.push({ line: line.trim(), value });
      }
    }
  }
  return { file: path, new_hardcoded_surface_sentence_count: examples.length, examples: examples.slice(0, 20) };
}

async function countRegexToCannedAnswerBranches(path) {
  const lines = addedLinesFor(path);
  const examples = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1] || "";
    const window = `${line}\n${next}`;
    if (/\/.+\/\.test\(|\.match\(|\.includes\(/.test(line) && /\breturn\s+(?:sentence|question|\(?["'`])/.test(window)) {
      examples.push(window.trim());
    }
  }
  return { file: path, regex_to_canned_answer_branch_count: examples.length, examples: examples.slice(0, 20) };
}

async function countPrimitiveStringRenderedVerbatim(path) {
  let text = "";
  try {
    text = await readFile(resolve(ROOT, path), "utf8");
  } catch {
    return { file: path, primitive_string_rendered_verbatim_count: 0, examples: [] };
  }
  const examples = text
    .split(/\r?\n/)
    .filter((line) => /pickPrimitive\([^)]*analogy_relations|relation\.replace|text:\s*relation\b|candidate_answer:\s*relation\b/.test(line))
    .map((line) => line.trim());
  return { file: path, primitive_string_rendered_verbatim_count: examples.length, examples: examples.slice(0, 20) };
}

async function repeatedProfileSkeletonCount(path) {
  let text = "";
  try {
    text = await readFile(resolve(ROOT, path), "utf8");
  } catch {
    return { file: path, repeated_profile_skeleton_count: 0, skeletons: [] };
  }
  const scanned = text
    .split(/\r?\n/)
    .filter((line) => !/regex\s*:|RegExp|PROHIBITION|PATTERN/.test(line))
    .join("\n");
  const skeletons = [
    { id: "can_understand_as_entry", regex: /可以理解为[^`"']{0,40}入口/g },
    { id: "focus_is", regex: /重点在[^`"']{0,24}/g },
    { id: "caught_this_line", regex: /我接住这个/g },
    { id: "can_ask_deeper", regex: /可以问得更深一点/g }
  ].map((item) => ({ id: item.id, count: (scanned.match(item.regex) || []).length }));
  return {
    file: path,
    repeated_profile_skeleton_count: skeletons.reduce((sum, item) => sum + item.count, 0),
    skeletons
  };
}

async function surfaceGovernanceDebt() {
  const legacyEntitySpecificDebt = [];
  const newlyAddedEntitySpecificLogic = [];
  const exactPromptLogic = [];
  const fullAnswerSentenceCounts = [];
  const repeatedProfileSkeletonCounts = [];
  const newHardcodedSurfaceSentenceCounts = [];
  const regexToCannedAnswerCounts = [];
  const primitiveStringRenderedVerbatimCounts = [];
  for (const file of SURFACE_GOVERNANCE_FILES) {
    const hits = await countPatterns(file).catch(() => []);
    if (hits.length) legacyEntitySpecificDebt.push({ file, hits });
    const diff = gitDiff(file);
    const addedLines = diff
      .split(/\r?\n/)
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .join("\n");
    const newHits = [];
    for (const pattern of ENTITY_PATTERNS) {
      const matches = addedLines.match(new RegExp(pattern.source, "g")) || [];
      if (matches.length) newHits.push({ pattern: pattern.source, count: matches.length });
    }
    if (newHits.length) newlyAddedEntitySpecificLogic.push({ file, hits: newHits });
    exactPromptLogic.push(await countExactPromptLogic(file));
    fullAnswerSentenceCounts.push(await countFullAnswerSentences(file));
    repeatedProfileSkeletonCounts.push(await repeatedProfileSkeletonCount(file));
    newHardcodedSurfaceSentenceCounts.push(await countNewHardcodedSurfaceSentences(file));
    regexToCannedAnswerCounts.push(await countRegexToCannedAnswerBranches(file));
    primitiveStringRenderedVerbatimCounts.push(await countPrimitiveStringRenderedVerbatim(file));
  }
  return {
    baseline_commit_for_new_debt: BASELINE,
    files_scanned: SURFACE_GOVERNANCE_FILES,
    legacy_entity_specific_debt: legacyEntitySpecificDebt,
    newly_added_entity_specific_logic: newlyAddedEntitySpecificLogic,
    exact_prompt_logic: exactPromptLogic,
    full_answer_sentence_count: fullAnswerSentenceCounts,
    repeated_profile_skeleton_count: repeatedProfileSkeletonCounts,
    new_hardcoded_surface_sentence_count: newHardcodedSurfaceSentenceCounts,
    regex_to_canned_answer_branch_count: regexToCannedAnswerCounts,
    primitive_string_rendered_verbatim_count: primitiveStringRenderedVerbatimCounts
  };
}

async function main() {
  const strictHits = [];
  const debtHits = [];
  for (const file of STRICT_CONTROL_FILES) {
    const hits = await countPatterns(file);
    if (hits.length) strictHits.push({ file, hits });
  }
  for (const file of DEBT_FILES) {
    const hits = await countPatterns(file);
    if (hits.length) debtHits.push({ file, hits });
  }
  const failureBankRows = jsonlRows(await readFile(resolve(ROOT, FAILURE_BANK), "utf8"));
  const blindSiblingRows = jsonlRows(await readFile(resolve(ROOT, BLIND_SIBLINGS), "utf8"));
  const blindThemeCoverage = {
    music_or_literature: blindSiblingRows.filter((row) => /(music|literature|faye|jay|murakami|sodagreen)/i.test(row.id)).length,
    visual_or_design: blindSiblingRows.filter((row) => /(duchamp|photography|bauhaus|cinema)/i.test(row.id)).length,
    science: blindSiblingRows.filter((row) => /(science|evolution)/i.test(row.id)).length,
    urban: blindSiblingRows.filter((row) => /(urban|space|city)/i.test(row.id)).length,
    technology: blindSiblingRows.filter((row) => /(technology|interface|tool)/i.test(row.id)).length,
    ethics: blindSiblingRows.filter((row) => /(ethics|action)/i.test(row.id)).length,
    education: blindSiblingRows.filter((row) => /(education|learning|classroom)/i.test(row.id)).length,
    economics: blindSiblingRows.filter((row) => /(economics|institution|market)/i.test(row.id)).length,
    cinema: blindSiblingRows.filter((row) => /(cinema|film|lens|movie)/i.test(row.id)).length,
    language: blindSiblingRows.filter((row) => /(language|meaning|translation)/i.test(row.id)).length,
    food: blindSiblingRows.filter((row) => /(food|cooking|craft|table|kitchen)/i.test(row.id)).length,
    law: blindSiblingRows.filter((row) => /(law|justice|precedent|fairness)/i.test(row.id)).length,
    care: blindSiblingRows.filter((row) => /(care|clinical|medical|body)/i.test(row.id)).length,
    psychology: blindSiblingRows.filter((row) => /(psychology|memory_mind|dream|emotion)/i.test(row.id)).length,
    theater: blindSiblingRows.filter((row) => /(theater|stage|drama|performance)/i.test(row.id)).length,
    history: blindSiblingRows.filter((row) => /(history|memory|archive|gazetteer)/i.test(row.id)).length
  };
  const invariantFailures = [];
  if (failureBankRows.length < 19) invariantFailures.push({ reason: "failure_bank_too_small", rows: failureBankRows.length, min: 19 });
  if (blindSiblingRows.length < 18) invariantFailures.push({ reason: "blind_sibling_sessions_too_few", rows: blindSiblingRows.length, min: 18 });
  for (const [theme, count] of Object.entries(blindThemeCoverage)) {
    if (count < 1) invariantFailures.push({ reason: "blind_theme_missing", theme });
  }
  const packageText = await readFile(resolve(ROOT, "package.json"), "utf8");
  const surfaceDebt = await surfaceGovernanceDebt();
  if (surfaceDebt.newly_added_entity_specific_logic.length) {
    invariantFailures.push({ reason: "new_surface_entity_specific_logic", hits: surfaceDebt.newly_added_entity_specific_logic });
  }
  const newHardcodedSurfaceCount = surfaceDebt.new_hardcoded_surface_sentence_count.reduce(
    (sum, row) => sum + row.new_hardcoded_surface_sentence_count,
    0
  );
  const regexToCannedCount = surfaceDebt.regex_to_canned_answer_branch_count.reduce(
    (sum, row) => sum + row.regex_to_canned_answer_branch_count,
    0
  );
  const primitiveRenderedCount = surfaceDebt.primitive_string_rendered_verbatim_count.reduce(
    (sum, row) => sum + row.primitive_string_rendered_verbatim_count,
    0
  );
  if (newHardcodedSurfaceCount > 0) {
    invariantFailures.push({ reason: "new_hardcoded_surface_sentence", count: newHardcodedSurfaceCount });
  }
  if (regexToCannedCount > 0) {
    invariantFailures.push({ reason: "regex_to_canned_answer_branch", count: regexToCannedCount });
  }
  if (primitiveRenderedCount > 0) {
    invariantFailures.push({ reason: "primitive_string_rendered_verbatim", count: primitiveRenderedCount });
  }
  const report = {
    ok: strictHits.length === 0 && invariantFailures.length === 0,
    strict_control_files: STRICT_CONTROL_FILES,
    strict_entity_specific_hits: strictHits,
    known_runtime_entity_specific_debt: debtHits,
    surface_governance_entity_specific_report: surfaceDebt,
    failure_bank_rows: failureBankRows.length,
    blind_sibling_sessions: blindSiblingRows.length,
    blind_theme_coverage: blindThemeCoverage,
    invariant_failures: invariantFailures,
    release_gate_has_r21: /check:r21-control/.test(packageText),
    forbidden_change_guard: {
      dialog_rules_runtime_patch_allowed: false,
      answer_index_expansion_allowed: false,
      tiny_router_manual_patch_allowed: false
    }
  };
  await mkdir(resolve(ROOT, "artifacts/training_os"), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
