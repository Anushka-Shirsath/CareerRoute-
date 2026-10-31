import base64
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import logging
import re
import secrets
import time
import uuid
from typing import Annotated, Any, Literal
from urllib.parse import quote
import httpx
from fastapi import Depends, FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel, Field, field_validator
from starlette.exceptions import HTTPException
from . import catalogue, master_catalogue, local_catalogue
from .ai.mentor import chat
from .config import ROOT, Settings
from .content import mission
from .db import Workspace, initialize, make_engine, role, transaction
from .domain.compass import current_node
from .errors import Problem
from .guides import guide
from .models import AccountSession, DomainEvent, GuestSession, RateCounter, Record, Sensitive, Share, now, uid
from .request_limits import RequestBodyLimit
from .scan_process import scan_document
from .schemas import (
    ChecklistInput, CompassReportInput, ConfirmResult, CostCompare, ExtractRequest,
    GameEvent, GoalInput, ManualResult, MatchRequest, MentorInput, ParentReportInput,
    Preferences, ProfilePatch, SensitiveInput, ShortlistInput, StartMission, UploadRequest,
)
from .student import Student, token_hash
from .responses import AcademicSummary, CompassReport, Envelope, ErrorEnvelope, MatchOutput, MentorReply, OfferingFacts, ResultView

logger = logging.getLogger('careerquest')
COOKIE = 'cq_session'
ACCOUNT_COOKIE = 'cq_account'
PREFIX = '/api/v1'


class AccountCredentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator('email')
    @classmethod
    def valid_email(cls, value):
        value = value.strip()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('Enter a valid email address.')
        return value


class CutoffRecommendationInput(BaseModel):
    merit_percent: float = Field(ge=0, le=100, allow_inf_nan=False)
    verified_by_student: Literal[True]
    academic_year: str = Field(pattern=r'^20\d{2}-\d{2}$')
    round: str = Field(min_length=1, max_length=80)
    stage: str = Field(min_length=1, max_length=80)
    seat_type: str = Field(min_length=1, max_length=80)


def envelope(request, data, warnings=None):
    return {'data': data, 'warnings': warnings or [], 'request_id': request.state.request_id}


def paginated(items, limit, cursor=None):
    if cursor:
        positions = [index for index, item in enumerate(items) if item['id'] == cursor]
        if not positions:
            raise Problem('VALIDATION_FAILED', 'Invalid pagination cursor.')
        items = items[positions[0] + 1:]
    return {'items': items[:limit], 'next_cursor': items[limit - 1]['id'] if len(items) > limit else None}


def consume(db, user_id, resource, maximum, period='day', code='AI_RATE_LIMITED'):
    instant = datetime.now(timezone.utc)
    bucket = resource + ':' + instant.strftime('%Y-%m-%d' if period == 'day' else '%Y-%m-%dT%H')
    if db.bind.dialect.name == 'postgresql':
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    statement = insert(RateCounter).values(user_id=user_id, bucket=bucket, count=1)
    statement = statement.on_conflict_do_update(index_elements=['user_id', 'bucket'], set_={'count': RateCounter.count + 1}, where=RateCounter.count < maximum).returning(RateCounter.count)
    if db.scalar(statement) is None:
        raise Problem(code, f'{resource.capitalize()} limit reached. Try again after this {period}.', 429)


def public_db(request: Request):
    with transaction(request.app.state.engine) as db:
        db.info['evidence_backend'] = request.app.state.settings.evidence_backend
        role(db, 'cq_public')
        yield db


def session_token(request):
    authorization = request.headers.get('authorization', '')
    if authorization.startswith('Bearer '):
        return authorization[7:]
    return request.cookies.get(COOKIE)


def private_student(request: Request):
    account_token = request.cookies.get(ACCOUNT_COOKIE) if request.app.state.settings.auth_enabled else None
    token = account_token or session_token(request)
    if not token or len(token) > 100:
        raise Problem('UNAUTHENTICATED', 'Start an anonymous session with POST /api/v1/session.', 401)
    if {'student_id', 'user_id'} & set(request.query_params):
        raise Problem('VALIDATION_FAILED', 'Student identity is derived from the browser session.')
    with transaction(request.app.state.engine) as db:
        db.info['evidence_backend'] = request.app.state.settings.evidence_backend
        role(db, 'cq_system')
        row = db.get(AccountSession if account_token else GuestSession, token_hash(token, request.app.state.settings.share_token_pepper))
        if row is None or row.expires_at <= now():
            raise Problem('UNAUTHENTICATED', 'Session expired. Please refresh and sign in again.', 401)
        user_id = row.user_id
        role(db, 'cq_student', user_id)
        if db.bind.dialect.name == 'sqlite' and request.method not in {'GET', 'HEAD'}:
            # A write lock before reading revisions prevents lost updates in local mode.
            db.execute(RateCounter.__table__.update().where(RateCounter.user_id == user_id).values(count=RateCounter.count))
        yield Student(Workspace(db, user_id))


StudentDep = Annotated[Student, Depends(private_student, scope='function')]
PublicDB = Annotated[Any, Depends(public_db, scope='function')]


