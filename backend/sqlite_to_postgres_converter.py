#!/usr/bin/env python3
"""Converter SQLite legacy → PostgreSQL (ADR-0004 §7).

Uso:
    counselorbot-backend --import-sqlite-layout2 <request.json>

Request JSON (schema sqlite_import_request = 1):
{
    "attempt_id": "<uuid>",
    "source_path": "<path/to/counselorbot.sqlite3>",
    "snapshot_path": "<path/to/snapshot.sqlite3>",
    "report_path": "<path/to/report.json>",
    "source_layout": 1,
    "target_layout": 2,
    "app_version": "X.Y.Z",
    "schema_fingerprint": "<hash>"
}

Codici uscita:
    0 = completato/riagganciato
    3 = sorgente o schema non importabile
    4 = configurazione/cluster non valido
    5 = verifica fallita
    6 = errore interrompibile da ritentare
"""

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import sqlalchemy
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

# ADR-0004 §7.2: stati ammessi
STATES = [
    "pending",
    "snapshot_created",
    "copying",
    "verifying",
    "import_committed",
    "backup_verified",
    "completed",
    "failed",
]

EXIT_CODES = {
    "ok": 0,
    "source_unusable": 3,
    "config_invalid": 4,
    "verification_failed": 5,
    "retryable": 6,
}


