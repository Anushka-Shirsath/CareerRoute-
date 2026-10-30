import csv
import pytest
from sqlalchemy import func, select
from app.db import initialize, make_engine, transaction
from app.models import Cutoff, Publication, Source
from canonical import COLUMNS, publish, revert, review, stage, validate
from pipeline import number, unescape


@pytest.fixture
def tables():
    return {
        'institutions': [{'ext_source_id': 'DTE_POLY_CAP', 'ext_institution_code': '100', 'name_as_published': 'Synthetic Test Institute', 'district': 'Pune', 'management_type': 'government', 'source_id': 'source-test', 'academic_year': '2025-26', 'pathway_types': 'polytechnic_diploma'}],
        'offerings': [{'ext_institution_code': '100', 'program_code': '10001', 'program_name_as_published': 'Test program', 'pathway_id': 'polytechnic_diploma', 'medium': 'English', 'intake': '', 'hostel_status': 'unknown', 'source_id': 'source-test', 'academic_year': '2025-26'}],
        'cutoffs': [{'ext_institution_code': '100', 'program_code': '10001', 'admission_system': 'DTE_POLY_CAP', 'academic_year': '2025-26', 'round': '1', 'category': 'OPEN', 'quota': 'state', 'merit_metric': 'test_percent', 'raw_value': '80', 'numeric_value': '80', 'extra_dimensions_json': '{}', 'source_id': 'source-test'}],
        'fees': [{'ext_institution_code': '100', 'program_code': '10001', 'academic_year': '2025-26', 'kind': 'tuition', 'amount_inr': '18000', 'per': 'year', 'applies_to_category': 'all', 'status': 'official_source', 'source_id': 'source-test'}],
    }


def test_na_not_zero():
    assert all(number(v) is None for v in ['NA', '-', '', None])
    assert number('0') == 0


def test_copy_escapes_are_data():
    assert unescape(r'hello\tworld\n') == 'hello\tworld\n'
    assert unescape(r'\N') is None
    assert unescape(r'\134') == '\\'


def test_bad_percentage_rejected(tables):
    tables['cutoffs'][0].update(raw_value='180', numeric_value='180')
    assert validate(tables)['errors']


def test_fee_jump_goes_to_review(tables):
    assert 'Fee change exceeds 30%; review source and year.' in validate(tables, {('100', '10001', 'tuition'): 10000})['warnings']


def test_same_name_other_district_goes_to_review(tables):
    assert validate(tables, existing_institutions=[{'name': 'Synthetic Test Institute', 'district': 'Nashik'}])['warnings']


def test_unknown_hostel_stays_unknown(tables):
    assert not validate(tables)['errors']
    assert tables['offerings'][0]['hostel_status'] == 'unknown'


def test_import_twice_no_duplicates_and_publish_keeps_history(tmp_path, tables):
    engine = make_engine('sqlite:///' + (tmp_path / 'test.db').as_posix())
    initialize(engine)
    with transaction(engine) as db:
        db.add(Source(id='source-test', data={'url': 'https://example.org/synthetic-test'}))
    for name, rows in tables.items():
        with (tmp_path / (name + '.csv')).open('w', newline='', encoding='utf-8') as handle:
            writer = csv.DictWriter(handle, fieldnames=sorted(set(rows[0]) | COLUMNS[name]))
            writer.writeheader()
            writer.writerows(rows)
    run = stage(tmp_path, engine)['run_id']
    assert stage(tmp_path, engine)['run_id'] == run
    with pytest.raises(ValueError):
        publish(run, engine)
    review(run, engine, 'Test reviewer', 'Synthetic test approval only', 'approve')
    publish(run, engine)
    publish(run, engine)
    with transaction(engine) as db:
        assert db.scalar(select(func.count()).select_from(Cutoff)) == 1
        history = list(db.scalars(select(Publication)))
        assert len(history) == 1 and history[0].data['changes']
    revert(run, engine)
    with transaction(engine) as db:
        assert db.scalar(select(func.count()).select_from(Cutoff)) == 0
    engine.dispose()


def test_coverage_lists_all_36_districts():
    from app.catalogue import DISTRICTS
    assert len(set(DISTRICTS)) == 36

