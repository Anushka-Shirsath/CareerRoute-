from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
import secrets
from sqlalchemy import select
from . import catalogue
from .content import mission
from .db import Workspace
from .domain.compass import answer, current_node, report
from .domain.results import snapshot
from .errors import Problem
from .guides import guide
from .models import Sensitive, Share, now, uid
from .schemas import ManualResult, Preferences


def token_hash(value, pepper):
    return hashlib.sha256((value + pepper).encode()).hexdigest()


def report_safe(value):
    if isinstance(value, dict):
        return {key: report_safe(item) for key, item in value.items() if key not in {'category', 'category_code', 'applies_to_category', 'quota', 'reservation_details', 'extra_dimensions'}}
    if isinstance(value, list):
        return [report_safe(item) for item in value]
    return value


class Student:
    def __init__(self, workspace: Workspace):
        self.ws = workspace
        self.db = workspace.db

    def profile(self):
        return self.ws.singleton('profile', {'locale': 'en', 'home_city': None, 'home_district': None, 'target_districts': [], 'active_goal_pathway': None, 'is_synthetic': True, 'chat_history_enabled': True})

    def preferences(self):
        return self.ws.singleton('preferences', Preferences().model_dump())

    def save_preferences(self, data):
        self.ws.lock()
        validated = Preferences.model_validate(data).model_dump()
        row = self.ws.save('preferences', validated)
        self.ws.put('memory', {'kind': 'preference', 'content': json.dumps(validated), 'origin': 'preferences_settings'}, 'preference-memory:' + self.ws.user_id)
        revision = len(self.ws.list('preference_history')) + 1
        self.ws.put('preference_history', {'revision': revision, 'preferences': validated})
        self.ws.emit('PREFERENCES_UPDATED', row.id, revision)
        self.refresh_saved_search()
        return validated

    def category(self):
        row = self.db.get(Sensitive, self.ws.user_id)
        return row.category_code if row else None

    def confirmed(self):
        return next((r for r in reversed(self.ws.list('result')) if r.data['confirmation_state'] == 'confirmed'), None)

    def academic(self):
        row = self.confirmed()
        return snapshot(row.data) if row else None

    def create_result(self, value, extraction_method='manual', document_id=None):
        if hasattr(value, 'model_dump'):
            value = value.model_dump()
        data = {**value, 'confirmation_state': 'draft', 'extraction_method': extraction_method, 'revision': 0, 'is_synthetic': True, 'document_id': document_id}
        record = self.ws.put('result', data)
        return {'result_id': record.id, **record.data}

    def confirm(self, result_id, subjects=None):
        self.ws.lock()
        row = self.ws.require('result', result_id)
        original_state = row.data['confirmation_state']
        previous = self.confirmed()
        new_subjects = [s.model_dump() for s in subjects] if subjects else row.data['subjects']
        if not new_subjects:
            raise Problem('VALIDATION_FAILED', 'Enter at least one subject before confirming this draft.')
        if row.data['confirmation_state'] == 'superseded':
            raise Problem('CONFLICT', 'This result revision was superseded. Create or edit the current result.', 409)
        if row.data['confirmation_state'] == 'confirmed' and row.data['subjects'] == new_subjects:
            return {'result_id': row.id, **row.data, 'aggregate': self.academic()['aggregate']}
        revision = max((r.data.get('revision', 0) for r in self.ws.list('result')), default=0) + 1
        if previous:
            previous.data = {**previous.data, 'confirmation_state': 'superseded'}
            self.db.flush()
        data = {**row.data, 'subjects': new_subjects, 'confirmation_state': 'confirmed', 'revision': revision, 'confirmed_at': now()}
        if original_state == 'confirmed':
            saved = self.ws.put('result', data)
        else:
            row.data = data
            saved = row
        self.db.flush()
        self.ws.save('academic_snapshot', snapshot(data))
        self.ws.emit('RESULT_CONFIRMED', saved.id, revision)
        self.ws.save('memory', {'kind': 'confirmed_fact', 'content': f"Board: {data['board']}; result year: {data['exam_year']}", 'origin': 'confirmed_result'})
        latest = self.ws.get('compass_report')
        if latest:
            session_ids = latest.data.get('game_session_ids', [])
            session = self.ws.get('game_session', session_ids[-1]) if session_ids else None
            self.make_report(session.id if session else None)
        self.refresh_saved_search()
        return {'result_id': saved.id, **data, 'aggregate': snapshot(data)['aggregate']}

    def refresh_saved_search(self):
        previous = self.ws.singleton('last_search')
        if previous:
            self.match(previous.get('preferences'), previous.get('admission_context'), limit=20)

    def demo(self):
        self.ws.lock()
        existing = self.ws.get('demo_initialized')
        if existing:
            return existing.data
        profile = {**self.profile(), 'display_name': 'Demo student', 'home_city': 'Nashik', 'home_district': 'Nashik', 'target_districts': ['Pune'], 'active_goal_pathway': 'polytechnic_diploma'}
        self.ws.save('profile', profile)
        pref = Preferences(pathway='polytechnic_diploma', target_districts=['Pune'], tuition_cap_inr=30000, hostel='preferred', government='preferred', weights={'academic_fit': 85, 'affordability': 75, 'proximity': 50, 'government': 40, 'hostel': 25}).model_dump()
        self.ws.save('preferences', pref)
        self.db.merge(Sensitive(user_id=self.ws.user_id, category_code='OPEN'))
        value = ManualResult(board='SSC_MH', exam_year=2026, result_type='official', subjects=[{'canonical_subject': canonical, 'name_as_shown': name, 'obtained': mark, 'maximum': 100} for canonical, name, mark in [('english', 'English', 75), ('first_language', 'Marathi', 72), ('second_language', 'Hindi', 70), ('mathematics', 'Mathematics', 88), ('science', 'Science', 84), ('social_science', 'Social Science', 78)]])
        result = self.create_result(value)
        self.ws.save('demo_initialized', {'profile': profile, 'result_id': result['result_id'], 'notice': 'Demo data. Review and confirm these synthetic marks before they are used.'})
        self.goal('polytechnic_diploma')
        return self.ws.singleton('demo_initialized')

    def goal(self, pathway_id):
        self.ws.lock()
        profile = {**self.profile(), 'active_goal_pathway': pathway_id}
        self.ws.save('profile', profile)
        history = self.ws.put('goal_history', {'pathway_id': pathway_id, 'changed_at': now()})
        self.ws.emit('GOAL_CHANGED', history.id)
        for old in self.ws.list('checklist'):
            self.db.delete(old)
        for item in guide(pathway_id)['checklist']:
            self.ws.put('checklist', {'pathway_id': pathway_id, 'label_key': item['label_key'], 'done': False, 'verification_status': item['verification_status']})
        latest = self.ws.get('compass_report')
        if latest:
            # Keep the old report immutable; a new report carries the override.
            clone = deepcopy(latest.data)
            clone.update(student_override=pathway_id, generated_at=now())
            self.store_report(clone)
        return {'pathway_id': pathway_id, 'student_override': True, 'checklist': self.checklist()}

    def checklist(self):
        return [{'id': r.id, **r.data} for r in self.ws.list('checklist')]

    def start(self, locale='en'):
        data = {'mission_id': 'mission1', 'ruleset': 'v0.1', 'state': 'in_progress', 'position': 0, 'events': [], 'locale': locale}
        row = self.ws.put('game_session', data)
        return {'session_id': row.id, 'ruleset': data['ruleset'], 'state': data['state'], 'node': current_node(mission(), data), 'translation_status': 'original' if locale == 'en' else 'english_fallback_pending_human_translation'}

    def game_event(self, session_id, payload):
        self.ws.lock()
        row = self.ws.require('game_session', session_id)
        event = payload.model_dump()
        if len(str(event.get('task_outcome'))) > 4000:
            raise Problem('VALIDATION_FAILED', 'Task outcome is too large.')
        for existing in row.data['events']:
            if existing['idempotency_key'] == event['idempotency_key']:
                if any(existing.get(k) != v for k, v in event.items()):
                    raise Problem('CONFLICT', 'Idempotency key was already used for a different answer.', 409)
                return {'event_id': existing['id'], 'state': row.data['state'], 'node': current_node(mission(), row.data), 'done': row.data['state'] == 'completed'}
        if row.data['ruleset'] != mission()['ruleset']:
            raise Problem('CONFLICT', 'This mission ruleset is not installed.', 409)
        event_id = uid()
        row.data = answer(mission(), row.data, event, event_id)
        if row.data['state'] == 'completed':
            self.make_report(session_id)
        return {'event_id': event_id, 'state': row.data['state'], 'node': current_node(mission(), row.data), 'done': row.data['state'] == 'completed'}

    def store_report(self, data):
        previous = self.ws.get('compass_report')
        saved = self.ws.put('compass_report', data)
        if previous:
            previous.data = {**previous.data, 'superseded_by': saved.id}
        return {'report_id': saved.id, **data}

    def make_report(self, session_id=None):
        session = self.ws.require('game_session', session_id) if session_id else None
        data = report(session.data['events'] if session else [], self.academic(), self.profile().get('active_goal_pathway'))
        data.update(generated_at=now(), game_session_ids=[session.id] if session else [])
        result = self.store_report(data)
        if session:
            session.data = {**session.data, 'state': 'completed', 'completed_at': now()}
            self.ws.emit('COMPASS_COMPLETED', session.id)
        return result

    def match(self, preferences=None, context=None, limit=20, cursor=None, save=True):
        return catalogue.search(self.db, self.ws, preferences or self.preferences(), self.academic(), self.category(), context, limit, cursor, save)

    def match_offering(self, offering_id):
        from .domain.matching import evaluate
        facts = catalogue.get_offering(self.db, offering_id, category=self.category())
        context = self.ws.singleton('last_search').get('admission_context')
        return evaluate(facts, self.profile(), self.preferences(), self.academic(), self.category(), context)

    def shortlist(self):
        items = []
        for row in self.ws.list('shortlist'):
            try:
                facts = catalogue.get_offering(self.db, row.data['offering_id'], include_cutoffs=False)
            except Problem:
                facts = None
            items.append({'id': row.id, **row.data, 'status_label': row.data['status'] + (' (you reported)' if row.data['status'].endswith('_reported') else ''), 'facts': facts})
        return items

    def dashboard(self):
        compass = self.ws.get('compass_report')
        return {'profile': self.profile(), 'academic_snapshot': self.academic(), 'compass_summary': self.compass_summary(compass.data) if compass else None, 'shortlist': self.shortlist(), 'next_steps': self.checklist(), 'notice': 'Demo build. Use synthetic marksheets only.'}

    @staticmethod
    def compass_summary(data):
        return {'mode': data['mode'], 'coverage': data['coverage'], 'ruleset': data['ruleset'], 'student_override': data.get('student_override'), 'routes': [{'pathway_id': r['pathway_id'], 'readiness': r['readiness'], 'why': [x['text'] for x in r['why']], 'limited_evidence': r['limited_evidence']} for r in data['top_routes']], 'footer': data['footer']}

    def parent_report(self, payload, settings):
        self.ws.lock()
        active = list(self.db.scalars(select(Share).where(Share.user_id == self.ws.user_id, Share.revoked.is_(False), Share.expires_at > now())))
        if len(active) >= 5:
            raise Problem('CONFLICT', 'Revoke an active share before creating another (maximum 5).', 409)
        selected = list(dict.fromkeys(payload.sections))
        sections = {}
        for key in selected:
            if key == 'academic_summary':
                sections[key] = self.academic()
            elif key == 'compass_summary':
                latest = self.ws.get('compass_report')
                sections[key] = self.compass_summary(latest.data) if latest else None
            elif key == 'routes_and_alternatives':
                sections[key] = {'goal': self.profile().get('active_goal_pathway'), 'alternatives': ['fyjc_science', 'fyjc_commerce', 'fyjc_arts', 'polytechnic_diploma', 'iti_trade', 'vocational']}
            elif key == 'shortlist':
                sections[key] = [{'offering_id': item['offering_id'], 'status_label': item['status_label'], 'facts': item['facts']} for item in self.shortlist()]
            elif key == 'costs':
                sections[key] = self.ws.singleton('cost_comparison', {'offerings': [], 'note': 'No cost comparison saved.'})
            elif key == 'next_steps':
                sections[key] = self.checklist()
            elif key == 'questions_to_discuss':
                sections[key] = ['Which daily activities would I enjoy?', 'Which costs are still unknown?', 'Which official admission rules should we verify together?']
            elif key == 'category_used_in_comparison':
                sections[key] = {'category_code': self.category(), 'status': 'student_reported'}
        sections = {key: (value if key == 'category_used_in_comparison' else report_safe(value)) for key, value in sections.items()}
        snapshot_value = {'sections': sections, 'locale_default': payload.locale_default, 'created_at': now(), 'notice': 'Demo data. Choices can change; past cutoffs do not predict admission.'}
        report_row = self.ws.put('parent_report', snapshot_value)
        token = secrets.token_urlsafe(32)
        expires = (datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days)).isoformat()
        self.db.add(Share(user_id=self.ws.user_id, report_id=report_row.id, token_hash=token_hash(token, settings.share_token_pepper), expires_at=expires, snapshot=deepcopy(snapshot_value)))
        return {'report_id': report_row.id, 'share_url': settings.public_api_origin.rstrip('/') + '/api/v1/r/' + token, 'expires_at': expires, 'preview': snapshot_value}
