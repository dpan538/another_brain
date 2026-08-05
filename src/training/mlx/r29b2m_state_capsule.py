"""Bounded, local-only state capsule for a 256-token dialogue context."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable


@dataclass
class DialogueStateCapsule:
    active_topic: str | None = None
    active_task: str | None = None
    recent_referents: list[str] = field(default_factory=list)
    explicit_constraints: list[str] = field(default_factory=list)
    latest_user_correction: str | None = None
    unresolved_question: str | None = None
    requested_answer_length: str | None = None

    def reset(self) -> None:
        self.active_topic = None
        self.active_task = None
        self.recent_referents.clear()
        self.explicit_constraints.clear()
        self.latest_user_correction = None
        self.unresolved_question = None
        self.requested_answer_length = None

    def update(self, *, topic: str | None = None, task: str | None = None, referents: Iterable[str] = (), constraints: Iterable[str] = (), correction: str | None = None, unresolved_question: str | None = None, answer_length: str | None = None) -> None:
        if topic:
            self.active_topic = topic
        if task:
            self.active_task = task
        if correction:
            # A correction supersedes the prior interpretation rather than
            # appending conflicting context to the next prompt.
            self.latest_user_correction = correction
        if unresolved_question is not None:
            self.unresolved_question = unresolved_question
        if answer_length:
            self.requested_answer_length = answer_length
        self.recent_referents = list(dict.fromkeys([*referents, *self.recent_referents]))[:3]
        self.explicit_constraints = list(dict.fromkeys([*constraints, *self.explicit_constraints]))[:4]

    def render(self, *, max_characters: int = 96) -> str:
        """Render only compact operational facts; never claim absent memory."""
        items: list[str] = []
        if self.active_topic:
            items.append(f"话题={self.active_topic}")
        if self.active_task:
            items.append(f"任务={self.active_task}")
        if self.recent_referents:
            items.append(f"指代={'、'.join(self.recent_referents)}")
        if self.explicit_constraints:
            items.append(f"约束={'、'.join(self.explicit_constraints)}")
        if self.latest_user_correction:
            items.append(f"纠正={self.latest_user_correction}")
        if self.unresolved_question:
            items.append(f"待问={self.unresolved_question}")
        if self.requested_answer_length:
            items.append(f"长度={self.requested_answer_length}")
        return "；".join(items)[:max_characters]
