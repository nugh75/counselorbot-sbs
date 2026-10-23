"""Synthetic test environment shared by the backend suites.

The institute display copy uses the same Fernet store as personal API
credentials. Tests must never create a key file in the checkout, so they run
with an ephemeral installation key for the whole session.
"""
import os

from cryptography.fernet import Fernet

os.environ.setdefault("INSTITUTION_CREDENTIAL_KEY", Fernet.generate_key().decode())
