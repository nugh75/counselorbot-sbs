"""Deterministic generator of the synthetic Italian school PII corpus (P2).

Run ``python3 -m backend.privacy.corpus.generator`` to rewrite
``it_school_v1.jsonl``; the test suite fails if the committed file drifts.

Template syntax: ``{kind}`` or ``{kind:key}`` fills a slot (same key = same
person, so ``{full:a}`` and ``{cf:a}`` stay coherent); ``[[text|category]]``
annotates a literal span (hand-written typos and edge cases). Slots whose
kind has no category are unannotated filler.
"""
from __future__ import annotations

import json
import random
import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from ..types import PIICategory

CORPUS_PATH = Path(__file__).with_name("it_school_v1.jsonl")
SEED = 20261024
VARIANTS_PER_TEMPLATE = 10

# Localized placeholder labels (02-progettazione §3.3).
PLACEHOLDER_LABELS = {
    PIICategory.PERSON: "PERSONA", PIICategory.EMAIL: "EMAIL", PIICategory.PHONE: "TELEFONO",
    PIICategory.FISCAL_CODE: "CODICE_FISCALE", PIICategory.ADDRESS: "INDIRIZZO",
    PIICategory.CITY: "CITTÀ", PIICategory.REGION: "REGIONE", PIICategory.SCHOOL: "SCUOLA",
    PIICategory.ORGANIZATION: "ORGANIZZAZIONE", PIICategory.IBAN: "IBAN",
    PIICategory.ID_DOCUMENT: "DOCUMENTO", PIICategory.STUDENT_ID: "MATRICOLA",
    PIICategory.BIRTH_DATE: "DATA_NASCITA", PIICategory.DATE: "DATA", PIICategory.URL: "URL",
    PIICategory.IP: "IP", PIICategory.SOCIAL: "SOCIAL", PIICategory.HEALTH: "SALUTE",
    PIICategory.ART9_OTHER: "DATO_PARTICOLARE",
}
QUASI_IDENTIFIERS = {PIICategory.PERSON, PIICategory.BIRTH_DATE, PIICategory.CITY,
                     PIICategory.ADDRESS, PIICategory.SCHOOL, PIICategory.REGION}

# --- Vocabularies -------------------------------------------------------------
# (name, gender); includes compound names, accents and names common among
# families of foreign origin living in Italy.
FIRST_NAMES = [
    ("Marco", "M"), ("Luca", "M"), ("Giulia", "F"), ("Sofia", "F"), ("Francesco", "M"),
    ("Alessandro", "M"), ("Chiara", "F"), ("Martina", "F"), ("Matteo", "M"), ("Lorenzo", "M"),
    ("Aurora", "F"), ("Alice", "F"), ("Niccolò", "M"), ("Nicolò", "M"), ("Mattia", "M"),
    ("Andrea", "M"), ("Noemi", "F"), ("Federica", "F"), ("Gabriele", "M"), ("Tommaso", "M"),
    ("Beatrice", "F"), ("Ginevra", "F"), ("Riccardo", "M"), ("Elisa", "F"), ("Davide", "M"),
    ("Maria Grazia", "F"), ("Gian Luca", "M"), ("Anna Maria", "F"), ("Pier Paolo", "M"),
    ("Maria Chiara", "F"), ("Gianmarco", "M"), ("Mariasole", "F"), ("Jacopo", "M"),
    ("Ilaria", "F"), ("Asia", "F"), ("Emanuele", "M"), ("Irene", "F"), ("Salvatore", "M"),
    ("Carmela", "F"), ("Gaetano", "M"), ("Rosa", "F"), ("Sole", "F"), ("Celeste", "F"),
    ("Gioia", "F"), ("Fiore", "M"), ("Mohamed", "M"), ("Fatima", "F"), ("Andrei", "M"),
    ("Ioana", "F"), ("Xin", "F"), ("Wei", "M"), ("Aisha", "F"), ("Ahmed", "M"),
    ("Yasmine", "F"), ("Bilal", "M"), ("Ana", "F"), ("Jiahui", "F"), ("Kevin", "M"),
    ("Erjon", "M"), ("Arjola", "F"), ("Oksana", "F"), ("Rahul", "M"), ("Priya", "F"),
    ("Adama", "M"), ("Amina", "F"), ("José", "M"), ("Zoë", "F"),
]
SURNAMES = [
    "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci",
    "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini", "Costa",
    "Giordano", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro", "Mariani",
    "Rinaldi", "Caruso", "Ferrara", "Galli", "Martini", "Leone", "D'Angelo", "Dell'Acqua",
    "La Rosa", "Lo Russo", "Di Stefano", "De Santis", "Dalla Valle", "Sant'Elia", "Volta",
    "Fiore", "Sole", "Bello", "Santo", "Zanetti", "Pellegrino", "Cattaneo", "Ferri",
    "Popescu", "Ionescu", "Chen", "Hu", "Zhang", "El Amrani", "Benali", "Hoxha", "Shehu",
    "Kovalenko", "Singh", "Diallo", "Traoré", "García", "Nguyen", "Sall", "Kaur",
]
# Real municipality cadastral (Belfiore) codes, used only to compute valid CFs.
BIRTH_PLACES = {
    "Roma": "H501", "Milano": "F205", "Napoli": "F839", "Torino": "L219", "Bologna": "A944",
    "Firenze": "D612", "Palermo": "G273", "Bari": "A662", "Genova": "D969",
    "Catania": "C351", "Verona": "L781", "Padova": "G224", "Perugia": "G478",
    "Cagliari": "B354", "Lecce": "E506", "Trento": "L378", "Ancona": "A271",
    "Pescara": "G482", "Salerno": "H703", "Brescia": "B157",
}
FOREIGN_BIRTH = {"Romania": "Z129", "Marocco": "Z330", "Cina": "Z210", "Albania": "Z100",
                 "Ucraina": "Z138", "India": "Z222", "Senegal": "Z343"}
