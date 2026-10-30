"""Offline staged ingestion of the supplied PostgreSQL COPY dump.

No SQL from the input is ever executed. Administrative DB credentials are used
only by this CLI. HTTP requests never download or scrape source websites.
"""
import argparse
import collections
import csv
import hashlib
import json
import re
import sqlite3
import sys
import zipfile
from pathlib import Path
from sqlalchemy import insert, select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/api'))
from app.config import Settings  # noqa: E402
from app.db import initialize, make_engine, transaction  # noqa: E402
from app.catalogue import district_name  # noqa: E402
from app.models import AdmissionCycle, Cutoff, ImportRun, Institution, Offering, Publication, ReviewItem, Source, now  # noqa: E402

TABLES = {'admission_cutoffs', 'admission_cycles', 'data_provenance', 'districts', 'extraction_errors', 'extraction_jobs', 'fee_structures', 'hostel_facilities', 'institution_identifiers', 'institution_programs', 'institutions', 'programs', 'scholarship_schemes', 'seat_matrices', 'source_documents', 'verification_queue'}
TABLES.add('coverage_stats')
COPY = re.compile(r'^COPY public\.(\w+) \((.*?)\) FROM stdin;\s*$')
ESCAPES = {'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t', 'v': '\v', '\\': '\\'}


def unescape(value):
    if value == r'\N':
        return None
    return re.sub(r'\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|.)', lambda m: chr(int(m[1], 8)) if m[1][0].isdigit() else chr(int(m[1][1:], 16)) if m[1].startswith('x') else ESCAPES.get(m[1], m[1]), value)


def number(value):
    if value is None or str(value).strip().upper() in {'', 'NA', 'N/A', '-'}:
        return None
    result = float(value)
    if result != result or abs(result) == float('inf'):
        raise ValueError('Non-finite number')
    return result


