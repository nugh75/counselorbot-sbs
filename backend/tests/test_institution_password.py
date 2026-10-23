"""Display-copy encryption fallbacks; no database required."""
import logging

from cryptography.fernet import Fernet

from backend import institution_password


def test_reveal_returns_none_without_a_copy():
    assert institution_password.reveal(None) is None
    assert institution_password.reveal("") is None


def test_reveal_falls_back_when_the_key_changed(monkeypatch, caplog):
    sealed = institution_password.remember("Synthetic-Class-Code", has_stored=False)
    assert sealed
    monkeypatch.setenv("INSTITUTION_CREDENTIAL_KEY", Fernet.generate_key().decode())
    caplog.set_level(logging.DEBUG)
    assert institution_password.reveal(sealed) is None
    assert "Synthetic-Class-Code" not in caplog.text
    assert "InvalidToken" in caplog.text


def test_remember_never_breaks_the_save_when_the_key_is_invalid(monkeypatch, caplog):
    monkeypatch.setenv("INSTITUTION_CREDENTIAL_KEY", "not-a-key")
    caplog.set_level(logging.DEBUG)
    assert institution_password.remember("Synthetic-Class-Code", has_stored=False) is None
    assert "Synthetic-Class-Code" not in caplog.text
    assert "CredentialStorageError" in caplog.text
