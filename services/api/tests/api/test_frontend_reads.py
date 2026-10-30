from fastapi.testclient import TestClient
from sqlalchemy import select
from app.db import Workspace, transaction
from app.models import GuestSession


def test_catalogue_statistics_and_total_are_real(client):
    stats = client.get('/api/v1/catalogue/stats').json()['data']
    assert stats['institutions'] == 2 and stats['offerings'] == 2
    assert client.get('/api/v1/colleges?limit=1').json()['data']['total'] == 2


def test_directory_search_combines_name_location_management_and_program(client):
    response = client.get('/api/v1/colleges', params={'q': 'government college Pune mechanical'})
    assert response.status_code == 200
    results = response.json()['data']['items']
    assert [r['id'] for r in results] == ['one']
    assert client.get('/api/v1/colleges', params={'q': 'government Nashik'}).json()['data']['total'] == 0
    assert client.get('/api/v1/colleges', params={'q': 'govt Pune'}).json()['data']['total'] == 1
    first = client.get('/api/v1/colleges', params={'q': 'Pune', 'limit': 1}).json()['data']
    second = client.get('/api/v1/colleges', params={'q': 'Pune', 'limit': 1, 'cursor': first['next_cursor']}).json()['data']
    assert first['items'][0]['id'] != second['items'][0]['id']
    assert second['next_cursor'] is None
    assert client.get('/api/v1/colleges', params={'q': 'Nashik', 'cursor': first['next_cursor']}).status_code == 422


def test_chat_history_and_report_management_are_owner_only(client, engine):
    with transaction(engine) as db:
        owner = db.scalar(select(GuestSession.user_id))
        Workspace(db, owner).put('mentor_message', {'role': 'assistant', 'content': 'Synthetic private message'})
    assert client.get('/api/v1/mentor/messages').json()['data']['items'][0]['content'] == 'Synthetic private message'
    client.post('/api/v1/parent-reports', json={'sections': ['next_steps']})
    own = client.get('/api/v1/me/parent-reports').json()['data']['items']
    assert len(own) == 1 and 'token_hash' not in own[0]
    with TestClient(client.app) as other:
        other.post('/api/v1/session')
        assert other.get('/api/v1/mentor/messages').json()['data']['items'] == []
        assert other.get('/api/v1/me/parent-reports').json()['data']['items'] == []
