#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { answerDialogPrompt, createDialogRuntime } from "../dialog_runtime.mjs";

const ROOT = process.cwd();
const BASELINE = "341caba3ed7b0829d4b82bc9d7d62081d107e9fe";
const OUT_DIR = resolve(ROOT, "artifacts/training_os/truth_audit");
const DOC_PATH = resolve(ROOT, "docs/r0_r22_truth_audit.md");

const SESSION_A = {
  id: "truth_session_a_luo_japanese_seasonality",
  source: "user_fixed_session_a",
  turns: [
    "你知道罗大佑吗？",
    "他有什么代表作？",
    "换个说法。",
    "能不能简单一点？",
    "罗大佑有什么代表作？",
    "你看过日本文学吗？",
    "日本文学的特点是什么？",
    "什么是季节感？"
  ]
};

const SESSION_B = {
  id: "truth_session_b_music_literature_identity_16turn",
  source: "user_fixed_session_b",
  turns: [
    "你知道罗大佑吗？",
    "是那个台湾的歌手吗？",
    "你觉得他的歌怎么样？",
    "还有其他港台流行歌手可以推荐的吗？",
    "你觉得专辑和单曲的创作模式有什么区别？",
    "这个其实和文学诗歌很像。",
    "日本文学和台湾文学有一些相似性，你能注意到吗？",
    "日本文学的代表作和作家你能列举三个吗？",
    "这其实有点像舞台剧，比较有细节和冲突。",
    "或许我比较羡慕夏目漱石的我的猫这本书，他让我想到了童年。",
    "罗大佑也有一首歌是童年，你觉得他讲的真是童年吗？",
    "这或许不像是一个对话框能说出来的话，你是谁？",
    "你为什么要提到鳄鱼？",
    "鳄鱼和罗大佑的歌曲有什么关系？",
    "我很喜欢你在文学和诗歌上的努力。",
    "你是否有别的更深的提问？"
  ]
};

const BLIND_DOMAIN_SELECTORS = [
  { domain: "music", pattern: /(faye|jay|music|sodagreen|song|li_zongsheng|wangfei|pop)/i },
  { domain: "literature", pattern: /(murakami|literature|natsume|kawabata|zhang_ailing|poetry)/i },
  { domain: "film", pattern: /(film|cinema|lens|movie|photography)/i },
  { domain: "food", pattern: /(food|taste|cuisine|cook|cooking|tea|restaurant)/i },
  { domain: "law", pattern: /(law|legal|case|jurisdiction|rights|court)/i },
  { domain: "history", pattern: /(history|memory|archive|historical)/i },
  { domain: "psychology", pattern: /(psychology|care|emotion|therapy|lonely|childhood)/i },
  { domain: "urban", pattern: /(urban|city|space|architecture|street)/i },
  { domain: "technology", pattern: /(technology|interface|tool|software|webgpu|ai)/i },
  { domain: "science", pattern: /(science|evolution|darwin|experiment|observation)/i }
];

const IMPLEMENTATION_LEAK_RE =
  /本地知识卡|知识卡|当前会话|这个(?:音乐|历史|艺术|电影|科学|城市|技术|伦理|教育|经济|语言|饮食|法律|照护|心理学|戏剧)?对象|运行时|runtime|answerIndex|domain profile|profile|schema|卡片|trace|内部|控件/i;
const TEMPLATE_LANGUAGE_RE =
  /可以理解为|常从|可以从[^。！？]{0,40}(进入|入手|切入)|重点在|关键在|这个[^。！？]{0,20}入口|先看[^。！？]{0,30}(时代感|季节感|史料|记忆)|换个说法：这个|本质上|这体现了|复杂关系|不是简单的[^。！？]{0,20}而是/i;
const GENERIC_FALLBACK_RE = /你需要提问|你要问哪一边|也许发生过|我刚才没有接住问题|你可以继续问|请明确问题|你想问什么/i;
const IDENTITY_BOUNDARY_RE = /我不是人|不能说真的|作为(?:一个)?(?:AI|助手|模型|对话框)|只是(?:一个)?对话框|没有真正|本地知识卡/i;
const NON_QUESTION_B = new Set([6, 9, 10, 15]);

function nowIso() {
  return new Date().toISOString();
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  }).trim();
}

