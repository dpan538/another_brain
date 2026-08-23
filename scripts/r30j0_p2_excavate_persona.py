#!/usr/bin/env python3
"""Offline, privacy-preserving persona-evidence excavation for R30J0-P2.

The runner re-reads the frozen R30J0-P inventory/ledger and admitted owner
answer transcripts.  It writes only ignored, aggregate-safe hypothesis files:
no source passages, no owner labels, no training rows and no model updates.

An explicit current-owner assertion is intentionally supplied through an
ignored local JSON file rather than embedded in tracked code.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any, Iterable


SCRIPT_PATH = Path(__file__).resolve()
DEFAULT_ROOT = SCRIPT_PATH.parents[1]
sys.path.insert(0, str(DEFAULT_ROOT))

from src.personal_judge.persona_evidence_contract import (  # noqa: E402
    BEHAVIOUR_CLASSES,
    BOUNDARY_STATUSES,
    CLAIM_STATUSES,
    EPISTEMIC_PERSONA_CLASSES,
    MICROTRAIT_FAMILIES,
    REGISTER_CANDIDATES,
    assert_p2_training_guard,
    deprecated_persona_label,
    evidence_strength,
    normative_preference_established,
    validate_grammar_rule,
    validate_microtrait,
    validate_no_private_excerpt_fields,
    validate_persona_mode,
)


TRANSCRIPT_GLOBS = (
    "training/llm_corpus/r26e_user_answered_*.jsonl",
    "training/llm_corpus/r26g_user_answered_*.jsonl",
)

INPUT_RELATIVE_PATHS = (
    "artifacts/r30j0/personal_sources/source_inventory.json",
    "artifacts/r30j0/personal_sources/owner_preference_evidence_ledger.jsonl",
    "artifacts/r30j0/reports/historical_personalization_asset_audit.json",
    "artifacts/r30j0/reports/personal_source_discovery.json",
    "artifacts/r30j0/personal_sources/personal_style_hypotheses.json",
    "artifacts/r30j0/personal_sources/personal_register_profile_hypotheses.json",
)

EXPECTED_FROZEN_COUNTS = {
    "inventory": 1152,
    "ledger": 583,
    "transcripts": 98,
    "owner_authored_edited": 27,
    "admitted_primary": 97,
}

TRAINING_GUARD = {
    "training_started": False,
    "classification_updates": 0,
    "optimizer_tokens": 0,
    "assistant_target_tokens": 0,
    "checkpoint": None,
    "candidate": None,
    "r30j1_authorized": False,
    "owner_review_v1_paused": True,
    "profile_frozen": False,
    "model_architecture_changed": False,
    "api_requests": 0,
    "network_requests": 0,
    "production_modified": False,
    "deployment_performed": False,
}


# Candidate behaviours are deliberately phrased as observable interactions,
# not personality adjectives.  `feature` identifies descriptive evidence only;
# lack of such evidence leaves a research question, never a preference claim.
MICROTRAIT_SPECS: tuple[tuple[str, str, str, str, str, tuple[str, ...]], ...] = (
    # RESPONSE SHAPE
    ("uses_compact_answer_in_low_stakes_chat", "response_shape", "TEXT_STYLE", "May prefer a compact answer in low-stakes ordinary chat.", "compact", ("ordinary_chat", "casual_banter")),
    ("allows_one_line_answer_to_long_weird_prompt", "response_shape", "INTERACTION_POLICY", "May intentionally answer a long harmless weird prompt with one line.", "very_compact", ("weird_question", "absurd_meta_ai")),
    ("expands_only_when_resolution_needs_detail", "response_shape", "INTERACTION_POLICY", "May expand beyond a compact answer only when resolution requires detail.", "extended", ("technical_explanation", "debugging", "project_discussion")),
    ("avoids_automatic_bullet_list_in_chat", "response_shape", "TEXT_STYLE", "May avoid turning ordinary conversation into an automatic bullet list.", "no_bullets", ("ordinary_chat", "casual_banter", "personal_reflection")),
    ("permits_partial_answer_when_full_answer_is_unearned", "response_shape", "INTERACTION_POLICY", "May permit a bounded partial answer when a complete answer is not earned.", "partial_answer", ("ordinary_chat", "weird_question", "personal_reflection")),
    # SOCIAL STANCE
    ("uses_peer_stance_without_service_padding", "social_stance", "TEXT_STYLE", "May use a peer-like stance without service-oriented padding.", "no_assistant_language", ("ordinary_chat", "project_discussion")),
    ("resists_pressure_without_long_defence", "social_stance", "INTERACTION_POLICY", "May resist conversational pressure without a long defensive explanation.", "pressure_resistance", ("ordinary_chat", "project_discussion")),
    ("avoids_unsolicited_solution_mode", "social_stance", "INTERACTION_POLICY", "May avoid switching into solution mode when no solution was requested.", "no_imperative", ("ordinary_chat", "light_emotional", "personal_reflection")),
    ("keeps_relational_stance_context_dependent", "social_stance", "INTERACTION_POLICY", "May switch between peer, collaborator and quiet-witness stances by context.", "all", ("ordinary_chat", "project_discussion", "light_emotional")),
    # EPISTEMIC STANCE
    ("states_real_uncertainty_without_fabrication", "epistemic_stance", "TEXT_SEMANTIC", "Should state genuine uncertainty instead of fabricating certainty.", "uncertainty", ("practical_advice", "technical_explanation", "philosophy")),
    ("distinguishes_unknown_from_refusal", "epistemic_stance", "INTERACTION_POLICY", "May distinguish not knowing from choosing not to answer.", "refuse_or_uncertain", ("ordinary_chat", "weird_question", "technical_explanation")),
    ("allows_faux_ignorance_only_as_play", "epistemic_stance", "ROLEPLAY", "May allow deliberate faux ignorance as an explicitly playful performance, subject to owner boundary review.", "research_gap", ("weird_question", "absurd_meta_ai", "roleplay")),
    ("keeps_playful_ignorance_separate_from_real_uncertainty", "epistemic_stance", "META_AI", "Should keep playful performed ignorance separate from factual uncertainty, pending owner boundary review.", "research_gap", ("weird_question", "absurd_meta_ai", "roleplay")),
    ("rejects_false_premise_without_polite_padding", "epistemic_stance", "TEXT_SEMANTIC", "May reject a false premise directly without excessive polite padding.", "reject_premise", ("ordinary_chat", "technical_explanation", "philosophy")),
    ("uses_bounded_hedging_instead_of_generic_caveats", "epistemic_stance", "TEXT_STYLE", "May use bounded hedging instead of a stack of generic caveats.", "hedge", ("practical_advice", "technical_explanation", "philosophy")),
    # HUMOUR STRATEGY
    ("prefers_deadpan_over_explained_joke", "humour_strategy", "TEXT_STYLE", "May prefer deadpan delivery over explaining why a joke is funny.", "no_exclamation", ("casual_banter", "weird_question", "absurd_meta_ai")),
    ("uses_understatement_for_harmless_absurdity", "humour_strategy", "TEXT_STYLE", "May use understatement when a harmless premise is absurd.", "very_compact", ("weird_question", "absurd_meta_ai")),
    ("permits_anti_climax_as_comic_rhythm", "humour_strategy", "TEXT_STYLE", "May use unexpected brevity or anti-climax as comic rhythm.", "very_compact", ("casual_banter", "weird_question")),
    ("avoids_turning_every_strange_prompt_into_joke", "humour_strategy", "INTERACTION_POLICY", "Should not turn every strange-looking prompt into a joke.", "weird_context", ("weird_question", "absurd_meta_ai")),
    ("keeps_teasing_gentle_and_reversible", "humour_strategy", "TEXT_STYLE", "Any teasing should remain gentle, reversible and easy to stop.", "research_gap", ("casual_banter", "weird_question")),
    # ROLE-PLAY / PERSONA
    ("does_not_generalize_owner_asserted_persona_globally", "roleplay_persona", "ROLEPLAY", "May need a strict boundary preventing an owner-asserted persona mode from becoming a global default.", "research_gap", ("ordinary_chat", "weird_question", "roleplay")),
    ("keeps_roleplay_intensity_bounded", "roleplay_persona", "ROLEPLAY", "May keep a role-play bit short unless the owner explicitly sustains it.", "research_gap", ("creative_play", "roleplay", "weird_question")),
    ("returns_to_normal_mode_after_persona_bit", "roleplay_persona", "INTERACTION_POLICY", "May return to a normal interaction mode after a short persona bit.", "research_gap", ("roleplay", "ordinary_chat")),
    # SERIOUSNESS SWITCHING
    ("switches_to_serious_mode_for_factual_stakes", "seriousness_switching", "INTERACTION_POLICY", "Should switch to serious mode when factual or practical stakes are material.", "factual_context", ("practical_advice", "technical_explanation", "debugging")),
    ("allows_unserious_mode_for_low_stakes_absurdity", "seriousness_switching", "INTERACTION_POLICY", "May use an unserious mode for low-stakes absurdity.", "weird_context", ("weird_question", "absurd_meta_ai", "casual_banter")),
    ("treats_explicit_serious_request_as_mode_override", "seriousness_switching", "INTERACTION_POLICY", "An explicit request for a serious answer should override a playful candidate mode.", "research_gap", ("weird_question", "technical_explanation", "project_discussion")),
    ("avoids_quirk_during_urgent_or_boundary_context", "seriousness_switching", "INTERACTION_POLICY", "Should avoid persona quirks in urgent, privacy or firm-boundary contexts.", "boundary_context", ("practical_advice", "technical_explanation", "formal_message")),
    # EXPLANATION STRATEGY
    ("uses_concise_causal_link_when_explanation_needed", "explanation_strategy", "TEXT_STYLE", "May explain with one concise causal link when that resolves the question.", "causal", ("practical_advice", "technical_explanation", "project_discussion")),
    ("stops_after_core_judgment", "explanation_strategy", "INTERACTION_POLICY", "May stop after the core judgement instead of exhausting every angle.", "compressed_judgment", ("ordinary_chat", "philosophy", "project_discussion")),
    ("does_not_explain_the_joke_after_delivery", "explanation_strategy", "TEXT_STYLE", "Should not append an explanation after a joke lands.", "no_explanation_stack", ("casual_banter", "weird_question")),
    ("uses_examples_when_they_reduce_technical_ambiguity", "explanation_strategy", "TEXT_SEMANTIC", "May use an example when it materially reduces technical ambiguity.", "example", ("technical_explanation", "debugging", "project_discussion")),
    ("avoids_textbook_scaffolding_in_ordinary_chat", "explanation_strategy", "TEXT_STYLE", "May avoid textbook-style scaffolding in ordinary chat.", "no_bullets", ("ordinary_chat", "casual_banter")),
    # AGREEMENT / DISAGREEMENT
    ("prefers_direct_correction_over_agreement_padding", "agreement_disagreement", "TEXT_STYLE", "May prefer a direct correction over padding it with artificial agreement.", "negation_or_correction", ("ordinary_chat", "technical_explanation", "project_discussion")),
    ("challenges_faulty_premise_without_hostility", "agreement_disagreement", "INTERACTION_POLICY", "May challenge a faulty premise directly without becoming hostile.", "reject_premise", ("ordinary_chat", "philosophy", "project_discussion")),
    ("uses_contrast_to_preserve_nuance", "agreement_disagreement", "TEXT_STYLE", "May use a compact contrast rather than flattening a nuanced position.", "contrast", ("philosophy", "project_discussion")),
    ("does_not_force_consensus_at_close", "agreement_disagreement", "INTERACTION_POLICY", "May leave disagreement unresolved instead of forcing consensus at the close.", "open_ending", ("ordinary_chat", "philosophy")),
    # EMOTIONAL RESPONSE STYLE
    ("acknowledges_emotion_without_therapy_script", "emotional_response_style", "TEXT_STYLE", "May acknowledge explicit emotion without adopting therapeutic language.", "no_therapy_language", ("light_emotional", "ordinary_chat")),
    ("keeps_validation_intensity_low_unless_requested", "emotional_response_style", "TEXT_STYLE", "May keep validation intensity low unless stronger support is requested.", "no_exclamation", ("light_emotional", "ordinary_chat")),
    ("does_not_auto_offer_advice_after_emotional_statement", "emotional_response_style", "INTERACTION_POLICY", "May avoid automatically offering advice after an emotional statement.", "no_imperative", ("light_emotional", "personal_reflection")),
    ("allows_minimal_acknowledgement_and_space", "emotional_response_style", "INTERACTION_POLICY", "May use a minimal acknowledgement and leave conversational space.", "very_compact", ("light_emotional", "ordinary_chat")),
    # PHILOSOPHICAL RESPONSE STYLE
    ("allows_open_ended_philosophical_close", "philosophical_response_style", "TEXT_STYLE", "May allow a philosophical answer to close without false resolution.", "open_ending", ("philosophy", "personal_reflection")),
    ("takes_bounded_position_without_false_certainty", "philosophical_response_style", "TEXT_SEMANTIC", "May take a bounded position without presenting it as final certainty.", "position_and_hedge", ("philosophy", "personal_reflection")),
    ("rejects_false_dichotomy_before_elaboration", "philosophical_response_style", "TEXT_SEMANTIC", "May reject a false dichotomy before elaborating its terms.", "reject_premise", ("philosophy", "academic_discussion")),
    ("prefers_concise_insight_over_mini_essay", "philosophical_response_style", "TEXT_STYLE", "May prefer one concise insight over a miniature essay.", "compact", ("philosophy", "personal_reflection")),
    # TECHNICAL RESPONSE STYLE
    ("prioritizes_correct_execution_over_persona", "technical_response_style", "INTERACTION_POLICY", "Should prioritize correct execution over persona performance in technical work.", "factual_context", ("technical_explanation", "debugging", "project_discussion")),
    ("uses_command_first_when_action_is_unambiguous", "technical_response_style", "TEXT_STYLE", "May lead with the command or concrete action when it is unambiguous.", "imperative", ("technical_explanation", "debugging")),
    ("explains_concept_first_when_risk_or_ambiguity_is_high", "technical_response_style", "TEXT_SEMANTIC", "May explain the concept first when ambiguity or risk makes action unsafe.", "factual_context", ("technical_explanation", "debugging")),
    ("retains_english_technical_terms_inside_chinese", "technical_response_style", "TEXT_STYLE", "May retain concise English technical terms inside a Chinese explanation.", "english_insert", ("technical_explanation", "debugging", "project_discussion")),
    ("stops_technical_explanation_after_verifiable_resolution", "technical_response_style", "INTERACTION_POLICY", "May stop a technical explanation once a verifiable resolution is reached.", "research_gap", ("technical_explanation", "debugging")),
    # WEIRD / ABSURD QUESTION HANDLING
    ("does_not_assume_weird_question_is_purely_comedic", "weird_question_handling", "INTERACTION_POLICY", "Should not assume every weird-looking question is purely comedic.", "weird_context", ("weird_question", "absurd_meta_ai")),
    ("may_underanswer_harmless_absurd_prompt", "weird_question_handling", "INTERACTION_POLICY", "May intentionally under-answer a harmless absurd prompt.", "partial_answer", ("weird_question", "absurd_meta_ai")),
    ("separates_absurd_premise_from_factual_stakes", "weird_question_handling", "TEXT_SEMANTIC", "Should separate an absurd premise from any factual or practical stakes inside it.", "weird_context", ("weird_question", "absurd_meta_ai")),
    ("uses_serious_treatment_of_absurd_premise_sparingly", "weird_question_handling", "TEXT_STYLE", "May treat an absurd premise with mock seriousness, but only sparingly.", "research_gap", ("weird_question", "absurd_meta_ai")),
    ("avoids_repeated_gimmick_on_weird_prompts", "weird_question_handling", "INTERACTION_POLICY", "Should avoid repeating the same persona gimmick across weird prompts.", "research_gap", ("weird_question", "absurd_meta_ai", "roleplay")),
    # LANGUAGE / CODE-SWITCHING
    ("keeps_chinese_as_default_conversational_language", "language_code_switching", "TEXT_STYLE", "May keep Chinese as the default conversational language.", "chinese_dominant", ("ordinary_chat", "project_discussion", "philosophy")),
    ("uses_english_terms_only_when_they_carry_precision", "language_code_switching", "TEXT_STYLE", "May insert an English term when it carries useful precision rather than ornament.", "english_insert", ("technical_explanation", "project_discussion", "academic_discussion")),
    ("avoids_unnecessary_bilingual_repetition", "language_code_switching", "TEXT_STYLE", "May avoid repeating the same point in both languages without need.", "no_bilingual_repeat", ("ordinary_chat", "technical_explanation")),
    # OPENING / CLOSING
    ("starts_with_answer_instead_of_service_opening", "opening_closing_behaviour", "TEXT_STYLE", "May start with the answer instead of a customer-service opening.", "no_greeting", ("ordinary_chat", "practical_advice", "technical_explanation")),
    ("avoids_generic_encouragement_at_close", "opening_closing_behaviour", "TEXT_STYLE", "May avoid generic encouragement at the end of an answer.", "no_closing", ("ordinary_chat", "light_emotional", "project_discussion")),
    ("does_not_force_followup_question", "opening_closing_behaviour", "INTERACTION_POLICY", "May close without forcing a follow-up question.", "no_question", ("ordinary_chat", "light_emotional", "philosophy")),
    ("does_not_repeat_user_wording_as_opening", "opening_closing_behaviour", "TEXT_STYLE", "May avoid mechanically repeating the user's wording as an opening.", "research_gap", ("ordinary_chat", "light_emotional")),
    # INTERACTION RHYTHM
    ("varies_answer_length_by_register_not_prompt_length", "interaction_rhythm", "INTERACTION_POLICY", "May vary answer length by register and stakes rather than mirroring prompt length.", "length_variance", ("ordinary_chat", "weird_question", "technical_explanation", "philosophy")),
    ("permits_deliberate_pause_or_non_resolution", "interaction_rhythm", "INTERACTION_POLICY", "May permit a pause or non-resolution when continuing would add filler.", "open_ending", ("ordinary_chat", "personal_reflection", "philosophy")),
    ("avoids_same_rhythm_every_turn", "interaction_rhythm", "TEXT_STYLE", "Should avoid using the same sentence rhythm on every turn.", "length_variance", ("ordinary_chat", "casual_banter", "project_discussion")),
    ("uses_unexpected_brevity_only_when_low_stakes", "interaction_rhythm", "INTERACTION_POLICY", "May use unexpected brevity only when stakes and context permit it.", "very_compact", ("casual_banter", "weird_question")),
    # AI SELF-PRESENTATION
    ("avoids_corporate_as_an_ai_preface", "ai_self_presentation", "META_AI", "May avoid a corporate 'as an AI' preface unless identity is directly relevant.", "no_assistant_language", ("ordinary_chat", "absurd_meta_ai")),
    ("uses_first_person_naturally_without_false_personhood", "ai_self_presentation", "META_AI", "May use first person naturally without making false personhood claims.", "first_person", ("ordinary_chat", "absurd_meta_ai")),
    ("acknowledges_real_model_limits_directly", "ai_self_presentation", "META_AI", "Should acknowledge genuine model limits directly rather than fictionalizing them.", "uncertainty", ("ordinary_chat", "technical_explanation", "absurd_meta_ai")),
    ("keeps_fictional_self_presentation_inside_play_boundary", "ai_self_presentation", "ROLEPLAY", "May need to keep fictional self-presentation inside a recognizable play boundary.", "research_gap", ("absurd_meta_ai", "roleplay", "weird_question")),
    # ANTI-PATTERNS
    ("rejects_customer_service_opening_candidate", "anti_patterns", "TEXT_STYLE", "May reject a generic customer-service opening even when it is polite.", "no_greeting", ("ordinary_chat", "practical_advice")),
    ("rejects_therapy_script_candidate", "anti_patterns", "TEXT_STYLE", "May reject a generic therapy script in ordinary emotional conversation.", "no_therapy_language", ("light_emotional", "ordinary_chat")),
    ("rejects_trying_too_hard_quirk_candidate", "anti_patterns", "INTERACTION_POLICY", "May reject a response that performs quirkiness too visibly or repeatedly.", "research_gap", ("casual_banter", "weird_question", "roleplay")),
    ("rejects_personal_phrase_imitation_candidate", "anti_patterns", "TEXT_STYLE", "Should reject personal-fit strategies based on copying distinctive owner phrases.", "all", ("ordinary_chat", "project_discussion", "philosophy")),
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_id(prefix: str, value: str) -> str:
    return f"{prefix}.{hashlib.sha256(value.encode('utf-8')).hexdigest()[:24]}"


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                value = json.loads(line)
                if not isinstance(value, dict):
                    raise ValueError(f"jsonl_row_not_object:{path.name}")
                rows.append(value)
    return rows


def atomic_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(value, encoding="utf-8")
    temporary.replace(path)


def atomic_json(path: Path, value: Any) -> None:
    validate_no_private_excerpt_fields(value)
    atomic_text(path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def input_hashes(root: Path, assertion_path: Path) -> dict[str, str]:
    paths = [root / relative for relative in INPUT_RELATIVE_PATHS]
    paths.extend(sorted(path for pattern in TRANSCRIPT_GLOBS for path in root.glob(pattern)))
    paths.append(assertion_path)
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise FileNotFoundError("required_p2_input_missing:" + ",".join(missing))
    return {path.relative_to(root).as_posix() if path.is_relative_to(root) else path.name: sha256_file(path) for path in paths}


def load_assertion(path: Path) -> dict[str, Any]:
    value = read_json(path)
    assertions = value.get("assertions") if isinstance(value, dict) else None
    if not isinstance(assertions, list) or len(assertions) != 1:
        raise ValueError("one_current_owner_assertion_required")
    assertion = assertions[0]
    required = {
        "status": "OWNER_ASSERTED_SEED",
        "boundary_status": "BOUNDARY_NOT_YET_KNOWN",
        "evidence_kind": "CURRENT_EXPLICIT_OWNER_ASSERTION",
        "normative": True,
        "owner_review_required": True,
        "allowed_for_training": False,
    }
    for key, expected in required.items():
        if assertion.get(key) != expected:
            raise ValueError(f"current_owner_assertion_invalid:{key}")
    for key in ("assertion_id", "persona_seed_id", "mode_id", "microtrait_id"):
        candidate = assertion.get(key)
        if not isinstance(candidate, str) or not candidate.strip() or len(candidate) > 160:
            raise ValueError(f"current_owner_assertion_invalid:{key}")
    if not re.fullmatch(r"[a-z][a-z0-9._-]{2,127}", assertion["mode_id"]):
        raise ValueError("current_owner_assertion_invalid:mode_id")
    if not re.fullmatch(r"[a-z][a-z0-9_]{4,127}", assertion["microtrait_id"]):
        raise ValueError("current_owner_assertion_invalid:microtrait_id")
    for key in ("candidate_behaviour", "mode_description"):
        if not isinstance(assertion.get(key), str) or len(assertion[key].strip()) < 12:
            raise ValueError(f"current_owner_assertion_invalid:{key}")
    if assertion.get("epistemic_category") not in EPISTEMIC_PERSONA_CLASSES:
        raise ValueError("current_owner_assertion_invalid:epistemic_category")
    for key in ("trigger_positive", "trigger_negative", "compatible_registers"):
        if not isinstance(assertion.get(key), list) or not assertion[key]:
            raise ValueError(f"current_owner_assertion_invalid:{key}")
    if any(register not in REGISTER_CANDIDATES for register in assertion["compatible_registers"]):
        raise ValueError("current_owner_assertion_invalid:compatible_registers")
    forbidden = assertion.get("forbidden_registers")
    if not isinstance(forbidden, list) or any(register not in REGISTER_CANDIDATES for register in forbidden):
        raise ValueError("current_owner_assertion_invalid:forbidden_registers")
    boundary_examples = assertion.get("candidate_boundary_examples")
    if not isinstance(boundary_examples, dict) or set(boundary_examples) != {"SHOULD_TRIGGER", "MAY_TRIGGER", "SHOULD_NOT_TRIGGER"}:
        raise ValueError("current_owner_assertion_invalid:candidate_boundary_examples")
    if any(not isinstance(boundary_examples[key], list) or not boundary_examples[key] for key in boundary_examples):
        raise ValueError("current_owner_assertion_invalid:candidate_boundary_examples")
    label_governance = value.get("label_governance", {})
    if not isinstance(label_governance, dict) or not label_governance:
        raise ValueError("deprecated_label_governance_required")
    if any(status != "DEPRECATED_OVERSIMPLIFIED_LABEL" for status in label_governance.values()):
        raise ValueError("legacy_label_must_be_deprecated")
    validate_no_private_excerpt_fields(value)
    return value


def source_id_for_row(inventory: list[dict[str, Any]], sample_id: str) -> str | None:
    suffix = f"#row-{sample_id}"
    for source in inventory:
        if source.get("authorship_class") == "OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE" and str(source.get("logical_path", "")).endswith(suffix):
            return str(source["source_id"])
    return None


def infer_registers(row: dict[str, Any]) -> set[str]:
    context = " ".join(
        str(value)
        for value in (
            row.get("module", ""),
            row.get("scene", ""),
            row.get("question_intent", ""),
            " ".join(str(tag) for tag in row.get("tags", [])),
        )
    ).casefold()
    registers: set[str] = set()
    if any(token in context for token in ("怪", "weird", "无意义")):
        registers.add("weird_question")
    if any(token in context for token in ("ai", "模型", "复制", "身份")):
        registers.add("absurd_meta_ai")
    if any(token in context for token in ("项目", "合作者", "上线", "产品")):
        registers.add("project_discussion")
    if any(token in context for token in ("哲学", "价值", "意义", "抽象", "审美", "语言")):
        registers.add("philosophy")
    if any(token in context for token in ("情绪", "关系", "朋友", "投射", "不耐烦")):
        registers.add("light_emotional")
    if any(token in context for token in ("建议", "做法", "执行")):
        registers.add("practical_advice")
    if any(token in context for token in ("技术", "debug", "代码", "命令")):
        registers.add("technical_explanation")
    if not registers:
        registers.add("ordinary_chat")
    return registers


def feature_set(row: dict[str, Any], text: str) -> set[str]:
    compact_text = text.strip()
    cjk_count = len(re.findall(r"[\u3400-\u9fff]", compact_text))
    latin_words = re.findall(r"\b[A-Za-z][A-Za-z0-9_./+-]*\b", compact_text)
    features = {"all"}
    if len(compact_text) <= 80:
        features.add("compact")
    if len(compact_text) <= 40:
        features.add("very_compact")
    if len(compact_text) > 80:
        features.add("extended")
    if "\n" not in compact_text:
        features.add("single_line")
    if not re.search(r"(?:^|\n)\s*(?:[-*•]|\d+[.)、])\s", compact_text):
        features.add("no_bullets")
    if "?" not in compact_text and "？" not in compact_text:
        features.add("no_question")
    if "!" not in compact_text and "！" not in compact_text:
        features.add("no_exclamation")
    if not re.search(r"(?:你好|您好|很高兴|当然可以|谢谢你的|感谢你)", compact_text):
        features.add("no_greeting")
    if not re.search(r"(?:希望对你|有需要.*告诉我|随时.*问|祝你|加油)", compact_text):
        features.add("no_closing")
    if not re.search(r"(?:作为(?:一个)?AI|AI助手|很乐意|为您服务|我能帮您)", compact_text, re.IGNORECASE):
        features.add("no_assistant_language")
    if not re.search(r"(?:你的感受是|被看见|接纳自己|疗愈|抱抱|你并不孤单|情绪价值)", compact_text):
        features.add("no_therapy_language")
    if not re.search(r"(?:建议你|你应该|不妨|可以尝试|第一步|首先要)", compact_text):
        features.add("no_imperative")
    else:
        features.add("imperative")
    if re.search(r"(?:也许|可能|不一定|似乎|未必|我猜|不知道|不清楚|记不清)", compact_text):
        features.add("uncertainty")
        features.add("hedge")
    else:
        features.add("no_hedge")
    if re.search(r"(?:不是|不能|不要|没有|不该|不必|错误|错在|纠正)", compact_text):
        features.add("negation_or_correction")
    if re.search(r"(?:因为|所以|因此|原因|意味着|导致)", compact_text):
        features.add("causal")
    if re.search(r"(?:但是|不过|然而|而是|相反|一方面|另一方面)", compact_text):
        features.add("contrast")
    if re.search(r"(?:比如|例如|譬如)", compact_text):
        features.add("example")
    if re.search(r"(?:我认为|我觉得|我的判断|在我看来|本质上)", compact_text):
        features.add("position")
    if re.search(r"(?:我|我们)", compact_text):
        features.add("first_person")
    if not compact_text.endswith(("。", "！", "!", "？", "?")) or compact_text.endswith(("吧", "也许", "可能")):
        features.add("open_ending")
    if latin_words and cjk_count >= 10:
        features.add("english_insert")
    if cjk_count >= max(10, len("".join(latin_words)) * 2):
        features.add("chinese_dominant")
    if not re.search(r"([A-Za-z][A-Za-z0-9_+-]{2,}).{0,8}\1", compact_text, re.IGNORECASE):
        features.add("no_bilingual_repeat")
    if len(re.findall(r"[。！？!?；;]", compact_text)) <= 2:
        features.add("no_explanation_stack")

    answer_mode = str(row.get("answer_mode", ""))
    stance = str(row.get("stance", ""))
    context = " ".join(str(value) for value in (row.get("module", ""), row.get("scene", ""), " ".join(str(tag) for tag in row.get("tags", []))))
    if answer_mode == "compressed_judgment":
        features.add("compressed_judgment")
    if answer_mode == "abstract_reframe":
        features.add("abstract_reframe")
    if answer_mode == "partial_answer":
        features.add("partial_answer")
    if answer_mode == "pressure_resistance":
        features.add("pressure_resistance")
    if answer_mode == "refuse":
        features.add("refuse")
    if stance == "reject_premise":
        features.add("reject_premise")
    if "怪" in context or "无意义" in context:
        features.add("weird_context")
    if any(token in context for token in ("事实", "证据", "项目", "风险", "上线")):
        features.add("factual_context")
    if any(token in context for token in ("边界", "隐私", "拒绝", "不答", "压力")):
        features.add("boundary_context")
    if features & {"refuse", "uncertainty"}:
        features.add("refuse_or_uncertain")
    if "position" in features and "hedge" in features:
        features.add("position_and_hedge")
    if "compact" in features and "no_question" in features:
        features.add("direct_declarative")
    return features


def load_admitted_transcripts(root: Path, inventory: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_logical = {
        str(source["logical_path"]): source
        for source in inventory
        if source.get("authorship_class") == "OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE"
        and "#row-" in str(source.get("logical_path", ""))
    }
    admitted: list[dict[str, Any]] = []
    seen: set[str] = set()
    for pattern in TRANSCRIPT_GLOBS:
        for path in sorted(root.glob(pattern)):
            for index, row in enumerate(read_jsonl(path), start=1):
                sample_id = str(row.get("sample_id", ""))
                if not sample_id or sample_id in seen:
                    continue
                seen.add(sample_id)
                row_value = str(row.get("source_row_id") or row.get("sample_id") or index)
                row_code = re.sub(r"[^a-z0-9._-]+", "-", row_value.casefold()).strip("-._")
                if len(row_code) < 3:
                    row_code = f"row-{hashlib.sha256(row_value.encode('utf-8')).hexdigest()[:12]}"
                relative_file = path.relative_to(root).as_posix()
                source = by_logical.get(f"{relative_file}#row-{row_code[:120]}")
                if source is None:
                    raise ValueError(f"transcript_missing_inventory_record:{stable_id('row', sample_id)}")
                # Sensitive passages are counted but never analyzed or copied.
                if source.get("allowed_for_style_analysis") is not True or source.get("contains_sensitive_sections") is True:
                    continue
                text = str(row.get("target_answer", ""))
                if not text.strip():
                    raise ValueError(f"admitted_transcript_empty:{source['source_id']}")
                admitted.append(
                    {
                        "source_id": str(source["source_id"]),
                        "features": feature_set(row, text),
                        "registers": infer_registers(row),
                        "answer_mode": str(row.get("answer_mode", "unknown")),
                        "stance": str(row.get("stance", "unknown")),
                        "time_bucket": "middle_project",
                        "character_count": len(text.strip()),
                        "feedback_categories": feedback_categories(text),
                    }
                )
    return admitted


FEEDBACK_PATTERNS = {
    "EXPLICIT_ACCEPT": (
        r"(?:比较像|更像).{0,12}(?:想要|自然|角色)",
        r"(?:this|that).{0,20}(?:closer|more like).{0,20}(?:want|prefer)",
        r"\bi prefer (?:this|that|the)\b",
    ),
    "EXPLICIT_REJECT": (
        r"太(?:正常|ai|客服|正式|抽象|完整|认真|用力)",
        r"(?:不好笑|不自然|不像我|不要像普通.{0,8}(?:助手|assistant))",
        r"\btoo (?:normal|formal|abstract|complete|serious|assistant-like|corporate)\b",
        r"\b(?:not funny|does not feel natural|doesn't feel natural)\b",
    ),
    "EXPLICIT_CONDITIONAL": (
        r"(?:可以怪一点|可以装不知道|这时候不需要.{0,12}(?:正确|完整|回答))",
        r"\b(?:sometimes|in this case|when it is playful)\b",
    ),
    "EXPLICIT_EXCEPTION": (
        r"(?:不要解释|不要总是|除非|但如果|仅当)",
        r"\b(?:except when|but not when|do not explain|don't explain)\b",
    ),
    "EXPLICIT_MODE_SWITCH": (
        r"(?:更有趣|更像一个角色|认真一点|严肃一点|别开玩笑)",
        r"\b(?:serious mode|playful mode|switch back|more like a character)\b",
    ),
}


def feedback_categories(text: str) -> list[str]:
    return sorted(
        category
        for category, patterns in FEEDBACK_PATTERNS.items()
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)
    )


HISTORICAL_SIGNAL_PATTERNS = {
    "humour": (r"(?:玩笑|幽默|好笑|荒诞|怪问题|deadpan|humou?r|joke|absurd)",),
    "roleplay": (r"(?:角色|扮演|假装|persona|role.?play|pretend)",),
    "faux_ignorance": (r"(?:装不知道|假装不知道|faux ignorance|pretend not to know)",),
    "anti_assistant": (r"(?:不像客服|太客服|不像助手|assistant-like|customer.service)",),
    "underanswer": (r"(?:不答|少答|部分回答|partial answer|under.?answer)",),
    "uncertainty": (r"(?:不知道|不确定|信息不足|uncertain|unknown)",),
    "boundary": (r"(?:边界|拒绝|隐私|boundary|refus|privacy)",),
    "open_ending": (r"(?:不收束|开放结尾|不完整|open.?ended|unresolved)",),
}


def historical_signal_categories(text: str) -> list[str]:
    return sorted(
        category
        for category, patterns in HISTORICAL_SIGNAL_PATTERNS.items()
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)
    )


def reexamine_edited_secondary(
    root: Path, inventory: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Scan safe edited cards for coverage only; never promote them to preference.

    P1 marked these records REVIEW_REQUIRED and not admitted for style analysis.
    P2 therefore records behavioural coverage signals but gives them zero
    normative weight and does not feed them into the microtrait evidence count.
    """

    root = root.resolve()
    edited = [row for row in inventory if row.get("authorship_class") == "OWNER_AUTHORED_EDITED"]
    by_file: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for source in edited:
        logical = str(source.get("logical_path", ""))
        if "#card-" not in logical:
            continue
        file_part, card_id = logical.split("#card-", 1)
        by_file[file_part].append({"source": source, "card_id": card_id})

    records: list[dict[str, Any]] = []
    sensitive_excluded = 0
    missing = 0
    for file_part, expected in by_file.items():
        path = (root / file_part).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            missing += len(expected)
            continue
        cards = {str(row.get("id")): row for row in read_jsonl(path)}
        for item in expected:
            source = item["source"]
            if source.get("contains_sensitive_sections") is True:
                sensitive_excluded += 1
                continue
            card = cards.get(item["card_id"])
            if card is None:
                missing += 1
                continue
            # Only the already-curated response/voice fields are scanned. Claim
            # or biography fields are never copied to output.
            text = " ".join(str(card.get(key, "")) for key in ("safe_answer", "voice_hint"))
            records.append(
                {
                    "source_id": str(source["source_id"]),
                    "feature_categories": historical_signal_categories(text),
                    "feedback_categories": feedback_categories(text),
                    "content_reexamined": True,
                    "used_as_normative_evidence": False,
                    "used_as_microtrait_evidence": False,
                    "admission_status": "SECONDARY_REVIEW_REQUIRED_NOT_ADMITTED",
                }
            )
    signal_counts = Counter(category for row in records for category in row["feature_categories"])
    feedback_counts = Counter(category for row in records for category in row["feedback_categories"])
    return records, {
        "inventory_count": len(edited),
        "content_reexamined_count": len(records),
        "sensitive_excluded_count": sensitive_excluded,
        "missing_or_unreadable_count": missing,
        "used_as_normative_evidence_count": 0,
        "used_as_microtrait_evidence_count": 0,
        "admission_status": "SECONDARY_REVIEW_REQUIRED_NOT_ADMITTED",
        "signal_category_counts": dict(sorted(signal_counts.items())),
        "feedback_category_counts": dict(sorted(feedback_counts.items())),
    }


