"""Presentation preferences; independent of response length and instrument scoring."""
from typing import Literal

ResponseFormat = Literal["standard", "bullets", "table"]


def apply_response_format(prompt: str, response_format: str | None) -> str:
    instructions = {
        "standard": "Use short conversational paragraphs with restrained emphasis on key words.",
        "bullets": "Use concise Markdown bullet points, bold key ideas, and make priorities and practical actions easy to find.",
        "table": "Use compact Markdown tables for comparisons and summaries, with at most three short columns. Keep personal questions and dialogue in brief prose outside the table; do not force a table when there is nothing to compare or summarize.",
    }
    if response_format not in instructions:
        return prompt
    return prompt + "\n\n[VISIBLE RESPONSE FORMAT]\n" + instructions[response_format] + (
        " This controls presentation only: preserve meaning, sources, required content, language and the response-length budget. "
        "Finish lists and table rows within that budget. Apply only to the student-facing answer, "
        "including a reply field when JSON is required. Preserve all required JSON schemas, private blocks and protocol markers."
    )
