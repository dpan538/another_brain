#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REVIEW_ROOT = join(ROOT, "artifacts", "r30j0", "owner_review", "personal_source_review");
const TEMPLATE_ROOT = join(ROOT, "data", "personal_judge", "templates", "personal_source_review_ui");
const DEFAULT_PAYLOAD = join(REVIEW_ROOT, "sanitized_review_payload.json");

const SECTION_TITLES = Object.freeze({
  source_summary: "Source summary",
  style_hypotheses: "Style hypotheses",
  preference_evidence: "Preference evidence",
  contrast_pairs: "Contrast pairs",
  register_profiles: "Register profiles",
});
const SECTION_KEYS = Object.freeze(Object.keys(SECTION_TITLES));
const SOURCE_TYPES = new Set([
  "owner_authored_public_safe",
  "project_public_safe",
  "sanitized_personal_source",
  "derived_aggregate",
  "controlled_contrast",
]);
const ROOT_KEYS = new Set([
  "schema_version",
  "payload_id",
  "sanitized",
  "public_safe",
  "credential_free",
  "sensitive_raw_removed",
  "owner_review_completed",
  "profile_frozen",
  "allowed_for_training",
  "sections",
]);
const ITEM_KEYS = new Set([
  "item_id",
  "redacted_snippet",
  "source_type",
  "proposed_interpretation",
  "confidence",
  "conflicts",
  "sanitization",
]);
const SANITIZATION_KEYS = new Set([
  "redacted",
  "contains_sensitive_raw",
  "contains_credentials",
]);
const FORBIDDEN_KEY = /(?:^|_)(?:api_?key|authorization|password|credential|secret|access_?token|refresh_?token|raw_?(?:text|excerpt|content)|full_?(?:text|excerpt|content)|source_?path|absolute_?path|private_?path|email|phone|identifier)(?:$|_)/iu;
const FORBIDDEN_TEXT = [
  /\bAuthorization\s*:/iu,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/u,
  /\bsk-[A-Za-z0-9_-]{8,}/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /(?<!\d)(?:\+?\d[\s().-]?){8,15}(?!\d)/u,
  /(?:^|[\s"'`])\/(?:Users|private|home|var\/folders)\//u,
  /\b[A-Za-z]:\\(?:Users|Documents|AppData)\\/u,
  /(?:身份证|护照|银行卡|银行账号|账户号码|卡号|account\s*(?:number|no\.?))/iu,
  /(?:家庭住址|居住地址|邮寄地址|门牌号|住在.{0,16}(?:路|街|号))/u,
  /(?:诊断|病史|病历|处方|健康状况|心理疾病|mental\s+health|medical\s+record)/iu,
  /(?:宗教信仰|教派|religious\s+belief|religion\s*:)/iu,
  /(?:政治立场|政党偏好|投票偏好|political\s+(?:belief|affiliation))/iu,
  /(?:性取向|性别认同|sexual\s+orientation|gender\s+identity)/iu,
  /(?:犯罪记录|刑事记录|案底|criminal\s+record)/iu,
  /(?:工资|薪资|收入|存款|负债|财务状况|bank\s+balance|financial\s+record)/iu,
  /(?:学号|成绩单|处分记录|校务|student\s+id|academic\s+record)/iu,
  /(?:工作机密|单位机密|人事档案|员工编号|绩效记录|employment\s+record|hr\s+record)/iu,
  /(?:第三方隐私|他人隐私|private\s+information\s+about\s+another\s+person)/iu,
];

function parseArguments(argv) {
  let payloadPath = DEFAULT_PAYLOAD;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--payload" || !argv[index + 1]) {
      throw new Error("usage: node scripts/r30j0_build_personal_source_review_pack.mjs [--payload <ignored-sanitized-payload.json>]");
    }
    payloadPath = resolve(argv[index + 1]);
    index += 1;
  }
  return { payloadPath };
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`r30j0_personal_source_expected_object:${label}`);
  }
}