async function readText(path, fallback = "") {
  try {
    return await readFile(resolve(ROOT, path), "utf8");
  } catch {
    return fallback;
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function zhCount(text) {
  return [...String(text || "")].filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
}

function parseJsonl(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function trackedFiles() {
  return git(["ls-files"])
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
}

function isFrozenAuditTarget(file) {
  if (file.startsWith("scripts/truth_audit/")) return false;
  if (file.startsWith("web/")) return true;
  if (file.startsWith("evals/")) return true;
  if (file === "package.json") return true;
  if (file === "scripts/check_release.sh") return true;
  if (!file.startsWith("scripts/")) return false;
  const name = basename(file);
  return (
    name.startsWith("eval_") ||
    name.startsWith("check_") ||
    /^build_.*eval.*\.mjs$/.test(name) ||
    /^build_.*eval.*\.js$/.test(name)
  );
}

async function hashFiles(files) {
  const out = {};
  for (const file of files) {
    const text = await readText(file, null);
    if (text !== null) out[file] = sha256(text);
  }
  return out;
}

async function repoSnapshot(label) {
  const files = trackedFiles();
  const packageJson = await readJson("package.json");
  const deployedParity = await readJson("artifacts/training_os/r20_deployed_parity_report.json");
  const runtimeVersion = await readJson("artifacts/training_os/runtime_asset_audit_report.json");
  const frozenFiles = files.filter(isFrozenAuditTarget);
  const grouped = {
    web: frozenFiles.filter((file) => file.startsWith("web/")),
    evals: frozenFiles.filter((file) => file.startsWith("evals/")),
    test_eval_scripts: frozenFiles.filter((file) => file.startsWith("scripts/")),
    package_json: frozenFiles.filter((file) => file === "package.json")
  };
  return {
    label,
    generated_at: nowIso(),
    baseline_commit: BASELINE,
    head: git(["rev-parse", "HEAD"]),
    branch: git(["branch", "--show-current"]),
    tracked_file_count: files.length,
    tracked_files: files,
    frozen_file_count: frozenFiles.length,
    frozen_files: frozenFiles,
    hashes: await hashFiles(frozenFiles),
    grouped_frozen_counts: Object.fromEntries(Object.entries(grouped).map(([key, value]) => [key, value.length])),
    package_scripts: packageJson?.scripts || {},
    current_deployment_version: {
      source: deployedParity ? "artifacts/training_os/r20_deployed_parity_report.json" : "unknown",
      local_version: deployedParity?.local_version?.gitHead || deployedParity?.local_version || "",
      deployed_version: deployedParity?.deployed_version || deployedParity?.deployed_app_version || "",
      stale_asset_detected: deployedParity?.stale_asset_detected ?? null,
      runtime_asset_audit: runtimeVersion
        ? {
            runtime_version: runtimeVersion.runtime_version || "",
            stale_asset_detected: runtimeVersion.stale_asset_detected ?? null
          }
        : null
    }
  };
}

function snapshotDiff(before, after) {
  const changed = [];
  const removed = [];
  const added = [];
  for (const [file, hash] of Object.entries(before.hashes || {})) {
    if (!(file in after.hashes)) removed.push(file);
    else if (after.hashes[file] !== hash) changed.push(file);
  }
  for (const file of Object.keys(after.hashes || {})) {
    if (!(file in (before.hashes || {}))) added.push(file);
  }
  return {
    audit_invalid: changed.length > 0 || removed.length > 0 || added.length > 0,
    changed_frozen_files: changed,
    removed_frozen_files: removed,
    added_frozen_files: added
  };
}

function flattenTurns(row) {
  if (!row) return [];
  if (Array.isArray(row.turns)) {
    return row.turns.map((turn) => (typeof turn === "string" ? { user: turn } : turn)).filter((turn) => turn.user);
  }
  if (row.prompt) return [{ user: row.prompt }];
  return [];
}

async function loadBlindSiblingSessions() {
  const rows = parseJsonl(await readText("evals/r21_mixed_dialogic/blind_sibling_sessions.jsonl", ""));
  const selected = [];
  const used = new Set();
  for (const selector of BLIND_DOMAIN_SELECTORS) {
    const found = rows.find((row) => !used.has(row.id) && selector.pattern.test(`${row.id} ${JSON.stringify(row)}`));
    if (found) {
      used.add(found.id);
      selected.push({
        id: `truth_blind_${selector.domain}_${found.id}`,
        source: "r21_blind_sibling_sample",
        domain_hint: selector.domain,
        turns: flattenTurns(found).map((turn) => turn.user),
        expected_turn_functions: flattenTurns(found).map((turn) => turn.expected_turn_function || "")
      });
    } else {
      selected.push({
        id: `truth_blind_${selector.domain}_missing_fixture`,
        source: "r21_blind_sibling_sample",
        domain_hint: selector.domain,
        turns: [],
        expected_turn_functions: [],
        missing_existing_blind_fixture: true
      });
    }
  }
  return selected;
}

function traceValue(trace, candidates) {
  for (const path of candidates) {
    const parts = path.split(".");
    let node = trace;
    for (const part of parts) {
      if (!node || typeof node !== "object") {
        node = undefined;
        break;
      }
      node = node[part];
    }
    if (node !== undefined && node !== null && node !== "") return node;
  }
  return "";
}

function compactTrace(turn) {
  const trace = turn.trace || {};
  const controller = trace.conversation_controller || {};
  return {
    route: turn.route || trace.answer_source || "",
    intent: turn.intent || trace.intent || "",
    response_mode: traceValue(trace, [
      "response_mode.mode",
      "conversation_controller.response_mode",
      "conversation_controller.responseMode.mode",
      "conversation_controller.resolved.response_mode",
      "conversation_controller.resolved.responseMode.mode"
    ]),
    turn_function: traceValue(trace, [
      "conversation_controller.turn_function",
      "conversation_controller.user_turn.turn_function",
      "conversation_controller.user_turn_kind",
      "conversation_controller.resolved.turn_function",
      "conversation_controller.resolved.userTurn.turn_function"
    ]),
    active_domain: traceValue(trace, [
      "state_after.activeDomain",
      "conversation_controller.active_topic.domain",
      "conversation_controller.binding.domain",
      "conversation_controller.domain"
    ]),
    active_referent: traceValue(trace, [
      "conversation_controller.binding.target_ids",
      "conversation_controller.binding.targetIds",
      "conversation_controller.active_topic.id",
      "state_after.activeEntityIds"
    ]),
    answer_style: traceValue(trace, ["conversation_controller.answer_style", "conversation_controller.answerStyle"]),
    question_type: traceValue(trace, ["conversation_controller.question_type", "conversation_controller.questionType"]),
    operation: traceValue(trace, ["conversation_controller.operation"]),
    evidence: traceValue(trace, [
      "conversation_controller.evidence_ids",
      "conversation_controller.answer_plan.evidenceIds",
      "conversation_controller.answer_plan.evidenceIds"
    ]),
    finalizer: trace.fallback_firewall || trace.conversation_controller?.finalizer || null
  };
}

function passFail(value, evidence) {
  return { verdict: value, evidence };
}

function includesAny(text, terms) {
  return terms.some((term) => String(text || "").includes(term));
}

function expectedTopicFor(session, turnIndex, user) {
  if (/罗大佑|他的|他有什么|他的歌|童年/.test(user) && turnIndex <= 5) return "罗大佑";
  if (/日本文学|季节感|夏目漱石|我的猫|作家|代表作/.test(user)) return "日本文学";
  if (/鳄鱼/.test(user)) return "identity_boundary";
  return "";
}

function evaluateTurn({ session, turnIndex, user, answer, trace }) {
  const hardFailures = [];
  const implementationLeak = IMPLEMENTATION_LEAK_RE.test(answer);
  const templateLike = TEMPLATE_LANGUAGE_RE.test(answer);
  const genericFallback = GENERIC_FALLBACK_RE.test(answer);
  const identityBoundaryOvertrigger =
    /你(?:看过|读过|听过|了解|知道).{0,12}(文学|音乐|电影|历史|艺术|科学)/.test(user) && IDENTITY_BOUNDARY_RE.test(answer);
  const uiAffordance = trace.route === "affordance" || !String(answer || "").trim();
  const expectedTopic = expectedTopicFor(session, turnIndex, user);
  const asksWorks = /代表作|作品/.test(user);
  const answerHasWorks = /《[^》]+》/.test(answer) || /童年|鹿港小镇|恋曲1990|之乎者也|夏目漱石|川端康成|太宰治/.test(answer);
  const asksSeasonality = /什么是季节感|季节感是什么/.test(user);
  const historyMisroute = asksSeasonality && /历史对象|历史叙述|史料|解释责任/.test(answer);
  const transformWrappedBadAnswer = /换个说法/.test(user) && /这个.*对象|入口|先看/.test(answer);
  const nonQuestionTurn =
    (session.id === SESSION_B.id && NON_QUESTION_B.has(turnIndex)) ||
    /很像。$|有点像|羡慕|我很喜欢/.test(user);
  const nonQuestionMisrouted = nonQuestionTurn && (uiAffordance || genericFallback || /你可以继续问|请明确/.test(answer));

  if (implementationLeak) hardFailures.push("implementation_terms_leaked");
  if (templateLike) hardFailures.push("generic_profile_template_language");
  if (identityBoundaryOvertrigger) hardFailures.push("unnecessary_identity_boundary");
  if (asksWorks && !answerHasWorks) hardFailures.push("representative_works_question_not_answered");
  if (historyMisroute) hardFailures.push("known_question_returned_unrelated_domain");
  if (transformWrappedBadAnswer) hardFailures.push("transform_wrapped_bad_profile_answer");
  if (nonQuestionMisrouted) hardFailures.push("meaningful_non_question_misrouted");

  const questionAnswered =
    historyMisroute || transformWrappedBadAnswer || (asksWorks && !answerHasWorks) || genericFallback
      ? "fail"
      : uiAffordance && /[？?吗呢怎么什么谁哪]|代表|特点|列举/.test(user)
        ? "fail"
        : "unknown";
  const activeDomainCorrect =
    historyMisroute || (/日本文学/.test(user) && /历史对象/.test(answer)) ? "fail" : expectedTopic ? "unknown" : "unknown";
  const naturalness = implementationLeak || templateLike || genericFallback ? "fail" : "unknown";
  const specificity = templateLike && !answerHasWorks ? "fail" : "unknown";
  const contextualContinuity =
    transformWrappedBadAnswer || historyMisroute || identityBoundaryOvertrigger ? "fail" : expectedTopic ? "unknown" : "unknown";

  return {
    implementation_leakage: implementationLeak,
    profile_template_like: templateLike,
    identity_boundary_overtrigger: identityBoundaryOvertrigger,
    generic_fallback: genericFallback,
    ui_affordance: uiAffordance,
    hard_live_failures: hardFailures,
    rubric: {
      question_answered: passFail(questionAnswered, questionAnswered === "fail" ? "The answer does not address the current turn." : "Not decidable by heuristic audit."),
      correct_active_referent: passFail(
        hardFailures.includes("representative_works_question_not_answered") ? "fail" : "unknown",
        expectedTopic ? `Expected topic/referent continuity around ${expectedTopic}.` : "No specific referent expectation encoded."
      ),
      correct_active_domain: passFail(activeDomainCorrect, historyMisroute ? "The seasonality question was answered as a history-object profile." : "Not decidable by heuristic audit."),
      factual_correctness: passFail("unknown", "Truth audit did not use external factual adjudication."),
      contextual_continuity: passFail(
        contextualContinuity,
        contextualContinuity === "fail" ? "The response loses the active topic or wraps a bad profile answer." : "Not decidable by heuristic audit."
      ),
      naturalness: passFail(naturalness, naturalness === "fail" ? "Implementation terms, fallback, or generic profile language appear in visible output." : "No hard naturalness failure detected by heuristic."),
      specificity: passFail(specificity, specificity === "fail" ? "The answer uses profile language instead of requested concrete items." : "Not decidable by heuristic audit."),
      implementation_leakage: passFail(implementationLeak ? "fail" : "pass", implementationLeak ? "Visible output contains internal representation language." : "No implementation term detected."),
      template_profile_language: passFail(templateLike ? "fail" : "pass", templateLike ? "Visible output matches profile/template skeleton." : "No configured template skeleton detected."),
      over_personification: passFail("unknown", "Not adjudicated automatically."),
      over_mechanical_language: passFail(implementationLeak || templateLike ? "fail" : "unknown", "Mechanical language is inferred from profile/internal terms."),
      unnecessary_identity_boundary: passFail(identityBoundaryOvertrigger ? "fail" : "unknown", identityBoundaryOvertrigger ? "Identity boundary preempted a normal cultural familiarity question." : "No identity overtrigger detected."),
      unnecessary_fallback: passFail(genericFallback ? "fail" : "unknown", genericFallback ? "Generic fallback surfaced." : "No generic fallback detected."),
      answer_density: passFail(zhCount(answer) > 160 ? "fail" : "unknown", zhCount(answer) > 160 ? "Mobile answer likely exceeds compact density." : "Length alone is insufficient for truth verdict."),
      transition_quality: passFail(hardFailures.length ? "fail" : "unknown", hardFailures.length ? "Hard live failure interrupts the conversation arc." : "Not decidable by heuristic audit.")
    }
  };
}

async function runLiveSession(session) {
  if (!session.turns.length) return { ...session, skipped: true, reason: "No existing blind sibling fixture matched this domain." };
  const runtime = createDialogRuntime();
  const turns = [];
  for (let index = 0; index < session.turns.length; index += 1) {
    const user = session.turns[index];
    const result = await answerDialogPrompt(user, runtime, {
      uiProfile: "mobile",
      runtimeProfile: "standard",
      withThinkingDelay: false
    });
    const trace = compactTrace(result);
    const audit = evaluateTurn({ session, turnIndex: index + 1, user, answer: result.answer || "", trace });
    turns.push({
      turn_index: index + 1,
      user,
      live_answer: result.answer || "",
      route: trace.route,
      response_mode: trace.response_mode,
      turn_function: trace.turn_function || session.expected_turn_functions?.[index] || "",
      active_domain: trace.active_domain,
      active_referent: trace.active_referent,
      answer_style: trace.answer_style,
      question_type: trace.question_type,
      operation: trace.operation,
      cards_or_evidence: trace.evidence,
      finalizer: trace.finalizer,
      implementation_terms_leaked: audit.implementation_leakage,
      topic_lost_or_wrong: audit.hard_live_failures.some((failure) =>
        /domain|referent|unrelated|profile|works|transform/.test(failure)
      ),
      answered_current_turn: audit.rubric.question_answered.verdict,
      profile_or_template_like: audit.profile_template_like,
      hard_live_failures: audit.hard_live_failures,
      live_product_rubric: audit.rubric
    });
  }
  return {
    id: session.id,
    source: session.source,
    domain_hint: session.domain_hint || "",
    turns,
    hard_live_failure_count: turns.reduce((sum, turn) => sum + turn.hard_live_failures.length, 0)
  };
}

async function runLiveBlackbox() {
  const blind = await loadBlindSiblingSessions();
  const sessions = [SESSION_A, SESSION_B, ...blind];
  const results = [];
  for (const session of sessions) {
    results.push(await runLiveSession(session));
  }
  const hardFailures = [];
  for (const session of results) {
    for (const turn of session.turns || []) {
      for (const failure of turn.hard_live_failures || []) {
        hardFailures.push({
          session_id: session.id,
          turn_index: turn.turn_index,
          user: turn.user,
          answer: turn.live_answer,
          failure
        });
      }
    }
  }
  return {
    generated_at: nowIso(),
    live_runtime_only: true,
    shadow_candidate_used: false,
    sessions: results,
    session_count: results.length,
    turn_count: results.reduce((sum, session) => sum + (session.turns?.length || 0), 0),
    hard_live_failure_count: hardFailures.length,
    hard_live_failures: hardFailures
  };
}

function lineHits(file, regex) {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ file, line: index + 1, text: line }))
    .filter((entry) => regex.test(entry.text));
}

