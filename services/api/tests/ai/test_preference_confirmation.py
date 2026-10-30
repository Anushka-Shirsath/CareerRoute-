from sqlalchemy import select
from app.ai.tools import Tools
from app.db import Workspace, transaction
from app.models import GuestSession
from app.student import Student


def test_model_confirmation_flag_alone_cannot_change_preferences(client):
    with transaction(client.app.state.engine) as db:
        owner = db.scalar(select(GuestSession.user_id))
        student = Student(Workspace(db, owner))
        before = student.preferences()
        proposal = Tools(student).execute('save_my_preference', {'field': 'target_districts', 'value': ['Nashik'], 'student_confirmed': True})
        assert student.preferences() == before
        proposal_id = proposal['proposal_id']
    response = client.post('/api/v1/mentor/chat', json={'message': 'Yes, update it', 'confirm_preference_change_id': proposal_id})
    assert response.status_code == 200
    assert response.json()['data']['saved_change']['saved']
    assert client.get('/api/v1/me/preferences').json()['data']['target_districts'] == ['Nashik']
