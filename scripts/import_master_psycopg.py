"""Atomically restore the v11 master into the existing project's private schema.

Uses psycopg's TLS support and COPY protocol. The existing guest workspace tables
are not modified. Run only after the verified legacy cutoff table is backed up.
"""
import csv
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
from dotenv import dotenv_values
import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url

ROOT=Path(__file__).resolve().parents[1]
DOWNLOADS=Path.home() / 'Downloads'
DUMP=DOWNLOADS / 'careerquest_dump_v11_1_20261030.sql.gz'
SCHEMA='cq_master_v11'
EXPECTED={'admission_cutoffs':633501,'admission_cycles':33,'build_meta':7,'classification_meanings':4,'coverage_stats':162,'crosswalk_candidates':957,'data_provenance':728043,'districts':37,'extraction_jobs':9,'extraction_errors':0,'fee_structures':0,'ffc_fee_rows':1646,'ffc_orders':40,'hostel_facilities':0,'institute_review_hostel_harvest':29,'institution_identifiers':16487,'institution_programs':55060,'institutions':16487,'poly_allotment_by_candidate_category':240707,'poly_allotment_by_seat_type':191778,'poly_allotment_pairs':1796,'programs':803,'scholarship_schemes':55,'seat_matrices':273444,'source_documents':469,'verification_queue':3712,'crosswalk_candidates_v12':957,'confirmed_joins_v12':70}

