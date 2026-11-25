"""Suggest an instance prompt improvement to the project maintainer (#779).

Supports email (using configured SMTP settings) and GitHub issues. Strictly
read-only on both the database and factory files: suggestions never alter
factory prompts until the maintainer accepts them.
"""
from __future__ import annotations

import difflib
from email.message import EmailMessage
import logging
import os
from pathlib import Path
import re
import smtplib
from typing import Callable, Literal

import httpx
from sqlalchemy.orm import Session

from . import models, prompt_registry

logger = logging.getLogger(__name__)

Channel = Literal["email", "github"]

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_TRUTHY = {"1", "true", "yes", "on"}
_DEFAULT_REPO = "nugh75/counselorbot-sbs"
_GITHUB_API_BASE = "https://api.github.com"


def _read_secret_or_env(var_name: str) -> str:
    direct = (os.environ.get(var_name) or "").strip()
    if direct:
        return direct
    file_path = (os.environ.get(f"{var_name}_FILE") or "").strip()
    if file_path:
        try:
            return Path(file_path).read_text(encoding="utf-8").strip()
        except OSError:
            return ""
    return ""


def _bool_env(var_name: str, default: bool) -> bool:
    raw = os.environ.get(var_name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in _TRUTHY


def instance_name() -> str:
    for key in ("COUNSELORBOT_INSTANCE_NAME", "COUNSELORBOT_HOSTNAME", "AI4AUTH_PUBLIC_HOST"):
        val = (os.environ.get(key) or "").strip()
        if val:
            return val
    return "CounselorBot"


def _email_config() -> dict | None:
    recipient = (os.environ.get("PROMPT_SUGGESTION_MAINTAINER_EMAIL") or "").strip()
    smtp_host = (os.environ.get("SMTP_HOST") or "").strip()
    if not _EMAIL_RE.fullmatch(recipient) or not smtp_host:
        return None
    raw_port = (os.environ.get("SMTP_PORT") or "587").strip()
    try:
        port = int(raw_port)
    except ValueError:
        return None
    if port < 1 or port > 65535:
        return None
    username = (os.environ.get("SMTP_USERNAME") or "").strip()
    password = _read_secret_or_env("SMTP_PASSWORD")
    sender = (os.environ.get("SMTP_FROM") or "").strip() or username or f"noreply@{smtp_host}"
    use_ssl = _bool_env("SMTP_USE_SSL", False)
    use_tls = _bool_env("SMTP_USE_TLS", not use_ssl)
    return {
        "recipient": recipient,
        "host": smtp_host,
        "port": port,
        "username": username,
        "password": password,
        "sender": sender,
        "use_ssl": use_ssl,
        "use_tls": use_tls,
    }


def _github_config() -> dict | None:
    token = _read_secret_or_env("PROMPT_SUGGESTION_GITHUB_TOKEN") or _read_secret_or_env("GITHUB_TOKEN")
    repo = (os.environ.get("PROMPT_SUGGESTION_GITHUB_REPO") or _DEFAULT_REPO).strip()
    if not token or not _REPO_RE.fullmatch(repo):
        return None
    return {"token": token, "repo": repo}


def available_channels() -> list[Channel]:
    """Configured delivery channels (`email`, `github`) available on this instance."""
    channels: list[Channel] = []
    if _email_config() is not None:
        channels.append("email")
    if _github_config() is not None:
        channels.append("github")
    return channels


def _load_editable_prompt(db: Session, prompt_id: str) -> tuple[str, str | None]:
    """Load current text and factory default without importing `prompt_health`."""
    kind, sep, key = prompt_id.partition(":")
    if not sep or kind not in ("config", "guided_step"):
        raise LookupError(prompt_id)
    if kind == "config":
        row = db.query(models.Config).filter(models.Config.key == key).first()
        if row is None:
            raise LookupError(prompt_id)
        text = row.value or ""
        entry = prompt_registry.config_entry(key)
    else:
        row = db.query(models.GuidedStep).filter(models.GuidedStep.id == key).first()
        if row is None:
            raise LookupError(prompt_id)
        text = row.prompt or ""
        entry = prompt_registry.step_entry(key)
    factory = prompt_registry.factory_text(entry) if entry is not None else None
    return text, factory


def build_suggestion(db: Session, prompt_id: str, reason: str, actor: str | None = None) -> dict:
    """Build title, body and unified diff for a customised prompt suggestion."""
    clean_reason = reason.strip()
    if not clean_reason:
        raise ValueError("reason_required")

    current_text, factory = _load_editable_prompt(db, prompt_id)
    if factory is None or current_text == factory:
        raise ValueError("prompt_not_customised")

    inst = instance_name()
    level = prompt_registry.prompt_level(prompt_id)
    diff_lines = list(difflib.unified_diff(
        factory.splitlines(),
        current_text.splitlines(),
        fromfile=f"factory/{prompt_id}",
        tofile=f"instance/{prompt_id}",
        lineterm="",
    ))
    diff_text = "\n".join(diff_lines)
    title = f"[Prompt suggestion] {prompt_id} ({inst})"
    body = "\n".join([
        f"Instance prompt change suggestion from `{inst}` (#779).",
        "Factory text on the project remains unchanged until accepted by the maintainer.",
        "",
        f"- **Prompt ID:** `{prompt_id}`",
        f"- **Tier:** Level {level}",
        f"- **Instance:** `{inst}`",
        f"- **Suggested by:** `{actor or 'admin'}`",
        "",
        "### Reason",
        clean_reason,
        "",
        "### Diff (factory vs instance)",
        "```diff",
        diff_text,
        "```",
    ])
    return {
        "prompt_id": prompt_id,
        "instance": inst,
        "level": level,
        "reason": clean_reason,
        "diff": diff_text,
        "title": title,
        "body": body,
    }


def _default_smtp_factory(host: str, port: int, *, use_ssl: bool):
    if use_ssl:
        return smtplib.SMTP_SSL(host, port, timeout=15)
    return smtplib.SMTP(host, port, timeout=15)


def send_via_email(
    suggestion: dict,
    *,
    smtp_factory: Callable[..., object] | None = None,
) -> dict:
    """Send the suggestion email to the configured maintainer address."""
    cfg = _email_config()
    if cfg is None:
        raise ValueError("suggestion_channel_unavailable")

    msg = EmailMessage()
    msg["Subject"] = suggestion["title"]
    msg["From"] = cfg["sender"]
    msg["To"] = cfg["recipient"]
    msg.set_content(suggestion["body"])

    factory = smtp_factory or _default_smtp_factory
    with factory(cfg["host"], cfg["port"], use_ssl=cfg["use_ssl"]) as smtp:
        if cfg["use_tls"] and not cfg["use_ssl"] and hasattr(smtp, "starttls"):
            smtp.starttls()
        if cfg["username"] and cfg["password"] and hasattr(smtp, "login"):
            smtp.login(cfg["username"], cfg["password"])
        smtp.send_message(msg)

    return {
        "prompt_id": suggestion["prompt_id"],
        "channel": "email",
        "recipient": cfg["recipient"],
    }


def send_via_github(suggestion: dict, *, http_client: httpx.Client | None = None) -> dict:
    """Open a GitHub issue with the prompt suggestion in the configured repository."""
    cfg = _github_config()
    if cfg is None:
        raise ValueError("suggestion_channel_unavailable")

    headers = {
        "Authorization": f"Bearer {cfg['token']}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "CounselorBot-Suggestion",
    }

    def _post(client: httpx.Client) -> dict:
        response = client.post(
            f"{_GITHUB_API_BASE}/repos/{cfg['repo']}/issues",
            headers=headers,
            json={"title": suggestion["title"], "body": suggestion["body"]},
        )
        if response.status_code >= 400:
            logger.warning("GitHub suggestion issue API failed with HTTP %s", response.status_code)
            raise RuntimeError(f"github_issue_{response.status_code}")
        data = response.json()
        return {
            "prompt_id": suggestion["prompt_id"],
            "channel": "github",
            "issue_url": data["html_url"],
            "issue_number": data["number"],
        }

    try:
        if http_client is not None:
            return _post(http_client)
        with httpx.Client(timeout=20.0) as client:
            return _post(client)
    except httpx.HTTPError as exc:
        logger.warning("GitHub suggestion HTTP error: %s", type(exc).__name__)
        raise RuntimeError(f"github_http_error_{type(exc).__name__}") from exc


def submit_suggestion(
    db: Session,
    prompt_id: str,
    reason: str,
    channel: Channel | None = None,
    *,
    actor: str | None = None,
    smtp_factory: Callable[..., object] | None = None,
    http_client: httpx.Client | None = None,
) -> dict:
    """Validate channel availability and deliver an instance prompt suggestion."""
    channels = available_channels()
    if not channels:
        raise PermissionError("suggestion_channel_not_configured")
    target = channel or channels[0]
    if target not in channels:
        raise ValueError("suggestion_channel_unavailable")

    suggestion = build_suggestion(db, prompt_id, reason, actor=actor)
    if target == "email":
        return send_via_email(suggestion, smtp_factory=smtp_factory)
    return send_via_github(suggestion, http_client=http_client)
