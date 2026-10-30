"""Read-only access to the v11 master, with provenance and uncertainty intact."""
from sqlalchemy import text

SCHEMA = 'cq_master_v11'
PATHWAYS = {'polytechnic_diploma': 'polytechnic', 'iti_trade': 'iti', 'vocational': 'msbsve', 'fyjc_science': 'fyjc', 'fyjc_commerce': 'fyjc', 'fyjc_arts': 'fyjc'}

def _like(value):
    return '%' + value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'

def search(db, pathway=None, districts=None, limit=5, government='any'):
    params = {'pathway': PATHWAYS.get(pathway), 'districts': [d.upper() for d in districts or []], 'limit': min(max(limit, 1), 10), 'government': government}
    rows = db.execute(text(f"""
      SELECT i.institution_id, i.name, i.pathway, i.management, d.name AS district,
             i.city, i.data_status, i.district_method, ident.identifier_value AS institute_code,
             (SELECT 'dump:' || ip.id::text FROM {SCHEMA}.institution_programs ip
               WHERE ip.institution_id=i.institution_id AND ip.data_status='verified'
               ORDER BY ip.academic_year DESC NULLS LAST,ip.id LIMIT 1) AS example_offering_id,
             (SELECT s.url FROM {SCHEMA}.data_provenance dp JOIN {SCHEMA}.source_documents s ON s.source_id=dp.source_id
               WHERE dp.table_name='institutions' AND dp.record_id=i.institution_id AND s.url LIKE 'https://%'
               ORDER BY CASE WHEN dp.field_name='district' THEN 0 ELSE 1 END,dp.id LIMIT 1) AS source_url,
             (SELECT 'dump:' || s.source_id::text FROM {SCHEMA}.data_provenance dp JOIN {SCHEMA}.source_documents s ON s.source_id=dp.source_id
               WHERE dp.table_name='institutions' AND dp.record_id=i.institution_id AND s.url LIKE 'https://%'
               ORDER BY CASE WHEN dp.field_name='district' THEN 0 ELSE 1 END,dp.id LIMIT 1) AS source_id,
             (SELECT array_agg(x.name) FROM (SELECT DISTINCT p.name FROM {SCHEMA}.institution_programs ip
               JOIN {SCHEMA}.programs p ON p.program_id=ip.program_id
               WHERE ip.institution_id=i.institution_id ORDER BY p.name LIMIT 4) x) AS programs
      FROM {SCHEMA}.institutions i
      LEFT JOIN {SCHEMA}.districts d ON d.district_id=i.district_id
      LEFT JOIN {SCHEMA}.institution_identifiers ident ON ident.institution_id=i.institution_id
      WHERE (CAST(:pathway AS text) IS NULL OR i.pathway=CAST(:pathway AS text))
        AND (cardinality(CAST(:districts AS text[]))=0 OR upper(d.name)=ANY(CAST(:districts AS text[])))
        AND i.data_status='verified'
        AND (CAST(:government AS text) <> 'only' OR lower(i.management) IN ('government','government-aided'))
      ORDER BY CASE WHEN CAST(:government AS text)='preferred' AND lower(i.management) IN ('government','government-aided') THEN 0 ELSE 1 END, i.name, i.institution_id LIMIT :limit
    """), params).mappings().all()
    order = 'Government-managed and aided institutions first, based on your saved preference; ties alphabetical.' if government == 'preferred' else 'Alphabetical candidates matching the filters.'
    return {'candidates': [dict(row) for row in rows], 'ordering': order + ' Not a quality ranking; fees and eligibility were not ranked.', 'warnings': ['These are options to investigate, not guaranteed admissions or an objective best college.', 'Fee and hostel information may be incomplete; verify with the institution.']}

