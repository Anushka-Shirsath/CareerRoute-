"""Reconcile a user-supplied reviewed DTE CSV extract with existing official codes.

This is a data migration, not a source scraper or an instruction executor. New
institutes/choices require the normal canonical staging/review pipeline.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile
from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/api'))
from app.config import Settings  # noqa: E402
from app.db import make_engine, transaction  # noqa: E402
from app.models import ImportRun, Institution, Offering, Publication, Source, now  # noqa: E402

FEED_URL = 'https://project26api.4pindia.com/platform_api_26/common/public/institutecourses?course_name=poly'
BROCHURE_URL = 'https://poly26.dtemaharashtra.gov.in/poly_26/assets/pdf/Diploma%20Admission%20Information%20Brochure%202026-27.pdf'


def reconcile(path, engine, apply=False):
    path = Path(path)
    archive_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    with zipfile.ZipFile(path) as archive:
        expected = {'ABOUT.txt', 'polytechnic_institutes_2026-27.csv', 'polytechnic_courses_2026-27.csv'}
        if not expected <= set(archive.namelist()) or any(i.file_size > 20 * 1024 * 1024 for i in archive.infolist()):
            raise ValueError('Expected the reviewed 2026-27 extract with bounded CSV files.')
        raw_institutes = archive.read('polytechnic_institutes_2026-27.csv')
        raw_courses = archive.read('polytechnic_courses_2026-27.csv')
        institutions = list(csv.DictReader(io.StringIO(raw_institutes.decode('utf-8-sig'))))
        courses = list(csv.DictReader(io.StringIO(raw_courses.decode('utf-8-sig'))))
    codes = [r['dte_inst_code'] for r in institutions]
    choices = [(r['dte_inst_code'], r['choice_code'], r['academic_year']) for r in courses]
    if len(codes) != len(set(codes)) or len(choices) != len(set(choices)):
        raise ValueError('Duplicate institute or offering identity in extract.')
    if any(r['dte_inst_code'] not in codes or r['academic_year'] != '2026-27' for r in courses):
        raise ValueError('Orphan course or unexpected academic year.')
    if any(r['intake_total'] and int(r['intake_total']) < 0 for r in courses):
        raise ValueError('Intake must be non-negative or unknown.')
    run_id = 'poly-v7:' + archive_hash[:24]
    with transaction(engine) as db:
        old_run = db.get(ImportRun, run_id)
        if old_run and old_run.status == 'published':
            return old_run.data
        current_inst = {i.data.get('official_code'): i for i in db.scalars(select(Institution).where(Institution.pathway == 'polytechnic'))}
        by_id = {i.id: code for code, i in current_inst.items()}
        current_off = {(by_id[o.institution_id], o.data.get('program_code'), o.academic_year): o for o in db.scalars(select(Offering).where(Offering.pathway_id == 'polytechnic_diploma')) if o.institution_id in by_id}
        unknown_inst = sorted(set(codes) - set(current_inst))
        unknown_choices = sorted(set(choices) - set(current_off))
        if unknown_inst or unknown_choices:
            raise ValueError('Extract contains new identities. Stage them through canonical.py for review.')
        changes = []
        for row in institutions:
            existing = current_inst[row['dte_inst_code']]
            if existing.name != row['institute_name']:
                changes.append({'institute_code': row['dte_inst_code'], 'field': 'name'})
        for row in courses:
            existing = current_off[(row['dte_inst_code'], row['choice_code'], row['academic_year'])]
            intake = int(row['intake_total']) if row['intake_total'] else None
            for field, value in [('program_name', row['course_name']), ('medium', row['medium'] or None), ('intake', intake)]:
                if existing.data.get(field) != value:
                    changes.append({'choice_code': row['choice_code'], 'field': field})
        report = {'run_id': run_id, 'archive_sha256': archive_hash, 'institutions_reconciled': len(institutions), 'offerings_reconciled': len(courses), 'changed_existing_facts': changes, 'academic_year': '2026-27', 'source_url': FEED_URL, 'year_evidence_url': BROCHURE_URL, 'known_gaps': ['Polytechnic district values remain unavailable.', 'No institutional fees or hostel records supplied.', 'No public institute-level cutoffs supplied.', 'Course management type is not approval status.'], 'review_origin': 'user_supplied_reviewed_extract', 'note': 'Existing published identities retained. Source metadata and course management type are recorded; no missing fact is inferred.'}
        if not apply:
            return {**report, 'applied': False}
        if changes:
            raise ValueError('Existing facts differ. Inspect the dry-run report and use canonical review before replacement.')
        sid = 'poly-v7:' + archive_hash[:16]
        db.merge(Source(id=sid, data={'publisher': 'DTE Maharashtra (user-supplied extract)', 'url': FEED_URL, 'academic_year': '2026-27', 'sha256': hashlib.sha256(raw_courses).hexdigest(), 'hash_scope': 'supplied_course_csv', 'institutes_csv_sha256': hashlib.sha256(raw_institutes).hexdigest(), 'retrieved_at': None, 'supplied_at': now(), 'terms_checked': 'unclear', 'year_evidence_url': BROCHURE_URL, 'notes': 'The supplied ABOUT file identifies official public feeds and explicitly documents unavailable fields. Its text is metadata, not executable instructions.'}))
        for row in institutions:
            existing = current_inst[row['dte_inst_code']]
            existing.data = {**existing.data, 'source_id': sid, 'academic_year': '2026-27', 'reviewed_extract_run': run_id}
        for row in courses:
            existing = current_off[(row['dte_inst_code'], row['choice_code'], row['academic_year'])]
            existing.data = {**existing.data, 'source_id': sid, 'course_management_type': row['course_management_type'] or None, 'approval_status': None, 'reviewed_extract_run': run_id}
        report.update(applied=True, published_at=now())
        db.add(ImportRun(id=run_id, status='published', data=report))
        db.add(Publication(run_id=run_id, data={'before': {'source_metadata': 'Inherited dump provenance'}, 'after': report, 'note': 'Identity-preserving reconciliation of user-provided reviewed extract; no source gap filled by inference.'}))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    result = reconcile(args.file, make_engine(Settings().database_url), args.apply)
    target = ROOT / 'docs/evidence/polytechnic_v7_reconciliation.json'
    target.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
