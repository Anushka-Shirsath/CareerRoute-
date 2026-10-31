import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from app.config import Settings
from app.db import transaction
from app.main import create_app
from app.models import AccountSession, RateCounter
from app.passwords import password_problem


OWNER = '33333333-3333-4333-8333-333333333333'
OTHER = '44444444-4444-4444-8444-444444444444'


def fake_jwt(claims):
    body = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
    return 'eyJhbGciOiJIUzI1NiJ9.' + body + '.signature'


RECOVERY = fake_jwt({'sub': OWNER, 'session_id': 'recovery-session-1', 'amr': [{'method': 'recovery', 'timestamp': 1}]})


class FakeResponse:
    def __init__(self, data, status=200):
        self._data, self.status_code, self.is_success = data, status, status < 400
    def json(self):
        return self._data


class FakeSupabase:
    """Stateful stand-in for the Supabase Auth REST API."""
    users = {}
    tokens = {}
    recovery_emails = []
    unconfirmed = set()
    global_logouts = []
    outage = False
    attempts_seen = []

    def __init__(self, **kwargs): pass
    def __enter__(self): return self
    def __exit__(self, *args): pass

    @classmethod
    def reset(cls):
        cls.users = {'owner@example.com': [OWNER, 'old-garden-lantern'], 'other@example.com': [OTHER, 'river-copper-window']}
        cls.users['pending@example.com'] = ['55555555-5555-4555-8555-555555555555', 'quiet-harbour-lamp']
        cls.tokens = {RECOVERY: OWNER}
        cls.recovery_emails, cls.global_logouts, cls.attempts_seen = [], [], []
        cls.unconfirmed = {'pending@example.com'}
        cls.outage = False

    @classmethod
    def user_for(cls, headers):
        return cls.tokens.get(headers.get('Authorization', '').removeprefix('Bearer '))

    def post(self, url, headers, json):
        if self.outage:
            return FakeResponse({}, 503)
        if '/token?grant_type=password' in url:
            self.attempts_seen.append(json['email'])
            user = self.users.get(json['email'].lower())
            if not user or user[1] != json['password']:
                return FakeResponse({'error_code': 'invalid_credentials'}, 400)
            if json['email'].lower() in self.unconfirmed:
                return FakeResponse({'error_code': 'email_not_confirmed'}, 400)
            token = fake_jwt({'sub': user[0], 'session_id': 'pw-' + str(len(self.tokens)), 'amr': [{'method': 'password'}]})
            self.tokens[token] = user[0]
            return FakeResponse({'access_token': token})
        if '/recover?' in url:
            # Like Supabase: silent for unknown addresses, a resend throttle for real ones.
            if json['email'] in self.users and json['email'] in self.recovery_emails:
                return FakeResponse({'error_code': 'over_email_send_rate_limit'}, 429)
            if json['email'] in self.users:
                self.recovery_emails.append(json['email'])
            return FakeResponse({})
        if '/logout?scope=global' in url:
            self.global_logouts.append(self.user_for(headers))
            return FakeResponse(None, 204)
        if '/signup?' in url:
            return FakeResponse({'user': {'id': OWNER}})
        return FakeResponse({}, 404)

    def get(self, url, headers):
        owner = self.user_for(headers)
        if not owner:
            return FakeResponse({'error_code': 'bad_jwt'}, 401)
        email = next(e for e, (uid, _) in self.users.items() if uid == owner)
        return FakeResponse({'id': owner, 'email': email})

    def put(self, url, headers, json):
        owner = self.user_for(headers)
        if not owner:
            return FakeResponse({'error_code': 'bad_jwt'}, 401)
        for user in self.users.values():
            if user[0] == owner:
                if user[1] == json['password']:
                    return FakeResponse({'error_code': 'same_password'}, 422)
                user[1] = json['password']
        return FakeResponse({'id': owner})