function firstLine(file, regex) {
  return lineHits(file, regex)[0] || { file, line: null, text: "" };
}

async function falseGreenPaths() {
  const packageJson = await readJson("package.json");
  const checkRelease = await readText("scripts/check_release.sh", "");
  const paths = [];
  const add = ({ file, line, mechanism, affected_milestone, observed_consequence, severity, evidence }) => {
    paths.push({ file, line, mechanism, affected_milestone, observed_consequence, severity, evidence });
  };

  const strictLine = firstLine("scripts/eval_r22_natural_surface.mjs", /strict/);
  add({
    file: strictLine.file,
    line: strictLine.line,
    mechanism: "audit-only command may return 0 while behavior failures remain unless strict flag is passed",
    affected_milestone: "R22",
    observed_consequence: "R22 natural-surface behavior can be reported in artifacts while npm script succeeds.",
    severity: "high",
    evidence: strictLine.text.trim()
  });

  const pkgScript = packageJson?.scripts?.["audit:r22-surface-governance"] || "";
  add({
    file: "package.json",
    line: null,
    mechanism: "R22 surface governance script uses audit path rather than blocking strict behavior gate",
    affected_milestone: "R22",
    observed_consequence: "Command success is not equivalent to live natural-surface behavior success.",
    severity: "high",
    evidence: pkgScript
  });

  for (const hit of lineHits("scripts/run_r10_r22_cycle.mjs", /allowFailure|exit_code === 0|behavior_ok: failures\.length === 0/)) {
    add({
      file: hit.file,
      line: hit.line,
      mechanism: "cycle runner treats exit code or allowFailure as behavior status",
      affected_milestone: "R10-R22 cycle",
      observed_consequence: "Browser/deployed/audit steps can be non-blocking, and behavior reports are not promoted to failure.",
      severity: /allowFailure/.test(hit.text) ? "medium" : "high",
      evidence: hit.text.trim()
    });
  }

  for (const hit of lineHits("scripts/run_r22_long_cycle.mjs", /process\.exit\(2\)|behavior_ok: true/)) {
    add({
      file: hit.file,
      line: hit.line,
      mechanism: /process\.exit/.test(hit.text) ? "long runner can fail-fast despite continuous contract" : "long runner can print hard-coded behavior_ok true",
      affected_milestone: "R22",
      observed_consequence: "Long-cycle orchestration can stop early or mark behavior without evaluating live naturalness.",
      severity: "high",
      evidence: hit.text.trim()
    });
  }

  const fallbackLine = firstLine("scripts/audit_r22_fallback_appropriateness.mjs", /justified_fallback_count/);
  add({
    file: fallbackLine.file,
    line: fallbackLine.line,
    mechanism: "missing or unsupported capability can be counted outside unnecessary/unknown fallback",
    affected_milestone: "R22",
    observed_consequence: "Large fallback counts can look justified even when no candidate was attempted.",
    severity: "high",
    evidence: fallbackLine.text.trim()
  });

  if (!/r22/i.test(checkRelease)) {
    add({
      file: "scripts/check_release.sh",
      line: null,
      mechanism: "release check omits R22",
      affected_milestone: "R22",
      observed_consequence: "check:release can succeed without proving R22 natural-surface behavior.",
      severity: "high",
      evidence: "No R22 marker found in check_release.sh"
    });
  }

  const antiOverfitLine = firstLine("scripts/check_r21_anti_overfit_invariants.mjs", /ENTITY_PATTERNS/);
  add({
    file: antiOverfitLine.file,
    line: antiOverfitLine.line,
    mechanism: "anti-overfit entity scan has narrow hard-coded entity patterns",
    affected_milestone: "R21/R22",
    observed_consequence: "New or existing entity-specific debt outside the small pattern list can evade the scanner.",
    severity: "medium",
    evidence: antiOverfitLine.text.trim()
  });

  const baselineLine = firstLine("scripts/check_r21_anti_overfit_invariants.mjs", /BASELINE/);
  add({
    file: baselineLine.file,
    line: baselineLine.line,
    mechanism: "moving baseline can classify existing entity-specific logic as legacy debt",
    affected_milestone: "R21/R22",
    observed_consequence: "new_entity_specific_branch=0 cannot be read as no entity-specific branch in runtime.",
    severity: "medium",
    evidence: baselineLine.text.trim()
  });

  const generatedHoldout = firstLine("scripts/generate_r22_postfreeze_holdout.mjs", /generated_after_runtime_freeze|const .*sessions|holdout/);
  add({
    file: generatedHoldout.file,
    line: generatedHoldout.line,
    mechanism: "post-freeze holdout is generated by repository code authored with the runtime",
    affected_milestone: "R22",
    observed_consequence: "Synthetic holdout is not independent blind evidence.",
    severity: "medium",
    evidence: generatedHoldout.text.trim()
  });

  const classifierLine = firstLine("web/user_turn_classifier.js", /你看过|你读过|你听过|你懂|你了解/);
  add({
    file: classifierLine.file,
    line: classifierLine.line,
    mechanism: "capability/meta classifier may overtrigger on everyday familiarity questions",
    affected_milestone: "R19-R22 live control",
    observed_consequence: "Questions like '你看过日本文学吗？' can become identity/capability boundary replies.",
    severity: "high",
    evidence: classifierLine.text.trim()
  });

  const profileLine = firstLine("web/dialogic_domain_profiles.js", /可以理解为|常从|重点在|入口/);
  add({
    file: profileLine.file,
    line: profileLine.line,
    mechanism: "full-sentence domain profiles can leak template skeletons into live answers",
    affected_milestone: "R21/R22 natural surface",
    observed_consequence: "Visible output can sound like '这个对象/入口/重点在...' instead of a conversational answer.",
    severity: "high",
    evidence: profileLine.text.trim()
  });

  return {
    generated_at: nowIso(),
    false_green_path_count: paths.length,
    paths
  };
}

