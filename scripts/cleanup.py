"""Run daily with administrator DATABASE_URL; no additional paid scheduler needed."""
import sys
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/api'))
from app.config import Settings  # noqa: E402
from app.db import make_engine  # noqa: E402
from app.retention import cleanup  # noqa: E402

print(json.dumps(cleanup(make_engine(Settings().database_url)), indent=2))
