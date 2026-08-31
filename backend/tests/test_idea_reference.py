"""Estrazione dei documenti usati come riferimento nello strumento Idea."""

from fpdf import FPDF
import pytest

from backend.idea_reference import (
    MAX_REFERENCE_CHARS,
    IdeaReferenceError,
    extract_reference_text,
    safe_reference_filename,
)


def test_txt_and_markdown_are_accepted_as_utf8_references():
    plain = extract_reference_text("appunti.txt", b"Prima riga\nSeconda riga")
    markdown = extract_reference_text("cornice.md", "# Costrutto\n\nDefinizione".encode())

    assert plain.text == "Prima riga\nSeconda riga"
    assert plain.kind == "text"
    assert markdown.text.startswith("# Costrutto")
    assert markdown.kind == "markdown"


def test_pdf_text_is_extracted_locally():
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    pdf.cell(text="Definizione operativa del costrutto")

    extracted = extract_reference_text("fonte.pdf", bytes(pdf.output()))

    assert "Definizione operativa" in extracted.text
    assert extracted.kind == "pdf"


def test_reference_is_capped_and_reports_truncation():
    extracted = extract_reference_text("lungo.txt", b"a" * (MAX_REFERENCE_CHARS + 50))

    assert len(extracted.text) == MAX_REFERENCE_CHARS
    assert extracted.truncated is True


@pytest.mark.parametrize("filename", ["fonte.docx", "fonte.rtf", "fonte.exe"])
def test_other_file_types_are_rejected(filename):
    with pytest.raises(IdeaReferenceError):
        extract_reference_text(filename, b"contenuto")


def test_empty_or_unreadable_references_are_rejected():
    with pytest.raises(IdeaReferenceError):
        extract_reference_text("vuoto.txt", b"   \n")
    with pytest.raises(IdeaReferenceError):
        extract_reference_text("rotto.pdf", b"not a pdf")


def test_filename_cannot_add_prompt_lines_or_a_path():
    assert safe_reference_filename("../../fonte\n[INSTRUCTION].md") == "fonte_[INSTRUCTION].md"
