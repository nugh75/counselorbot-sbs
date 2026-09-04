"""Regressioni per diagrammi e identita' visiva nel PDF di riepilogo.

Il diagramma viene rasterizzato da Graphviz, che sta nell'immagine del backend
ma non necessariamente sulla macchina di chi sviluppa. Senza il motore il PDF
esce senza immagini e il test falliva come se il codice fosse rotto: meglio
dichiararlo saltato, cosi' il rosso resta un rosso vero.
"""
import shutil
from io import BytesIO

import pytest
from pypdf import PdfReader

from backend.pdf_generator import generate_questionnaire_pdf, render_score_chart_png

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


def test_score_chart_is_a_png_and_precedes_recommendations_and_details():
    chart = render_score_chart_png(
        questionnaire_type="QPCS",
        scores={"S1": 7, "S2": 5, "S3": 3, "S4": 6, "S5": 8},
        language="it",
    )
    assert chart.startswith(b"\x89PNG\r\n\x1a\n")

    pdf = generate_questionnaire_pdf(
        questionnaire_type="QPCS",
        scores={"S1": 7, "S2": 5, "S3": 3, "S4": 6, "S5": 8},
        session_id="pdf-qpcs-opening-test",
        language="it",
        summary_text="Un consiglio concreto per il prossimo passo.",
        recommendations={
            "reading": [{"title": "Una lettura utile", "why": "Approfondisce il tema."}],
            "strategy": [{"name": "Una strategia utile", "description": "Provala questa settimana."}],
        },
    ).getvalue()

    assert b"/Subtype /Image" in pdf
    text = "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(pdf)).pages)
    chart_pos = text.index("Grafico dei punteggi")
    readings_pos = text.index("Letture consigliate")
    strategies_pos = text.index("Strategie consigliate")
    advice_pos = text.index("Sintesi e consigli")
    details_pos = text.index("Punteggi per fattore")
    assert chart_pos < readings_pos < strategies_pos < advice_pos < details_pos
