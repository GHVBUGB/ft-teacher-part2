import pytest
from production.grammar import GrammarRound, ExamError, new_round

IDS = tuple(str(n) for n in range(30))
KEY = dict.fromkeys(IDS, 1)

def test_six_wrong_can_pass():
    r = GrammarRound("alice", IDS)
    for i, q in enumerate(IDS):
        r.submit("alice", q, 0 if i < 6 else 1, KEY)
    assert r.finished and r.passed and r.correct == 24

def test_seventh_wrong_ends_immediately():
    r = GrammarRound("alice", IDS)
    for q in IDS[:6]:
        r.submit("alice", q, 0, KEY)
    assert not r.finished
    r.submit("alice", IDS[6], 0, KEY)
    assert r.finished and not r.passed
    with pytest.raises(ExamError, match="ROUND_FINISHED"):
        r.submit("alice", IDS[7], 1, KEY)

def test_owner_order_and_duplicate():
    r = GrammarRound("alice", IDS)
    for actor, q, error in [("bob", IDS[0], "FORBIDDEN"),
                            ("alice", IDS[3], "OUT_OF_ORDER")]:
        with pytest.raises(ExamError, match=error):
            r.submit(actor, q, 1, KEY)
    r.submit("alice", IDS[0], 1, KEY)
    with pytest.raises(ExamError, match="ALREADY_ANSWERED"):
        r.submit("alice", IDS[0], 0, KEY)
    assert len(r.answers) == 1 and r.correct == 1

def test_retake_separate_and_shuffled():
    old = GrammarRound("alice", IDS)
    old.submit("alice", IDS[0], 0, KEY)
    fresh = new_round("alice", IDS, IDS)
    assert set(fresh.order) == set(IDS) and fresh.order != IDS
    assert not fresh.answers and len(old.answers) == 1

def test_reject_invalid_options():
    r = GrammarRound("alice", IDS)
    for option in [True, -1, 2, "1", None]:
        with pytest.raises(ExamError, match="INVALID_OPTION"):
            r.submit("alice", IDS[0], option, KEY)
    assert not r.answers
