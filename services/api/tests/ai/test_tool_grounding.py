from sqlalchemy import select
from app.ai.tools import Tools
from app.db import Workspace, transaction
from app.models import GuestSession
from app.student import Student


def test_search_tool_retains_components_and_source_links(client, confirmed):
    with transaction(client.app.state.engine) as db:
        owner = db.scalar(select(GuestSession.user_id))
        result = Tools(Student(Workspace(db, owner))).execute('search_colleges', {'pathway_id': 'polytechnic_diploma'})
        assert result['results'][0]['components']
        assert result['sources'][0]['url']
        assert len(result['results']) <= 10


def test_offering_tool_uses_shared_personal_match_axes(client, confirmed):
    with transaction(client.app.state.engine) as db:
        owner = db.scalar(select(GuestSession.user_id))
        result = Tools(Student(Workspace(db, owner))).execute('get_offering_facts', {'offering_id': 'one'})
        assert 'eligibility_status' in result and 'cutoff_comparison' in result
        assert 'utility' in result and result['facts']['name']
