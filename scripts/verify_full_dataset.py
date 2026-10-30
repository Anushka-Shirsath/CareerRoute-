"""Exercise the supplied dataset locally; optionally measure real PostgreSQL size.

No cloud connection, paid service or network scrape is involved. PostgreSQL runs
in a disposable local cluster through the optional pgserver test dependency.
"""
import argparse
import json
from pathlib import Path
import sqlite3
import statistics
import sys
import time
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/api'))
from app.config import Settings  # noqa: E402
from app.db import make_engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


def validate(engine, settings):
    app = create_app(settings, engine)
    timings = []
    with TestClient(app) as client:
        assert client.post('/api/v1/session').status_code == 200
        demo = client.post('/api/v1/session/demo').json()['data']
        confirmed = client.put(f"/api/v1/results/{demo['result_id']}/confirm", json={'confirm': True})
        assert confirmed.status_code == 200
        for _ in range(7):
            start = time.perf_counter()
            response = client.post('/api/v1/match', json={})
            timings.append((time.perf_counter() - start) * 1000)
            assert response.status_code == 200, response.text
        matches = response.json()['data']
        pune_count = matches['total']
        if not matches['total']:
            assert matches['warnings'], 'Missing district data must be explained.'
            # The supplied dump has no Polytechnic district fields. Test the
            # statewide known offerings without pretending they are in Pune.
            preferences = client.get('/api/v1/me/preferences').json()['data']
            preferences['target_districts'] = []
            response = client.post('/api/v1/match', json={'preferences': preferences})
            assert response.status_code == 200
            matches = response.json()['data']
        assert matches['total'] > 0
        ids = [r['offering_id'] for r in matches['results'][:2]]
        for oid in ids:
            detail = client.get('/api/v1/offerings/' + oid)
            assert detail.status_code == 200 and detail.json()['data']['sources']
            assert client.put('/api/v1/me/shortlist/' + oid, json={'status': 'shortlisted'}).status_code == 200
        compare = client.post('/api/v1/costs/compare', json={'offering_ids': ids, 'academic_year': '2026-27', 'assumptions': {'hostel_monthly': 2000, 'food_monthly': 2500, 'months': 10}})
        assert compare.status_code == 200
        assert all('tuition' in row['unknown_lines'] and row['total_label'] == 'at least' for row in compare.json()['data']['offerings'])
        parent = client.post('/api/v1/parent-reports', json={'sections': ['costs', 'next_steps']}).json()['data']
        shared = client.get(urlparse(parent['share_url']).path)
        assert set(shared.json()['data']['sections']) == {'costs', 'next_steps'}
        assert client.delete(f"/api/v1/parent-reports/{parent['report_id']}/share").status_code == 200
        assert client.get(urlparse(parent['share_url']).path).status_code == 404
        coverage = client.get('/api/v1/data/coverage').json()['data']
        assert len(coverage['districts']) == 36
        assert client.delete('/api/v1/me').status_code == 200
    return {'matches_total_pune_polytechnic': pune_count, 'matches_total_statewide_polytechnic': matches['total'], 'sample_offerings': ids, 'pune_empty_search_p50_ms': round(statistics.median(timings), 2), 'pune_empty_search_p95_ms': round(sorted(timings)[-1], 2), 'sample_count': len(timings), 'coverage_rows': len(coverage['districts']), 'unknown_location_institutions': coverage['unknown_location_institutions'], 'checks': ['source-linked real offerings', 'confirmed synthetic result', 'ranking', 'cost unknowns retained', 'shortlist persistence', 'share sections', 'immediate revocation', 'workspace deletion', 'empty Pune Polytechnic search explains missing districts']}, coverage


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--postgres', action='store_true')
    args = parser.parse_args()
    settings = Settings(mentor_enabled=False)
    source_path = ROOT / 'data/private/careerquest.db'
    engine = make_engine(settings.database_url)
    result, coverage = validate(engine, settings)
    engine.dispose()
    report = {'sqlite': result, 'database_size_bytes': source_path.stat().st_size, 'scope': 'Local measurements only; no deployed latency claim.'}
    if args.postgres:
        import pgserver
        import psycopg
        from psycopg import sql
        from psycopg.conninfo import conninfo_to_dict, make_conninfo
        import secrets
        from sqlalchemy.engine import URL
        pg = pgserver.get_server(ROOT / 'data/private/validation-pg', cleanup_mode='stop')
        base_url = pg.get_uri()
        database_name = 'cq_full_validation_' + secrets.token_hex(6)
        with psycopg.connect(base_url, autocommit=True) as db:
            db.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(database_name)))
        connection = conninfo_to_dict(base_url)
        connection['dbname'] = database_name
        url = make_conninfo(**connection)
        with psycopg.connect(url) as db:
            if not db.execute("SELECT to_regclass('public.offerings')").fetchone()[0]:
                db.execute((ROOT / 'supabase/migrations/0001_core.sql').read_text(encoding='utf-8'))
                db.execute((ROOT / 'supabase/migrations/0002_rls.sql').read_text(encoding='utf-8'))
                with sqlite3.connect(source_path) as source:
                    for table in Base.metadata.sorted_tables:
                        columns = [c.name for c in table.columns]
                        query = sql.SQL('COPY {} ({}) FROM STDIN').format(sql.Identifier(table.name), sql.SQL(',').join(map(sql.Identifier, columns)))
                        with db.cursor().copy(query) as copier:
                            for row in source.execute(f'SELECT {",".join(chr(34) + c + chr(34) for c in columns)} FROM "{table.name}"'):
                                converted = [bool(v) if v is not None and str(table.c[columns[i]].type) == 'BOOLEAN' else v for i, v in enumerate(row)]
                                copier.write_row(converted)
            size = db.execute('SELECT pg_database_size(current_database())').fetchone()[0]
        params = conninfo_to_dict(url)
        db_url = URL.create('postgresql+psycopg', username=params.get('user', 'postgres'), host=params.get('host', '127.0.0.1'), port=int(params.get('port', 5432)), database=params.get('dbname', 'postgres'))
        engine = make_engine(db_url.render_as_string(hide_password=False))
        pg_result, _ = validate(engine, settings)
        engine.dispose()
        report['postgresql'] = {**pg_result, 'database_size_bytes': size, 'database_size_mb': round(size / 1024 / 1024, 2)}
        with psycopg.connect(base_url, autocommit=True) as db:
            db.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(database_name)))
        pg.cleanup()
    evidence = ROOT / 'docs/evidence'
    evidence.mkdir(exist_ok=True)
    (evidence / 'full_dataset_validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (evidence / 'data_coverage.json').write_text(json.dumps(coverage, indent=2), encoding='utf-8')
    import csv
    folder = ROOT / 'data/coverage'
    folder.mkdir(exist_ok=True)
    with (folder / 'district_coverage.csv').open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(coverage['districts'][0]))
        writer.writeheader()
        writer.writerows(coverage['districts'])
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
