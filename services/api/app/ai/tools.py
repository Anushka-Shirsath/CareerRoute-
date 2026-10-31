import json
import re
from datetime import datetime, timedelta, timezone
from ..guides import guide
from ..schemas import Preferences
from ..schemas import GoalInput
from ..models import now
from ..errors import Problem
from .guard import sanitize
from sqlalchemy import text
from .. import master_catalogue, recommend

TOOL_PARAMETERS = {
    'get_my_academic_summary': {}, 'get_my_result_context': {}, 'get_my_compass_report': {}, 'get_my_preferences': {}, 'get_my_shortlist': {}, 'get_my_last_search': {},
    'search_colleges': {'pathway_id': {'type': 'string', 'enum': ['fyjc_science', 'fyjc_commerce', 'fyjc_arts', 'polytechnic_diploma', 'iti_trade', 'vocational']}, 'districts': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 5}},
    'get_offering_facts': {'offering_id': {'type': 'string', 'maxLength': 100}},
    'recommend_colleges_by_marks': {'percent': {'type': 'number', 'minimum': 0, 'maximum': 100}, 'pathway_id': {'type': 'string', 'enum': list(recommend.PATHWAYS)}, 'districts': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 5}},
    'list_database_tables': {},
    'query_database': {'sql': {'type': 'string', 'maxLength': 4000}},
    'get_admission_guide': {'pathway_id': {'type': 'string'}},
    'save_my_preference': {'field': {'type': 'string', 'enum': ['target_districts', 'tuition_cap_inr', 'government', 'hostel', 'medium', 'active_goal_pathway']}, 'value': {}, 'student_confirmed': {'type': 'boolean'}},
}
DESCRIPTIONS = {'get_my_academic_summary': 'Confirmed marks only, never drafts.', 'get_my_compass_report': 'Exploratory route report; readiness is separate.', 'get_my_preferences': 'Saved budget, districts, importance weights and goal.', 'get_my_shortlist': 'Saved offerings and student-reported statuses.', 'search_colleges': 'Up to five example colleges for a pathway and district. Not for counting.', 'get_offering_facts': 'Published source facts for one offering.', 'get_admission_guide': 'Official portal and preparation steps; dates may be unverified.'}
DESCRIPTIONS['recommend_colleges_by_marks'] = 'Safe, possible and reach colleges from past FYJC and Polytechnic cutoffs. Omit percent to use confirmed marks.'
DESCRIPTIONS['list_database_tables'] = 'Main college database tables and columns. Call before query_database.'
DESCRIPTIONS['query_database'] = 'One read-only SELECT over the college database; at most 10 rows. For counts, fees, intake, hostels, scholarships or comparisons.'
DESCRIPTIONS['get_my_result_context'] = 'Confirmed academic summary and the latest unconfirmed draft marks, clearly labelled as draft. Never treat draft marks as confirmed.'
DESCRIPTIONS['get_my_last_search'] = 'The student’s last saved finder search, including its selected preferences and result identifiers.'
DESCRIPTIONS['save_my_preference'] = 'Propose one preference change. The server returns a confirmation proposal; the application must send its ID on the next student-confirmed request before any setting changes. Model confirmation flags alone never authorize writes.'
TOOLS = [{'type': 'function', 'function': {'name': name, 'description': DESCRIPTIONS[name], 'parameters': {'type': 'object', 'properties': props, 'additionalProperties': False, 'required': list(props) if name in {'get_offering_facts', 'get_admission_guide', 'save_my_preference', 'query_database'} else []}}} for name, props in TOOL_PARAMETERS.items()]

# The query tool reads the shared catalogue only. Student tables are excluded by name,
# and the query runs in a savepoint that is always rolled back.
READABLE = {'cq_master_v11', 'public.cq_cutoff_summary', 'public.offerings', 'public.institutions', 'public.sources'}
FORBIDDEN = re.compile(r'\b(?:insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|copy|call|do|set|reset|lock|vacuum|analyze|listen|notify|prepare|execute|into|set_config|current_setting|dblink|pg_\w+|lo_\w+|information_schema|workspace_records|guest_sessions|account_sessions|report_shares|rate_counters|domain_events|cq_private_stage)\b', re.I)