def stage(path, staging):
    staging = Path(staging)
    staging.mkdir(parents=True, exist_ok=True)
    raw = staging / 'raw.db'
    if raw.exists():
        raise ValueError('Stage already exists. Use a new run directory.')
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    import io
    archive = zipfile.ZipFile(path) if str(path).endswith('.zip') else None
    if archive:
        entries = [i for i in archive.infolist() if i.filename.endswith('.sql')]
        if len(entries) != 1 or entries[0].file_size > 1024 * 1024 * 1024:
            raise ValueError('Expected one SQL file smaller than 1GB.')
        stream = io.TextIOWrapper(archive.open(entries[0]), encoding='utf-8')
    else:
        stream = open(path, encoding='utf-8')
    counts = collections.Counter()
    with sqlite3.connect(raw) as conn, stream:
        conn.execute('PRAGMA journal_mode=OFF')
        table, columns, batch = None, [], []
        statement = ''
        for line in stream:
            match = COPY.match(line)
            if match:
                table, columns = match[1], match[2].split(', ')
                if table not in TABLES or not all(re.fullmatch(r'[a-z_][a-z0-9_]*', c) for c in columns):
                    raise ValueError(f'Unrecognised COPY schema: {table}')
                conn.execute(f'CREATE TABLE "{table}" ({", ".join(chr(34)+c+chr(34)+" TEXT" for c in columns)})')
                statement = f'INSERT INTO "{table}" VALUES ({",".join("?" for _ in columns)})'
            elif line.rstrip('\r\n') == r'\.':
                if batch:
                    conn.executemany(statement, batch)
                table, batch = None, []
            elif table:
                row = [unescape(v) for v in line.rstrip('\r\n').split('\t')]
                if len(row) != len(columns):
                    raise ValueError(f'Column count mismatch in {table}')
                counts[table] += 1
                batch.append(row)
                if len(batch) == 5000:
                    conn.executemany(statement, batch)
                    batch = []
        if table:
            raise ValueError('Truncated COPY section')
        for name, cols in {'data_provenance': 'table_name,record_id', 'institution_programs': 'id', 'source_documents': 'source_id', 'institutions': 'institution_id', 'programs': 'program_id', 'admission_cycles': 'cycle_id'}.items():
            if counts[name]:
                conn.execute(f'CREATE INDEX "idx_{name}" ON "{name}" ({cols})')
    if archive:
        archive.close()
    report = {'sha256': digest.hexdigest(), 'counts': dict(counts), 'staged_at': now(), 'errors': [], 'warnings': ['No fees or hostel records are present.' if not counts['fee_structures'] and not counts['hostel_facilities'] else 'Review fees and hostel provenance.', 'Cutoff merit metrics and board aggregate rules need official verification.', 'Records with unknown academic year remain directory-only.', 'Pending legacy verification items remain quarantined.'], 'review': None}
    (staging / 'manifest.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


def review(staging, reviewer, reason):
    path = Path(staging) / 'manifest.json'
    report = json.loads(path.read_text(encoding='utf-8'))
    report['review'] = {'reviewer': reviewer, 'reason': reason, 'reviewed_at': now(), 'decision': 'approve_with_unknowns'}
    path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report['review']


def management(raw):
    return {'government': 'government', 'Government': 'government', 'Government / Local Body': 'government', 'Government-Aided': 'government_aided', 'Aided': 'government_aided', 'Un-Aided': 'private_unaided', 'Self Financed': 'private_unaided'}.get(raw, 'unknown')


def pathway(raw, name):
    if raw == 'fyjc':
        return {'science': 'fyjc_science', 'commerce': 'fyjc_commerce', 'arts': 'fyjc_arts'}.get(name.lower())
    return {'polytechnic': 'polytechnic_diploma', 'iti': 'iti_trade', 'vocational': 'vocational'}.get(raw)


def rows(conn, table):
    return conn.execute(f'SELECT * FROM "{table}"')


def publish(staging, engine, preserve_existing_review=False):
    staging = Path(staging)
    manifest = json.loads((staging / 'manifest.json').read_text(encoding='utf-8'))
    if preserve_existing_review and not manifest['review']:
        # Database migration inherits existing verification flags. It does not
        # approve new facts or resolve any pending review item.
        manifest['review'] = {'origin': 'supplied_database', 'decision': 'inherit_existing_status_only', 'note': 'Existing verified flags are preserved; pending rows remain withheld. No new human review is claimed.'}
    if not manifest['review'] or manifest['errors']:
        raise ValueError('Review approval is required before publishing.')
    run_id = manifest['sha256'][:24]
    raw = sqlite3.connect(staging / 'raw.db')
    raw.row_factory = sqlite3.Row
    counts = collections.Counter()
    districts = {r['district_id']: district_name(r['name']) for r in rows(raw, 'districts')}
    # The dump also has a combined Mumbai City/Suburban value. Keep it
    # unassigned rather than guessing which of the two districts it means.
    known_districts = sorted({n for n in districts.values() if n})
    programs = {r['program_id']: dict(r) for r in rows(raw, 'programs')}
    provenance = {}
    for r in raw.execute("SELECT table_name,record_id,MIN(CAST(source_id AS INTEGER)) AS source_id FROM data_provenance WHERE table_name IN ('institutions','institution_programs') GROUP BY table_name,record_id"):
        provenance[(r['table_name'], r['record_id'])] = f"dump:{r['source_id']}"
    pending = {(r['table_name'], r['record_id']) for r in rows(raw, 'verification_queue') if r['status'] == 'pending'}
    with transaction(engine) as db:
        existing = db.get(ImportRun, run_id)
        if existing and existing.status == 'published':
            return existing.data
        source_ids = set()
        source_dir = ROOT / 'data'
        source_dir.mkdir(exist_ok=True)
        register = []
        for r in rows(raw, 'source_documents'):
            sid = f"dump:{r['source_id']}"
            source_ids.add(sid)
            data = {'url': r['url'], 'publisher': r['source_system'], 'retrieved_at': r['fetched_at'], 'sha256': r['content_sha256'], 'http_status': r['http_status'], 'academic_year': None, 'terms_checked': 'unclear', 'notes': r['notes']}
            db.merge(Source(id=sid, data=data))
            register.append({'source_id': sid, **{k: data[k] for k in ('publisher', 'url', 'retrieved_at', 'sha256', 'terms_checked')}})
        with (source_dir / 'sources.csv').open('w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=['source_id', 'publisher', 'url', 'retrieved_at', 'sha256', 'terms_checked'])
            writer.writeheader()
            writer.writerows(register)
        institutions = {}
        codes = {r['institution_id']: dict(r) for r in rows(raw, 'institution_identifiers')}
        for r in rows(raw, 'institutions'):
            sid = provenance.get(('institutions', r['institution_id']))
            district = districts.get(r['district_id'])
            if district not in known_districts:
                district = None
            data = {'source_id': sid, 'academic_year': None, 'status': 'official_source' if sid in source_ids and r['data_status'] == 'verified' else 'unknown', 'city': r['city'], 'management_raw': r['management'], 'official_website': r['website'], 'is_synthetic': False, 'legacy_id': r['institution_id'], 'official_code': codes.get(r['institution_id'], {}).get('identifier_value'), 'admission_system': codes.get(r['institution_id'], {}).get('source_system'), 'district_method': r['district_method'], 'run_id': run_id}
            state = 'published' if sid in source_ids and ('institutions', r['institution_id']) not in pending else 'staged'
            inst = {'id': f"dump:{r['institution_id']}", 'name': r['name'], 'district': district, 'management': management(r['management']), 'pathway': r['pathway'], 'publish_state': state, 'data': data}
            db.merge(Institution(**inst))
            institutions[r['institution_id']] = inst
            counts[f'institutions_{state}'] += 1
        db.flush()
        offering_ids = set()
        for r in rows(raw, 'institution_programs'):
            program = programs.get(r['program_id'])
            inst = institutions.get(r['institution_id'])
            sid = provenance.get(('institution_programs', r['id']))
            if not program or not inst:
                counts['offerings_rejected'] += 1
                continue
            route = pathway(program['pathway'], program['name'])
            if not route:
                counts['offerings_rejected'] += 1
                continue
            state = 'published' if sid in source_ids and inst['publish_state'] == 'published' and ('institution_programs', r['id']) not in pending else 'staged'
            data = {'program_name': program['name'], 'program_code': r['choice_code'] or program['program_code'], 'medium': r['medium'] or None, 'intake': int(r['intake_total']) if r['intake_total'] else None, 'hostel_status': 'unknown', 'source_id': sid, 'status': 'official_source' if state == 'published' and r['academic_year'] else 'unknown', 'is_synthetic': False, 'run_id': run_id, 'eligibility_rules': None, 'aggregate_rule': None}
            oid = f"dump:{r['id']}"
            offering_ids.add(oid)
            db.merge(Offering(id=oid, institution_id=inst['id'], pathway_id=route, academic_year=r['academic_year'], publish_state=state, data=data))
            counts[f'offerings_{state}'] += 1
        db.flush()
        cycles = {}
        for r in rows(raw, 'admission_cycles'):
            data = {'admission_system': 'FYJC_CAP', 'academic_year': r['academic_year'], 'round': r['round_name'], 'source_id': f"dump:{r['source_document_id']}"}
            cycles[r['cycle_id']] = data
            db.merge(AdmissionCycle(id=f"dump:{r['cycle_id']}", data=data))
        db.flush()
        # Stable IDs make import idempotent; a new dump can update existing rows.
        existing_cutoffs = set(db.scalars(select(Cutoff.id)))
        batch = []
        for r in rows(raw, 'admission_cutoffs'):
            cycle = cycles.get(r['cycle_id'])
            oid = f"dump:{r['institution_program_id']}"
            if not cycle or cycle['source_id'] not in source_ids or oid not in offering_ids:
                counts['cutoffs_rejected'] += 1
                continue
            ident = f"dump:{r['id']}"
            data = {'category': r['category'], 'quota': None, 'reservation_details': r['reservation_details'], 'raw_value': r['cutoff_value_raw'], 'numeric_value': number(r['cutoff_value_num']), 'merit_metric': r['measurement_type'], 'scale': r['scale'], 'extra_dimensions': {}}
            item = {'id': ident, 'offering_id': oid, 'academic_year': cycle['academic_year'], 'cycle_id': f"dump:{r['cycle_id']}", 'data': data}
            if ident in existing_cutoffs:
                db.merge(Cutoff(**item))
            else:
                batch.append(item)
            if len(batch) >= 5000:
                db.execute(insert(Cutoff), batch)
                batch.clear()
            counts['cutoffs'] += 1
        if batch:
            db.execute(insert(Cutoff), batch)
        for r in rows(raw, 'verification_queue'):
            db.merge(ReviewItem(id=f"dump:{r['id']}", run_id=run_id, status=r['status'], data={'table': r['table_name'], 'record_id': r['record_id'], 'reason': r['reason']}))
        stats = {**dict(counts), 'raw_counts': manifest['counts'], 'districts': known_districts, 'sha256': manifest['sha256'], 'review': manifest['review'], 'warnings': manifest['warnings'], 'published_at': now()}
        db.merge(ImportRun(id=run_id, status='published', data=stats))
        db.add(Publication(run_id=run_id, data={'before': None, 'after': stats, 'note': 'Source rows marked verified retained; unresolved flags quarantined; missing facts not inferred.'}))
    raw.close()
    return stats


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['stage', 'review', 'publish', 'init', 'migrate-supplied'])
    parser.add_argument('--file', default=str(ROOT / 'careerquest_dump.sql.zip'))
    parser.add_argument('--run', default=str(ROOT / 'data/staging/supplied-dump'))
    parser.add_argument('--reviewer')
    parser.add_argument('--reason')
    args = parser.parse_args()
    if args.command == 'stage':
        result = stage(args.file, args.run)
    elif args.command == 'review':
        if not args.reviewer or not args.reason:
            parser.error('--reviewer and --reason are required')
        result = review(args.run, args.reviewer, args.reason)
    else:
        engine = make_engine(Settings().database_url)
        initialize(engine)
        result = publish(args.run, engine, preserve_existing_review=args.command == 'migrate-supplied') if args.command in {'publish', 'migrate-supplied'} else {'initialized': True}
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
