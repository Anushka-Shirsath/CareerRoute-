from contextlib import contextmanager
from pathlib import Path
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool
from .models import Base, DomainEvent, Record
from .errors import Problem


def make_engine(url, pool_size=None):
    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql+psycopg://', 1)
    elif url.startswith('postgresql://'):
        url = url.replace('postgresql://', 'postgresql+psycopg://', 1)
    if url.startswith('sqlite:///'):
        Path(url.removeprefix('sqlite:///')).parent.mkdir(parents=True, exist_ok=True)
    options = {}
    if not url.startswith('sqlite'):
        parsed = make_url(url)
        # Reuse a small number of sessions on Supabase's session pooler. The
        # transaction pooler/serverless path retains NullPool. SET LOCAL role
        # and owner context still expire on each commit/rollback.
        if pool_size is None and parsed.host and parsed.host.endswith('.pooler.supabase.com') and parsed.port == 5432:
            pool_size = 3
        options = {'pool_size': pool_size, 'max_overflow': 0, 'pool_recycle': 300} if pool_size else {'poolclass': NullPool}
    engine = create_engine(url, pool_pre_ping=True, connect_args={'check_same_thread': False} if url.startswith('sqlite') else {'prepare_threshold': None}, **options)
    if engine.dialect.name == 'sqlite':
        @event.listens_for(engine, 'connect')
        def sqlite_setup(connection, _):
            connection.execute('PRAGMA foreign_keys=ON')
            connection.execute('PRAGMA journal_mode=WAL')
            connection.execute('PRAGMA busy_timeout=15000')
    return engine


def initialize(engine):
    Base.metadata.create_all(engine)
    for table in Base.metadata.sorted_tables:
        for index in table.indexes:
            index.create(engine, checkfirst=True)


def role(db, name, user_id=None):
    if db.bind.dialect.name == 'postgresql':
        assert name in {'cq_student', 'cq_system', 'cq_public'}
        db.execute(text('SET LOCAL ROLE ' + name))
        db.execute(text("SELECT set_config('app.user_id', :uid, true)"), {'uid': user_id or ''})


@contextmanager
def transaction(engine):
    with Session(engine, expire_on_commit=False) as db:
        with db.begin():
            yield db


class Workspace:
    def __init__(self, db, user_id):
        self.db, self.user_id = db, user_id

    def list(self, kind, limit=1000):
        return list(self.db.scalars(select(Record).where(Record.user_id == self.user_id, Record.kind == kind).order_by(Record.created_at, Record.id).limit(limit)))

    def get(self, kind, record_id=None):
        query = select(Record).where(Record.user_id == self.user_id, Record.kind == kind)
        if record_id is not None:
            query = query.where(Record.id == record_id)
        return self.db.scalar(query.order_by(Record.created_at.desc(), Record.id.desc()))

    def require(self, kind, record_id):
        record = self.get(kind, record_id)
        if record is None:
            raise Problem('NOT_FOUND', 'Record not found.', 404)
        return record

    def put(self, kind, data, record_id=None):
        record = self.get(kind, record_id) if record_id else None
        if record:
            record.data = data
        else:
            record = Record(user_id=self.user_id, kind=kind, data=data, **({'id': record_id} if record_id else {}))
            self.db.add(record)
        self.db.flush()
        return record

    def singleton(self, kind, default=None):
        record = self.get(kind)
        return record.data if record else (default or {})

    def save(self, kind, data):
        return self.put(kind, data, f'{kind}:{self.user_id}')

    def emit(self, event_type, entity_id, revision=1):
        exists = self.db.scalar(select(DomainEvent).where(DomainEvent.user_id == self.user_id, DomainEvent.event_type == event_type, DomainEvent.entity_id == entity_id, DomainEvent.revision == revision))
        if not exists:
            self.db.add(DomainEvent(user_id=self.user_id, event_type=event_type, entity_id=entity_id, revision=revision))

    def lock(self):
        # Serialize mutations for one browser (result revisions, game events, share counts).
        self.db.scalar(select(Record).where(Record.user_id == self.user_id, Record.kind == 'profile').with_for_update())
