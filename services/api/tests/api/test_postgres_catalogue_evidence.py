"""Integration check against the isolated migration rehearsal, never production."""
import os
import json
import io
import shutil
import sys
from urllib.parse import urlparse

import pytest
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.db import make_engine, role
from app import local_catalogue, postgres_catalogue
from app.config import Settings
from app.main import create_app


def test_postgres_evidence_rejects_sqlite_database():
    settings = Settings(database_url='sqlite:///:memory:', evidence_backend='postgres',
                        share_token_pepper='rehearsal-only-secret-at-least-32-characters')
    with pytest.raises(ValueError, match='PostgreSQL evidence requires a PostgreSQL database'):
        create_app(settings)


@pytest.mark.skipif(not os.environ.get('CQ_REHEARSAL_DATABASE_URL'), reason='Requires the isolated v12 PostgreSQL rehearsal')
def test_postgres_evidence_matches_existing_local_index():
    engine = make_engine(os.environ['CQ_REHEARSAL_DATABASE_URL'])
    try:
        with Session(engine) as db, db.begin():
            role(db, 'cq_public')
            assert postgres_catalogue.available(db)
            local = local_catalogue.evidence('dump:99610', 'dump:10202', '640319110', include_cutoffs=True)
            remote = postgres_catalogue.evidence(db, 'dump:99610', 'dump:10202', '640319110', include_cutoffs=True)
            assert remote['published_fee'] == local['published_fee']
            assert remote['historical_hostel'] == local['historical_hostel']
            assert sorted(map(lambda r: json.dumps(r, sort_keys=True), remote['possible_cutoffs'])) == sorted(map(lambda r: json.dumps(r, sort_keys=True), local['possible_cutoffs']))
            assert postgres_catalogue.fee_candidates(db, 100000) == local_catalogue.fee_candidates(100000)
            assert sorted(map(lambda r: json.dumps(r, sort_keys=True), postgres_catalogue.cutoff_options(db))) == sorted(map(lambda r: json.dumps(r, sort_keys=True), local_catalogue.cutoff_options()))
            local_rows = local_catalogue.historical_candidates('2025-26', 'I', 'Stage-I', 'NGOPENH', 85)
            remote_rows = postgres_catalogue.historical_candidates(db, '2025-26', 'I', 'Stage-I', 'NGOPENH', 85)
            assert sorted(local_rows, key=lambda r: r['offering_id']) == sorted(remote_rows, key=lambda r: r['offering_id'])
    finally:
        engine.dispose()


@pytest.mark.skipif(not os.environ.get('CQ_REHEARSAL_DATABASE_URL'), reason='Requires the isolated v12 PostgreSQL rehearsal')
def test_portal_reads_postgres_evidence_without_local_file(tmp_path, monkeypatch):
    monkeypatch.setenv('CQ_LOCAL_CATALOGUE', str(tmp_path / 'missing.db'))
    settings = Settings(database_url=os.environ['CQ_REHEARSAL_DATABASE_URL'], evidence_backend='postgres',
                        share_token_pepper='rehearsal-only-secret-at-least-32-characters', mentor_enabled=False,
                        master_enabled=True, environment='development')
    with TestClient(create_app(settings)) as client:
        directory = client.get('/api/v1/colleges', params={'max_annual_fee': 100000, 'limit': 1}).json()['data']
        assert directory['fee_filter_available'] is True and directory['total'] > 0
        assert directory['items'][0]['published_fee']['amount'] <= 100000
        detail = client.get('/api/v1/offerings/dump:99610').json()['data']
        assert detail['published_fee']['amount'] == 62913
        assert len(detail['possible_cutoffs']) > 0
        assert len(client.get('/api/v1/cutoff-options').json()['data']['options']) > 0
        assert client.post('/api/v1/session').status_code == 200
        result_id = client.post('/api/v1/session/demo').json()['data']['result_id']
        assert client.put(f'/api/v1/results/{result_id}/confirm', json={'confirm': True}).status_code == 200
        response = client.post('/api/v1/cutoff-recommendations', json={'merit_percent': 85, 'verified_by_student': True,
            'academic_year': '2025-26', 'round': 'I', 'stage': 'Stage-I', 'seat_type': 'NGOPENH'})
        assert response.status_code == 200 and response.json()['data']['total'] > 0


@pytest.mark.skipif(not os.environ.get('CQ_REHEARSAL_DATABASE_URL'), reason='Requires the isolated v12 PostgreSQL rehearsal')
@pytest.mark.skipif(os.name == 'nt' or (sys.platform != 'darwin' and not shutil.which('tesseract')), reason='Local OCR engine unavailable')
def test_scanned_marksheet_to_historical_recommendations(tmp_path, monkeypatch):
    from PIL import Image, ImageDraw, ImageFont

    image = Image.new('RGB', (1800, 1050), 'white')
    draw = ImageDraw.Draw(image)
    font_path = '/System/Library/Fonts/Supplemental/Arial.ttf' if sys.platform == 'darwin' else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    font = ImageFont.truetype(font_path, 58)
    rows = [('English', 75), ('Marathi', 80), ('Hindi', 85), ('Mathematics', 90), ('Science', 95)]
    draw.text((90, 70), 'Subject             Maximum      Obtained', font=font, fill='black')
    for index, (name, marks) in enumerate(rows):
        draw.text((90, 200 + index * 130), f'{name:<20} 100             {marks}', font=font, fill='black')
    image_buffer = io.BytesIO()
    image.save(image_buffer, format='PNG')
    content = image_buffer.getvalue()
    monkeypatch.setenv('CQ_LOCAL_CATALOGUE', str(tmp_path / 'missing.db'))
    settings = Settings(database_url=os.environ['CQ_REHEARSAL_DATABASE_URL'], evidence_backend='postgres',
                        share_token_pepper='rehearsal-only-secret-at-least-32-characters', mentor_enabled=False,
                        master_enabled=True, environment='development')
    with TestClient(create_app(settings)) as client:
        assert client.post('/api/v1/session').status_code == 200
        signed = client.post('/api/v1/results/upload-url', json={'mime': 'image/png', 'size': len(content)}).json()['data']
        parts = urlparse(signed['upload_url'])
        assert client.put(parts.path + '?' + parts.query, content=content, headers={'Content-Type': 'image/png'}).status_code == 200
        extraction = client.post('/api/v1/results/extract', json={'document_id': signed['document_id'], 'board': 'SSC_MH', 'exam_year': 2026})
        assert extraction.status_code == 200, extraction.text
        result = extraction.json()['data']
        assert {s['name_as_shown'].casefold(): s['obtained'] for s in result['subjects']} == {name.casefold(): marks for name, marks in rows}
        assert client.put(f"/api/v1/results/{result['result_id']}/confirm", json={'confirm': True}).status_code == 200
        snapshot = client.get('/api/v1/me/snapshot').json()['data']
        merit = sum(sorted((s['obtained'] for s in snapshot['subjects']), reverse=True)[:5]) / 5
        assert merit == 85
        response = client.post('/api/v1/cutoff-recommendations', json={'merit_percent': merit, 'verified_by_student': True,
            'academic_year': '2025-26', 'round': 'I', 'stage': 'Stage-I', 'seat_type': 'NGOPENH'})
        assert response.status_code == 200 and response.json()['data']['total'] > 0
        assert all(item['cutoff_percent'] <= merit for item in response.json()['data']['items'])