@pytest.fixture
def auth_app(engine, monkeypatch):
    FakeSupabase.reset()
    monkeypatch.setattr('app.main.httpx.Client', FakeSupabase)
    settings = Settings(share_token_pepper='test-secret-for-tests-only-at-least-32', mentor_enabled=False,
                        supabase_url='https://test.supabase.co', supabase_publishable_key='test-key',
                        cookie_secure=False, auth_enabled=True, login_failures_per_hour=3)
    return create_app(settings, engine)


def login(client, email='owner@example.com', password='old-garden-lantern'):
    return client.post('/api/v1/auth/login', json={'email': email, 'password': password})


def session_count(engine, owner=OWNER):
    with transaction(engine) as db:
        return db.scalar(select(func.count()).select_from(AccountSession).where(AccountSession.user_id == owner))


@pytest.mark.parametrize('password, ok', [
    ('short', False), ('password123', False), ('Password-123', False), ('aaaaaaaaaaaa', False),
    ('ownerowner99', False), ('old-garden-lantern', True), ('blue tea at seven', True),
])
def test_password_policy(password, ok):
    assert (password_problem(password, 'owner@example.com') is None) is ok


def test_signup_rejects_weak_password_before_calling_supabase(auth_app):
    with TestClient(auth_app) as client:
        response = client.post('/api/v1/auth/signup', json={'email': 'new@example.com', 'password': 'password123'})
        assert response.status_code == 422
        assert 'too common' in response.json()['error']['fields'][0]['message']


def test_status_reports_whether_accounts_are_enabled(auth_app, engine):
    with TestClient(auth_app) as client:
        assert client.get('/api/v1/auth/status').json()['data'] == {'enabled': True, 'signed_in': False}
    disabled = create_app(Settings(share_token_pepper='test-secret-for-tests-only-at-least-32', auth_enabled=False), engine)
    with TestClient(disabled) as client:
        assert client.get('/api/v1/auth/status').json()['data'] == {'enabled': False, 'signed_in': False}


def test_repeated_failures_lock_the_account_but_not_others(auth_app):
    with TestClient(auth_app) as client:
        for _ in range(3):
            assert login(client, password='wrong-guess-123').status_code == 401
        locked = login(client)
        assert locked.status_code == 429 and locked.json()['error']['code'] == 'AUTH_LOCKED'
        # Locking is per address, so it cannot be used to block other students.
        assert login(client, 'other@example.com', 'river-copper-window').status_code == 200


def test_success_clears_earlier_failures(auth_app):
    with TestClient(auth_app) as client:
        for _ in range(2):
            login(client, password='wrong-guess-123')
        assert login(client).status_code == 200
        for _ in range(2):
            login(client, password='wrong-guess-123')
        assert login(client).status_code == 200


def test_signing_in_again_rotates_the_session(auth_app, engine):
    with TestClient(auth_app) as client:
        login(client)
        first = client.cookies.get('cq_account')
        login(client)
        assert client.cookies.get('cq_account') != first
        assert session_count(engine) == 1


def test_idle_sessions_expire_and_active_ones_slide(auth_app, engine):
    with TestClient(auth_app) as client:
        login(client)
        with transaction(engine) as db:
            row = db.scalar(select(AccountSession).where(AccountSession.user_id == OWNER))
            created = datetime.fromisoformat(row.created_at)
            assert datetime.fromisoformat(row.expires_at) - created < timedelta(days=15)
            row.expires_at = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        assert client.get('/api/v1/me/profile').status_code == 200
        with transaction(engine) as db:
            row = db.scalar(select(AccountSession).where(AccountSession.user_id == OWNER))
            assert datetime.fromisoformat(row.expires_at) > datetime.now(timezone.utc) + timedelta(days=13)
            row.expires_at = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        assert client.get('/api/v1/me/profile').status_code == 401
        assert client.get('/api/v1/auth/status').json()['data']['signed_in'] is False


