#!/usr/bin/env python3
"""Flag new Postgres-only SQL in the backend (ADR-0003 §5.1, §6).

Counts the lines matching each rule in backend/**/*.py, outside
backend/db_compat.py, the legacy migrations and the tests, and compares them
with scripts/sql-portability-exceptions.txt (`<path> <rule> <count>`).
The check fails when a file has more matches than allowed (new Postgres-only
code: use the db_compat helpers or a dialect branch) and also when it has fewer
(lower the count: the exceptions can only shrink).

Usage (from the repository root):
    python3 scripts/check-sql-portability.py            # check
    python3 scripts/check-sql-portability.py --update   # rewrite the exceptions after removing occurrences
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXCEPTIONS = ROOT / "scripts" / "sql-portability-exceptions.txt"
EXCLUDED = ("backend/db_compat.py", "backend/migrations/", "backend/tests/")
CAST_TYPES = "json|jsonb|text|int|integer|bigint|smallint|interval|regclass|date|timestamp|timestamptz|uuid|varchar|numeric|boolean|bool|float|real"
RULES = {
    "pg-advisory": re.compile(r"pg_(?:try_)?advisory"),
    "pg-cast": re.compile(rf"::\s*(?:{CAST_TYPES})\b", re.IGNORECASE),
    "add-column-if-not-exists": re.compile(r"ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS", re.IGNORECASE),
    "date-trunc": re.compile(r"\bdate_trunc\b", re.IGNORECASE),
    "hashtext": re.compile(r"\bhashtext\b", re.IGNORECASE),
    "postgresql-dialect": re.compile(r"dialects\.postgresql|dialects\s+import\s+postgresql"),
    "datetime-timezone": re.compile(r"DateTime\(\s*timezone\s*=\s*True"),
}


def scan(root=ROOT):
    counts = {}
    for path in sorted((root / "backend").rglob("*.py")):
        rel = path.relative_to(root).as_posix()
        if rel.startswith(EXCLUDED):
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            for rule, pattern in RULES.items():
                if pattern.search(line):
                    counts[(rel, rule)] = counts.get((rel, rule), 0) + 1
    return counts


def load_exceptions(path=EXCEPTIONS):
    allowed = {}
    if not path.exists():
        return allowed
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) != 3 or parts[1] not in RULES or not parts[2].isdigit():
            sys.exit(f"{path.name}:{number}: expected '<path> <rule> <count>', got {raw!r}")
        allowed[(parts[0], parts[1])] = int(parts[2])
    return allowed


def write_exceptions(counts, path=EXCEPTIONS):
    header = (
        "# Postgres-only SQL still allowed in the backend (ADR-0003 §5.1). Checked by scripts/check-sql-portability.py.\n"
        "# <path> <rule> <count>. Counts can only go down: F1-05c..g remove them; never add a line by hand.\n"
    )
    body = "".join(f"{rel} {rule} {count}\n" for (rel, rule), count in sorted(counts.items()))
    path.write_text(header + body, encoding="utf-8")


def compare(counts, allowed):
    errors = []
    for key in sorted(set(counts) | set(allowed)):
        found, limit = counts.get(key, 0), allowed.get(key, 0)
        rel, rule = key
        if found > limit:
            errors.append(f"NEW      {rel}: {rule} {found} > {limit} allowed — use backend/db_compat.py or a dialect branch")
        elif found < limit:
            errors.append(f"SHRUNK   {rel}: {rule} {found} < {limit} allowed — run with --update to lower the count")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--update", action="store_true", help="rewrite the exceptions; refuses to raise any count")
    args = parser.parse_args()
    counts, allowed = scan(), load_exceptions()
    errors = compare(counts, allowed)
    if args.update:
        grown = [error for error in errors if error.startswith("NEW")]
        if grown and allowed:
            print("\n".join(grown))
            sys.exit("refusing to raise the exceptions: remove the new occurrences instead")
        write_exceptions(counts)
        print(f"{EXCEPTIONS.relative_to(ROOT)}: {sum(counts.values())} occurrences in {len(counts)} entries")
        return
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print(f"SQL portability: ok ({sum(counts.values())} known occurrences, none new)")


if __name__ == "__main__":
    main()
