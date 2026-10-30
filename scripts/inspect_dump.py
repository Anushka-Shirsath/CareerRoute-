"""Read PostgreSQL COPY data as text. Never execute code from the supplied dump."""
import collections
import json
import re
from pathlib import Path

counts = collections.Counter()
samples = {}
distributions = collections.defaultdict(collections.Counter)
table = None
columns = []
with Path("data/private/careerquest_dump.sql").open(encoding="utf-8") as handle:
    for line in handle:
        match = re.match(r"COPY public\.(\w+) \((.*?)\) FROM stdin;", line)
        if match:
            table, columns = match[1], match[2].split(", ")
        elif line.strip() == r"\.":
            table = None
        elif table:
            values = line.rstrip("\n").split("\t")
            row = dict(zip(columns, values))
            counts[table] += 1
            if len(samples.setdefault(table, [])) < 2:
                samples[table].append(row)
            for key in ("pathway", "management", "data_status", "measurement_type", "academic_year", "source_system", "status", "district_method"):
                if key in row:
                    distributions[f"{table}.{key}"][row[key]] += 1
report = {"counts": counts, "samples": samples, "distributions": dict(distributions)}
Path("data/private/dump_audit.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps({"counts": counts, "distributions": dict(distributions)}, indent=2))