def test_sliding_never_passes_the_absolute_limit(auth_app, engine):
    with TestClient(auth_app) as client:
        login(client)
        with transaction(engine) as db:
            row = db.scalar(select(AccountSession).where(AccountSession.user_id == OWNER))
            row.created_at = (datetime.now(timezone.utc) - timedelta(days=29)).isoformat()
            row.expires_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        assert client.get('/api/v1/me/profile').status_code == 200
        with transaction(engine) as db:
            row = db.scalar(select(AccountSession).where(AccountSession.user_id == OWNER))
            assert datetime.fromisoformat(row.expires_at) <= datetime.fromisoformat(row.created_at) + timedelta(days=30)


def test_sign_out_everywhere_ends_every_device(auth_app, engine):
    with TestClient(auth_app) as phone, TestClient(auth_app) as laptop:
        login(phone)
        login(laptop)
        assert session_count(engine) == 2
        assert phone.post('/api/v1/auth/logout-all').json()['data']['sessions_ended'] == 2
        assert laptop.get('/api/v1/auth/status').json()['data']['signed_in'] is False
        assert phone.post('/api/v1/auth/logout-all').status_code == 401


def test_forgot_password_answers_the_same_for_unknown_addresses_and_throttles(auth_app):
    with TestClient(auth_app) as client:
        known = client.post('/api/v1/auth/password/forgot', json={'email': 'owner@example.com'}).json()['data']
        unknown = client.post('/api/v1/auth/password/forgot', json={'email': 'nobody@example.com'}).json()['data']
        assert known == unknown
        # Supabase throttles a second email to a real address; the reply must not change.
        again = client.post('/api/v1/auth/password/forgot', json={'email': 'owner@example.com'})
        assert again.status_code == 200 and again.json()['data'] == known
        for _ in range(4):
            assert client.post('/api/v1/auth/password/forgot', json={'email': 'nobody@example.com'}).json()['data'] == known


def test_reset_password_ends_old_sessions_and_signs_in(auth_app, engine):
    with TestClient(auth_app) as old_device, TestClient(auth_app) as client:
        login(old_device)
        weak = client.post('/api/v1/auth/password/reset', json={'access_token': RECOVERY, 'password': 'owner2024!!'})
        assert weak.status_code == 422
        bad = client.post('/api/v1/auth/password/reset', json={'access_token': 'forged-token-000000000000', 'password': 'silver-maple-orbit'})
        assert bad.status_code == 401 and 'expired' in bad.json()['error']['message']
        assert client.post('/api/v1/auth/password/reset', json={'access_token': RECOVERY, 'password': 'silver-maple-orbit'}).status_code == 200
        assert client.get('/api/v1/auth/status').json()['data']['signed_in'] is True
        assert old_device.get('/api/v1/auth/status').json()['data']['signed_in'] is False
        assert session_count(engine) == 1
        assert login(client, password='old-garden-lantern').status_code == 401
        assert login(client, password='silver-maple-orbit').status_code == 200


def test_change_password_needs_the_current_password_of_this_account(auth_app, engine):
    with TestClient(auth_app) as client, TestClient(auth_app) as other_device:
        assert client.post('/api/v1/auth/password/change', json={'email': 'owner@example.com', 'current_password': 'old-garden-lantern', 'new_password': 'silver-maple-orbit'}).status_code == 401
        login(client)
        login(other_device)
        wrong = client.post('/api/v1/auth/password/change', json={'email': 'owner@example.com', 'current_password': 'not-my-password', 'new_password': 'silver-maple-orbit'})
        assert wrong.status_code == 401
        someone_else = client.post('/api/v1/auth/password/change', json={'email': 'other@example.com', 'current_password': 'river-copper-window', 'new_password': 'silver-maple-orbit'})
        assert someone_else.status_code == 403
        changed = client.post('/api/v1/auth/password/change', json={'email': 'owner@example.com', 'current_password': 'old-garden-lantern', 'new_password': 'silver-maple-orbit'})
        assert changed.status_code == 200
        assert client.get('/api/v1/auth/status').json()['data']['signed_in'] is True
        assert other_device.get('/api/v1/auth/status').json()['data']['signed_in'] is False
        assert FakeSupabase.users['owner@example.com'][1] == 'silver-maple-orbit'
        assert FakeSupabase.users['other@example.com'][1] == 'river-copper-window'


