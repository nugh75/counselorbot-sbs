"""One semantic icon catalogue for generation, validation and asset exports."""
import json
from pathlib import Path


ICON_CATALOG = json.loads(Path(__file__).with_suffix('.json').read_text(encoding='utf-8'))
DIAGRAM_ICONS = tuple(entry['id'] for entry in ICON_CATALOG)

ICON_SELECTION_PROMPT = (
    "Interpret each whole node in context, including negation; choose by meaning, never a keyword. "
    "Use the dictionary symbol when it fits; omit icon/use null only for unmatched concepts. "
    "Never mark an unmet goal or uncertain result as achieved. "
    "For questionnaire factor nodes set factor to INSTRUMENT:CODE from the source, e.g. QSA:A6. "
    "The server assigns the fixed factor symbol, including self-beliefs; keep levels in the label. "
    "Always keep the label. Icon meanings: "
    + '; '.join(f"{entry['id']}={entry['meaning']}" for entry in ICON_CATALOG) + '.'
)
