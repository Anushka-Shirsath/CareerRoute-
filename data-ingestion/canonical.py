"""Canonical CSV validation, staged review and publication for future data updates.

New facts require a human review via the CLI. Validation never fills missing facts.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys
from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/api'))
from app.catalogue import DISTRICTS, district_name  # noqa: E402
from app.config import Settings  # noqa: E402
from app.db import make_engine, transaction  # noqa: E402
from app.domain.costs import INSTITUTIONAL  # noqa: E402
from app.domain.results import PATHWAYS  # noqa: E402
from app.models import AdmissionCycle, Cutoff, Fee, ImportRun, Institution, Offering, Publication, Source, now  # noqa: E402
from pipeline import number  # noqa: E402

COLUMNS = {
    'institutions': {'ext_source_id', 'ext_institution_code', 'name_as_published', 'district', 'management_type', 'source_id', 'academic_year'},
    'offerings': {'ext_institution_code', 'program_code', 'program_name_as_published', 'pathway_id', 'medium', 'intake', 'hostel_status', 'source_id', 'academic_year'},
    'cutoffs': {'ext_institution_code', 'program_code', 'admission_system', 'academic_year', 'round', 'category', 'quota', 'merit_metric', 'raw_value', 'numeric_value', 'extra_dimensions_json', 'source_id'},
    'fees': {'ext_institution_code', 'program_code', 'academic_year', 'kind', 'amount_inr', 'per', 'applies_to_category', 'status', 'source_id'},
}


def ident(*parts):
    return 'csv:' + hashlib.sha256(json.dumps(parts).encode()).hexdigest()[:32]


def load(folder):
    result = {}
    for table in COLUMNS:
        path = Path(folder) / f'{table}.csv'
        if path.exists():
            with path.open(encoding='utf-8-sig', newline='') as handle:
                reader = csv.DictReader(handle)
                missing = COLUMNS[table] - set(reader.fieldnames or [])
                if missing:
                    raise ValueError(f'{table}: missing columns {sorted(missing)}')
                result[table] = list(reader)
        else:
            result[table] = []
    return result


def validate(tables, prior_fees=None, existing_institutions=None):
    errors, warnings = [], []
    institutions = tables.get('institutions', [])
    offering_keys = {(r['ext_institution_code'], r['program_code'], r['academic_year']) for r in tables.get('offerings', [])}
    cutoff_keys = set()
    inst_codes = [r['ext_institution_code'] for r in institutions]
    if len(inst_codes) != len(set(inst_codes)):
        errors.append('Duplicate institution code in run; use separate source-system runs.')
    for r in institutions:
        if district_name(r.get('district')) not in DISTRICTS:
            errors.append('Unknown Maharashtra district: ' + r.get('district', ''))
        if r.get('management_type') not in {'government', 'government_aided', 'private_unaided', 'unknown'}:
            errors.append('Invalid management type.')
        for old in existing_institutions or []:
            if old['name'].casefold() == r['name_as_published'].casefold() and old.get('district') != district_name(r['district']):
                warnings.append('Same institution name in another district; do not merge by name.')
            if old.get('official_code') == r['ext_institution_code'] and old['name'] != r['name_as_published']:
                warnings.append('Institution code has a different published name.')
    for r in tables.get('offerings', []):
        if r['pathway_id'] not in PATHWAYS or r['hostel_status'] not in {'available', 'not_available', 'unknown'}:
            errors.append('Invalid pathway or hostel status.')
        if r['ext_institution_code'] not in inst_codes:
            errors.append('Offering institution is not in this run.')
        try:
            if r.get('intake') and (int(r['intake']) < 0 or str(int(r['intake'])) != r['intake']):
                errors.append('Intake must be a non-negative integer or blank.')
        except ValueError:
            errors.append('Invalid intake.')
    for table in ('offerings', 'cutoffs', 'fees'):
        for r in tables.get(table, []):
            if not r.get('source_id') or not r.get('academic_year'):
                errors.append(f'{table}: source and academic year are required.')
    for r in tables.get('cutoffs', []):
        try:
            raw, numeric = number(r['raw_value']), number(r['numeric_value'])
            if raw is None and numeric is not None:
                errors.append('NA cutoff must remain null, never zero.')
            if raw is not None and raw != numeric:
                errors.append('Raw and numeric cutoff values disagree.')
            if numeric is not None and 'percent' in r['merit_metric'].lower() and not 0 <= numeric <= 100:
                errors.append('Percentage cutoff out of range.')
            extra = json.loads(r['extra_dimensions_json'] or '{}')
            if not isinstance(extra, dict):
                errors.append('Extra dimensions must be a JSON object.')
            key = tuple(r[k] for k in ('admission_system', 'academic_year', 'ext_institution_code', 'program_code', 'round', 'category', 'quota', 'merit_metric', 'source_id')) + (json.dumps(extra, sort_keys=True),)
            if key in cutoff_keys:
                errors.append('Duplicate cutoff key.')
            cutoff_keys.add(key)
            if r['admission_system'] not in {'FYJC_CAP', 'DTE_POLY_CAP', 'DVET_ITI'}:
                errors.append('Unknown admission system.')
        except (ValueError, TypeError):
            errors.append('Invalid cutoff numeric value or dimensions.')
        if (r['ext_institution_code'], r['program_code'], r['academic_year']) not in offering_keys:
            errors.append('Cutoff references a missing offering.')
        # No category/quota codes are guessed; unknown code dictionaries need review.
        warnings.append('Review category, quota and merit metric against the source publication.')
    for r in tables.get('fees', []):
        try:
            amount = number(r['amount_inr'])
            if amount is None or amount < 0:
                errors.append('Fee must be a known non-negative value.')
            if amount == 0 and not r.get('officially_free_note'):
                warnings.append('Zero fee needs an officially free note; it stays unknown in the API until supplied.')
            key = (r['ext_institution_code'], r['program_code'], r['kind'])
            old = (prior_fees or {}).get(key)
            if old and amount is not None and abs(amount - old) / old > .30:
                warnings.append('Fee change exceeds 30%; review source and year.')
        except ValueError:
            errors.append('Invalid fee amount.')
        if r['kind'] not in {*INSTITUTIONAL, 'hostel'} or r['per'] not in {'year', 'semester', 'one_time'} or r['status'] not in {'official_source', 'institution_source'}:
            errors.append('Invalid fee kind, period or verification status.')
        if (r['ext_institution_code'], r['program_code'], r['academic_year']) not in offering_keys:
            errors.append('Fee references a missing offering.')
    return {'errors': sorted(set(errors)), 'warnings': sorted(set(warnings)), 'counts': {k: len(v) for k, v in tables.items()}}


def stage(folder, engine):
    tables = load(folder)
    digest = hashlib.sha256(json.dumps(tables, sort_keys=True).encode()).hexdigest()
    run_id = 'canonical:' + digest[:24]
    with transaction(engine) as db:
        existing = db.get(ImportRun, run_id)
        if existing:
            return {'run_id': run_id, **existing.data.get('validation', {})}
        old_inst = [{'name': i.name, 'district': i.district, 'official_code': i.data.get('official_code')} for i in db.scalars(select(Institution))]
        prior = {}
        for f, o, i in db.execute(select(Fee, Offering, Institution).join(Offering, Offering.id == Fee.offering_id).join(Institution, Institution.id == Offering.institution_id).order_by(Fee.academic_year)):
            prior[(i.data.get('official_code'), o.data.get('program_code'), f.data['kind'])] = f.data.get('amount_inr')
        validation = validate(tables, prior, old_inst)
        source_ids = set(db.scalars(select(Source.id)))
        absent = {r.get('source_id') for rows in tables.values() for r in rows} - source_ids
        if absent:
            validation['errors'].append('Register sources first: ' + ', '.join(sorted(str(x) for x in absent)))
        db.add(ImportRun(id=run_id, status='staged', data={'tables': tables, 'validation': validation, 'review': None, 'staged_at': now()}))
    return {'run_id': run_id, **validation}


def review(run_id, engine, reviewer, reason, decision):
    with transaction(engine) as db:
        run = db.get(ImportRun, run_id)
        if not run or run.status != 'staged':
            raise ValueError('A staged run is required.')
        if run.data['validation']['errors']:
            raise ValueError('Fix validation errors before review.')
        run.data = {**run.data, 'review': {'reviewer': reviewer, 'reason': reason, 'decision': decision, 'reviewed_at': now()}}


def publish(run_id, engine):
    with transaction(engine) as db:
        run = db.get(ImportRun, run_id)
        if not run:
            raise ValueError('Unknown import run.')
        if run.status == 'published':
            return {'run_id': run_id, 'status': 'already_published'}
        if not run.data.get('review') or run.data['review']['decision'] != 'approve' or run.data['validation']['errors']:
            raise ValueError('A human must approve this run before publication.')
        tables = run.data['tables']
        changes = []
        code_map, offerings = {}, {}

        def save(model, values):
            old = db.get(model, values['id'])
            before = {c.name: getattr(old, c.name) for c in model.__table__.columns} if old else None
            changes.append({'table': model.__tablename__, 'id': values['id'], 'before': before, 'after': values})
            db.merge(model(**values))

        for r in tables['institutions']:
            iid = ident(r['ext_source_id'], r['ext_institution_code'])
            system_aliases = {'FYJC_CAP': 'fyjc_udise', 'DTE_POLY_CAP': 'dte_poly', 'DVET_ITI': 'dvet'}
            system = system_aliases.get(r['ext_source_id'], r['ext_source_id'])
            existing = [i for i in db.scalars(select(Institution)) if i.data.get('official_code') == r['ext_institution_code'] and i.data.get('admission_system') == system]
            if len(existing) > 1:
                raise ValueError('Conflicting official-code mappings require manual identity resolution.')
            if existing:
                iid = existing[0].id
            code_map[r['ext_institution_code']] = iid
            routes = (r.get('pathway_types') or '').split('|')
            broad = 'polytechnic' if 'polytechnic_diploma' in routes else 'iti' if 'iti_trade' in routes else 'fyjc' if any(p.startswith('fyjc_') for p in routes) else 'vocational'
            save(Institution, {'id': iid, 'name': r['name_as_published'], 'district': district_name(r['district']), 'management': r['management_type'], 'pathway': broad, 'publish_state': 'published', 'data': {'source_id': r['source_id'], 'academic_year': r['academic_year'], 'city': r.get('city') or None, 'official_code': r['ext_institution_code'], 'admission_system': system, 'official_website': r.get('official_website') or None, 'is_synthetic': False, 'run_id': run_id}})
        db.flush()
        for r in tables['offerings']:
            oid = ident(code_map[r['ext_institution_code']], r['program_code'], r['academic_year'], r['medium'], r.get('shift', ''))
            key = (r['ext_institution_code'], r['program_code'], r['academic_year'])
            if key in offerings:
                raise ValueError('Program identity ambiguous; provide a unique program code per medium/shift.')
            offerings[key] = oid
            save(Offering, {'id': oid, 'institution_id': code_map[r['ext_institution_code']], 'pathway_id': r['pathway_id'], 'academic_year': r['academic_year'], 'publish_state': 'published', 'data': {'source_id': r['source_id'], 'program_name': r['program_name_as_published'], 'program_code': r['program_code'], 'medium': r['medium'] or None, 'intake': int(r['intake']) if r['intake'] else None, 'hostel_status': r['hostel_status'], 'is_synthetic': False, 'run_id': run_id}})
        db.flush()
        for r in tables['cutoffs']:
            oid = offerings[(r['ext_institution_code'], r['program_code'], r['academic_year'])]
            cycle_id = ident(r['admission_system'], r['academic_year'], r['round'], r['source_id'])
            cycle_data = {k: r[k] for k in ('admission_system', 'academic_year', 'round', 'source_id')}
            save(AdmissionCycle, {'id': cycle_id, 'data': cycle_data})
            db.flush()
            data = {k: r[k] for k in ('category', 'quota', 'merit_metric', 'raw_value')}
            data.update(numeric_value=number(r['numeric_value']), extra_dimensions=json.loads(r['extra_dimensions_json'] or '{}'))
            save(Cutoff, {'id': ident(cycle_id, oid, r['category'], r['quota'], r['merit_metric'], data['extra_dimensions']), 'offering_id': oid, 'academic_year': r['academic_year'], 'cycle_id': cycle_id, 'data': data})
        for r in tables['fees']:
            oid = offerings[(r['ext_institution_code'], r['program_code'], r['academic_year'])]
            data = {k: r[k] for k in ('academic_year', 'kind', 'per', 'applies_to_category', 'status', 'source_id')}
            data.update(amount_inr=number(r['amount_inr']), officially_free_note=r.get('officially_free_note'))
            save(Fee, {'id': ident(oid, r['academic_year'], r['kind'], r['applies_to_category'], r['source_id']), 'offering_id': oid, 'academic_year': r['academic_year'], 'data': data})
        run.status = 'published'
        # Public coverage never exposes staged raw rows or private review notes.
        run.data = {'validation': run.data['validation'], 'review': run.data['review'], 'published_at': now(), 'counts': {k: len(v) for k, v in tables.items()}}
        db.add(Publication(run_id=run_id, data={'changes': changes, 'review': run.data['review']}))
    return {'run_id': run_id, 'status': 'published'}


def revert(run_id, engine):
    """Restore an unchanged publication's before-images in reverse dependency order."""
    models = {m.__tablename__: m for m in (Institution, Offering, Cutoff, Fee, AdmissionCycle)}
    with transaction(engine) as db:
        publication = db.scalar(select(Publication).where(Publication.run_id == run_id).order_by(Publication.created_at.desc()))
        if not publication or not publication.data.get('changes'):
            raise ValueError('No reversible canonical publication found.')
        changes = publication.data['changes']
        final = {(c['table'], c['id']): c for c in changes}
        for (table, record_id), change in final.items():
            model = models[table]
            row = db.get(model, record_id)
            current = {c.name: getattr(row, c.name) for c in model.__table__.columns} if row else None
            if current != change['after']:
                raise ValueError('A record changed after this publication; manual review is required.')
        for change in reversed(changes):
            model = models[change['table']]
            if change['before']:
                db.merge(model(**change['before']))
            else:
                row = db.get(model, change['id'])
                if row:
                    db.delete(row)
            db.flush()
        run = db.get(ImportRun, run_id)
        run.status = 'reverted'
        db.add(Publication(run_id=run_id, data={'reverts': publication.id, 'reverted_at': now()}))
    return {'run_id': run_id, 'status': 'reverted'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['validate', 'stage', 'review', 'publish', 'revert'])
    parser.add_argument('--folder')
    parser.add_argument('--run')
    parser.add_argument('--reviewer')
    parser.add_argument('--reason')
    parser.add_argument('--decision', choices=['approve', 'reject'])
    args = parser.parse_args()
    engine = make_engine(Settings().database_url)
    if args.command == 'validate':
        result = validate(load(args.folder))
    elif args.command == 'stage':
        result = stage(args.folder, engine)
    elif args.command == 'review':
        if not args.reviewer or not args.reason or not args.decision:
            parser.error('Review requires --reviewer, --reason and --decision.')
        review(args.run, engine, args.reviewer, args.reason, args.decision)
        result = {'reviewed': args.run}
    elif args.command == 'publish':
        result = publish(args.run, engine)
    else:
        result = revert(args.run, engine)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
