"""Text-only forum inputs; clients cannot choose authors or moderation state."""
import re
from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

# C0 controls other than tab, newline and carriage return: NUL cannot be stored
# by PostgreSQL and the others are invisible or terminal-escape noise.
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _printable(value: str) -> str:
    if _CONTROL.search(value):
        raise ValueError("control characters are not allowed")
    return value


ForumBody = Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=4000), AfterValidator(_printable)]
ForumTitle = Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=160), AfterValidator(_printable)]
ForumReason = Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=500), AfterValidator(_printable)]


class ForumTopicCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: ForumTitle
    body: ForumBody
    # Optional link to a class path step or a class-wide assignment (F5, #106).
    link_kind: Literal["path_step", "assignment"] | None = None
    link_id: Annotated[int, Field(strict=True, gt=0)] | None = None

    @model_validator(mode="after")
    def _link_pair(self):
        if (self.link_kind is None) != (self.link_id is None):
            raise ValueError("link_kind and link_id go together")
        return self


class ForumPostCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: ForumBody


class ForumPostUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: ForumBody


class ForumHide(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: ForumReason


class ForumMuteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=255), AfterValidator(_printable)]
    reason: ForumReason
    until: AwareDatetime | None = None

    @field_validator("until")
    @classmethod
    def future_end(cls, value):
        if value is not None and value <= datetime.now(timezone.utc):
            raise ValueError("mute end must be in the future")
        return value
