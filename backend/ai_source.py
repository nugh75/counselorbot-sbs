"""Which AI key answers a person (#1020): system, own API, teacher's API or ChatGPT.

Read-only description of the routing done by `AIService`; it never decrypts
or returns a key, and it does not change how keys are chosen.
"""
from . import chatgpt_connections, class_api_sharing, models, personal_api
from .personal_ai_audience import is_staff


def _system_target(db, counselor):
    preset = db.get(models.ModelPreset, counselor.preset_id) if counselor and counselor.preset_id else None
    if preset:
        return preset.provider, preset.model
    config = {row.key: row.value for row in db.query(models.Config).filter(
        models.Config.key.in_(("active_provider", "model_name")))}
    return config.get("active_provider") or "openai", config.get("model_name") or "gpt-4o"


def _fallback_reason(db, username, counselor_id):
    """Why a personal choice is not used, or None when the person chose nothing."""
    with db.no_autoflush:
        routing = db.get(models.PersonalAIRouting, username)
        if routing is None or not routing.enabled:
            return None
        binding = db.get(models.PersonalCounselorConnection, (username, counselor_id)) if counselor_id else None
    connection_id = binding.connection_id if binding else routing.default_connection_id
    chatgpt_model = binding.chatgpt_model if binding else routing.default_chatgpt_model
    if not connection_id and not chatgpt_model:
        return None
    if not personal_api.class_allows(db, username):
        return "classBlocked"
    if not connection_id and db.query(models.ChatGPTConnection).filter_by(username=username).first() is None:
        return "notConnected"
    return "disabled"


def describe(db, identity, counselor_id=None):
    username = identity["username"]
    chatgpt_connections.bind_identity(db, identity)
    personal_api.bind_counselor(db, counselor_id)
    counselor = personal_api.require_visible_counselor(db, counselor_id, username) if counselor_id else None
    if counselor is None:
        counselor_id = None
        personal_api.bind_counselor(db, None)
    own_role = "teacher" if is_staff(db, username) else "student"
    result = {"owner_label": None, "connection": "api", "fallback": False, "fallback_reason": None}

    connection = personal_api.active_settings(db, username, counselor_id)
    if connection:
        return {**result, "source": "own_api", "owner_role": own_role,
                "provider": connection.provider, "model": connection.model_name}
    chatgpt_model = chatgpt_connections.preference(db)
    if chatgpt_model:
        return {**result, "source": "chatgpt", "owner_role": own_role, "provider": "openai",
                "connection": "subscription", "model": chatgpt_model}
    offer = class_api_sharing.offers(db, username).get(counselor_id)
    if offer is not None:
        teacher, connection_id, _ = offer
        shared = db.get(models.PersonalAPIConnection, connection_id)
        name = db.query(models.UserDisplayName.display_name).filter_by(username=teacher).scalar()
        return {**result, "source": "teacher_api", "owner_role": "teacher", "owner_label": name or teacher,
                "provider": shared.provider, "model": shared.model_name}
    provider, model = _system_target(db, counselor)
    reason = _fallback_reason(db, username, counselor_id)
    return {**result, "source": "system", "owner_role": "admin", "provider": provider, "model": model,
            "fallback": reason is not None, "fallback_reason": reason}