function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      const reason = FORBIDDEN_KEY.test(key) ? "sensitive" : "unknown";
      throw new Error(`r30j0_personal_source_forbidden_field:${reason}:${label}:${key}`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`r30j0_personal_source_missing_field:${label}:${key}`);
    }
  }
}

function assertSafeText(value, label, maximum, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0) || value.length > maximum) {
    throw new Error(`r30j0_personal_source_invalid_text:${label}`);
  }
  if (FORBIDDEN_TEXT.some((pattern) => pattern.test(value))) {
    throw new Error(`r30j0_personal_source_sensitive_text_rejected:${label}`);
  }
}

function validatePayload(payload) {
  assertPlainObject(payload, "payload");
  assertExactKeys(payload, ROOT_KEYS, "payload");
  if (payload.schema_version !== "r30j0.personal_source_review_payload.v1") {
    throw new Error("r30j0_personal_source_schema_version_invalid");
  }
  assertSafeText(payload.payload_id, "payload_id", 96);
  if (!/^[a-z0-9][a-z0-9._-]{2,95}$/u.test(payload.payload_id)) {
    throw new Error("r30j0_personal_source_payload_id_invalid");
  }
  const exactFlags = {
    sanitized: true,
    public_safe: true,
    credential_free: true,
    sensitive_raw_removed: true,
    owner_review_completed: false,
    profile_frozen: false,
    allowed_for_training: false,
  };
  for (const [key, expected] of Object.entries(exactFlags)) {
    if (payload[key] !== expected) throw new Error(`r30j0_personal_source_flag_invalid:${key}`);
  }

  assertPlainObject(payload.sections, "sections");
  const actualSections = Object.keys(payload.sections).sort();
  if (JSON.stringify(actualSections) !== JSON.stringify([...SECTION_KEYS].sort())) {
    throw new Error("r30j0_personal_source_sections_invalid");
  }

  const seenItemIds = new Set();
  let itemCount = 0;
  for (const section of SECTION_KEYS) {
    const items = payload.sections[section];
    if (!Array.isArray(items) || items.length > 250) {
      throw new Error(`r30j0_personal_source_section_invalid:${section}`);
    }
    for (const [index, item] of items.entries()) {
      const label = `${section}[${index}]`;
      assertPlainObject(item, label);
      assertExactKeys(item, ITEM_KEYS, label);
      assertSafeText(item.item_id, `${label}.item_id`, 96);
      if (!/^[a-z0-9][a-z0-9._-]{2,95}$/u.test(item.item_id) || seenItemIds.has(item.item_id)) {
        throw new Error(`r30j0_personal_source_item_id_invalid:${item.item_id}`);
      }
      seenItemIds.add(item.item_id);
      assertSafeText(item.redacted_snippet, `${label}.redacted_snippet`, 280);
      assertSafeText(item.proposed_interpretation, `${label}.proposed_interpretation`, 600);
      if (!SOURCE_TYPES.has(item.source_type)) throw new Error(`r30j0_personal_source_type_invalid:${label}`);
      if (typeof item.confidence !== "number" || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) {
        throw new Error(`r30j0_personal_source_confidence_invalid:${label}`);
      }
      if (!Array.isArray(item.conflicts) || item.conflicts.length > 8) {
        throw new Error(`r30j0_personal_source_conflicts_invalid:${label}`);
      }
      item.conflicts.forEach((conflict, conflictIndex) => {
        assertSafeText(conflict, `${label}.conflicts[${conflictIndex}]`, 240);
      });
      assertPlainObject(item.sanitization, `${label}.sanitization`);
      assertExactKeys(item.sanitization, SANITIZATION_KEYS, `${label}.sanitization`);
      if (item.sanitization.redacted !== true || item.sanitization.contains_sensitive_raw !== false || item.sanitization.contains_credentials !== false) {
        throw new Error(`r30j0_personal_source_sanitization_invalid:${label}`);
      }
      itemCount += 1;
    }
  }
  if (itemCount > 750) throw new Error("r30j0_personal_source_payload_too_large");
  return itemCount;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function atomicWrite(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, value, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

function assertInsideReviewRoot(path) {
  const relativePath = relative(REVIEW_ROOT, path);
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === ".." || resolve(path) === REVIEW_ROOT) {
    throw new Error("r30j0_personal_source_payload_must_be_ignored_review_file");
  }
}

const { payloadPath } = parseArguments(process.argv.slice(2));
await mkdir(REVIEW_ROOT, { recursive: true, mode: 0o700 });
assertInsideReviewRoot(payloadPath);
const resolvedPayloadPath = await realpath(payloadPath);
assertInsideReviewRoot(resolvedPayloadPath);

const [payloadText, pageTemplate, cssTemplate, jsTemplate] = await Promise.all([
  readFile(resolvedPayloadPath, "utf8"),
  readFile(join(TEMPLATE_ROOT, "page.html"), "utf8"),
  readFile(join(TEMPLATE_ROOT, "review.css"), "utf8"),
  readFile(join(TEMPLATE_ROOT, "review.js"), "utf8"),
]);

for (const pattern of [/\bfetch\s*\(/u, /XMLHttpRequest/u, /WebSocket/u, /EventSource/u, /sendBeacon/u, /navigator\.send/u]) {
  if (pattern.test(jsTemplate)) throw new Error("r30j0_personal_source_network_capability_forbidden");
}

const payload = JSON.parse(payloadText);
const itemCount = validatePayload(payload);
const payloadDigest = sha256(payloadText);
const embeddedPayload = {
  ...payload,
  source_payload_sha256: payloadDigest,
};
const reviewData = `"use strict";\nwindow.R30J0_PERSONAL_SOURCE_REVIEW = ${JSON.stringify(embeddedPayload, null, 2)
  .replace(/</gu, "\\u003c")
  .replace(/\u2028/gu, "\\u2028")
  .replace(/\u2029/gu, "\\u2029")};\n`;

const generated = {
  "review.css": cssTemplate,
  "review.js": jsTemplate,
  "review_data.js": reviewData,
};
for (const section of SECTION_KEYS) {
  generated[`${section}.html`] = pageTemplate
    .replaceAll("{{SECTION_KEY}}", section)
    .replaceAll("{{SECTION_TITLE}}", SECTION_TITLES[section]);
}

for (const [name, content] of Object.entries(generated)) {
  await atomicWrite(join(REVIEW_ROOT, name), content);
}

const sectionCounts = Object.fromEntries(SECTION_KEYS.map((key) => [key, payload.sections[key].length]));
const fileManifest = {};
for (const [name, content] of Object.entries(generated)) {
  fileManifest[name] = { bytes: Buffer.byteLength(content), sha256: sha256(content) };
}
const manifest = {
  schema_version: "r30j0.personal_source_review_manifest.v1",
  payload_id: payload.payload_id,
  source_payload_sha256: payloadDigest,
  local_only: true,
  network_requests: 0,
  sanitized_payload_required: true,
  sensitive_raw_included: false,
  credential_included: false,
  owner_review_completed: false,
  profile_frozen: false,
  allowed_for_training: false,
  item_count: itemCount,
  section_counts: sectionCounts,
  files: fileManifest,
};
await atomicWrite(join(REVIEW_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  status: "PERSONAL_SOURCE_REVIEW_PACK_READY",
  artifact_root: "artifacts/r30j0/owner_review/personal_source_review",
  payload_id: payload.payload_id,
  item_count: itemCount,
  section_counts: sectionCounts,
  html_files: SECTION_KEYS.map((key) => `${key}.html`),
  owner_review_completed: false,
  profile_frozen: false,
  allowed_for_training: false,
  network_requests: 0,
}));
