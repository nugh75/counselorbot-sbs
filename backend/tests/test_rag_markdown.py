"""RAG migration: canonical Markdown, stable signatures and historical citations."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend import rag_index as rag


class MarkdownCorpusTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.docs = self.root / "docs"
        self.converted = self.docs / "graphify-out/converted"
        self.semantic = self.docs / "graphify-out/cache/semantic"
        self.stat_index = self.docs / "graphify-out/cache/stat-index.json"
        self.scope = self.root / "rag_scope.json"
        self.docs.mkdir()
        self.patch = patch.multiple(
            rag, DOCS_DIR=str(self.docs), CONVERTED_DIR=str(self.converted),
            SEMANTIC_DIR=str(self.semantic), STAT_INDEX_PATH=str(self.stat_index),
            SCOPE_CONFIG_PATH=str(self.scope), INDEX_DIR=str(self.root),
        )
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def write(self, name, text):
        path = self.docs / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("<!-- pdf2md {} -->\n" + text if name.endswith(".md") else text)
        return path

    def legacy(self, source):
        self.write("graphify-out/converted/old_1234abcd.md", "# Obsoleto\nTesto vecchio.")
        self.stat_index.parent.mkdir(parents=True, exist_ok=True)
        self.stat_index.write_text(json.dumps({str(self.docs / source): {"hash": "1234abcd0000"}}))
        self.semantic.mkdir(exist_ok=True)
        (self.semantic / "g.json").write_text(json.dumps({
            "nodes": [{"id": "node1", "source_file": str(self.docs / source)}], "edges": [],
        }))

    def test_markdown_works_without_graphify_and_in_expected_collections(self):
        self.write("fonti/Guida_2019.md", "# Guida\nContenuto ufficiale.")
        self.write("fonti/teoria.md", "# Teoria\nContenuto teorico.")
        self.write("questionari/QSA.md", "# QSA\nItem del questionario.")
        cases = [(rag._collect_guides_only, {"fonti/Guida_2019.md"}, rag.COLLECTION_COMPETENZE),
                 (rag._collect_framework, {"fonti/teoria.md"}, rag.COLLECTION_FRAMEWORK),
                 (rag._collect_questionari_graphify, {"questionari/QSA.md"}, rag.COLLECTION_QUESTIONARI)]
        for collect, expected, collection in cases:
            with self.subTest(collection=collection):
                chunks, signature = collect()
                self.assertEqual({c["source"] for c in chunks}, expected)
                self.assertEqual(signature, rag._scoped_corpus_signature(collection))

    def test_markdown_supersedes_pdf_and_stale_graphify_conversion(self):
        self.write("fonti/teoria.pdf", "PDF placeholder, must not be read")
        self.write("fonti/teoria.md", "# Nuovo\nContenuto aggiornato.")
        self.legacy("fonti/teoria.pdf")
        chunks, signature = rag._collect_corpus()
        self.assertEqual({c["source"] for c in chunks}, {"fonti/teoria.md"})
        self.assertIn("aggiornato", chunks[0]["text"])
        self.assertNotIn("vecchio", chunks[0]["text"])
        self.assertEqual(signature, rag._corpus_signature())
        self.assertNotIn("old_1234abcd.md", signature)
        _, rel_to_node, node_to_rel = rag._load_graph()
        self.assertEqual(rel_to_node["fonti/teoria.md"], "node1")
        self.assertEqual(node_to_rel["node1"], "fonti/teoria.md")

    def test_legacy_pdf_without_canonical_markdown_is_not_indexed(self):
        self.write("fonti/teoria.pdf", "PDF placeholder")
        self.legacy("fonti/teoria.pdf")
        chunks, signature = rag._collect_corpus()
        self.assertEqual(chunks, [])
        self.assertEqual(signature, rag._corpus_signature())

    def test_raw_pdf_is_excluded_even_when_forced_into_scope(self):
        self.write("fonti/raw.pdf", "PDF must never feed the index directly")
        self.scope.write_text(json.dumps({rag.COLLECTION_FRAMEWORK: {
            "include": ["fonti/raw.pdf"], "exclude": [],
        }}))
        chunks, signature = rag._collect_framework()
        self.assertEqual(chunks, [])
        self.assertEqual(signature, rag._scoped_corpus_signature(rag.COLLECTION_FRAMEWORK))
        chunks, signature = rag._collect_plain_corpus(str(self.docs))
        self.assertEqual(chunks, [])
        self.assertEqual(signature, rag._plain_signature(str(self.docs)))

    def test_build_artifacts_stay_excluded(self):
        self.write("fonti/teoria.md", "# Teoria\nTesto valido.")
        self.write("fonti/graphify-out/noise.md", "# Rumore\nNon indicizzare.")
        self.write("questionari/graphify-out/noise.pdf", "Do not read")
        chunks, signature = rag._collect_corpus()
        self.assertEqual({c["source"] for c in chunks}, {"fonti/teoria.md"})
        self.assertEqual(signature, rag._corpus_signature())

    def test_replacement_does_not_enroll_unrelated_markdown_or_bibliography(self):
        self.write("fonti/README.md", "# Internal notes").write_text("# Internal notes")
        self.write("fonti/schede-bibliografiche/Guida_2019.md", "# Bibliografia")
        self.write("fonti/Guida_2019.md", "# Guida\nTesto ufficiale.")
        self.assertFalse(rag.default_scope_for(rag.COLLECTION_FRAMEWORK, "fonti/README.md"))
        chunks, _ = rag._collect_guides_only()
        self.assertEqual({c["source"] for c in chunks}, {"fonti/Guida_2019.md"})

    def test_manual_pdf_exclusion_survives_rename_and_can_be_changed(self):
        self.write("fonti/teoria.md", "# Teoria\nTesto valido.")
        self.scope.write_text(json.dumps({rag.COLLECTION_FRAMEWORK: {
            "exclude": ["fonti/teoria.PDF"], "include": [],
        }}))
        chunks, signature = rag._collect_framework()
        self.assertFalse(chunks)
        self.assertEqual(signature, rag._scoped_corpus_signature(rag.COLLECTION_FRAMEWORK))
        rag.set_source_scope(rag.COLLECTION_FRAMEWORK, "fonti/teoria.md", True)
        chunks, _ = rag._collect_framework()
        self.assertEqual({c["source"] for c in chunks}, {"fonti/teoria.md"})

    def test_forced_pdf_include_does_not_duplicate_markdown(self):
        self.write("fonti/teoria.pdf", "Do not read")
        self.write("fonti/teoria.md", "# Teoria\nTesto unico.")
        self.scope.write_text(json.dumps({rag.COLLECTION_FRAMEWORK: {
            "include": ["fonti/teoria.pdf"], "exclude": [],
        }}))
        chunks, signature = rag._collect_framework()
        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0]["source"], "fonti/teoria.md")
        self.assertEqual(signature, rag._scoped_corpus_signature(rag.COLLECTION_FRAMEWORK))

    def test_old_pdf_citation_previews_replacement_markdown(self):
        self.write("fonti/teoria.md", "# Teoria\nTesto valido.")
        preview = rag.get_document_preview("fonti/teoria.pdf", rag.COLLECTION_FRAMEWORK)
        self.assertEqual(preview[0], "markdown")
        self.assertIn("Testo valido", preview[1])
        self.assertIsNone(rag.get_document_preview("../../outside.pdf", rag.COLLECTION_FRAMEWORK))

    def test_plain_collection_prefers_markdown_and_has_matching_signature(self):
        self.write("paper.md", "# Articolo\nTesto aggiornato.")
        self.write("paper.pdf", "Do not read")
        chunks, signature = rag._collect_plain_corpus(str(self.docs))
        self.assertEqual({c["source"] for c in chunks}, {"paper.md"})
        self.assertEqual(signature, rag._plain_signature(str(self.docs)))


if __name__ == "__main__":
    unittest.main()