REGIONS = ["Lazio", "Lombardia", "Campania", "Piemonte", "Emilia-Romagna", "Toscana",
           "Sicilia", "Puglia", "Liguria", "Veneto", "Umbria", "Sardegna", "Marche",
           "Abruzzo", "Trentino-Alto Adige", "Calabria", "Basilicata", "Molise"]
STREET_TYPES = ["Via", "Viale", "Piazza", "Corso", "Vicolo", "Largo", "via", "piazza"]
STREET_NAMES = ["dei Tigli", "delle Rose", "Garibaldi", "Mazzini", "della Libertà",
                "San Francesco", "Roma", "dei Mille", "Verdi", "delle Ginestre", "del Lavoro",
                "XX Settembre", "Cavour", "dei Gelsomini", "del Pratello", "Nazionale",
                "delle Querce", "Belvedere", "dell'Orto", "Vittorio Emanuele II"]
HOUSE_NUMBERS = ["1", "3", "7", "12", "18", "24", "45/B", "101", "8 int. 5", "n. 9", "33/A", "2bis"]
SCHOOL_TYPES = ["Liceo Scientifico", "Liceo Classico", "Liceo Linguistico",
                "Liceo delle Scienze Umane", "Liceo Artistico", "Istituto Tecnico Industriale",
                "Istituto Tecnico Economico", "Istituto Professionale", "Istituto Comprensivo",
                "Scuola Secondaria di primo grado", "ITIS", "IPSIA", "Convitto Nazionale"]
SCHOOL_NAMES = ["«Volta»", "«Le Querce»", "«Borgo Alto»", "«San Marco»", "«Colle Verde»",
                "«Sole»", "«Via dei Pini»", "«Rosa dei Venti»", "«Marconi»", "«Galilei»",
                "«Porta Nuova»", "«Valle Fiorita»"]
UNIVERSITIES = ["Università degli Studi di Perugia", "Politecnico di Torino",
                "Università di Bologna", "Università degli Studi di Napoli",
                "Università Roma Tre"]
ORGANIZATIONS = ["Polisportiva Aurora", "Associazione Il Girasole", "Parrocchia di San Michele",
                 "Cooperativa Arcobaleno", "Scout Agesci Roma 12", "Banda Musicale Santa Cecilia",
                 "ASD Pallavolo Colle Verde", "Centro Giovani La Fucina"]
HEALTH = ["dislessia", "discalculia", "disgrafia", "disortografia", "ADHD", "disturbo d'ansia",
          "attacchi di panico", "depressione", "epilessia", "diabete di tipo 1", "celiachia",
          "disturbo dello spettro autistico", "sindrome di Asperger", "anoressia",
          "disturbo oppositivo-provocatorio", "autismo"]
CERTIFICATIONS = ["certificazione DSA", "diagnosi di DSA", "certificazione Legge 104",
                  "la 104", "L. 104/1992", "legge 104/92", "un PDP per DSA",
                  "lo status di alunno BES", "una diagnosi di dislessia", "il sostegno per la 104"]
ART9 = ["di religione musulmana", "di fede ebraica", "testimone di Geova",
        "di religione evangelica", "omosessuale", "bisessuale", "transgender",
        "di religione sikh", "ortodosso praticante", "militante di un partito politico"]
