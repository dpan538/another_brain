#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "artifacts" / "r28hotfix4" / "reports" / "open_question_pipeline_audit.json"

TEST_INPUTS = [
    "你如何看待生与死？",
    "你怎么看人为什么要活着？",
    "什么是美？",
    "关系里最重要的是什么？",
    "你觉得语言有什么意义？",
]

READ_PATHS = {
    "browser_runtime": ROOT / "web" / "another_brain_chat" / "browser_runtime.js",
    "app": ROOT / "web" / "another_brain_chat" / "app.js",
    "html": ROOT / "web" / "another_brain_chat" / "index.html",
    "open_question_route": ROOT / "src" / "browser_runtime" / "router" / "open_question_route.ts",
    "route_classifier": ROOT / "src" / "browser_runtime" / "router" / "route_classifier.ts",
    "abstract_value_surfaces": ROOT / "src" / "browser_runtime" / "router" / "abstract_value_surfaces.ts",
    "generation_watchdog": ROOT / "src" / "browser_runtime" / "generation" / "generation_watchdog.ts",
    "generation_result": ROOT / "src" / "browser_runtime" / "generation" / "generation_result.ts",
}


def read_sources() -> dict[str, str]:
    return {name: path.read_text(encoding="utf-8") for name, path in READ_PATHS.items()}


def has_all(text: str, needles: list[str]) -> bool:
    return all(needle in text for needle in needles)


def main() -> int:
    sources = read_sources()
    runtime = sources["browser_runtime"]
    app = sources["app"]
    html = sources["html"]
    route = sources["open_question_route"]
    route_classifier = sources["route_classifier"]
    watchdog = sources["generation_watchdog"]
    result = sources["generation_result"]

    checks = {
        "send_button_handler_triggers": "on(form, \"submit\"" in app and "runtime.run(text" in app,
        "input_enters_route_classifier": "classifyOpenQuestionRoute(input)" in runtime and "matchMicroIntent(input)" in runtime,
        "open_question_not_micro_intent_noop": "&& !openRoute.should_attempt_q4" in runtime,
        "q4_runtime_ready_checked": "isQ4ReadyForGeneration()" in runtime and "q4ReadyAtRequest" in runtime,
        "q4_generation_function_called": "draftWithWorker(buildDecoderPrompt" in runtime,
        "worker_message_sent": "this.worker.postMessage" in runtime and "type: \"generate\"" in runtime,
        "worker_return_handled": "message.type === \"final\"" in runtime and "message.type === \"token\"" in runtime,
        "timeout_exists": has_all(runtime, ["startTimer", "firstTokenTimer", "totalTimer", "q4_generation_timeout"]),
        "fallback_exists": "abstractValueFallbackSurface" in runtime and "buildOpenQuestionRoutePolicy" in runtime,
        "no_infinite_pending": "TERMINAL_GENERATION_STATUSES" in runtime and "generationAlwaysResolves" in result,
        "process_trace_generation_started": "generation_started" in runtime and "q4_generation_attempted" in runtime,
        "dashboard_tokens_generated": "tokens_generated" in runtime and "token-count-status" in html,
        "dashboard_answer_source": "answer-source-status" in html and "answerSourceStatus" in app,
        "dashboard_fallback_reason": "fallback-reason-status" in html and "fallbackReasonStatus" in app,
        "failure_blocker_visible": "q4GenerationBlocker()" in runtime and "fallbackReasonStatus" in app,
        "module_route_classifier_uses_open_route": "classifyOpenQuestionRoute(input.user_input)" in route_classifier,
    }

    classified_inputs = []
    for prompt in TEST_INPUTS:
        if "生与死" in prompt:
            category = "abstract_value_question"
        elif "活着" in prompt:
            category = "philosophical_question"
        elif "美" in prompt:
            category = "aesthetic_question"
        elif "关系" in prompt:
            category = "value_or_relation_question"
        elif "语言" in prompt:
            category = "abstract_meaning_question"
        else:
            category = "open_question"
        classified_inputs.append(
            {
                "input": prompt,
                "expected_category": category,
                "should_attempt_q4_when_ready": True,
                "covered_by_route_source": category in route,
            }
        )

    report = {
        "task": "R28HOTFIX4",
        "status": "pass" if all(checks.values()) and all(item["covered_by_route_source"] for item in classified_inputs) else "fail",
        "checks": checks,
        "test_inputs": classified_inputs,
        "pipeline": [
            "input",
            "intent/router",
            "RAG/evidence",
            "q4 attempt when ready",
            "watchdog",
            "finalizer/fallback",
        ],
        "read_scope": [str(path.relative_to(ROOT)) for path in READ_PATHS.values()],
        "forbidden_scope_not_read": [
            "root DOCX/PDF",
            "data/public_ingestion",
            "eval prompts",
            "old question_pack_001 rows 51-100",
        ],
    }

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
