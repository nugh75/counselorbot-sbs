"""Repair presentational markup without changing prose or fenced code examples."""
import re

_CODE_FENCE = re.compile(r"```[^\n`]*\n[\s\S]*?(?:```|$)")
_SMALL = re.compile(r"</?small(?:\s[^>]*)?>", re.IGNORECASE)
_SEPARATOR_CELL = re.compile(r"\s*:?-{3,}:?\s*")


def _prose(text):
    lines = []
    prose = "".join(part if index % 2 else _SMALL.sub("", part)
                    for index, part in enumerate(re.split(r"(`+[^`]*`+)", text)))
    for line in prose.split("\n"):
        cells = line.strip().removeprefix("|").removesuffix("|").split("|")
        if len(cells) > 1 and all(_SEPARATOR_CELL.fullmatch(cell) for cell in cells):
            line = "| " + " | ".join(
                (":" if cell.strip().startswith(":") else "") + "---" +
                (":" if cell.strip().endswith(":") else "") for cell in cells
            ) + " |"
        lines.append(line)
    return "\n".join(lines)


def normalize_chat_markdown(text):
    result, cursor = [], 0
    for match in _CODE_FENCE.finditer(text):
        result.extend((_prose(text[cursor:match.start()]), match.group(0)))
        cursor = match.end()
    result.append(_prose(text[cursor:]))
    return "".join(result)
