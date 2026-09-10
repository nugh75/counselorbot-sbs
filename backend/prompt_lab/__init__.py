"""Prompt laboratory: an isolated bench for trying prompt changes.

Nothing here touches production. The engine reads a frozen snapshot, talks to
local models through one gateway, writes to its own database and produces a
report an administrator has to accept before any prompt changes.

The package is deliberately import-light: `storage` needs its own database URL
and raises when it is missing, `worker` reaches the model gateway, so neither
is imported here. Ask for the module you need.

    from backend.prompt_lab import contracts, evaluation
    from backend.prompt_lab import storage, worker  # only where configured
"""
from __future__ import annotations

__all__ = ["contracts", "evaluation", "local_models", "storage", "worker"]
