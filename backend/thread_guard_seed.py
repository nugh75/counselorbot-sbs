"""Point the thread guard at a local judge, once, and never again.

The guard reads every turn. On an installation whose conversations are served
by a paid provider that would double the bill for a verdict nobody asked for,
so the default judge is local: qwen3.8 with thinking off, which is what the
verdict needs — a small JSON object, no reasoning trace.

The admin can point it anywhere afterwards, external providers included. This
seed only fills the gap; a value already chosen is never overwritten.
"""
from .thread_guard import ENABLED_KEY, PRESET_KEY

DEFAULT_PRESET_NAME = "Thread guard (qwen3.8, no reasoning)"
DEFAULT_MODEL = "qwen3.8:latest"


def seed_thread_guard(db, models) -> bool:
    """True when this run wrote something."""
    existing = db.query(models.Config).filter(models.Config.key == PRESET_KEY).first()
    if existing is not None and (existing.value or "").strip():
        return False
    preset = (
        db.query(models.ModelPreset)
        .filter(models.ModelPreset.provider == "ollama",
                models.ModelPreset.model.like("qwen3.8%"),
                models.ModelPreset.disable_thinking.is_(True))
        .order_by(models.ModelPreset.id.asc())
        .first()
    )
    if preset is None:
        preset = models.ModelPreset(
            name=DEFAULT_PRESET_NAME, provider="ollama", model=DEFAULT_MODEL,
            disable_thinking=True, is_active=True,
            notes="Judges each finished counselor turn for the thread guard.",
        )
        db.add(preset)
        db.flush()
    if existing is None:
        db.add(models.Config(key=PRESET_KEY, value=str(preset.id),
                             description="Preset that judges each turn for the thread guard."))
    else:
        existing.value = str(preset.id)
    if not db.query(models.Config).filter(models.Config.key == ENABLED_KEY).first():
        # Off until someone has read a few verdicts and found them worth injecting.
        db.add(models.Config(key=ENABLED_KEY, value="false",
                             description="Inject the thread guard's verdict into the next turn."))
    db.commit()
    return True
