import sys
from pathlib import Path
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/api'))
from app.models import Base  # noqa: E402

folder = ROOT / 'supabase/migrations'
folder.mkdir(parents=True, exist_ok=True)
statements = ['-- Generated from app/models.py. Apply to an empty database as its administrator.\n']
for table in Base.metadata.sorted_tables:
    statements.append(str(CreateTable(table).compile(dialect=postgresql.dialect())) + ';')
    statements.extend(str(CreateIndex(index).compile(dialect=postgresql.dialect())) + ';' for index in sorted(table.indexes, key=lambda i: i.name))
(folder / '0001_core.sql').write_text('\n\n'.join(statements), encoding='utf-8')
