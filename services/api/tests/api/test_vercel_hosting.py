import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app

PEPPER = 'test-secret-for-tests-only-at-least-32'


def production(**overrides):
    values = dict(environment='production', cookie_secure=True, share_token_pepper=PEPPER, demo_mode=True,
                  database_url='postgresql://cq_api.ref:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require',
                  public_api_origin='https://careerquest.example', scanner_backend='disabled')
    return Settings(**{**values, **overrides})


def test_demo_can_run_in_production_without_the_scanner():
    production().validate_production()
    assert production().uploads_enabled is False


def test_disabled_scanner_is_refused_outside_the_demo():
    with pytest.raises(ValueError, match='only for the synthetic-data demo'):
        production(demo_mode=False).validate_production()


def test_other_production_checks_still_apply_with_the_scanner_disabled():
    for overrides in ({'cookie_secure': False}, {'share_token_pepper': 'short'},
                      {'public_api_origin': 'http://careerquest.example'}, {'database_url': 'sqlite:///x.db'}):
        with pytest.raises(ValueError):
            production(**overrides).validate_production()


def test_real_scanner_rules_are_unchanged():
    with pytest.raises(ValueError, match='isolated Docker scanner'):
        production(scanner_backend='process').validate_production()
    production(scanner_backend='docker').validate_production()


def test_disabled_scanner_turns_uploads_off_cleanly(engine):
    app = create_app(Settings(share_token_pepper=PEPPER, mentor_enabled=False, scanner_backend='disabled'), engine)
    with TestClient(app) as client:
        assert client.post('/api/v1/session').json()['data']['uploads_enabled'] is False
        for call in (lambda: client.post('/api/v1/results/upload-url', json={'mime': 'application/pdf', 'size': 1000}),
                     lambda: client.put('/api/v1/uploads/x?token=a.b', content=b'x'),
                     lambda: client.post('/api/v1/results/extract', json={'document_id': 'x', 'board': 'SSC_MH', 'exam_year': 2025})):
            response = call()
            assert response.status_code == 503 and response.json()['error']['code'] == 'UPLOAD_UNAVAILABLE'
        # Typing marks by hand still works.
        assert client.post('/api/v1/session/demo').status_code == 200


def test_uploads_stay_on_by_default(app):
    with TestClient(app) as client:
        assert client.post('/api/v1/session').json()['data']['uploads_enabled'] is True


DEVICE_READ = {'board': 'SSC_MH', 'exam_year': 2026, 'subjects': [
    {'canonical_subject': 'mathematics', 'name_as_shown': 'Mathematics', 'obtained': 84, 'maximum': 100, 'source': 'extracted'},
    {'canonical_subject': 'english', 'name_as_shown': 'English', 'obtained': 75, 'maximum': 100, 'source': 'extracted'}]}


def test_marks_read_on_the_device_create_a_draft_without_the_scanner(engine):
    app = create_app(Settings(share_token_pepper=PEPPER, mentor_enabled=False, scanner_backend='disabled'), engine)
    with TestClient(app) as client:
        client.post('/api/v1/session')
        response = client.post('/api/v1/results/device-read', json=DEVICE_READ)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body['data']['confirmation_state'] == 'draft'
        assert body['data']['extraction_method'] == 'device_ocr'
        assert body['data']['document_id'] is None
        assert any('compare every value' in w for w in body['warnings'])
        assert client.get('/api/v1/me/snapshot').json()['data'] is None


def test_device_read_refuses_typed_marks_and_duplicates(client):
    typed = {**DEVICE_READ, 'subjects': [{**DEVICE_READ['subjects'][0], 'source': 'typed'}]}
    assert client.post('/api/v1/results/device-read', json=typed).status_code == 422
    twice = {**DEVICE_READ, 'subjects': [DEVICE_READ['subjects'][0]] * 2}
    assert client.post('/api/v1/results/device-read', json=twice).status_code == 422
