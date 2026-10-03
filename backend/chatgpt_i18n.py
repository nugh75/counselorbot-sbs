"""User-facing SIWC failures in the six application languages."""
import json
from pathlib import Path

_MESSAGES = json.loads(Path(__file__).with_suffix(".json").read_text())


def error_message(code, language="it"):
    messages = _MESSAGES.get(language, _MESSAGES["en"])
    return messages.get(code, messages["unavailable"])
