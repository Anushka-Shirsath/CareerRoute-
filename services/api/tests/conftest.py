import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.db import initialize, make_engine, transaction
from app.main import create_app
from app.models import AdmissionCycle, Cutoff, Fee, Institution, Offering, Source


@pytest.fixture
def engine(tmp_path):
    engine = make_engine('sqlite:///' + (tmp_path / 'test.db').as_posix())
    initialize(engine)
    with transaction(engine) as db:
        db.add(Source(id='test-source', data={'url': 'https://example.org/test-only', 'publisher': 'Synthetic test fixture', 'academic_year': '2025-26'}))
        for ident, management in [('one', 'government'), ('two', 'private_unaided')]:
            db.add(Institution(id=ident, name=f'Synthetic {ident} Polytechnic', district='Pune', pathway='polytechnic', management=management, publish_state='published', data={'source_id': 'test-source', 'city': 'Pune', 'is_synthetic': True}))
        db.flush()
        for ident in ['one', 'two']:
            db.add(Offering(id=ident, institution_id=ident, pathway_id='polytechnic_diploma', academic_year='2025-26', publish_state='published', data={'source_id': 'test-source', 'program_name': 'Synthetic Mechanical Engineering', 'medium': 'English', 'hostel_status': 'unknown', 'is_synthetic': True}))
        db.add(AdmissionCycle(id='test-cycle', data={'admission_system': 'DTE_POLY_CAP', 'round': '1', 'academic_year': '2025-26', 'source_id': 'test-source'}))
        db.flush()
        db.add(Cutoff(id='test-cutoff', offering_id='one', academic_year='2025-26', cycle_id='test-cycle', data={'category': 'OPEN', 'quota': 'state', 'merit_metric': 'poly_percent', 'raw_value': '80', 'numeric_value': 80, 'extra_dimensions': {}}))
        db.add(Fee(id='test-fee', offering_id='one', academic_year='2025-26', data={'kind': 'tuition', 'amount_inr': 18000, 'per': 'year', 'academic_year': '2025-26', 'status': 'official_source', 'source_id': 'test-source'}))
    yield engine
    engine.dispose()


@pytest.fixture
def app(engine):
    return create_app(Settings(share_token_pepper='test-secret-for-tests-only-at-least-32', mentor_enabled=False), engine)


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        assert client.post('/api/v1/session').status_code == 200
        yield client


@pytest.fixture
def confirmed(client):
    result = client.post('/api/v1/session/demo').json()['data']['result_id']
    response = client.put(f'/api/v1/results/{result}/confirm', json={'confirm': True})
    assert response.status_code == 200, response.text
    return result
