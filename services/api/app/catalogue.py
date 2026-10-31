import base64
import hashlib
import json
import re
from sqlalchemy import case, func, literal, or_, select
from .models import AdmissionCycle, Cutoff, Fee, ImportRun, Institution, Offering, Source
from .errors import Problem
from .domain.matching import ranked_search
from .domain.costs import cost_split
from . import local_catalogue

DISTRICTS = ['Ahilyanagar', 'Akola', 'Amravati', 'Chhatrapati Sambhajinagar', 'Beed', 'Bhandara', 'Buldhana', 'Chandrapur', 'Dhule', 'Gadchiroli', 'Gondia', 'Hingoli', 'Jalgaon', 'Jalna', 'Kolhapur', 'Latur', 'Mumbai City', 'Mumbai Suburban', 'Nagpur', 'Nanded', 'Nandurbar', 'Nashik', 'Dharashiv', 'Palghar', 'Parbhani', 'Pune', 'Raigad', 'Ratnagiri', 'Sangli', 'Satara', 'Sindhudurg', 'Solapur', 'Thane', 'Wardha', 'Washim', 'Yavatmal']
DISTRICT_ALIASES = {'ahmednagar': 'Ahilyanagar', 'aurangabad': 'Chhatrapati Sambhajinagar', 'osmanabad': 'Dharashiv', 'mumbai': 'Mumbai City', 'mumbai suburban': 'Mumbai Suburban', 'buldana': 'Buldhana', 'gondiya': 'Gondia', 'raigarh': 'Raigad'}


def district_name(value):
    if not value:
        return None
    return DISTRICT_ALIASES.get(value.casefold(), next((d for d in DISTRICTS if d.casefold() == value.casefold()), None))


def fact(value, source_id, year, status='official_source', unit=None):
    return {'value': value, 'status': status if value is not None and source_id and year else 'unknown', 'source_id': source_id, 'academic_year': year, **({'unit': unit} if unit else {})}


def cutoff_rows(db, ids, year=None):
    if not ids:
        return {}
    query = select(Cutoff, AdmissionCycle).outerjoin(AdmissionCycle, AdmissionCycle.id == Cutoff.cycle_id).where(Cutoff.offering_id.in_(ids))
    if year:
        query = query.where(Cutoff.academic_year == year)
    result = {}
    for c, cycle in db.execute(query):
        result.setdefault(c.offering_id, []).append({'id': c.id, 'academic_year': c.academic_year, **(cycle.data if cycle else {}), **c.data})
    return result


def applicable_fees(fees, category=None):
    selected = [f for f in fees if f.get('applies_to_category', 'all') in {'all', category}]
    specific = {(f['kind'], f['academic_year']) for f in selected if category and f.get('applies_to_category') == category}
    return [f for f in selected if not ((f['kind'], f['academic_year']) in specific and f.get('applies_to_category', 'all') == 'all')]


def offering_facts(o, i, fees=None, cutoffs=None, cutoff_count=0, category=None):
    year = o.academic_year
    sid = o.data.get('source_id')
    fee_rows = [f for f in applicable_fees(fees or [], category) if f['academic_year'] == year]
    tuition_rows = [f for f in fee_rows if f['kind'] == 'tuition' and f.get('status') in {'official_source', 'institution_source'} and f.get('source_id') and f.get('amount_inr') is not None and (f['amount_inr'] > 0 or f.get('officially_free_note'))]
    tuition_values = {f['amount_inr'] * (2 if f.get('per') == 'semester' else 1) for f in tuition_rows}
    tuition = next(iter(tuition_values)) if len(tuition_values) == 1 else None
    return {'id': o.id, 'institution_id': i.id, 'name': i.name, 'district': i.district, 'city': i.data.get('city'), 'management': i.management, 'pathway_id': o.pathway_id, 'academic_year': year, 'program_name': o.data['program_name'], 'program_code': o.data.get('program_code'), 'medium': o.data.get('medium'), 'intake': o.data.get('intake'), 'hostel_status': o.data.get('hostel_status', 'unknown'), 'tuition': tuition, 'fees': fees or [], 'cutoffs': cutoffs or [], 'cutoff_count': cutoff_count, 'eligibility_rules': o.data.get('eligibility_rules'), 'source_id': sid, 'is_synthetic': o.data.get('is_synthetic', False), 'verified_fields': {'name': fact(i.name, i.data.get('source_id'), year), 'program_name': fact(o.data['program_name'], sid, year), 'district': fact(i.district, i.data.get('district_source_id') or i.data.get('source_id'), year), 'management': fact(None if i.management == 'unknown' else i.management, i.data.get('source_id'), year), 'medium': fact(o.data.get('medium'), sid, year), 'intake': fact(o.data.get('intake'), sid, year), 'hostel': fact(None if o.data.get('hostel_status', 'unknown') == 'unknown' else o.data['hostel_status'], sid, year), 'tuition': fact(tuition, tuition_rows[0]['source_id'] if tuition_rows else None, year, unit='INR_per_year')}}


