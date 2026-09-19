"""Local PDF ingress for RAG. Native libraries run in a bounded subprocess.

Text-retention guard follows ai4educ-shared-config/scripts/pdf2md.py at c262bf7.
Only the resulting Markdown is published to a collection; PDF input is temporary.
"""
from collections import Counter
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unicodedata


def _retention(native: str, markdown: str) -> float:
    def words(text):
        text = unicodedata.normalize("NFKC", text).replace("\u00ad", "")
        text = re.sub(r"-\s*\n\s*", "", text.lower())
        return Counter(re.findall(r"[^\W_]{3,}", text))
    expected = words(native)
    return sum((expected & words(markdown)).values()) / max(1, sum(expected.values()))


def _convert(source: Path) -> tuple[str, dict]:
    # Capture text BEFORE layout reconstruction: that engine can mutate the PDF.
    import pymupdf
    import pymupdf4llm

    pymupdf4llm.use_layout(False)
    data = source.read_bytes()
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        if not doc.is_pdf or not doc.page_count:
            raise ValueError("Il file non contiene un PDF valido.")
        if doc.needs_pass:
            raise ValueError("PDF protetto da password: carica una copia sbloccata.")
        native = []
        ocr_pages = []
        for page in doc:
            text = page.get_text("text", sort=True).strip()
            if not text and (page.get_images() or page.get_drawings()):
                tp = page.get_textpage_ocr(language="ita+eng", dpi=150, full=True)
                text = page.get_text("text", textpage=tp, sort=True).strip()
                ocr_pages.append(page.number + 1)
            native.append(text)
        if not any(native):
            raise ValueError("Nessun testo leggibile nel PDF, anche dopo OCR: carica un Markdown o una scansione più chiara.")
        chunks = pymupdf4llm.to_markdown(
            doc, page_chunks=True, show_progress=False,
            write_images=False, embed_images=False, margins=0,
        )
        sections, plain_pages, textless = [], [], []
        for page, (original, chunk) in enumerate(zip(native, chunks, strict=True), 1):
            text = chunk["text"].strip()
            if original and (page in ocr_pages or not text or _retention(original, text) < 0.98):
                text = original
                plain_pages.append(page)
            if not original:
                textless.append(page)
                text = "[Pagina senza testo riconosciuto: contenuto vuoto o esclusivamente grafico.]"
            sections.append(f"<!-- pagina {page} -->\n\n{text}\n")
        body = "\n" + "\n".join(sections)
        meta = {
            "version": "rag-1", "source_sha256": hashlib.sha256(data).hexdigest(),
            "body_sha256": hashlib.sha256(body.encode()).hexdigest(),
            "pages": list(range(1, len(native) + 1)), "ocr_pages": ocr_pages,
            "plain_text_pages": plain_pages, "textless_pages": textless,
        }
        return "<!-- pdf2md " + json.dumps(meta, sort_keys=True) + " -->\n" + body, meta


def pdf_to_markdown(content: bytes) -> tuple[bytes, str | None]:
    """Convert before changing collection files. Timeout/failure leaves no source."""
    with tempfile.TemporaryDirectory(prefix="rag-pdf-") as temp:
        source = Path(temp) / "source.pdf"
        output = Path(temp) / "source.md"
        source.write_bytes(content)
        try:
            result = subprocess.run(
                [sys.executable, "-m", "backend.pdf_markdown", str(source), str(output)],
                capture_output=True, text=True, timeout=300,
            )
        except subprocess.TimeoutExpired as exc:
            raise ValueError("Conversione PDF oltre il limite di 5 minuti: dividi il documento o carica il Markdown.") from exc
        try:
            report = json.loads(result.stdout)
        except (ValueError, TypeError):
            report = {}
        if result.returncode or not output.is_file():
            raise ValueError(report.get("error") or "Conversione PDF non riuscita: verifica il documento o carica il Markdown.")
        missing = report.get("textless_pages", [])
        warning = ("Pagine senza testo riconosciuto: " + ", ".join(map(str, missing)) +
                   ". Verifica il documento originale.") if missing else None
        return output.read_bytes(), warning


def publish_markdown(directory: str, filename: str, content: bytes, *, exclusive: bool = False):
    """Atomic publication. A converted PDF must never overwrite an existing MD."""
    target = Path(directory) / filename
    if target.is_symlink():
        raise FileExistsError("La destinazione è un collegamento simbolico.")
    fd, temporary = tempfile.mkstemp(prefix=".rag-upload-", dir=directory)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        if exclusive:
            os.link(temporary, target)
        else:
            os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        with contextlib.redirect_stdout(sys.stderr):
            markdown, meta = _convert(Path(sys.argv[1]))
            Path(sys.argv[2]).write_text(markdown, encoding="utf-8")
        print(json.dumps(meta))
    except Exception as exc:
        # Do not return arbitrary native-library diagnostics or document text.
        error = str(exc) if isinstance(exc, ValueError) else "PDF non convertibile: verifica il file o carica il Markdown."
        print(json.dumps({"error": error}))
        sys.exit(1)
