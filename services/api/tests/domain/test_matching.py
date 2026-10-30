from app.domain.matching import evaluate, ranked_search
from app.schemas import Preferences


def offering(**kw):
    return {'id': 'a', 'name': 'A', 'academic_year': '2025-26', 'pathway_id': 'polytechnic_diploma', 'district': 'Pune', 'city': None, 'management': 'government', 'hostel_status': 'unknown', 'medium': 'English', 'tuition': None, 'cutoffs': [], 'eligibility_rules': None, **kw}


def prefs(**kw):
    return Preferences(**kw).model_dump()


def test_three_axes_returned_separately():
    row = evaluate(offering(), {}, prefs(), None, None)
    assert {'eligibility_status', 'cutoff_comparison', 'utility'} <= row.keys()


def test_unknown_fee_not_in_under_budget_group():
    result = ranked_search([offering()], {}, prefs(tuition_cap_inr=30000, cap_is_hard=True), None, None)
    assert not result['groups']['main']
    assert result['groups']['fee_unknown']


def test_unknown_hostel_in_separate_group_when_required():
    result = ranked_search([offering()], {}, prefs(hostel='required'), None, None)
    assert result['groups']['hostel_unknown']


def test_unknowns_excluded_from_utility_and_lower_coverage():
    a = evaluate(offering(), {}, prefs(), None, None)
    assert a['evidence_coverage'] < 1
    assert 'affordability' in a['unrated_criteria']


def test_government_only_is_hard_filter():
    result = ranked_search([offering(management='private_unaided')], {}, prefs(government='only'), None, None)
    assert not result['results']


def test_weight_change_changes_order_deterministically():
    a = offering(id='a', name='A', management='government', tuition=28000)
    b = offering(id='b', name='B', management='private_unaided', tuition=10000)
    def search(g, f):
        return ranked_search([a, b], {}, prefs(tuition_cap_inr=30000, weights={'government': g, 'affordability': f, 'academic_fit': 0, 'proximity': 0}), None, None)['results'][0]['offering_id']
    assert search(100, 0) == 'a'
    assert search(0, 100) == 'b'

