from dataclasses import dataclass, asdict
import re

FORBIDDEN_RE = re.compile(
    r"(chain[-_ ]?of[-_ ]?thought|scratchpad|assistant analysis|hidden prompt|system prompt|private_sources/|BEGIN PRIVATE KEY|api[_-]?key|secret|evals/|another_brain_question_pack_001.*(?:5[1-9]|[6-9][0-9]|100))",
    re.I,
)


@dataclass
class TeacherProbeRequest:
    probe_id: str
    prompt: str
    source: str = "manual_future_intake"
    request_cot: bool = False
    contains_private_data: bool = False

    def validate(self):
        blob = f"{self.probe_id}\n{self.prompt}\n{self.source}"
        if self.request_cot:
            raise ValueError("teacher_probe_must_not_request_cot")
        if self.contains_private_data:
            raise ValueError("teacher_probe_must_not_contain_private_data")
        if FORBIDDEN_RE.search(blob):
            raise ValueError("teacher_probe_contains_forbidden_marker")
        return True


@dataclass
class TeacherProbeResponse:
    probe_id: str
    teacher_id: str
    final_answer: str
    review_status: str = "pending"

    def validate(self):
        if FORBIDDEN_RE.search(self.final_answer):
            raise ValueError("teacher_output_contains_forbidden_marker")
        return True


@dataclass
class TeacherCandidateRecord:
    candidate_id: str
    source_probe_id: str
    candidate_answer: str
    use_type: str = "comparison_only"
    teacher_output_used_directly: bool = False
    training_allowed: bool = False
    review_status: str = "pending"

    def to_dict(self):
        self.validate()
        return asdict(self)

    def validate(self):
        if self.teacher_output_used_directly:
            raise ValueError("teacher_output_must_not_be_used_directly")
        if self.training_allowed:
            raise ValueError("teacher_candidate_training_requires_later_review")
        if FORBIDDEN_RE.search(self.candidate_answer):
            raise ValueError("teacher_candidate_contains_forbidden_marker")
        return True
