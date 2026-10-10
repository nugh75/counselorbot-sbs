"""Class tool catalog: student instruments plus stable personal-tool keys."""
from sqlalchemy.orm import Session

from . import models


PERSONAL_TOOL_KEYS = {
    "tavolo": ("personal", "tavolo"),
    "goals": ("personal", "goals"),
    "actions": ("personal", "actions"),
    "timeline": ("personal", "timeline"),
    "portfolio": ("personal", "portfolio"),
    "pqbl": ("personal", "pqbl"),
    "flashcards": ("personal", "flashcards"),
    "cards": ("personal", "cards"),
    "comparison": ("personal", "comparison"),
    "bussola": ("support", "bussola"),
    "assistant": ("support", "assistant"),
    # Class tool: switches the class forum off for students (F3, #104).
    "forum": ("forum", "forum"),
}
ALWAYS_ON = frozenset({"notebook", "results", "classes", "assignments"})
# #174: tools an activity can ask the student to open (personal and support, not the forum switch).
ACTIVITY_TOOL_KEYS = tuple(key for key, (category, _) in PERSONAL_TOOL_KEYS.items() if category in ("personal", "support"))
# The app's built-in guided paths («Percorsi guidati»). Without an instrument row
# they are not toggleable and `require_tool` lets them pass, so access lists and
# class paths offer them too; with a row, the instrument rules apply.
GUIDED_PATH_KEYS = ("SAVICKAS", "EVENTO_STUDIO", "EVENTO_PROFESSIONALE", "OBIETTIVO_STUDIO", "IDEA")


def builtin_guided_paths(db: Session) -> list[str]:
    """Guided paths with no instrument row: always available."""
    codes = {code.upper() for (code,) in db.query(models.Instrument.code)}
    return [key for key in GUIDED_PATH_KEYS if key not in codes]


def tool_catalog(db: Session, disabled_keys: list[str]) -> list[dict]:
    """Include platform-disabled rows so teachers can see why they cannot edit."""
    disabled = set(disabled_keys)
    tools = []
    for instrument in db.query(models.Instrument).filter(
        models.Instrument.target_audience == "student",
        models.Instrument.code.notin_([*PERSONAL_TOOL_KEYS, *ALWAYS_ON]),
    ).order_by(models.Instrument.code).all():
        labels = {lang: value for lang in ("it", "en", "es", "sv")
                  if (value := getattr(instrument, f"name_{lang}"))}
        labels.update(instrument.name_i18n or {})
        tools.append({
            "key": instrument.code, "kind": "instrument",
            "category": instrument.tool_category, "label_i18n": labels,
            "admin_enabled": bool(instrument.is_active),
            "enabled": bool(instrument.is_active) and instrument.code not in disabled,
            "always_on": False,
        })
    for key, (category, label_key) in PERSONAL_TOOL_KEYS.items():
        tools.append({"key": key, "kind": "personal", "category": category,
                      "label_key": label_key, "label_i18n": {}, "admin_enabled": True,
                      "enabled": key not in disabled, "always_on": False})
    for key in sorted(ALWAYS_ON):
        tools.append({"key": key, "kind": "personal", "category": "always_on",
                      "label_key": key, "label_i18n": {}, "admin_enabled": True,
                      "enabled": True, "always_on": True})
    return tools