def public_query():
    return select(Offering, Institution).join(Institution).where(Offering.publish_state == 'published', Institution.publish_state == 'published')


def directory_search(query, phrase):
    """Match all meaningful words across the institution, location and program."""
    words = re.findall(r'[^\W_]+', phrase.casefold(), flags=re.UNICODE)[:12]
    meaningful = [word for word in words if word not in {'college', 'colleges', 'in', 'of', 'the'}]
    score = literal(0)
    for word in meaningful or words:
        pattern = '%' + word.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        matches = [Institution.name.ilike(pattern, escape='\\'),
                   Institution.district.ilike(pattern, escape='\\'),
                   Institution.data['city'].as_string().ilike(pattern, escape='\\'),
                   Offering.data['program_name'].as_string().ilike(pattern, escape='\\')]
        if word in {'govt', 'government'}:
            matches.append(Institution.management.in_(['government', 'government_aided']))
        score += case((Institution.name.ilike(pattern, escape='\\'), 1), else_=0)
        query = query.where(or_(*matches))
    return query, score


def get_offering(db, offering_id, include_cutoffs=True, category=None):
    row = db.execute(public_query().where(Offering.id == offering_id)).first()
    if not row:
        raise Problem('NOT_FOUND', 'Published offering not found.', 404)
    o, i = row
    fees = [f.data for f in db.scalars(select(Fee).where(Fee.offering_id == o.id))]
    records = cutoff_rows(db, [o.id]).get(o.id, []) if include_cutoffs else []
    facts = offering_facts(o, i, fees, records, len(records), category)
    facts.update(local_catalogue.evidence(o.id, i.id, o.data.get('program_code'), include_cutoffs=include_cutoffs, session=db))
    facts['course_management_type'] = o.data.get('course_management_type')
    facts['approval_status'] = o.data.get('approval_status')
    facts['verified_fields']['course_management_type'] = fact(o.data.get('course_management_type'), o.data.get('source_id'), o.academic_year)
    facts['verified_fields']['approval_status'] = fact(o.data.get('approval_status'), None, o.academic_year)
    ids = {o.data.get('source_id'), i.data.get('source_id'), i.data.get('district_source_id')} | {r.get('source_id') for r in records} | {f.get('source_id') for f in fees}
    facts['sources'] = [{'source_id': s.id, **s.data} for s in db.scalars(select(Source).where(Source.id.in_([x for x in ids if x])))]
    facts['warnings'] = ['Fee not verified'] if facts['tuition'] is None else []
    if not o.academic_year:
        facts['warnings'].append('Academic year not provided by the source; directory information only.')
    if any(r.get('merit_metric') in {None, 'not_stated_by_source'} for r in records):
        facts['warnings'].append('Historical numeric values have an unspecified metric and must not be treated as percentage cutoffs.')
    return facts


def search(db, workspace, preferences, academic, category, context=None, limit=20, cursor=None, save=True):
    profile = workspace.singleton('profile')
    query = public_query().where(Offering.academic_year.is_not(None))
    if preferences.get('pathway'):
        query = query.where(Offering.pathway_id == preferences['pathway'])
    districts = preferences.get('target_districts', [])
    if districts:
        canonical = [district_name(d) or d for d in districts]
        query = query.where(func.lower(Institution.district).in_([d.casefold() for d in canonical]))
        preferences = {**preferences, 'target_districts': canonical}
    if preferences.get('government') == 'only':
        query = query.where(Institution.management.in_(['government', 'government_aided']))
    # Matching in an explicit admission year only ranks offerings in that year.
    if context:
        query = query.where(Offering.academic_year == context['academic_year'])
    candidates = list(db.execute(query))
    ids = [o.id for o, _ in candidates]
    fee_map, record_map, count_map = {}, {}, {}
    # Small batches fit SQLite's and Postgres' parameter budgets.
    for start in range(0, len(ids), 500):
        batch = ids[start:start + 500]
        for f in db.scalars(select(Fee).where(Fee.offering_id.in_(batch))):
            fee_map.setdefault(f.offering_id, []).append(f.data)
        count_map.update(dict(db.execute(select(Cutoff.offering_id, func.count()).where(Cutoff.offering_id.in_(batch)).group_by(Cutoff.offering_id)).all()))
        if context:
            record_map.update(cutoff_rows(db, batch))
    facts = [offering_facts(o, i, fee_map.get(o.id), record_map.get(o.id), count_map.get(o.id, 0), category) for o, i in candidates]
    result = ranked_search(facts, profile, preferences, academic, category, context)
    versions = list(db.execute(select(ImportRun.id, ImportRun.status).order_by(ImportRun.id)).all())
    fingerprint = hashlib.sha256(json.dumps([preferences, context, academic, category, versions], sort_keys=True, default=list).encode()).hexdigest()[:24]
    offset = 0
    if cursor:
        try:
            decoded = json.loads(base64.urlsafe_b64decode(cursor).decode())
            offset = decoded['offset']
            if decoded['fingerprint'] != fingerprint or not isinstance(offset, int) or offset < 0:
                raise ValueError()
        except Exception:
            raise Problem('VALIDATION_FAILED', 'Cursor is invalid or search inputs changed. Start a new search.') from None
    all_results = result['results']
    page = all_results[offset:offset + limit]
    page_ids = {r['offering_id'] for r in page}
    result['groups'] = {k: [r for r in v if r['offering_id'] in page_ids] for k, v in result['groups'].items()}
    result['results'] = page
    result['total'] = len(all_results)
    result['next_cursor'] = base64.urlsafe_b64encode(json.dumps({'offset': offset + limit, 'fingerprint': fingerprint}).encode()).decode() if offset + limit < len(all_results) else None
    result['preferences'] = preferences
    source_ids = {r['facts'].get('source_id') for r in page if r['facts'].get('source_id')}
    result['sources'] = [{'source_id': s.id, **s.data} for s in db.scalars(select(Source).where(Source.id.in_(source_ids)))]
    result['warnings'] = ['Offerings without a sourced academic year are directory-only and excluded from personal matching.']
    if not result['total'] and districts:
        unlocated = db.scalar(select(func.count()).select_from(Offering).join(Institution).where(Offering.publish_state == 'published', Institution.publish_state == 'published', Institution.district.is_(None), Offering.pathway_id == preferences.get('pathway')))
        if unlocated:
            result['warnings'].append(f'{unlocated} published offerings on this pathway have no verified district. Browse without the district filter to inspect them.')
    if save:
        workspace.save('last_search', {'preferences': preferences, 'admission_context': context, 'offering_ids': [r['offering_id'] for r in page]})
    return result


