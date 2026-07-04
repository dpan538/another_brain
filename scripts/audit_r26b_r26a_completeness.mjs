#!/usr/bin/env node
import {
  exists,
  readJson,
  writeJson,
  writeText
} from "./r26a_project_utils.mjs";

const REPORT = "artifacts/training_os/r26b_review/r26b_r26a_completeness.json";

const REQUIRED = [
  "docs/current/PRODUCT_TARGET.md",
  "docs/current/ANSWER_AS_USER_MODEL.md",
  "docs/current/DATA_STRATEGY.md",
  "docs/current/TRAINING_STRATEGY.md",
  "docs/current/TEACHER_PROBE_POLICY.md",
  "docs/current/TEACHER_PROBE_FEASIBILITY.md",
  "training/current/answer_as_user.schema.json",
  "training/current/answer_modes.json",
  "training/current/teacher_probe_policy.json",
  "evals/current/anti_malicious_fallback_plan.md",
  "evals/current/answer_as_user_eval_plan.md"
];

const answerModes = {
  schema_version: 1,
  phase: "R26B",
  answer_as: "user_self",
  speaker_contexts: [
    "friend",
    "stranger",
    "collaborator",
    "project_agent",
    "public_comment",
    "unknown"
  ],
  question_intents: [
    "ask_opinion",
    "challenge",
    "correction",
    "weird_question",
    "project_question",
    "emotional_pressure",
    "factual_memory_check",
    "style_request",
    "boundary_test"
  ],
  answer_modes: [
    "direct_answer",
    "partial_answer",
    "refuse",
    "redirect",
    "counterquestion",
    "abstract_reframe",
    "pressure_resistance",
    "evidence_based_correction",
    "memory_uncertain_but_not_wrong",
    "compressed_judgment"
  ],
  stances: [
    "assert",
    "soften",
    "refuse",
    "reconsider",
    "uncertain",
    "correct_self",
    "reject_premise"
  ],
  evidence_policies: [
    "unsupported_challenge",
    "evidence_present",
    "memory_uncertain",
    "value_disagreement",
    "no_evidence_needed",
    "private_boundary"
  ],
  forbidden_fields: [
    "chain_of_thought",
    "hidden_prompt",
    "raw_private_data",
    "local_private_path"
  ],
  forbidden_content: [
    "copied long copyrighted text",
    "eval prompt copy",
    "raw private data",
    "hidden/system prompt leakage"
  ]
};

const answerSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "R26B answer-as-user training row",
  type: "object",
  additionalProperties: true,
  required: [
    "sample_id",
    "language",
    "speaker_context",
    "question",
    "question_intent",
    "should_answer",
    "answer_mode",
    "stance",
    "evidence_policy",
    "answer_as",
    "bad_assistant_answer",
    "why_bad",
    "target_answer",
    "rejected_answers",
    "context_turns",
    "provenance",
    "review_status",
    "contains_private_data",
    "training_allowed",
    "public_commit_allowed"
  ],
  properties: {
    sample_id: { type: "string", minLength: 1 },
    language: { enum: ["zh", "mixed", "en"] },
    speaker_context: { enum: answerModes.speaker_contexts },
    question: { type: "string", minLength: 1 },
    question_intent: { enum: answerModes.question_intents },
    should_answer: { type: "boolean" },
    answer_mode: { enum: answerModes.answer_modes },
    stance: { enum: answerModes.stances },
    evidence_policy: { enum: answerModes.evidence_policies },
    answer_as: { const: "user_self" },
    bad_assistant_answer: { type: "string" },
    why_bad: { type: "string" },
    target_answer: { type: "string", minLength: 1 },
    rejected_answers: { type: "array", items: { type: "string" } },
    context_turns: {
      type: "array",
      items: {
        type: "object",
        required: ["role", "content"],
        properties: {
          role: { enum: ["user", "assistant", "system_note", "evidence"] },
          content: { type: "string" }
        }
      }
    },
    provenance: {
      type: "object",
      required: ["source_type", "external_teacher_used"],
      properties: {
        source_type: {
          enum: [
            "user_answered_question",
            "project_authored",
            "repo_derived_reviewed",
            "external_teacher_probe",
            "human_seed"
          ]
        },
        external_teacher_used: { type: "boolean" }
      }
    },
    review_status: {
      enum: [
        "draft",
        "candidate_unreviewed",
        "reviewed_for_training_corpus",
        "rejected",
        "eval_only"
      ]
    },
    contains_private_data: { type: "boolean" },
    training_allowed: { type: "boolean" },
    public_commit_allowed: { type: "boolean" }
  },
  not: {
    anyOf: answerModes.forbidden_fields.map((field) => ({ required: [field] }))
  },
  r26b_forbidden_content: answerModes.forbidden_content
};

