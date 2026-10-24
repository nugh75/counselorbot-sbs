"""Pagine di PDF come immagini PIL, rasterizzate con PyMuPDF.

Prima passava da pdf2image, che lancia `pdftoppm` (Poppler): PyMuPDF e' gia'
nel backend, cosi' le app desktop hanno un programma esterno in meno."""
from __future__ import annotations

from PIL import Image


def render_pdf_pages(path: str, *, dpi: int, first_page: int, last_page: int) -> list[Image.Image]:
    """Pagine da `first_page` a `last_page`, 1-based e incluse come in pdf2image."""
    import pymupdf

    images: list[Image.Image] = []
    with pymupdf.open(path) as doc:
        for index in range(first_page - 1, min(last_page, doc.page_count)):
            pixmap = doc[index].get_pixmap(dpi=dpi)
            images.append(Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples))
    return images
