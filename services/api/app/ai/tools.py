import json
from datetime import datetime, timedelta, timezone
from ..guides import guide
from ..schemas import Preferences
from ..schemas import GoalInput
from ..models import now
from ..errors import Problem
from .guard import sanitize
from .. import master_catalogue

TOOL_PARAMETERS = {
    'get_my_academic_summary': {}, 'get_my_result_context': {}, 'get_my_compass_report': {}, 'get_my_preferences': {}, 'get_my_shortlist': {}, 'get_my_last_search': {},
    'search_colleges': {'pathway_id': {'type': 'string', 'enum': ['fyjc_science', 'fyjc_commerce', 'fyjc_arts', 'polytechnic_diploma', 'iti_trade', 'vocational']}, 'districts': {'type': 'array', 'items': {'type': 'string'}, 'maxItems': 5}},
    'get_offering_facts': {'offering_id': {'type': 'string', 'maxLength': 100}},
    'get_admission_guide': {'pathway_id': {'type': 'string'}},
    'save_my_preference': {'field': {'type': 'string', 'enum': ['target_districts', 'tuition_cap_inr', 'government', 'hostel', 'medium', 'active_goal_pathway']}, 'value': {}, 'student_confirmed': {'type': 'boolean'}},
}
DESCRIPTIONS = {'get_my_academic_summary': 'Confirmed marks only, never drafts.', 'get_my_compass_report': 'Exploratory route report; readiness is separate.', 'get_my_preferences': 'Saved budget, districts, importance weights and goal.', 'get_my_shortlist': 'Saved offerings and student-reported statuses.', 'search_colleges': 'Matches using the same ranking as the finder, including missing evidence.', 'get_offering_facts': 'Published source facts for one offering.', 'get_admission_guide': 'Official portal and preparation steps; dates may be unverified.'}
DESCRIPTIONS['get_my_result_context'] = 'Confirmed academic summary and the latest unconfirmed draft marks, clearly labelled as draft. Never treat draft marks as confirmed.'
DESCRIPTIONS['get_my_last_search'] = 'The student’s last saved finder search, including its selected preferences and result identifiers.'
DESCRIPTIONS['save_my_preference'] = 'Propose one preference change. The server returns a confirmation proposal; the application must send its ID on the next student-confirmed request before any setting changes. Model confirmation flags alone never authorize writes.'
TOOLS = [{'type': 'function', 'function': {'name': name, 'description': DESCRIPTIONS[name], 'parameters': {'type': 'object', 'properties': props, 'additionalProperties': False, 'required': list(props) if name in {'get_offering_facts', 'get_admission_guide', 'save_my_preference'} else []}}} for name, props in TOOL_PARAMETERS.items()]


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
