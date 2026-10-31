from unittest.mock import MagicMock, patch
import httpx
from app.ai.mentor import chat
from app.config import Settings
from app.errors import Problem
import pytest


def completion(message):
    response = MagicMock()
    response.json.return_value = {'choices': [{'message': message}]}
    return response


def test_fallback_on_timeout(client):
    from app.db import Workspace, transaction
    from app.models import GuestSession
    from sqlalchemy import select
    from app.student import Student
    with transaction(client.app.state.engine) as db:
        owner = db.scalar(select(GuestSession.user_id))
        student = Student(Workspace(db, owner))
        with patch('app.ai.mentor.httpx.Client') as factory:
            factory.return_value.__enter__.return_value.post.side_effect = httpx.ReadTimeout('timeout')
            assert chat(student, Settings(groq_api_key='test-value'), 'Hello', 'en', provider_consent=True)['fallback']


def test_provider_receives_no_context_without_explicit_consent(client, confirmed):
    from app.db import Workspace, transaction
    from app.models import GuestSession
    from sqlalchemy import select
    from app.student import Student
    with transaction(client.app.state.engine) as db:
        student = Student(Workspace(db, db.scalar(select(GuestSession.user_id))))
        with patch('app.ai.mentor.httpx.Client') as factory:
            factory.side_effect = AssertionError('Unexpected external request')
            with pytest.raises(Problem, match='consent'):
                chat(student, Settings(groq_api_key='test-value', mentor_enabled=True), 'What are my marks?', 'en')
            factory.assert_not_called()


def test_mentor_api_requires_unambiguous_consent(client, confirmed):
    client.app.state.settings.mentor_enabled = True
    client.app.state.settings.groq_api_key = 'test-value'
    with patch('app.ai.mentor.httpx.Client') as factory:
        factory.side_effect = AssertionError('Unexpected external request')
        for payload in ({'message': 'What are my marks?'},
                        {'message': 'What are my marks?', 'provider_consent': False},
                        {'message': 'What are my marks?', 'provider_consent': 'true'}):
            assert client.post('/api/v1/mentor/chat', json=payload).status_code == 422
        factory.assert_not_called()


def test_consent_can_be_revoked_on_the_next_message(client, confirmed):
    client.app.state.settings.mentor_enabled = True
    client.app.state.settings.groq_api_key = 'test-value'
    with patch('app.ai.mentor.httpx.Client') as factory:
        factory.return_value.__enter__.return_value.post.return_value = completion({'content': 'Consider your options carefully.'})
        first = client.post('/api/v1/mentor/chat', json={'message': 'What can I consider?', 'provider_consent': True})
        assert first.status_code == 200
        assert factory.call_count == 1
        second = client.post('/api/v1/mentor/chat', json={'message': 'What about now?', 'provider_consent': False})
        assert second.status_code == 422
        assert factory.call_count == 1


def test_tool_grounded_turn(client, confirmed):
    from app.db import Workspace, transaction
    from app.models import GuestSession
    from sqlalchemy import select
    from app.student import Student
    with transaction(client.app.state.engine) as db:
        owner = db.scalar(select(GuestSession.user_id))
        student = Student(Workspace(db, owner))
        with patch('app.ai.mentor.httpx.Client') as factory:
            adapter = factory.return_value.__enter__.return_value
            adapter.post.side_effect = [completion({'content': None, 'tool_calls': [{'id': 'call1', 'type': 'function', 'function': {'name': 'get_my_academic_summary', 'arguments': '{}'}}]}), completion({'content': 'Your Mathematics mark is 88 out of 100. You can explore any route.'})]
            result = chat(student, Settings(groq_api_key='test-value'), 'What are my marks?', 'en', provider_consent=True)
            assert not result['fallback'] and result['used_tools'] == ['get_my_academic_summary']
            assert '88' in result['reply']


def test_memory_suggestion_requires_explicit_acceptance(client):
    reply = client.post('/api/v1/mentor/chat', json={'message': 'I enjoy designing posters'}).json()['data']
    suggestion = reply['memory_suggestions'][0]
    assert client.get('/api/v1/me/memory').json()['data']['items'] == []
    response = client.post('/api/v1/me/memory/' + suggestion['suggestion_id'] + '/accept')
    assert response.status_code == 200
    assert client.get('/api/v1/me/memory').json()['data']['items'][0]['kind'] == 'inference'
