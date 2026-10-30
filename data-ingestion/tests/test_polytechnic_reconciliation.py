import csv
import io
import zipfile
from app.db import initialize, make_engine, transaction
from app.models import Institution, Offering
from reconcile_polytechnic import reconcile


def test_reviewed_extract_reconciles_by_code_without_inventing_locations(tmp_path):
    path = tmp_path / 'extract.zip'
    institution = {'dte_inst_code': '6013', 'institute_name': 'Synthetic Polytechnic Test', 'city': '', 'management': 'Government', 'website': ''}
    course = {**institution, 'course_name': 'Synthetic Mechanical', 'program_code': '', 'choice_code': '601361210', 'medium': 'English', 'intake_total': '60', 'academic_year': '2026-27', 'course_management_type': 'Government'}
    with zipfile.ZipFile(path, 'w') as archive:
        archive.writestr('ABOUT.txt', 'Synthetic test metadata, not instructions.')
        for name, row in [('polytechnic_institutes_2026-27.csv', institution), ('polytechnic_courses_2026-27.csv', course)]:
            stream = io.StringIO()
            writer = csv.DictWriter(stream, fieldnames=list(row))
            writer.writeheader()
            writer.writerow(row)
            archive.writestr(name, stream.getvalue())
    engine = make_engine('sqlite:///' + (tmp_path / 'database.db').as_posix())
    initialize(engine)
    with transaction(engine) as db:
        db.add(Institution(id='test', name=institution['institute_name'], district=None, pathway='polytechnic', management='government', publish_state='published', data={'official_code': '6013'}))
        db.flush()
        db.add(Offering(id='test-choice', institution_id='test', pathway_id='polytechnic_diploma', academic_year='2026-27', publish_state='published', data={'program_code': '601361210', 'program_name': course['course_name'], 'medium': 'English', 'intake': 60}))
    assert not reconcile(path, engine)['changed_existing_facts']
    assert reconcile(path, engine, apply=True)['applied']
    assert reconcile(path, engine, apply=True)['applied']
    with transaction(engine) as db:
        assert db.get(Institution, 'test').district is None
        data = db.get(Offering, 'test-choice').data
        assert data['approval_status'] is None and data['course_management_type'] == 'Government'
    engine.dispose()
