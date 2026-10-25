"""Test per il generatore del manifest di aggiornamento (latest.json / latest-beta.json)."""
import importlib.util
import json
from pathlib import Path
import pytest

SCRIPT_PATH = Path(__file__).with_name("generate-update-manifest.py")
spec = importlib.util.spec_from_file_location("generate_update_manifest", SCRIPT_PATH)
manifest_gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manifest_gen)


def test_target_matching_by_filename():
    assert manifest_gen.find_target_for_file("counselorbot-teacher_0.2.0_aarch64.app.tar.gz") == "darwin-aarch64"
    assert manifest_gen.find_target_for_file("counselorbot-teacher_0.2.0_x64.app.tar.gz") == "darwin-x86_64"
    assert manifest_gen.find_target_for_file("counselorbot-teacher_0.2.0_amd64.AppImage.tar.gz") == "linux-x86_64"
    assert manifest_gen.find_target_for_file("counselorbot-teacher_0.2.0_x64-setup.nsis.zip") == "windows-x86_64"
    assert manifest_gen.find_target_for_file("unknown.txt") is None


def test_generate_manifest_structures_platforms_and_signatures(tmp_path):
    artifacts_dir = tmp_path / "artifacts"
    artifacts_dir.mkdir()

    # Create dummy artifacts and signatures
    macos_tar = artifacts_dir / "counselorbot-teacher_aarch64.app.tar.gz"
    macos_tar.write_bytes(b"dummy-macos-bundle")
    macos_sig = artifacts_dir / "counselorbot-teacher_aarch64.app.tar.gz.sig"
    macos_sig.write_text("dummy-sig-macos\n", encoding="utf-8")

    win_zip = artifacts_dir / "counselorbot-teacher_x64-setup.nsis.zip"
    win_zip.write_bytes(b"dummy-win-bundle")
    win_sig = artifacts_dir / "counselorbot-teacher_x64-setup.nsis.zip.sig"
    win_sig.write_text("dummy-sig-win\n", encoding="utf-8")

    manifest = manifest_gen.generate_manifest(
        version="0.2.0",
        notes="Nuova versione con supporto updater.",
        artifacts_dir=artifacts_dir,
        base_url="https://github.com/nugh75/counselorbot-sbs/releases/download/v0.2.0",
    )

    assert manifest["version"] == "0.2.0"
    assert manifest["notes"] == "Nuova versione con supporto updater."
    assert "pub_date" in manifest
    assert "darwin-aarch64" in manifest["platforms"]
    assert manifest["platforms"]["darwin-aarch64"]["url"] == (
        "https://github.com/nugh75/counselorbot-sbs/releases/download/v0.2.0/counselorbot-teacher_aarch64.app.tar.gz"
    )
    assert manifest["platforms"]["darwin-aarch64"]["signature"] == "dummy-sig-macos"
    assert "windows-x86_64" in manifest["platforms"]
    assert manifest["platforms"]["windows-x86_64"]["signature"] == "dummy-sig-win"


def test_main_cli_output(tmp_path):
    artifacts_dir = tmp_path / "artifacts"
    artifacts_dir.mkdir()
    bundle = artifacts_dir / "counselorbot-teacher_aarch64.app.tar.gz"
    bundle.write_bytes(b"fake")

    out_file = tmp_path / "custom-latest.json"
    code = manifest_gen.main([
        "--version", "1.0.0",
        "--channel", "beta",
        "--artifacts-dir", str(artifacts_dir),
        "--output", str(out_file),
    ])
    assert code == 0
    assert out_file.is_file()
    data = json.loads(out_file.read_text(encoding="utf-8"))
    assert data["version"] == "1.0.0"
    assert "darwin-aarch64" in data["platforms"]
