#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_ROOT = join(ROOT, "artifacts", "r30j0");
const OWNER_REVIEW_ROOT = join(ARTIFACT_ROOT, "owner_review");

const SOURCE_PATHS = {
  dataset_design: join(ROOT, "config", "r30j0_dataset_design_v1.json"),
  generic_baseline: join(ROOT, "config", "r30j0_generic_baseline_v1.json"),
  oracle_experiments: join(ROOT, "config", "r30j0_oracle_experiments_v1.json"),
  charter: join(ROOT, "data", "personal_judge", "efish_personal_preference_charter_v1.json"),
  pack_template: join(ROOT, "data", "personal_judge", "templates", "r30j0_owner_review_pack_template_v1.json"),
  ui_html: join(ROOT, "data", "personal_judge", "templates", "owner_review_ui", "index.html"),
  ui_css: join(ROOT, "data", "personal_judge", "templates", "owner_review_ui", "review.css"),
  ui_js: join(ROOT, "data", "personal_judge", "templates", "owner_review_ui", "review.js"),
};

const REQUIRED_DIRECTORIES = [
  "architecture",
  "dataset_design",
  "pilot",
  "owner_review",
  "latency_model",
  "reports",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function atomicWrite(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, value, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function assertExactTaxonomy(actual, expected, name) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`r30j0_taxonomy_mismatch:${name}`);
  }
}

function emptyOwnerQuestions(includePresentation = true) {
  return {
    feels_like_efish: null,
    too_assistant_like: null,
    too_short: null,
    too_cold: null,
    too_polished: null,
    ...(includePresentation ? { presentation_appropriate: null } : {}),
    notes: "",
  };
}

function createPilotSlot(index) {
  return {
    slot_id: `pilot-${String(index + 1).padStart(3, "0")}`,
    content_status: "awaiting_public_safe_content",
    review_status: "unreviewed",
    content: {
      context: "",
      latest_user_message: "",
      deepseek_answer: "",
    },
    public_safe: null,
    source_kind: null,
    generic_quality_status: "NOT_ASSESSED",
    duplicate_group_id: null,
    owner_labels: {
      personal_fit_label: null,
      voice_issue_labels: [],
      presentation_label: null,
      confidence_target: null,
      ...emptyOwnerQuestions(true),
    },
    allowed_for_training: false,
  };
}

function createContrastSlot(index) {
  return {
    slot_id: `contrast-${String(index + 1).padStart(3, "0")}`,
    content_status: "awaiting_public_safe_content",
    review_status: "unreviewed",
    content: {
      context: "",
      latest_user_message: "",
      answer_A: "",
      answer_B: "",
    },
    public_safe: null,
    same_factual_content_verified: false,
    control_kind: null,
    owner_labels: {
      owner_preference: null,
      ...emptyOwnerQuestions(false),
    },
    allowed_for_training: false,
    product_pairwise_architecture: false,
  };
}

const [datasetDesignText, genericBaselineText, oracleExperimentsText, charterText, packTemplateText] =
  await Promise.all([
    readFile(SOURCE_PATHS.dataset_design, "utf8"),
    readFile(SOURCE_PATHS.generic_baseline, "utf8"),
    readFile(SOURCE_PATHS.oracle_experiments, "utf8"),
    readFile(SOURCE_PATHS.charter, "utf8"),
    readFile(SOURCE_PATHS.pack_template, "utf8"),
  ]);

const datasetDesign = JSON.parse(datasetDesignText);
const genericBaseline = JSON.parse(genericBaselineText);
const oracleExperiments = JSON.parse(oracleExperimentsText);
const charter = JSON.parse(charterText);
const packTemplate = JSON.parse(packTemplateText);

assertExactTaxonomy(datasetDesign.personal_fit_labels, ["PERSONAL_FIT", "NEUTRAL", "PERSONAL_MISMATCH"], "personal_fit");
assertExactTaxonomy(datasetDesign.voice_issue_labels, [
  "too_formal",
  "too_verbose",
  "too_assistant_like",
  "too_cold",
  "too_warm",
  "too_explanatory",
  "too_structured",
  "too_generic",
  "too_apologetic",
  "too_enthusiastic",
  "unnecessary_question",
  "unnecessary_disclaimer",
  "repetitive",
  "textbook_tone",
], "voice_issue");
assertExactTaxonomy(datasetDesign.presentation_labels, ["compact", "quiet", "reflective", "direct", "playful_light", "neutral"], "presentation");
assertExactTaxonomy(datasetDesign.confidence_targets, ["CONFIDENT_PERSONALIZE", "DEFAULT_PRESENTATION", "OUT_OF_SCOPE"], "confidence");

if (datasetDesign.pilot.owner_review_example_slots !== 200 || datasetDesign.pilot.owner_review_contrast_pair_slots < 100) {
  throw new Error("r30j0_owner_review_slot_contract_invalid");
}
if (datasetDesign.pilot.generated_example_count_j0 !== 0 || datasetDesign.j0_execution.training_started) {
  throw new Error("r30j0_j0_no_generation_or_training_contract_violated");
}
if (packTemplate.owner_review_completed || packTemplate.owner_labels_in_template || packTemplate.training_examples_in_template) {
  throw new Error("r30j0_owner_review_template_must_be_empty");
}

