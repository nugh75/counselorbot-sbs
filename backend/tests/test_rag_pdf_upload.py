"""Real PDF/OCR conversion and isolated HTTP upload-to-Markdown contracts."""
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pymupdf

from backend import pdf_markdown, rag_index as rag
from backend.routes import rag_docs


def pdf_bytes(*, scanned=False, blank=False, encrypted=False):
    with pymupdf.open() as doc:
        page = doc.new_page()
        if not blank:
            page.insert_text((60, 90), "Strategic learning and personal planning.", fontsize=20)
        if scanned:
            pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
            with pymupdf.open() as scan:
                scan.new_page().insert_image(page.rect, stream=pix.tobytes("png"))
                return scan.tobytes()
        if encrypted:
            return doc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256,
                               owner_pw="owner", user_pw="user")
        return doc.tobytes()


class PdfConversionTests(unittest.TestCase):
    def test_text_pdf_retains_text_and_page_provenance(self):
        markdown, warning = pdf_markdown.pdf_to_markdown(pdf_bytes())
        self.assertTrue(markdown.startswith(b"<!-- pdf2md "))
        self.assertIn(b"Strategic learning", markdown)
        self.assertIn(b"<!-- pagina 1 -->", markdown)
        self.assertIsNone(warning)

    def test_scan_uses_real_local_ocr(self):
        markdown, warning = pdf_markdown.pdf_to_markdown(pdf_bytes(scanned=True))
        self.assertIn(b"Strategic learning", markdown)
        self.assertIn(b'"ocr_pages": [1]', markdown)
        self.assertIsNone(warning)

    def test_mixed_document_reports_unreadable_page(self):
        with pymupdf.open(stream=pdf_bytes(), filetype="pdf") as doc:
            doc.new_page()
            markdown, warning = pdf_markdown.pdf_to_markdown(doc.tobytes())
        self.assertIn(b'"textless_pages": [2]', markdown)
        self.assertIn("2", warning)

    def test_invalid_encrypted_and_blank_pdfs_fail(self):
        for data in [b"not a PDF", pdf_bytes(encrypted=True), pdf_bytes(blank=True)]:
            with self.subTest(size=len(data)), self.assertRaises(ValueError):
                pdf_markdown.pdf_to_markdown(data)

    def test_timeout_is_an_actionable_conversion_error(self):
        with patch.object(pdf_markdown.subprocess, "run", side_effect=subprocess.TimeoutExpired("convert", 300)):
            with self.assertRaisesRegex(ValueError, "5 minuti"):
                pdf_markdown.pdf_to_markdown(pdf_bytes())

    def test_layout_text_loss_falls_back_to_original_text(self):
        # Regression: layout processing can mutate the input document.
        import pymupdf4llm
        def destructive_layout(doc, **kwargs):
            doc[0].add_redact_annot(doc[0].rect)
            doc[0].apply_redactions()
            return [{"text": "Strategic"}]
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "input.pdf"
            source.write_bytes(pdf_bytes())
            with patch.object(pymupdf4llm, "to_markdown", side_effect=destructive_layout):
                markdown, meta = pdf_markdown._convert(source)
            self.assertIn("personal planning", markdown)
            self.assertEqual(meta["plain_text_pages"], [1])


class UploadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        app = FastAPI()
        app.include_router(rag_docs.router)
        app.dependency_overrides[rag_docs.auth.get_current_active_admin] = lambda: {"username": "test"}
        app.dependency_overrides[rag_docs.get_db] = lambda: None
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.patches = [
            patch.object(rag_docs, "_require_collection", return_value="test"),
            patch.object(rag_docs, "upload_dir_for", return_value=str(self.root)),
            patch.object(rag_docs, "docs_roots_for", return_value=[str(self.root)]),
            patch.object(rag, "SCOPE_CONFIG_PATH", str(self.root / "scope.json")),
            patch.object(rag, "INDEX_DIR", str(self.root)),
            patch.object(rag_docs, "_reindex", side_effect=self.reindex),
        ]
        for mock in self.patches:
            mock.start()
            self.addCleanup(mock.stop)

    def reindex(self, db, collection):
        chunks, signature = rag._collect_plain_corpus(str(self.root))
        self.assertEqual(signature, rag._plain_signature(str(self.root)))
        self.assertTrue(all(c["source"].endswith(".md") for c in chunks))
        return {"n_chunks": len(chunks), "sources": sorted({c["source"] for c in chunks})}

    def upload(self, name, data):
        return self.client.post("/admin/rag/docs?collection=test", files={"file": (name, data)})

    def test_pdf_upload_publishes_and_indexes_only_markdown(self):
        result = self.upload("lesson.PDF", pdf_bytes())
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["filename"], "lesson.md")
        self.assertTrue(result.json()["converted"])
        self.assertEqual(result.json()["stats"]["sources"], ["lesson.md"])
        self.assertEqual([p.name for p in self.root.iterdir()], ["lesson.md"])
        self.assertIn("personal planning", (self.root / "lesson.md").read_text())

    def test_scan_upload_indexes_ocr_text(self):
        result = self.upload("scan.pdf", pdf_bytes(scanned=True))
        self.assertEqual(result.status_code, 200, result.text)
        self.assertGreater(result.json()["stats"]["n_chunks"], 0)
        self.assertIn("Strategic learning", (self.root / "scan.md").read_text())

    def test_bad_pdf_does_not_publish_or_reindex(self):
        with patch.object(rag_docs, "_reindex") as reindex:
            result = self.upload("bad.pdf", b"invalid PDF")
        self.assertEqual(result.status_code, 422, result.text)
        self.assertEqual(list(self.root.iterdir()), [])
        reindex.assert_not_called()

    def test_existing_markdown_is_not_overwritten_by_pdf(self):
        (self.root / "lesson.md").write_text("# Authored text")
        result = self.upload("lesson.pdf", pdf_bytes())
        self.assertEqual(result.status_code, 409, result.text)
        self.assertEqual((self.root / "lesson.md").read_text(), "# Authored text")

    def test_markdown_upload_and_utf8_validation(self):
        result = self.upload("notes.md", b"# Notes\n\nLearning strategies.")
        self.assertEqual(result.status_code, 200, result.text)
        self.assertFalse(result.json()["converted"])
        result = self.upload("notes.md", b"\xff\x00")
        self.assertEqual(result.status_code, 422, result.text)
        self.assertIn("Learning strategies", (self.root / "notes.md").read_text())

    def test_authored_markdown_upload_is_included_in_framework(self):
        fonti = self.root / "fonti"
        fonti.mkdir()
        with patch.object(rag_docs, "_require_collection", return_value=rag.COLLECTION_FRAMEWORK), \
             patch.object(rag_docs, "upload_dir_for", return_value=str(fonti)), \
             patch.object(rag, "DOCS_DIR", str(self.root)):
            result = self.upload("notes.md", b"# Notes\n\nLearning strategies.")
            self.assertEqual(result.status_code, 200, result.text)
            self.assertTrue(rag.source_in_scope(rag.COLLECTION_FRAMEWORK, "fonti/notes.md"))
            self.assertFalse(rag.default_scope_for(rag.COLLECTION_FRAMEWORK, "fonti/notes.md"))

    def test_markdown_reupload_preserves_saved_exclusion(self):
        rag.set_source_scope("test", "notes.md", False)
        result = self.upload("notes.md", b"# Notes\n\nLearning strategies.")
        self.assertEqual(result.status_code, 200, result.text)
        self.assertFalse(rag.source_in_scope("test", "notes.md"))

    def test_concurrent_destination_creation_is_not_overwritten(self):
        (self.root / "lesson.md").write_text("Other upload")
        with self.assertRaises(FileExistsError):
            pdf_markdown.publish_markdown(str(self.root), "lesson.md", b"Converted", exclusive=True)
        self.assertEqual((self.root / "lesson.md").read_text(), "Other upload")


if __name__ == "__main__":
    unittest.main()