SUBJECTS = ["matematica", "italiano", "storia", "inglese", "scienze", "latino", "fisica",
            "educazione fisica", "arte", "chimica", "francese", "religione"]
CLASSES = ["1A", "2B", "3C", "4D", "5E", "3B", "2A", "1C", "5F", "4B"]
GRADES = ["3", "4", "4 e mezzo", "5", "5 e mezzo", "6-", "6", "6+", "7", "7 e mezzo", "8", "9", "10"]
MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto",
          "settembre", "ottobre", "novembre", "dicembre"]
MOBILE_PREFIXES = ["320", "328", "329", "333", "334", "335", "338", "339", "340", "347",
                   "348", "349", "351", "366", "380", "388", "392"]
LANDLINE_PREFIXES = ["06", "02", "081", "011", "051", "055", "091", "080", "010", "075"]
EMAIL_DOMAINS = ["studenti.example.org", "scuola.example", "mail.example.com",
                 "istituto.example.net", "famiglia.example"]

# --- Synthetic identifiers ----------------------------------------------------
_CF_ODD = dict(zip("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                   [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 1, 0, 5, 7, 9, 13, 15, 17, 19, 21,
                    2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23]))
_CF_MONTHS = "ABCDEHLMPRST"


def _ascii_letters(value: str) -> str:
    plain = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return "".join(c for c in plain.upper() if "A" <= c <= "Z")


def _cf_part(value: str, is_name: bool) -> str:
    letters = _ascii_letters(value)
    cons = [c for c in letters if c not in "AEIOU"]
    vows = [c for c in letters if c in "AEIOU"]
    if is_name and len(cons) >= 4:
        return cons[0] + cons[2] + cons[3]
    return ("".join(cons + vows) + "XXX")[:3]


def cf_check_char(first15: str) -> str:
    total = sum(_CF_ODD[c] if i % 2 == 0 else (int(c) if c.isdigit() else ord(c) - 65)
                for i, c in enumerate(first15))
    return chr(65 + total % 26)


def fiscal_code(first: str, last: str, gender: str, birth: date, place_code: str) -> str:
    """Italian codice fiscale with a correct check character (no omocodia)."""
    day = birth.day + (40 if gender == "F" else 0)
    body = (_cf_part(last, False) + _cf_part(first, True) + f"{birth.year % 100:02d}"
            + _CF_MONTHS[birth.month - 1] + f"{day:02d}" + place_code)
    return body + cf_check_char(body)


def italian_iban(rng: random.Random) -> str:
    """IT IBAN with valid mod-97 check digits (CIN not validated)."""
    bban = (rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
            + "".join(rng.choice("0123456789") for _ in range(10))
            + "".join(rng.choice("0123456789") for _ in range(12)))
    numeric = "".join(c if c.isdigit() else str(ord(c) - 55) for c in bban + "IT00")
    return f"IT{98 - int(numeric) % 97:02d}{bban}"


@dataclass
class Person:
    first: str
    last: str
    gender: str
    birth: date
    place: str
    place_code: str


def _person(rng: random.Random) -> Person:
    first, gender = rng.choice(FIRST_NAMES)
    birth = date(rng.randint(2004, 2015), rng.randint(1, 12), rng.randint(1, 28))
    places = FOREIGN_BIRTH if rng.random() < 0.15 else BIRTH_PLACES
    place = rng.choice(sorted(places))
    return Person(first, rng.choice(SURNAMES), gender, birth, place, places[place])


def _email_local(p: Person, rng: random.Random) -> str:
    first, last = _ascii_letters(p.first).lower(), _ascii_letters(p.last).lower()
    return rng.choice([f"{first}.{last}", f"{first[0]}{last}", f"{first}{last}{p.birth.year % 100:02d}",
                       f"{last}.{first}", f"{first}_{last}"])


def _mobile(rng: random.Random) -> str:
    pre, rest = rng.choice(MOBILE_PREFIXES), f"{rng.randint(0, 9999999):07d}"
    return rng.choice([f"{pre} {rest}", f"{pre}{rest}", f"+39 {pre} {rest[:3]} {rest[3:]}",
                       f"+39 {pre}{rest}", f"{pre}-{rest}", f"{pre}.{rest[:3]}.{rest[3:]}",
                       f"0039 {pre}{rest}"])


