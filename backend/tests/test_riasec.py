"""RIASEC (O*NET Interest Profiler Short Form): seed, scoring, ties, stability.

Deterministic tests: no AI, no network. The PostgreSQL run uses DATABASE_URL;
the scoring cases use an isolated in-memory database seeded from the catalog.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import database, models, scoring_service
from backend.path_step_types import valid_scores
from backend.questionnaire_catalog import INSTRUMENT_CATALOG_DEFAULTS
from backend.riasec import AREAS, INSTRUMENT_SPEC, MAX_AREA_TOTAL, holland_code, ordered_codes

LOCALES = ("it", "en", "es", "fr", "de", "sv")
AREA_ITEMS = {
    "R": range(1, 11),
    "I": range(11, 21),
    "A": range(21, 31),
    "S": range(31, 41),
    "E": range(41, 51),
    "C": range(51, 61),
}


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    database.Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    with session_factory() as session:
        yield session
    engine.dispose()


def seed_catalog(db):
    from backend.main import _seed_instruments_catalog

    _seed_instruments_catalog(db)


def answers_with(totals):
    answers = {number: 0 for number in range(1, 61)}
    for area, target in totals.items():
        per_item = target // 10
        for number in AREA_ITEMS[area]:
            answers[number] = per_item
    return answers


def test_catalog_has_sixty_items_ten_per_area_and_every_locale():
    spec = INSTRUMENT_CATALOG_DEFAULTS["RIASEC"]
    assert spec is INSTRUMENT_SPEC
    assert len(spec["items"]) == 60
    assert tuple(f["code"] for f in spec["factors"]) == AREAS
    for area in AREAS:
        assert sum(1 for item in spec["items"] if item["factor_code"] == area) == 10
    for locale in LOCALES:
        assert spec["name_i18n"][locale]
        assert spec["response_labels"][locale]
        assert len(spec["response_labels"][locale]) == 5
        assert spec["response_scale_min"] == 0 and spec["response_scale_max"] == 4
        assert all(item["text_i18n"][locale].strip() for item in spec["items"])
        assert all(factor["label_i18n"][locale].strip() for factor in spec["factors"])


def test_official_english_items_are_unique_and_not_paraphrased():
    english = [item["text_en"] for item in INSTRUMENT_SPEC["items"]]
    assert len(english) == len(set(english)) == 60
    assert english[0] == "Build kitchen cabinets"
    assert english[-1] == "Stamp, sort, and distribute mail for an organization"


def test_seed_is_idempotent(db):
    seed_catalog(db)
    seed_catalog(db)
    assert db.query(models.Instrument).filter_by(code="RIASEC").count() == 1
    assert db.query(models.QuestionnaireItem).filter_by(instrument_code="RIASEC").count() == 60
    assert db.query(models.Factor).filter_by(instrument_code="RIASEC").count() == 6
    instrument = db.query(models.Instrument).filter_by(code="RIASEC").first()
    assert instrument.response_scale_min == 0 and instrument.response_scale_max == 4
    assert set(instrument.response_labels) == set(LOCALES)
    assert instrument.response_labels["de"][0] == "Gefällt mir überhaupt nicht"


def test_profile_sums_the_manual_scale_and_never_leaks_the_code_by_default(db):
    seed_catalog(db)
    profile = scoring_service.compute_profile(db, "RIASEC", "it", answers_with({"R": 40, "I": 30, "A": 20}))
    dimensions = {row["code"]: row["raw_total"] for row in profile["riasec"]["dimensions"]}
    assert dimensions == {"R": 40, "I": 30, "A": 20, "S": 0, "E": 0, "C": 0}
    assert all(row["max_total"] == MAX_AREA_TOTAL for row in profile["riasec"]["dimensions"])
    assert profile["riasec"]["top_codes"] == ["R", "I", "A"]
    assert "holland_code" not in profile["riasec"]

    teacher = scoring_service.compute_profile(
        db, "RIASEC", "it", answers_with({"R": 40, "I": 30, "A": 20}), include_holland_code=True
    )
    assert teacher["riasec"]["holland_code"] == "RIA"


def test_stored_scores_are_raw_area_totals(db):
    seed_catalog(db)
    profile = scoring_service.compute_profile(db, "RIASEC", "en", answers_with({"S": 40, "C": 10}))
    assert scoring_service.mapped_result_scores(profile) == {
        "R": 0, "I": 0, "A": 0, "S": 40, "E": 0, "C": 10,
    }
    assert valid_scores(db, "RIASEC", scoring_service.mapped_result_scores(profile))
    assert not valid_scores(db, "RIASEC", {"R": 41, "I": 0, "A": 0, "S": 0, "E": 0, "C": 0})


def test_ties_follow_the_canonical_holland_order_and_are_stable():
    tied = {code: 10 for code in AREAS}
    assert ordered_codes(tied) == list(AREAS)
    assert holland_code(tied) == "RIA"
    assert holland_code({"R": 20, "I": 20, "A": 20, "S": 40, "E": 0, "C": 0}) == "SRI"
    # Repeating the same input yields the same code every time.
    for _ in range(5):
        assert holland_code({"R": 12, "I": 12, "A": 30, "S": 12, "E": 0, "C": 0}) == "ARI"


def test_only_the_teacher_detail_exposes_the_holland_code(db):
    seed_catalog(db)
    result = models.QuestionnaireResult(
        session_id="riasec-teacher",
        questionnaire_type="RIASEC",
        scores={"R": 40, "I": 30, "A": 20, "S": 0, "E": 0, "C": 0},
        username="student",
    )
    db.add(result)
    db.commit()
    from backend.teacher_results import result_detail

    detail = result_detail(db, result, "it")
    assert detail["riasec"]["holland_code"] == "RIA"
    assert [row["code"] for row in detail["riasec"]["dimensions"]] == list(AREAS)


def test_every_locale_is_administered_with_its_own_text(db):
    seed_catalog(db)
    for locale in LOCALES:
        rules = scoring_service.get_rules(db, "RIASEC", locale)
        assert rules["instrument"]["response_labels"] == INSTRUMENT_SPEC["response_labels"][locale]
        assert len([item for item in rules["items"] if item["active"]]) == 60
        assert all(item["text"] for item in rules["items"])
        assert rules["instrument"]["name"] == INSTRUMENT_SPEC["name_i18n"][locale]
