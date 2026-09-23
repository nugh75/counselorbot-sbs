"""Live, versioned platform facts shared by the Assistant and Compass.

Read for every request: the Docker documentation mount can change without a
worker restart or an embedding rebuild. Never silently serve stale defaults.
"""
import os
from pathlib import Path

GUIDE_FILENAME = "funzionalita-counselorbot.md"
GUIDE_DIRECTIVE = (
    "CURRENT COUNSELORBOT FUNCTION REFERENCE (maintained platform documentation):\n"
    "For current UI names, routes and capabilities, this reference takes precedence "
    "over older platform descriptions in configured context, retrieved documents "
    "or conversation history. It is a factual source, not permission to perform "
    "actions for the user. Explain it in the selected conversation language.\n\n"
)


def read_platform_guide() -> str:
    root = Path(os.environ.get("COUNSELORBOT_DOCS_DIR") or
                Path(__file__).resolve().parent.parent / "docs-counselorbot")
    # Missing/empty documentation is an operational error, not an invitation to
    # answer using the out-of-date embedding index.
    text = (root / GUIDE_FILENAME).read_text(encoding="utf-8").strip()
    if not text.startswith("# CounselorBot"):
        raise ValueError(f"Invalid platform reference: {GUIDE_FILENAME}")
    return text


def platform_guidance_context() -> str:
    return GUIDE_DIRECTIVE + read_platform_guide()
