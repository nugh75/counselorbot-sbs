"""Canonical addresses and shared credentials for the Italian questionnaires.

The six scored questionnaires are filled in on competenzestrategiche.it in
Italian. The same table feeds the Compass prompt and the operational-plan
launch response, so a link can never point at a different questionnaire than
the one chosen in the administration.
"""

STRATEGIC_COMPETENCES_URLS = {
    "QSA": "https://www.competenzestrategiche.it/QSA/",
    "QSAr": "https://www.competenzestrategiche.it/QSAr/",
    "QPCS": "https://www.competenzestrategiche.it/QPCS/",
    "QPCC": "https://www.competenzestrategiche.it/QPCC/",
    "ZTPI": "https://www.competenzestrategiche.it/ZTPI/",
    "QAP": "https://www.competenzestrategiche.it/QAP/",
}
STRATEGIC_COMPETENCES_CODE = "1087"
STRATEGIC_COMPETENCES_PASSWORD = "counselor"
EXTERNAL_IT_HREF = "https://www.competenzestrategiche.it/"


def external_questionnaire_href(instrument_code: str) -> str:
    """The questionnaire-specific login page, with the site root as fallback."""
    return STRATEGIC_COMPETENCES_URLS.get(instrument_code, EXTERNAL_IT_HREF)