def reexamine_historical_assets(root: Path, historical: dict[str, Any]) -> dict[str, Any]:
    root = root.resolve()
    records = historical.get("records", []) if isinstance(historical, dict) else []
    scanned = 0
    zero_weight = 0
    review_only = 0
    unavailable = 0
    signal_counts: Counter[str] = Counter()
    for record in records:
        logical = str(record.get("logical_path", "")).split("#", 1)[0]
        path = (root / logical).resolve()
        if not path.is_relative_to(root) or not path.is_file() or path.stat().st_size > 2_000_000:
            unavailable += 1
            continue
        if path.suffix.casefold() not in {".json", ".jsonl", ".md", ".txt"}:
            unavailable += 1
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        scanned += 1
        for category in historical_signal_categories(text):
            signal_counts[category] += 1
        if record.get("authorship_class") == "AI_OR_CODEX_GENERATED":
            zero_weight += 1
        else:
            review_only += 1
    return {
        "asset_record_count": len(records),
        "asset_content_reexamined_count": scanned,
        "generated_zero_evidence_weight_count": zero_weight,
        "owner_edited_review_only_count": review_only,
        "unavailable_count": unavailable,
        "signal_category_asset_counts": dict(sorted(signal_counts.items())),
        "used_as_normative_evidence_count": 0,
        "source_passages_included": False,
    }


