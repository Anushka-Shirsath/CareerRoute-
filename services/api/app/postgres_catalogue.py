"""Read supplied catalogue evidence from the restricted PostgreSQL master schema."""
from sqlalchemy import text

SCHEMA = 'cq_master_v11'
FEES = f'''SELECT f.id,f.institution_program_id AS offering_id,f.academic_year,f.fee_type AS kind,
                 f.amount_inr AS amount,f.is_estimate AS estimate,s.url AS source_url,p.field_level_note AS note
          FROM {SCHEMA}.fee_structures f
          LEFT JOIN {SCHEMA}.data_provenance p ON p.table_name='fee_structures' AND p.record_id=f.id
          LEFT JOIN {SCHEMA}.source_documents s ON s.source_id=p.source_id'''


def _rows(db, query, params=None):
    return [dict(row) for row in db.execute(text(query), params or {}).mappings().all()]


def _id(value):
    return int(value[5:]) if value.startswith('dump:') and value[5:].isdigit() else None


def _numbers(row):
    for key in ('amount', 'merit_percent', 'cutoff_percent'):
        if row.get(key) is not None:
            row[key] = float(row[key])
    return row


def available(db):
    return bool(db.execute(text("SELECT to_regclass('cq_master_v11.fee_structures') IS NOT NULL AND to_regclass('cq_master_v11.polytechnic_cap_cutoffs_source') IS NOT NULL")).scalar())


def cutoff_options(db):
    if not available(db):
        return []
    return _rows(db, f'''SELECT DISTINCT academic_year,cap_round AS round,stage_raw AS stage,seat_type_raw AS seat_type
        FROM {SCHEMA}.polytechnic_cap_cutoffs_source WHERE merit_percent BETWEEN 0 AND 100
        AND academic_year IS NOT NULL AND cap_round IS NOT NULL AND stage_raw IS NOT NULL AND seat_type_raw IS NOT NULL
        ORDER BY academic_year DESC,round,stage,seat_type''')


def historical_candidates(db, year, round_name, stage, seat_type, percentage):
    if not available(db):
        return None
    rows = _rows(db, f'''WITH unique_choices AS (
        SELECT choice_code,min(id) AS offering_id,min(institution_id) AS institution_id
        FROM {SCHEMA}.institution_programs WHERE choice_code IS NOT NULL AND choice_code<>''
        GROUP BY choice_code HAVING count(DISTINCT id)=1 AND count(DISTINCT institution_id)=1)
        SELECT p.offering_id,p.institution_id,p.choice_code,c.academic_year,c.cap_round AS round,
            c.stage_raw AS stage,c.seat_type_raw AS seat_type,min(c.reservation_context_raw) AS reservation,
            min(c.merit_percent) AS cutoff_percent,min(s.url) AS source_url
        FROM {SCHEMA}.polytechnic_cap_cutoffs_source c JOIN unique_choices p ON p.choice_code=c.choice_code_raw
        JOIN {SCHEMA}.source_documents s ON s.source_id=c.source_id
        WHERE c.academic_year=:year AND c.cap_round=:round AND c.stage_raw=:stage AND c.seat_type_raw=:seat
          AND c.merit_percent BETWEEN 0 AND 100 AND s.url LIKE 'https://%'
        GROUP BY p.offering_id,p.institution_id,p.choice_code,c.academic_year,c.cap_round,c.stage_raw,c.seat_type_raw
        HAVING count(DISTINCT c.merit_percent)=1 AND count(DISTINCT coalesce(c.reservation_context_raw,''))=1''',
        {'year': year, 'round': round_name, 'stage': stage, 'seat': seat_type})
    return [_numbers(row) for row in rows if row['cutoff_percent'] <= percentage]


def fee_candidates(db, cap):
    if not available(db):
        return {}
    rows = _rows(db, f'''WITH fees AS ({FEES}), latest AS (
        SELECT offering_id,max(academic_year) AS academic_year FROM fees
        WHERE kind='total' AND NOT estimate AND source_url IS NOT NULL GROUP BY offering_id), eligible AS (
        SELECT f.offering_id FROM fees f JOIN latest l USING(offering_id,academic_year)
        WHERE f.kind='total' AND NOT f.estimate AND f.source_url IS NOT NULL
        GROUP BY f.offering_id HAVING min(f.amount)=max(f.amount) AND max(f.amount)<=:cap)
        SELECT p.id,p.institution_id,p.choice_code FROM {SCHEMA}.institution_programs p
        JOIN eligible e ON e.offering_id=p.id WHERE p.choice_code IS NOT NULL AND p.choice_code<>'' ''', {'cap': cap})
    return {'dump:' + str(r['id']): ('dump:' + str(r['institution_id']), r['choice_code']) for r in rows}


def evidence(db, offering_id, institution_id, program_code, include_cutoffs=False):
    offering, institution = _id(offering_id), _id(institution_id)
    result = {'published_fee': None, 'historical_hostel': None, 'possible_cutoffs': []}
    if offering is None or institution is None or not program_code or not available(db):
        return result
    if not db.execute(text(f'''SELECT 1 FROM {SCHEMA}.institution_programs WHERE id=:id AND institution_id=:institution AND choice_code=:code'''), {'id': offering, 'institution': institution, 'code': program_code}).first():
        return result
    fees = _rows(db, f'''WITH fees AS ({FEES}) SELECT academic_year,amount,source_url,note FROM fees
        WHERE offering_id=:id AND kind='total' AND NOT estimate AND source_url IS NOT NULL
        AND academic_year=(SELECT max(academic_year) FROM fees WHERE offering_id=:id AND kind='total' AND NOT estimate AND source_url IS NOT NULL)''', {'id': offering})
    if fees and len({r['amount'] for r in fees}) == 1:
        result['published_fee'] = _numbers(fees[0])
    hostels = _rows(db, f'''SELECT h.boys_capacity,h.girls_capacity,h.data_status,s.url AS source_url FROM {SCHEMA}.hostel_facilities h
        LEFT JOIN {SCHEMA}.data_provenance p ON p.table_name='hostel_facilities' AND p.record_id=h.id
        LEFT JOIN {SCHEMA}.source_documents s ON s.source_id=p.source_id WHERE h.institution_id=:id''', {'id': institution})
    if len(hostels) == 1:
        result['historical_hostel'] = hostels[0]
    if include_cutoffs:
        cutoffs = _rows(db, f'''SELECT c.academic_year,c.cap_round AS round,c.seat_type_raw AS seat_type,c.stage_raw AS stage,
             c.reservation_context_raw AS reservation,c.state_merit_rank AS rank,c.merit_percent,c.choice_code_raw AS choice_code,
             c.join_status,s.url AS source_url FROM {SCHEMA}.institution_programs p
             JOIN {SCHEMA}.polytechnic_cap_cutoffs_source c ON c.choice_code_raw=p.choice_code
             LEFT JOIN {SCHEMA}.source_documents s ON s.source_id=c.source_id
             WHERE p.id=:id AND p.choice_code IS NOT NULL AND p.choice_code<>''
               AND (SELECT count(DISTINCT p2.id) FROM {SCHEMA}.institution_programs p2 WHERE p2.choice_code=p.choice_code)=1
             ORDER BY c.academic_year DESC,c.cap_round,c.seat_type_raw,c.stage_raw''', {'id': offering})
        result['possible_cutoffs'] = [_numbers(row) for row in cutoffs]
    return result
