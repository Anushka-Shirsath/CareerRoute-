import pytest
from pydantic import ValidationError
from app.schemas import ManualResult, Subject
from app.domain.results import snapshot


def subject(**kw):
    return Subject(canonical_subject='mathematics', name_as_shown='Maths', **kw)


def test_obtained_over_max_rejected():
    with pytest.raises(ValidationError):
        subject(obtained=101, maximum=100)


def test_unknown_stays_null_not_zero():
    assert subject(grade_label='A').obtained is None


def test_grade_only_subject_allowed():
    assert subject(grade_label='A').grade_label == 'A'


def test_duplicate_subject_rejected():
    with pytest.raises(ValidationError):
        ManualResult(board='CBSE', exam_year=2026, subjects=[subject(obtained=10, maximum=20)] * 2)


def test_draft_not_used_for_snapshot():
    assert snapshot({'confirmation_state': 'draft', 'subjects': []}) is None


def test_aggregate_label_when_rule_unverified():
    result = snapshot({'confirmation_state': 'confirmed', 'subjects': [subject(obtained=80, maximum=100).model_dump()]})
    assert result['aggregate']['value'] == 80
    assert 'not an official aggregate' in result['aggregate']['label']
