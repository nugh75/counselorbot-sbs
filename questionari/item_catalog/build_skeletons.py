#!/usr/bin/env python3
"""Genera gli skeleton JSON del catalogo item (IT/EN/SV).

Emette SOLO struttura e metadati fattuali (conteggi, scale, fattori dove pubblici,
mappa item->dimensione per il QAP/CAAS). Il TESTO degli item resta vuoto: va inserito
da ricercatori autorizzati (vedi docs/questionari/item-catalog.md e PROGETTO doc WP2). Non sovrascrive file
gia' compilati.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Nomi dei fattori (etichette descrittive, gia' presenti in i18n-factors.ts).
# NB: NON sono gli item degli strumenti.
QSA_FACTORS = [
    ("C1", "direct",  "Strategie elaborative", "Elaborative strategies", "Bearbetningsstrategier"),
    ("C2", "direct",  "Autoregolazione", "Self-regulation", "Självreglering"),
    ("C3", "inverse", "Disorientamento", "Disorientation", "Desorientering"),
    ("C4", "direct",  "Disponibilità alla collaborazione", "Willingness to collaborate", "Samarbetsvilja"),
    ("C5", "direct",  "Organizzatori semantici", "Semantic organisers", "Semantiska organisatörer"),
    ("C6", "inverse", "Difficoltà di concentrazione", "Concentration difficulties", "Koncentrationssvårigheter"),
    ("C7", "direct",  "Autointerrogazione", "Self-questioning", "Självfrågande"),
    ("A1", "inverse", "Ansietà di base", "Baseline anxiety", "Grundångest"),
    ("A2", "direct",  "Volizione", "Volition", "Vilja"),
    ("A3", "direct",  "Attribuzione a cause controllabili", "Attribution to controllable causes", "Attribution till kontrollerbara orsaker"),
    ("A4", "inverse", "Attribuzione a cause incontrollabili", "Attribution to uncontrollable causes", "Attribution till okontrollerbara orsaker"),
    ("A5", "inverse", "Mancanza di perseveranza", "Lack of perseverance", "Brist på uthållighet"),
    ("A6", "direct",  "Percezione di competenza", "Perceived competence", "Upplevd kompetens"),
    ("A7", "inverse", "Interferenze emotive", "Emotional interference", "Emotionella störningar"),
]

QSAR_FACTORS = [
    ("C1r", "direct",  "Strategie elaborative per comprendere e ricordare", "Elaborative strategies for understanding and remembering", "Bearbetningsstrategier för förståelse och minne"),
    ("C2r", "direct",  "Strategie autoregolative", "Self-regulated strategies", "Självreglerande strategier"),
    ("C3r", "direct",  "Strategie grafiche e organizzatori semantici", "Graphic strategies and semantic organisers", "Grafiska strategier och semantiska organisatörer"),
    ("C4r", "inverse", "Carenza nel controllo dell'attenzione", "Lack of attention control", "Bristande kontroll över uppmärksamheten"),
    ("A1r", "inverse", "Ansietà e controllo delle emozioni", "Anxiety and emotional control", "Ångest och kontroll av känslor"),
    ("A2r", "direct",  "Volizione", "Volition", "Vilja"),
    ("A3r", "direct",  "Attribuzioni causali", "Causal attributions", "Orsaksförklaringar"),
    ("A4r", "direct",  "Percezione di competenza", "Perceived competence", "Upplevd kompetens"),
]

ZTPI_FACTORS = [
    ("T1", "inverse", "Passato Negativo", "Past Negative", "Negativt förflutet"),
    ("T2", "direct",  "Passato Positivo", "Past Positive", "Positivt förflutet"),
    ("T3", "direct",  "Presente Edonistico", "Present Hedonistic", "Hedonistisk nutid"),
    ("T4", "inverse", "Presente Fatalistico", "Present Fatalistic", "Fatalistisk nutid"),
    ("T5", "direct",  "Futuro", "Future", "Framtid"),
]

# QAP = CAAS (Savickas & Porfeli): 4 dimensioni x 6 item, mappatura per posizione (pubblica).
QAP_DIMS = [
    ("CONCERN",    "Preoccupazione (Futuro)", "Concern", "Oro (framtid)",            range(1, 7)),
    ("CONTROL",    "Controllo",               "Control", "Kontroll",                  range(7, 13)),
    ("CURIOSITY",  "Curiosità",               "Curiosity", "Nyfikenhet",              range(13, 19)),
    ("CONFIDENCE", "Fiducia",                 "Confidence", "Tillit",                  range(19, 25)),
]


def factor_entry(code, direction, it, en, sv):
    return {"code": code, "name": {"it": it, "en": en, "sv": sv}, "direction": direction}


def empty_text():
    return {"it": "", "en": "", "sv": ""}


def build_items(instrument, n, factor_by_index=None):
    items = []
    for i in range(1, n + 1):
        items.append({
            "id": f"{instrument}-{i:03d}",
            "factor": (factor_by_index or {}).get(i),  # None se proprietario
            "reverse": None,
            "text": empty_text(),
        })
    return items


def catalog(instrument, source, license_note, n_items, response_scale, report_scale, factors, items):
    return {
        "instrument": instrument,
        "source": source,
        "license_note": license_note,
        "n_items": n_items,
        "response_scale": response_scale,
        "report_scale": report_scale,
        "factors": factors,
        "items": items,
    }


def scale(min_, max_, labels=None):
    return {"min": min_, "max": max_, "labels": labels or {"it": [], "en": [], "sv": []}}


def main():
    catalogs = {}

    catalogs["qsa"] = catalog(
        "QSA",
        "M. Pellerey — QSA, competenzestrategiche.it (CNOS-FAP)",
        "Proprietario. Item e chiave fattori da inserire solo se autorizzati (PROGETTO WP0/WP2).",
        100,
        scale(None, None),  # scala di risposta item: da confermare dalla fonte ufficiale
        {"type": "stanine", "min": 1, "max": 9},
        [factor_entry(*f) for f in QSA_FACTORS],
        build_items("QSA", 100),
    )

    catalogs["ztpi"] = catalog(
        "ZTPI",
        "Zimbardo & Boyd (1999) — J Pers Soc Psychol 77(6), 1271–1288. Adatt. it. M. Pellerey.",
        "ZTPI: uso per ricerca secondo i termini degli autori originali.",
        56,
        scale(1, 5, {
            "it": ["1 = Molto falso", "2 = Abbastanza falso", "3 = Neutrale", "4 = Abbastanza vero", "5 = Molto vero"],
            "en": ["1 = Very untrue", "2 = Somewhat untrue", "3 = Neutral", "4 = Somewhat true", "5 = Very true"],
            "sv": ["1 = Mycket falskt", "2 = Ganska falskt", "3 = Neutralt", "4 = Ganska sant", "5 = Mycket sant"],
        }),
        {"type": "stanine", "min": 1, "max": 9},
        [factor_entry(*f) for f in ZTPI_FACTORS],
        build_items("ZTPI", 56),
    )

    catalogs["qsar"] = catalog(
        "QSAr",
        "M. Pellerey — QSAr, competenzestrategiche.it (CNOS-FAP)",
        "Proprietario. Item e chiave fattori da inserire solo se autorizzati (PROGETTO WP0/WP2).",
        46,
        scale(None, None),
        {"type": "stanine", "min": 1, "max": 9},
        [factor_entry(*f) for f in QSAR_FACTORS],
        build_items("QSAR", 46),
    )

    catalogs["qpcs"] = catalog(
        "QPCS",
        "M. Pellerey — QPCS, competenzestrategiche.it (CNOS-FAP)",
        "Proprietario. Item e chiave fattori da inserire solo se autorizzati.",
        55,
        # Due parti: 1-29 frequenza, 30-55 accordo (vedi PDF). Scala 1-4 in entrambe.
        scale(1, 4, {
            "it": ["1 = Mai o quasi mai", "2 = Qualche volta", "3 = Spesso", "4 = Sempre o quasi sempre"],
            "en": ["1 = Never/almost never", "2 = Sometimes", "3 = Often", "4 = Always/almost always"],
            "sv": ["1 = Aldrig/nästan aldrig", "2 = Ibland", "3 = Ofta", "4 = Alltid/nästan alltid"],
        }),
        {"type": "to_define", "min": None, "max": None},
        [],  # struttura fattori non pubblica: da definire dalla fonte
        build_items("QPCS", 55),
    )

    catalogs["qpcc"] = catalog(
        "QPCC",
        "M. Pellerey, F. Orio — QPCC (Ed. Lavoro 2001), competenzestrategiche.it",
        "Proprietario. Item e chiave fattori da inserire solo se autorizzati.",
        63,
        scale(1, 4, {
            "it": ["1 = Per nulla d'accordo", "2 = Solo in parte d'accordo", "3 = Abbastanza d'accordo", "4 = Pienamente d'accordo"],
            "en": ["1 = Strongly disagree", "2 = Partly agree", "3 = Fairly agree", "4 = Fully agree"],
            "sv": ["1 = Instämmer inte alls", "2 = Instämmer delvis", "3 = Instämmer ganska mycket", "4 = Instämmer helt"],
        }),
        {"type": "to_define", "min": None, "max": None},
        [],
        build_items("QPCC", 63),
    )

    # QAP/CAAS: dimensioni e mappa item->dimensione pubbliche; testo item dalla fonte CAAS.
    qap_factor_by_index = {}
    for code, _it, _en, _sv, rng in QAP_DIMS:
        for i in rng:
            qap_factor_by_index[i] = code
    catalogs["qap"] = catalog(
        "QAP",
        "CAAS (Savickas & Porfeli, 2012), adatt. it. Pellerey-Margottini-Leproni. Testo item: fonte CAAS ufficiale (vocopher.com).",
        "CAAS: uso per ricerca secondo i termini degli autori. Inserire il testo item dalla versione ufficiale EN e dalla versione SV validata.",
        24,
        scale(1, 5, {
            "it": ["1 = Pochissimo", "2 = Poco", "3 = Abbastanza", "4 = Molto", "5 = Moltissimo"],
            "en": ["1 = Not strong", "2 = Somewhat strong", "3 = Strong", "4 = Stronger", "5 = Strongest"],
            "sv": ["1 = Mycket svag", "2 = Ganska svag", "3 = Stark", "4 = Starkare", "5 = Starkast"],
        }),
        {"type": "sum_by_dimension", "min": None, "max": None},
        [factor_entry(code, "direct", it, en, sv) for code, it, en, sv, _ in QAP_DIMS],
        build_items("QAP", 24, qap_factor_by_index),
    )

    for name, data in catalogs.items():
        out = HERE / f"{name}.json"
        if out.exists():
            print(f"skip (esiste gia'): {out.name}")
            continue
        out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"scritto: {out.name}  (item={data['n_items']}, fattori={len(data['factors'])})")


if __name__ == "__main__":
    main()