def detail(db, offering_id):
    if not offering_id.startswith('dump:') or not offering_id[5:].isdigit():
        return None
    row = db.execute(text(f"""
      SELECT i.institution_id,i.name,i.pathway,i.management,d.name AS district,i.city,i.address,
             i.district_method,i.data_status,ip.academic_year,ip.medium,p.name AS program_name,
             ident.identifier_value AS institute_code
      FROM {SCHEMA}.institution_programs ip JOIN {SCHEMA}.institutions i USING(institution_id)
      JOIN {SCHEMA}.programs p USING(program_id)
      LEFT JOIN {SCHEMA}.districts d ON d.district_id=i.district_id
      LEFT JOIN {SCHEMA}.institution_identifiers ident ON ident.institution_id=i.institution_id
      WHERE ip.id=:id LIMIT 1
    """), {'id': int(offering_id[5:])}).mappings().first()
    if not row:
        return None
    out = dict(row)
    verified_metrics = db.execute(text(f"""SELECT cy.academic_year,cy.round_name,a.category,
        a.reservation_details,a.cutoff_value_raw,v.merit_metric,v.scale_max,v.source_url,v.source_label
        FROM {SCHEMA}.admission_cutoffs a
        JOIN {SCHEMA}.admission_cycles cy ON cy.cycle_id=a.cycle_id
        JOIN public.cq_verified_cutoff_metrics v ON v.master_cutoff_id=a.id
        WHERE a.institution_program_id=:id
        ORDER BY cy.academic_year DESC,cy.round_name,a.category,a.reservation_details"""), {'id': int(offering_id[5:])}).mappings().all()
    out['verified_cutoff_metrics'] = [dict(r) for r in verified_metrics]
    out['addresses'] = []
    out['fee_guidance'] = []
    if row['address']:
        out['addresses'].append({'address': row['address'], 'source_url': None, 'source_label': 'Supplied institution record'})
    reviews = db.execute(text(f"""SELECT entry_type,source,url,author,posted,rating,claim_or_text,status
      FROM {SCHEMA}.institute_review_hostel_harvest
      WHERE lower(inst_name)=lower(:name) ORDER BY entry_type,source LIMIT 10"""), {'name': row['name']}).mappings().all()
    out['reviews_and_hostel_notes'] = [dict(r) for r in reviews]
    if row['pathway'] == 'polytechnic' and row['institute_code']:
        if (row['management'] or '').lower() in {'government', 'government-aided'}:
            guidance = db.execute(text("""SELECT academic_year,applicable_management,tuition_inr,
              development_inr,other_inr,annual_total_inr,refundable_deposit_inr,scope_note,source_url,source_label
              FROM public.cq_fee_guidance WHERE pathway='polytechnic' ORDER BY academic_year DESC""")).mappings().all()
            out['fee_guidance'] = [dict(g) for g in guidance]
        addresses = db.execute(text(f"""SELECT DISTINCT j.dte_address AS address,j.dte_page_url AS source_url
          FROM {SCHEMA}.confirmed_joins_v12 j
          JOIN {SCHEMA}.crosswalk_candidates_v12 x ON x.ffc_code=j.ffc_code AND x.candidate_dte_code=j.dte_code
            AND x.status='JOIN_DUALCODE_OWNING_SOURCE_CONFIRMED'
          WHERE j.dte_code=:code AND j.status='JOIN_DUALCODE_OWNING_SOURCE_CONFIRMED'
            AND j.stream_scope='polytechnic' AND NULLIF(TRIM(j.dte_address),'') IS NOT NULL
          ORDER BY address,source_url"""), {'code': row['institute_code']}).mappings().all()
        out['addresses'].extend({**dict(a), 'source_label': 'DTE record in 2025–26 code supplement'} for a in addresses)
        allotments = db.execute(text(f"""SELECT a.cap_round,a.allotted_seat_type,a.allotted_count,
          a.highest_state_merit_no,a.paired_merit_pct,a.metric_status,p.metric_status AS parse_status,p.url AS source_url
          FROM {SCHEMA}.poly_allotment_by_seat_type a
          LEFT JOIN {SCHEMA}.poly_allotment_pairs p ON p.inst_code=a.inst_code AND p.cap_round=a.cap_round
          WHERE a.institution_program_id=:id AND a.inst_code=:code
          ORDER BY a.cap_round DESC,a.allotted_seat_type LIMIT 15"""), {'id': int(offering_id[5:]), 'code': row['institute_code']}).mappings().all()
        out['allotment_history'] = [dict(r) for r in allotments]
        fees = db.execute(text(f"""SELECT j.ffc_code,j.dte_code,j.stream_scope,j.dte_page_url,j.msbte_source_url,
          j.scope_note,j.fee_applicability,f.academic_year,f.tuition_inr,f.development_inr,f.total_inr,
          f.row_kind,f.q_status,f.image_verified,f.no_revision_carryover,f.corrects,f.superseded_by,o.subject_kind,
          CASE WHEN f.source_file=j.ffc_source_file THEN j.ffc_source_url ELSE NULL END AS ffc_source_url
          FROM {SCHEMA}.confirmed_joins_v12 j
          JOIN {SCHEMA}.crosswalk_candidates_v12 x ON x.ffc_code=j.ffc_code AND x.candidate_dte_code=j.dte_code
            AND x.status='JOIN_DUALCODE_OWNING_SOURCE_CONFIRMED'
          JOIN {SCHEMA}.ffc_fee_rows f ON f.msbte_code=j.ffc_code
          JOIN {SCHEMA}.ffc_orders o USING(source_file)
          WHERE j.dte_code=:code AND j.status='JOIN_DUALCODE_OWNING_SOURCE_CONFIRMED'
            AND j.stream_scope='polytechnic' AND o.subject_kind='polytechnic' AND f.row_kind <> 'adhoc_type'
          ORDER BY f.academic_year DESC NULLS LAST,f.source_file LIMIT 20"""), {'code': row['institute_code']}).mappings().all()
        out['fee_order_history'] = [dict(r) for r in fees]
    else:
        out['fee_order_history'] = []
        out['allotment_history'] = []
    out['warnings'] = ['Fee rows are source-keyed history, not a resolved current fee or necessarily this program’s fee.', 'Only code pairs confirmed in both supplied supplements are used; disagreements are excluded. Roster bindings are from 2025–26.', 'Reviews and hostel claims are attributed reports, not independently verified facts.']
    return out