const sourceDigest = sha256([
  datasetDesignText,
  genericBaselineText,
  oracleExperimentsText,
  charterText,
  packTemplateText,
].join("\n--r30j0-source-boundary--\n"));

const presentationContracts = {
  compact: "Faster reveal, tighter spacing and minimal motion; answer text is unchanged.",
  quiet: "Slower subtle reveal, larger whitespace, no suggestion chips and low motion; answer text is unchanged.",
  reflective: "Slightly slower rhythm, more breathing room and an optional subtle pre-display pause; answer text is unchanged.",
  direct: "Immediate clean reveal with minimal decoration; answer text is unchanged.",
  playful_light: "Slightly livelier micro-animation without semantic text modification.",
  neutral: "Default system presentation with no answer-text modification.",
};

const reviewPack = {
  schema_version: "r30j0.owner_review_state.v1",
  campaign_id: datasetDesign.campaign_id,
  model_family: datasetDesign.model_family,
  pack_id: `r30j0-owner-review-${sourceDigest.slice(0, 16)}`,
  source_contract_sha256: sourceDigest,
  status: "owner_review_required",
  owner_review_completed: false,
  validated_export: false,
  allowed_for_training: false,
  training_authorized: false,
  local_only: true,
  network_required: false,
  contains_private_profile: false,
  contains_owner_labels: false,
  contains_training_examples: false,
  charter_snapshot: charter,
  profile_taxonomy: datasetDesign.personal_profile_taxonomy,
  candidate_profile: packTemplate.candidate_profile,
  charter_review: {
    reviewed: false,
    notes: "",
  },
  taxonomy_review: {
    personal_fit: {
      title: "Personal Fit (3-class)",
      labels: datasetDesign.personal_fit_labels,
      reviewed: false,
      notes: "",
    },
    voice_issue: {
      title: "Voice Issue (14-label multi-label)",
      labels: datasetDesign.voice_issue_labels,
      reviewed: false,
      notes: "",
    },
    presentation: {
      title: "Presentation Mode (6-class)",
      labels: datasetDesign.presentation_labels,
      reviewed: false,
      notes: "",
    },
    confidence: {
      title: "Confidence / Abstention (3-class)",
      labels: datasetDesign.confidence_targets,
      reviewed: false,
      notes: "",
    },
  },
  presentation_review: Object.fromEntries(datasetDesign.presentation_labels.map((label) => [
    label,
    {
      contract: presentationContracts[label],
      appropriate: null,
      reviewed: false,
      notes: "",
    },
  ])),
  review_questions: packTemplate.review_questions,
  pilot_slots: Array.from({ length: 200 }, (_, index) => createPilotSlot(index)),
  contrast_slots: Array.from({ length: 100 }, (_, index) => createContrastSlot(index)),
  owner_attestation: packTemplate.owner_attestation,
  export_contract: {
    draft_keeps_owner_review_completed_false: true,
    validated_export_requires_populated_pilot_slots: 200,
    validated_export_requires_populated_contrast_slots: 100,
    validated_export_requires_charter_review: true,
    validated_export_requires_taxonomy_review: true,
    validated_export_requires_presentation_review: true,
    validated_export_authorizes_training: false,
  },
};

if (reviewPack.pilot_slots.some((slot) => slot.content.latest_user_message || slot.content.deepseek_answer)) {
  throw new Error("r30j0_builder_must_not_generate_pilot_content");
}
if (reviewPack.contrast_slots.some((slot) => slot.content.answer_A || slot.content.answer_B)) {
  throw new Error("r30j0_builder_must_not_generate_contrast_content");
}

for (const directory of REQUIRED_DIRECTORIES) {
  await mkdir(join(ARTIFACT_ROOT, directory), { recursive: true, mode: 0o700 });
}

const uiFiles = {
  "index.html": await readFile(SOURCE_PATHS.ui_html, "utf8"),
  "review.css": await readFile(SOURCE_PATHS.ui_css, "utf8"),
  "review.js": await readFile(SOURCE_PATHS.ui_js, "utf8"),
  "review_data.js": `"use strict";\nwindow.R30J0_REVIEW_PACK = ${JSON.stringify(reviewPack, null, 2).replace(/</gu, "\\u003c")};\n`,
};

for (const [name, content] of Object.entries(uiFiles)) {
  await atomicWrite(join(OWNER_REVIEW_ROOT, name), content);
}

