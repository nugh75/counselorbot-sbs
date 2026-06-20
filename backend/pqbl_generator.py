"""Generazione di question bank pQBL (pure Question-Based Learning) da PDF.

Metodo di Jemstedt & Bälter (2025): il materiale di apprendimento è costituito
SOLO da domande a scelta multipla con feedback formativo per ogni alternativa.
Regole replicate dall'articolo:
- ogni MCQ ha 4 alternative (1 corretta + 3 distrattori), nessuna ovvia (R1);
- feedback costruttivo unico per ogni alternativa; il feedback dei distrattori
  spiega l'errore SENZA rivelare la risposta corretta (R2);
- le domande sono organizzate per skill ("saper ..."), ~4 MCQ per skill (R3).

Pipeline: estrazione testo (pypdf) → splitting per capitoli/sezioni →
generazione 4 MCQ per chunk (1 chiamata LLM per chunk) → validazione pura-Python.
Il primo chunk viene generato subito; i successivi in background mentre lo
studente risponde (streaming delle domande).
"""
from __future__ import annotations

import json
import logging
import math
import re
import unicodedata
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# Limiti per restare nel contesto del modello: PDF più lunghi vengono troncati.
# Non c'è più limite al numero di pagine: il PDF viene suddiviso in segmenti
# di PAGES_PER_SEGMENT pagine, ciascuno genera 4 MCQ indipendentemente.
PAGES_PER_SEGMENT = 3
MAX_TEXT_CHARS_PER_SEGMENT = 30_000
# Testo minimo perché il PDF sia considerato leggibile (sotto = scansione).
MIN_TEXT_CHARS = 100

ALLOWED_SESSION_SIZES = (10, 20, 30)
QUESTIONS_PER_CHUNK = 4
OPTION_KEYS = ("A", "B", "C", "D")
# Ogni chunk deve avere almeno questo numero di caratteri per generare MCQ.
MIN_CHUNK_CHARS = 1000


# ---------------------------------------------------------------------------
# Estrazione testo dal PDF
# ---------------------------------------------------------------------------
def pdf_total_pages(path: str) -> int:
    """Ritorna il numero totale di pagine del PDF."""
    from pypdf import PdfReader
    return len(PdfReader(path).pages)


def extract_pdf_text_range(path: str, start_page: int, end_page: int) -> str:
    """Estrae il testo da un range di pagine di un PDF in formato Markdown.

    Args:
        path: percorso del file PDF.
        start_page: indice prima pagina (0-based).
        end_page: indice fine pagina (esclusivo).

    Solleva ValueError se il range non produce testo sufficiente.
    """
    import os

    full_text = ""
    try:
        import pymupdf4llm
        pages_to_extract = list(range(start_page, end_page))
        logger.info(f"pQBL: tentativo estrazione Markdown con pymupdf4llm per le pagine {start_page + 1}-{end_page}...")
        full_text = pymupdf4llm.to_markdown(path, pages=pages_to_extract).strip()
    except Exception as e:
        logger.warning(f"pQBL: pymupdf4llm fallito per le pagine {start_page + 1}-{end_page}: {e}. Tento pypdf come ripiego...")
        try:
            from pypdf import PdfReader
            reader = PdfReader(path)
            pages = reader.pages[start_page:end_page]
            page_texts: List[str] = []
            for page in pages:
                try:
                    text = page.extract_text() or ""
                    page_texts.append(text)
                except Exception as pypdf_err:
                    logger.warning(f"pQBL: errore pypdf su pagina: {pypdf_err}")
            full_text = "\n".join(page_texts).strip()
        except Exception as fallback_err:
            logger.error(f"pQBL: ripiego pypdf fallito: {fallback_err}")
            full_text = ""

    # Fallback su GLM OCR se il testo estratto è insufficiente (< MIN_TEXT_CHARS)
    if len(full_text) < MIN_TEXT_CHARS:
        logger.info(f"pQBL: testo insufficiente ({len(full_text)} char) nelle pagine {start_page + 1}-{end_page}. Tento fallback su GLM OCR...")
        try:
            from pdf2image import convert_from_path
            import io
            import base64
            import httpx

            # Converti solo le pagine richieste (1-based per pdf2image)
            images = convert_from_path(
                path,
                dpi=150,  # Risoluzione bilanciata per velocità/qualità OCR
                first_page=start_page + 1,
                last_page=end_page,
            )
            
            ocr_pages = []
            ollama_url = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip('/')
            ocr_model = os.getenv("QSA_OCR_MODEL", "glm-ocr:latest")
            
            for i, img in enumerate(images):
                # Converti in JPEG base64
                buffered = io.BytesIO()
                img.save(buffered, format="JPEG")
                img_b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
                
                payload = {
                    "model": ocr_model,
                    # Chiediamo esplicitamente output Markdown per mantenere la struttura anche con l'OCR!
                    "prompt": "Faithfully and completely transcribe all visible text in this page in Markdown format (using #, ##, lists, tables if present) in its original language. Do not interpret.",
                    "images": [img_b64],
                    "stream": False,
                    "options": {"temperature": 0},
                }
                
                logger.info(f"pQBL: Esecuzione OCR con {ocr_model} per pagina {start_page + i + 1}...")
                response = httpx.post(f"{ollama_url}/api/generate", json=payload, timeout=240.0)
                response.raise_for_status()
                text = response.json().get("response", "").strip()
                if text:
                    ocr_pages.append(text)
            
            ocr_text = "\n\n".join(ocr_pages).strip()
            if len(ocr_text) >= MIN_TEXT_CHARS:
                logger.info(f"pQBL: OCR completato con successo ({len(ocr_text)} caratteri estratti).")
                return ocr_text[:MAX_TEXT_CHARS_PER_SEGMENT]
        except Exception as ocr_err:
            logger.error(f"pQBL: Fallback OCR fallito per le pagine {start_page + 1}-{end_page}: {ocr_err}")

    if len(full_text) < MIN_TEXT_CHARS:
        raise ValueError(
            f"Le pagine {start_page + 1}-{end_page} del PDF non contengono "
            "testo estraibile a sufficienza. Il PDF potrebbe essere una scansione."
        )
    return full_text[:MAX_TEXT_CHARS_PER_SEGMENT]


