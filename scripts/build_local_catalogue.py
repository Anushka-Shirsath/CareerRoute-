"""Build a small, read-only local evidence index from a supplied PostgreSQL dump."""
import argparse
import gzip
import os
from pathlib import Path
import re
import sqlite3
import tempfile

TABLES = {'fee_structures', 'hostel_facilities', 'source_documents', 'data_provenance', 'institution_programs', 'polytechnic_cap_cutoffs_source'}


def value(raw):
    if raw == r'\N':
        return None
    return re.sub(r'\\([\\btnrfv])', lambda m: {'\\': '\\', 'b': '\b', 't': '\t', 'n': '\n', 'r': '\r', 'f': '\f', 'v': '\v'}[m.group(1)], raw)


def build(source, output):
    source, output = Path(source), Path(output)
    if output.exists():
        raise ValueError('Refusing to overwrite an existing catalogue index.')
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.catalogue-', dir=output.parent)
    os.close(fd)
    try:
        with sqlite3.connect(temporary) as db:
            db.executescript('''
              CREATE TABLE fee_raw (id INTEGER, offering_id INTEGER, academic_year TEXT, kind TEXT, amount REAL, estimate INTEGER);
              CREATE TABLE hostel_raw (id INTEGER, institution_id INTEGER, available INTEGER, boys_capacity INTEGER, girls_capacity INTEGER, data_status TEXT);
              CREATE TABLE sources (id INTEGER PRIMARY KEY, url TEXT);
              CREATE TABLE provenance (table_name TEXT, record_id INTEGER, source_id INTEGER, note TEXT);
              CREATE TABLE choices (offering_id INTEGER, institution_id INTEGER, choice_code TEXT, academic_year TEXT);
              CREATE TABLE cutoffs (id INTEGER, source_id INTEGER, choice_code TEXT, institute_code TEXT, program_name TEXT, seat_type TEXT, stage TEXT, reservation TEXT, rank INTEGER, merit_percent REAL, academic_year TEXT, round TEXT, join_status TEXT);
            ''')
            columns = {
                'fee_structures': ('fee_raw', ['id','institution_program_id','academic_year','fee_type','amount_inr','is_estimate']),
                'hostel_facilities': ('hostel_raw', ['id','institution_id','available','boys_capacity','girls_capacity','data_status']),
                'source_documents': ('sources', ['source_id','url']),
                'data_provenance': ('provenance', ['table_name','record_id','source_id','field_level_note']),
                'institution_programs': ('choices', ['id','institution_id','choice_code','academic_year']),
                'polytechnic_cap_cutoffs_source': ('cutoffs', ['id','source_id','choice_code_raw','institute_code_raw','program_name_raw','seat_type_raw','stage_raw','reservation_context_raw','state_merit_rank','merit_percent','academic_year','cap_round','join_status']),
            }
            active = None
            seen = set()
            with gzip.open(source, 'rt', encoding='utf-8', newline='') as f:
                for line in f:
                    match = re.match(r'^COPY public\.([a-z_]+) \(([^)]+)\) FROM stdin;', line)
                    if match:
                        name = match.group(1)
                        active = name if name in TABLES else None
                        if active:
                            seen.add(active)
                            names = match.group(2).split(', ')
                            indices = [names.index(c) for c in columns[active][1]]
                            query = 'INSERT INTO ' + columns[active][0] + ' VALUES (' + ','.join('?' for _ in indices) + ')'
                        continue
                    if line.rstrip('\r\n') == r'\.':
                        active = None
                    elif active:
                        row = line.rstrip('\r\n').split('\t')
                        values = [value(row[i]) for i in indices]
                        if active == 'data_provenance' and values[0] not in ('fee_structures', 'hostel_facilities'):
                            continue
                        if active == 'fee_structures':
                            values[-1] = 1 if values[-1] == 't' else 0
                        if active == 'hostel_facilities':
                            values[2] = 1 if values[2] == 't' else 0 if values[2] == 'f' else None
                        db.execute(query, values)
            if not {'fee_structures','hostel_facilities','source_documents','data_provenance'}.issubset(seen):
                raise ValueError('Dump is missing required evidence tables.')
            db.executescript('''
              CREATE INDEX prov_lookup ON provenance(table_name,record_id);
              CREATE TABLE fees AS SELECT f.*,s.url AS source_url,p.note FROM fee_raw f LEFT JOIN provenance p ON p.table_name='fee_structures' AND p.record_id=f.id LEFT JOIN sources s ON s.id=p.source_id;
              CREATE TABLE hostels AS SELECT h.institution_id,h.available,h.boys_capacity,h.girls_capacity,h.data_status,s.url AS source_url FROM hostel_raw h LEFT JOIN provenance p ON p.table_name='hostel_facilities' AND p.record_id=h.id LEFT JOIN sources s ON s.id=p.source_id;
              CREATE INDEX fee_offering ON fees(offering_id,academic_year);
              CREATE INDEX hostel_institution ON hostels(institution_id);
              CREATE INDEX choice_lookup ON choices(offering_id);
              CREATE INDEX choice_code_lookup ON choices(choice_code);
              CREATE INDEX cutoff_choice ON cutoffs(choice_code,academic_year);
              DROP TABLE fee_raw; DROP TABLE hostel_raw; DROP TABLE provenance;
            ''')
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Local index failed integrity check.')
        os.link(temporary, output)
    finally:
        os.unlink(temporary)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dump', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    build(args.dump, args.output)
