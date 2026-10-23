"""Spike F0-02: embedded Postgres probe for the desktop teacher app.

Downloads a relocatable Postgres build, runs initdb in a per-user data folder,
starts the server on 127.0.0.1 with a random port and boots the real backend
against it, so create_all, the startup migrations and the seeding all run.
Prints a JSON report with sizes and timings. Used by
.github/workflows/spike-embedded-postgres.yml; see
docs/architecture/spikes/f0-02-embedded-postgres.md.
"""
import argparse
import json
import os
import platform
import secrets
import shutil
import socket
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
IS_WINDOWS = os.name == "nt"
EXE = ".exe" if IS_WINDOWS else ""

THESEUS_TARGETS = {
    ("Darwin", "arm64"): "aarch64-apple-darwin",
    ("Darwin", "x86_64"): "x86_64-apple-darwin",
    ("Windows", "AMD64"): "x86_64-pc-windows-msvc",
    ("Linux", "x86_64"): "x86_64-unknown-linux-gnu",
}
ZONKY_TARGETS = {
    ("Darwin", "arm64"): "darwin-arm64v8",
    ("Darwin", "x86_64"): "darwin-amd64",
    ("Windows", "AMD64"): "windows-amd64",
    ("Linux", "x86_64"): "linux-amd64",
}
TOOLS = ["initdb", "pg_ctl", "postgres", "pg_dump", "pg_restore", "psql", "pg_upgrade"]


def user_data_dir() -> Path:
    """Same per-user locations the plan uses for the app data folder."""
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif IS_WINDOWS:
        base = Path(os.environ["APPDATA"])
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "CounselorBotSpike"


def dir_size(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file() and not f.is_symlink())


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def run(cmd, **kwargs):
    started = time.perf_counter()
    result = subprocess.run(cmd, capture_output=True, text=True, check=False, **kwargs)
    elapsed = time.perf_counter() - started
    if result.returncode != 0:
        print(result.stdout, result.stderr, sep="\n", file=sys.stderr)
        raise SystemExit(f"command failed ({result.returncode}): {cmd[0]}")
    return elapsed


def download(url: str, dest: Path) -> float:
    started = time.perf_counter()
    with urllib.request.urlopen(url) as resp, open(dest, "wb") as out:
        shutil.copyfileobj(resp, out)
    return time.perf_counter() - started


def fetch_binaries(source: str, version: str, work: Path) -> tuple[Path, dict]:
    key = (platform.system(), platform.machine())
    archive = work / "download"
    if source == "theseus":
        target = THESEUS_TARGETS[key]
        url = (f"https://github.com/theseus-rs/postgresql-binaries/releases/download/"
               f"{version}/postgresql-{version}-{target}.tar.gz")
    else:
        target = ZONKY_TARGETS[key]
        url = (f"https://repo1.maven.org/maven2/io/zonky/test/postgres/"
               f"embedded-postgres-binaries-{target}/{version}/"
               f"embedded-postgres-binaries-{target}-{version}.jar")
    seconds = download(url, archive)
    info = {"url": url, "archive_bytes": archive.stat().st_size, "download_s": round(seconds, 2)}

    install = work / "pgsql"
    started = time.perf_counter()
    if source == "theseus":
        with tarfile.open(archive) as tar:
            tar.extractall(work / "unpacked", filter="tar")
        shutil.move(str(next((work / "unpacked").iterdir())), install)
    else:
        # The jar wraps a .txz with bin/, lib/ and share/ at its root.
        with zipfile.ZipFile(archive) as jar:
            inner = next(n for n in jar.namelist() if n.endswith(".txz"))
            jar.extract(inner, work)
        with tarfile.open(work / inner) as tar:
            tar.extractall(install, filter="tar")
        info["inner_txz_bytes"] = (work / inner).stat().st_size
    info["extract_s"] = round(time.perf_counter() - started, 2)
    info["installed_bytes"] = dir_size(install)
    info["installed_bytes_by_dir"] = {
        d.name: dir_size(d) for d in install.iterdir() if d.is_dir()
    }
    info["tools_present"] = {t: (install / "bin" / f"{t}{EXE}").exists() for t in TOOLS}
    return install, info


def wait_http(url: str, proc: subprocess.Popen, timeout: float) -> float:
    """Seconds until the server answers anything (uvicorn listens after lifespan startup)."""
    started = time.perf_counter()
    while time.perf_counter() - started < timeout:
        if proc.poll() is not None:
            raise SystemExit(f"backend exited early with code {proc.returncode}")
        try:
            urllib.request.urlopen(url, timeout=2)
        except urllib.error.HTTPError:
            return time.perf_counter() - started
        except OSError:
            time.sleep(0.2)
            continue
        return time.perf_counter() - started
    raise SystemExit("backend did not answer in time")