_IT_STOPWORDS = {"che", "della", "delle", "degli", "sono", "anche", "come", "nella", "alla", "gli", "una", "per", "con", "non"}
_EN_STOPWORDS = {"the", "and", "that", "with", "this", "from", "are", "which", "have", "their", "for", "was", "has", "been"}


def detect_language(text: str) -> str:
    """Euristica leggera it/en sulle stopword (default 'it')."""
    words = re.findall(r"[a-zàèéìòù]+", text.lower()[:8000])
    it_hits = sum(1 for w in words if w in _IT_STOPWORDS)
    en_hits = sum(1 for w in words if w in _EN_STOPWORDS)
    return "en" if en_hits > it_hits else "it"


# ---------------------------------------------------------------------------
# Suddivisione del testo in chunk per capitoli/sezioni
# ---------------------------------------------------------------------------
# Pattern per rilevare intestazioni di capitoli/sezioni a inizio riga.
_CHAPTER_RE = re.compile(
    r"^(?:"
    r"(?:#{1,4}\s+.+)"                           # markdown heading
    r"|(?:capitolo\s+\w+[\s:\.].*)"              # "Capitolo 1: ..."
    r"|(?:paragrafo\s+\w+[\s:\.].*)"             # "Paragrafo 1.1 ..."
    r"|(?:sezione\s+\w+[\s:\.].*)"               # "Sezione 1 ..."
    r"|(?:modulo\s+\w+[\s:\.].*)"                # "Modulo 1 ..."
    r"|(?:lezione\s+\w+[\s:\.].*)"               # "Lezione 1 ..."
    r"|(?:unit[àae]\s+\w+[\s:\.].*)"             # "Unità 1 ..."
    r"|(?:\d+\.\d+\s+.+)"                        # "1.1 Introduzione"
    r"|(?:\d+\.\s+[A-Z][^.]+)"                   # "1. Titolo sezione"
    r"|(?:[IVXLCDM]+\.\s+[A-Z][^.]+)"            # "I. Introduzione"
    r")\s*$",
    re.IGNORECASE | re.MULTILINE,
)
# Linea vuota o quasi (separatore tra paragrafi).
_BLANK_LINE_RE = re.compile(r"^\s*$", re.MULTILINE)


