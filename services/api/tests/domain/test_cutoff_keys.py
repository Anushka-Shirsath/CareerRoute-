from app.domain.matching import cutoff_comparison

CONTEXT = {'admission_system': 'FYJC_CAP', 'academic_year': '2025-26', 'round': '1', 'quota': 'state', 'merit_metric': 'percent', 'extra_dimensions': {}}
RECORD = {**CONTEXT, 'category': 'OPEN', 'source_id': 'test-source', 'numeric_value': 80}
ACADEMIC = {'aggregate': {'merit_metric': 'percent', 'value': 85}}


def test_wrong_quota_not_comparable():
    result = cutoff_comparison({'cutoffs': [RECORD]}, ACADEMIC, 'OPEN', {**CONTEXT, 'quota': 'minority'})
    assert result['status'] == 'not_comparable' and result['reason'] == 'QUOTA_MISMATCH'


def test_metric_mismatch_not_comparable():
    result = cutoff_comparison({'cutoffs': [RECORD]}, {'aggregate': {'merit_metric': 'marks_500'}}, 'OPEN', CONTEXT)
    assert result['reason'] == 'METRIC_MISMATCH'


def test_category_missing_reason_code():
    assert cutoff_comparison({'cutoffs': [RECORD]}, ACADEMIC, None, CONTEXT)['reason'] == 'CATEGORY_NOT_PROVIDED'


def test_same_context_comparable():
    assert cutoff_comparison({'cutoffs': [RECORD]}, ACADEMIC, 'OPEN', CONTEXT)['status'] == 'comparable'


def test_extra_dimensions_must_match():
    result = cutoff_comparison({'cutoffs': [{**RECORD, 'extra_dimensions': {'gender': 'female'}}]}, ACADEMIC, 'OPEN', CONTEXT)
    assert result['status'] == 'not_comparable'


def test_unverified_board_aggregate_never_compared():
    result = cutoff_comparison({'cutoffs': [RECORD]}, {'aggregate': {'value': 85}}, 'OPEN', CONTEXT)
    assert result['reason'] == 'AGGREGATE_RULE_UNVERIFIED'