function classifyDiffEffect(file, summary) {
  if (/r22|shadow|holdout|surface/.test(file) && /web\//.test(summary.files || "")) return "self_authored_test";
  if (/evals\//.test(file) && /deleted|removed/i.test(summary.kind || "")) return "unknown_effect";
  if (/must_include|expected|threshold|max_chars|min_|strict/i.test(summary.patch || "")) return "unknown_effect";
  if (/generator|holdout|build_/.test(file)) return "self_generated_holdout";
  return "unknown_effect";
}

function parseNumstat() {
  const text = git(["log", "--date=short", "--pretty=format:@@@%H%x09%ad%x09%s", "--numstat", "--", "evals", "scripts", "package.json", "web"]);
  const commits = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("@@@")) {
      if (current) commits.push(current);
      const [, meta] = line.split("@@@");
      const [hash, date, ...subject] = meta.split("\t");
      current = { hash, date, subject: subject.join("\t"), files: [] };
    } else if (current && line.trim()) {
      const [added, removed, file] = line.split(/\t/);
      current.files.push({ file, added: added === "-" ? null : Number(added), removed: removed === "-" ? null : Number(removed) });
    }
  }
  if (current) commits.push(current);
  return commits;
}

async function testIntegrityHistory() {
  const commits = parseNumstat();
  const records = commits
    .filter((commit) => commit.files.some((entry) => /^evals\//.test(entry.file) || /^scripts\/(?:eval_|check_|build_|generate_)/.test(entry.file) || entry.file === "package.json"))
    .slice(0, 200)
    .map((commit) => {
      const evalRowsAdded = commit.files.filter((entry) => /^evals\//.test(entry.file)).reduce((sum, entry) => sum + (entry.added || 0), 0);
      const evalRowsRemoved = commit.files.filter((entry) => /^evals\//.test(entry.file)).reduce((sum, entry) => sum + (entry.removed || 0), 0);
      const touchedRuntime = commit.files.some((entry) => /^web\//.test(entry.file));
      const touchedEvaluator = commit.files.some((entry) => /^scripts\/(?:eval_|check_|build_|generate_)/.test(entry.file) || /^evals\//.test(entry.file));
      const evaluatorFiles = commit.files.filter((entry) => /^scripts\/(?:eval_|check_|build_|generate_)/.test(entry.file)).map((entry) => entry.file);
      const generatorChanged = evaluatorFiles.some((file) => /build_|generate_/.test(file));
      const evaluatorChanged = evaluatorFiles.some((file) => /eval_|check_/.test(file));
      return {
        commit: commit.hash,
        date: commit.date,
        subject: commit.subject,
        eval_rows_added_or_lines_added: evalRowsAdded,
        eval_rows_removed_or_lines_removed: evalRowsRemoved,
        expected_labels_changed: "unknown",
        must_include_changed: "unknown",
        must_not_include_changed: "unknown",
        thresholds_changed: "unknown",
        blind_cases_moved: "unknown",
        train_dev_blind_regenerated: generatorChanged ? "possible" : "unknown",
        generator_changed: generatorChanged,
        evaluator_changed: evaluatorChanged,
        runtime_and_evaluator_changed_same_commit: touchedRuntime && touchedEvaluator,
        behavior_failure_changed_to_audit_only: /audit|shadow|surface/i.test(commit.subject) ? "possible" : "unknown",
        allowFailure_introduced: commit.files.some((entry) => /run_r10_r22_cycle/.test(entry.file)) ? "possible" : "unknown",
        exit_code_semantics_changed: commit.files.some((entry) => /run_r10_r22_cycle|run_r22_long_cycle/.test(entry.file)) ? "possible" : "unknown",
        baseline_commit_moved_forward: /baseline|anti-overfit|r22/i.test(commit.subject) ? "possible" : "unknown",
        known_debt_exempted: /legacy|debt|baseline/i.test(commit.subject) ? "possible" : "unknown",
        effect: touchedRuntime && touchedEvaluator ? "self_authored_test" : generatorChanged ? "self_generated_holdout" : "unknown_effect",
        files: commit.files
      };
    });

  return {
    generated_at: nowIso(),
    scope: "git log over evals, scripts, package.json, web",
    record_count: records.length,
    records
  };
}

async function proxyConflictAudit() {
  const files = [
    "evals/r21_mixed_dialogic/gold_session.json",
    "evals/r21_mixed_dialogic/blind_sibling_sessions.jsonl",
    "evals/r21_mixed_dialogic/paraphrase_family.jsonl",
    "evals/r22_natural_surface/non_question_turns.jsonl",
    "evals/r22_natural_surface/bad_better_pairs.jsonl"
  ];
  const conflicts = [];
  for (const file of files) {
    const text = await readText(file, "");
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const forced = ["投射", "接住", "更深"].filter((term) => line.includes(term));
      if (!forced.length) continue;
      conflicts.push({
        file,
        line: index + 1,
        forced_terms: forced,
        conflict_type: "cross_milestone_contract_conflict",
        r21_effect: "must_include can reward visible taxonomy or artificial bridge language",
        r22_effect: "natural surface taxonomy flags these terms or skeletons as artificial when surfaced mechanically",
        evidence: line.slice(0, 500)
      });
    }
  }
  return {
    generated_at: nowIso(),
    conflict_count: conflicts.length,
    conflicts
  };
}

async function entitySpecificDebt() {
  const files = [
    "web/last_answer_transform.js",
    "web/answer_plan.js",
    "web/contextual_question_resolver.js",
    "web/dialogic_domain_profiles.js",
    "web/operation_layer.js",
    "web/culture_planner.js",
    "web/response_mode_manager.js"
  ];
  const patterns = [/罗大佑/g, /luo_dayou/g, /夏目漱石/g, /natsume_soseki/g, /川端康成/g, /kawabata/g, /王菲/g, /周杰伦/g, /杜尚/g, /小津/g, /达尔文/g];
  const debt = [];
  for (const file of files) {
    const text = await readText(file, "");
    const hits = [];
    for (const pattern of patterns) {
      const count = (text.match(pattern) || []).length;
      if (count) hits.push({ pattern: pattern.source, count });
    }
    if (hits.length) debt.push({ file, hits });
  }
  return { generated_at: nowIso(), files_scanned: files, debt };
}

function architectureBoundary() {
  const capabilities = [
    "unseen factual follow-up",
    "unseen pronoun binding",
    "natural non-question response",
    "cross-domain analogy",
    "topic re-entry",
    "open-ended judgment",
    "natural paraphrase",
    "16-turn continuity",
    "broad knowledge conversation"
  ];
  const mechanisms = [
    {
      mechanism: "deterministic rules",
      verdicts: {
        "unseen factual follow-up": "achievable with substantial rule debt",
        "unseen pronoun binding": "achievable with substantial rule debt",
        "natural non-question response": "achievable with substantial rule debt",
        "cross-domain analogy": "achievable with substantial rule debt",
        "topic re-entry": "achievable with substantial rule debt",
        "open-ended judgment": "unlikely without generative surface model",
        "natural paraphrase": "unlikely without generative surface model",
        "16-turn continuity": "achievable with substantial rule debt",
        "broad knowledge conversation": "unlikely without generative surface model"
      }
    },
    {
      mechanism: "static knowledge cards",
      verdicts: {
        "unseen factual follow-up": "achievable under current architecture",
        "unseen pronoun binding": "unknown",
        "natural non-question response": "achievable with substantial rule debt",
        "cross-domain analogy": "achievable with substantial rule debt",
        "topic re-entry": "unknown",
        "open-ended judgment": "unlikely without generative surface model",
        "natural paraphrase": "unlikely without generative surface model",
        "16-turn continuity": "unknown",
        "broad knowledge conversation": "achievable with substantial rule debt"
      }
    },
    {
      mechanism: "n-gram tiny router",
      verdicts: Object.fromEntries(capabilities.map((capability) => [capability, "unknown"]))
    },
    {
      mechanism: "answer index",
      verdicts: {
        "unseen factual follow-up": "unlikely without generative surface model",
        "unseen pronoun binding": "achievable with substantial rule debt",
        "natural non-question response": "unlikely without generative surface model",
        "cross-domain analogy": "unlikely without generative surface model",
        "topic re-entry": "achievable with substantial rule debt",
        "open-ended judgment": "unlikely without generative surface model",
        "natural paraphrase": "unlikely without generative surface model",
        "16-turn continuity": "unknown",
        "broad knowledge conversation": "unlikely without generative surface model"
      }
    },
    {
      mechanism: "full-sentence domain profiles",
      verdicts: {
        "unseen factual follow-up": "achievable with substantial rule debt",
        "unseen pronoun binding": "unknown",
        "natural non-question response": "achievable with substantial rule debt",
        "cross-domain analogy": "achievable with substantial rule debt",
        "topic re-entry": "unknown",
        "open-ended judgment": "unlikely without generative surface model",
        "natural paraphrase": "unlikely without generative surface model",
        "16-turn continuity": "unknown",
        "broad knowledge conversation": "achievable with substantial rule debt"
      }
    },
    {
      mechanism: "shadow clause realizer",
      verdicts: {
        "unseen factual follow-up": "unknown",
        "unseen pronoun binding": "unknown",
        "natural non-question response": "achievable with substantial rule debt",
        "cross-domain analogy": "achievable with substantial rule debt",
        "topic re-entry": "unknown",
        "open-ended judgment": "unknown",
        "natural paraphrase": "achievable with substantial rule debt",
        "16-turn continuity": "unknown",
        "broad knowledge conversation": "unknown"
      }
    }
  ];
  return { generated_at: nowIso(), allowed_verdicts: ["achievable under current architecture", "achievable with substantial rule debt", "unlikely without generative surface model", "unknown"], capabilities, mechanisms };
}

function milestoneTruthManifest(live, falseGreen, conflicts, entityDebt) {
  const liveHardFailures = live.hard_live_failure_count || 0;
  const falseGreenCount = falseGreen.false_green_path_count || 0;
  const common = {
    dataset_frozen: "unknown",
    evaluator_independent: false,
    human_review_exists: false
  };
  const rows = [];
  for (let index = 0; index <= 22; index += 1) {
    let status = "unknown";
    let goal = `R${index} milestone goal is not fully recoverable from immutable source in this audit.`;
    let source = "docs/package scripts/local reports";
    let implementation = [];
    let evaluator = [];
    let evidence = "No independent live black-box evidence tied to this milestone was located.";
    if (index <= 8) {
      status = "verified_safety_or_infrastructure";
      goal = "Early launch/release governance, safety, privacy, build, and deterministic dialog foundations.";
      source = "release_governance.md, check_release.sh, package scripts";
      implementation = ["web/dialog_rules.js", "web/output_sanitizer.js", "scripts/check_release.sh"];
      evaluator = ["scripts/check_release.sh", "package.json scripts"];
      evidence = "Current audit did not challenge these as live natural-language capabilities; they are infrastructure/safety gates.";
    } else if (index === 9) {
      status = "partial";
      goal = "Reasoning gate/regression coverage.";
      implementation = ["web/operation_layer.js"];
      evaluator = ["scripts/eval_r9_regression_strict.mjs"];
      evidence = "Scripted reasoning checks exist, but live natural conversation failures show this is not broad NLU verification.";
    } else if (index === 10) {
      status = liveHardFailures ? "partial" : "unknown";
      goal = "Culture answer behavior.";
      implementation = ["web/culture_runtime.js", "web/dialogic_domain_profiles.js"];
      evaluator = ["scripts/eval_r10_culture.mjs"];
      evidence = liveHardFailures ? "Live black-box culture turns include template language, implementation leakage, or wrong-domain answers." : "No hard live failure detected in sampled culture turns.";
    } else if (index === 11) {
      status = "partial";
      goal = "Reasoning and operation-layer expansion.";
      implementation = ["web/operation_layer.js"];
      evaluator = ["scripts/eval_r11_reasoning.mjs"];
      evidence = "Scripted checks exist; live Session A demonstrates route/domain confusion.";
    } else if (index === 12) {
      status = "test_only";
      goal = "Blind gate/casepack behavior.";
      evaluator = ["scripts/eval_r12_blind_gate.mjs"];
      evidence = "Blind gates are local scripted casepacks, not independent human/live review.";
    } else if (index === 13) {
      status = "partial";
      goal = "Coverage expansion.";
      evaluator = ["scripts/eval_r13_coverage.mjs"];
      evidence = "Coverage exists, but broad live quality is not demonstrated.";
    } else if (index >= 14 && index <= 18) {
      status = "verified_safety_or_infrastructure";
      goal = "Memory, WebGPU contracts, privacy/persona and launch infrastructure.";
      evaluator = ["scripts/check_internal_session_memory.mjs", "scripts/check_webgpu_contract.mjs"];
      evidence = "These are mostly infrastructure/contract gates; audit does not treat them as proof of natural conversation.";
    } else if (index === 19) {
      status = "partial";
      goal = "Response mode manager and endpoint conversation controller.";
      implementation = ["web/conversation_controller.js", "web/response_mode_manager.js", "web/contextual_question_resolver.js"];
      evaluator = ["scripts/eval_p0_response_mode.mjs", "scripts/eval_dialogue_boundary.mjs"];
      evidence = "Controller exists, but live follow-up and domain selection remain unreliable in Session A.";
    } else if (index === 20) {
      status = "partial";
      goal = "Endpoint acceptance, browser/deployed parity, WebGPU retrieval pilot.";
      implementation = ["web/webgpu_capability.js", "web/rerank_runtime.js", "web/embedding_runtime.js"];
      evaluator = ["scripts/eval_endpoint_readiness.mjs", "scripts/eval_real_browser_e2e.mjs", "scripts/probe_deployed_parity.mjs"];
      evidence = "Deployment/parity infrastructure exists; live language quality is not proven by endpoint metrics.";
    } else if (index === 21) {
      status = conflicts.conflict_count ? "invalid_proxy" : "partial";
      goal = "Typed control family training for mixed conversational judgment.";
      implementation = ["web/conversation_controller.js", "web/dialogic_bridge_runtime.js"];
      evaluator = ["evals/r21_mixed_dialogic", "scripts/eval_r21_mixed_dialogic.mjs"];
      evidence = conflicts.conflict_count ? "R21 fixtures require words later treated as artificial surface in R22." : "No proxy conflict found by this audit.";
    } else if (index === 22) {
      status = falseGreenCount || liveHardFailures ? "false_green" : "shadow_only";
      goal = "Natural surface governance and shadow realizer.";
      implementation = ["web/natural_surface_realizer.js", "web/surface_clause_planner.js"];
      evaluator = ["scripts/eval_r22_shadow_surface.mjs", "scripts/eval_r22_natural_surface.mjs"];
      evidence = "R22 is shadow/audit-only and current live output still has hard failures.";
    }
    rows.push({
      milestone: `R${index}`,
      original_stated_goal: goal,
      canonical_source_document: source,
      implementation_files: implementation,
      evaluator_files: evaluator,
      dataset_source: "repository-local synthetic/eval fixtures unless otherwise noted",
      whether_dataset_is_frozen: common.dataset_frozen,
      whether_evaluator_is_independent: common.evaluator_independent,
      whether_runtime_and_test_were_authored_together: "unknown_or_yes_for_later_milestones",
      whether_live_runtime_is_exercised: index <= 8 ? "partly" : index >= 19 ? "partly" : "unknown",
      whether_only_shadow_runtime_is_exercised: index === 22,
      whether_test_is_blocking: index === 22 ? "not for release" : "varies",
      whether_command_only_checks_exit_code: index >= 19 ? "possible" : "unknown",
      whether_human_review_exists: common.human_review_exists,
      current_truthful_status: status,
      evidence
    });
  }
  return { generated_at: nowIso(), allowed_statuses: ["verified_live", "verified_safety_or_infrastructure", "partial", "test_only", "shadow_only", "audit_only", "invalid_proxy", "false_green", "not_implemented", "unknown"], milestones: rows, entity_specific_debt_summary: entityDebt.debt };
}

function summarizeReport(report) {
  const statusCounts = {};
  for (const row of report.milestone_truth_manifest.milestones) {
    statusCounts[row.current_truthful_status] = (statusCounts[row.current_truthful_status] || 0) + 1;
  }
  return {
    conclusion: report.final_conclusion,
    audit_invalid: report.snapshot_validation.audit_invalid,
    milestone_status_counts: statusCounts,
    hard_live_failure_count: report.live_blackbox.hard_live_failure_count,
    false_green_path_count: report.false_green_paths.false_green_path_count,
    proxy_conflict_count: report.proxy_conflicts.conflict_count,
    entity_specific_debt_files: report.entity_specific_debt.debt.length
  };
}

function markdownTable(rows, columns) {
  const header = `| ${columns.map((column) => column.label).join(" |")} |`;
  const divider = `| ${columns.map(() => "---").join(" |")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(column.value(row) ?? "").replace(/\|/g, "\\|")).join(" |")} |`);
  return [header, divider, ...body].join("\n");
}

function makeMarkdown(report) {
  const summary = summarizeReport(report);
  const hardExamples = report.live_blackbox.hard_live_failures.slice(0, 12);
  const falseGreenExamples = report.false_green_paths.paths.slice(0, 12);
  const liveSessions = report.live_blackbox.sessions
    .slice(0, 2)
    .map((session) => {
      const turns = (session.turns || [])
        .map((turn) => `${turn.turn_index}. 用户：${turn.user}\n   live：${turn.live_answer}\n   failures：${turn.hard_live_failures.join(", ") || "none"}`)
        .join("\n");
      return `### ${session.id}\n\n${turns}`;
    })
    .join("\n\n");
  return `# R0-R22 Truth Audit

Baseline commit: \`${report.baseline_commit}\`  
Evaluated commit: \`${report.evaluated_commit}\`  
Generated at: \`${report.generated_at}\`  
Final conclusion: **${report.final_conclusion}**

This audit did not modify live runtime, eval fixtures, thresholds, knowledge cards, answerIndex, generated router files, or package test commands. It uses current live answers only for black-box behavior checks and does not substitute the R22 shadow candidate.

## Summary

${markdownTable(
  [
    { metric: "audit_invalid", value: summary.audit_invalid },
    { metric: "hard_live_failure_count", value: summary.hard_live_failure_count },
    { metric: "false_green_path_count", value: summary.false_green_path_count },
    { metric: "proxy_conflict_count", value: summary.proxy_conflict_count },
    { metric: "entity_specific_debt_files", value: summary.entity_specific_debt_files }
  ],
  [
    { label: "Metric", value: (row) => row.metric },
    { label: "Value", value: (row) => row.value }
  ]
)}

## Milestone Status

${markdownTable(
  report.milestone_truth_manifest.milestones,
  [
    { label: "Milestone", value: (row) => row.milestone },
    { label: "Truth Status", value: (row) => row.current_truthful_status },
    { label: "Evidence", value: (row) => row.evidence }
  ]
)}

## Live Black-Box Hard Failures

${hardExamples
  .map(
    (item) =>
      `- \`${item.session_id}#${item.turn_index}\` ${item.failure}: 用户「${item.user}」 -> 「${item.answer}」`
  )
  .join("\n") || "- None detected by this audit."}

## Fixed Live Sessions

${liveSessions}

## False-Green Paths

${falseGreenExamples
  .map((item) => `- ${item.severity}: ${item.file}${item.line ? `:${item.line}` : ""} — ${item.mechanism}`)
  .join("\n")}

## Test-Vs-Live Contradictions

- R21 fixtures can reward words such as “投射”, “接住”, and “更深”, while R22 natural-surface governance treats visible taxonomy and artificial bridge language as suspicious.
- R22 shadow/audit success does not imply live behavior success; live current answers still contain implementation leakage, profile template language, and wrong-domain routing in sampled sessions.
- check/release and cycle scripts can report command success without blocking on R22 live naturalness failures.

## Existing Entity-Specific Debt

${report.entity_specific_debt.debt
  .map((entry) => `- ${entry.file}: ${entry.hits.map((hit) => `${hit.pattern}=${hit.count}`).join(", ")}`)
  .join("\n") || "- No configured entity-specific debt hits found."}

## Architecture Limitations

${report.architecture_boundary.mechanisms
  .map((mechanism) => {
    const unlikely = Object.entries(mechanism.verdicts)
      .filter(([, verdict]) => verdict === "unlikely without generative surface model")
      .map(([capability]) => capability);
    return `- ${mechanism.mechanism}: unlikely for ${unlikely.join(", ") || "no configured capability"} without a stronger surface/composition path.`;
  })
  .join("\n")}

## What Is Genuinely Working

- Repository safety, deployment/parity instrumentation, browser smoke infrastructure, and many deterministic safety gates are materially stronger than the natural-language surface layer.
- Conversation-controller traces and typed fields exist, which makes failures observable.
- R22 shadow work remains non-live; public visible answers were not switched during this audit.

## What Is Only Infrastructure Or Shadow-Only

- R20/R22 endpoint and naturalness checks are useful infrastructure, but they do not prove live natural conversation.
- R22 shadow candidate behavior is not live behavior and has not passed independent human review.

## What Has Not Been Demonstrated

- Robust live contextual understanding.
- Generalized non-question dialogue uptake.
- Natural surface without implementation terms or profile templates.
- Independent blind evaluation of R21/R22 conversational quality.

## Unknowns

- Factual correctness for broad culture/domain answers was not externally adjudicated in this audit.
- The complete historical effect of every eval mutation remains partially unknown without a deeper line-level semantic review.

## Snapshot Validation

\`\`\`json
${JSON.stringify(report.snapshot_validation, null, 2)}
\`\`\`
`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(dirname(DOC_PATH), { recursive: true });
  const before = await repoSnapshot("before_truth_audit");
  await writeFile(resolve(OUT_DIR, "repo_snapshot.json"), `${JSON.stringify(before, null, 2)}\n`, "utf8");

  const [liveBlackbox, falseGreen, integrity, proxyConflicts, entityDebt] = await Promise.all([
    runLiveBlackbox(),
    falseGreenPaths(),
    testIntegrityHistory(),
    proxyConflictAudit(),
    entitySpecificDebt()
  ]);
  const arch = architectureBoundary();
  const manifest = milestoneTruthManifest(liveBlackbox, falseGreen, proxyConflicts, entityDebt);
  const after = await repoSnapshot("after_truth_audit");
  const validation = snapshotDiff(before, after);
  const finalConclusion =
    liveBlackbox.hard_live_failure_count > 0 || falseGreen.false_green_path_count > 0
      ? "R0–R22 not verified"
      : "R0–R22 partially verified";

  const report = {
    generated_at: nowIso(),
    baseline_commit: BASELINE,
    evaluated_commit: before.head,
    final_conclusion: finalConclusion,
    audit_scope: {
      runtime_patches_allowed: false,
      test_modifications_allowed: false,
      shadow_candidate_substitution_allowed: false,
      live_runtime_blackbox_used: true
    },
    snapshot_validation: validation,
    milestone_truth_manifest: manifest,
    test_integrity_history: integrity,
    false_green_paths: falseGreen,
    live_blackbox: liveBlackbox,
    proxy_conflicts: proxyConflicts,
    entity_specific_debt: entityDebt,
    architecture_boundary: arch,
    genuinely_working: [
      "repository/deployment instrumentation",
      "typed traces",
      "deterministic safety gates",
      "non-live R22 shadow plumbing"
    ],
    only_infrastructure_or_shadow: ["R22 shadow realizer", "endpoint metrics without independent live quality proof"],
    not_demonstrated: [
      "generalized live contextual understanding",
      "natural non-question response",
      "independent blind R21/R22 evaluation",
      "live natural surface without templates"
    ],
    unknown: ["full factual correctness of all culture answers", "complete semantic effect of every eval history change"]
  };

  await writeFile(resolve(OUT_DIR, "test_integrity_history.json"), `${JSON.stringify(integrity, null, 2)}\n`, "utf8");
  await writeFile(resolve(OUT_DIR, "false_green_paths.json"), `${JSON.stringify(falseGreen, null, 2)}\n`, "utf8");
  await writeFile(resolve(OUT_DIR, "live_blackbox_sessions.json"), `${JSON.stringify(liveBlackbox, null, 2)}\n`, "utf8");
  await writeFile(resolve(OUT_DIR, "r0_r22_truth_audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(DOC_PATH, makeMarkdown(report), "utf8");

  console.log(JSON.stringify(summarizeReport(report), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
