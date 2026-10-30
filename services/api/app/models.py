"""Storage models. Student aggregates are versioned documents with owner RLS.

Catalogue facts remain relational so 633k cutoff rows can be queried with indexes.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import JSON, Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def uid():
    return str(uuid.uuid4())


def now():
    return datetime.now(timezone.utc).isoformat()


class Base(DeclarativeBase):
    pass


class GuestSession(Base):
    __tablename__ = 'guest_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), unique=True, default=uid)
    expires_at: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[str] = mapped_column(String(40), default=now)


class AccountSession(Base):
    __tablename__ = 'account_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    expires_at: Mapped[str] = mapped_column(String(40), index=True)
    created_at: Mapped[str] = mapped_column(String(40), default=now)


class Record(Base):
    __tablename__ = 'workspace_records'
    id: Mapped[str] = mapped_column(String(100), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    data: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    __table_args__ = (
        Index('ix_workspace_owner_kind', 'user_id', 'kind'),
        Index('one_confirmed_result', 'user_id', unique=True,
              postgresql_where=text("kind = 'result' AND data ->> 'confirmation_state' = 'confirmed'"),
              sqlite_where=text("kind = 'result' AND data ->> 'confirmation_state' = 'confirmed'")),
    )


class Sensitive(Base):
    __tablename__ = 'student_sensitive_attributes'
    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    category_code: Mapped[str | None] = mapped_column(String(80))


class Share(Base):
    __tablename__ = 'report_shares'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    report_id: Mapped[str] = mapped_column(String(100), unique=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[str] = mapped_column(String(40))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    snapshot: Mapped[dict] = mapped_column(JSON)


class RateCounter(Base):
    __tablename__ = 'rate_counters'
    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    bucket: Mapped[str] = mapped_column(String(80), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)


class Source(Base):
    __tablename__ = 'sources'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)


class Institution(Base):
    __tablename__ = 'institutions'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    district: Mapped[str | None] = mapped_column(String(100), index=True)
    management: Mapped[str] = mapped_column(String(40), default='unknown', index=True)
    pathway: Mapped[str] = mapped_column(String(40), index=True)
    publish_state: Mapped[str] = mapped_column(String(20), default='staged', index=True)
    data: Mapped[dict] = mapped_column(JSON)


class Offering(Base):
    __tablename__ = 'offerings'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    institution_id: Mapped[str] = mapped_column(ForeignKey('institutions.id'), index=True)
    pathway_id: Mapped[str] = mapped_column(String(40), index=True)
    academic_year: Mapped[str | None] = mapped_column(String(10), index=True)
    publish_state: Mapped[str] = mapped_column(String(20), default='staged', index=True)
    data: Mapped[dict] = mapped_column(JSON)


class AdmissionCycle(Base):
    __tablename__ = 'admission_cycles'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)


class Cutoff(Base):
    __tablename__ = 'cutoffs'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    offering_id: Mapped[str] = mapped_column(ForeignKey('offerings.id'), index=True)
    academic_year: Mapped[str] = mapped_column(String(10))
    cycle_id: Mapped[str | None] = mapped_column(ForeignKey('admission_cycles.id'))
    data: Mapped[dict] = mapped_column(JSON)
    __table_args__ = (Index('ix_cutoff_offering_year', 'offering_id', 'academic_year'),)


class Fee(Base):
    __tablename__ = 'fees'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    offering_id: Mapped[str] = mapped_column(ForeignKey('offerings.id'), index=True)
    academic_year: Mapped[str] = mapped_column(String(10))
    data: Mapped[dict] = mapped_column(JSON)


class ImportRun(Base):
    __tablename__ = 'import_runs'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), default='staged')
    data: Mapped[dict] = mapped_column(JSON)


class ReviewItem(Base):
    __tablename__ = 'verification_queue'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(100), index=True)
    status: Mapped[str] = mapped_column(String(20), default='pending')
    data: Mapped[dict] = mapped_column(JSON)


class Publication(Base):
    __tablename__ = 'publication_history'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    run_id: Mapped[str] = mapped_column(String(100), index=True)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    data: Mapped[dict] = mapped_column(JSON)


class DomainEvent(Base):
    __tablename__ = 'domain_events'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    event_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(100))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    __table_args__ = (UniqueConstraint('user_id', 'event_type', 'entity_id', 'revision'),)
