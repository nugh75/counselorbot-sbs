"""PostgreSQL packaging gates: synthetic archives, no network or system DB."""
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("pg_download", Path(__file__).parents[1] / "download-postgres-binaries.py")
pg = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pg)


class DownloadTests(unittest.TestCase):
    def test_every_archive_has_a_pinned_checksum(self):
        for target in pg.PIN["targets"].values():
            self.assertRegex(target["sha256"], r"^[a-f0-9]{64}$")
        self.assertEqual(pg.PG_VERSION, pg.PIN["minor"])

    def test_wrong_checksum_fails_before_extracting(self):
        def download(_url, path):
            path.write_bytes(b"corrupted archive")
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(pg, "download_file", side_effect=download), patch.object(pg, "extract_filtered") as extract:
                with self.assertRaisesRegex(ValueError, "Checksum"):
                    pg.download_theseus("macos-arm64", Path(directory))
                extract.assert_not_called()

    def test_nested_archive_preserves_layout_and_prunes_build_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "pg.tar.gz"
            with tarfile.open(archive, "w:gz") as tar:
                for name in ("bin/postgres", "lib/libpq.so.5", "lib/libpq.a", "share/postgresql/postgres.bki", "share/doc/README", "COPYRIGHT"):
                    member = tarfile.TarInfo("postgresql-dist/" + name)
                    member.size = 2
                    member.mode = 0o755
                    tar.addfile(member, io.BytesIO(b"pg"))
                link = tarfile.TarInfo("postgresql-dist/lib/libpq.so")
                link.type = tarfile.SYMTYPE
                link.linkname = "libpq.so.5"
                tar.addfile(link)
            pg.extract_filtered(archive, root / "out")
            self.assertTrue((root / "out/bin/postgres").is_file())
            self.assertTrue((root / "out/lib/libpq.so").is_file())
            if os.name != "nt":
                self.assertTrue((root / "out/lib/libpq.so").is_symlink())
            self.assertTrue((root / "out/COPYRIGHT").is_file())
            self.assertFalse((root / "out/lib/libpq.a").exists())
            self.assertFalse((root / "out/share/doc").exists())

    def test_unsafe_archive_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "pg.tar.gz"
            with tarfile.open(archive, "w:gz") as tar:
                member = tarfile.TarInfo("../../escape")
                member.size = 1
                tar.addfile(member, io.BytesIO(b"x"))
            with self.assertRaises(tarfile.FilterError):
                pg.extract_filtered(archive, root / "out")

    def test_manifest_is_written_in_fresh_output(self):
        original = pg.PIN_PATH.read_bytes()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            pg.update_manifest(output, "macos-arm64", pg.PIN["targets"]["macos-arm64"]["sha256"])
            manifest = json.loads((output / "manifest.json").read_text())
            self.assertEqual(manifest["target"], "macos-arm64")
            self.assertEqual(manifest["minor"], pg.PG_VERSION)
        self.assertEqual(pg.PIN_PATH.read_bytes(), original)

    def test_missing_binaries_block_packaging(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "Binario.*mancante"):
                pg.validate_bundle(Path(directory), "windows-x64")


if __name__ == "__main__":
    unittest.main()