def _mobile_odd(rng: random.Random) -> str:
    pre, rest = rng.choice(MOBILE_PREFIXES), f"{rng.randint(0, 9999999):07d}"
    return rng.choice([f"(+39) {pre}/{rest}", f"{pre} {rest[:2]} {rest[2:4]} {rest[4:]}",
                       f"+39-{pre}-{rest[:3]}-{rest[3:]}", f"{pre}/{rest[:3]}.{rest[3:5]}.{rest[5:]}"])


def _landline(rng: random.Random) -> str:
    pre = rng.choice(LANDLINE_PREFIXES)
    rest = f"{rng.randint(0, 10 ** (8 - len(pre)) - 1):0{8 - len(pre)}d}"
    return rng.choice([f"{pre} {rest}", f"{pre}-{rest}", f"{pre}/{rest}", f"{pre}{rest}"])


# kind -> category; None = unannotated filler.
SLOT_CATEGORY: dict[str, PIICategory | None] = {
    "full": PIICategory.PERSON, "first": PIICategory.PERSON, "surname": PIICategory.PERSON,
    "rev": PIICategory.PERSON, "full_lower": PIICategory.PERSON,
    "cf": PIICategory.FISCAL_CODE, "cf_lower": PIICategory.FISCAL_CODE,
    "email": PIICategory.EMAIL, "email_upper": PIICategory.EMAIL,
    "birth": PIICategory.BIRTH_DATE, "birth_long": PIICategory.BIRTH_DATE,
    "birthplace": PIICategory.CITY, "phone": PIICategory.PHONE, "phone_odd": PIICategory.PHONE,
    "landline": PIICategory.PHONE, "address": PIICategory.ADDRESS, "city": PIICategory.CITY,
    "region": PIICategory.REGION, "school": PIICategory.SCHOOL, "university": PIICategory.SCHOOL,
    "org": PIICategory.ORGANIZATION, "iban": PIICategory.IBAN, "docid": PIICategory.ID_DOCUMENT,
    "matricola": PIICategory.STUDENT_ID, "date": PIICategory.DATE, "url": PIICategory.URL,
    "ip": PIICategory.IP, "social": PIICategory.SOCIAL, "health": PIICategory.HEALTH,
    "cert": PIICategory.HEALTH, "art9": PIICategory.ART9_OTHER,
    "g": None, "prep": None, "subject": None, "cls": None, "grade": None, "num": None,
}


def _fill(kind: str, p: Person, rng: random.Random) -> str:
    if kind == "full":
        return f"{p.first} {p.last}"
    if kind == "first":
        return p.first
    if kind == "surname":
        return p.last
    if kind == "rev":
        return f"{p.last.upper()} {p.first}"
    if kind == "full_lower":
        return f"{p.first} {p.last}".lower()
    if kind in ("cf", "cf_lower"):
        code = fiscal_code(p.first, p.last, p.gender, p.birth, p.place_code)
        return code.lower() if kind == "cf_lower" else code
    if kind in ("email", "email_upper"):
        value = f"{_email_local(p, rng)}@{rng.choice(EMAIL_DOMAINS)}"
        return value.upper() if kind == "email_upper" else value
    if kind == "birth":
        return rng.choice([f"{p.birth.day:02d}/{p.birth.month:02d}/{p.birth.year}",
                           f"{p.birth.day}/{p.birth.month}/{p.birth.year}",
                           f"{p.birth.day:02d}-{p.birth.month:02d}-{p.birth.year}"])
    if kind == "birth_long":
        return f"{p.birth.day} {MONTHS[p.birth.month - 1]} {p.birth.year}"
    if kind == "birthplace":
        return p.place
    if kind == "prep":
        return "in" if p.place in FOREIGN_BIRTH else "a"
    if kind == "g":
        return "a" if p.gender == "F" else "o"
    if kind == "phone":
        return _mobile(rng)
    if kind == "phone_odd":
        return _mobile_odd(rng)
    if kind == "landline":
        return _landline(rng)
    if kind == "address":
        return f"{rng.choice(STREET_TYPES)} {rng.choice(STREET_NAMES)} {rng.choice(HOUSE_NUMBERS)}"
    if kind == "city":
        return rng.choice(sorted(BIRTH_PLACES))
    if kind == "region":
        return rng.choice(REGIONS)
    if kind == "school":
        return f"{rng.choice(SCHOOL_TYPES)} {rng.choice(SCHOOL_NAMES)}"
    if kind == "university":
        return rng.choice(UNIVERSITIES)
    if kind == "org":
        return rng.choice(ORGANIZATIONS)
    if kind == "iban":
        return italian_iban(rng)
    if kind == "docid":
        return (f"CA{rng.randint(0, 99999):05d}"
                + "".join(rng.choice("ABCDEFGHJKLMNPRSTUVWXYZ") for _ in range(2)))
    if kind == "matricola":
        return f"{rng.randint(100000, 999999)}"
    if kind == "date":
        return f"{rng.randint(1, 28)}/{rng.randint(1, 12)}/{rng.choice([2025, 2026])}"
    if kind == "url":
        return f"https://www.example.org/{_ascii_letters(p.first).lower()}-{rng.randint(1, 99)}"
    if kind == "ip":
        return f"192.0.2.{rng.randint(1, 254)}"
    if kind == "social":
        base = _ascii_letters(p.first).lower()
        return rng.choice([f"@{base}_{p.birth.year}", f"@{base}.{_ascii_letters(p.last).lower()}",
                           f"@{base[:4]}{rng.randint(1, 99):02d}", f"@x_{base}_x"])
    if kind == "health":
        return rng.choice(HEALTH)
    if kind == "cert":
        return rng.choice(CERTIFICATIONS)
    if kind == "art9":
        return rng.choice(ART9)
    if kind == "subject":
        return rng.choice(SUBJECTS)
    if kind == "cls":
        return rng.choice(CLASSES)
    if kind == "grade":
        return rng.choice(GRADES)
    if kind == "num":
        return str(rng.randint(2, 30))
    raise ValueError(kind)


