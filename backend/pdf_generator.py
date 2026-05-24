"""Generazione PDF dei risultati questionario."""
from io import BytesIO
from datetime import datetime

from fpdf import FPDF

# Mappa fattori: codice -> (nome, descrizione, invertito)
FACTOR_MAP: dict[str, dict[str, tuple[str, str, bool]]] = {
    "QSA": {
        "C1": ("Strategie elaborative", "Capacità di elaborare le informazioni", False),
        "C2": ("Autoregolazione", "Capacità di regolare il proprio studio", False),
        "C3": ("Disorientamento", "Senso di confusione nello studio", True),
        "C4": ("Disponibilità alla collaborazione", "Propensione al lavoro di gruppo", False),
        "C5": ("Organizzatori semantici", "Uso di mappe e schemi", False),
        "C6": ("Difficoltà di concentrazione", "Problemi di attenzione", True),
        "C7": ("Autointerrogazione", "Farsi domande durante lo studio", False),
        "A1": ("Ansietà di base", "Ansia generale verso lo studio", True),
        "A2": ("Volizione", "Forza di volontà", False),
        "A3": ("Attribuzione a cause controllabili", "Attribuire successi a sé stessi", False),
        "A4": ("Attribuzione a cause incontrollabili", "Attribuire a fortuna/caso", True),
        "A5": ("Mancanza di perseveranza", "Tendenza a mollare", True),
        "A6": ("Percezione di competenza", "Sentirsi capaci", False),
        "A7": ("Interferenze emotive", "Emozioni che disturbano", True),
    },
    "QSAr": {
        "C1r": ("Strategie elaborative per comprendere e ricordare", "Elaborazione e collegamento delle informazioni", False),
        "C2r": ("Strategie autoregolative", "Organizzazione e controllo del proprio studio", False),
        "C3r": ("Strategie grafiche e organizzatori semantici", "Uso di schemi, mappe, grafici e sintesi visive", False),
        "C4r": ("Carenza nel controllo dell'attenzione", "Distrazione e difficoltà a mantenere il focus", True),
        "A1r": ("Ansietà e controllo delle emozioni", "Interferenza dell'ansia nelle prove scolastiche", True),
        "A2r": ("Volizione", "Impegno e perseveranza nello studio", False),
        "A3r": ("Attribuzioni causali", "Lettura delle cause di successo e insuccesso", False),
        "A4r": ("Percezione di competenza", "Fiducia nelle proprie capacità di riuscire", False),
    },
    "ZTPI": {
        "T1": ("Passato Negativo", "Ricordi negativi e rimpianti legati al passato", True),
        "T2": ("Passato Positivo", "Visione calda e nostalgica del passato", False),
        "T3": ("Presente Edonistico", "Capacità di vivere l'attimo, orientamento al piacere", False),
        "T4": ("Presente Fatalistico", "Senso di impotenza e rassegnazione verso la vita", True),
        "T5": ("Futuro", "Orientamento verso obiettivi, pianificazione e carriera", False),
    },
}


class ResultPDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(25, 25, 30)
        self.cell(0, 10, "CounselorBot - Risultati Questionario", new_x="LMARGIN", new_y="NEXT", align="C")
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 130)
        self.cell(0, 10, f"Pagina {self.page_no()}/{{nb}}", align="C")


def _score_label(value: int, inverted: bool) -> tuple[str, tuple[int, int, int]]:
    """Restituisce (etichetta, colore RGB) per un punteggio."""
    if inverted:
        if value <= 3:
            return ("Forza", (34, 197, 94))
        elif value >= 7:
            return ("Area di Crescita", (239, 68, 68))
        else:
            return ("Nella Norma", (234, 179, 8))
    else:
        if value >= 7:
            return ("Forza", (34, 197, 94))
        elif value <= 3:
            return ("Area di Crescita", (239, 68, 68))
        else:
            return ("Nella Norma", (234, 179, 8))


