from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.config import Settings
from app.db import transaction
from app.main import create_app
from app.models import AccountSession, Record
from app.retention import cleanup


FIRST = '11111111-1111-4111-8111-111111111111'
SECOND = '22222222-2222-4222-8222-222222222222'


class FakeResponse:
    def __init__(self, data, status=200):
        self._data, self.status_code, self.is_success = data, status, status < 400
    def json(self):
        return self._data


class FakeAuth:
    def __init__(self, **kwargs): pass
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def post(self, url, headers, json):
        if '/signup?' in url:
            return FakeResponse({'user': {'id': FIRST}})  # confirmation pending
        if json['password'] != 'correct-password':
            return FakeResponse({}, 400)
        return FakeResponse({'access_token': 'first' if json['email'].startswith('first@') else 'second'})
    def get(self, url, headers):
        token = headers['Authorization'].removeprefix('Bearer ')
        return FakeResponse({'id': FIRST if token == 'first' else SECOND})


def test_signin_isolation_logout_and_persistent_account_data(engine, monkeypatch):
    monkeypatch.setattr('app.main.httpx.Client', FakeAuth)
    settings = Settings(share_token_pepper='test-secret-for-tests-only-at-least-32', mentor_enabled=False,
                        supabase_url='https://test.supabase.co', supabase_publishable_key='test-key', cookie_secure=False, auth_enabled=True)
    app = create_app(settings, engine)
    with TestClient(app) as first, TestClient(app) as second:
        first.post('/api/v1/session')
        first.patch('/api/v1/me/profile', json={'display_name': 'Guest workspace'})
        assert first.post('/api/v1/auth/login', json={'email': 'first@example.com', 'password': 'wrong-password'}).status_code == 401
        assert first.post('/api/v1/auth/login', json={'email': 'first@example.com', 'password': 'correct-password'}).status_code == 200
        assert first.get('/api/v1/auth/status').json()['data']['signed_in'] is True
        assert first.patch('/api/v1/me/profile', json={'display_name': 'First account'}).status_code == 200
        assert second.post('/api/v1/auth/login', json={'email': 'second@example.com', 'password': 'correct-password'}).status_code == 200
        assert second.get('/api/v1/me/profile').json()['data'].get('display_name') != 'First account'
        assert first.post('/api/v1/auth/logout').status_code == 200
        assert first.get('/api/v1/auth/status').json()['data']['signed_in'] is False
        assert first.get('/api/v1/me/profile').json()['data']['display_name'] == 'Guest workspace'
        assert first.post('/api/v1/auth/login', json={'email': 'first@example.com', 'password': 'correct-password'}).status_code == 200
        assert first.get('/api/v1/me/profile').json()['data']['display_name'] == 'First account'
        with transaction(engine) as db:
            account = db.scalar(select(AccountSession).where(AccountSession.user_id == FIRST))
            assert account.token_hash != first.cookies.get('cq_account')
            account.expires_at = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        cleanup(engine)
        with transaction(engine) as db:
            assert db.scalar(select(Record).where(Record.user_id == FIRST, Record.kind == 'profile')) is not None


def test_signup_needs_confirmation_and_does_not_create_session(engine, monkeypatch):
    monkeypatch.setattr('app.main.httpx.Client', FakeAuth)
    app = create_app(Settings(share_token_pepper='test-secret-for-tests-only-at-least-32', supabase_url='https://test.supabase.co', supabase_publishable_key='test-key', cookie_secure=False, auth_enabled=True), engine)
    with TestClient(app) as client:
        result = client.post('/api/v1/auth/signup', json={'email': 'first@example.com', 'password': 'correct-password'})
        assert result.status_code == 200
        assert result.json()['data']['signed_in'] is False
        assert 'cq_account' not in client.cookies


def test_demo_mode_disables_account_signin(engine):
    app = create_app(Settings(share_token_pepper='test-secret-for-tests-only-at-least-32', cookie_secure=False, auth_enabled=False), engine)
    with TestClient(app) as client:
        assert client.post('/api/v1/auth/login', json={'email': 'first@example.com', 'password': 'correct-password'}).status_code == 404
        assert client.post('/api/v1/auth/signup', json={'email': 'first@example.com', 'password': 'correct-password'}).status_code == 404
        assert client.get('/api/v1/auth/status').json()['data']['signed_in'] is False
        assert client.post('/api/v1/session').json()['data']['session'] == 'created'
