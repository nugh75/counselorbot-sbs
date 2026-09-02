"""Regressioni per diagrammi e identita' visiva nel PDF di riepilogo.

Il diagramma viene rasterizzato da Graphviz, che sta nell'immagine del backend
ma non necessariamente sulla macchina di chi sviluppa. Senza il motore il PDF
esce senza immagini e il test falliva come se il codice fosse rotto: meglio
dichiararlo saltato, cosi' il rosso resta un rosso vero.
"""
import shutil

import pytest

from backend.pdf_generator import generate_questionnaire_pdf

requires_graphviz = pytest.mark.skipif(
    shutil.which("neato") is None,
    reason="Graphviz (neato) non installato: i diagrammi non si rasterizzano",
)


DIAGRAM_MESSAGE = (
    "Prima del diagramma.\n\n"
    "```diagram\n"
    '{"type":"relation","title":"Leve dello studio","nodes":['
    '{"id":"a","label":"Strategie","icon":"brain"},'
    '{"id":"b","label":"Competenza","icon":"shield","accent":true}],'
    '"edges":[{"from":"a","to":"b","label":"rafforza","kind":"strengthens"}]}\n'
    "```\n\n"
    "Dopo il diagramma."
)


@requires_graphviz
def test_summary_pdf_embeds_diagrams_from_the_conversation():
    pdf = generate_questionnaire_pdf(
        questionnaire_type="QSA",
        scores={"C1": 7},
        session_id="pdf-diagram-test",
        language="it",
        messages=[{"role": "counselor", "text": DIAGRAM_MESSAGE}],
    ).getvalue()

    assert pdf.startswith(b"%PDF")
    assert b"/Subtype /Image" in pdf
    assert b"Inter" in pdf