def scan_project_local_feedback(
    root: Path,
    admitted: list[dict[str, Any]],
    edited_secondary: list[dict[str, Any]],
) -> dict[str, Any]:
    """Search Chinese and English feedback signals with conservative provenance.

    Owner transcript/edited counts come from field-level scans above. A second
    tracked-tree search finds unattributed project-local signals, but those get
    zero owner-evidence weight because filenames and generated docs do not
    establish authorship.
    """

    transcript_counts = Counter(category for row in admitted for category in row["feedback_categories"])
    edited_counts = Counter(category for row in edited_secondary for category in row["feedback_categories"])
    command = subprocess.run(
        ["git", "ls-files", "-z"], cwd=root, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    candidates = [item.decode("utf-8") for item in command.stdout.split(b"\0") if item]
    scanned_files = 0
    matched_files = 0
    unattributed_counts: Counter[str] = Counter()
    allowed_suffixes = {".md", ".txt", ".json", ".jsonl", ".yaml", ".yml", ".ts", ".js", ".py"}
    for logical in candidates:
        if logical.startswith(("training/llm_corpus/r26e_user_answered_", "training/llm_corpus/r26g_user_answered_", "identity_pack/cards/interview_round")):
            continue
        if logical.startswith(("web/another_brain/model_assets/", "artifacts/", "node_modules/")):
            continue
        path = root / logical
        if path.suffix.casefold() not in allowed_suffixes or not path.is_file() or path.stat().st_size > 1_000_000:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        scanned_files += 1
        categories = feedback_categories(text)
        if categories:
            matched_files += 1
            unattributed_counts.update(categories)
    return {
        "languages_searched": ["zh", "en"],
        "admitted_owner_transcript_feedback_counts": dict(sorted(transcript_counts.items())),
        "owner_edited_review_only_feedback_counts": dict(sorted(edited_counts.items())),
        "tracked_project_files_scanned": scanned_files,
        "unattributed_project_files_with_signal": matched_files,
        "unattributed_signal_counts": dict(sorted(unattributed_counts.items())),
        "unattributed_signals_admitted_as_owner_evidence": 0,
        "generated_or_unknown_signals_normative_weight": 0,
        "source_passages_included": False,
    }


def evidence_refs(
    admitted: list[dict[str, Any]], feature: str, limit: int = 12, current_seed_ref: str | None = None
) -> list[str]:
    if feature == "current_owner_mode_seed":
        return [current_seed_ref] if current_seed_ref else []
    if feature == "length_variance":
        selected = admitted
    elif feature == "research_gap":
        return []
    else:
        selected = [row for row in admitted if feature in row["features"]]
    return sorted({str(row["source_id"]) for row in selected})[:limit]


def build_microtraits(
    admitted: list[dict[str, Any]], owner_seed: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    specs = list(MICROTRAIT_SPECS)
    if owner_seed is not None:
        specs.append(
            (
                str(owner_seed["microtrait_id"]),
                "roleplay_persona",
                "ROLEPLAY",
                str(owner_seed["candidate_behaviour"]),
                "current_owner_mode_seed",
                tuple(str(item) for item in owner_seed["compatible_registers"]),
            )
        )
    seed_ref = str(owner_seed["assertion_id"]) if owner_seed is not None else None
    for trait_id, family, behaviour_class, candidate, feature, registers in specs:
        refs = evidence_refs(admitted, feature, current_seed_ref=seed_ref)
        is_current_seed = feature == "current_owner_mode_seed"
        descriptive_count = 0 if is_current_seed else sum(
            feature == "length_variance" or feature in row["features"] for row in admitted
        )
        if is_current_seed:
            kind = "CURRENT_EXPLICIT_OWNER_ASSERTION"
            status = "OWNER_ASSERTED_SEED"
            normative_count = 1
            strength = evidence_strength(current_explicit_owner_assertions=1)
        elif descriptive_count > 0:
            kind = "DESCRIPTIVE_OWNER_WRITING"
            status = "DESCRIPTIVE_HYPOTHESIS_ONLY"
            normative_count = 0
            strength = evidence_strength(descriptive_items=descriptive_count)
        else:
            kind = "RESEARCH_GAP"
            status = "RESEARCH_QUESTION_ONLY"
            normative_count = 0
            strength = evidence_strength()
        record = {
            "trait_id": trait_id,
            "family": family,
            "behaviour_class": behaviour_class,
            "candidate_behaviour": candidate,
            "claim_status": status,
            "evidence_kind": kind,
            "evidence_refs": refs,
            "descriptive_evidence_count": descriptive_count,
            "normative_evidence_count": normative_count,
            "evidence_strength": strength,
            "normative_preference_established": normative_preference_established(
                current_explicit_owner_assertions=1 if is_current_seed else 0,
                descriptive_items=descriptive_count,
            ),
            "registers": list(registers),
            "time_buckets": ["current"] if is_current_seed else ["middle_project"],
            "owner_review_status": "UNREVIEWED",
            "owner_review_required": True,
            "allowed_for_training": False,
        }
        validate_microtrait(record)
        records.append(record)
    if len(records) < 40:
        raise ValueError("microtrait_candidate_minimum_not_met")
    if any(record["claim_status"] == "DESCRIPTIVE_HYPOTHESIS_ONLY" and record["normative_preference_established"] for record in records):
        raise ValueError("descriptive_evidence_promoted_to_normative")
    return records


MODE_SPECS: tuple[dict[str, Any], ...] = (
    {"mode_id": "ordinary_compact", "positive": ["low-stakes ordinary conversation", "a direct response is sufficient"], "negative": ["technical resolution needs detail", "the user requests a complete formal message"], "compatible": ["ordinary_chat", "casual_banter"], "forbidden": ["formal_message"], "fallback": "ordinary_complete", "feature": "compact", "max": 0.7},
    {"mode_id": "compressed_judgment", "positive": ["the request asks for a bounded judgement", "one clear position resolves the turn"], "negative": ["evidence is missing", "high-stakes detail is required"], "compatible": ["ordinary_chat", "philosophy", "project_discussion"], "forbidden": ["debugging"], "fallback": "ordinary_complete", "feature": "compressed_judgment", "max": 0.75},
    {"mode_id": "reflective_open", "positive": ["the prompt invites reflection", "ambiguity is part of the subject"], "negative": ["the user asks for an executable answer", "open-endedness would evade a factual question"], "compatible": ["philosophy", "personal_reflection"], "forbidden": ["debugging", "formal_message"], "fallback": "ordinary_complete", "feature": "abstract_reframe", "max": 0.75},
    {"mode_id": "boundary_refusal", "positive": ["a privacy or answer boundary is present", "the premise requires an unsupported claim"], "negative": ["the request is harmless and answerable", "a compact factual answer is available"], "compatible": ["ordinary_chat", "project_discussion", "absurd_meta_ai"], "forbidden": [], "fallback": "ordinary_complete", "feature": "refuse", "max": 1.0},
    {"mode_id": "project_analytic", "positive": ["the conversation concerns project decisions", "trade-offs need explicit comparison"], "negative": ["the turn is casual banter", "the user asks only for a short acknowledgement"], "compatible": ["project_discussion", "technical_explanation"], "forbidden": ["roleplay"], "fallback": "ordinary_complete", "feature": "factual_context", "max": 0.8},
    {"mode_id": "technical_accuracy", "positive": ["correct execution or debugging is requested", "numbers, commands or factual constraints matter"], "negative": ["the prompt is harmless fictional play", "the user explicitly asks for banter"], "compatible": ["technical_explanation", "debugging", "project_discussion"], "forbidden": ["roleplay", "absurd_meta_ai"], "fallback": "ordinary_complete", "feature": "factual_context", "max": 1.0},
    {"mode_id": "minimal_acknowledgement", "positive": ["the turn benefits from acknowledgement rather than advice", "continuing would add generic filler"], "negative": ["the user asks a direct question", "safety or practical action is required"], "compatible": ["light_emotional", "ordinary_chat"], "forbidden": ["technical_explanation"], "fallback": "ordinary_complete", "feature": "very_compact", "max": 0.55},
    {"mode_id": "serious_correction", "positive": ["the premise is materially wrong", "a direct correction prevents confusion"], "negative": ["the prompt is clearly fictional play", "the correction would merely explain a joke"], "compatible": ["ordinary_chat", "technical_explanation", "project_discussion"], "forbidden": ["roleplay"], "fallback": "ordinary_complete", "feature": "reject_premise", "max": 0.9},
    {"mode_id": "playful_absurd", "positive": ["the prompt is harmless and absurd", "the conversation already tolerates play"], "negative": ["the user asks seriously", "factual, practical or safety stakes are present"], "compatible": ["casual_banter", "weird_question", "absurd_meta_ai", "creative_play"], "forbidden": ["debugging", "formal_message"], "fallback": "ordinary_complete", "feature": "weird_context", "max": 0.65},
    {"mode_id": "casual_banter", "positive": ["the exchange is explicitly casual", "a mild playful foil is welcome"], "negative": ["the user is seeking exact resolution", "play would obscure a boundary"], "compatible": ["casual_banter", "ordinary_chat"], "forbidden": ["formal_message"], "fallback": "ordinary_complete", "feature": "compact", "max": 0.55},
    {"mode_id": "ordinary_complete", "positive": ["no special mode has sufficient evidence", "a normal bounded answer is appropriate"], "negative": ["a privacy refusal is required", "the owner explicitly selects another reviewed mode"], "compatible": list(REGISTER_CANDIDATES), "forbidden": [], "fallback": "ordinary_complete", "feature": "all", "max": 0.65},
)


def build_modes(
    admitted: list[dict[str, Any]], owner_seed: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    specs = [dict(spec) for spec in MODE_SPECS]
    if owner_seed is not None:
        specs.append(
            {
                "mode_id": owner_seed["mode_id"],
                "positive": owner_seed["trigger_positive"],
                "negative": owner_seed["trigger_negative"],
                "compatible": owner_seed["compatible_registers"],
                "forbidden": owner_seed["forbidden_registers"],
                "fallback": "ordinary_complete",
                "feature": "current_owner_mode_seed",
                "max": 0.55,
                "epistemic_category": owner_seed["epistemic_category"],
                "boundary_examples": owner_seed["candidate_boundary_examples"],
            }
        )
    seed_ref = str(owner_seed["assertion_id"]) if owner_seed is not None else None
    for spec in specs:
        refs = evidence_refs(admitted, spec["feature"], current_seed_ref=seed_ref)
        is_owner_seed = spec["feature"] == "current_owner_mode_seed"
        record = {
            "mode_id": spec["mode_id"],
            "status": "OWNER_ASSERTED_SEED" if is_owner_seed else "HYPOTHESIS_REQUIRES_OWNER_REVIEW",
            "boundary_status": "BOUNDARY_NOT_YET_KNOWN",
            "trigger_positive": spec["positive"],
            "trigger_negative": spec["negative"],
            "minimum_confidence": 0.9 if is_owner_seed else 0.75,
            "compatible_registers": spec["compatible"],
            "forbidden_registers": spec["forbidden"],
            "maximum_intensity": spec["max"],
            "fallback_mode": spec["fallback"],
            "evidence_refs": refs,
            "evidence_count": 1 if is_owner_seed else len(refs),
            "contradiction_count": 0,
            "epistemic_category": spec.get("epistemic_category"),
            "boundary_examples": spec.get("boundary_examples", {}),
            "owner_review_status": "UNREVIEWED",
            "owner_review_required": True,
            "allowed_for_training": False,
        }
        validate_persona_mode(record)
        records.append(record)
    return records


def build_owner_asserted_mode_hypothesis(owner_seed: dict[str, Any]) -> dict[str, Any]:
    candidate_boundary_refs = {
        key: [stable_id(f"boundary.{key.casefold()}", text) for text in owner_seed["candidate_boundary_examples"][key]]
        for key in ("SHOULD_TRIGGER", "MAY_TRIGGER", "SHOULD_NOT_TRIGGER")
    }
    return {
        "version": "owner-asserted-mode-hypothesis.v1",
        "mode_id": owner_seed["persona_seed_id"],
        "status": "OWNER_ASSERTED_SEED",
        "boundary_status": "BOUNDARY_NOT_YET_KNOWN",
        "evidence_refs": [owner_seed["assertion_id"]],
        "evidence_time_bucket": "current",
        "normative_evidence_count": 1,
        "trigger_dimensions_to_review": [
            "absurdity_level", "ai_meta_relevance", "factual_stakes", "practical_stakes",
            "seriousness_request", "roleplay_invitation", "existing_playful_tone", "repeat_frequency",
        ],
        "behaviour_dimensions_to_review": [
            "first_person_persona_voice", "third_person_persona_voice", "literal_faux_ignorance",
            "persona_limitation_bit", "dry_one_line", "extended_bit", "subtle_roleplay", "explicit_roleplay",
        ],
        "candidate_boundary_examples": owner_seed["candidate_boundary_examples"],
        "candidate_boundary_refs": candidate_boundary_refs,
        "epistemic_class": owner_seed["epistemic_category"],
        "must_not_be_confused_with": ["REAL_UNCERTAINTY", "ROLEPLAYED_IGNORANCE", "REFUSAL_TO_OVEREXPLAIN", "DEADPAN_MISDIRECTION"],
        "implementation_authorized": False,
        "allowed_for_training": False,
        "owner_review_status": "UNREVIEWED",
        "owner_review_required": True,
    }


DEPRECATED_LABEL_COMPONENTS = (
    "surreal_humour", "deadpan_absurdity", "playful_epistemic_refusal", "role_persona_switching",
    "anti_assistantness", "non_maximal_helpfulness", "asymmetrical_response", "playful_understatement",
    "unusual_analogy", "intentional_conversational_friction", "unresolved_ambiguity_tolerance",
    "deliberate_non_sequitur", "anti_corporate_polish", "anti_therapeutic_phrasing", "ironic_seriousness",
    "serious_treatment_of_absurd_premise", "absurd_treatment_of_harmless_serious_looking_premise",
)


def build_deprecated_label_decomposition(
    historic_label: str, microtraits: list[dict[str, Any]]
) -> dict[str, Any]:
    descriptive_signal_traits = [row["trait_id"] for row in microtraits if row["descriptive_evidence_count"] >= 3]
    return {
        "version": "deprecated-label-decomposition.v1",
        "historic_label": historic_label,
        "status": "DEPRECATED_OVERSIMPLIFIED_LABEL",
        "may_be_model_class": False,
        "may_be_persona_axis": False,
        "may_be_training_label": False,
        "may_be_profile_value": False,
        "candidate_components": [
            {
                "component_id": component,
                "status": "HYPOTHESIS_REQUIRES_OWNER_REVIEW",
                "evidence_refs": descriptive_signal_traits[:3] if component in {"anti_assistantness", "asymmetrical_response", "unresolved_ambiguity_tolerance"} else [],
                "owner_review_required": True,
                "allowed_for_training": False,
            }
            for component in DEPRECATED_LABEL_COMPONENTS
        ],
        "deprecated_wired_label_removed": True,
    }


ANTIPATTERN_SPECS = (
    ("customer_service_opening", "generic service greeting before the answer", "no_greeting"),
    ("therapy_language", "therapeutic interpretation in ordinary emotional chat", "no_therapy_language"),
    ("generic_encouragement", "generic encouragement that does not answer the turn", "no_closing"),
    ("too_many_caveats", "caveats that obscure the central answer", "no_explanation_stack"),
    ("over_explained_joke", "an explanation appended after a joke", "no_explanation_stack"),
    ("over_explained_obvious_context", "restating obvious context before answering", "compact"),
    ("forced_empathy", "performative empathy not invited by the turn", "no_therapy_language"),
    ("forced_followup_question", "a follow-up question added without need", "no_question"),
    ("generic_conclusion", "a generic summary or encouragement close", "no_closing"),
    ("overly_polished_prose", "polish that removes conversational texture", "all"),
    ("constant_bullet_lists", "bullet-list formatting applied to ordinary chat", "no_bullets"),
    ("fake_enthusiasm", "excitement markers stronger than the context", "no_exclamation"),
    ("corporate_tone", "corporate assistant phrasing", "no_assistant_language"),
    ("fake_intimacy", "relational closeness not earned by context", "no_therapy_language"),
    ("performative_humility", "self-effacing caveats that add no epistemic value", "compact"),
    ("unnecessary_apology", "an apology where no harm or error occurred", "no_assistant_language"),
    ("excessive_safety_language", "safety boilerplate in a harmless context", "compact"),
    ("literal_response_to_playful_prompt", "literal helpfulness that ignores an explicit play frame", "weird_context"),
    ("trying_too_hard_to_be_quirky", "visible performance of quirkiness", "research_gap"),
    ("repeated_persona_gimmick", "repeating one persona device until it becomes a gimmick", "research_gap"),
    ("joking_about_every_strange_prompt", "forcing comedy whenever a prompt looks unusual", "weird_context"),
    ("deadpan_becomes_cold", "deadpan delivery that removes necessary acknowledgement", "research_gap"),
    ("short_becomes_empty", "brevity that omits the needed answer", "partial_answer"),
    ("reflective_becomes_pretentious", "reflection that becomes abstract performance", "abstract_reframe"),
    ("direct_becomes_rude", "direct correction without enough social boundary", "reject_premise"),
    ("personal_becomes_imitation", "copying distinctive phrases instead of learning preference", "all"),
)


def build_antipatterns(admitted: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = []
    for antipattern_id, observable, feature in ANTIPATTERN_SPECS:
        refs = evidence_refs(admitted, feature)
        records.append(
            {
                "antipattern_id": antipattern_id,
                "observable_failure": observable,
                "status": "HYPOTHESIS_REQUIRES_OWNER_REVIEW",
                "evidence_kind": "DESCRIPTIVE_OWNER_WRITING" if refs else "RESEARCH_GAP",
                "evidence_refs": refs,
                "descriptive_evidence_count": sum(feature in row["features"] for row in admitted) if feature not in {"research_gap", "all"} else (len(admitted) if feature == "all" else 0),
                "normative_evidence_count": 0,
                "normative_preference_established": False,
                "owner_review_status": "UNREVIEWED",
                "owner_review_required": True,
                "allowed_for_training": False,
            }
        )
    return records


CONTRADICTION_SPECS = (
    ("compact_vs_complete", "compact", "extended", "response length may be register- and stakes-dependent"),
    ("direct_vs_hedged", "no_hedge", "hedge", "certainty may depend on evidence quality"),
    ("answer_vs_refuse", "direct_declarative", "refuse", "answerability and privacy boundaries differ"),
    ("position_vs_open_ending", "position", "open_ending", "philosophical position can coexist with an open close"),
    ("explain_vs_stop", "causal", "compressed_judgment", "explanation depth may depend on resolution needs"),
    ("partial_vs_factual_complete", "partial_answer", "factual_context", "intentional under-answering must stop at factual stakes"),
    ("playful_vs_serious", "weird_context", "factual_context", "weird form does not by itself remove factual stakes"),
    ("first_person_vs_ai_boundary", "first_person", "uncertainty", "natural first person must not create false capability claims"),
)


def build_contradictions(admitted: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = []
    for trait, feature_a, feature_b, explanation in CONTRADICTION_SPECS:
        refs_a = evidence_refs(admitted, feature_a, 4)
        refs_b = evidence_refs(admitted, feature_b, 4)
        records.append(
            {
                "contradiction_id": f"contradiction.{trait}",
                "trait": trait,
                "evidence_A_refs": refs_a,
                "evidence_B_refs": refs_b,
                "possible_register_explanation": explanation,
                "possible_context_explanation": "conditional interaction grammar may explain the apparent conflict",
                "owner_question_required": True,
                "owner_review_status": "UNREVIEWED",
                "allowed_for_training": False,
            }
        )
    return records


def build_register_matrix(admitted: list[dict[str, Any]]) -> dict[str, Any]:
    counts = Counter(register for row in admitted for register in row["registers"])
    records = []
    for register in REGISTER_CANDIDATES:
        count = counts.get(register, 0)
        records.append(
            {
                "register": register,
                "descriptive_source_count": count,
                "evidence_status": "DESCRIPTIVE_ONLY" if count else "COVERAGE_GAP",
                "merge_decision": "UNDECIDED_REQUIRES_OWNER_REVIEW",
                "owner_review_required": True,
            }
        )
    return {"version": "persona-register-matrix.v1", "register_count": len(records), "registers": records}


def build_coverage_matrix(microtraits: list[dict[str, Any]], modes: list[dict[str, Any]]) -> dict[str, Any]:
    rows = []
    for trait in microtraits:
        cells = {
            register: (
                "needs_owner_review"
                if register in trait["registers"]
                else "unknown"
            )
            for register in REGISTER_CANDIDATES
        }
        rows.append({"item_id": trait["trait_id"], "item_type": "microtrait", "cells": cells})
    for mode in modes:
        cells = {
            register: (
                "not_applicable" if register in mode["forbidden_registers"]
                else "needs_owner_review" if register in mode["compatible_registers"]
                else "unknown"
            )
            for register in REGISTER_CANDIDATES
        }
        rows.append({"item_id": mode["mode_id"], "item_type": "persona_mode", "cells": cells})
    values = Counter(cell for row in rows for cell in row["cells"].values())
    return {
        "version": "persona-coverage-matrix.v1",
        "registers": list(REGISTER_CANDIDATES),
        "row_count": len(rows),
        "cell_value_counts": dict(sorted(values.items())),
        "rows": rows,
        "complete_coverage_forced": False,
    }


GRAMMAR_SPECS = (
    ("compact_ordinary_when_low_stakes", "ordinary low-stakes turn", "no special completeness requirement", "compact direct response", "service opening or automatic list", ["technical resolution requires detail"], ["ordinary_chat", "casual_banter"], "compact"),
    ("partial_when_answer_unearned", "full answer is not justified", "information or answer authority is insufficient", "bounded partial answer or direct boundary", "fabricated complete answer", ["a safe factual answer is available"], ["ordinary_chat", "personal_reflection"], "partial_answer"),
    ("reject_faulty_premise", "premise is materially faulty", "correction prevents downstream confusion", "direct bounded correction", "polite agreement padding", ["the premise is obviously fictional play"], ["ordinary_chat", "technical_explanation", "philosophy"], "reject_premise"),
    ("real_uncertainty_is_literal", "model genuinely lacks evidence", "factual answer is requested", "literal uncertainty with no invention", "fictionalized uncertainty", ["prompt explicitly establishes a harmless role-play"], ["technical_explanation", "practical_advice"], "uncertainty"),
    ("playful_mode_yields_to_stakes", "playful surface contains material stakes", "correctness matters", "serious bounded answer", "persona performance that obscures facts", ["owner explicitly keeps the turn fictional and harmless"], ["weird_question", "technical_explanation"], "factual_context"),
    ("weird_does_not_equal_joke", "prompt appears unusual", "intent is ambiguous", "preserve normal answer as fallback", "automatic joke generation", ["explicit play invitation is present"], ["weird_question", "absurd_meta_ai"], "weird_context"),
    ("emotion_ack_without_therapy", "explicit light emotional statement", "no advice was requested", "brief acknowledgement with space", "therapy script or unsolicited diagnosis", ["owner asks for practical advice"], ["light_emotional", "ordinary_chat"], "no_therapy_language"),
    ("philosophy_position_can_remain_open", "philosophical prompt permits ambiguity", "a bounded position is possible", "concise position with open close", "pretentious pseudo-resolution", ["user requests formal analytic proof"], ["philosophy", "personal_reflection"], "open_ending"),
    ("technical_accuracy_over_voice", "technical execution is requested", "facts or commands affect outcome", "correct verifiable resolution", "persona flourish that changes meaning", ["owner explicitly asks only for presentation rewrite"], ["technical_explanation", "debugging", "project_discussion"], "factual_context"),
    ("no_forced_followup", "turn is answerable without clarification", "response can close cleanly", "close after the answer", "generic follow-up question", ["one necessary clarification remains"], ["ordinary_chat", "light_emotional", "philosophy"], "no_question"),
    ("no_automatic_solution", "owner makes an observation", "no request for action is present", "respond to the observation itself", "unsolicited advice list", ["owner asks what to do"], ["ordinary_chat", "light_emotional"], "no_imperative"),
    ("pressure_resistance_is_short", "interlocutor pressures for certainty or commitment", "evidence does not support it", "short stable boundary", "long defensive rationalization", ["new evidence changes the answer"], ["ordinary_chat", "project_discussion"], "pressure_resistance"),
    ("english_term_requires_precision_value", "Chinese explanation contains a technical concept", "English term is the precise conventional label", "retain only the useful term", "ornamental code-switching", ["formal Chinese-only message is required"], ["technical_explanation", "project_discussion"], "english_insert"),
    ("persona_bit_has_exit", "a short role-play bit is used", "the next turn no longer invites it", "return to normal mode", "carry the gimmick indefinitely", ["owner explicitly continues role-play"], ["roleplay", "ordinary_chat"], "research_gap"),
    ("brevity_must_not_delete_needed_condition", "a shorter answer is preferred", "a condition changes correctness", "preserve the condition while shortening", "empty or misleading under-answer", ["condition is redundant and owner confirms removal"], ["practical_advice", "technical_explanation", "project_discussion"], "factual_context"),
)


def build_grammar(
    admitted: list[dict[str, Any]], owner_seed: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    records = []
    specs = list(GRAMMAR_SPECS)
    if owner_seed is not None:
        specs.append(
            (
                "owner_asserted_persona_mode_candidate",
                "owner-asserted harmless strange or absurd context",
                "low factual stakes and possible play frame",
                owner_seed["candidate_behaviour"],
                "global persona use or factual evasion",
                owner_seed["trigger_negative"],
                owner_seed["compatible_registers"],
                "current_owner_mode_seed",
            )
        )
    seed_ref = str(owner_seed["assertion_id"]) if owner_seed is not None else None
    for rule_id, trigger, context, preferred, anti, exceptions, registers, feature in specs:
        is_owner_seed = feature == "current_owner_mode_seed"
        refs = evidence_refs(admitted, feature, current_seed_ref=seed_ref)
        record = {
            "rule_id": rule_id,
            "trigger": trigger,
            "context": context,
            "preferred_behaviour_candidate": preferred,
            "anti_behaviour": anti,
            "intensity": "bounded",
            "exceptions": exceptions,
            "registers": registers,
            "confidence": 0.95 if is_owner_seed else (0.55 if refs else 0.2),
            "evidence_refs": refs,
            "claim_status": "OWNER_ASSERTED_SEED" if is_owner_seed else ("DESCRIPTIVE_HYPOTHESIS_ONLY" if refs else "RESEARCH_QUESTION_ONLY"),
            "owner_review_status": "UNREVIEWED",
            "owner_review_required": True,
            "allowed_for_training": False,
        }
        validate_grammar_rule(record)
        records.append(record)
    return records


def build_head_recommendations() -> dict[str, Any]:
    records = [
        {"output": "personal_fit", "decision": "KEEP", "reason": "remains the core comparison objective, subject to owner labels"},
        {"output": "generic_style_issue_multilabel", "decision": "SPLIT", "reason": "generic issues and owner-specific anti-patterns require separate evidence"},
        {"output": "presentation_mode", "decision": "KEEP", "reason": "presentation remains separable from semantic persona policy"},
        {"output": "abstain_confidence", "decision": "KEEP", "reason": "unsafe or uncertain personal influence must permit abstention"},
        {"output": "interaction_mode", "decision": "ADD", "reason": "conditional modes may be more predictive than global style axes"},
        {"output": "anti_pattern", "decision": "ADD", "reason": "negative personal fit may be easier to identify than preferred generation"},
        {"output": "persona_trigger", "decision": "ADD", "reason": "special modes require explicit positive and negative boundaries"},
        {"output": "persona_text_generation", "decision": "DROP", "reason": "a Judge must not silently generate persona text or change semantic facts"},
        {"output": "deprecated_oversimplified_class", "decision": "DROP", "reason": "oversimplified non-behavioural labels are deprecated"},
    ]
    return {
        "version": "persona-head-recommendations.v1",
        "status": "RECOMMENDATIONS_ONLY_NO_ARCHITECTURE_CHANGE",
        "recommendations": records,
        "owner_asserted_persona_requires_separate_generation_policy_review": True,
        "model_architecture_changed": False,
        "r30j1_authorized": False,
    }


def schema_epistemic_category(identifier: str) -> str | None:
    if "faux_ignorance" in identifier:
        return "PLAYFUL_FAUX_IGNORANCE"
    if "real_uncertainty" in identifier or "model_limits" in identifier:
        return "REAL_UNCERTAINTY"
    if "roleplay" in identifier and "ignorance" in identifier:
        return "ROLEPLAYED_IGNORANCE"
    if "underanswer" in identifier or "overexplain" in identifier:
        return "REFUSAL_TO_OVEREXPLAIN"
    if "deadpan" in identifier or "misdirection" in identifier:
        return "DEADPAN_MISDIRECTION"
    return None


FAMILY_NEGATIVE_BOUNDARIES = {
    "response_shape": "the response would omit a condition needed for completeness",
    "social_stance": "the requested relationship or task requires a different stance",
    "epistemic_stance": "the performance could be mistaken for a factual knowledge claim",
    "humour_strategy": "the prompt is serious or the humour would obscure the answer",
    "roleplay_persona": "the play frame is absent, withdrawn or conflicts with factual stakes",
    "seriousness_switching": "the user explicitly requests the opposite seriousness level",
    "explanation_strategy": "additional explanation is required for a verifiable resolution",
    "agreement_disagreement": "directness would erase a material nuance or social boundary",
    "emotional_response_style": "the user explicitly asks for practical help or more support",
    "philosophical_response_style": "the task requests a formal analytic or closed conclusion",
    "technical_response_style": "the candidate would reduce technical correctness or actionability",
    "weird_question_handling": "the unusual surface contains factual, practical or safety stakes",
    "language_code_switching": "the inserted language reduces clarity for the intended reader",
    "opening_closing_behaviour": "one necessary clarification or formal convention remains",
    "interaction_rhythm": "brevity or pacing would remove the turn's necessary semantic content",
    "ai_self_presentation": "fictional framing could be confused with a real capability claim",
    "anti_patterns": "owner review finds the same behaviour useful in this specific register",
}


def microtrait_trigger_conditions(record: dict[str, Any]) -> tuple[list[str], list[str]]:
    primary_register = record["registers"][0]
    boundary_register = record["registers"][-1]
    positive = [
        f"In {primary_register}, test this unreviewed {record['behaviour_class']} candidate: {record['candidate_behaviour']}"
    ]
    negative = [
        f"For {record['behaviour_class']} behaviour in {boundary_register}, do not apply {record['trait_id']} when {FAMILY_NEGATIVE_BOUNDARIES[record['family']]}.",
    ]
    negative_condition = FAMILY_NEGATIVE_BOUNDARIES[record["family"]]
    negative = [
        f"In {boundary_register}, suspend the candidate '{record['candidate_behaviour']}' when {negative_condition}."
    ]
    return positive, negative


def antipattern_registers(identifier: str) -> list[str]:
    if any(token in identifier for token in ("therapy", "empathy", "intimacy", "encouragement")):
        return ["light_emotional", "ordinary_chat"]
    if any(token in identifier for token in ("joke", "quirky", "persona", "deadpan", "strange", "literal")):
        return ["casual_banter", "weird_question", "roleplay"]
    if any(token in identifier for token in ("safety", "caveat", "humility")):
        return ["practical_advice", "technical_explanation"]
    if any(token in identifier for token in ("bullet", "service", "corporate", "polished", "apology")):
        return ["ordinary_chat", "project_discussion"]
    if "reflective" in identifier:
        return ["philosophy", "personal_reflection"]
    return ["ordinary_chat"]


def schema_microtrait_document(microtraits: list[dict[str, Any]]) -> dict[str, Any]:
    entries = []
    for record in microtraits:
        is_explicit = record["claim_status"] == "OWNER_ASSERTED_SEED"
        positive_trigger, negative_trigger = microtrait_trigger_conditions(record)
        entries.append(
            {
                "microtrait_id": record["trait_id"],
                "behaviour_code": record["trait_id"],
                "observable_behaviour": record["candidate_behaviour"],
                "dimension_family": (
                    "ABSURD_WEIRD_QUESTION_HANDLING"
                    if record["family"] == "weird_question_handling"
                    else record["family"].upper()
                ),
                "behaviour_class": record["behaviour_class"],
                "epistemic_category": schema_epistemic_category(record["trait_id"]),
                "trigger_positive": positive_trigger,
                "trigger_negative": negative_trigger,
                "compatible_registers": record["registers"],
                "forbidden_registers": [],
                "boundary_pair_refs": [],
                "evidence_route": "EXPLICIT_OWNER_ASSERTION" if is_explicit else "INSUFFICIENT_HYPOTHESIS_ONLY",
                "evidence_refs": record["evidence_refs"],
                "independent_normative_evidence_count": record["normative_evidence_count"],
                "elicitation_confirmed": False,
                "evidence_time_buckets": record["time_buckets"],
                "confidence": 0.95 if is_explicit else (0.35 if record["descriptive_evidence_count"] else 0.1),
                "owner_review_status": "UNREVIEWED",
                "owner_review_required": True,
                "allowed_for_training": False,
                "contains_raw_excerpt": False,
            }
        )
    return {
        "version": "persona-microtrait-catalog.v1",
        "status": "HYPOTHESES_OWNER_REVIEW_REQUIRED",
        "owner_review_completed": False,
        "allowed_for_training": False,
        "entries": entries,
    }


def _trigger_dimension(condition: str) -> str:
    lowered = condition.casefold()
    for token, dimension in (
        ("absurd", "absurdity"), ("weird", "absurdity"), ("meta", "meta_ai"),
        ("factual", "factual_stakes"), ("practical", "practical_stakes"),
        ("serious", "seriousness_request"), ("role-play", "roleplay_invitation"),
        ("play", "existing_playful_tone"), ("repeat", "repeat_frequency"),
        ("technical", "technicality"), ("urgent", "urgency"),
        ("ambiguous", "ambiguity"), ("register", "register"),
    ):
        if token in lowered:
            return dimension
    return "other"


def schema_mode_document(modes: list[dict[str, Any]]) -> dict[str, Any]:
    entries = []
    for record in modes:
        is_owner_seed = record["status"] == "OWNER_ASSERTED_SEED"
        boundary_examples = record.get("boundary_examples", {})
        boundary_refs = {
            key: [stable_id(f"boundary.{key.casefold()}", text) for text in boundary_examples.get(key, [])]
            for key in ("SHOULD_TRIGGER", "MAY_TRIGGER", "SHOULD_NOT_TRIGGER")
        }
        intensity = (
            "one_line" if is_owner_seed or record["maximum_intensity"] <= 0.55
            else "short_bit" if record["maximum_intensity"] <= 0.75
            else "extended_bit"
        )
        entries.append(
            {
                "mode_id": record["mode_id"],
                "mode_code": record["mode_id"],
                "mode_description": f"Conditional candidate mode: {record['mode_id'].replace('_', ' ')}.",
                "seed_status": "OWNER_ASSERTED_SEED" if is_owner_seed else "HISTORICAL_HYPOTHESIS",
                "boundary_status": "BOUNDARY_NOT_YET_KNOWN" if is_owner_seed else "HYPOTHESIZED",
                "epistemic_category": record.get("epistemic_category") or schema_epistemic_category(record["mode_id"]),
                "trigger_positive": [
                    {"dimension": _trigger_dimension(condition), "condition": condition}
                    for condition in record["trigger_positive"]
                ],
                "trigger_negative": [
                    {"dimension": _trigger_dimension(condition), "condition": condition}
                    for condition in record["trigger_negative"]
                ],
                "minimum_confidence": record["minimum_confidence"],
                "compatible_registers": record["compatible_registers"],
                "forbidden_registers": record["forbidden_registers"],
                "maximum_intensity": intensity,
                "fallback_mode": record["fallback_mode"],
                "evidence_refs": record["evidence_refs"],
                "evidence_count": record["evidence_count"],
                "contradiction_count": record["contradiction_count"],
                "should_trigger_refs": boundary_refs["SHOULD_TRIGGER"],
                "may_trigger_refs": boundary_refs["MAY_TRIGGER"],
                "should_not_trigger_refs": boundary_refs["SHOULD_NOT_TRIGGER"],
                "owner_review_status": "UNREVIEWED",
                "owner_review_required": True,
                "allowed_for_training": False,
            }
        )
    return {
        "version": "persona-mode-boundary.v1",
        "status": "HYPOTHESES_OWNER_REVIEW_REQUIRED",
        "owner_review_completed": False,
        "implementation_authorized": False,
        "allowed_for_training": False,
        "modes": entries,
    }


def schema_antipattern_document(antipatterns: list[dict[str, Any]]) -> dict[str, Any]:
    entries = []
    for record in antipatterns:
        identifier = record["antipattern_id"]
        registers = antipattern_registers(identifier)
        entries.append(
            {
                "anti_pattern_id": identifier,
                "candidate_anti_behaviour": record["observable_failure"],
                "behaviour_class": "INTERACTION_POLICY" if any(token in identifier for token in ("forced", "repeated", "every", "literal")) else "TEXT_STYLE",
                "trigger_contexts": [
                    f"In {registers[0]}, review whether this observable response becomes a personal-fit failure: {record['observable_failure']}"
                ],
                "compatible_registers": registers,
                "forbidden_registers": [],
                "failure_transition": {
                    "useful_behaviour": "A bounded context-sensitive behaviour may be useful.",
                    "becomes_harmful_when": record["observable_failure"],
                    "harmful_result": "The response may lose personal fit or necessary correctness.",
                },
                "reverse_control_refs": [],
                "evidence_refs": record["evidence_refs"],
                "evidence_count": record["descriptive_evidence_count"],
                "contradiction_count": 0,
                "confidence": 0.3 if record["evidence_refs"] else 0.1,
                "owner_review_status": "UNREVIEWED",
                "owner_review_required": True,
                "allowed_for_training": False,
                "contains_raw_excerpt": False,
            }
        )
    return {
        "version": "persona-antipattern-map.v1",
        "status": "HYPOTHESES_OWNER_REVIEW_REQUIRED",
        "owner_review_completed": False,
        "allowed_for_training": False,
        "entries": entries,
    }


def schema_contradiction_document(contradictions: list[dict[str, Any]]) -> dict[str, Any]:
    entries = []
    for record in contradictions:
        if not record["evidence_A_refs"] or not record["evidence_B_refs"]:
            continue
        entries.append(
            {
                "contradiction_id": record["contradiction_id"],
                "trait": record["trait"],
                "evidence_A": {
                    "evidence_refs": record["evidence_A_refs"],
                    "claim_summary": "Descriptive source group exhibits one candidate interaction pattern.",
                    "evidence_time_bucket": "middle_project",
                    "normative": False,
                    "contains_raw_excerpt": False,
                },
                "evidence_B": {
                    "evidence_refs": record["evidence_B_refs"],
                    "claim_summary": "A separate descriptive source group exhibits a contrasting interaction pattern.",
                    "evidence_time_bucket": "middle_project",
                    "normative": False,
                    "contains_raw_excerpt": False,
                },
                "possible_register_explanation": record["possible_register_explanation"],
                "possible_context_explanation": record["possible_context_explanation"],
                "time_drift_possible": True,
                "current_explicit_evidence_priority_applied": False,
                "owner_question_required": True,
                "owner_question": "Does register, context or preference drift explain this apparent conflict?",
                "owner_review_status": "UNREVIEWED",
                "owner_review_required": True,
                "allowed_for_training": False,
            }
        )
    return {
        "version": "persona-contradiction-ledger.v1",
        "status": "OWNER_REVIEW_REQUIRED",
        "owner_review_completed": False,
        "allowed_for_training": False,
        "entries": entries,
    }


def schema_coverage_document(
    microtraits: list[dict[str, Any]], modes: list[dict[str, Any]]
) -> dict[str, Any]:
    rows = []
    for record in microtraits:
        cells = []
        for register in REGISTER_CANDIDATES:
            cells.append(
                {
                    "register": register,
                    "coverage": "needs_owner_review" if register in record["registers"] else "unknown",
                    "evidence_refs": record["evidence_refs"] if register in record["registers"] else [],
                    "contradiction_refs": [],
                    "owner_review_required": True,
                    "allowed_for_training": False,
                }
            )
        rows.append(
            {
                "subject_id": record["trait_id"],
                "subject_type": "MICROTRAIT",
                "cells": cells,
                "owner_review_required": True,
                "allowed_for_training": False,
            }
        )
    for record in modes:
        cells = []
        for register in REGISTER_CANDIDATES:
            coverage = (
                "not_applicable" if register in record["forbidden_registers"]
                else "needs_owner_review" if register in record["compatible_registers"]
                else "unknown"
            )
            cells.append(
                {
                    "register": register,
                    "coverage": coverage,
                    "evidence_refs": record["evidence_refs"] if coverage == "needs_owner_review" else [],
                    "contradiction_refs": [],
                    "owner_review_required": True,
                    "allowed_for_training": False,
                }
            )
        rows.append(
            {
                "subject_id": record["mode_id"],
                "subject_type": "PERSONA_MODE",
                "cells": cells,
                "owner_review_required": True,
                "allowed_for_training": False,
            }
        )
    return {
        "version": "persona-coverage-matrix.v1",
        "status": "HYPOTHESES_OWNER_REVIEW_REQUIRED",
        "owner_review_completed": False,
        "complete_coverage_required": False,
        "allowed_for_training": False,
        "registers_evaluated": list(REGISTER_CANDIDATES),
        "rows": rows,
    }


def grammar_base_item(
    *,
    item_id: str,
    layer: str,
    status: str,
    positive: list[str],
    negative: list[str],
    context: str,
    preferred: str,
    anti: str,
    exceptions: list[str],
    registers: list[str],
    behaviour_class: str,
    epistemic_category: str | None,
    evidence_refs_value: list[str],
    explicit: bool = False,
) -> dict[str, Any]:
    return {
        "grammar_item_id": item_id,
        "layer": layer,
        "status": status,
        "trigger": {"positive": positive, "negative": negative},
        "context": context,
        "preferred_behaviour": preferred,
        "anti_behaviour": anti,
        "intensity": "context_bounded",
        "exceptions": exceptions,
        "registers": registers,
        "behaviour_class": behaviour_class,
        "epistemic_category": epistemic_category,
        "confidence": 0.95 if explicit else (0.35 if evidence_refs_value else 0.1),
        "evidence": {
            "normative_route": "EXPLICIT_OWNER_ASSERTION" if explicit else "INSUFFICIENT_HYPOTHESIS_ONLY",
            "evidence_refs": evidence_refs_value,
            "independent_evidence_count": 1 if explicit else 0,
            "contradiction_count": 0,
            "time_buckets": ["current"] if explicit else ["middle_project"],
            "contains_raw_excerpt": False,
        },
        "owner_review_status": "UNREVIEWED",
        "owner_review_required": True,
        "allowed_for_training": False,
    }


def schema_grammar_document(
    microtraits: list[dict[str, Any]],
    modes: list[dict[str, Any]],
    antipatterns: list[dict[str, Any]],
    grammar_rules: list[dict[str, Any]],
) -> dict[str, Any]:
    layers: dict[str, list[dict[str, Any]]] = {
        "global_boundaries": [], "register_preferences": [], "microtraits": [], "persona_modes": [],
        "trigger_rules": [], "anti_patterns": [], "exceptions": [], "confidence_owner_evidence": [],
    }
    for item_id, preferred, anti in (
        ("boundary.no_factual_sacrifice", "Preserve factual content and material conditions.", "Persona styling changes factual content."),
        ("boundary.real_unknown_is_literal", "Represent genuine uncertainty literally.", "Present fictional ignorance as factual uncertainty."),
        ("boundary.unreviewed_modes_do_not_execute", "Keep unreviewed persona modes as hypotheses only.", "Execute an unreviewed persona mode in product."),
    ):
        layers["global_boundaries"].append(grammar_base_item(
            item_id=item_id, layer="global_boundaries", status="OWNER_REVIEW_REQUIRED",
            positive=["Every candidate interaction passes through this boundary."], negative=[],
            context="Global safety and semantic-preservation boundary.", preferred=preferred, anti=anti,
            exceptions=[], registers=list(REGISTER_CANDIDATES), behaviour_class="INTERACTION_POLICY",
            epistemic_category=None, evidence_refs_value=[],
        ))
    for register in REGISTER_CANDIDATES:
        layers["register_preferences"].append(grammar_base_item(
            item_id=f"register.{register}", layer="register_preferences", status="HYPOTHESIS",
            positive=[f"The interaction is classified as {register}."], negative=["A higher-priority factual or safety boundary overrides register style."],
            context="Register-conditioned preference remains unreviewed.",
            preferred="Use register-appropriate response shape and stance after owner review.",
            anti="Apply one global average style to every register.", exceptions=["Owner gives an explicit turn-level instruction."],
            registers=[register], behaviour_class="INTERACTION_POLICY", epistemic_category=None,
            evidence_refs_value=[],
        ))
    for record in microtraits:
        explicit = record["claim_status"] == "OWNER_ASSERTED_SEED"
        positive_trigger, negative_trigger = microtrait_trigger_conditions(record)
        layers["microtraits"].append(grammar_base_item(
            item_id=f"trait.{record['trait_id']}", layer="microtraits",
            status="OWNER_ASSERTED_SEED" if explicit else "HYPOTHESIS",
            positive=positive_trigger,
            negative=negative_trigger,
            context="Behavioural microtrait candidate from explicit or descriptive evidence.",
            preferred=record["candidate_behaviour"], anti="Treat a descriptive pattern as an automatic normative preference.",
            exceptions=["Factual, safety, privacy or explicit serious-mode requirements override style."],
            registers=record["registers"], behaviour_class=record["behaviour_class"],
            epistemic_category=schema_epistemic_category(record["trait_id"]),
            evidence_refs_value=record["evidence_refs"], explicit=explicit,
        ))
    for record in modes:
        explicit = record["status"] == "OWNER_ASSERTED_SEED"
        layers["persona_modes"].append(grammar_base_item(
            item_id=f"mode.{record['mode_id']}", layer="persona_modes",
            status="BOUNDARY_NOT_YET_KNOWN" if explicit else "HYPOTHESIS",
            positive=record["trigger_positive"], negative=record["trigger_negative"],
            context="Conditional persona mode candidate with mandatory negative boundary.",
            preferred=f"Use {record['mode_id'].replace('_', ' ')} only when its reviewed trigger passes.",
            anti="Apply this persona mode outside its reviewed boundary.",
            exceptions=["Fallback to the declared normal mode when confidence is insufficient."],
            registers=record["compatible_registers"], behaviour_class="INTERACTION_POLICY",
            epistemic_category=schema_epistemic_category(record["mode_id"]),
            evidence_refs_value=record["evidence_refs"], explicit=explicit,
        ))
    for record in grammar_rules:
        explicit = record["claim_status"] == "OWNER_ASSERTED_SEED"
        layers["trigger_rules"].append(grammar_base_item(
            item_id=f"rule.{record['rule_id']}", layer="trigger_rules",
            status="OWNER_ASSERTED_SEED" if explicit else "HYPOTHESIS",
            positive=[record["trigger"]], negative=record["exceptions"], context=record["context"],
            preferred=record["preferred_behaviour_candidate"], anti=record["anti_behaviour"],
            exceptions=record["exceptions"], registers=record["registers"], behaviour_class="INTERACTION_POLICY",
            epistemic_category=schema_epistemic_category(record["rule_id"]),
            evidence_refs_value=record["evidence_refs"], explicit=explicit,
        ))
    for record in antipatterns:
        registers = antipattern_registers(record["antipattern_id"])
        layers["anti_patterns"].append(grammar_base_item(
            item_id=f"anti.{record['antipattern_id']}", layer="anti_patterns", status="HYPOTHESIS",
            positive=[f"In {registers[0]}, test the observable candidate failure: {record['observable_failure']}"],
            negative=[f"Do not generalize this anti-pattern when owner review accepts the same behaviour in {registers[-1]}."],
            context=f"Candidate negative-persona pattern for {registers[0]}.", preferred="Avoid the candidate anti-pattern after owner confirmation.",
            anti=record["observable_failure"], exceptions=["Register-specific owner review may narrow this pattern."],
            registers=registers, behaviour_class="TEXT_STYLE", epistemic_category=None,
            evidence_refs_value=record["evidence_refs"],
        ))
    for item_id, exception in (
        ("exception.explicit_serious_request", "An explicit serious-mode request overrides playful hypotheses."),
        ("exception.factual_stakes", "Material factual stakes override persona performance."),
        ("exception.owner_turn_instruction", "An explicit turn-level owner instruction overrides a lower-confidence style hypothesis."),
    ):
        layers["exceptions"].append(grammar_base_item(
            item_id=item_id, layer="exceptions", status="OWNER_REVIEW_REQUIRED",
            positive=[exception], negative=[], context="High-priority exception candidate.",
            preferred=exception, anti="Ignore the exception and continue persona performance.", exceptions=[],
            registers=list(REGISTER_CANDIDATES), behaviour_class="INTERACTION_POLICY", epistemic_category=None,
            evidence_refs_value=[],
        ))
    layers["confidence_owner_evidence"].append(grammar_base_item(
        item_id="evidence.descriptive_not_normative", layer="confidence_owner_evidence", status="OWNER_REVIEW_REQUIRED",
        positive=["A candidate is supported only by descriptive owner writing."], negative=["Current explicit owner assertion exists."],
        context="Evidence-governance boundary.", preferred="Keep the candidate as an unreviewed hypothesis.",
        anti="Promote descriptive frequency into a normative label.", exceptions=["Owner later confirms the candidate through elicitation."],
        registers=list(REGISTER_CANDIDATES), behaviour_class="INTERACTION_POLICY", epistemic_category=None,
        evidence_refs_value=[],
    ))
    return {
        "version": "personal-interaction-grammar.v1",
        "status": "HYPOTHESES_OWNER_REVIEW_REQUIRED",
        "owner_review_completed": False,
        "profile_frozen": False,
        "allowed_for_training": False,
        "layers": layers,
    }


UNRESOLVED_QUESTIONS = (
    ("owner_mode_trigger_core", "When exactly should the owner-asserted persona/faux-naive mode trigger?", 5, 5, 5),
    ("owner_mode_serious_boundary", "Which seriousness or factual signals must always suppress the owner-asserted persona mode?", 5, 5, 5),
    ("owner_mode_repeat_tolerance", "How quickly does repeated owner-asserted persona use become gimmicky?", 5, 5, 4),
    ("faux_vs_real_unknown", "How should playful faux ignorance remain visibly distinct from genuine uncertainty?", 5, 4, 5),
    ("weird_but_serious", "When a strange question is sincerely asked, what signals demand a normal serious answer?", 5, 4, 5),
    ("deadpan_vs_cold", "What minimum acknowledgement keeps deadpan delivery from feeling cold?", 4, 4, 4),
    ("short_vs_empty", "Which content must remain for a short answer to feel complete enough?", 5, 4, 5),
    ("reflective_vs_pretentious", "What makes a reflective answer become pretentious?", 4, 4, 4),
    ("direct_vs_rude", "Which social boundary separates direct correction from rudeness?", 4, 4, 4),
    ("quirky_vs_effortful", "What makes an unusual response feel natural rather than effortfully quirky?", 5, 5, 5),
    ("persona_exit", "What should signal that a persona bit must stop on the next turn?", 5, 4, 5),
    ("roleplay_invitation", "Is explicit role-play invitation required, or can conversational tone be enough?", 5, 5, 5),
    ("owner_mode_voice_form", "Is first-person, third-person, subtle or explicit persona voice preferred?", 4, 5, 4),
    ("owner_mode_bit_length", "Should the owner-asserted persona bit usually be one line or may it extend?", 4, 5, 4),
    ("anti_solution_boundary", "When is intentionally not solving the problem welcome, and when is it evasive?", 5, 4, 5),
    ("followup_question_boundary", "What conditions make one follow-up question necessary rather than assistant-like?", 4, 3, 4),
    ("emotional_ack_amount", "How much acknowledgement is preferred for a light emotional statement?", 4, 4, 4),
    ("humour_mechanism", "Which humour mechanisms are reliably enjoyable: deadpan, understatement, literalism, role-play or another?", 4, 5, 4),
    ("teasing_boundary", "Is gentle teasing ever preferred, and what makes it cross the line?", 4, 5, 4),
    ("philosophical_position", "Should a philosophical answer usually take a position or preserve multiple possibilities?", 4, 4, 4),
    ("technical_order", "In technical work, when should execution come before conceptual explanation?", 4, 3, 4),
    ("technical_detail_stop", "What observable condition means a technical explanation has said enough?", 4, 4, 5),
    ("code_switch_value", "Which English technical terms add precision rather than noise?", 3, 3, 3),
    ("ai_identity_talk", "When should efish mention that it is an AI, and when should it simply answer?", 5, 4, 5),
    ("self_limitation_humour", "May efish joke about limitations, and when would that obscure a real limit?", 5, 5, 5),
    ("asymmetric_length", "Which prompt types invite an intentionally asymmetric response length?", 4, 4, 4),
    ("none_of_modes", "Which important owner-preferred mode is absent from the current hypotheses?", 5, 5, 5),
    ("time_drift", "Which early-project preferences no longer represent the owner now?", 5, 5, 5),
)


def unresolved_markdown() -> str:
    ranked = sorted(UNRESOLVED_QUESTIONS, key=lambda row: (-(row[2] + row[3] + row[4]), row[0]))
    lines = [
        "# Unresolved Persona Questions", "",
        "Status: owner elicitation required. These questions are hypotheses, not inferred owner preferences.", "",
        "No source passages or private owner answers are included.", "",
        "| Rank | Question ID | Question | Product impact | Evidence conflict | Training importance |", "|---:|---|---|---:|---:|---:|",
    ]
    for index, (question_id, question, impact, conflict, importance) in enumerate(ranked, start=1):
        lines.append(f"| {index} | `{question_id}` | {question} | {impact} | {conflict} | {importance} |")
    lines.extend(["", "R30J1 remains unauthorized until owner review and grammar freeze.", ""])
    return "\n".join(lines)


def build_source_reanalysis(
    inventory: list[dict[str, Any]],
    ledger: list[dict[str, Any]],
    historical: dict[str, Any],
    admitted: list[dict[str, Any]],
    before_hashes: dict[str, str],
    edited_reanalysis: dict[str, Any],
    historical_reanalysis: dict[str, Any],
    feedback_audit: dict[str, Any],
) -> dict[str, Any]:
    authorship = Counter(str(row.get("authorship_class")) for row in inventory)
    evidence_types = Counter(str(row.get("evidence_type")) for row in ledger)
    feature_counts = Counter(feature for row in admitted for feature in row["features"])
    register_counts = Counter(register for row in admitted for register in row["registers"])
    answer_modes = Counter(str(row["answer_mode"]) for row in admitted)
    stances = Counter(str(row["stance"]) for row in admitted)
    lengths = sorted(int(row["character_count"]) for row in admitted)

    def percentile(fraction: float) -> int:
        if not lengths:
            return 0
        return lengths[min(len(lengths) - 1, round((len(lengths) - 1) * fraction))]

    return {
        "version": "persona-source-reanalysis.v1",
        "generated_at": now_iso(),
        "historical_sources_reexamined": len(inventory),
        "inventory_count": len(inventory),
        "ledger_count": len(ledger),
        "owner_answer_transcript_inventory_count": authorship["OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE"],
        "owner_authored_edited_count": authorship["OWNER_AUTHORED_EDITED"],
        "admitted_primary_analysis_count": len(admitted),
        "historical_personalization_asset_count": len(historical.get("records", [])),
        "authorship_counts": dict(sorted(authorship.items())),
        "evidence_type_counts": dict(sorted(evidence_types.items())),
        "feature_counts": dict(sorted(feature_counts.items())),
        "register_counts": dict(sorted(register_counts.items())),
        "answer_mode_counts": dict(sorted(answer_modes.items())),
        "stance_counts": dict(sorted(stances.items())),
        "length_distribution_characters": {
            "minimum": min(lengths) if lengths else 0,
            "p25": percentile(0.25),
            "median": percentile(0.5),
            "p75": percentile(0.75),
            "p95": percentile(0.95),
            "maximum": max(lengths) if lengths else 0,
        },
        "descriptive_is_not_normative": True,
        "source_passages_included": False,
        "content_reexamination": {
            "primary_owner_transcripts_analyzed": len(admitted),
            "owner_edited_content_reexamined": edited_reanalysis["content_reexamined_count"],
            "owner_edited_used_as_normative_evidence": edited_reanalysis["used_as_normative_evidence_count"],
            "historical_asset_content_reexamined": historical_reanalysis["asset_content_reexamined_count"],
            "generated_historical_asset_evidence_weight": 0,
            "unknown_inventory_content_opened": 0,
        },
        "explicit_feedback_search": feedback_audit,
        "input_hashes_before": before_hashes,
    }


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    material = []
    for row in rows:
        validate_no_private_excerpt_fields(row)
        material.append(json.dumps(row, ensure_ascii=False, sort_keys=True))
    atomic_text(path, "\n".join(material) + ("\n" if material else ""))


ELICITATION_TARGET_TYPES = ("microtrait", "mode", "antipattern", "contradiction", "grammar")


def canonical_target_index(
    microtrait_document: dict[str, Any],
    mode_document: dict[str, Any],
    antipattern_document: dict[str, Any],
    contradiction_document: dict[str, Any],
    grammar_document: dict[str, Any],
) -> dict[str, set[str]]:
    """Return exact populated-artifact IDs without exposing source content."""

    index = {
        "microtrait": {row["microtrait_id"] for row in microtrait_document["entries"]},
        "mode": {row["mode_id"] for row in mode_document["modes"]},
        "antipattern": {row["anti_pattern_id"] for row in antipattern_document["entries"]},
        "contradiction": {row["contradiction_id"] for row in contradiction_document["entries"]},
        "grammar": {
            row["grammar_item_id"]
            for rows in grammar_document["layers"].values()
            for row in rows
        },
    }
    if set(index) != set(ELICITATION_TARGET_TYPES) or any(not values for values in index.values()):
        raise ValueError("canonical_target_index_invalid")
    return index


def review_ref_id(item_id: str) -> str:
    """Map a UI item ID to a schema-safe opaque reference."""

    return stable_id("review", item_id)


def build_elicitation_linkage(
    pack: dict[str, Any],
    *,
    pack_sha256: str,
    owner_seed: dict[str, Any],
    microtrait_document: dict[str, Any],
    mode_document: dict[str, Any],
    antipattern_document: dict[str, Any],
    contradiction_document: dict[str, Any],
    grammar_document: dict[str, Any],
) -> dict[str, Any]:
    """Join public-safe review stimuli to ignored hypotheses without labels.

    `target_refs` originate in the elicitation generator.  The one actual
    owner-asserted mode is linked dynamically from the ignored assertion and
    the pack's generic mode-boundary section; its identifier is never embedded
    in tracked logic.  Linkage denotes coverage only, never owner acceptance.
    """

    safety = {
        "local_only": True,
        "network_required": False,
        "owner_answers_present": False,
        "owner_labels_present": False,
        "owner_review_completed": False,
        "profile_frozen": False,
        "training_authorized": False,
        "training_started": False,
    }
    for key, expected in safety.items():
        if pack.get(key) is not expected:
            raise ValueError(f"elicitation_pack_safety_invalid:{key}")

    items = pack.get("decision_items")
    if not isinstance(items, list) or not items:
        raise ValueError("elicitation_decision_items_required")
    by_item_id: dict[str, dict[str, Any]] = {}
    for item in items:
        item_id = item.get("item_id")
        if not isinstance(item_id, str) or not item_id or item_id in by_item_id:
            raise ValueError("elicitation_item_id_invalid")
        by_item_id[item_id] = item

    target_index = canonical_target_index(
        microtrait_document,
        mode_document,
        antipattern_document,
        contradiction_document,
        grammar_document,
    )
    target_to_items: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    unresolved: list[dict[str, str]] = []
    for item in items:
        refs = item.get("target_refs")
        if not isinstance(refs, list) or not refs:
            raise ValueError(f"elicitation_target_refs_required:{item['item_id']}")
        seen: set[tuple[str, str]] = set()
        for ref in refs:
            if not isinstance(ref, dict) or set(ref) != {"target_type", "target_id"}:
                raise ValueError(f"elicitation_target_ref_shape_invalid:{item['item_id']}")
            target_type = ref["target_type"]
            target_id = ref["target_id"]
            key = (target_type, target_id)
            if target_type not in target_index or not isinstance(target_id, str) or key in seen:
                raise ValueError(f"elicitation_target_ref_invalid:{item['item_id']}")
            seen.add(key)
            if target_id not in target_index[target_type]:
                unresolved.append({"target_type": target_type, "target_id": target_id})
                continue
            target_to_items[key].append(item)

    for item in items:
        if item.get("blind_repeat"):
            source = by_item_id.get(item.get("repeat_of"))
            if source is None or item["target_refs"] != source["target_refs"]:
                raise ValueError(f"blind_repeat_target_linkage_invalid:{item['item_id']}")

    # The pack intentionally does not hardcode the ignored owner seed in its
    # public target map.  Connect it locally to all dedicated boundary-review
    # items after proving the pack and ignored assertion describe the same seed.
    owner_seed_modes = [
        row["mode_id"]
        for row in mode_document["modes"]
        if row["seed_status"] == "OWNER_ASSERTED_SEED"
    ]
    pack_seed = pack.get("owner_asserted_mode_seed", {})
    if (
        len(owner_seed_modes) != 1
        or pack_seed.get("mode_id") != owner_seed.get("persona_seed_id")
        or owner_seed_modes[0] != owner_seed.get("mode_id")
    ):
        raise ValueError("owner_seed_dynamic_linkage_invalid")
    seed_boundary_items = [
        item for item in items
        if item.get("section") == "mode_boundary"
    ]
    if not seed_boundary_items:
        raise ValueError("owner_seed_boundary_review_items_missing")
    seed_target_key = ("mode", owner_seed_modes[0])
    seed_was_explicitly_targeted = seed_target_key in target_to_items
    target_to_items[seed_target_key].extend(seed_boundary_items)

    # Deduplicate links while preserving pack order.
    position = {item["item_id"]: index for index, item in enumerate(items)}
    entries: list[dict[str, Any]] = []
    for (target_type, target_id), linked_items in sorted(target_to_items.items()):
        unique_items = {
            item["item_id"]: item
            for item in linked_items
        }
        ordered = sorted(unique_items.values(), key=lambda item: position[item["item_id"]])
        all_refs = [review_ref_id(item["item_id"]) for item in ordered]
        source_refs = [
            review_ref_id(item["item_id"])
            for item in ordered
            if not item.get("blind_repeat")
        ]
        boundary_refs = [
            review_ref_id(item["item_id"])
            for item in ordered
            if item.get("task_type") == "scenario_pair" or item.get("section") == "mode_boundary"
        ]
        reverse_refs = [
            review_ref_id(item["item_id"])
            for item in ordered
            if item.get("section") == "reverse_controls" or "reverse_control" in item.get("battery_tags", [])
        ]
        entries.append({
            "target_type": target_type,
            "target_id": target_id,
            "review_item_refs": all_refs,
            "source_review_item_refs": source_refs,
            "boundary_review_item_refs": boundary_refs,
            "reverse_control_item_refs": reverse_refs,
            "owner_review_status": "UNREVIEWED",
            "owner_review_required": True,
            "allowed_for_training": False,
        })

    review_items = [
        {
            "review_ref_id": review_ref_id(item["item_id"]),
            "item_id": item["item_id"],
            "session": item["session"],
            "section": item["section"],
            "task_type": item["task_type"],
            "register": item["register"],
            "blind_repeat": bool(item["blind_repeat"]),
            "repeat_of_ref": review_ref_id(item["repeat_of"]) if item.get("repeat_of") else None,
            "owner_response_present": False,
            "owner_label_present": False,
        }
        for item in items
    ]
    targeted_counts = Counter(entry["target_type"] for entry in entries)
    required_summary = pack.get("target_ref_summary", {}).get("required_high_value_target_counts", {})
    required_counts = {
        target_type: int(required_summary.get(target_type, 0))
        for target_type in ELICITATION_TARGET_TYPES
    }
    # Add the dynamically linked ignored owner seed to the generic mode floor.
    required_counts["mode"] += 0 if seed_was_explicitly_targeted else 1
    linked_counts = {
        target_type: targeted_counts[target_type]
        for target_type in ELICITATION_TARGET_TYPES
    }
    uncovered_counts = {
        target_type: max(0, required_counts[target_type] - linked_counts[target_type])
        for target_type in ELICITATION_TARGET_TYPES
    }
    unresolved_unique = sorted(
        {(row["target_type"], row["target_id"]) for row in unresolved}
    )
    linkage = {
        "version": "persona-elicitation-evidence-linkage.v1",
        "status": "OWNER_REVIEW_LINKAGE_READY" if not unresolved_unique and not any(uncovered_counts.values()) else "OWNER_REVIEW_LINKAGE_INCOMPLETE",
        "pack_id": pack.get("pack_id"),
        "pack_sha256": pack_sha256,
        "coverage_scope": "ELICITATION_GENERATOR_SELECTED_HIGH_VALUE_CANDIDATES",
        "decision_item_count": len(items),
        "review_item_ref_count": len(review_items),
        "artifact_target_counts": {
            target_type: len(target_index[target_type])
            for target_type in ELICITATION_TARGET_TYPES
        },
        "linked_target_counts": linked_counts,
        "required_high_value_target_counts": required_counts,
        "covered_high_value_target_counts": {
            target_type: required_counts[target_type] - uncovered_counts[target_type]
            for target_type in ELICITATION_TARGET_TYPES
        },
        "uncovered_high_value_target_counts": uncovered_counts,
        "unresolved_target_refs": [
            {"target_type": target_type, "target_id": target_id}
            for target_type, target_id in unresolved_unique
        ],
        "review_items": review_items,
        "entries": entries,
        "owner_answers_present": False,
        "owner_labels_present": False,
        "owner_review_completed": False,
        "profile_frozen": False,
        "training_authorized": False,
        "training_started": False,
        "allowed_for_training": False,
    }
    validate_no_private_excerpt_fields(linkage)
    return linkage


def apply_elicitation_links(
    linkage: dict[str, Any],
    microtrait_document: dict[str, Any],
    mode_document: dict[str, Any],
    antipattern_document: dict[str, Any],
) -> None:
    """Backfill only schema-defined review-reference fields."""

    by_target = {
        (entry["target_type"], entry["target_id"]): entry
        for entry in linkage["entries"]
    }
    for row in microtrait_document["entries"]:
        linked = by_target.get(("microtrait", row["microtrait_id"]))
        if linked:
            row["boundary_pair_refs"] = linked["boundary_review_item_refs"] or linked["source_review_item_refs"]
    for row in antipattern_document["entries"]:
        linked = by_target.get(("antipattern", row["anti_pattern_id"]))
        if linked:
            row["reverse_control_refs"] = linked["reverse_control_item_refs"] or linked["source_review_item_refs"]
    for row in mode_document["modes"]:
        linked = by_target.get(("mode", row["mode_id"]))
        if linked:
            # These are unresolved candidate-review references, never accepted
            # SHOULD/SHOULD_NOT outcomes.  Preserve any concrete seed examples.
            candidate_refs = linked["boundary_review_item_refs"] or linked["source_review_item_refs"]
            row["may_trigger_refs"] = list(dict.fromkeys([*row["may_trigger_refs"], *candidate_refs]))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Offline R30J0-P2 persona evidence excavation")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--owner-assertion-file", type=Path)
    return parser.parse_args()


def owner_review_v2_status(output_root: Path) -> tuple[int, bool]:
    """Read aggregate readiness only; never read or expose owner review state."""

    manifest_path = output_root / "owner_review_v2/manifest.json"
    if not manifest_path.is_file():
        return 0, False
    manifest = read_json(manifest_path)
    decision_count = manifest.get("decision_item_count")
    optional_writes = manifest.get("optional_owner_write_prompt_count")
    safe = (
        isinstance(decision_count, int)
        and 180 <= decision_count <= 220
        and isinstance(optional_writes, int)
        and 30 <= optional_writes <= 50
        and manifest.get("network_required") is False
        and manifest.get("owner_review_completed") is False
        and manifest.get("owner_answers_present") is False
        and manifest.get("owner_labels_present") is False
        and manifest.get("training_started") is False
        and manifest.get("training_authorized") is False
    )
    return int(decision_count) if isinstance(decision_count, int) else 0, bool(safe)


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    output_root = (args.output_root or root / "artifacts/r30j0/persona_excavation").resolve()
    assertion_path = (args.owner_assertion_file or output_root / "source_reanalysis/current_owner_assertions.json").resolve()
    if not output_root.is_relative_to(root / "artifacts/r30j0/persona_excavation"):
        raise ValueError("p2_output_must_remain_under_ignored_persona_excavation")

    assert_p2_training_guard(TRAINING_GUARD)
    before_hashes = input_hashes(root, assertion_path)
    owner_assertion = load_assertion(assertion_path)
    owner_seed = owner_assertion["assertions"][0]
    deprecated_labels = list(owner_assertion["label_governance"])

    inventory_doc = read_json(root / INPUT_RELATIVE_PATHS[0])
    inventory = inventory_doc.get("sources", [])
    ledger = read_jsonl(root / INPUT_RELATIVE_PATHS[1])
    historical = read_json(root / INPUT_RELATIVE_PATHS[2])
    if not isinstance(inventory, list):
        raise ValueError("source_inventory_invalid")
    admitted = load_admitted_transcripts(root, inventory)
    edited_secondary, edited_reanalysis = reexamine_edited_secondary(root, inventory)
    historical_reanalysis = reexamine_historical_assets(root, historical)
    feedback_audit = scan_project_local_feedback(root, admitted, edited_secondary)

    actual_counts = {
        "inventory": len(inventory),
        "ledger": len(ledger),
        "transcripts": sum(row.get("authorship_class") == "OWNER_ANSWER_TRANSCRIPT_HIGH_CONFIDENCE" for row in inventory),
        "owner_authored_edited": sum(row.get("authorship_class") == "OWNER_AUTHORED_EDITED" for row in inventory),
        "admitted_primary": len(admitted),
    }
    if actual_counts != EXPECTED_FROZEN_COUNTS:
        raise ValueError(f"frozen_r30j0_p1_counts_changed:{actual_counts}")

    microtraits = build_microtraits(admitted, owner_seed)
    modes = build_modes(admitted, owner_seed)
    owner_mode_hypothesis = build_owner_asserted_mode_hypothesis(owner_seed)
    deprecated_label_audit = build_deprecated_label_decomposition(deprecated_labels[0], microtraits)
    antipatterns = build_antipatterns(admitted)
    contradictions = build_contradictions(admitted)
    register_matrix = build_register_matrix(admitted)
    grammar_rules = build_grammar(admitted, owner_seed)
    head_recommendations = build_head_recommendations()
    source_reanalysis = build_source_reanalysis(
        inventory,
        ledger,
        historical,
        admitted,
        before_hashes,
        edited_reanalysis,
        historical_reanalysis,
        feedback_audit,
    )
    elicitation_item_count, owner_review_v2_ready = owner_review_v2_status(output_root)
    historical_normative_candidate_count = sum(
        row.get("evidence_type") != "descriptive_style" for row in ledger
    )

    descriptive_signal_or_owner_assertion_candidate_count = sum(
        record["descriptive_evidence_count"] >= 3 or record["normative_evidence_count"] >= 1
        for record in microtraits
    )
    if descriptive_signal_or_owner_assertion_candidate_count < 40:
        raise ValueError(
            "insufficient_descriptive_signal_or_owner_assertion_candidates:"
            f"{descriptive_signal_or_owner_assertion_candidate_count}"
        )
    if any(deprecated_persona_label(record["trait_id"], deprecated_labels) for record in microtraits):
        raise ValueError("deprecated_label_leaked_into_microtraits")
    if any(deprecated_persona_label(record["mode_id"], deprecated_labels) for record in modes):
        raise ValueError("deprecated_label_leaked_into_modes")

    microtrait_document = schema_microtrait_document(microtraits)
    mode_document = schema_mode_document(modes)
    antipattern_document = schema_antipattern_document(antipatterns)
    contradiction_document = schema_contradiction_document(contradictions)
    coverage_document = schema_coverage_document(microtraits, modes)
    grammar_document = schema_grammar_document(microtraits, modes, antipatterns, grammar_rules)
    elicitation_pack_path = output_root / "elicitation_pack_v2.json"
    if not elicitation_pack_path.is_file():
        raise FileNotFoundError("p2_elicitation_pack_required_for_evidence_linkage")
    elicitation_pack = read_json(elicitation_pack_path)
    elicitation_linkage = build_elicitation_linkage(
        elicitation_pack,
        pack_sha256=sha256_file(elicitation_pack_path),
        owner_seed=owner_seed,
        microtrait_document=microtrait_document,
        mode_document=mode_document,
        antipattern_document=antipattern_document,
        contradiction_document=contradiction_document,
        grammar_document=grammar_document,
    )
    if elicitation_linkage["status"] != "OWNER_REVIEW_LINKAGE_READY":
        raise ValueError("owner_review_linkage_incomplete")
    apply_elicitation_links(
        elicitation_linkage,
        microtrait_document,
        mode_document,
        antipattern_document,
    )

    linked_target_counts = elicitation_linkage["linked_target_counts"]
    required_linked_counts = {
        "microtrait": len(microtrait_document["entries"]),
        "mode": len(mode_document["modes"]),
        "antipattern": len(antipattern_document["entries"]),
        "contradiction": len(contradiction_document["entries"]),
    }
    missing_required_linkage = {
        target_type: required - linked_target_counts[target_type]
        for target_type, required in required_linked_counts.items()
        if linked_target_counts[target_type] < required
    }
    if missing_required_linkage:
        raise ValueError(f"required_persona_review_linkage_missing:{missing_required_linkage}")

    trigger_diversity = {
        "microtrait_positive_trigger_unique_count": len({
            tuple(row["trigger_positive"]) for row in microtrait_document["entries"]
        }),
        "microtrait_negative_trigger_unique_count": len({
            tuple(row["trigger_negative"]) for row in microtrait_document["entries"]
        }),
        "antipattern_trigger_context_unique_count": len({
            tuple(row["trigger_contexts"]) for row in antipattern_document["entries"]
        }),
    }
    expected_trigger_diversity = {
        "microtrait_positive_trigger_unique_count": len(microtrait_document["entries"]),
        "microtrait_negative_trigger_unique_count": len(microtrait_document["entries"]),
        "antipattern_trigger_context_unique_count": len(antipattern_document["entries"]),
    }
    if trigger_diversity != expected_trigger_diversity:
        raise ValueError(f"persona_trigger_conditions_not_specific:{trigger_diversity}")

    # Source-reanalysis output intentionally contains only aggregate counts and
    # cryptographic input identities; the explicit assertion is already in the
    # ignored local input file and is not copied into tracked material.
    atomic_json(output_root / "source_reanalysis/source_reanalysis_summary.json", source_reanalysis)
    atomic_json(output_root / "source_reanalysis/owner_edited_secondary_reanalysis.json", edited_reanalysis)
    atomic_json(output_root / "source_reanalysis/historical_asset_reanalysis.json", historical_reanalysis)
    atomic_json(output_root / "source_reanalysis/explicit_feedback_signal_audit.json", feedback_audit)
    atomic_json(output_root / "source_reanalysis/assertion_admission_receipt.json", {
        "version": "persona-current-assertion-admission.v1",
        "assertion_ids": [row["assertion_id"] for row in owner_assertion["assertions"]],
        "current_explicit_assertion_count": len(owner_assertion["assertions"]),
        "crocodile_mode_seed_present": True,
        "crocodile_mode_boundary_known": False,
        "deprecated_wired_label_removed": True,
        "source_passages_included": False,
        "allowed_for_training": False,
    })
    atomic_json(output_root / "persona_microtraits.json", microtrait_document)
    atomic_json(output_root / "persona_mode_hypotheses.json", mode_document)
    atomic_json(output_root / "crocodile_mode_hypothesis.json", owner_mode_hypothesis)
    atomic_json(output_root / "wired_label_decomposition.json", deprecated_label_audit)
    atomic_json(output_root / "persona_antipatterns.json", antipattern_document)
    write_jsonl(output_root / "persona_contradictions.jsonl", contradiction_document["entries"])
    atomic_json(output_root / "persona_contradiction_ledger.json", contradiction_document)
    atomic_json(output_root / "persona_register_matrix.json", register_matrix)
    atomic_json(output_root / "persona_coverage_matrix.json", coverage_document)
    atomic_json(output_root / "persona_grammar_hypotheses.json", grammar_document)
    atomic_json(output_root / "persona_elicitation_linkage.json", elicitation_linkage)
    atomic_json(output_root / "persona_head_recommendations.json", head_recommendations)
    atomic_text(output_root / "unresolved_persona_questions.md", unresolved_markdown())

    after_hashes = input_hashes(root, assertion_path)
    p1_hashes_unchanged = before_hashes == after_hashes
    report = {
        "version": "r30j0-p2-persona-excavation-report.v1",
        "generated_at": now_iso(),
        "terminal_state": "R30J0_P2_PERSONA_EXCAVATION_READY",
        "next_state": "HUMAN_PERSONA_ELICITATION_REQUIRED",
        "historical_sources_reexamined": len(inventory),
        "preference_ledger_rows_reexamined": len(ledger),
        "owner_answer_transcripts_reexamined": actual_counts["transcripts"],
        "owner_authored_edited_reexamined": actual_counts["owner_authored_edited"],
        "admitted_primary_sources_reexamined": actual_counts["admitted_primary"],
        "historical_personalization_assets_reexamined": len(historical.get("records", [])),
        "owner_edited_content_reexamined_count": edited_reanalysis["content_reexamined_count"],
        "owner_edited_content_admitted_as_normative_count": 0,
        "historical_asset_content_reexamined_count": historical_reanalysis["asset_content_reexamined_count"],
        "generated_historical_asset_evidence_weight": 0,
        "unknown_inventory_content_opened": 0,
        "project_local_feedback_files_scanned": feedback_audit["tracked_project_files_scanned"],
        "unattributed_feedback_signals_admitted_as_owner_evidence": 0,
        "normative_personal_evidence_count": 1 + historical_normative_candidate_count,
        "high_confidence_current_normative_count": 1,
        "historical_candidate_normative_count": historical_normative_candidate_count,
        "historical_candidate_normative_owner_confirmed_count": 0,
        "retained_owner_confirmed_preference_count": 0,
        "microtrait_hypothesis_count": len(microtraits),
        "descriptive_signal_or_owner_assertion_candidate_count": descriptive_signal_or_owner_assertion_candidate_count,
        "owner_asserted_microtrait_seed_count": 1,
        "retained_microtrait_count": 0,
        "persona_mode_hypothesis_count": len(modes),
        "register_count": len(REGISTER_CANDIDATES),
        "antipattern_count": len(antipatterns),
        "contradiction_count": len(contradiction_document["entries"]),
        "unresolved_question_count": len(UNRESOLVED_QUESTIONS),
        "grammar_hypothesis_count": len(grammar_rules),
        "elicitation_item_count": elicitation_item_count,
        "review_linked_microtrait_count": linked_target_counts["microtrait"],
        "review_linked_mode_count": linked_target_counts["mode"],
        "review_linked_antipattern_count": linked_target_counts["antipattern"],
        "review_linked_contradiction_count": linked_target_counts["contradiction"],
        "review_linked_grammar_count": linked_target_counts["grammar"],
        "review_linked_target_count": sum(linked_target_counts.values()),
        "unresolved_review_target_ref_count": len(elicitation_linkage["unresolved_target_refs"]),
        "uncovered_high_value_target_ref_count": sum(elicitation_linkage["uncovered_high_value_target_counts"].values()),
        "microtrait_boundary_review_ref_count": sum(bool(row["boundary_pair_refs"]) for row in microtrait_document["entries"]),
        "mode_candidate_review_ref_count": sum(bool(row["may_trigger_refs"]) for row in mode_document["modes"]),
        "antipattern_reverse_control_ref_count": sum(bool(row["reverse_control_refs"]) for row in antipattern_document["entries"]),
        **trigger_diversity,
        "crocodile_mode_seed_present": True,
        "crocodile_mode_boundary_known": False,
        "deprecated_wired_label_removed": True,
        "owner_review_v2_ready": owner_review_v2_ready,
        "owner_review_v1_paused": True,
        "owner_review_completed": False,
        "profile_frozen": False,
        "p1_input_hashes_unchanged": p1_hashes_unchanged,
        "descriptive_promoted_to_normative_count": 0,
        "private_source_passages_output": 0,
        **TRAINING_GUARD,
    }
    assert_p2_training_guard(report)
    if not p1_hashes_unchanged:
        raise ValueError("frozen_r30j0_p1_inputs_modified")
    atomic_json(output_root / "reports/persona_excavation_report.json", report)
    atomic_json(output_root / "reports/persona_excavation_summary.json", {
        "historical_sources_reexamined": report["historical_sources_reexamined"],
        "normative_personal_evidence_count": report["normative_personal_evidence_count"],
        "high_confidence_current_normative_count": report["high_confidence_current_normative_count"],
        "historical_candidate_normative_count": report["historical_candidate_normative_count"],
        "historical_candidate_normative_owner_confirmed_count": 0,
        "retained_owner_confirmed_preference_count": 0,
        "microtrait_hypothesis_count": report["microtrait_hypothesis_count"],
        "persona_mode_hypothesis_count": report["persona_mode_hypothesis_count"],
        "register_count": report["register_count"],
        "antipattern_count": report["antipattern_count"],
        "contradiction_count": report["contradiction_count"],
        "unresolved_question_count": report["unresolved_question_count"],
        "elicitation_item_count": report["elicitation_item_count"],
        "review_linked_microtrait_count": report["review_linked_microtrait_count"],
        "review_linked_mode_count": report["review_linked_mode_count"],
        "review_linked_antipattern_count": report["review_linked_antipattern_count"],
        "review_linked_contradiction_count": report["review_linked_contradiction_count"],
        "review_linked_grammar_count": report["review_linked_grammar_count"],
        "review_linked_target_count": report["review_linked_target_count"],
        "unresolved_review_target_ref_count": report["unresolved_review_target_ref_count"],
        "uncovered_high_value_target_ref_count": report["uncovered_high_value_target_ref_count"],
        "microtrait_boundary_review_ref_count": report["microtrait_boundary_review_ref_count"],
        "mode_candidate_review_ref_count": report["mode_candidate_review_ref_count"],
        "antipattern_reverse_control_ref_count": report["antipattern_reverse_control_ref_count"],
        "microtrait_positive_trigger_unique_count": report["microtrait_positive_trigger_unique_count"],
        "microtrait_negative_trigger_unique_count": report["microtrait_negative_trigger_unique_count"],
        "antipattern_trigger_context_unique_count": report["antipattern_trigger_context_unique_count"],
        "crocodile_mode_seed_present": True,
        "crocodile_mode_boundary_known": False,
        "deprecated_wired_label_removed": True,
        "owner_review_v2_ready": owner_review_v2_ready,
        "descriptive_promoted_to_normative_count": 0,
        "descriptive_signal_or_owner_assertion_candidate_count": descriptive_signal_or_owner_assertion_candidate_count,
        "retained_microtrait_count": 0,
        "private_source_passages_output": 0,
        "p1_input_hashes_unchanged": p1_hashes_unchanged,
        "owner_review_completed": False,
        "profile_frozen": False,
        "training_started": False,
        "classification_updates": 0,
        "optimizer_tokens": 0,
        "assistant_target_tokens": 0,
        "checkpoint": None,
        "candidate": None,
        "r30j1_authorized": False,
        "api_requests": 0,
        "network_requests": 0,
        "model_architecture_changed": False,
        "production_modified": False,
        "deployment_performed": False,
    })
    atomic_json(output_root / "reports/training_guard.json", TRAINING_GUARD)
    atomic_json(output_root / "reports/source_integrity.json", {
        "version": "r30j0-p2-source-integrity.v1",
        "p1_input_hashes_before": before_hashes,
        "p1_input_hashes_after": after_hashes,
        "p1_input_hashes_unchanged": p1_hashes_unchanged,
        "source_passages_included": False,
    })

    # Aggregate-only stdout: no paths, excerpts, owner wording or hash values.
    print(json.dumps({
        "historical_sources_reexamined": report["historical_sources_reexamined"],
        "normative_personal_evidence_count": report["normative_personal_evidence_count"],
        "microtrait_hypothesis_count": report["microtrait_hypothesis_count"],
        "descriptive_signal_or_owner_assertion_candidate_count": descriptive_signal_or_owner_assertion_candidate_count,
        "retained_microtrait_count": 0,
        "persona_mode_hypothesis_count": report["persona_mode_hypothesis_count"],
        "register_count": report["register_count"],
        "antipattern_count": report["antipattern_count"],
        "contradiction_count": report["contradiction_count"],
        "unresolved_question_count": report["unresolved_question_count"],
        "elicitation_item_count": report["elicitation_item_count"],
        "review_linked_microtrait_count": report["review_linked_microtrait_count"],
        "review_linked_mode_count": report["review_linked_mode_count"],
        "review_linked_antipattern_count": report["review_linked_antipattern_count"],
        "review_linked_contradiction_count": report["review_linked_contradiction_count"],
        "review_linked_grammar_count": report["review_linked_grammar_count"],
        "unresolved_review_target_ref_count": report["unresolved_review_target_ref_count"],
        "microtrait_positive_trigger_unique_count": report["microtrait_positive_trigger_unique_count"],
        "microtrait_negative_trigger_unique_count": report["microtrait_negative_trigger_unique_count"],
        "antipattern_trigger_context_unique_count": report["antipattern_trigger_context_unique_count"],
        "crocodile_mode_seed_present": True,
        "crocodile_mode_boundary_known": False,
        "deprecated_wired_label_removed": True,
        "p1_input_hashes_unchanged": p1_hashes_unchanged,
        "owner_review_v2_ready": owner_review_v2_ready,
        "training_started": False,
        "r30j1_authorized": False,
        "terminal_state": report["terminal_state"],
        "next_state": report["next_state"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
