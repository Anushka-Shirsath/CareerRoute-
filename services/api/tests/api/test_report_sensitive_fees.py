import json
from app.db import transaction
from app.models import Fee


def test_cost_report_never_leaks_selected_category_metadata(client, engine):
    marker = 'PRIVATE_CATEGORY_MARKER'
    assert client.put('/api/v1/me/sensitive', json={'category_code': marker}).status_code == 200
    with transaction(engine) as db:
        db.add(Fee(id='category-fee', offering_id='one', academic_year='2025-26', data={'academic_year': '2025-26', 'kind': 'tuition', 'amount_inr': 1000, 'status': 'official_source', 'source_id': 'test-source', 'applies_to_category': marker}))
    assert client.post('/api/v1/costs/compare', json={'offering_ids': ['one', 'two'], 'academic_year': '2025-26'}).status_code == 200
    result = client.post('/api/v1/parent-reports', json={'sections': ['costs']}).json()['data']
    assert marker not in json.dumps(result['preview'])
    explicit = client.post('/api/v1/parent-reports', json={'sections': ['costs', 'category_used_in_comparison']}).json()['data']
    assert explicit['preview']['sections']['category_used_in_comparison']['category_code'] == marker