def split_text_into_chunks(text: str) -> list[str]:
    """Divide il testo in chunk che rispettano capitoli/sezioni.

    Strategia:
    1. Cerca intestazioni di capitolo/sezione (`CHAPTER_RE`).
    2. Se trovate, ogni intestazione marca l'inizio di un nuovo chunk.
    3. Se non trovate (testo privo di struttura), usa i paragrafi (doppio a capo)
       e li aggrega fino a MIN_CHUNK_CHARS.
    4. Ogni chunk è almeno MIN_CHUNK_CHARS caratteri (tranne l'ultimo).
    5. Unisce chunk troppo piccoli al successivo.
    """
    lines = text.split("\n")

    # Trova gli start di ogni sezione
    section_starts: list[int] = []
    for i, line in enumerate(lines):
        if _CHAPTER_RE.match(line.strip()):
            section_starts.append(i)

    if len(section_starts) > 1:
        # Raggruppa per sezione
        chunks: list[str] = []
        for idx, start in enumerate(section_starts):
            end = section_starts[idx + 1] if idx + 1 < len(section_starts) else len(lines)
            chunk = "\n".join(lines[start:end]).strip()
            if chunk:
                chunks.append(chunk)
    else:
        # Nessuna struttura di sezione: dividi per paragrafi
        raw_paras = re.split(r"\n\s*\n", text)
        paragraphs = [p.strip() for p in raw_paras if p.strip()]
        chunks = _merge_paragraphs(paragraphs)

    # Unisci chunk troppo piccoli al successivo
    merged: list[str] = []
    for chunk in chunks:
        if merged and len(merged[-1]) < MIN_CHUNK_CHARS:
            merged[-1] = merged[-1] + "\n\n" + chunk
        else:
            merged.append(chunk)
    # Se l'ultimo è troppo piccolo, uniscilo al penultimo
    if len(merged) > 1 and len(merged[-1]) < MIN_CHUNK_CHARS:
        merged[-2] = merged[-2] + "\n\n" + merged[-1]
        merged.pop()

    result = merged or [text]
    logger.info(
        f"pQBL: testo suddiviso in {len(result)} chunk "
        f"(da {len(chunks)} blocchi iniziali, {len(section_starts)} sezioni trovate)"
    )
    for i, c in enumerate(result):
        logger.debug(f"pQBL: chunk {i}: {len(c)} caratteri, inizia con {c[:80]!r}")
    return result


def _merge_paragraphs(paragraphs: list[str]) -> list[str]:
    """Aggrega paragrafi fino a MIN_CHUNK_CHARS caratteri ciascuno."""
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for p in paragraphs:
        if current_len >= MIN_CHUNK_CHARS:
            chunks.append("\n\n".join(current))
            current = []
            current_len = 0
        current.append(p)
        current_len += len(p)
    if current:
        chunks.append("\n\n".join(current))
    return chunks


# ---------------------------------------------------------------------------
# Parsing e validazione (puro Python, testabile senza rete)
# ---------------------------------------------------------------------------
def _extract_json_object(text: str) -> str | None:
    """Estrae il primo oggetto JSON { ... } completo, gestendo stringhe annidate.

    Rispetto a raw_decode, non si ferma su testo estraneo dopo l'oggetto.
    """
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_string = False
    escaped = False
    for i in range(start, len(text)):
        ch = text[i]
        if escaped:
            escaped = False
            continue
        if ch == "\\" and in_string:
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _fix_json(text: str) -> str:
    """Rende un JSON malformato (tipico degli LLM) valido per Python json.loads."""
    s = text.strip()
    s = re.sub(r"\bTrue\b", "true", s)
    s = re.sub(r"\bFalse\b", "false", s)
    s = re.sub(r"\bNone\b", "null", s)
    s = re.sub(r",\s*([\]}])", r"\1", s)
    # virgolette singole per chiavi e stringhe valore
    s = re.sub(r"([{,])\s*'([^']+)'\s*:", r'\1"\2":', s)
    s = re.sub(r":\s*'([^']*?)'(\s*[,}])", r':"\1"\2', s)
    return s


def repair_truncated_json(s: str) -> str:
    """Tenta di riparare un JSON troncato aggiungendo i delimitatori mancanti.

    Chiude le stringhe aperte, i dizionari e gli array pendenti.
    """
    s = s.strip()
    if not s:
        return ""

    # 1. Chiudi le stringhe aperte
    in_string = False
    escaped = False
    for char in s:
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue
        if char == '"':
            in_string = not in_string

    if in_string:
        # Troncamento a metà escape (es. '...\\'): il backslash pendente
        # invaliderebbe la stringa appena chiusa.
        if re.search(r"(?<!\\)(\\\\)*\\$", s):
            s = s[:-1]
        s += '"'

    # 2. Chiudi gli array e gli oggetti pendenti
    stack = []
    in_string = False
    escaped = False
    for i, char in enumerate(s):
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if char in ('{', '['):
            stack.append(char)
        elif char in ('}', ']'):
            if stack:
                top = stack[-1]
                if (char == '}' and top == '{') or (char == ']' and top == '['):
                    stack.pop()

    # Ricostruiamo a ritroso i delimitatori di chiusura per svuotare la pila
    while stack:
        s = s.rstrip().rstrip(',')
        top = stack.pop()
        if top == '{':
            s += '}'
        elif top == '[':
            s += ']'

    return s


