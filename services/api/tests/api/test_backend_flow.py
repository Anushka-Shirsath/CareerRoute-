import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.db import transaction
from app.models import Record, Share

P = '/api/v1'


def data(response):
    assert response.status_code == 200, response.text
    return response.json()['data']


def test_backend_demo_end_to_end(client, confirmed):
    assert data(client.get(P + '/me/snapshot'))['aggregate']['value'] > 0
    session = data(client.post(P + '/compass/sessions', json={}))
    node = session['node']
    for index in range(10):
        payload = {'node_id': node['id'], 'idempotency_key': 'answer-' + str(index)}
        if node['type'] in {'choice', 'values', 'multi_select'}:
            payload['option_ids'] = [node['options'][0]['id']]
        elif node['type'] == 'rating':
            payload['rating'] = 4
        else:
            payload['task_outcome'] = {'selected': 1, 'correct': True}
        answer = data(client.post(f"{P}/compass/sessions/{session['session_id']}/events", json=payload))
        node = answer['node']
    assert answer['done']
    assert len(data(client.get(P + '/compass/report'))['top_routes']) == 3
    match = data(client.post(P + '/match', json={}))
    assert match['results']
    data(client.put(P + '/me/shortlist/one', json={'status': 'applied_reported'}))
    assert '(you reported)' in data(client.get(P + '/me/shortlist'))['items'][0]['status_label']
    cost = data(client.post(P + '/costs/compare', json={'offering_ids': ['one', 'two'], 'academic_year': '2025-26', 'assumptions': {'hostel_monthly': 2500}}))
    assert cost['offerings'][0]['verified_institutional_total'] == 18000
    report = data(client.post(P + '/parent-reports', json={'sections': ['costs', 'next_steps']}))
    with TestClient(client.app) as other:
        shared = data(other.get(urlparse(report['share_url']).path + '?locale=mr'))
        assert set(shared['sections']) == {'costs', 'next_steps'}
        assert shared['labels']['costs'] == 'खर्च'
    assert data(client.get(P + '/me/dashboard'))['academic_snapshot']
    assert data(client.post(P + '/mentor/chat', json={'message': 'Why is this ranked first?'}))['fallback']
    assert len(data(client.get(P + '/data/coverage'))['districts']) == 36


def test_reconfirm_supersedes_previous(client, confirmed, engine):
    subjects = data(client.get(P + '/results/' + confirmed))['subjects']
    subjects[0]['obtained'] = 90
    revision = data(client.put(f'{P}/results/{confirmed}/confirm', json={'confirm': True, 'subjects': subjects}))
    assert revision['result_id'] != confirmed
    assert data(client.get(P + '/results/' + confirmed))['confirmation_state'] == 'superseded'
    with transaction(engine) as db:
        rows = list(db.scalars(select(Record).where(Record.kind == 'result')))
        assert sum(r.data['confirmation_state'] == 'confirmed' for r in rows) == 1


def test_api_ignores_client_student_id(client, confirmed):
    assert client.patch(P + '/me/profile', json={'student_id': 'other', 'home_city': 'Pune'}).status_code == 422
    assert client.get(P + '/me/profile?user_id=other').status_code == 422


def test_private_data_isolated_between_browsers(client, confirmed):
    with TestClient(client.app) as other:
        data(other.post(P + '/session'))
        assert other.get(P + '/results/' + confirmed).status_code == 404
        assert other.put(f'{P}/results/{confirmed}/confirm', json={'confirm': True}).status_code == 404
        assert data(other.get(P + '/me/snapshot')) is None


def test_no_session_returns_structured_error(app):
    with TestClient(app) as visitor:
        response = visitor.get(P + '/me/profile')
        assert response.status_code == 401
        assert response.json()['error']['code'] == 'UNAUTHENTICATED'


def test_draft_not_used_for_snapshot(client):
    data(client.post(P + '/session/demo'))
    assert data(client.get(P + '/me/snapshot')) is None


