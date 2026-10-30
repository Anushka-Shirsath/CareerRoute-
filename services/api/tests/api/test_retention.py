from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from app.db import Workspace, transaction
from app.models import GuestSession, Record
from app.retention import cleanup


def test_uploaded_file_deleted_after_window(client, engine):
    with transaction(engine) as db:
        owner = db.scalar(select(GuestSession.user_id))
        record = Workspace(db, owner).put('document', {'content': 'test-private-content', 'delete_after': (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()})
        record_id = record.id
    assert cleanup(engine)['expired_upload_contents_purged'] == 1
    with transaction(engine) as db:
        assert db.get(Record, record_id).data['content'] is None


def test_expired_workspace_rows_deleted(client, engine):
    with transaction(engine) as db:
        row = db.scalar(select(GuestSession))
        row.expires_at = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert cleanup(engine)['expired_workspaces_deleted'] == 1
    with transaction(engine) as db:
        assert not list(db.scalars(select(Record)))