def _parse_json_payload(raw: str):
    """Estrae il primo payload JSON (oggetto o array) da una risposta LLM.

    Tollerante a code-fence markdown e a JSON malformato. Solleva ValueError se
    nessun JSON valido è presente.
    """
    if not raw:
        raise ValueError("Risposta del modello vuota")
    text = raw.strip()

    # Rimuovi code-fence markdown
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()

    # Trova il primo oggetto o array JSON completo
    obj_str = _extract_json_object(text)
    if obj_str:
        candidate = obj_str
    else:
        start_candidates = [i for i in (text.find("{"), text.find("[")) if i >= 0]
        if not start_candidates:
            raise ValueError("Nessun JSON nella risposta del modello")
        candidate = text[min(start_candidates) :]

    # Tentativi di parse: strict → repaired → fixed → repaired_fixed
    repaired = repair_truncated_json(candidate)
    fixed_orig = _fix_json(candidate)
    fixed_repaired = _fix_json(repaired)
    for src in (candidate, repaired, fixed_orig, fixed_repaired):
        try:
            # strict=False tollera caratteri di controllo non escapati (newline
            # letterali dentro le stringhe), tipici dei modelli locali piccoli.
            return json.loads(src, strict=False)
        except json.JSONDecodeError:
            continue
    logger.error(f"pQBL: JSON non valido. Raw risposta (primi 600 char): {raw[:600]!r}")
    logger.error(f"pQBL: JSON candidate estratto: {candidate[:400]!r}")
    logger.error(f"pQBL: JSON dopo fix: {fixed_repaired[:400]!r}")
    raise ValueError(
        f"Risposta JSON non valida dal modello (prime 100 lettere: "
        f"{candidate[:100].strip()!r}...)"
    )


