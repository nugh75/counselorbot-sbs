"""What an experiment is allowed to ask for, and what a case has to be.

Everything the administrator sends crosses this module before it reaches the
database, and everything the designer model produces crosses it before it is
stored as a case. A disabled button is not a barrier: the server decides.

The manifest helpers live here too. The manifest is what a run is actually
about — payload, snapshot and cases frozen at queue time — and both the writer
(the API) and the reader (the worker) must agree on its hash, so the recipe for
computing it belongs next to the models it hashes.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Literal, Mapping, Sequence

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# --- fixed vocabulary -------------------------------------------------------
LANGUAGES = ("it", "en", "es", "fr", "de", "sv")
PURPOSES = ("verification", "improvement")
SPLITS = ("development", "validation", "final")
# Verification never asks the proposer for anything, so a development set would
# be cases nobody is allowed to read: refused rather than quietly ignored.
REQUIRED_SPLITS: dict[str, tuple[str, ...]] = {
    "improvement": SPLITS,
    "verification": ("validation", "final"),
}

PROTOCOL_VERSION = 2
# Pilot ceilings from the plan. They are resource caps, not a promise that the
# sample is adequate.
MAX_CALLS_CEILING = 240
MAX_MINUTES_CEILING = 60
MAX_CANDIDATES = 2
MAX_TESTED_PRESETS = 6
MAX_GOALS = 6
# Two per split per language is the floor that makes a split a split at all.
MIN_CASES_PER_SPLIT = 2
MAX_CASES = 120
MAX_HISTORY_TURNS = 12

_TARGET_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$")
_CASE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")

Language = Literal["it", "en", "es", "fr", "de", "sv"]
Purpose = Literal["verification", "improvement"]
Split = Literal["development", "validation", "final"]


class Goal(BaseModel):
    """One thing the administrator wants, and how it can be observed.

    "Answer better" is not a goal until it says what would count as better,
    which is why the criterion is required and not a nicety.
    """

    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=3, max_length=400)
    criterion: str = Field(min_length=3, max_length=400)

    @field_validator("text", "criterion")
    @classmethod
    def _stripped(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("must contain at least three characters")
        return value


class ExperimentCreate(BaseModel):
    """The body of POST /api/admin/prompt-experiments."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=3, max_length=200)
    purpose: Purpose
    target_key: str
    goals: list[Goal] = Field(min_length=1, max_length=MAX_GOALS)
    languages: list[Language] = Field(default_factory=lambda: ["it"], min_length=1)
    designer_preset_id: int = Field(gt=0)
    proposer_preset_id: int | None = Field(default=None, gt=0)
    judge_preset_id: int = Field(gt=0)
    tested_preset_ids: list[int] = Field(min_length=1, max_length=MAX_TESTED_PRESETS)
    max_calls: int = Field(default=MAX_CALLS_CEILING, ge=1, le=MAX_CALLS_CEILING)
    max_minutes: int = Field(default=MAX_MINUTES_CEILING, ge=1, le=MAX_MINUTES_CEILING)

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("title is too short")
        return value

    @field_validator("target_key")
    @classmethod
    def _target(cls, value: str) -> str:
        value = value.strip()
        if not _TARGET_KEY.match(value):
            raise ValueError("target_key is not a valid key")
        return value

    @field_validator("languages")
    @classmethod
    def _languages(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("languages must be unique")
        return value

    @field_validator("tested_preset_ids")
    @classmethod
    def _tested(cls, value: list[int]) -> list[int]:
        if len(set(value)) != len(value):
            raise ValueError("tested_preset_ids must be unique")
        if any(item <= 0 for item in value):
            raise ValueError("tested_preset_ids must be positive")
        return value

    @model_validator(mode="after")
    def _proposer_matches_purpose(self) -> "ExperimentCreate":
        # The proposer is the only thing that separates the two purposes. A
        # verification that carries one would silently become an improvement.
        if self.purpose == "improvement" and self.proposer_preset_id is None:
            raise ValueError("improvement requires proposer_preset_id")
        if self.purpose == "verification" and self.proposer_preset_id is not None:
            raise ValueError("verification must not carry proposer_preset_id")
        return self

    @property
    def required_splits(self) -> tuple[str, ...]:
        return REQUIRED_SPLITS[self.purpose]


class HistoryTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class Case(BaseModel):
    """One synthetic turn with a frozen history.

    A case is a turn, not a conversation: the pilot cannot claim anything about
    a whole session, and the history is here to make the turn readable, not to
    replay a dialogue.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    group_id: str
    split: Split
    language: Language
    message: str = Field(min_length=1, max_length=4000)
    history: list[HistoryTurn] = Field(default_factory=list, max_length=MAX_HISTORY_TURNS)
    expected: str = Field(min_length=1, max_length=2000)

    @field_validator("id", "group_id")
    @classmethod
    def _identifier(cls, value: str) -> str:
        value = value.strip()
        if not _CASE_ID.match(value):
            raise ValueError("identifier must be short and alphanumeric")
        return value

    @field_validator("message", "expected")
    @classmethod
    def _text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class CasesUpdate(BaseModel):
    """The body of PUT /{id}/cases: the administrator's reviewed set."""

    model_config = ConfigDict(extra="forbid")

    cases: list[Case] = Field(min_length=1, max_length=MAX_CASES)


class RunRequest(BaseModel):
    """The body of POST /{id}/run.

    The flag is not a formality: the cases were written by a model and the
    person starting the run is stating they read them.
    """

    model_config = ConfigDict(extra="forbid")

    cases_reviewed: Literal[True]


class DecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["accept", "reject"]
    candidate_id: str | None = None
    expected_hash: str = Field(min_length=8, max_length=128)
    note: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def _accept_needs_candidate(self) -> "DecisionRequest":
        if self.action == "accept" and not (self.candidate_id or "").strip():
            raise ValueError("accept requires candidate_id")
        return self


class RestoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: str = Field(default="", max_length=2000)
    expected_hash: str = Field(min_length=8, max_length=128)


class Candidate(BaseModel):
    """A proposed prompt, saved before it is ever run."""

    model_config = ConfigDict(extra="forbid")

    id: str
    text: str = Field(min_length=1)
    reason: str = Field(default="", max_length=2000)
    expected: str = Field(default="", max_length=2000)


# --- case set rules ---------------------------------------------------------
def validate_case_set(
    cases: Sequence[Mapping[str, Any] | Case],
    *,
    languages: Sequence[str],
    purpose: str,
) -> list[Case]:
    """Check a whole set, not one case at a time, and say what is wrong.

    Per-case shape is Pydantic's job. What matters here is the property no
    single case can carry: three separated sets, each of them actually
    populated in each language the experiment claims to cover.
    """
    if purpose not in PURPOSES:
        raise ValueError(f"unknown purpose {purpose!r}")
    parsed = [item if isinstance(item, Case) else Case.model_validate(item) for item in cases]
    if not parsed:
        raise ValueError("no cases")
    if len(parsed) > MAX_CASES:
        raise ValueError(f"too many cases: {len(parsed)} over {MAX_CASES}")

    ids = [case.id for case in parsed]
    if len(set(ids)) != len(ids):
        raise ValueError("case ids must be unique")

    wanted = tuple(languages)
    unknown = sorted({case.language for case in parsed} - set(wanted))
    if unknown:
        raise ValueError(f"cases in languages outside the experiment: {', '.join(unknown)}")

    allowed = REQUIRED_SPLITS[purpose]
    stray = sorted({case.split for case in parsed} - set(allowed))
    if stray:
        raise ValueError(f"{purpose} does not use these splits: {', '.join(stray)}")

    # A scenario belongs to one set. Sharing it across two would let the
    # proposer read, in development, the person it will be measured on later.
    groups: dict[str, str] = {}
    contents: dict[str, str] = {}
    for case in parsed:
        fingerprint = re.sub(r"\W+", " ", case.message.casefold()).strip()
        previous = contents.setdefault(fingerprint, case.split)
        if previous != case.split:
            raise ValueError("the same student message appears in independent splits")
        seen = groups.setdefault(case.group_id, case.split)
        if seen != case.split:
            raise ValueError(f"group {case.group_id} appears in {seen} and {case.split}")

    for language in wanted:
        for split in allowed:
            count = sum(1 for case in parsed if case.language == language and case.split == split)
            if count < MIN_CASES_PER_SPLIT:
                raise ValueError(
                    f"{split} has {count} case(s) in {language}, "
                    f"at least {MIN_CASES_PER_SPLIT} are required"
                )
    return parsed


# --- manifest ---------------------------------------------------------------
def canonical(payload: Any) -> str:
    """One byte sequence per value, so two processes hash the same thing."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, default=str)


def manifest_hash(payload: Any, snapshot: Any, cases: Any) -> str:
    digest = hashlib.sha256(canonical(
        {"payload": payload, "snapshot": snapshot, "cases": cases,
         "protocol_version": PROTOCOL_VERSION}
    ).encode("utf-8"))
    return digest.hexdigest()


def build_manifest(*, payload: Any, snapshot: Any, cases: Any) -> dict:
    """The frozen recipe of one run.

    Changing goals, cases, presets or the snapshot after this point requires a
    new manifest and a new run. Results are never recomputed against a
    manifest they were not produced under.
    """
    return {
        "payload": payload,
        "snapshot": snapshot,
        "cases": cases,
        "protocol_version": PROTOCOL_VERSION,
        "manifest_hash": manifest_hash(payload, snapshot, cases),
    }


def manifest_intact(manifest: Mapping[str, Any]) -> bool:
    """Does the manifest still hash to what it says it does?"""
    if not isinstance(manifest, dict):
        return False
    stored = manifest.get("manifest_hash")
    if not isinstance(stored, str) or not stored:
        return False
    if manifest.get("protocol_version") != PROTOCOL_VERSION:
        return False
    return stored == manifest_hash(
        manifest.get("payload"), manifest.get("snapshot"), manifest.get("cases")
    )