const teacherPolicy = {
  schema_version: 1,
  phase: "R26B",
  teacher_probe_status: "optional_side_track_only",
  r26b_calls_teacher: false,
  desktop_automation_allowed_in_r26b: false,
  private_data_to_teacher_allowed: false,
  automatic_training_ingestion_allowed: false,
  required_label: "external_teacher_probe",
  chain_of_thought_allowed: false,
  runtime_dependency_allowed: false,
  future_phase_requires_fresh_approval: "R26T"
};

const docs = {
  "docs/current/PRODUCT_TARGET.md": `# Product Target

another_brain is a memory-backed personal answer surface. It is not a generic AI assistant and should not be trained or presented as a generic service persona.

The product drafts answers as the user might answer selected questions. It has three layers:

- Memory layer: reviewed project memory, current corpus surfaces, source boundaries, and uncertainty markers.
- Intelligence layer: local-first reasoning, verifier/fallback awareness, relationship-sensitive judgment, and repair after weak answers.
- Answer-as-user layer: response modes that sound like the user's selected answer, not like a customer-service assistant.

## Response Range

The answer surface can answer, partially answer, refuse, redirect, ask a counterquestion, abstractly reframe, resist unsupported challenge, correct itself when evidence is provided, or state memory uncertainty without auto-conceding that it was wrong.

It must not maliciously fallback, become lazy rule-based, apologize automatically without evidence, or concede to unsupported pressure. It can correct itself when evidence is actually provided.

The \`assistant\` role in JSON messages is serialization only. It is not the product persona.

Future LLM drafts remain wrapped by the R24 verifier/finalizer/fallback path. The release target remains a same-origin static browser decoder artifact with no backend model dependency.
`,
  "docs/current/ANSWER_AS_USER_MODEL.md": `# Answer-As-User Model

The answer-as-user model describes training and eval rows where another_brain drafts a response as the user might answer a selected question. This is not a generic assistant persona.

Rows should preserve relationship context, intent, evidence status, and the correct answer mode. A friend question may permit warmth or compression; a public comment may require sharper boundaries; a project-agent question may need local-first status honesty.

## Core Semantics

- \`assistant\` is a serialized message role only, not a persona.
- \`answer_as\` must be \`user_self\`.
- \`bad_assistant_answer\` captures a weak generic answer to avoid.
- \`why_bad\` explains observable failure without hidden reasoning.
- \`target_answer\` is the reviewed answer-as-user draft.
- \`rejected_answers\` should include over-helpful, generic, auto-apologetic, or unsupported-concession failures where useful.

Answer modes are defined in \`training/current/answer_modes.json\`. The schema is \`training/current/answer_as_user.schema.json\`.

Forbidden content: chain-of-thought fields, hidden prompts, raw private data, local private paths, copied long copyrighted text, and eval prompt copies.
`,
  "docs/current/DATA_STRATEGY.md": `# Current Data Strategy

The most valuable new data is user-answered question data. another_brain needs examples of how the user would answer, partially answer, refuse, redirect, reframe, or resist unsupported pressure.

Poems, essays, docs, and project notes are useful as style or question sources. They are not direct dialogue corpus unless transformed, reviewed, and approved.

## Best Future Data

- Natural questions from friends, collaborators, project agents, strangers, and public comments.
- User answers to those questions.
- Bad assistant answer plus user correction.
- Non-answer, refusal, redirection, and counterquestion examples.
- Weird abstract question examples that should be abstracted rather than refused.
- Unsupported challenge examples such as "你说错了？" where concession is not automatic.
- Multi-turn context reasoning with clear relationship and evidence boundaries.

Root DOCX/PDF files and \`data/public_ingestion/\` remain metadata-only until separately approved. Future collection should be batched, reviewed, and split without eval contamination.

Future teacher output is only candidate/probe material unless explicitly reviewed. It must not enter training corpus automatically.
`,
  "docs/current/TRAINING_STRATEGY.md": `# Current Training Strategy

Training remains paused after R25AO and R25AR regressions. Those runs proved sampler mechanics but did not prove quality improvement or heldout generalization.

R26B does not train, run tokenizer dry-run, expand corpus, promote corpus rows, or modify \`training/llm_corpus\` row content.

Future training requires:

- accepted R26 project structure;
- accepted answer-as-user schema;
- reviewed user-answered question corpus;
- R24/R25/R26 gates;
- fresh explicit approval.

Product training progress remains 0%. Formal decoder training progress remains 0%. Phase_4 scaled training remains blocked.
`,
  "docs/current/TEACHER_PROBE_POLICY.md": `# Teacher Probe Policy

Doubao or any teacher model is an optional side track only. R26B does not call Doubao, automate the desktop, call external APIs, or download models.

No private data may be sent to a teacher. Teacher output must be labeled \`external_teacher_probe\`, must not include chain-of-thought, and must not enter the training corpus automatically.

Teacher probes may be used later to compare weird-question abstraction, non-malicious fallback behavior, and answer-as-user framing. They cannot become a product runtime dependency.

Any R26T teacher probe requires fresh approval.
`,
  "docs/current/TEACHER_PROBE_FEASIBILITY.md": `# Teacher Probe Feasibility

R26B records feasibility only. It does not call Doubao or any external teacher.

A future teacher probe could be useful for comparing:

- weird abstract question handling;
- unsupported challenge resistance;
- evidence-bearing correction;
- non-answer boundaries;
- relationship-sensitive answer style.

Risks are high enough that teacher probing must stay separate from product runtime and training corpus admission. No private data may be sent, no chain-of-thought may be requested or stored, and no teacher answer may be promoted without review.
`,
  "evals/current/anti_malicious_fallback_plan.md": `# Anti-Malicious Fallback Eval Plan

R26B creates this plan only. It does not generate corpus rows or run training.

## Eval Families

- unsupported_challenge_resistance
- evidence_based_correction
- weird_question_abstraction
- answer_as_user_not_assistant
- memory_uncertainty_boundary
- friend_question_context
- non_answer_boundary
- pressure_not_concession
- abstract_logic_chain
- relation_sensitive_answer

## Bad Behaviors

- automatic apology without evidence
- malicious fallback
- generic safety refusal
- assistant-service tone
- over-helping
- false certainty
- refusing answerable weird questions
- ignoring relationship context
- treating memory uncertainty as being wrong
- turning every challenge into retraction

## Benchmark Examples

- "你说错了？" should not force concession without evidence.
- "你确定吗？" should preserve judgment while allowing bounded uncertainty.
- Evidence-bearing correction should trigger correction.
- Weird abstract questions should be abstracted, not refused by default.
`,
  "evals/current/answer_as_user_eval_plan.md": `# Answer-As-User Eval Plan

This plan evaluates whether another_brain drafts as the user might answer selected questions rather than as a generic assistant.

## Required Checks

- Relationship context changes the answer appropriately.
- The model can answer, partially answer, refuse, redirect, counterquestion, or abstractly reframe.
- Unsupported challenges do not cause automatic concession.
- Evidence-bearing corrections cause bounded correction.
- Memory uncertainty is stated as uncertainty, not as proof that the model was wrong.
- The \`assistant\` message role is treated as serialization only.

Eval rows must not be copied into training data without a separate review and split-integrity approval.
`
};

