"""Server-side grammar rules. Integration with authenticated DB transactions is pending."""
from dataclasses import dataclass, field
from secrets import SystemRandom


class ExamError(ValueError):
    pass


@dataclass
class GrammarRound:
    # The API must load this state from the database, never from the request.
    owner_id: str
    order: tuple[str, ...]
    answers: dict[str, int] = field(default_factory=dict)
    correct: int = 0

    @property
    def required(self):
        return (len(self.order) * 4 + 4) // 5

    @property
    def failed(self):
        return len(self.answers) - self.correct > len(self.order) - self.required

    @property
    def finished(self):
        return self.failed or len(self.answers) == len(self.order)

    @property
    def passed(self):
        return len(self.answers) == len(self.order) and self.correct >= self.required

    def submit(self, actor_id: str, question_id: str, option: int, answer_key: dict[str, int]):
        if actor_id != self.owner_id:
            raise ExamError("FORBIDDEN")
        if self.finished:
            raise ExamError("ROUND_FINISHED")
        if question_id in self.answers:
            raise ExamError("ALREADY_ANSWERED")
        if question_id != self.order[len(self.answers)]:
            raise ExamError("OUT_OF_ORDER")
        if type(option) is not int or option not in (0, 1):
            raise ExamError("INVALID_OPTION")
        # Compare with a server-owned answer key; do not accept a client score.
        correct = option == answer_key[question_id]
        self.answers[question_id] = option
        self.correct += int(correct)
        return {"correct": correct, "answered": len(self.answers),
                "finished": self.finished, "passed": self.passed}


def new_round(owner_id: str, question_ids: tuple[str, ...], previous=()):
    if not question_ids or len(set(question_ids)) != len(question_ids):
        raise ExamError("INVALID_QUESTION_SET")
    order = list(question_ids)
    SystemRandom().shuffle(order)
    if len(order) > 1 and tuple(order) == tuple(previous):
        order = order[1:] + order[:1]
    return GrammarRound(owner_id=owner_id, order=tuple(order))
