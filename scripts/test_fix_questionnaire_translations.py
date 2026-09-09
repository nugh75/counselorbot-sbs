"""Isolated SQLite regression tests: no production connection or LLM calls."""
import json
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend import models
from backend.i18n_fields import localized
from scripts.fix_questionnaire_translations import MANIFEST, apply_fixes


class TranslationFixTests(unittest.TestCase):
    def setUp(self):
        self.manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.engine = create_engine("sqlite://")
        for cls in (models.Instrument, models.QuestionnaireItem, models.ContentLanguageVersion):
            cls.__table__.create(self.engine)
        self.db = Session(self.engine)
        rows, versions = {}, set()
        for entry in self.manifest["items"]:
            key = (entry["code"], entry["item_number"])
            if key not in rows:
                rows[key] = models.QuestionnaireItem(
                    instrument_code=key[0], item_number=key[1], active=True,
                    factor_code="KEEP", reverse_scoring=True,
                    text_i18n={"it": "Testo italiano da conservare"},
                )
            row = rows[key]
            row.text_i18n = {**row.text_i18n, entry["locale"]: entry["before"]}
            versions.add((key[0], entry["locale"]))
        self.db.add_all(rows.values())
        for entry in self.manifest["response_labels"]:
            self.db.add(models.Instrument(
                code=entry["code"], response_scale_min=1, response_scale_max=4,
                response_labels={entry["locale"]: entry["before"], "it": ["1", "2", "3", "4"]},
            ))
            versions.add((entry["code"], entry["locale"]))
        for code, locale in versions:
            self.db.add(models.ContentLanguageVersion(
                content_type="instrument", content_key=code, locale=locale,
                status="pilot", version_label="previous", notes="Preserve provenance",
            ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_apply_all_and_rerun_preserves_scoring_and_other_languages(self):
        self.assertEqual(apply_fixes(self.db, self.manifest), 88)
        self.db.commit()
        self.assertEqual(apply_fixes(self.db, self.manifest), 0)
        for entry in self.manifest["items"]:
            row = self.db.query(models.QuestionnaireItem).filter_by(
                instrument_code=entry["code"], item_number=entry["item_number"]
            ).one()
            self.assertEqual(localized(row, "text", entry["locale"]), entry["after"])
            self.assertEqual(localized(row, "text", "it"), "Testo italiano da conservare")
            self.assertEqual(row.factor_code, "KEEP")
            self.assertTrue(row.reverse_scoring)
        for row in self.db.query(models.ContentLanguageVersion):
            self.assertEqual(row.status, "pilot")
            self.assertEqual(row.version_label, "previous+editorial-2026-09-09")
            self.assertTrue(row.notes.startswith("Preserve provenance\n"))
        instrument = self.db.query(models.Instrument).one()
        self.assertEqual(instrument.response_labels["it"], ["1", "2", "3", "4"])
        self.assertEqual(len(set(instrument.response_labels["de"])), 4)

    def test_dry_run_leaves_no_changes(self):
        apply_fixes(self.db, self.manifest)
        self.db.rollback()
        self.assertEqual(apply_fixes(self.db, self.manifest), 88)

    def test_concurrent_edit_aborts_whole_transaction(self):
        row = self.db.query(models.Instrument).one()
        row.response_labels = {"de": ["An independently edited scale"]}
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "Current labels differ"):
            apply_fixes(self.db, self.manifest)
        self.db.rollback()
        entry = self.manifest["items"][0]
        row = self.db.query(models.QuestionnaireItem).filter_by(
            instrument_code=entry["code"], item_number=entry["item_number"]
        ).one()
        self.assertEqual(localized(row, "text", entry["locale"]), entry["before"])
        self.assertEqual(self.db.query(models.ContentLanguageVersion).first().version_label, "previous")

    def test_legacy_fallback_is_corrected_without_losing_other_text(self):
        row = self.db.query(models.QuestionnaireItem).filter_by(
            instrument_code="QSA", item_number=3
        ).one()
        texts = dict(row.text_i18n)
        row.text_en = texts.pop("en")
        row.text_i18n = texts
        self.db.commit()
        apply_fixes(self.db, self.manifest)
        self.assertTrue(localized(row, "text", "en").startswith("I do poorly"))
        self.assertEqual(localized(row, "text", "it"), "Testo italiano da conservare")


if __name__ == "__main__":
    unittest.main()
