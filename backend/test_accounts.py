"""Test data kept out of real class data (#835).

Not real students of a class: the admin view-as demo accounts
(auth.VIEW_AS_DEMO_ACCOUNTS) and the class owner, who could join through their
own invite link. Practice notebooks never become memberships; their chat turns
are logs tagged with details.practice_notebook_id. Rows stay in the database:
readers exclude them with the filters below.
"""
from sqlalchemy import and_, exists, func, or_

from . import models
from .auth import VIEW_AS_DEMO_ACCOUNTS

DEMO_USERNAMES = frozenset(VIEW_AS_DEMO_ACCOUNTS)


def is_test_member(username: str | None, owner_username: str | None) -> bool:
    name = (username or "").lower()
    return name in DEMO_USERNAMES or name == (owner_username or "").lower()


def real_membership():
    """Filter for GroupMembership queries: no demo accounts, no class owner."""
    member = models.GroupMembership
    owner = exists().where(
        models.StudentGroup.id == member.group_id,
        func.lower(models.StudentGroup.owner_username) == func.lower(member.username),
    )
    return and_(member.username.notin_(DEMO_USERNAMES), ~owner)


def real_log():
    """Filter for Log queries: no practice-notebook turns, no demo-account turns."""
    return and_(
        models.Log.details["practice_notebook_id"].as_integer().is_(None),
        or_(models.Log.username.is_(None), models.Log.username.notin_(DEMO_USERNAMES)),
    )
