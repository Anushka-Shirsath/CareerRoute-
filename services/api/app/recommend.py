"""Marks-based college suggestions from historical FYJC and Polytechnic cutoffs.

Reads public.cq_cutoff_summary (migration 0010), which holds one row per program,
category and latest year with first-round and closing cutoffs as percentages.
FYJC values come from merit marks out of 500; Polytechnic values are CAP merit percentages.
"""
import re
from sqlalchemy import text
from .catalogue import district_name

PATHWAYS = ('fyjc_science', 'fyjc_commerce', 'fyjc_arts', 'polytechnic_diploma')
CATEGORIES = {'GENERAL', 'OBC', 'SC', 'ST', 'SEBC', 'EWS', 'VJA', 'NTA', 'NTB', 'NTC', 'NTD', 'SBC'}
ALIASES = {'OPEN': 'GENERAL', 'GEN': 'GENERAL', 'VJ': 'VJA', 'DTA': 'VJA', 'VJNT': 'VJA'}
REACH_MARGIN = 5
# The master records both Mumbai districts under one combined label.
MASTER_DISTRICTS = {'Mumbai City': 'MUMBAI CITY/SUBURBAN', 'Mumbai Suburban': 'MUMBAI CITY/SUBURBAN'}

SQL = '''SELECT offering_id, pathway_id, name, program_name, district, management, academic_year,
       first_round_percent, closing_percent, rounds, source_url
FROM public.cq_cutoff_summary
WHERE category=:category AND closing_percent <= :ceiling
  AND (CAST(:pathway AS text) IS NULL OR pathway_id=CAST(:pathway AS text))
  AND (cardinality(CAST(:districts AS text[]))=0 OR district=ANY(CAST(:districts AS text[])))
ORDER BY closing_percent DESC, name, offering_id
LIMIT 2000'''


def normalize_category(value):
    key = re.sub(r'[^A-Z]', '', (value or '').upper())
    key = ALIASES.get(key, key)
    return (key, True) if key in CATEGORIES else ('GENERAL', False)


def band(percent, first_round, closing):
    if percent >= first_round:
        return 'safe'
    if percent >= closing:
        return 'possible'
    return 'reach'


def recommend(db, percent, pathway=None, districts=None, category=None, limit=20):
    """Group colleges into safe, possible and reach by comparing a percentage with past cutoffs."""
    if pathway not in PATHWAYS:
        pathway = None
    category, category_known = normalize_category(category)
    # Master district names are upper case, e.g. PUNE or MUMBAI CITY/SUBURBAN.
    names = [district_name(d.strip()) or d.strip() for d in districts or []]
    params = {'category': category, 'ceiling': percent + REACH_MARGIN, 'pathway': pathway, 'districts': sorted({MASTER_DISTRICTS.get(d, d.upper()) for d in names})}
    rows = db.execute(text(SQL), params).mappings().all()
    # Only link to offerings the website publishes.
    ids = [r['offering_id'] for r in rows]
    published = set()
    for start in range(0, len(ids), 500):
        published.update(db.execute(text("SELECT id FROM public.offerings WHERE publish_state='published' AND id = ANY(CAST(:ids AS text[]))"), {'ids': ids[start:start + 500]}).scalars())
    groups = {'safe': [], 'possible': [], 'reach': []}
    for r in rows:
        first, closing = float(r['first_round_percent']), float(r['closing_percent'])
        item = {**dict(r), 'first_round_percent': first, 'closing_percent': closing, 'district': (r['district'] or '').title() or None, 'linkable': r['offering_id'] in published, 'difference': round(percent - closing, 2), 'scale': 'FYJC merit marks out of 500, shown as a percentage' if r['pathway_id'] != 'polytechnic_diploma' else 'Polytechnic CAP merit percentage'}
        groups[band(percent, first, closing)].append(item)
    # Strongest options first in safe and possible; nearest misses first in reach.
    groups['reach'].sort(key=lambda x: (x['closing_percent'], x['name'].casefold()))
    return {
        'percent': percent,
        'category_used': category if category_known else 'GENERAL (default)',
        'pathway_id': pathway,
        'districts': districts or [],
        'counts': {k: len(v) for k, v in groups.items()},
        'counts_capped': len(rows) == 2000,
        'groups': {k: v[:limit] for k, v in groups.items()},
        'how_to_read': 'Safe: your percentage is at or above the first-round cutoff. Possible: between the first-round and final-round (closing) cutoffs. Reach: up to 5 points below the closing cutoff. Uses the latest year with records for each college.',
        'notice': 'Historical cutoffs from past admission rounds. They change every year and are not a guarantee or prediction of admission.',
    }