def main():
    config=dotenv_values(ROOT / '.env')
    local='--local-test' in sys.argv
    value=os.environ.get('MASTER_DATABASE_URL') if local else config['ADMIN_DATABASE_URL']
    url=make_url(value)
    if not local and (not url.host or not url.host.endswith('.pooler.supabase.com') or url.port != 5432):
        raise SystemExit('Expected a Supabase session pooler connection.')
    digest=hashlib.sha256()
    with DUMP.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): digest.update(chunk)
    if digest.hexdigest() != 'eecbc93d91c0146988c6b0ff265cb8569539f5385f0f235ef730a43e8e7342fa':
        raise SystemExit('Dump checksum mismatch.')
    with (DOWNLOADS/'crosswalk_candidates_v12_20261030.csv').open(encoding='utf-8-sig',newline='') as f: crosswalk=list(csv.DictReader(f))
    with (DOWNLOADS/'confirmed_joins_v12_20261030.jsonl').open(encoding='utf8') as f: joins=[json.loads(line) for line in f if line.strip()]
    if len(crosswalk)!=957 or len(joins)!=70 or sum(r.get('status')=='JOIN_DUALCODE_OWNING_SOURCE_CONFIRMED' for r in crosswalk)!=70:
        raise SystemExit('Supplement verification failed.')
    pgurl=url.set(drivername='postgresql').render_as_string(hide_password=False)
    with psycopg.connect(pgurl) as conn:
        if conn.execute("select to_regnamespace(%s) is not null, to_regclass('public.cutoffs') is not null",(SCHEMA,)).fetchone() != (False,False):
            raise SystemExit('Master schema exists or legacy cutoff table has not been removed; no changes made.')
        conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(SCHEMA)))
        conn.execute(sql.SQL('REVOKE ALL ON SCHEMA {} FROM PUBLIC').format(sql.Identifier(SCHEMA)))
        buffer=[]; in_copy=False; copy_context=None; copy=None; chunks=[]; chunk_bytes=0
        with gzip.open(DUMP,'rt',encoding='utf8',newline='') as source:
            for line in source:
                if in_copy:
                    if line.strip()==r'\.':
                        if chunks: copy.write(''.join(chunks).encode('utf8'))
                        copy_context.__exit__(None,None,None); copy_context=None; copy=None; chunks=[]; chunk_bytes=0; in_copy=False
                    else:
                        chunks.append(line); chunk_bytes+=len(line)
                        if chunk_bytes>=1024*1024:
                            copy.write(''.join(chunks).encode('utf8')); chunks=[]; chunk_bytes=0
                    continue
                if line.startswith('--') or not line.strip(): continue
                if line.startswith('\\restrict ') or line.startswith('\\unrestrict '): continue
                if line.startswith('\\'): raise ValueError('Unexpected psql command in dump.')
                if line.startswith('CREATE UNIQUE INDEX uq_provenance_field '): continue
                line=line.replace('public.',SCHEMA+'.')
                if line.startswith('SET client_encoding ='): line="SET client_encoding = 'UTF8';\n"
                if line.startswith('COPY '):
                    if buffer: raise ValueError('Unexpected buffered SQL before COPY.')
                    copy_context=conn.cursor().copy(line.strip())
                    copy=copy_context.__enter__(); in_copy=True
                    continue
                buffer.append(line)
                if line.rstrip().endswith(';'):
                    conn.execute(''.join(buffer)); buffer=[]
        if in_copy or buffer: raise ValueError('Dump ended mid-statement.')
        def supplement(name, rows, cols):
            conn.execute(sql.SQL('CREATE TABLE {}.{} ({})').format(sql.Identifier(SCHEMA),sql.Identifier(name),sql.SQL(',').join(sql.SQL('{} text').format(sql.Identifier(c)) for c in cols)))
            data=io.StringIO(newline=''); writer=csv.DictWriter(data,fieldnames=cols,extrasaction='ignore'); writer.writeheader(); writer.writerows(rows)
            with conn.cursor().copy(sql.SQL('COPY {}.{} ({}) FROM STDIN WITH (FORMAT csv, HEADER true)').format(sql.Identifier(SCHEMA),sql.Identifier(name),sql.SQL(',').join(map(sql.Identifier,cols)))) as target:
                target.write(data.getvalue().encode('utf8'))
        supplement('crosswalk_candidates_v12',crosswalk,list(crosswalk[0]))
        supplement('confirmed_joins_v12',joins,list(dict.fromkeys(k for r in joins for k in r)))
        for table,count in EXPECTED.items():
            actual=conn.execute(sql.SQL('SELECT count(*) FROM {}.{}').format(sql.Identifier(SCHEMA),sql.Identifier(table))).fetchone()[0]
            if actual != count: raise ValueError(f'{table}: expected {count}, received {actual}')
        conn.execute(sql.SQL('GRANT USAGE ON SCHEMA {} TO cq_public,cq_student').format(sql.Identifier(SCHEMA)))
        conn.execute(sql.SQL('GRANT SELECT ON ALL TABLES IN SCHEMA {} TO cq_public,cq_student').format(sql.Identifier(SCHEMA)))
        tables=conn.execute("SELECT tablename FROM pg_tables WHERE schemaname=%s",(SCHEMA,)).fetchall()
        for (table,) in tables:
            identifier=sql.SQL('{}.{}').format(sql.Identifier(SCHEMA),sql.Identifier(table))
            conn.execute(sql.SQL('ALTER TABLE {} ENABLE ROW LEVEL SECURITY').format(identifier))
            conn.execute(sql.SQL('ALTER TABLE {} FORCE ROW LEVEL SECURITY').format(identifier))
            conn.execute(sql.SQL('CREATE POLICY master_reader ON {} FOR SELECT TO cq_public,cq_student USING (true)').format(identifier))
        conn.execute(f"""CREATE VIEW public.cutoffs WITH (security_invoker=true) AS
          SELECT 'dump:' || c.id::text AS id,'dump:' || c.institution_program_id::text AS offering_id,
          cy.data->>'academic_year' AS academic_year,'dump:' || c.cycle_id::text AS cycle_id,
          json_build_object('category',c.category,'quota',NULL,'reservation_details',c.reservation_details,
            'raw_value',c.cutoff_value_raw,'numeric_value',c.cutoff_value_num,'merit_metric',c.measurement_type,
            'scale',c.scale,'extra_dimensions','{{}}'::json) AS data
          FROM {SCHEMA}.admission_cutoffs c JOIN public.admission_cycles cy ON cy.id='dump:' || c.cycle_id::text
          JOIN public.offerings o ON o.id='dump:' || c.institution_program_id::text""")
        conn.execute('GRANT SELECT ON public.cutoffs TO cq_public,cq_student')
    print('Master and supplements restored atomically; all table counts verified.',flush=True)

if __name__=='__main__': main()