def create_app(settings=None, engine=None):
    settings = settings or Settings()
    settings.validate_production()
    if not settings.share_token_pepper:
        secret_path = ROOT / 'data/private/server-secret.txt'
        secret_path.parent.mkdir(parents=True, exist_ok=True)
        if not secret_path.exists():
            secret_path.write_text(secrets.token_hex(32), encoding='utf-8')
        settings.share_token_pepper = secret_path.read_text(encoding='utf-8').strip()
    engine = engine or make_engine(settings.database_url)
    if settings.evidence_backend == 'postgres' and engine.dialect.name != 'postgresql':
        raise ValueError('PostgreSQL evidence requires a PostgreSQL database.')

    @asynccontextmanager
    async def lifespan(application):
        # PostgreSQL schema and RLS are provisioned by the migration, including
        # when the local development server connects to a hosted database.
        if settings.environment != 'production' and engine.dialect.name == 'sqlite':
            initialize(engine)
        yield

    app = FastAPI(title='CareerQuest Maharashtra Backend', version='1.0.0', description='Student workspaces with optional Supabase email sign-in and anonymous guest sessions. All private responses are no-store.', lifespan=lifespan, responses={status: {'model': ErrorEnvelope} for status in [401, 403, 404, 409, 413, 422, 429, 500, 503]})
    app.state.engine, app.state.settings = engine, settings
    origins = [x.strip() for x in settings.allowed_origins.split(',') if x.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allow_headers=['Content-Type', 'Authorization'])
    app.add_middleware(RequestBodyLimit)

    @app.middleware('http')
    async def request_context(request, call_next):
        request.state.request_id = uid()
        start = time.monotonic()
        if request.method not in {'GET', 'HEAD', 'OPTIONS'}:
            origin = request.headers.get('origin')
            own_origin = str(request.base_url).rstrip('/')
            if origin and origin not in origins and origin != own_origin:
                return JSONResponse({'error': {'code': 'FORBIDDEN', 'message': 'Origin is not allowed.', 'fields': []}, 'request_id': request.state.request_id}, status_code=403)
        response = await call_next(request)
        response.headers['X-Request-ID'] = request.state.request_id
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Cache-Control'] = 'no-store'
        # Paths may contain share/upload tokens, so log the route template only.
        template = request.scope.get('route')
        logger.info(json.dumps({'request_id': request.state.request_id, 'route': template.path if template else 'unmatched', 'status': response.status_code, 'latency_ms': round((time.monotonic() - start) * 1000, 2)}))
        return response

    @app.exception_handler(Problem)
    async def problem_handler(request, exc):
        return JSONResponse({'error': {'code': exc.code, 'message': exc.message, 'fields': exc.fields}, 'request_id': request.state.request_id}, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request, exc):
        fields = [{'path': '.'.join(str(x) for x in e['loc']), 'message': e['msg']} for e in exc.errors()]
        return JSONResponse({'error': {'code': 'VALIDATION_FAILED', 'message': 'Check the submitted fields.', 'fields': fields}, 'request_id': request.state.request_id}, status_code=422)

    @app.exception_handler(HTTPException)
    async def http_handler(request, exc):
        return JSONResponse({'error': {'code': 'NOT_FOUND' if exc.status_code == 404 else 'VALIDATION_FAILED', 'message': 'Resource not found.' if exc.status_code == 404 else str(exc.detail), 'fields': []}, 'request_id': request.state.request_id}, status_code=exc.status_code)

    @app.exception_handler(SQLAlchemyError)
    async def database_handler(request, exc):
        logger.error('Database failure request_id=%s class=%s', request.state.request_id, type(exc).__name__)
        return JSONResponse({'error': {'code': 'CONFLICT', 'message': 'Storage is temporarily unavailable. Retry the request.', 'fields': []}, 'request_id': request.state.request_id}, status_code=503)

    @app.exception_handler(Exception)
    async def unexpected_handler(request, exc):
        logger.error('Unexpected failure request_id=%s class=%s', request.state.request_id, type(exc).__name__)
        return JSONResponse({'error': {'code': 'CONFLICT', 'message': 'The request could not be completed. Please retry.', 'fields': []}, 'request_id': request.state.request_id}, status_code=500)

    @app.get('/health', response_model=Envelope)
    def health(request: Request, db: PublicDB):
        db.execute(select(func.count()).select_from(catalogue.Source))
        return envelope(request, {'status': 'ok', 'database': 'connected', 'mode': 'synthetic_assignment', 'mentor_configured': bool(settings.groq_api_key and settings.mentor_enabled)})

    def start_session(request, response):
        with transaction(engine) as db:
            role(db, 'cq_system')
            account_token = request.cookies.get(ACCOUNT_COOKIE)
            account = db.get(AccountSession, token_hash(account_token, settings.share_token_pepper)) if settings.auth_enabled and account_token and len(account_token) <= 100 else None
            if account and account.expires_at > now():
                return {'session': 'account', 'expires_at': account.expires_at}
            if account_token:
                response.delete_cookie(ACCOUNT_COOKIE, path='/')
            existing_token = session_token(request)
            existing = db.get(GuestSession, token_hash(existing_token, settings.share_token_pepper)) if existing_token else None
            if existing and existing.expires_at > now():
                return {'session': 'existing', 'expires_at': existing.expires_at}
            client_ip = request.client.host if request.client else 'local'
            consume(db, hashlib.sha256(client_ip.encode()).hexdigest(), 'sessions', 60, 'hour', 'CONFLICT')
            token = secrets.token_urlsafe(32)
            expires = (datetime.now(timezone.utc) + timedelta(days=settings.session_days)).isoformat()
            row = GuestSession(token_hash=token_hash(token, settings.share_token_pepper), expires_at=expires)
            db.add(row)
            db.flush()
            user_id = row.user_id
            role(db, 'cq_student', user_id)
            student = Student(Workspace(db, user_id))
            student.ws.save('profile', student.profile())
            response.set_cookie(COOKIE, token, max_age=settings.session_days * 86400, secure=settings.cookie_secure, httponly=True, samesite='strict', path='/')
            return {'session': 'created', 'expires_at': expires, 'demo_available': settings.demo_mode,
                    'notice': 'Anonymous browser workspace. No account or login required. Use synthetic data only.'}

    @app.post(PREFIX + '/session', response_model=Envelope, tags=['Session'])
    def session(request: Request, response: Response):
        return envelope(request, start_session(request, response))

    @app.post(PREFIX + '/session/demo', response_model=Envelope, tags=['Session'])
    def demo(request: Request, student: StudentDep):
        if not settings.demo_mode:
            raise Problem('FORBIDDEN', 'Demo fixture loading is disabled.', 403)
        return envelope(request, student.demo())

    def auth_provider(path, payload=None, access_token=None):
        if not settings.supabase_url.startswith('https://') or not settings.supabase_publishable_key:
            raise Problem('AUTH_UNAVAILABLE', 'Sign-in is not configured yet. Please try again later.', 503)
        headers = {'apikey': settings.supabase_publishable_key}
        if access_token:
            headers['Authorization'] = 'Bearer ' + access_token
        try:
            with httpx.Client(timeout=20) as client:
                result = client.get(settings.supabase_url.rstrip('/') + '/auth/v1/' + path, headers=headers) if access_token else client.post(settings.supabase_url.rstrip('/') + '/auth/v1/' + path, headers=headers, json=payload)
        except httpx.HTTPError:
            raise Problem('AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again.', 503)
        if result.status_code == 429:
            raise Problem('AUTH_RATE_LIMITED', 'Too many attempts or confirmation emails. Please try again later.', 429)
        if result.status_code >= 500:
            raise Problem('AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again later.', 503)
        if not result.is_success:
            try:
                code = result.json().get('error_code') or result.json().get('code')
            except (ValueError, AttributeError):
                code = None
            if code == 'email_address_not_authorized':
                raise Problem('AUTH_EMAIL_UNAVAILABLE', 'This project cannot send confirmation to that address yet. Please ask the site owner to configure email delivery.', 503)
            raise Problem('AUTH_FAILED', 'Could not sign in. Check your details or confirm your email and try again.', 401)
        try:
            return result.json()
        except ValueError:
            raise Problem('AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again.', 503)

    def issue_account_session(request, response, access_token):
        # Never trust the user object returned by a client; ask Supabase to
        # validate the freshly issued access token before choosing an owner.
        user = auth_provider('user', access_token=access_token)
        try:
            owner = str(uuid.UUID(user['id']))
        except (KeyError, ValueError, TypeError):
            raise Problem('AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again.', 503)
        token = secrets.token_urlsafe(32)
        expires = (datetime.now(timezone.utc) + timedelta(days=settings.session_days)).isoformat()
        with transaction(engine) as db:
            role(db, 'cq_system')
            db.add(AccountSession(token_hash=token_hash(token, settings.share_token_pepper), user_id=owner, expires_at=expires))
        response.set_cookie(ACCOUNT_COOKIE, token, max_age=settings.session_days * 86400, secure=settings.cookie_secure, httponly=True, samesite='strict', path='/')

    def limit_auth(request, resource):
        client_ip = request.client.host if request.client else 'local'
        with transaction(engine) as db:
            role(db, 'cq_system')
            consume(db, hashlib.sha256(client_ip.encode()).hexdigest(), resource, 30, 'hour', 'AUTH_RATE_LIMITED')

    @app.post(PREFIX + '/auth/signup', response_model=Envelope, tags=['Authentication'])
    def sign_up(value: AccountCredentials, request: Request, response: Response):
        if not settings.auth_enabled:
            raise Problem('NOT_FOUND', 'Account sign-in is disabled in demo mode.', 404)
        limit_auth(request, 'signup')
        redirect = settings.public_api_origin.rstrip('/') + '/login'
        result = auth_provider('signup?redirect_to=' + quote(redirect, safe=''), {'email': value.email, 'password': value.password})
        if result.get('access_token'):
            issue_account_session(request, response, result['access_token'])
            return envelope(request, {'signed_in': True})
        return envelope(request, {'signed_in': False, 'message': 'If this address can be registered, check your email to confirm your account, then sign in.'})

    @app.post(PREFIX + '/auth/login', response_model=Envelope, tags=['Authentication'])
    def sign_in(value: AccountCredentials, request: Request, response: Response):
        if not settings.auth_enabled:
            raise Problem('NOT_FOUND', 'Account sign-in is disabled in demo mode.', 404)
        limit_auth(request, 'login')
        result = auth_provider('token?grant_type=password', {'email': value.email, 'password': value.password})
        if not result.get('access_token'):
            raise Problem('AUTH_FAILED', 'Could not sign in. Check your details or confirm your email and try again.', 401)
        issue_account_session(request, response, result['access_token'])
        return envelope(request, {'signed_in': True})

    @app.get(PREFIX + '/auth/status', response_model=Envelope, tags=['Authentication'])
    def auth_status(request: Request):
        if not settings.auth_enabled:
            return envelope(request, {'signed_in': False})
        token = request.cookies.get(ACCOUNT_COOKIE)
        if not token or len(token) > 100:
            return envelope(request, {'signed_in': False})
        with transaction(engine) as db:
            role(db, 'cq_system')
            row = db.get(AccountSession, token_hash(token, settings.share_token_pepper))
            return envelope(request, {'signed_in': bool(row and row.expires_at > now())})

    @app.post(PREFIX + '/auth/logout', response_model=Envelope, tags=['Authentication'])
    def sign_out(request: Request, response: Response):
        token = request.cookies.get(ACCOUNT_COOKIE)
        if token and len(token) <= 100:
            with transaction(engine) as db:
                role(db, 'cq_system')
                db.execute(delete(AccountSession).where(AccountSession.token_hash == token_hash(token, settings.share_token_pepper)))
        response.delete_cookie(ACCOUNT_COOKIE, path='/')
        return envelope(request, {'signed_in': False})

    @app.get(PREFIX + '/me/profile', response_model=Envelope, tags=['Workspace'])
    def profile(request: Request, student: StudentDep):
        return envelope(request, student.profile())

    @app.patch(PREFIX + '/me/profile', response_model=Envelope, tags=['Workspace'])
    def update_profile(value: ProfilePatch, request: Request, student: StudentDep):
        student.ws.lock()
        data = {**student.profile(), **value.model_dump(exclude_unset=True)}
        if data.get('locale') is None:
            raise Problem('VALIDATION_FAILED', 'Locale cannot be null.')
        student.ws.save('profile', data)
        if value.chat_history_enabled is False:
            for row in student.ws.list('mentor_message'):
                student.db.delete(row)
        if {'home_city', 'home_district', 'target_districts'} & value.model_fields_set:
            student.refresh_saved_search()
        return envelope(request, data)

    @app.get(PREFIX + '/me/preferences', response_model=Envelope, tags=['Workspace'])
    def preferences(request: Request, student: StudentDep):
        return envelope(request, student.preferences())

    @app.put(PREFIX + '/me/preferences', response_model=Envelope, tags=['Workspace'])
    def set_preferences(value: Preferences, request: Request, student: StudentDep):
        return envelope(request, student.save_preferences(value.model_dump()))

    @app.put(PREFIX + '/me/sensitive', response_model=Envelope, tags=['Workspace'])
    def set_sensitive(value: SensitiveInput, request: Request, student: StudentDep):
        student.db.merge(Sensitive(user_id=student.ws.user_id, category_code=value.category_code))
        return envelope(request, {'saved': True})

    @app.get(PREFIX + '/me/sensitive', response_model=Envelope, tags=['Workspace'])
    def own_sensitive(request: Request, student: StudentDep):
        return envelope(request, {'category_code': student.category()})

    @app.put(PREFIX + '/me/goal', response_model=Envelope, tags=['Workspace'])
    def set_goal(value: GoalInput, request: Request, student: StudentDep):
        return envelope(request, student.goal(value.pathway_id))

    @app.get(PREFIX + '/subjects/{board}', response_model=Envelope, tags=['Results'])
    def subjects(board: str, request: Request):
        if board not in {'SSC_MH', 'CBSE', 'ICSE'}:
            raise Problem('NOT_FOUND', 'Board not found.', 404)
        from .pdf_extract import SUBJECTS
        return envelope(request, {'board': board, 'subjects': [{'name': k.title(), 'canonical_subject': v} for k, v in SUBJECTS.items()], 'notice': 'Suggested labels only. Enter subjects as shown on your marksheet. Official board aggregate rules are unverified.'})

    @app.post(PREFIX + '/results/manual', response_model=Envelope[ResultView], tags=['Results'])
    def manual(value: ManualResult, request: Request, student: StudentDep):
        return envelope(request, student.create_result(value))

    @app.get(PREFIX + '/results', response_model=Envelope, tags=['Results'])
    def result_list(request: Request, student: StudentDep, limit: int = Query(20, ge=1, le=50), cursor: str | None = Query(None, max_length=100)):
        rows = student.ws.list('result')
        if cursor:
            rows = [r for r in rows if (r.created_at, r.id) > next(((x.created_at, x.id) for x in rows if x.id == cursor), ('9999', ''))]
        return envelope(request, {'items': [{'result_id': r.id, **r.data} for r in rows[:limit]], 'next_cursor': rows[limit - 1].id if len(rows) > limit else None})

    @app.get(PREFIX + '/results/{result_id}', response_model=Envelope[ResultView], tags=['Results'])
    def result_detail(result_id: str, request: Request, student: StudentDep):
        row = student.ws.require('result', result_id)
        return envelope(request, {'result_id': row.id, **row.data})

    @app.put(PREFIX + '/results/{result_id}/confirm', response_model=Envelope[ResultView], tags=['Results'])
    def confirm(result_id: str, value: ConfirmResult, request: Request, student: StudentDep):
        return envelope(request, student.confirm(result_id, value.subjects))

    @app.get(PREFIX + '/me/snapshot', response_model=Envelope[AcademicSummary | None], tags=['Results'])
    def academic_snapshot(request: Request, student: StudentDep):
        return envelope(request, student.academic())

    @app.post(PREFIX + '/results/upload-url', response_model=Envelope, tags=['Results'])
    def upload_url(value: UploadRequest, request: Request, student: StudentDep):
        if value.size > settings.max_upload_bytes:
            raise Problem('UPLOAD_REJECTED', 'PDF exceeds this deployment\'s configured upload limit. Use a smaller PDF or manual entry.')
        consume(student.db, student.ws.user_id, 'uploads', 10)
        expires = int(time.time()) + 300
        row = student.ws.put('document', {'mime': value.mime, 'size': value.size, 'delete_after': (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(), 'content': None})
        payload = base64.urlsafe_b64encode(json.dumps({'document_id': row.id, 'owner': student.ws.user_id, 'expires': expires}).encode()).decode()
        signature = hmac.new(settings.share_token_pepper.encode(), payload.encode(), hashlib.sha256).hexdigest()
        return envelope(request, {'document_id': row.id, 'upload_url': settings.public_api_origin.rstrip('/') + PREFIX + '/uploads/' + row.id + '?token=' + payload + '.' + signature, 'method': 'PUT', 'expires_in_seconds': 300, 'notice': 'Demo build. Upload synthetic marksheets only.'})

    @app.put(PREFIX + '/uploads/{document_id}', response_model=Envelope, tags=['Results'])
    async def upload(document_id: str, token: str, request: Request):
        try:
            payload, signature = token.split('.')
            expected = hmac.new(settings.share_token_pepper.encode(), payload.encode(), hashlib.sha256).hexdigest()
            decoded = json.loads(base64.urlsafe_b64decode(payload))
            if not hmac.compare_digest(signature, expected) or decoded['document_id'] != document_id or decoded['expires'] <= time.time():
                raise ValueError()
        except Exception:
            raise Problem('UPLOAD_REJECTED', 'Upload link is invalid or expired.', 403) from None
        content = bytearray()
        async for chunk in request.stream():
            content.extend(chunk)
            if len(content) > min(5 * 1024 * 1024, settings.max_upload_bytes):
                raise Problem('UPLOAD_REJECTED', 'PDF exceeds this deployment\'s upload limit.', 413)
        with transaction(engine) as db:
            role(db, 'cq_student', decoded['owner'])
            ws = Workspace(db, decoded['owner'])
            row = ws.require('document', document_id)
            if row.data['content'] is not None or row.data.get('uploaded'):
                raise Problem('CONFLICT', 'Upload link has already been used.', 409)
            if len(content) != row.data['size']:
                raise Problem('UPLOAD_REJECTED', 'Uploaded size does not match the signed request.')
            # Extract before committing anything: the original document never
            # enters the database, including when extraction fails.
            subjects, warnings = await asyncio.to_thread(
                scan_document, bytes(content), row.data['mime'], settings.scanner_backend, settings.scanner_image
            )
            row.data = {**row.data, 'content': None, 'extracted_subjects': subjects,
                        'extraction_warnings': warnings, 'uploaded': True}
        return envelope(request, {'document_id': document_id, 'uploaded': True})

    @app.post(PREFIX + '/results/extract', response_model=Envelope[ResultView], tags=['Results'])
    def extract(value: ExtractRequest, request: Request, student: StudentDep):
        row = student.ws.require('document', value.document_id)
        if row.data.get('result_id'):
            existing = student.ws.require('result', row.data['result_id'])
            return envelope(request, {'result_id': existing.id, **existing.data})
        if row.data['delete_after'] <= now():
            raise Problem('UPLOAD_REJECTED', 'Upload a PDF before extracting, or use manual entry.')
        subjects = row.data.get('extracted_subjects')
        warnings = row.data.get('extraction_warnings', [])
        if subjects is None:
            # Compatibility with documents uploaded before this change.
            if not row.data.get('content'):
                raise Problem('UPLOAD_REJECTED', 'Upload a PDF before extracting, or use manual entry.')
            subjects, warnings = scan_document(base64.b64decode(row.data['content']), row.data['mime'], settings.scanner_backend, settings.scanner_image)
        data = student.create_result({'board': value.board, 'exam_year': value.exam_year, 'result_type': 'official', 'subjects': subjects}, 'pdf_text' if row.data['mime'] == 'application/pdf' else 'image_vision', value.document_id)
        row.data = {**row.data, 'content': None, 'extracted_subjects': None,
                    'extraction_warnings': None, 'result_id': data['result_id']}
        return envelope(request, {**data, 'warnings': warnings}, warnings)

    @app.get(PREFIX + '/compass/mission', response_model=Envelope, tags=['Compass'])
    def mission_content(request: Request):
        return envelope(request, mission())

    @app.post(PREFIX + '/compass/sessions', response_model=Envelope, tags=['Compass'])
    def start_mission(value: StartMission, request: Request, student: StudentDep):
        return envelope(request, student.start(value.locale))

    @app.get(PREFIX + '/compass/sessions/{session_id}', response_model=Envelope, tags=['Compass'])
    def resume(session_id: str, request: Request, student: StudentDep):
        row = student.ws.require('game_session', session_id)
        return envelope(request, {'session_id': row.id, 'ruleset': row.data['ruleset'], 'state': row.data['state'], 'node': current_node(mission(), row.data)})

    @app.post(PREFIX + '/compass/sessions/{session_id}/events', response_model=Envelope, tags=['Compass'])
    def event(session_id: str, value: GameEvent, request: Request, student: StudentDep):
        return envelope(request, student.game_event(session_id, value))

    @app.post(PREFIX + '/compass/report', response_model=Envelope[CompassReport], tags=['Compass'])
    def create_compass(value: CompassReportInput, request: Request, student: StudentDep):
        return envelope(request, student.make_report(value.session_id))

    @app.get(PREFIX + '/compass/report', response_model=Envelope[CompassReport | None], tags=['Compass'])
    def compass_report(request: Request, student: StudentDep):
        row = student.ws.get('compass_report')
        return envelope(request, {'report_id': row.id, **row.data} if row else None)

    @app.get(PREFIX + '/colleges', response_model=Envelope, tags=['Catalogue'])
    def colleges(request: Request, db: PublicDB, district: str | None = Query(None, max_length=100), pathway: str | None = Query(None, max_length=40), management: str | None = Query(None, max_length=40), q: str | None = Query(None, max_length=100), academic_year: str | None = Query(None, pattern=r'^20\d{2}-\d{2}$'), max_annual_fee: int | None = Query(None, ge=0, le=100000000), limit: int = Query(20, ge=1, le=50), cursor: str | None = Query(None, max_length=100)):
        query = catalogue.public_query()
        search_score = None
        if district:
            query = query.where(func.lower(catalogue.Institution.district) == (catalogue.district_name(district) or district).casefold())
        if pathway:
            query = query.where(catalogue.Offering.pathway_id == pathway)
        if management:
            query = query.where(catalogue.Institution.management == management)
        if q:
            query, search_score = catalogue.directory_search(query, q)
        if academic_year:
            query = query.where(catalogue.Offering.academic_year == academic_year)
        if max_annual_fee is not None:
            candidates = local_catalogue.fee_candidates(max_annual_fee, session=db)
            valid = []
            for start in range(0, len(candidates), 500):
                ids = list(candidates)[start:start + 500]
                for offering in db.scalars(select(catalogue.Offering).where(catalogue.Offering.id.in_(ids))):
                    if candidates[offering.id] == (offering.institution_id, offering.data.get('program_code')):
                        valid.append(offering.id)
            query = query.where(catalogue.Offering.id.in_(valid))
        total = db.scalar(select(func.count()).select_from(query.subquery()))
        if cursor and search_score is not None:
            try:
                position = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
                if position['q'] != hashlib.sha256(q.encode()).hexdigest()[:8] or not isinstance(position['s'], int) or not isinstance(position['i'], str):
                    raise ValueError()
                query = query.where((search_score < position['s']) | ((search_score == position['s']) & (catalogue.Offering.id > position['i'])))
            except (ValueError, KeyError, TypeError, UnicodeError):
                raise Problem('VALIDATION_FAILED', 'Search cursor is invalid. Start a new search.') from None
        elif cursor:
            query = query.where(catalogue.Offering.id > cursor)
        if search_score is not None:
            rows = list(db.execute(query.add_columns(search_score.label('search_score')).order_by(search_score.desc(), catalogue.Offering.id).limit(limit + 1)))
            next_cursor = base64.urlsafe_b64encode(json.dumps({'q': hashlib.sha256(q.encode()).hexdigest()[:8], 's': rows[limit - 1][2], 'i': rows[limit - 1][0].id}, separators=(',', ':')).encode()).decode() if len(rows) > limit else None
        else:
            rows = list(db.execute(query.order_by(catalogue.Offering.id).limit(limit + 1)))
            next_cursor = rows[limit - 1][0].id if len(rows) > limit else None
        return envelope(request, {'items': [{**catalogue.offering_facts(row[0], row[1]), **local_catalogue.evidence(row[0].id, row[1].id, row[0].data.get('program_code'), session=db)} for row in rows[:limit]], 'next_cursor': next_cursor, 'total': total, 'fee_filter_available': local_catalogue.available(session=db)})

    @app.get(PREFIX + '/catalogue/stats', response_model=Envelope, tags=['Catalogue'])
    def catalogue_stats(request: Request, db: PublicDB):
        institutions = db.scalar(select(func.count()).select_from(catalogue.Institution).where(catalogue.Institution.publish_state == 'published'))
        offerings = db.scalar(select(func.count()).select_from(catalogue.public_query().subquery()))
        sources = db.scalar(select(func.count()).select_from(catalogue.Source))
        history = db.scalar(select(func.count()).select_from(catalogue.Cutoff).join(catalogue.Offering).join(catalogue.Institution).where(catalogue.Offering.publish_state == 'published', catalogue.Institution.publish_state == 'published'))
        return envelope(request, {'institutions': institutions, 'offerings': offerings, 'sources': sources, 'historical_records': history, 'districts': len(catalogue.DISTRICTS)})

    @app.get(PREFIX + '/offerings/{offering_id}', response_model=Envelope[OfferingFacts], tags=['Catalogue'])
    def offering(offering_id: str, request: Request, db: PublicDB):
        return envelope(request, catalogue.get_offering(db, offering_id))

    @app.get(PREFIX + '/master/offerings/{offering_id}', response_model=Envelope, tags=['Catalogue'])
    def master_offering(offering_id: str, request: Request, db: PublicDB):
        if not settings.master_enabled:
            return envelope(request, None)
        return envelope(request, master_catalogue.detail(db, offering_id))

    @app.get(PREFIX + '/sources/{source_id}', response_model=Envelope, tags=['Catalogue'])
    def source_detail(source_id: str, request: Request, db: PublicDB):
        row = db.get(catalogue.Source, source_id)
        if row is None:
            raise Problem('NOT_FOUND', 'Source not found.', 404)
        return envelope(request, {'source_id': row.id, **row.data})

    @app.post(PREFIX + '/match', response_model=Envelope[MatchOutput], tags=['Matching'])
    def match(value: MatchRequest, request: Request, student: StudentDep):
        consume(student.db, student.ws.user_id, 'matches', 60, 'hour', 'CONFLICT')
        return envelope(request, student.match(value.preferences.model_dump() if value.preferences else None, value.admission_context.model_dump() if value.admission_context else None, value.limit, value.cursor))

    @app.get(PREFIX + '/cutoff-options', response_model=Envelope, tags=['Matching'])
    def cutoff_options(request: Request, db: PublicDB):
        return envelope(request, {'available': local_catalogue.available(session=db), 'options': local_catalogue.cutoff_options(session=db)})

    @app.post(PREFIX + '/cutoff-recommendations', response_model=Envelope, tags=['Matching'])
    def cutoff_recommendations(value: CutoffRecommendationInput, request: Request, student: StudentDep):
        if not student.academic():
            raise Problem('VALIDATION_FAILED', 'Confirm your marksheet result before comparing cutoffs.', 422)
        consume(student.db, student.ws.user_id, 'matches', 60, 'hour', 'CONFLICT')
        rows = local_catalogue.historical_candidates(value.academic_year, value.round, value.stage, value.seat_type, value.merit_percent, session=student.db)
        if rows is None:
            raise Problem('NOT_FOUND', 'Historical cutoff data is not available on this server.', 404)
        candidates = {'dump:' + str(row['offering_id']): row for row in rows}
        valid = []
        ids = list(candidates)
        for start in range(0, len(ids), 500):
            query = catalogue.public_query().where(catalogue.Offering.id.in_(ids[start:start + 500]), catalogue.Offering.pathway_id == 'polytechnic_diploma')
            for offering, institution in student.db.execute(query):
                item = candidates[offering.id]
                if institution.id != 'dump:' + str(item['institution_id']) or offering.data.get('program_code') != item['choice_code']:
                    continue
                valid.append({**item, 'offering_id': offering.id, 'name': institution.name, 'program_name': offering.data['program_name'], 'district': institution.district, 'difference': round(value.merit_percent - item['cutoff_percent'], 2)})
        valid.sort(key=lambda row: (row['difference'], row['name'].casefold(), row['offering_id']))
        return envelope(request, {'items': valid[:50], 'total': len(valid), 'merit_percent': value.merit_percent, 'notice': 'Historical code-matched records are unconfirmed; this is not an admission prediction.'})

    @app.post(PREFIX + '/costs/compare', response_model=Envelope, tags=['Costs'])
    def compare(value: CostCompare, request: Request, student: StudentDep):
        if len(set(value.offering_ids)) != len(value.offering_ids) or set(value.assumptions_by_offering) - set(value.offering_ids):
            raise Problem('VALIDATION_FAILED', 'Use distinct offerings and assumptions for those offerings only.')
        results = [catalogue.costs_for(student.db, oid, value.academic_year, value.assumptions_by_offering.get(oid, value.assumptions).model_dump(), student.category()) for oid in value.offering_ids]
        result = {'offerings': results, 'academic_year': value.academic_year}
        student.ws.save('cost_comparison', result)
        return envelope(request, result)

    @app.get(PREFIX + '/costs/last', response_model=Envelope, tags=['Costs'])
    def last_costs(request: Request, student: StudentDep):
        row = student.ws.get('cost_comparison')
        return envelope(request, row.data if row else None)

    @app.get(PREFIX + '/me/shortlist', response_model=Envelope, tags=['Workspace'])
    def shortlist(request: Request, student: StudentDep, limit: int = Query(20, ge=1, le=50), cursor: str | None = Query(None, max_length=100)):
        return envelope(request, paginated(student.shortlist(), limit, cursor))

    @app.put(PREFIX + '/me/shortlist/{offering_id}', response_model=Envelope, tags=['Workspace'])
    def save_shortlist(offering_id: str, value: ShortlistInput, request: Request, student: StudentDep):
        catalogue.get_offering(student.db, offering_id, include_cutoffs=False)
        record_id = 'shortlist:' + student.ws.user_id + ':' + offering_id
        existing = student.ws.get('shortlist', record_id)
        revision = existing.data.get('revision', 0) + 1 if existing else 1
        row = student.ws.put('shortlist', {**value.model_dump(), 'offering_id': offering_id, 'revision': revision, 'updated_at': now()}, record_id)
        student.ws.emit('SHORTLIST_CHANGED', row.id, revision)
        return envelope(request, row.data)

    @app.delete(PREFIX + '/me/shortlist/{offering_id}', response_model=Envelope, tags=['Workspace'])
    def remove_shortlist(offering_id: str, request: Request, student: StudentDep):
        record_id = 'shortlist:' + student.ws.user_id + ':' + offering_id
        row = student.ws.get('shortlist', record_id)
        if row:
            student.db.delete(row)
            student.ws.emit('SHORTLIST_CHANGED', uid())
        return envelope(request, {'deleted': True})

    @app.get(PREFIX + '/me/dashboard', response_model=Envelope, tags=['Workspace'])
    def dashboard(request: Request, student: StudentDep):
        return envelope(request, student.dashboard())

    @app.put(PREFIX + '/me/checklist/{item_id}', response_model=Envelope, tags=['Workspace'])
    def checklist(item_id: str, value: ChecklistInput, request: Request, student: StudentDep):
        row = student.ws.require('checklist', item_id)
        row.data = {**row.data, 'done': value.done}
        return envelope(request, {'id': row.id, **row.data})

    @app.get(PREFIX + '/guides/{pathway_id}', response_model=Envelope, tags=['Catalogue'])
    def admission_guide(pathway_id: str, request: Request):
        return envelope(request, guide(pathway_id))

    @app.post(PREFIX + '/mentor/chat', response_model=Envelope[MentorReply], tags=['Mentor'])
    def mentor(value: MentorInput, request: Request, student: StudentDep):
        consume(student.db, student.ws.user_id, 'mentor', 15)
        result = chat(student, settings, value.message, value.locale or student.profile().get('locale', 'en'), value.confirm_preference_change_id, value.page_path, value.provider_consent)
        # A modest explicit-interest suggestion. It is never active memory until
        # the student accepts it, and inferences are not injected into the model.
        interest = re.fullmatch(r'I (?:enjoy|like|love) ([A-Za-z ,&-]{2,100})[.!]?', value.message, re.I)
        if interest and not re.search(r'category|caste|religion|health|income', value.message, re.I):
            row = student.ws.put('memory_suggestion', {'kind': 'inference', 'content': 'May enjoy ' + interest[1] + ' (guess)', 'origin': 'student_stated_interest', 'accepted': False})
            result['memory_suggestions'] = [{'suggestion_id': row.id, 'content': row.data['content'], 'requires_confirmation': True}]
        return envelope(request, result)

    @app.get(PREFIX + '/me/memory', response_model=Envelope, tags=['Mentor'])
    def memory(request: Request, student: StudentDep, limit: int = Query(20, ge=1, le=50), cursor: str | None = Query(None, max_length=100)):
        return envelope(request, paginated([{'id': r.id, **r.data} for r in student.ws.list('memory')], limit, cursor))

    @app.get(PREFIX + '/mentor/messages', response_model=Envelope, tags=['Mentor'])
    def mentor_messages(request: Request, student: StudentDep, limit: int = Query(30, ge=1, le=50), cursor: str | None = Query(None, max_length=100)):
        rows = student.ws.list('mentor_message')
        if cursor:
            positions = [index for index, row in enumerate(rows) if row.id == cursor]
            if not positions:
                raise Problem('VALIDATION_FAILED', 'Invalid pagination cursor.')
            rows = rows[:positions[0]]
        selected = rows[-limit:]
        return envelope(request, {'items': [{'id': row.id, 'role': row.data['role'], 'content': row.data['content'], 'created_at': row.created_at, 'sources': row.data.get('sources', []), 'source_links': row.data.get('source_links', [])} for row in selected], 'next_cursor': selected[0].id if len(rows) > limit else None})

    @app.delete(PREFIX + '/me/memory', response_model=Envelope, tags=['Mentor'])
    def clear_memory(request: Request, student: StudentDep):
        for row in student.ws.list('memory'):
            student.db.delete(row)
        return envelope(request, {'deleted': True})

    @app.delete(PREFIX + '/me/memory/{memory_id}', response_model=Envelope, tags=['Mentor'])
    def delete_memory(memory_id: str, request: Request, student: StudentDep):
        row = student.ws.require('memory', memory_id)
        student.db.delete(row)
        return envelope(request, {'deleted': True})

    @app.post(PREFIX + '/me/memory/{suggestion_id}/accept', response_model=Envelope, tags=['Mentor'])
    def accept_memory(suggestion_id: str, request: Request, student: StudentDep):
        row = student.ws.require('memory_suggestion', suggestion_id)
        saved = student.ws.put('memory', {**{k: row.data[k] for k in ('kind', 'content', 'origin')}, 'student_allowed': True}, 'accepted:' + row.id)
        row.data = {**row.data, 'accepted': True}
        return envelope(request, {'id': saved.id, **saved.data})

    @app.delete(PREFIX + '/me/chat-history', response_model=Envelope, tags=['Mentor'])
    def clear_chat(request: Request, student: StudentDep):
        for row in student.ws.list('mentor_message'):
            student.db.delete(row)
        return envelope(request, {'deleted': True})

    @app.post(PREFIX + '/parent-reports', response_model=Envelope, tags=['Parent reports'])
    def parent_report(value: ParentReportInput, request: Request, student: StudentDep):
        return envelope(request, student.parent_report(value, settings))

    @app.get(PREFIX + '/me/parent-reports', response_model=Envelope, tags=['Parent reports'])
    def parent_report_list(request: Request, student: StudentDep, limit: int = Query(20, ge=1, le=50), cursor: str | None = Query(None, max_length=100)):
        rows = list(student.db.scalars(select(Share).where(Share.user_id == student.ws.user_id).order_by(Share.expires_at.desc(), Share.id)))
        return envelope(request, paginated([{'id': row.id, 'report_id': row.report_id, 'expires_at': row.expires_at, 'revoked': row.revoked, 'sections': list(row.snapshot.get('sections', {}))} for row in rows], limit, cursor))

    @app.delete(PREFIX + '/parent-reports/{report_id}/share', response_model=Envelope, tags=['Parent reports'])
    def revoke(report_id: str, request: Request, student: StudentDep):
        row = student.db.scalar(select(Share).where(Share.user_id == student.ws.user_id, Share.report_id == report_id))
        if row is None:
            raise Problem('NOT_FOUND', 'Report not found.', 404)
        row.revoked = True
        student.ws.emit('PARENT_SHARE_REVOKED', report_id)
        return envelope(request, {'revoked': True})

    @app.get(PREFIX + '/r/{token}', response_model=Envelope, tags=['Parent reports'])
    def shared_report(token: str, request: Request, locale: str | None = Query(None, pattern='^(en|mr|hi)$')):
        with transaction(engine) as db:
            role(db, 'cq_system')
            row = db.scalar(select(Share).where(Share.token_hash == token_hash(token, settings.share_token_pepper), Share.revoked.is_(False), Share.expires_at > now()))
            if not row:
                raise Problem('SHARE_EXPIRED_OR_REVOKED', 'Share link is unavailable.', 404)
            locale = locale or row.snapshot.get('locale_default', 'en')
            labels = {'en': {'costs': 'Costs', 'next_steps': 'Next steps', 'academic_summary': 'Academic summary', 'shortlist': 'Shortlist'}, 'mr': {'costs': 'खर्च', 'next_steps': 'पुढील पावले', 'academic_summary': 'शैक्षणिक सारांश', 'shortlist': 'निवडलेली यादी'}, 'hi': {'costs': 'खर्च', 'next_steps': 'अगले कदम', 'academic_summary': 'शैक्षणिक सारांश', 'shortlist': 'चुनी हुई सूची'}}
            return envelope(request, {**row.snapshot, 'locale': locale, 'labels': labels[locale], 'translation_note': 'Labels are translated; source institution and program names remain as published.'})

    @app.get(PREFIX + '/data/coverage', response_model=Envelope, tags=['Catalogue'])
    def data_coverage(request: Request, db: PublicDB):
        return envelope(request, catalogue.coverage(db))

    @app.delete(PREFIX + '/me', response_model=Envelope, tags=['Workspace'])
    def delete_workspace(request: Request, response: Response, student: StudentDep):
        owner = student.ws.user_id
        for model in (Share, Sensitive, DomainEvent, Record, RateCounter):
            student.db.execute(delete(model).where(model.user_id == owner))
        role(student.db, 'cq_system')
        student.db.execute(delete(GuestSession).where(GuestSession.user_id == owner))
        student.db.execute(delete(AccountSession).where(AccountSession.user_id == owner))
        response.delete_cookie(COOKIE, path='/')
        response.delete_cookie(ACCOUNT_COOKIE, path='/')
        return envelope(request, {'deleted': True})

    return app


app = create_app()
