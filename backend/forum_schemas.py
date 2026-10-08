"""Text-only forum inputs; clients cannot choose authors or moderation state."""
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

ForumBody = Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=4000)]
ForumTitle = Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=160)]


class ForumTopicCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: ForumTitle
    body: ForumBody


class ForumPostCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: ForumBody