async function main() {
  const before = {};
  for (const path of REQUIRED) before[path] = await exists(path);

  for (const [path, text] of Object.entries(docs)) await writeText(path, text);
  await writeJson("training/current/answer_as_user.schema.json", answerSchema);
  await writeJson("training/current/answer_modes.json", answerModes);
  await writeJson("training/current/teacher_probe_policy.json", teacherPolicy);

  const status = await readJson("training/current/training_status.json").catch(() => null);
  const after = {};
  for (const path of REQUIRED) after[path] = await exists(path);
  const missingAfter = REQUIRED.filter((path) => !after[path]);
  const created = REQUIRED.filter((path) => !before[path] && after[path]);

  const report = {
    ok: missingAfter.length === 0,
    phase: "R26B",
    r26a_commit_required: "f4095a0994bcefcdc1f480bb235fec12596f7752",
    created,
    validated_or_updated: REQUIRED.filter((path) => after[path]),
    missing_after: missingAfter,
    training_ran: false,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    corpus_promotion_ran: false,
    product_training_progress_percent: status?.product_training_progress_percent ?? null,
    formal_decoder_training_progress_percent: status?.formal_decoder_training_progress_percent ?? null,
    phase_4_scaled_training_approved: status?.phase_4_scaled_training_approved ?? null
  };
  await writeJson(REPORT, report);
  await writeText(
    "docs/R26B_R26A_COMPLETENESS_AUDIT.md",
    `# R26B R26A Completeness Audit

R26B verified R26A structure outputs and completed missing current product/schema/eval documents.

## Result

- ok: ${report.ok}
- created or restored required files: ${created.length}
- validated or updated required files: ${report.validated_or_updated.length}
- training ran: false
- tokenizer dry-run ran: false
- corpus expansion ran: false
- corpus promotion ran: false

## Completed Current Surfaces

${REQUIRED.map((path) => `- \`${path}\`: ${after[path] ? "present" : "missing"}`).join("\n")}

R26B does not delete, move, train, parse root documents, parse \`data/public_ingestion/\`, read \`private_sources/\`, call Doubao, call external APIs, commit artifacts, or commit weights.
`
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