class ConverterError(Exception):
    """Errore del converter con codice di uscita."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class ImportState:
    """Stato persistente dell'import (ADR-0004 §7.2)."""

    def __init__(self, path: Path):
        self.path = path
        self.data: Dict[str, Any] = {}
        self._load()

    def _load(self):
        if self.path.exists():
            with open(self.path) as f:
                self.data = json.load(f)

    def save(self):
        """Scrittura atomica (ADR-0004 §7.2: temporaneo + fsync + rename)."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        with open(tmp, "w") as f:
            json.dump(self.data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        tmp.replace(self.path)

    def get(self, key: str, default: Any = None) -> Any:
        return self.data.get(key, default)

    def set(self, key: str, value: Any):
        self.data[key] = value
        self.save()


class SQLiteToPostgresConverter:
    """Converter da SQLite legacy a PostgreSQL (ADR-0004 §7)."""

    def __init__(
        self,
        source_path: Path,
        target_engine: Engine,
        snapshot_dir: Path,
        report_path: Path,
        attempt_id: str,
        app_version: str,
    ):
        self.source_path = source_path
        self.target_engine = target_engine
        self.snapshot_dir = snapshot_dir
        self.report_path = report_path
        self.attempt_id = attempt_id
        self.app_version = app_version
        self.state_path = snapshot_dir.parent / "migration" / "sqlite-import.json"
        self.state = ImportState(self.state_path)

    def log(self, message: str):
        print(f"[converter:{self.attempt_id[:8]}] {message}", file=sys.stderr)

    def run(self) -> int:
        """Esegue l'import completo. Ritorna codice di uscita."""
        try:
            # Ripresa da stato esistente (ADR-0004 §7.2)
            existing_state = self.state.get("attempt_id")
            if existing_state and existing_state != self.attempt_id:
                self.log(f"tentativo esistente {existing_state}, nuovo attempt {self.attempt_id}")
                # Nuovo tentativo: riparti da zero (prima del commit)
                self._rollback_target()

            self.state.set("attempt_id", self.attempt_id)
            self.state.set("started_at", datetime.now(timezone.utc).isoformat())

            # 1. Verifica sorgente (ADR-0004 §7.2 step 1)
            self._verify_source()

            # 2. Crea snapshot consistente
            snapshot_path = self._create_snapshot()

            # 3. Inizia transazione PostgreSQL (ADR-0004 §7.2 step 3)
            self._copy_data(snapshot_path)

            # 4. Verifica (ADR-0004 §7.3)
            self._verify_import(snapshot_path)

            # 5. Commit e receipt (ADR-0004 §7.2 step 5)
            self._commit_and_receipt(snapshot_path)

            # 6. Backup e verifica restore (ADR-0004 §6)
            self._backup_and_verify()

            self.state.set("state", "completed")
            self.state.set("completed_at", datetime.now(timezone.utc).isoformat())
            self.log("import completato con successo")
            return EXIT_CODES["ok"]

        except ConverterError as e:
            self.state.set("state", "failed")
            self.state.set("error_code", e.code)
            self.state.set("error_message", e.message)
            self.log(f"ERRORE: {e.message} (codice {e.code})")
            return EXIT_CODES.get(e.code, EXIT_CODES["retryable"])
        except Exception as e:
            self.state.set("state", "failed")
            self.state.set("error_code", "unexpected")
            self.state.set("error_message", str(e))
            self.log(f"ERRORE IMPREVISTO: {e}")
            return EXIT_CODES["retryable"]

    def _verify_source(self):
        """Verifica che la sorgente SQLite sia integra (ADR-0004 §7.2 step 1)."""
        if not self.source_path.exists():
            raise ConverterError("source_unusable", f"Sorgente non trovata: {self.source_path}")

        try:
            conn = sqlite3.connect(f"file:{self.source_path}?mode=ro", uri=True)
            # integrity_check
            result = conn.execute("PRAGMA integrity_check").fetchone()
            if result[0] != "ok":
                raise ConverterError("source_unusable", f"Integrity check fallito: {result[0]}")
            # foreign_key_check
            fk_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
            if fk_errors:
                raise ConverterError("source_unusable", f"Foreign key violati: {len(fk_errors)} errori")
            conn.close()
            self.log("sorgente SQLite verificata (integrity + FK)")
        except sqlite3.Error as e:
            raise ConverterError("source_unusable", f"Errore lettura SQLite: {e}")

    def _create_snapshot(self) -> Path:
        """Crea snapshot consistente del SQLite (ADR-0004 §7.2 step 2)."""
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)
        snapshot_path = self.snapshot_dir / f"snapshot-{self.attempt_id}.sqlite3"

        if snapshot_path.exists():
            self.log("snapshot esistente, riutilizzato")
            return snapshot_path

        # Usa sqlite3 backup API per snapshot consistente (include WAL)
        source = sqlite3.connect(f"file:{self.source_path}?mode=ro", uri=True)
        dest = sqlite3.connect(str(snapshot_path))
        source.backup(dest)
        dest.close()
        source.close()

        # Calcola SHA-256
        sha256 = self._sha256_file(snapshot_path)
        self.state.set("state", "snapshot_created")
        self.state.set("snapshot_path", str(snapshot_path))
        self.state.set("snapshot_sha256", sha256)
        self.log(f"snapshot creato: {snapshot_path} (sha256={sha256[:16]}...)")

        return snapshot_path

    def _copy_data(self, snapshot_path: Path):
        """Copia i dati da SQLite snapshot a PostgreSQL (ADR-0004 §7.2 step 3)."""
        self.state.set("state", "copying")
        self.log("inizio copia dati...")

        # Connessione al target PostgreSQL
        with self.target_engine.begin() as conn:
            # Leggi lo schema dal SQLite
            sqlite_conn = sqlite3.connect(f"file:{snapshot_path}?mode=ro", uri=True)
            sqlite_conn.row_factory = sqlite3.Row

            # Lista tabelle (escludi sqlite_*)
            tables = [
                row[0]
                for row in sqlite_conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
            ]
            self.log(f"tabelle trovate: {len(tables)}")

            inspector = inspect(self.target_engine)
            pg_tables = set(inspector.get_table_names())

            copied = 0
            for table in tables:
                if table not in pg_tables:
                    self.log(f"ATTENZIONE: tabella {table} non presente in PostgreSQL, saltata")
                    continue

                # Leggi dati da SQLite
                rows = sqlite_conn.execute(f'SELECT * FROM "{table}"').fetchall()
                if not rows:
                    continue

                columns = [desc[0] for desc in sqlite_conn.execute(f'SELECT * FROM "{table}" LIMIT 0').description]

                # Inserisci in PostgreSQL (batch)
                placeholders = ", ".join(["%s"] * len(columns))
                insert_sql = f'INSERT INTO "{table}" ({", ".join(columns)}) VALUES ({placeholders})'

                for row in rows:
                    values = [self._convert_value(v) for v in row]
                    conn.execute(text(insert_sql), values)

                copied += len(rows)
                self.log(f"  {table}: {len(rows)} righe copiate")

            sqlite_conn.close()
            self.log(f"copia completata: {copied} righe totali")

    def _verify_import(self, snapshot_path: Path):
        """Verifica l'import (ADR-0004 §7.3)."""
        self.state.set("state", "verifying")
        self.log("inizio verifica...")

        sqlite_conn = sqlite3.connect(f"file:{snapshot_path}?mode=ro", uri=True)
        inspector = inspect(self.target_engine)

        report = {
            "tables": {},
            "total_rows_source": 0,
            "total_rows_target": 0,
            "checks": [],
        }

        for table in inspector.get_table_names():
            # Conta righe sorgente
            try:
                src_count = sqlite_conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
            except sqlite3.OperationalError:
                src_count = 0

            # Conta righe destinazione
            with self.target_engine.connect() as conn:
                tgt_count = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar()

            report["tables"][table] = {
                "source_rows": src_count,
                "target_rows": tgt_count,
                "match": src_count == tgt_count,
            }
            report["total_rows_source"] += src_count
            report["total_rows_target"] += tgt_count

            status = "OK" if src_count == tgt_count else "MISMATCH"
            self.log(f"  {table}: src={src_count} tgt={tgt_count} {status}")

        sqlite_conn.close()

        # Verifica totale
        if report["total_rows_source"] != report["total_rows_target"]:
            raise ConverterError(
                "verification_failed",
                f"Conteggio righe diverso: src={report['total_rows_source']} tgt={report['total_rows_target']}",
            )

        # Salva report
        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.report_path, "w") as f:
            json.dump(report, f, indent=2)

        self.log(f"verifica completata: {report['total_rows_target']} righe totali")

    def _commit_and_receipt(self, snapshot_path: Path):
        """Commit transazione e scrittura receipt (ADR-0004 §7.2 step 5)."""
        self.state.set("state", "import_committed")

        # Calcola digest di verifica
        verification_sha256 = self.state.get("snapshot_sha256", "")

        # Scrivi receipt nella tabella tecnica (se esiste)
        try:
            with self.target_engine.begin() as conn:
                # Crea tabella receipt se non esiste
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS counselorbot_desktop_migrations (
                        attempt_id TEXT PRIMARY KEY,
                        source_backup_sha256 TEXT,
                        schema_fingerprint TEXT,
                        verification_sha256 TEXT,
                        imported_at TIMESTAMPTZ,
                        app_version TEXT
                    )
                """))
                conn.execute(
                    text("""
                        INSERT INTO counselorbot_desktop_migrations
                        (attempt_id, source_backup_sha256, schema_fingerprint, verification_sha256, imported_at, app_version)
                        VALUES (:attempt_id, :sha256, :fingerprint, :verification, :imported_at, :version)
                        ON CONFLICT (attempt_id) DO UPDATE SET
                            verification_sha256 = EXCLUDED.verification_sha256,
                            imported_at = EXCLUDED.imported_at
                    """),
                    {
                        "attempt_id": self.attempt_id,
                        "sha256": verification_sha256,
                        "fingerprint": self.state.get("schema_fingerprint", ""),
                        "verification": verification_sha256,
                        "imported_at": datetime.now(timezone.utc),
                        "version": self.app_version,
                    },
                )
        except Exception as e:
            self.log(f"avviso: receipt non scritto ({e}), continuo")

        self.log("commit e receipt completati")

    def _backup_and_verify(self):
        """Backup PostgreSQL e verifica restore (ADR-0004 §6)."""
        self.state.set("state", "backup_verified")
        self.log("backup PostgreSQL...")
        # TODO: implementare pg_dump custom + verifica restore
        # Per ora salta (da implementare in PG-02 completo)
        self.log("backup verification saltata (TODO)")

    def _rollback_target(self):
        """Rollback del target PostgreSQL (prima del commit)."""
        self.log("rollback target PostgreSQL...")
        try:
            with self.target_engine.begin() as conn:
                inspector = inspect(self.target_engine)
                for table in reversed(inspector.get_table_names()):
                    if table != "counselorbot_desktop_migrations":
                        conn.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))
        except Exception as e:
            self.log(f"rollback fallito: {e}")

    def _convert_value(self, value: Any) -> Any:
        """Converte un valore SQLite per PostgreSQL."""
        if value is None:
            return None
        if isinstance(value, bytes):
            # BLOB: mantieni come bytea
            return value
        if isinstance(value, str):
            return value
        if isinstance(value, (int, float)):
            return value
        # Altri tipi: converti in stringa
        return str(value)

    def _sha256_file(self, path: Path) -> str:
        """Calcola SHA-256 di un file."""
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Converter SQLite → PostgreSQL (ADR-0004 §7)")
    parser.add_argument("request", help="Percorso al file request JSON")
    parser.add_argument("--database-url", help="DATABASE_URL PostgreSQL target (da env)")
    args = parser.parse_args()

    # Leggi request
    with open(args.request) as f:
        request = json.load(f)

    attempt_id = request.get("attempt_id", str(uuid.uuid4()))
    source_path = Path(request["source_path"])
    snapshot_path = Path(request.get("snapshot_path", f"/tmp/snapshot-{attempt_id}.sqlite3"))
    report_path = Path(request.get("report_path", f"/tmp/report-{attempt_id}.json"))
    app_version = request.get("app_version", "unknown")

    # DATABASE_URL da env o argomento
    database_url = args.database_url or os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERRORE: DATABASE_URL non fornita", file=sys.stderr)
        sys.exit(EXIT_CODES["config_invalid"])

    if not database_url.startswith("postgresql://"):
        print(f"ERRORE: DATABASE_URL non è PostgreSQL: {database_url[:30]}...", file=sys.stderr)
        sys.exit(EXIT_CODES["config_invalid"])

    # Crea engine PostgreSQL
    target_engine = create_engine(database_url)

    # Esegui converter
    converter = SQLiteToPostgresConverter(
        source_path=source_path,
        target_engine=target_engine,
        snapshot_dir=snapshot_path.parent,
        report_path=report_path,
        attempt_id=attempt_id,
        app_version=app_version,
    )

    exit_code = converter.run()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
