from datetime import datetime, timedelta, timezone
from sqlalchemy import delete, select
from .db import transaction
from .models import AccountSession, DomainEvent, GuestSession, RateCounter, Record, Sensitive, Share, now


def cleanup(engine):
    """Administrative offline retention job. Never registered as an HTTP endpoint."""
    with transaction(engine) as db:
        expired = list(db.scalars(select(GuestSession.user_id).where(GuestSession.expires_at <= now())))
        for owner in expired:
            for model in (Record, Sensitive, Share, DomainEvent, RateCounter):
                db.execute(delete(model).where(model.user_id == owner))
        db.execute(delete(GuestSession).where(GuestSession.expires_at <= now()))
        db.execute(delete(AccountSession).where(AccountSession.expires_at <= now()))
        removed = 0
        for row in db.scalars(select(Record).where(Record.kind == 'document')):
            if row.data.get('delete_after', '') <= now() and row.data.get('content'):
                row.data = {**row.data, 'content': None, 'purged_at': now()}
                removed += 1
        cutoff = (datetime.now(timezone.utc) - timedelta(days=2)).strftime('%Y-%m-%d')
        for row in db.scalars(select(RateCounter)):
            if row.bucket.split(':', 1)[-1][:10] < cutoff:
                db.delete(row)
    return {'expired_workspaces_deleted': len(expired), 'expired_upload_contents_purged': removed}
