from app.catalogue import applicable_fees
from app.domain.costs import cost_split


def test_category_fee_overrides_general_without_adding_or_averaging():
    common = {'kind': 'tuition', 'academic_year': '2025-26', 'status': 'official_source', 'source_id': 'source-test'}
    fees = [{**common, 'applies_to_category': 'all', 'amount_inr': 18000}, {**common, 'applies_to_category': 'TEST', 'amount_inr': 1000}]
    assert cost_split(applicable_fees(fees, 'TEST'), '2025-26', {})['verified_institutional_total'] == 1000
    assert cost_split(applicable_fees(fees), '2025-26', {})['verified_institutional_total'] == 18000
