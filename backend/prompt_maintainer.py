"""Maintainer mode: promote an instance prompt customization to factory via GitHub PR (#777).

Disabled by default so distributed CounselorBot instances treat factory prompts
as read-only and never expose or permit GitHub PR actions.
"""
from __future__ import annotations

import base64
import difflib
import hashlib
import logging
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

import httpx
from sqlalchemy.orm import Session

from . import prompt_health, prompt_registry
from .prompt_factory_source import apply_factory_text, resolve_factory_source

logger = logging.getLogger(__name__)

_TRUTHY = {"1", "true", "yes", "on"}
_DEFAULT_REPO = "nugh75/counselorbot-sbs"
_DEFAULT_BRANCH = "main"
_REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_BRANCH_RE = re.compile(r"^[A-Za-z0-9._/-]+$")
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


def _github_repo() -> str:
    repo = (os.environ.get("PROMPT_MAINTAINER_GITHUB_REPO") or _DEFAULT_REPO).strip()
    return repo if _REPO_RE.fullmatch(repo) else ""


def _base_branch() -> str:
    branch = (os.environ.get("PROMPT_MAINTAINER_GITHUB_BASE_BRANCH") or _DEFAULT_BRANCH).strip()
    if not _BRANCH_RE.fullmatch(branch) or ".." in branch or branch.startswith("/") or branch.endswith("/"):
        return ""
    return branch


def is_maintainer_mode_enabled() -> bool:
    """True only when maintainer flag, token, repo and base branch are validly set."""
    mode = (os.environ.get("PROMPT_MAINTAINER_MODE") or "").strip().lower()
    if mode not in _TRUTHY:
        return False
    token = _read_secret_or_env("PROMPT_MAINTAINER_GITHUB_TOKEN")
    return bool(token and _github_repo() and _base_branch())


def promote_capability(prompt_id: str, differs_from_factory: bool) -> dict | None:
    """Capability descriptor for prompt cards; None when maintainer mode is off."""
    if not is_maintainer_mode_enabled():
        return None
    source = resolve_factory_source(prompt_id)
    if source.kind not in ("md", "inline"):
        return {
            "enabled": True,
            "promotable": False,
            "file_path": source.file_path,
            "reason": source.reason or "composed_or_dynamic_factory_source",
        }
    return {
        "enabled": True,
        "promotable": bool(differs_from_factory),
        "file_path": source.file_path,
        "reason": None if differs_from_factory else "prompt_matches_factory",
    }


def _github_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "CounselorBot-Maintainer",
    }


def _raise_for_github_status(response: httpx.Response, step: str) -> dict:
    if response.status_code >= 400:
        logger.warning("GitHub maintainer API failed at %s with HTTP %s", step, response.status_code)
        raise RuntimeError(f"github_api_{step}_{response.status_code}")
    return response.json()