def generate_questionnaire_pdf(
    questionnaire_type: str,
    scores: dict[str, int | float] | None,
    session_id: str,
    submitted_at: str | None = None,
) -> BytesIO:
    """Genera un PDF con i risultati del questionario, restituisce BytesIO."""
    pdf = ResultPDF()
    pdf.alias_nb_pages()
    pdf.add_page()

    # Sottointestazione
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(80, 80, 90)
    pdf.cell(0, 7, f"Tipo: {questionnaire_type}", new_x="LMARGIN", new_y="NEXT")
    if submitted_at:
        try:
            dt = datetime.fromisoformat(submitted_at)
            pdf.cell(0, 7, f"Data: {dt.strftime('%d/%m/%Y %H:%M')}", new_x="LMARGIN", new_y="NEXT")
        except (ValueError, TypeError):
            pass
    pdf.cell(0, 7, f"ID Sessione: {session_id[:16]}...", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # Corpo
    if questionnaire_type == "SAVICKAS":
        pdf.set_font("Helvetica", "", 12)
        pdf.set_text_color(100, 100, 110)
        pdf.multi_cell(0, 8, "Questo è un questionario qualitativo (Savickas).\nI risultati sono disponibili nella trascrizione della chat.")
        pdf.ln(4)
        pdf.set_font("Helvetica", "I", 10)
        pdf.set_text_color(60, 60, 70)
        pdf.multi_cell(0, 7, "Il percorso narrativo della Career Construction Interview\nnon produce punteggi numerici.")
    elif scores:
        factors = FACTOR_MAP.get(questionnaire_type, {})
        has_factor_info = any(code in factors for code in scores)

        if has_factor_info:
            pdf.set_font("Helvetica", "B", 12)
            pdf.set_text_color(25, 25, 30)
            pdf.cell(0, 8, "Punteggi per fattore:", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)

            for code, value in scores.items():
                value_int = int(round(float(value)))
                info = factors.get(code)
                if info:
                    name, desc, inverted = info
                    label, color = _score_label(value_int, inverted)

                    pdf.set_fill_color(*color)
                    pdf.set_text_color(25, 25, 30)
                    pdf.set_font("Helvetica", "B", 10)
                    pdf.cell(50, 7, f"  {code} - {name}", new_x="RIGHT")
                    pdf.set_font("Helvetica", "", 10)
                    pdf.cell(15, 7, f"{value_int}/9", new_x="RIGHT", align="C")
                    pdf.set_font("Helvetica", "", 9)
                    pdf.set_text_color(*color)
                    pdf.cell(40, 7, f"[{label}]", new_x="RIGHT")
                    pdf.ln(7)
                    pdf.set_x(pdf.l_margin + 6)
                    pdf.set_font("Helvetica", "I", 8)
                    pdf.set_text_color(100, 100, 110)
                    pdf.multi_cell(0, 5, desc)
                    pdf.ln(2)
                else:
                    pdf.set_font("Helvetica", "", 10)
                    pdf.set_text_color(25, 25, 30)
                    pdf.cell(50, 7, f"  {code}")
                    pdf.cell(15, 7, str(value_int), align="C")
                    pdf.ln(7)
        else:
            pdf.set_font("Helvetica", "", 11)
            pdf.set_text_color(80, 80, 90)
            pdf.cell(0, 8, "Punteggi:", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)
            for code, value in scores.items():
                value_int = int(round(float(value)))
                pdf.set_font("Helvetica", "", 10)
                pdf.set_text_color(25, 25, 30)
                pdf.cell(50, 7, f"  {code}")
                pdf.cell(15, 7, f"{value_int}/9", align="C")
                pdf.ln(7)

    # Legenda
    pdf.ln(6)
    pdf.set_draw_color(200, 200, 210)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(80, 80, 90)
    pdf.cell(0, 6, "Legenda:", new_x="LMARGIN", new_y="NEXT")

    legend_items = [
        ("Forza", (34, 197, 94)),
        ("Nella Norma", (234, 179, 8)),
        ("Area di Crescita", (239, 68, 68)),
    ]
    for leg_label, leg_color in legend_items:
        pdf.set_fill_color(*leg_color)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(60, 60, 70)
        pdf.cell(6, 5, "", fill=True)
        pdf.cell(4, 5, "")
        pdf.cell(30, 5, leg_label)
        pdf.ln(5)

    # Nota fattori invertiti
    if questionnaire_type in ("QSA", "ZTPI"):
        pdf.ln(2)
        pdf.set_font("Helvetica", "I", 7)
        pdf.set_text_color(140, 140, 150)
        pdf.multi_cell(0, 4, "Nota: per alcuni fattori il punteggio e' invertito (punteggio basso = Forza).")

    pdf_bytes = BytesIO()
    pdf.output(pdf_bytes)
    pdf_bytes.seek(0)
    return pdf_bytes