# --- Templates ----------------------------------------------------------------
# (template, tags). Slot templates are expanded VARIANTS_PER_TEMPLATE times.
SLOT_TEMPLATES: list[tuple[str, tuple[str, ...]]] = [
    # registro, voti, assenze
    ("{full} ha preso {grade} nella verifica di {subject}.", ("registro",)),
    ("Nel registro risulta che {rev} ha {num} assenze ingiustificate questo mese.", ("registro",)),
    ("La media di {first} in {subject} è scesa a {grade} nel primo quadrimestre.", ("registro",)),
    ("Prof, {first:a} {surname:a} della {cls} non ha consegnato il compito di {subject}.", ("registro",)),
    ("Scrutinio {cls}: {rev}, {subject} {grade}, condotta 7.", ("registro", "punteggiatura")),
    ("Ho visto sul registro elettronico che {first:a} è stat{g:a} interrogat{g:a} e ha preso {grade}.",
     ("registro",)),
    # disciplina
    ("Nota disciplinare per {full}: ha disturbato durante la lezione della prof.ssa {surname}.",
     ("disciplina",)),
    ("{full:a} è stat{g:a} sospes{g:a} per tre giorni dopo la lite con {full}.", ("disciplina",)),
    ("Il consiglio di classe della {cls} ha convocato i genitori di {first:a} {surname:a} per il comportamento.",
     ("disciplina",)),
    ("Il prof. {surname} ha messo una nota a {first} perché usava il telefono in classe.", ("disciplina",)),
    # relazioni
    ("{first} dice che {first} e {first} la escludono dal gruppo di {subject}.", ("relazioni",)),
    ("Da quando {first:a} si è trasferit{g:a} alla {cls} mi sento sola e non parlo con nessuno.",
     ("relazioni",)),
    ("Il prof. {surname} mi ha detto che devo impegnarmi di più, ma {first} mi prende in giro.",
     ("relazioni",)),
    ("Ho paura di dire alla prof.ssa {surname} che {full} mi manda messaggi cattivi.", ("relazioni",)),
    ("Mia madre litiga ogni sera con {first} e non riesco a studiare {subject}.",
     ("relazioni",)),
    # salute e certificazioni
    ("{full} ha {cert} e la classe segue il suo PDP.", ("salute",)),
    ("Ai sensi della legge, {full} ha {cert} e ha diritto all'insegnante di sostegno.", ("salute",)),
    ("Mia sorella {first} soffre di {health} e salta spesso le lezioni.", ("salute",)),
    ("Il neuropsichiatra ha confermato che {first} ha {health}.", ("salute",)),
    ("{rev} (classe {cls}) - {cert}, verifiche con tempi aggiuntivi.", ("salute", "punteggiatura")),
    ("Non voglio che i compagni sappiano che ho {health}, solo {first} lo sa.", ("salute",)),
    ("La mamma di {first} ha portato il certificato medico ({health}).", ("salute",)),
    # categorie particolari art. 9
    ("{full} è {art9} e non partecipa all'ora di religione.", ("art9",)),
    ("In classe prendono in giro {first} perché è {art9}.", ("art9", "relazioni")),
    # contatti
    ("Potete contattarmi al {phone} oppure scrivere a {email}.", ("contatti",)),
    ("Il numero della mamma di {first} è {phone}.", ("contatti",)),
    ("Per l'uscita didattica chiamare la segreteria al {landline}.", ("contatti",)),
    ("Il mio indirizzo email è {email:a}, scrivetemi pure, sono {full:a}.", ("contatti",)),
    ("Abito in {address} a {city}, vicino alla scuola.", ("contatti", "anagrafica")),
    ("La famiglia di {full} si è trasferita in {address}, {city}.", ("contatti", "anagrafica")),
    ("Recapito di {rev}: cell. {phone}, mail {email}.", ("contatti", "punteggiatura")),
    ("Chiamami al {phone_odd} dopo le cinque.", ("contatti", "punteggiatura")),
    # anagrafica e codici
    ("Il codice fiscale di {full:a} è {cf:a}.", ("anagrafica",)),
    ("{full:a}, nat{g:a} {prep:a} {birthplace:a} il {birth:a}, CF {cf:a}.", ("anagrafica", "combinazione")),
    ("Iscrizione: {rev:a}, codice fiscale {cf:a}, residente in {address}.", ("anagrafica",)),
    ("Sono {first:a}, ho compiuto gli anni il {birth_long:a} e vivo a {city}.", ("anagrafica",)),
    ("Il mio cf è {cf_lower:a}, l'ho scritto minuscolo nel modulo.", ("anagrafica", "typo")),
    ("La carta d'identità di {full} è la {docid}.", ("anagrafica",)),
    ("Matricola {matricola}, {full}, corso di laurea in Scienze della Formazione.", ("anagrafica",)),
    # scuola, università, organizzazioni, territorio
    ("Frequento il {school} di {city} e sono in {cls}.", ("scuola",)),
    ("{full:a} si è iscritt{g:a} al {school} dopo le medie.", ("scuola",)),
    ("Il prossimo anno vorrei andare all'{university}.", ("scuola",)),
    ("{first} gioca a pallavolo con la {org} il martedì.", ("scuola",)),
    ("Sono nat{g:a} in {region} ma ora vivo a {city} con i nonni.", ("anagrafica",)),
    ("{full:a} frequenta il {school}, abita a {city} ed è nat{g:a} il {birth:a}.",
     ("scuola", "combinazione")),
    # social, web, pagamenti
    ("Seguimi su Instagram: {social:a}, ciao da {first:a}!", ("social",)),
    ("{first:a} ha pubblicato le foto della gita sul profilo {social:a}.", ("social", "relazioni")),
    ("Il blog di classe di {first:a} è {url:a}.", ("social",)),
    ("Il contributo volontario per la gita va versato sull'IBAN {iban}.", ("pagamenti",)),
    ("Dal registro degli accessi l'IP {ip} risulta collegato all'account di {full}.", ("social",)),
    # gergo, typo, punteggiatura insolita
    ("raga {first} oggi ha fatto un casino in classe xké nn ha studiato {subject}", ("gergo",)),
    ("bro {first} mi ha bloccat{g:a} su ig ({social}) e nn so xké", ("gergo", "social")),
    ("ciao sono {full_lower} della {cls}, mi scrivi al {phone}?", ("gergo", "typo")),
    ("SCRIVETE A {email_upper} PER LA RAPPRESENTANZA!!!", ("punteggiatura", "typo")),
    ("{surname},{first} ({cls})...assente;giustifica mancante.", ("punteggiatura", "registro")),
    ("Data di nascita: {birth}; luogo: {city}.", ("anagrafica", "punteggiatura")),
]