const reviewReadme = `# R30J0 owner review pack\n\nOpen \`index.html\` directly in a browser. No local server and no network are required.\n\nThe initial pack contains 200 empty pilot review slots and 100 empty contrast-pair review slots. It contains no training examples, owner labels or private profile values. Populate only public-safe content. Draft exports always keep \`owner_review_completed=false\`. A validated export requires every slot, the charter, all taxonomies, all presentation modes and the owner attestation. A validated export still keeps \`allowed_for_training=false\` and does not authorize training in J0.\n\nBrowser progress is local and deletable. Use the UI export buttons for durable files; never commit an owner review export.\n`;
await atomicWrite(join(OWNER_REVIEW_ROOT, "README.md"), reviewReadme);
await atomicWrite(join(OWNER_REVIEW_ROOT, "initial_review_state.json"), `${JSON.stringify(reviewPack, null, 2)}\n`);

const datasetSnapshot = {
  schema_version: "r30j0.dataset_readiness_snapshot.v1",
  status: "design_ready_owner_review_required",
  dataset_design: datasetDesign,
  generic_baseline: genericBaseline,
  oracle_experiments: oracleExperiments,
  generated_training_example_count: 0,
  owner_review_completed: false,
  training_authorized: false,
};
await atomicWrite(join(ARTIFACT_ROOT, "dataset_design", "public_safe_design_snapshot.json"), `${JSON.stringify(datasetSnapshot, null, 2)}\n`);

const pilotReadiness = {
  schema_version: "r30j0.pilot_readiness.v1",
  status: "slots_ready_content_not_generated",
  designed_pilot_examples: 400,
  generated_pilot_examples: 0,
  owner_review_slots: 200,
  contrast_pair_review_slots: 100,
  populated_owner_review_slots: 0,
  populated_contrast_pair_slots: 0,
  owner_review_completed: false,
  allowed_for_training: false,
};
await atomicWrite(join(ARTIFACT_ROOT, "pilot", "readiness.json"), `${JSON.stringify(pilotReadiness, null, 2)}\n`);
await atomicWrite(join(ARTIFACT_ROOT, "architecture", "dataset_review_dependency.json"), `${JSON.stringify({
  schema_version: "r30j0.architecture_dataset_dependency.v1",
  owner_approved_pilot_required_before_probe_training: true,
  current_owner_approved_example_count: 0,
  training_started: false,
}, null, 2)}\n`);
await atomicWrite(join(ARTIFACT_ROOT, "latency_model", "dataset_review_dependency.json"), `${JSON.stringify({
  schema_version: "r30j0.latency_dataset_dependency.v1",
  measured_browser_judge_latency: null,
  owner_review_has_no_network_dependency: true,
  performance_claim_allowed: false,
}, null, 2)}\n`);

const generatedFileNames = [...Object.keys(uiFiles), "README.md", "initial_review_state.json"];
const ownerReviewFileManifest = {};
for (const file of generatedFileNames) {
  const content = await readFile(join(OWNER_REVIEW_ROOT, file));
  ownerReviewFileManifest[file] = { bytes: content.length, sha256: sha256(content) };
}
const ownerReviewManifest = {
  schema_version: "r30j0.owner_review_manifest.v1",
  campaign_id: datasetDesign.campaign_id,
  pack_id: reviewPack.pack_id,
  local_only: true,
  network_requests: 0,
  server_required: false,
  secret_included: false,
  private_profile_included: false,
  owner_labels_included: false,
  training_examples_included: false,
  pilot_slots: 200,
  populated_pilot_slots: 0,
  contrast_slots: 100,
  populated_contrast_slots: 0,
  owner_review_completed: false,
  validated_owner_export_present: false,
  training_authorized: false,
  files: ownerReviewFileManifest,
};
await atomicWrite(join(OWNER_REVIEW_ROOT, "manifest.json"), `${JSON.stringify(ownerReviewManifest, null, 2)}\n`);

const readinessReport = {
  schema_version: "r30j0.dataset_readiness_report.v1",
  campaign_id: datasetDesign.campaign_id,
  status: "HUMAN_OWNER_REVIEW_REQUIRED",
  dataset_schema_ready: true,
  dataset_design_ready: true,
  mutation_contract_ready: true,
  generic_baseline_specified: true,
  oracle_experiments_specified: true,
  owner_review_ui_ready: true,
  owner_review_ui_static_contract_validated: true,
  owner_review_ui_browser_interaction_verified: false,
  owner_review_ui_browser_interaction_note: "Not claimed by this builder; review.js syntax and zero-network source contract are validated separately.",
  owner_review_completed: false,
  validated_owner_export_present: false,
  generated_training_examples: 0,
  owner_labels_collected: 0,
  private_profile_values_collected: 0,
  training_started: false,
  classification_updates: 0,
  api_requests: 0,
};
await atomicWrite(join(ARTIFACT_ROOT, "reports", "dataset_readiness.json"), `${JSON.stringify(readinessReport, null, 2)}\n`);

console.log(JSON.stringify({
  status: readinessReport.status,
  artifact_root: ARTIFACT_ROOT,
  owner_review_ui: join(OWNER_REVIEW_ROOT, "index.html"),
  pilot_slots: reviewPack.pilot_slots.length,
  populated_pilot_slots: 0,
  contrast_slots: reviewPack.contrast_slots.length,
  populated_contrast_slots: 0,
  owner_review_completed: false,
  training_started: false,
  api_requests: 0,
}));
