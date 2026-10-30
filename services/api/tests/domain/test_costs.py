from app.domain.costs import cost_split


def test_three_totals_and_unknown_lines():
    row = cost_split([], '2025-26', {'hostel_monthly': 1000, 'months': 10})
    assert row['estimated_total'] == row['estimated_personal_total'] == 10000
    assert row['verified_institutional_total'] == 0
    assert 'tuition' in row['unknown_lines']


def test_at_least_label_when_institutional_unknown():
    assert cost_split([], '2025-26', {})['total_label'] == 'at least'


def test_years_not_mixed():
    row = cost_split([{'kind': 'tuition', 'amount_inr': 1000, 'academic_year': '2024-25', 'source_id': 'x', 'status': 'official_source'}], '2025-26', {})
    assert row['verified_institutional_total'] == 0
    assert row['warnings']


def test_zero_fee_only_with_official_note():
    row = cost_split([{'kind': 'tuition', 'amount_inr': 0, 'academic_year': '2025-26', 'source_id': 'x', 'status': 'official_source'}], '2025-26', {})
    assert 'tuition' in row['unknown_lines']

