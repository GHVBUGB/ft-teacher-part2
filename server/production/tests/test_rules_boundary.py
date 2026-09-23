import unittest
from production.grammar import GrammarRound, ExamError, new_round

class RuleBoundaries(unittest.TestCase):
    def test_foreign_actor_cannot_submit(self):
        r=GrammarRound('teacher1',('q1','q2'))
        with self.assertRaisesRegex(ExamError,'FORBIDDEN'):
            r.submit('teacher2','q1',0,{'q1':0})
        self.assertEqual(r.answers,{})

    def test_skip_repeat_and_bool_rejected(self):
        r=GrammarRound('teacher1',tuple('q'+str(i) for i in range(30)))
        with self.assertRaisesRegex(ExamError,'OUT_OF_ORDER'): r.submit('teacher1','q1',0,{'q1':0})
        with self.assertRaisesRegex(ExamError,'INVALID_OPTION'): r.submit('teacher1','q0',True,{'q0':0})
        r.submit('teacher1','q0',0,{'q0':0})
        with self.assertRaisesRegex(ExamError,'ALREADY_ANSWERED'): r.submit('teacher1','q0',0,{'q0':0})

    def test_24_correct_does_not_finish_before_last_question(self):
        r=GrammarRound('teacher1',tuple('q'+str(i) for i in range(30)))
        for i in range(24): r.submit('teacher1','q'+str(i),0,{'q'+str(i):0})
        self.assertFalse(r.finished); self.assertFalse(r.passed)
        for i in range(24,30): r.submit('teacher1','q'+str(i),1,{'q'+str(i):0})
        self.assertTrue(r.passed)