def read_only_query(db, sql):
    sql = sql.strip().rstrip(';').strip()
    if ';' in sql or not re.match(r'(?is)^(select|with)\b', sql) or FORBIDDEN.search(sql) or '--' in sql or '/*' in sql:
        return {'status': 'rejected', 'note': 'Only a single read-only SELECT over the catalogue is allowed.'}
    for schema, table in re.findall(r'\b([a-z_][a-z0-9_]*)\s*\.\s*([a-z_][a-z0-9_]*)', sql, re.I):
        if schema.lower() == 'public' and 'public.' + table.lower() not in READABLE:
            return {'status': 'rejected', 'note': f'Table public.{table} is not part of the catalogue.'}
    with db.begin_nested() as savepoint:
        try:
            db.execute(text("SET LOCAL statement_timeout = '8s'"))
            db.execute(text('SET LOCAL search_path = cq_master_v11'))
            rows = db.execute(text(f'SELECT * FROM ({sql}) AS q LIMIT 10')).mappings().all()
            return {'rows': [{k: (v[:200] if isinstance(v, str) else v if isinstance(v, (int, float, bool, type(None))) else str(v)[:200]) for k, v in r.items()} for r in rows], 'row_count': len(rows), 'note': 'At most 10 rows are returned; aggregate or filter for larger questions.'}
        except Exception as exc:
            return {'status': 'error', 'note': str(getattr(exc, 'orig', exc)).split('\n')[0][:300]}
        finally:
            savepoint.rollback()


# A compact map of the tables that answer student questions; the rest are import bookkeeping.
CORE_TABLES = ['institutions', 'institution_programs', 'programs', 'districts', 'admission_cycles', 'fee_structures', 'hostel_facilities', 'seat_matrices', 'scholarship_schemes']


def list_tables(db):
    rows = db.execute(text('''SELECT table_schema || '.' || table_name AS table_name, string_agg(column_name, ', ' ORDER BY ordinal_position) AS columns
        FROM information_schema.columns
        WHERE (table_schema='cq_master_v11' AND table_name = ANY(CAST(:tables AS text[]))) OR (table_schema='public' AND table_name='cq_cutoff_summary')
        GROUP BY 1 ORDER BY 1'''), {'tables': CORE_TABLES}).mappings().all()
    return {'tables': {r['table_name']: r['columns'] for r in rows}, 'notes': ['cq_cutoff_summary has one row per program and category with first_round_percent and closing_percent for the latest year; category values are GENERAL, OBC, SC, ST, SEBC, EWS, VJA, NTA, NTB, NTC, NTD, SBC.', 'admission_cutoffs.cutoff_value_num is FYJC merit marks out of 500.', 'District names in districts.name are upper case, e.g. PUNE.', 'offering_id in cq_cutoff_summary equals dump:<institution_programs.id>.', 'scholarship_schemes: source_pathway is always multiple; the courses a scheme covers are listed in applicability_evidence, e.g. applicability_evidence ILIKE \'%diploma%\'.', 'fee_structures.fee_type is tuition, development or total; join institution_program_id to institution_programs.id.', 'Search text with ILIKE, never exact equality, unless the value is listed here.']}


def fact_summary(facts):
    return {key: facts.get(key) for key in ['name', 'program_name', 'pathway_id', 'academic_year', 'source_id', 'district', 'medium', 'tuition', 'hostel_status', 'verified_fields', 'fees', 'cutoffs', 'sources', 'warnings']}


def match_summary(row):
    return {**{key: row.get(key) for key in ['offering_id', 'name', 'eligibility_status', 'cutoff_comparison', 'utility', 'evidence_coverage', 'components', 'unrated_criteria', 'ranker_version']}, 'facts': fact_summary(row['facts'])}