def _normalize(text: str) -> str:
    """Minuscole, senza accenti/punteggiatura, spazi compressi (per i confronti R2)."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^\w\s]", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def validate_mcq(mcq: dict) -> List[str]:
    """Valida una MCQ secondo R1/R2. Ritorna la lista dei problemi (vuota = ok).

    - 4 opzioni con chiavi A-D, testo e feedback non vuoti;
    - esattamente 1 opzione corretta;
    - il feedback dei distrattori non deve rivelare la risposta corretta
      (né citarne il testo né dichiarare quale lettera è giusta).
    """
    problems: List[str] = []
    if not (mcq.get("question") or "").strip():
        problems.append("domanda vuota")

    options = mcq.get("options") or []
    if len(options) != len(OPTION_KEYS):
        problems.append(f"servono {len(OPTION_KEYS)} opzioni, trovate {len(options)}")
        return problems

    keys = [str(o.get("key", "")).strip().upper() for o in options]
    if sorted(keys) != sorted(OPTION_KEYS):
        problems.append(f"chiavi opzione non valide: {keys}")

    correct = [o for o in options if bool(o.get("correct"))]
    if len(correct) != 1:
        problems.append(f"serve esattamente 1 opzione corretta, trovate {len(correct)}")

    for o in options:
        if not (o.get("text") or "").strip():
            problems.append(f"opzione {o.get('key')}: testo vuoto")
        if not (o.get("feedback") or "").strip():
            problems.append(f"opzione {o.get('key')}: feedback vuoto")

    if len(correct) == 1:
        correct_key = str(correct[0].get("key", "")).strip().upper()
        correct_text_norm = _normalize(correct[0].get("text") or "")
        for o in options:
            if bool(o.get("correct")):
                continue
            fb_norm = _normalize(o.get("feedback") or "")
            if len(correct_text_norm) >= 15 and correct_text_norm in fb_norm:
                problems.append(
                    f"opzione {o.get('key')}: il feedback rivela il testo della risposta corretta"
                )
            fb_raw = o.get("feedback") or ""
            if re.search(
                rf"(risposta|opzione|alternativa|answer|option)\s+(corretta\s+)?(è|e'|is)?\s*[\"']?{correct_key}\b",
                fb_raw,
                re.IGNORECASE,
            ):
                problems.append(
                    f"opzione {o.get('key')}: il feedback dichiara la lettera corretta"
                )
    return problems


def validate_question_bank(questions: List[dict]) -> List[str]:
    """Valida l'intero bank; ritorna i problemi prefissati dall'indice domanda."""
    problems: List[str] = []
    for idx, q in enumerate(questions, start=1):
        for p in validate_mcq(q):
            problems.append(f"domanda {idx}: {p}")
    return problems


# ---------------------------------------------------------------------------
# Chunk-by-chunk generation (streaming)
# ---------------------------------------------------------------------------
_CHUNK_PROMPT_TEMPLATE = (
    "You are given an excerpt from a didactic text. "
    "Identify one specific skill (ability/knowledge) that this excerpt teaches. "
    "Then generate exactly {n} multiple-choice questions that test that skill.\n\n"
    "The output MUST be a JSON object with the following structure:\n"
    "{{\n"
    '  "skill": "Knowing how to ... (short phrase describing the skill, in the same language as the source)",\n'
    '  "questions": [\n'
    "    {{\n"
    '      "question": "...",\n'
    '      "options": [\n'
    '        {{"key": "A", "text": "...", "correct": true, "feedback": "..."}},\n'
    '        {{"key": "B", "text": "...", "correct": false, "feedback": "..."}},\n'
    '        {{"key": "C", "text": "...", "correct": false, "feedback": "..."}},\n'
    '        {{"key": "D", "text": "...", "correct": false, "feedback": "..."}}\n'
    "      ]\n"
    "    }}\n"
    "  ]\n"
    "}}\n\n"
    "Rules for each question (R1, R2):\n"
    "- Exactly one option has correct=true, the other three are plausible distractors.\n"
    "- Each option has a unique constructive feedback.\n"
    "- Distractor feedback EXPLAINS THE ERROR without revealing the correct key or quoting the correct answer verbatim.\n"
    "- Use the same language as the source text.\n\n"
    "EXCERPT:\n{{text}}"
)


def generate_batch_for_chunk(
    ai,
    chunk_text: str,
    chunk_index: int,
    language: str,
    question_prompt: str,
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> List[dict]:
    """Genera 4 MCQ per un singolo chunk di testo.

    Una chiamata LLM: estrae skill + produce 4 MCQ in un'unica risposta.
    Ha un retry automatico se le MCQ o il JSON sono invalidi.
    Solleva ValueError se fallisce anche dopo il retry.
    """
    n = QUESTIONS_PER_CHUNK
    last_problems: List[str] = []

    for _attempt in range(3):
        user_message = (
            f"Number of questions to produce: {n}\n"
            f"Language: {language}\n\n"
            f"EXCERPT:\n{chunk_text}"
        )
        logger.info(f"pQBL: chiamata LLM per chunk {chunk_index} (tentativo {_attempt + 1}/3)")
        try:
            raw = ai.get_response(user_message, question_prompt, mode="pqbl-chunk", max_tokens=6000, provider=provider, model=model)
            logger.info(f"pQBL: risposta LLM ricevuta per chunk {chunk_index} ({len(raw)} caratteri)")
            payload = _parse_json_payload(raw)
        except ValueError as parse_err:
            last_problems = [f"JSON non valido: {parse_err}"]
            if _attempt < 2:
                logger.warning(f"pQBL: errore parsing JSON per chunk {chunk_index} al tentativo {_attempt + 1}: {parse_err}. Riprovo...")
                continue
            break

        skill = ""
        questions_raw = payload
        if isinstance(payload, dict):
            skill = str(payload.get("skill") or "").strip()
            questions_raw = payload.get("questions") or []
        
        if not isinstance(questions_raw, list):
            last_problems = [f"Il modello non ha restituito una lista di domande"]
            if _attempt < 2:
                logger.warning(f"pQBL: output non valido per chunk {chunk_index} al tentativo {_attempt + 1}: {last_problems[0]}. Riprovo...")
                continue
            break

        questions = []
        for q in questions_raw:
            if isinstance(q, dict):
                errors = validate_mcq(q)
                if not errors:
                    q["skill"] = skill or f"Section {chunk_index + 1}"
                    q["chunk_index"] = chunk_index
                    questions.append(q)
                else:
                    logger.warning(f"pQBL: scartata domanda incompleta o invalida per chunk {chunk_index}: {errors}")

        if questions:
            return questions

        last_problems = ["Nessuna domanda valida generata nel chunk"]
        if _attempt < 2:
            logger.warning(f"pQBL: MCQ invalide o assenti per chunk {chunk_index} (tentativo {_attempt + 1}), retry.")

    raise ValueError(
        f"Generazione domande fallita per il chunk {chunk_index}: "
        f"{'; '.join(last_problems) or 'nessuna domanda'}"
    )


def question_count_for_chunks(n_chunks: int) -> int:
    """Numero totale di domande attese per un dato numero di chunk."""
    return n_chunks * QUESTIONS_PER_CHUNK