# Hand-written sentences: ambiguous names, negatives, indirect info, typos.
STATIC_TEMPLATES: list[tuple[str, tuple[str, ...]]] = [
    # ambiguità con nomi propri
    ("[[Rosa|person]] non è venuta a scuola oggi perché aveva la febbre.", ("ambiguo",)),
    ("Ho litigato con [[Sole|person]] durante la ricreazione.", ("ambiguo", "relazioni")),
    ("Il prof. [[Volta|person]] ha rimandato l'interrogazione di fisica.", ("ambiguo",)),
    ("[[Celeste|person]] e [[Gioia|person]] fanno sempre i compiti insieme.", ("ambiguo",)),
    ("La prof.ssa [[La Rosa|person]] ci ha portato una rosa per la festa della donna.", ("ambiguo",)),
    ("[[Fiore|person]] ha disegnato un fiore sul banco ed è stato richiamato.", ("ambiguo", "disciplina")),
    ("Al [[Liceo «Volta»|school]] c'è il sole tutto il giorno nelle aule al terzo piano.", ("ambiguo",)),
    ("[[Speranza|person]] dice che non c'è più speranza per la verifica di latino.", ("ambiguo",)),
    ("[[Santo|person]] è il più bravo in matematica, un santo con i compagni.", ("ambiguo",)),
    ("[[Rosa Bello|person]] ha scritto un tema bello sul mare.", ("ambiguo",)),
    # negativi (nessun dato personale)
    ("La rosa dei venti è nel libro di geografia a pagina 12.", ("negativo", "ambiguo")),
    ("Oggi c'è il sole e facciamo educazione fisica in cortile.", ("negativo", "ambiguo")),
    ("La volta della palestra perde acqua quando piove.", ("negativo", "ambiguo")),
    ("Ho preso 7 in matematica e 6 e mezzo in inglese.", ("negativo", "registro")),
    ("Il compito è a pagina 104, esercizi dal 3 al 15.", ("negativo",)),
    ("Domani c'è la verifica sul capitolo 12 e non ho studiato niente.", ("negativo",)),
    ("La classe 3B va in gita a Firenze a marzo.", ("negativo",)),
    ("Abbiamo studiato la legge di Ohm e la seconda legge della termodinamica.", ("negativo",)),
    ("Ho dormito solo 5 ore perché ero agitata per l'esame.", ("negativo",)),
    ("Il libro costa 24,50 euro e la cartoleria chiude alle 19.", ("negativo",)),
    ("Mi sento stanca e non so se scegliere il liceo o un istituto tecnico.", ("negativo",)),
    ("Il mio sogno è diventare veterinaria o insegnante di scuola primaria.", ("negativo",)),
    ("Non capisco le equazioni di secondo grado, mi aiuti?", ("negativo",)),
    ("La verifica è il 12/03, ma la prof non ha ancora detto l'orario.", ("negativo",)),
    ("Siamo in 24 in classe e solo 3 hanno fatto i compiti.", ("negativo",)),
    ("Il prof di storia ha spiegato la Rivoluzione francese in due ore.", ("negativo",)),
    ("Ho un'ansia pazzesca per l'orale di maturità.", ("negativo",)),
    ("Il codice della classe su Classroom è nella bacheca.", ("negativo",)),
    ("Per il PCTO abbiamo fatto 40 ore in un'azienda di logistica.", ("negativo",)),
    ("La mia materia preferita è scienze, odio invece il latino.", ("negativo",)),
    ("Il voto di condotta influisce sulla media dal prossimo anno.", ("negativo",)),
    ("Oggi in mensa c'era la pasta al pomodoro.", ("negativo",)),
    ("L'aula 104 è al primo piano vicino ai laboratori.", ("negativo",)),
    ("Ho perso il pullman delle 7:40 e sono entrato alla seconda ora.", ("negativo",)),
    ("La circolare n. 233 parla delle elezioni dei rappresentanti.", ("negativo",)),
    ("Il quiz ha 30 domande e si passa con 18.", ("negativo",)),
    ("Mi piace leggere romanzi fantasy e ascoltare musica.", ("negativo",)),
    ("Il teorema di Pitagora vale solo per i triangoli rettangoli.", ("negativo",)),
    ("Il prof ha detto che il compito vale doppio.", ("negativo",)),
    ("La palestra è chiusa per lavori fino a gennaio.", ("negativo",)),
    # informazioni indirette e typo su categorie sensibili
    ("Mio fratello ha la [[dislesia|health]] e la scuola non lo aiuta.", ("salute", "typo")),
    ("[[Marta|person]] è [[discalcula|health]] e le danno la calcolatrice.", ("salute", "typo")),
    ("Il figlio della vicina ha la [[104|health]] e un insegnante di sostegno.", ("salute", "indiretto")),
    ("Prendo le pillole per l'[[ansia|health]] da quando è morto il nonno.", ("salute", "indiretto")),
    ("Il lunedì esco prima per andare dalla [[logopedista|health]].", ("salute", "indiretto")),
    ("[[Luca|person]] ha l'insegnante di [[sostegno|health]] in tutte le materie.", ("salute", "indiretto")),
    ("Faccio il [[ramadan|art9_other]] e durante il digiuno fatico a concentrarmi.", ("art9", "indiretto")),
    ("[[Ahmed|person]] è uscito dalla moschea e poi è venuto all'oratorio con noi.", ("relazioni",)),
    ("Mi sono tagliata di nuovo, nessuno lo sa tranne [[Giada|person]].", ("salute", "indiretto")),
    ("La psicologa della scuola mi ha detto che ho [[sintomi depressivi|health]].", ("salute",)),
    # contatti con typo e punteggiatura
    ("Il mio num è [[3331234567|phone]] scrivimi su whatsapp", ("contatti", "gergo")),
    ("chiamami al[[3478876543|phone]]!!!", ("contatti", "punteggiatura")),
    ("Email:[[giulia.ferri@scuola.example|email]];tel:[[06 5551234|phone]]", ("contatti", "punteggiatura")),
    ("La mail è [[marco punto russo chiocciola mail.example.com|email]], scritta per esteso.",
     ("contatti", "typo")),
    ("Il cellulare di [[Sara|person]] è [[tre tre nove uno due tre quattro cinque sei sette|phone]].",
     ("contatti", "typo")),
    ("Codice fiscale: [[RSS MRC 09A12 H501 T|fiscal_code]] (con gli spazi).", ("anagrafica", "typo")),
    ("[[Dell'Acqua Martina|person]] / [[Lo Russo Kevin|person]] / [[D'Angelo Asia|person]] - 3C",
     ("punteggiatura", "registro")),
    ("Abito in [[via garibaldi 3|address]] [[roma|city]] scritto tutto minuscolo.", ("contatti", "typo")),
    ("io e [[giada|person]] siamo amiche dalla prima elementare", ("gergo", "typo")),
    ("Sono la mamma di [[Niccolò|person]] (2B? no, scusate, è in 2A).", ("relazioni", "punteggiatura")),
]