def test_new_endpoints_are_hidden_in_demo_mode(engine):
    app = create_app(Settings(share_token_pepper='test-secret-for-tests-only-at-least-32', auth_enabled=False), engine)
    with TestClient(app) as client:
        assert client.post('/api/v1/auth/password/forgot', json={'email': 'owner@example.com'}).status_code == 404
        assert client.post('/api/v1/auth/password/reset', json={'access_token': RECOVERY, 'password': 'silver-maple-orbit'}).status_code == 404
        assert client.post('/api/v1/auth/logout-all').status_code == 404


def test_reset_link_works_once_and_ends_supabase_sessions(auth_app):
    with TestClient(auth_app) as client:
        assert client.post('/api/v1/auth/password/reset', json={'access_token': RECOVERY, 'password': 'silver-maple-orbit'}).status_code == 200
        assert FakeSupabase.global_logouts == [OWNER]
        again = client.post('/api/v1/auth/password/reset', json={'access_token': RECOVERY, 'password': 'another-calm-meadow'})
        assert again.status_code == 401 and 'expired or was already used' in again.json()['error']['message']
        assert FakeSupabase.users['owner@example.com'][1] == 'silver-maple-orbit'


def test_reset_refuses_tokens_that_did_not_come_from_a_recovery_email(auth_app):
    with TestClient(auth_app) as client:
        # A normal sign-in token for the same user is valid with Supabase, but is not a reset link.
        login(client)
        password_token = next(token for token, owner in FakeSupabase.tokens.items() if owner == OWNER and token != RECOVERY)
        refused = client.post('/api/v1/auth/password/reset', json={'access_token': password_token, 'password': 'silver-maple-orbit'})
        assert refused.status_code == 401
        assert FakeSupabase.users['owner@example.com'][1] == 'old-garden-lantern'


def test_attempts_are_counted_before_supabase_is_asked(auth_app, engine):
    seen = []
    original = FakeSupabase.post
    def spying_post(self, url, headers, json):
        if '/token?grant_type=password' in url:
            with transaction(engine) as db:
                seen.append(db.scalar(select(func.sum(RateCounter.count)).where(RateCounter.bucket.like('login-failures:%'))))
        return original(self, url, headers, json)
    FakeSupabase.post = spying_post
    try:
        with TestClient(auth_app) as client:
            login(client, password='wrong-guess-123')
            login(client, password='wrong-guess-123')
    finally:
        FakeSupabase.post = original
    # Each attempt was already counted while Supabase was checking it, so parallel
    # guesses cannot all pass the limit before any failure is recorded.
    assert seen == [1, 2]


def test_failures_from_the_previous_hour_still_count(auth_app, engine):
    key = hmac.new(b'test-secret-for-tests-only-at-least-32', b'owner@example.com', hashlib.sha256).hexdigest()
    previous = 'login-failures:' + (datetime.now(timezone.utc) - timedelta(hours=1)).strftime('%Y-%m-%dT%H')
    with transaction(engine) as db:
        db.add(RateCounter(user_id=key, bucket=previous, count=2))
    with TestClient(auth_app) as client:
        assert login(client, password='wrong-guess-123').status_code == 401
        assert login(client).status_code == 429


def test_outages_and_unconfirmed_emails_do_not_lock_the_account(auth_app):
    with TestClient(auth_app) as client:
        for _ in range(4):
            unconfirmed = login(client, 'pending@example.com', 'quiet-harbour-lamp')
            assert unconfirmed.status_code == 401 and unconfirmed.json()['error']['code'] == 'AUTH_UNCONFIRMED'
        FakeSupabase.outage = True
        for _ in range(4):
            assert login(client).status_code == 503
        FakeSupabase.outage = False
        assert login(client).status_code == 200


def test_signed_in_status_reports_session_lengths(auth_app):
    with TestClient(auth_app) as client:
        login(client)
        data = client.get('/api/v1/auth/status').json()['data']
        assert data['signed_in'] is True and data['session_days'] == 30 and data['idle_days'] == 14
