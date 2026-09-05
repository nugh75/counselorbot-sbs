"""One semantic icon catalogue for generation, validation and asset exports."""
import json
from pathlib import Path


ICON_CATALOG = json.loads(Path(__file__).with_suffix('.json').read_text(encoding='utf-8'))
DIAGRAM_ICONS = tuple(entry['id'] for entry in ICON_CATALOG)

ICON_SELECTION_PROMPT = (
    "Interpret each whole node in context, including negation; choose by meaning, never a keyword. "
    "Choose independently below or omit icon/use null if no honest match exists. "
    "Never mark an unmet goal or uncertain result as achieved. "
    "Omit icons for abstract self-beliefs (e.g. self-efficacy), not generic brain/heart/shield. "
    "Always keep the label. Icon meanings: "
    + '; '.join(f"{entry['id']}={entry['meaning']}" for entry in ICON_CATALOG) + '.'
)
