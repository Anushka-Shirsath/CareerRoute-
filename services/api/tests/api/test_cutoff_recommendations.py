import sqlite3

from app.db import transaction
from app.models import Institution, Offering


def make_index(path):
    with sqlite3.connect(path) as db:
        db.executescript('''
          CREATE TABLE choices (offering_id INTEGER, institution_id INTEGER, choice_code TEXT, academic_year TEXT);
          CREATE TABLE cutoffs (id INTEGER, source_id INTEGER, choice_code TEXT, institute_code TEXT, program_name TEXT, seat_type TEXT, stage TEXT, reservation TEXT, rank INTEGER, merit_percent REAL, academic_year TEXT, round TEXT, join_status TEXT);
          CREATE TABLE sources (id INTEGER, url TEXT);
          INSERT INTO sources VALUES (1, 'https://example.org/cutoffs');
          INSERT INTO choices VALUES (10, 1, '123456789', '2026-27'), (11, 1, '123456780', '2026-27');
          INSERT INTO cutoffs VALUES (1,1,'123456789','1234','Diploma','NGOPENH','Stage-I','Home district',5000,80,'2025-26','I','source_only_unmapped');
          INSERT INTO cutoffs VALUES (2,1,'123456780','1234','Diploma','NGOPENH','Stage-I','Home district',4000,90,'2025-26','I','source_only_unmapped');
          INSERT INTO cutoffs VALUES (3,1,'123456789','1234','Diploma','NGOPENO','Stage-I','Other district',3000,94,'2025-26','I','source_only_unmapped');
        ''')


def test_cutoff_recommendations_require_confirmed_marks_and_exact_seat(client, engine, tmp_path, monkeypatch, confirmed):
    path = tmp_path / 'cutoffs.db'
    make_index(path)
    monkeypatch.setenv('CQ_LOCAL_CATALOGUE', str(path))
    with transaction(engine) as db:
        db.add(Institution(id='dump:1', name='Example Polytechnic', district='Pune', pathway='polytechnic', management='government', publish_state='published', data={'source_id':'test-source'}))
        db.flush()
        for ident, code in [(10,'123456789'), (11,'123456780')]:
            db.add(Offering(id=f'dump:{ident}', institution_id='dump:1', pathway_id='polytechnic_diploma', academic_year='2026-27', publish_state='published', data={'source_id':'test-source','program_name':f'Course {ident}','program_code':code}))
    payload = {'merit_percent':85, 'verified_by_student':True, 'academic_year':'2025-26', 'round':'I', 'stage':'Stage-I', 'seat_type':'NGOPENH'}
    response = client.post('/api/v1/cutoff-recommendations', json=payload)
    assert response.status_code == 200, response.text
    rows = response.json()['data']['items']
    assert [row['offering_id'] for row in rows] == ['dump:10']
    assert rows[0]['cutoff_percent'] == 80 and rows[0]['difference'] == 5
    assert rows[0]['source_url'] == 'https://example.org/cutoffs'
    payload['seat_type'] = 'NGOPENO'
    assert client.post('/api/v1/cutoff-recommendations', json=payload).json()['data']['items'] == []
    payload['verified_by_student'] = False
    assert client.post('/api/v1/cutoff-recommendations', json=payload).status_code == 422


def test_cutoff_recommendations_exclude_conflicting_or_changed_course_codes(client, engine, tmp_path, monkeypatch, confirmed):
    path = tmp_path / 'cutoffs.db'
    make_index(path)
    monkeypatch.setenv('CQ_LOCAL_CATALOGUE', str(path))
    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO cutoffs VALUES (4,1,'123456789','1234','Diploma','NGOPENH','Stage-I','Home district',6000,70,'2025-26','I','source_only_unmapped')")
    with transaction(engine) as db:
        db.add(Institution(id='dump:1', name='Example Polytechnic', district='Pune', pathway='polytechnic', management='government', publish_state='published', data={'source_id':'test-source'}))
        db.flush()
        db.add(Offering(id='dump:10', institution_id='dump:1', pathway_id='polytechnic_diploma', academic_year='2026-27', publish_state='published', data={'source_id':'test-source','program_name':'Course','program_code':'123456789'}))
        db.add(Offering(id='dump:11', institution_id='dump:1', pathway_id='polytechnic_diploma', academic_year='2026-27', publish_state='published', data={'source_id':'test-source','program_name':'Changed course','program_code':'different'}))
    payload = {'merit_percent':95, 'verified_by_student':True, 'academic_year':'2025-26', 'round':'I', 'stage':'Stage-I', 'seat_type':'NGOPENH'}
    assert client.post('/api/v1/cutoff-recommendations', json=payload).json()['data']['items'] == []


def test_cutoff_recommendations_reject_unconfirmed_result(client, tmp_path, monkeypatch):
    path = tmp_path / 'cutoffs.db'
    make_index(path)
    monkeypatch.setenv('CQ_LOCAL_CATALOGUE', str(path))
    payload = {'merit_percent':85, 'verified_by_student':True, 'academic_year':'2025-26', 'round':'I', 'stage':'Stage-I', 'seat_type':'NGOPENH'}
    assert client.post('/api/v1/cutoff-recommendations', json=payload).status_code == 422
