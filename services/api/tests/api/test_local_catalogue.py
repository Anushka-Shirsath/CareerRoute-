import sqlite3
import gzip
import importlib.util
from pathlib import Path

from app.db import transaction
from app.models import Institution, Offering


def test_local_import_keeps_fee_provenance_and_historical_hostel(tmp_path):
    script = Path(__file__).resolve().parents[4] / 'scripts' / 'build_local_catalogue.py'
    spec = importlib.util.spec_from_file_location('build_local_catalogue', script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    dump = tmp_path / 'dump.sql.gz'
    with gzip.open(dump, 'wt') as f:
        f.write('COPY public.fee_structures (id, institution_program_id, academic_year, fee_type, amount_inr, is_estimate) FROM stdin;\n1\t10\t2025-26\ttotal\t42000\tf\n\\.\n')
        f.write('COPY public.hostel_facilities (id, institution_id, available, boys_capacity, girls_capacity, data_status) FROM stdin;\n2\t1\tt\t50\t40\thistorical\n\\.\n')
        f.write('COPY public.source_documents (source_id, url) FROM stdin;\n7\thttps://example.org/source\n\\.\n')
        f.write('COPY public.data_provenance (table_name, record_id, source_id, field_level_note) FROM stdin;\nfee_structures\t1\t7\tInstitute-wide fee\nhostel_facilities\t2\t7\tHistorical\n\\.\n')
    output = tmp_path / 'index.db'
    module.build(dump, output)
    with sqlite3.connect(output) as db:
        assert db.execute('SELECT offering_id,amount,source_url,note FROM fees').fetchone() == (10, 42000, 'https://example.org/source', 'Institute-wide fee')
        assert db.execute('SELECT institution_id,boys_capacity,girls_capacity,data_status FROM hostels').fetchone() == (1, 50, 40, 'historical')


def test_directory_fee_filter_and_detail_use_local_source_records(client, engine, tmp_path, monkeypatch):
    path = tmp_path / 'catalogue.db'
    with sqlite3.connect(path) as db:
        db.executescript('''
            CREATE TABLE fees (id INTEGER, offering_id INTEGER, academic_year TEXT, kind TEXT, amount REAL, estimate INTEGER, source_url TEXT, note TEXT);
            CREATE TABLE hostels (institution_id INTEGER, available INTEGER, boys_capacity INTEGER, girls_capacity INTEGER, data_status TEXT, source_url TEXT);
            CREATE TABLE choices (offering_id INTEGER, institution_id INTEGER, choice_code TEXT, academic_year TEXT);
            CREATE TABLE cutoffs (id INTEGER, source_id INTEGER, choice_code TEXT, institute_code TEXT, program_name TEXT, seat_type TEXT, stage TEXT, reservation TEXT, rank INTEGER, merit_percent REAL, academic_year TEXT, round TEXT, join_status TEXT);
            CREATE TABLE sources (id INTEGER, url TEXT);
            INSERT INTO fees VALUES (1, 10, '2025-26', 'total', 42000, 0, 'https://example.org/order', 'Institute-wide fee');
            INSERT INTO hostels VALUES (1, 1, 50, 40, 'Historical declaration for 2025-26', 'https://example.org/hostel');
            INSERT INTO choices VALUES (10, 1, '123456789', '2026-27');
            INSERT INTO sources VALUES (7, 'https://example.org/cutoff');
            INSERT INTO cutoffs VALUES (1, 7, '123456789', '1234', 'Diploma', 'GOPENH', 'Stage-I', 'Home district', 1000, 82.5, '2025-26', 'I', 'source_only_unmapped');
        ''')
    monkeypatch.setenv('CQ_LOCAL_CATALOGUE', str(path))
    with transaction(engine) as db:
        db.add(Institution(id='dump:1', name='Example Institute', district='Pune', pathway='polytechnic', management='government', publish_state='published', data={'source_id': 'test-source'}))
        db.flush()
        db.add(Offering(id='dump:10', institution_id='dump:1', pathway_id='polytechnic_diploma', academic_year='2025-26', publish_state='published', data={'source_id': 'test-source', 'program_name': 'Example Diploma', 'program_code': '123456789'}))
    data = client.get('/api/v1/colleges', params={'max_annual_fee': 45000}).json()['data']
    assert data['fee_filter_available'] is True
    assert [row['id'] for row in data['items']] == ['dump:10']
    assert data['items'][0]['published_fee']['amount'] == 42000
    assert client.get('/api/v1/colleges', params={'max_annual_fee': 40000}).json()['data']['items'] == []
    detail = client.get('/api/v1/offerings/dump:10').json()['data']
    assert detail['published_fee']['academic_year'] == '2025-26'
    assert detail['historical_hostel']['boys_capacity'] == 50
    assert detail['hostel_status'] == 'unknown'
    assert detail['possible_cutoffs'][0]['merit_percent'] == 82.5
    assert detail['possible_cutoffs'][0]['join_status'] == 'source_only_unmapped'
    with transaction(engine) as db:
        offering = db.get(Offering, 'dump:10')
        offering.data = {**offering.data, 'program_code': 'DIFFERENT'}
    assert client.get('/api/v1/colleges', params={'max_annual_fee': 45000}).json()['data']['items'] == []
    assert client.get('/api/v1/offerings/dump:10').json()['data']['published_fee'] is None


def test_directory_reports_when_local_fee_index_is_missing(client, tmp_path, monkeypatch):
    monkeypatch.setenv('CQ_LOCAL_CATALOGUE', str(tmp_path / 'missing.db'))
    data = client.get('/api/v1/colleges', params={'max_annual_fee': 45000}).json()['data']
    assert data['fee_filter_available'] is False