_SLOT_RE = re.compile(r"\{(\w+)(?::(\w+))?\}|\[\[([^|\]]+)\|(\w+)\]\]")


def render(template: str, rng: random.Random) -> tuple[str, list[dict]]:
    people: dict[str, Person] = {}
    parts: list[str] = []
    entities: list[dict] = []
    pos = 0
    cursor = 0
    for n, m in enumerate(_SLOT_RE.finditer(template)):
        literal = template[cursor:m.start()]
        parts.append(literal)
        pos += len(literal)
        cursor = m.end()
        if m.group(3) is not None:
            value, category = m.group(3), PIICategory(m.group(4))
        else:
            kind, key = m.group(1), m.group(2) or f"_{n}"
            person = people.setdefault(key, _person(rng))
            value, category = _fill(kind, person, rng), SLOT_CATEGORY[kind]
        if category is not None:
            entities.append({"start": pos, "end": pos + len(value),
                             "category": category.value, "text": value})
        parts.append(value)
        pos += len(value)
    parts.append(template[cursor:])
    return "".join(parts), entities


def _assign_placeholders(text: str, entities: list[dict]) -> str:
    counters: dict[str, int] = {}
    seen: dict[tuple[str, str], str] = {}
    for ent in entities:
        key = (ent["category"], ent["text"])
        if key not in seen:
            label = PLACEHOLDER_LABELS[PIICategory(ent["category"])]
            counters[label] = counters.get(label, 0) + 1
            seen[key] = f"[{label}_{counters[label]}]"
        ent["placeholder"] = seen[key]
    out, cursor = [], 0
    for ent in entities:
        out.append(text[cursor:ent["start"]])
        out.append(ent["placeholder"])
        cursor = ent["end"]
    out.append(text[cursor:])
    return "".join(out)