def test_share_excludes_unticked_sections(client, confirmed):
    preview = data(client.post(P + '/parent-reports', json={'sections': ['next_steps']}))['preview']
    assert set(preview['sections']) == {'next_steps'}
    assert 'category_code' not in json.dumps(preview)


def test_report_never_contains_chat_or_raw_events(client, confirmed):
    preview = data(client.post(P + '/parent-reports', json={'sections': ['compass_summary', 'academic_summary', 'next_steps']}))['preview']
    serialized = json.dumps(preview)
    assert 'mentor_message' not in serialized and 'option_ids' not in serialized and 'event_id' not in serialized


def test_category_excluded_by_default(client, confirmed):
    preview = data(client.post(P + '/parent-reports', json={'sections': ['costs', 'next_steps']}))['preview']
    assert 'OPEN' not in json.dumps(preview)


def test_expired_share_denied(client, engine):
    result = data(client.post(P + '/parent-reports', json={'sections': ['next_steps']}))
    with transaction(engine) as db:
        row = db.scalar(select(Share))
        row.expires_at = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    assert client.get(urlparse(result['share_url']).path).status_code == 404


def test_revoked_share_denied_immediately(client):
    result = data(client.post(P + '/parent-reports', json={'sections': ['next_steps']}))
    data(client.delete(f"{P}/parent-reports/{result['report_id']}/share"))
    assert client.get(urlparse(result['share_url']).path).status_code == 404


def test_token_stored_hashed(client, engine):
    result = data(client.post(P + '/parent-reports', json={'sections': ['next_steps']}))
    token = result['share_url'].rsplit('/', 1)[1]
    with transaction(engine) as db:
        row = db.scalar(select(Share))
        assert row.token_hash != token and token not in json.dumps(row.snapshot)


def test_report_snapshot_immutable_after_profile_change(client, confirmed):
    result = data(client.post(P + '/parent-reports', json={'sections': ['routes_and_alternatives']}))
    before = data(client.get(urlparse(result['share_url']).path))
    data(client.put(P + '/me/goal', json={'pathway_id': 'fyjc_arts'}))
    after = data(client.get(urlparse(result['share_url']).path))
    assert before == after


def test_any_route_selectable_despite_marks(client, confirmed):
    assert data(client.put(P + '/me/goal', json={'pathway_id': 'fyjc_arts'}))['pathway_id'] == 'fyjc_arts'


def test_idempotency_key_reuse_rejected(client):
    session = data(client.post(P + '/compass/sessions', json={}))
    url = f"{P}/compass/sessions/{session['session_id']}/events"
    payload = {'node_id': 'S1', 'option_ids': ['S1.a'], 'idempotency_key': 'same-key-123'}
    data(client.post(url, json=payload))
    data(client.post(url, json=payload))
    assert client.post(url, json={**payload, 'option_ids': ['S1.b']}).status_code == 409


def test_rate_limit_anonymous_lower(client):
    for _ in range(15):
        data(client.post(P + '/mentor/chat', json={'message': 'Hello'}))
    response = client.post(P + '/mentor/chat', json={'message': 'Hello'})
    assert response.status_code == 429
    assert response.json()['error']['code'] == 'AI_RATE_LIMITED'


def test_delete_account_removes_everything(client, confirmed, engine):
    data(client.post(P + '/parent-reports', json={'sections': ['next_steps']}))
    data(client.delete(P + '/me'))
    assert client.get(P + '/me/profile').status_code == 401
    with transaction(engine) as db:
        assert not list(db.scalars(select(Record)))
        assert not list(db.scalars(select(Share)))


def test_cors_rejects_unapproved_origin(client):
    assert client.patch(P + '/me/profile', json={}, headers={'Origin': 'https://evil.example'}).status_code == 403


def test_public_pagination_limit(client):
    first = data(client.get(P + '/colleges?limit=1'))
    assert len(first['items']) == 1 and first['next_cursor']
    assert client.get(P + '/colleges?limit=51').status_code == 422


def test_private_responses_never_cached(client):
    assert client.get(P + '/me/profile').headers['cache-control'] == 'no-store'
