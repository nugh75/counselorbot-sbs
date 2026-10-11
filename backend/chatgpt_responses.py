"""The SIWC Responses transport, shared by dispatch and prompt inspection."""
from openai import OpenAI, APIStatusError, APIConnectionError

from .chatgpt_connections import ChatGPTError, RESOURCE, access_token, mark_reconnect, preference, require_ready


def payload(model, message, instructions, history=None, effort=None):
    turns = [{"role": item["role"], "content": item["content"]} for item in history or []
             if item.get("role") in {"user", "assistant"} and item.get("content")]
    body = {"model": model, "instructions": instructions,
            "input": turns + [{"role": "user", "content": message}], "store": False, "stream": True}
    if effort:
        body["reasoning"] = {"effort": effort}  # #202: chosen per counselor
    return body


def preview(model, message, instructions, history=None, effort=None):
    return {"endpoint": RESOURCE + "/responses", "authentication": "personal_chatgpt_plan",
            "body": payload(model, message, instructions, history, effort),
            "unsupported_parameters": ["temperature", "max_output_tokens", "previous_response_id"]}


def stream(db, model, message, instructions, history=None, timeout=120, effort=None):
    try:
        yield from _stream(db, model, message, instructions, history, timeout, effort)
    except _EffortRejected:
        # A model that refuses the chosen level answers with its default instead of failing.
        yield from _stream(db, model, message, instructions, history, timeout, None)


class _EffortRejected(Exception):
    pass


def _stream(db, model, message, instructions, history, timeout, effort):
    require_ready(db)
    # Connection is not consent to infer: activation and model are explicit.
    if preference(db) != model:
        raise ChatGPTError("model")
    token = access_token(db)
    client = OpenAI(api_key=token, base_url=RESOURCE, timeout=timeout, max_retries=0)
    completed = False
    try:
        with client.responses.create(**payload(model, message, instructions, history, effort)) as events:
            for event in events:
                if event.type == "response.output_text.delta":
                    yield event.delta
                elif event.type == "response.completed":
                    completed = True
                    usage = getattr(event.response, "usage", None)
                    if usage is not None:
                        yield {"type": "usage", "usage": usage.model_dump()}
                    break
                elif event.type in {"response.failed", "response.incomplete", "error"}:
                    error = getattr(event, "error", None) or getattr(getattr(event, "response", None), "error", None)
                    code = getattr(error, "code", None) or getattr(event, "code", None)
                    raise ChatGPTError("quota" if code in {"rate_limit_exceeded", "insufficient_quota", "subscription_sharing_usage_limit_reached"} else "incomplete")
        if not completed:
            raise ChatGPTError("incomplete")
    except APIStatusError as exc:
        if effort and exc.status_code == 400:
            raise _EffortRejected() from None
        if exc.status_code in (401, 403):
            mark_reconnect(db, token)
        raise ChatGPTError("quota" if exc.status_code == 429 else "reconnect" if exc.status_code in (401, 403) else "unavailable") from None
    except APIConnectionError:
        raise ChatGPTError("unavailable") from None
    finally:
        client.close()