def _branch_slug(prompt_id: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", prompt_id.replace(":", "-")).strip("-").lower()
    return (slug[:40] or "prompt")


def _pr_body(
    *,
    prompt_id: str,
    level: int,
    file_path: str,
    actor: str | None,
    note: str,
    before: str,
    after: str,
) -> str:
    diff_lines = list(difflib.unified_diff(
        before.splitlines(),
        after.splitlines(),
        fromfile=f"a/{file_path} (factory)",
        tofile=f"b/{file_path} (instance)",
        lineterm="",
    ))
    diff_block = "\n".join(diff_lines) if diff_lines else "(file formatting update)"
    lines = [
        "Promotes an instance prompt customization to the factory default from **Administration › Prompt health** (#777).",
        "",
        f"- **Prompt ID:** `{prompt_id}`",
        f"- **Tier:** Level {level}",
        f"- **Target file:** `{file_path}`",
        f"- **Requested by:** `{actor or 'admin'}`",
    ]
    if note.strip():
        lines.extend(["", "### Maintainer note", note.strip()])
    lines.extend(["", "### Diff", "```diff", diff_block, "```"])
    return "\n".join(lines)


def promote_prompt_to_factory(
    db: Session,
    prompt_id: str,
    *,
    note: str = "",
    actor: str | None = None,
    http_client: httpx.Client | None = None,
) -> dict:
    """Create a branch, commit updated factory text, and open a PR on GitHub."""
    if not is_maintainer_mode_enabled():
        raise PermissionError("maintainer_mode_disabled")

    repo = _github_repo()
    base_branch = _base_branch()
    token = _read_secret_or_env("PROMPT_MAINTAINER_GITHUB_TOKEN")

    card = prompt_health.prompt_card(db, prompt_id)
    if not card.get("editable") or card.get("text") is None or card.get("factory") is None:
        raise ValueError("prompt_not_promotable")
    if not card.get("differs_from_factory"):
        raise ValueError("prompt_matches_factory")

    source = resolve_factory_source(prompt_id)
    if source.kind not in ("md", "inline") or not source.file_path:
        raise ValueError(source.reason or "composed_or_dynamic_factory_source")

    current_text: str = card["text"]
    headers = _github_headers(token)
    encoded_path = quote(source.file_path, safe="/")
    now_stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    digest = hashlib.sha256(f"{prompt_id}:{current_text}:{now_stamp}".encode("utf-8")).hexdigest()[:6]
    branch_name = f"prompt-factory/{_branch_slug(prompt_id)}-{now_stamp}-{digest}"

    def _run(client: httpx.Client) -> dict:
        ref_data = _raise_for_github_status(
            client.get(f"{_GITHUB_API_BASE}/repos/{repo}/git/ref/heads/{base_branch}", headers=headers),
            "get_ref",
        )
        base_sha = ref_data["object"]["sha"]

        file_data = _raise_for_github_status(
            client.get(
                f"{_GITHUB_API_BASE}/repos/{repo}/contents/{encoded_path}",
                params={"ref": base_branch},
                headers=headers,
            ),
            "get_file",
        )
        remote_content = base64.b64decode(file_data["content"]).decode("utf-8")
        file_sha = file_data["sha"]

        updated_content = apply_factory_text(source, remote_content, current_text)
        if updated_content == remote_content:
            raise ValueError("factory_already_matches")

        _raise_for_github_status(
            client.post(
                f"{_GITHUB_API_BASE}/repos/{repo}/git/refs",
                headers=headers,
                json={"ref": f"refs/heads/{branch_name}", "sha": base_sha},
            ),
            "create_branch",
        )

        _raise_for_github_status(
            client.put(
                f"{_GITHUB_API_BASE}/repos/{repo}/contents/{encoded_path}",
                headers=headers,
                json={
                    "message": f"chore(prompts): promote {prompt_id} to factory",
                    "content": base64.b64encode(updated_content.encode("utf-8")).decode("ascii"),
                    "sha": file_sha,
                    "branch": branch_name,
                },
            ),
            "update_file",
        )

        level = prompt_registry.prompt_level(prompt_id)
        pr_data = _raise_for_github_status(
            client.post(
                f"{_GITHUB_API_BASE}/repos/{repo}/pulls",
                headers=headers,
                json={
                    "title": f"chore(prompts): promote {prompt_id} to factory",
                    "head": branch_name,
                    "base": base_branch,
                    "body": _pr_body(
                        prompt_id=prompt_id,
                        level=level,
                        file_path=source.file_path,
                        actor=actor,
                        note=note,
                        before=card["factory"],
                        after=current_text,
                    ),
                },
            ),
            "create_pr",
        )
        return {
            "prompt_id": prompt_id,
            "pr_url": pr_data["html_url"],
            "pr_number": pr_data["number"],
            "branch": branch_name,
            "file_path": source.file_path,
        }

    try:
        if http_client is not None:
            return _run(http_client)
        with httpx.Client(timeout=20.0) as client:
            return _run(client)
    except httpx.HTTPError as exc:
        logger.warning("GitHub maintainer HTTP error: %s", type(exc).__name__)
        raise RuntimeError(f"github_http_error_{type(exc).__name__}") from exc