def costs_for(db, offering_id, year, assumptions, category=None):
    facts = get_offering(db, offering_id, include_cutoffs=False)
    fees = applicable_fees(facts['fees'], category)
    return {'offering_id': offering_id, 'institution_name': facts['name'], **cost_split(fees, year, assumptions)}


def coverage(db):
    runs = list(db.scalars(select(ImportRun).where(ImportRun.status == 'published')))
    counts = {d: {'district': d, 'poly_institutes': None, 'poly_offerings': None, 'iti_institutes': None, 'fyjc_colleges': None, 'fyjc_offerings': None, 'poly_cutoff_years': [], 'fyjc_cutoff_years': [], 'poly_fee_verified_pct': None, 'hostel_known_pct': None, 'layer': 'depth' if d in {'Pune', 'Nashik'} else 'breadth', 'last_refreshed': max((r.data.get('published_at', '') for r in runs), default=None)} for d in DISTRICTS}
    unknown_location = 0
    for district, pathway, count in db.execute(select(Institution.district, Institution.pathway, func.count()).where(Institution.publish_state == 'published').group_by(Institution.district, Institution.pathway)):
        canonical = district_name(district)
        if not canonical:
            unknown_location += count
            continue
        field = {'polytechnic': 'poly_institutes', 'iti': 'iti_institutes', 'fyjc': 'fyjc_colleges'}.get(pathway)
        if field:
            counts[canonical][field] = (counts[canonical][field] or 0) + count
    for district, route, count in db.execute(select(Institution.district, Offering.pathway_id, func.count()).join(Offering, Offering.institution_id == Institution.id).where(Institution.publish_state == 'published', Offering.publish_state == 'published').group_by(Institution.district, Offering.pathway_id)):
        canonical = district_name(district)
        if canonical and (route == 'polytechnic_diploma' or route.startswith('fyjc_')):
            field = 'poly_offerings' if route == 'polytechnic_diploma' else 'fyjc_offerings'
            counts[canonical][field] = (counts[canonical][field] or 0) + count
    years_query = select(Institution.district, Offering.pathway_id, Cutoff.academic_year).join(Offering, Offering.institution_id == Institution.id).join(Cutoff, Cutoff.offering_id == Offering.id).where(Institution.publish_state == 'published', Offering.publish_state == 'published').distinct()
    for district, route, year in db.execute(years_query):
        canonical = district_name(district)
        if canonical:
            field = 'poly_cutoff_years' if route == 'polytechnic_diploma' else 'fyjc_cutoff_years'
            if year not in counts[canonical][field]:
                counts[canonical][field].append(year)
    return {'districts': list(counts.values()), 'unknown_location_institutions': unknown_location, 'imports': [{'id': r.id, **r.data} for r in runs], 'note': 'Coverage reflects the supplied database, with unresolved records withheld. No institutional fees or hostels are verified in the supplied dump. Historical FYJC records have unspecified merit metrics; personal cutoff comparison is disabled for these records.'}
