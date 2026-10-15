"""PDF export text: typographic punctuation survives and the legend fits the content."""
from io import BytesIO

from pypdf import PdfReader

from backend.pdf_generator import _latin1, generate_questionnaire_pdf


def pdf_text(**kwargs):
    pdf = generate_questionnaire_pdf(session_id="pdf-goal-0000000000", language="it", **kwargs)
    return "".join(page.extract_text() for page in PdfReader(BytesIO(pdf.read())).pages)


def test_pdf_renders_typographic_punctuation_instead_of_question_marks():
    sample = "nell’interfaccia, L’obiettivo, “se-allora”, Bloom → applicare — fine…"
    assert "?" not in _latin1(sample)
    text = pdf_text(questionnaire_type="OBIETTIVO_DOCENZA", scores=None,
                    messages=[{"role": "counselor", "text": sample}], summary_text=sample)
    assert "?" not in text
    assert "nell'interfaccia" in text and '"se-allora"' in text


def test_pdf_legend_appears_only_with_factor_scores():
    assert "Legenda" not in pdf_text(questionnaire_type="OBIETTIVO_DOCENZA", scores=None,
                                     messages=[{"role": "counselor", "text": "Obiettivo."}])
    assert "Legenda" in pdf_text(questionnaire_type="QSA", scores={"C1": 7})
