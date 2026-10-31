from pathlib import Path
from typing import Literal
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT / '.env'), extra='ignore')
    database_url: str = f"sqlite:///{(ROOT / 'data/private/careerquest.db').as_posix()}"
    environment: str = 'development'
    allowed_origins: str = 'http://localhost:3000,http://127.0.0.1:3000'
    public_api_origin: str = 'http://127.0.0.1:8000'
    cookie_secure: bool = False
    session_days: int = 30
    share_token_pepper: str = ''
    mentor_enabled: bool = True
    groq_api_key: str = ''
    groq_chat_model: str = 'openai/gpt-oss-120b'
    demo_mode: bool = True
    auth_enabled: bool = False
    master_enabled: bool = False
    evidence_backend: Literal['local', 'postgres'] = 'local'
    scanner_backend: Literal['process', 'docker'] = 'process'
    scanner_image: str = Field(default='careerquest-scanner:local', min_length=1, max_length=200,
                               pattern=r'^[A-Za-z0-9][A-Za-z0-9._/:@-]*$')
    supabase_url: str = ''
    supabase_publishable_key: str = ''
    max_upload_bytes: int = 5 * 1024 * 1024

    def validate_production(self):
        if self.scanner_backend != 'docker' and (self.environment != 'development' or not self.demo_mode):
            raise ValueError('Non-demo deployments require the isolated Docker scanner.')
        if self.environment == 'production':
            if not self.cookie_secure or len(self.share_token_pepper) < 32:
                raise ValueError('Production needs COOKIE_SECURE=true and SHARE_TOKEN_PEPPER (32+ chars).')
            if not self.database_url.startswith('postgresql'):
                raise ValueError('Production requires PostgreSQL with the RLS migration applied.')
            if not self.public_api_origin.startswith('https://'):
                raise ValueError('Production requires an HTTPS PUBLIC_API_ORIGIN.')

