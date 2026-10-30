from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from app.db import transaction
from app.models import GuestSession


def test_expired_session_requires_new_workspace(client, engine):
    with transaction(engine) as db:
        session = db.scalar(select(GuestSession))
        session.expires_at = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert client.get('/api/v1/me/profile').status_code == 401
    assert client.post('/api/v1/session').status_code == 200
    assert client.get('/api/v1/me/snapshot').json()['data'] is None


def test_active_share_limit(client):
    for _ in range(5):
        assert client.post('/api/v1/parent-reports', json={'sections': ['next_steps']}).status_code == 200
    assert client.post('/api/v1/parent-reports', json={'sections': ['next_steps']}).status_code == 409


def test_share_expiry_capped_at_30_days(client):
    assert client.post('/api/v1/parent-reports', json={'sections': ['next_steps'], 'expires_in_days': 31}).status_code == 422


def test_confirm_empty_extracted_result_rejected(client):
    from app.db import Workspace
    with transaction(client.app.state.engine) as db:
        owner = db.scalar(select(GuestSession.user_id))
        row = Workspace(db, owner).put('result', {'board': 'SSC_MH', 'exam_year': 2026, 'confirmation_state': 'draft', 'subjects': []})
        result_id = row.id
    assert client.put('/api/v1/results/' + result_id + '/confirm', json={'confirm': True}).status_code == 422


def test_non_finite_marks_rejected(client):
    response = client.post('/api/v1/results/manual', content='{"board":"CBSE","exam_year":2026,"subjects":[{"canonical_subject":"mathematics","name_as_shown":"Maths","obtained":NaN,"maximum":100}]}', headers={'content-type': 'application/json'})
    assert response.status_code == 422