def boot_backend(db_url: str, scratch: Path, log: Path) -> float:
    env = dict(os.environ)
    env.update({
        "DATABASE_URL": db_url,
        "DATA_DIR": str(scratch / "uploads"),
        "SESSION_MEMORY_DIR": str(scratch / "memory"),
        "PQBL_STORAGE_DIR": str(scratch / "pqbl"),
        "IDEA_SOURCES_STORAGE_DIR": str(scratch / "uploads" / "idea-sources"),
        "PORTFOLIO_STORAGE_DIR": str(scratch / "uploads" / "portfolio"),
        "TAVOLO_IMAGES_STORAGE_DIR": str(scratch / "uploads" / "tavolo-images"),
        "TAVOLO_STORAGE_DIR": str(scratch / "uploads" / "tavolo"),
        "PYTHONPATH": str(REPO_ROOT),
    })
    port = free_port()
    launcher = Path(__file__).with_name("embedded_postgres_backend.py")
    with open(log, "a", encoding="utf-8") as out:
        proc = subprocess.Popen(
            [sys.executable, str(launcher), str(port)],
            cwd=REPO_ROOT, env=env, stdout=out, stderr=subprocess.STDOUT,
        )
        try:
            return wait_http(f"http://127.0.0.1:{port}/__spike_probe", proc, timeout=600)
        finally:
            proc.terminate()
            proc.wait(timeout=60)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=["theseus", "zonky"], required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    import psycopg2  # backend dependency, installed from backend/requirements.txt

    work = args.work.resolve()
    work.mkdir(parents=True, exist_ok=True)
    report = {"source": args.source, "version": args.version,
              "os": platform.platform(), "machine": platform.machine()}
    install, report["binaries"] = fetch_binaries(args.source, args.version, work)
    bin_dir = install / "bin"

    data_root = user_data_dir()
    shutil.rmtree(data_root, ignore_errors=True)
    data_root.mkdir(parents=True)
    pgdata = data_root / "postgres"
    pwfile = work / "pw"
    password = secrets.token_urlsafe(24)
    pwfile.write_text(password, encoding="utf-8")
    report["data_dir"] = str(pgdata)

    timings = {}
    timings["initdb_s"] = run([
        str(bin_dir / f"initdb{EXE}"), "-D", str(pgdata), "-U", "counselorbot",
        "--auth=scram-sha-256", f"--pwfile={pwfile}", "--encoding=UTF8", "--locale=C",
    ])
    pwfile.unlink()
    report["pgdata_bytes_after_initdb"] = dir_size(pgdata)

    port = free_port()
    pg_log = work / "postgres.log"
    # TCP on 127.0.0.1 only, no Unix socket: the same on all three systems.
    pg_opts = f"-c listen_addresses=127.0.0.1 -c port={port} -c unix_socket_directories="
    pg_ctl = str(bin_dir / f"pg_ctl{EXE}")
    start_cmd = [pg_ctl, "-D", str(pgdata), "-l", str(pg_log), "-o", pg_opts, "-w", "-t", "120", "start"]
    stop_cmd = [pg_ctl, "-D", str(pgdata), "-m", "fast", "-w", "stop"]
    timings["pg_cold_start_s"] = run(start_cmd)

    started = time.perf_counter()
    conn = psycopg2.connect(host="127.0.0.1", port=port, user="counselorbot",
                            password=password, dbname="postgres")
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("CREATE DATABASE counselorbot")
        cur.execute("SELECT version()")
        report["server_version"] = cur.fetchone()[0]
    conn.close()
    timings["create_db_s"] = time.perf_counter() - started

    db_url = f"postgresql://counselorbot:{password}@127.0.0.1:{port}/counselorbot"
    backend_log = work / "backend.log"
    timings["backend_first_boot_s"] = boot_backend(db_url, work / "scratch", backend_log)
    timings["backend_second_boot_s"] = boot_backend(db_url, work / "scratch", backend_log)

    conn = psycopg2.connect(db_url)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
        report["public_tables"] = cur.fetchone()[0]
        cur.execute("SELECT pg_database_size('counselorbot')")
        report["database_bytes"] = cur.fetchone()[0]
    conn.close()
    report["pgdata_bytes_after_migrations"] = dir_size(pgdata)

    if report["binaries"]["tools_present"]["pg_dump"]:
        dump = work / "backup.dump"
        env = dict(os.environ, PGPASSWORD=password)
        timings["pg_dump_s"] = run([str(bin_dir / f"pg_dump{EXE}"), "-Fc", "-h", "127.0.0.1",
                                    "-p", str(port), "-U", "counselorbot", "-f", str(dump),
                                    "counselorbot"], env=env)
        report["dump_bytes"] = dump.stat().st_size

    timings["pg_stop_s"] = run(stop_cmd)
    timings["pg_warm_start_s"] = run(start_cmd)
    run(stop_cmd)

    # Binaries ship inside the installer, so extraction is not part of the first launch.
    timings["first_launch_total_s"] = (timings["initdb_s"] + timings["pg_cold_start_s"]
                                       + timings["create_db_s"] + timings["backend_first_boot_s"])
    report["timings"] = {k: round(v, 2) for k, v in timings.items()}
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
