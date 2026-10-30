import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/api'))
from app.main import app  # noqa: E402

target = ROOT / 'docs/openapi.json'
target.write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False), encoding='utf-8')
print(f'Exported {len(app.openapi()["paths"])} API paths to docs/openapi.json')