class Tools:
    def __init__(self, student, master_enabled=False):
        self.student = student
        self.master_enabled = master_enabled

    def execute(self, name, arguments):
        if name not in TOOL_PARAMETERS or not isinstance(arguments, dict) or set(arguments) - set(TOOL_PARAMETERS[name]):
            raise ValueError('Unknown tool or invalid arguments')
        student = self.student
        if name == 'get_my_academic_summary':
            output = student.academic()
        elif name == 'get_my_result_context':
            draft = next((row for row in reversed(student.ws.list('result')) if row.data.get('confirmation_state') == 'draft'), None)
            output = {'confirmed': student.academic(), 'draft': {'confirmation_state': 'draft', 'board': draft.data.get('board'), 'exam_year': draft.data.get('exam_year'), 'subjects': draft.data.get('subjects', [])} if draft else None}
        elif name == 'get_my_compass_report':
            row = student.ws.get('compass_report')
            output = student.compass_summary(row.data) if row else None
        elif name == 'get_my_preferences':
            profile = student.profile()
            output = {**student.preferences(), 'home_city': profile.get('home_city'), 'home_district': profile.get('home_district'), 'active_goal_pathway': profile.get('active_goal_pathway')}
        elif name == 'get_my_shortlist':
            output = [{'offering_id': row['offering_id'], 'status_label': row['status_label'], 'facts': fact_summary(row['facts']) if row['facts'] else None} for row in student.shortlist()[:3]]
        elif name == 'get_my_last_search':
            row = student.ws.get('last_search')
            output = row.data if row else None
        elif name == 'search_colleges':
            prefs = student.preferences()
            if 'pathway_id' in arguments:
                prefs['pathway'] = arguments['pathway_id']
            if 'districts' in arguments:
                prefs['target_districts'] = arguments['districts']
            prefs = Preferences.model_validate(prefs).model_dump()
            if self.master_enabled:
                output = master_catalogue.search(student.db, prefs.get('pathway'), prefs.get('target_districts'), limit=5, government=prefs.get('government', 'any'))
                output['preferences'] = prefs
            else:
                found = student.match(prefs, limit=5, save=False)
                output = {'results': [match_summary(r) for r in found['results']], 'total': found['total'], 'ranker_version': found['ranker_version'], 'preferences': found['preferences'], 'warnings': found['warnings'], 'sources': found['sources']}
        elif name == 'get_offering_facts':
            if self.master_enabled:
                output = master_catalogue.detail(student.db, arguments['offering_id']) or {'status': 'unknown', 'note': 'No master offering found.'}
            else:
                output = match_summary(student.match_offering(arguments['offering_id']))
        elif name == 'recommend_colleges_by_marks':
            percent = arguments.get('percent')
            if percent is None:
                academic = student.academic()
                percent = academic and academic['aggregate']['value']
            if percent is None:
                output = {'status': 'unknown', 'note': 'No confirmed marks. Ask the student for their percentage or to confirm their marksheet.'}
            else:
                found = recommend.recommend(student.db, float(percent), arguments.get('pathway_id'), arguments.get('districts'), student.category(), limit=4)
                keep = ('name', 'program_name', 'district', 'management', 'academic_year', 'first_round_percent', 'closing_percent')
                output = {**{k: found[k] for k in ('percent', 'pathway_id', 'districts', 'counts')}, 'groups': {band: [{k: item[k] for k in keep} for item in rows] for band, rows in found['groups'].items()}}
        elif name == 'list_database_tables':
            output = list_tables(student.db)
        elif name == 'query_database':
            output = read_only_query(student.db, arguments['sql'])
        elif name == 'get_admission_guide':
            output = guide(arguments['pathway_id'])
        else:
            field, value = arguments['field'], arguments['value']
            if field not in TOOL_PARAMETERS['save_my_preference']['field']['enum']:
                raise ValueError('Unsupported preference field')
            if field == 'active_goal_pathway':
                GoalInput(pathway_id=value)
            else:
                Preferences.model_validate({**student.preferences(), field: value})
            expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
            proposal = student.ws.put('preference_proposal', {'field': field, 'value': value, 'expires_at': expires, 'applied': False})
            output = {'status': 'confirmation_required', 'proposal_id': proposal.id, 'field': field, 'value': value, 'expires_at': expires}
        cleaned = sanitize(output)
        # Bound context even when a source has many historical records.
        if len(json.dumps(cleaned, ensure_ascii=False)) > 28000:
            return {'status': 'unknown', 'note': 'Narrow the query; evidence exceeded the context budget.'}
        return cleaned


def apply_confirmed_change(student, proposal_id):
    student.ws.lock()
    proposal = student.ws.require('preference_proposal', proposal_id)
    data = proposal.data
    if data['expires_at'] <= now():
        raise Problem('CONFLICT', 'This proposed preference change expired. Review a new proposal.', 409)
    if not data['applied']:
        if data['field'] == 'active_goal_pathway':
            student.goal(GoalInput(pathway_id=data['value']).pathway_id)
        else:
            student.save_preferences({**student.preferences(), data['field']: data['value']})
        proposal.data = {**data, 'applied': True, 'applied_at': now()}
    return {'field': data['field'], 'value': data['value'], 'saved': True}