def build_corpus(seed: int = SEED, variants: int = VARIANTS_PER_TEMPLATE) -> list[dict]:
    rng = random.Random(seed)
    rows: list[tuple[str, list[dict], tuple[str, ...]]] = []
    for template, tags in SLOT_TEMPLATES:
        for _ in range(variants):
            rows.append((*render(template, rng), tags))
    for template, tags in STATIC_TEMPLATES:
        rows.append((*render(template, rng), tags))
    records, seen_texts = [], set()
    for text, entities, tags in rows:
        if text in seen_texts:
            continue
        seen_texts.add(text)
        quasi = {e["category"] for e in entities} & {c.value for c in QUASI_IDENTIFIERS}
        all_tags = set(tags) | ({"combinazione"} if len(quasi) >= 3 else set())
        records.append({
            "id": f"it-{len(records) + 1:04d}",
            "text": text,
            "tags": sorted(all_tags),
            "quasi_identifiers": len(quasi),
            "entities": entities,
            "expected_pseudonymized": _assign_placeholders(text, entities),
        })
    return records


def dumps(records: list[dict]) -> str:
    return "".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in records)


if __name__ == "__main__":
    corpus = build_corpus()
    CORPUS_PATH.write_text(dumps(corpus), encoding="utf-8")
    print(f"{len(corpus)} records -> {CORPUS_PATH}")
