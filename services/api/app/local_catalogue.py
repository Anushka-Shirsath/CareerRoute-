"""Optional read-only local evidence from the supplied v12 catalogue."""
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def _db():
    path = _path()
    if not path or not Path(path).is_file():
        yield None
        return
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    try:
        db.row_factory = sqlite3.Row
        yield db
    finally:
        db.close()


def _path():
    return os.environ.get('CQ_LOCAL_CATALOGUE', str(Path(__file__).resolve().parents[3] / 'data/private/supplied-catalogue.db'))


def _postgres(session):
    return session is not None and session.info.get('evidence_backend') == 'postgres'


def available(session=None):
    if _postgres(session):
        from . import postgres_catalogue
        return postgres_catalogue.available(session)
    return Path(_path()).is_file()


def cutoff_options(session=None):
    if _postgres(session):
        from . import postgres_catalogue
        return postgres_catalogue.cutoff_options(session)
    with _db() as db:
        if db is None:
            return []
        rows = db.execute('''SELECT DISTINCT academic_year,round,stage,seat_type FROM cutoffs
            WHERE merit_percent BETWEEN 0 AND 100 AND academic_year IS NOT NULL
              AND round IS NOT NULL AND stage IS NOT NULL AND seat_type IS NOT NULL
            ORDER BY academic_year DESC,round,stage,seat_type''')
        return [dict(row) for row in rows]


def historical_candidates(year, round_name, stage, seat_type, percentage, session=None):
    if _postgres(session):
        from . import postgres_catalogue
        return postgres_catalogue.historical_candidates(session, year, round_name, stage, seat_type, percentage)
    with _db() as db:
        if db is None:
            return None
        rows = db.execute('''WITH unique_choices AS (
                SELECT choice_code, min(offering_id) AS offering_id, min(institution_id) AS institution_id
                FROM choices WHERE choice_code IS NOT NULL AND choice_code<>''
                GROUP BY choice_code HAVING count(DISTINCT offering_id)=1 AND count(DISTINCT institution_id)=1
            )
            SELECT p.offering_id,p.institution_id,p.choice_code,c.academic_year,c.round,c.stage,c.seat_type,
                   min(c.reservation) AS reservation,min(c.merit_percent) AS cutoff_percent,min(s.url) AS source_url
            FROM cutoffs c JOIN unique_choices p ON p.choice_code=c.choice_code
            JOIN sources s ON s.id=c.source_id
            WHERE c.academic_year=? AND c.round=? AND c.stage=? AND c.seat_type=?
              AND c.merit_percent BETWEEN 0 AND 100 AND s.url LIKE 'https://%'
            GROUP BY p.offering_id,p.institution_id,p.choice_code,c.academic_year,c.round,c.stage,c.seat_type
            HAVING count(DISTINCT c.merit_percent)=1 AND count(DISTINCT coalesce(c.reservation,''))=1''',
            (year, round_name, stage, seat_type)).fetchall()
        return [dict(row) for row in rows if row['cutoff_percent'] <= percentage]


def _id(value):
    return int(value[5:]) if value.startswith('dump:') and value[5:].isdigit() else None


def fee_candidates(cap, session=None):
    if _postgres(session):
        from . import postgres_catalogue
        return postgres_catalogue.fee_candidates(session, cap)
    with _db() as db:
        if db is None:
            return {}
        rows = db.execute('''SELECT f.offering_id FROM fees f
            WHERE f.kind='total' AND f.estimate=0 AND f.source_url IS NOT NULL
              AND f.academic_year=(SELECT max(g.academic_year) FROM fees g WHERE g.offering_id=f.offering_id AND g.kind='total' AND g.estimate=0 AND g.source_url IS NOT NULL)
            GROUP BY f.offering_id HAVING min(f.amount)=max(f.amount) AND max(f.amount)<=?''', (cap,))
        ids = [row[0] for row in rows]
        result = {}
        for ident in ids:
            choices = db.execute('SELECT institution_id,choice_code FROM choices WHERE offering_id=? AND choice_code IS NOT NULL AND choice_code<>\'\'', (ident,)).fetchall()
            if len(choices) == 1:
                result['dump:' + str(ident)] = ('dump:' + str(choices[0][0]), choices[0][1])
        return result


def evidence(offering_id, institution_id, program_code, include_cutoffs=False, session=None):
    if _postgres(session):
        from . import postgres_catalogue
        return postgres_catalogue.evidence(session, offering_id, institution_id, program_code, include_cutoffs)
    offering, institution = _id(offering_id), _id(institution_id)
    result = {'published_fee': None, 'historical_hostel': None, 'possible_cutoffs': []}
    with _db() as db:
        if db is None:
            return result
        if offering is None or institution is None or not program_code or not db.execute('SELECT 1 FROM choices WHERE offering_id=? AND institution_id=? AND choice_code=?', (offering, institution, program_code)).fetchone():
            return result
        if offering is not None:
            rows = db.execute('''SELECT academic_year,amount,source_url,note FROM fees
                WHERE offering_id=? AND kind='total' AND estimate=0 AND source_url IS NOT NULL
                AND academic_year=(SELECT max(academic_year) FROM fees WHERE offering_id=? AND kind='total' AND estimate=0 AND source_url IS NOT NULL)''', (offering, offering)).fetchall()
            if rows and len({r['amount'] for r in rows}) == 1:
                result['published_fee'] = dict(rows[0])
        if institution is not None:
            rows = db.execute('SELECT boys_capacity,girls_capacity,data_status,source_url FROM hostels WHERE institution_id=?', (institution,)).fetchall()
            if len(rows) == 1:
                result['historical_hostel'] = dict(rows[0])
        if include_cutoffs and offering is not None:
            rows = db.execute('''SELECT c.academic_year,c.round,c.seat_type,c.stage,c.reservation,
                    c.rank,c.merit_percent,c.choice_code,c.join_status,s.url AS source_url
                FROM choices p JOIN cutoffs c ON c.choice_code=p.choice_code
                LEFT JOIN sources s ON s.id=c.source_id
                WHERE p.offering_id=? AND p.choice_code IS NOT NULL AND p.choice_code<>''
                  AND (SELECT count(DISTINCT p2.offering_id) FROM choices p2 WHERE p2.choice_code=p.choice_code)=1
                ORDER BY c.academic_year DESC,c.round,c.seat_type,c.stage''', (offering,)).fetchall()
            result['possible_cutoffs'] = [dict(row) for row in rows]
    return result
