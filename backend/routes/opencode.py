"""Esperienza OpenCode: workspace isolato + bridge WebSocket verso host-agent.

Riusa l'infrastruttura ai4educ-console gia' attiva sull'host:
- host-agent espone un PTY socket Unix (AGENT_PTY_SOCKET) che, in modalita'
  "opencode", lancia un container effimero `ai4educ-workspace` con montato
  SOLO il workspace indicato (nessun filesystem host, bash/webfetch negati);
- la root dei workspace e' condivisa con ai4educ-console
  (OPENCODE_WORKSPACE_HOST_ROOT): host-agent valida che la dir stia li' sotto
  e il garbage collector di ai4educ ripulisce anche i nostri workspace.

Endpoint:
- POST /opencode/workspace      → prepara la cartella (documento.md, appunti.md,
                                  AGENTS.md, opencode.json, .opencode-prompt)
- GET  /opencode/pdf/{token}    → serve il PDF QSA caricato (iframe frontend)
- WS   /term?key=...            → bridge WebSocket ↔ PTY socket di host-agent
                                  (NDJSON base64, stesso protocollo di ai4educ)
"""
import asyncio
import base64
import hashlib
import json
import logging
import os
import re
import socket
from typing import AsyncIterator

import httpx
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..ai_service import AIService
from ..api_models import ChatRequest, OpencodeChatRequest, OpencodeWorkspaceRequest
from ..chat_logic import (
    _apply_language_directive,
    _apply_qsa_factor_directive,
    _ensure_questionnaire_guided_steps,
    _resolve_system_prompt,
    _retrieved_context,
)
from ..memory_service import session_memory
from ..strategy_memory import shared_response_memory

logger = logging.getLogger(__name__)

router = APIRouter()


def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Path del workspace DENTRO il container backend (volume montato in compose).
OPENCODE_WS_ROOT = os.environ.get("OPENCODE_WORKSPACE_ROOT", "/opencode-workspaces")
# Stesso path visto dall'HOST: host-agent monta questo nel container effimero.
OPENCODE_WS_HOST_ROOT = os.environ.get(
    "OPENCODE_WORKSPACE_HOST_ROOT", "/home/nugh75/.cache/ai4educ-opencode"
)
AGENT_PTY_SOCKET = os.environ.get("AGENT_PTY_SOCKET", "/run/cloudflared-agent/pty.sock")
AGENT_SOCKET = os.environ.get("AGENT_SOCKET", "/run/cloudflared-agent/agent.sock")
OPENCODE_CHAT_MODEL = os.environ.get("OPENCODE_CHAT_MODEL", "gemma4:12b")
OPENCODE_RUNTIME_DIR = os.environ.get(
    "OPENCODE_RUNTIME_DIR",
    os.path.join(os.environ.get("SESSION_MEMORY_DIR", "/tmp"), "opencode-runtime"),
)
# Dove /qsa/upload persiste i PDF caricati (relativo alla cwd: /app nel container).
QSA_PDF_STORAGE_DIR = os.environ.get("QSA_PDF_STORAGE_DIR", "uploads/qsa")

# Chiavi workspace counselorbot: prefisso cb- per distinguerle da quelle di
# ai4educ nella root condivisa (il WS bridge accetta solo queste).
_KEY_RE = re.compile(r"^cb-[a-f0-9]{8,40}$")
_WORKSPACE_ID_RE = re.compile(r"^[a-zA-Z0-9-]{8,64}$")
_PDF_TOKEN_RE = re.compile(r"^[a-f0-9]{32}$")
_OPENCODE_SESSION_RE = re.compile(r"^ses_[a-zA-Z0-9]+$")
_api_instances: dict[str, dict[str, str]] = {}

# Direttiva lingua per AGENTS.md e seed prompt (default italiano).
_LANG_DIRECTIVES = {
    "it": "Rispondi sempre in italiano.",
    "en": "Always answer in English.",
    "es": "Responde siempre en español.",
    "fr": "Réponds toujours en français.",
    "de": "Antworte immer auf Deutsch.",
    "sv": "Svara alltid på svenska.",
}

_SOURCE_DIRECTIVES = {
    "it": "Prima di rispondere leggi anche guida-questionario.md e memoria.md.",
    "en": "Before answering, also read guida-questionario.md and memoria.md.",
    "es": "Antes de responder, lee también guida-questionario.md y memoria.md.",
    "fr": "Avant de répondre, lis aussi guida-questionario.md et memoria.md.",
    "de": "Lies vor der Antwort auch guida-questionario.md und memoria.md.",
    "sv": "Läs även guida-questionario.md och memoria.md innan du svarar.",
}

_LANG_COPY = {
    "it": {
        "profile": "Profilo",
        "scores": "Punteggi del profilo",
        "document": "Testo del documento caricato",
        "unreadable": "Testo non estraibile dal PDF.",
        "factor": "Fattore",
        "name": "Nome",
        "score": "Punteggio",
        "reading": "Lettura",
        "inverted": "INVERTITO: punteggio alto = area di crescita",
        "resource": "punteggio alto = risorsa",
        "notes_title": "Appunti",
        "instructions": "Istruzioni",
        "files_intro": "In questa cartella ci sono questi file, e SOLO questi vanno usati:",
        "document_file": (
            "- `documento.md`: il profilo dello studente, con i punteggi del "
            "questionario e l'eventuale testo caricato. È in sola lettura: non modificarlo."
        ),
        "notes_file": (
            "- `appunti.md`: file di appunti modificabile. Scrivi qui sintesi e "
            "riflessioni quando lo studente lo chiede."
        ),
        "rules": "Regole:",
        "counselor_rule": (
            "- Sei un counselor educativo: aiuta lo studente a interpretare il "
            "suo profilo con un tono incoraggiante e senza giudizi."
        ),
        "scores_rule": "- Non inventare punteggi: usa solo quelli presenti in `documento.md`.",
        "inverted_rule": (
            "- Per i fattori marcati INVERTITO, un punteggio alto indica un'area "
            "di crescita e non un punto di forza."
        ),
        "workspace_rule": "- Lavora esclusivamente sui file di questa cartella.",
        "prompt": (
            "Sei un counselor educativo. Nella cartella trovi documento.md con il "
            "profilo dello studente e appunti.md dove puoi scrivere. Leggi prima "
            "documento.md e AGENTS.md. {directive} Presentati in una riga, riassumi "
            "il profilo in cinque righe, poi attendi le domande dello studente."
        ),
    },
    "en": {
        "profile": "Profile",
        "scores": "Profile scores",
        "document": "Uploaded document text",
        "unreadable": "The PDF text could not be extracted.",
        "factor": "Factor",
        "name": "Name",
        "score": "Score",
        "reading": "Interpretation",
        "inverted": "INVERTED: high score = growth area",
        "resource": "high score = strength",
        "notes_title": "Notes",
        "instructions": "Instructions",
        "files_intro": "This folder contains the following files, and ONLY these files may be used:",
        "document_file": (
            "- `documento.md`: the student profile, including questionnaire scores "
            "and any uploaded text. It is read-only: do not modify it."
        ),
        "notes_file": (
            "- `appunti.md`: an editable notes file. Write summaries and reflections "
            "here when the student asks you to."
        ),
        "rules": "Rules:",
        "counselor_rule": (
            "- You are an educational counselor. Help the student interpret the "
            "profile in an encouraging, non-judgmental tone."
        ),
        "scores_rule": "- Do not invent scores. Use only the scores in `documento.md`.",
        "inverted_rule": (
            "- For factors marked INVERTED, a high score indicates a growth area, "
            "not a strength."
        ),
        "workspace_rule": "- Work exclusively with the files in this folder.",
        "prompt": (
            "You are an educational counselor. This folder contains documento.md "
            "with the student profile and appunti.md for notes. Read documento.md "
            "and AGENTS.md first. {directive} Introduce yourself in one line, "
            "summarize the profile in five lines, then wait for the student's questions."
        ),
    },
    "es": {
        "profile": "Perfil",
        "scores": "Puntuaciones del perfil",
        "document": "Texto del documento cargado",
        "unreadable": "No se pudo extraer el texto del PDF.",
        "factor": "Factor",
        "name": "Nombre",
        "score": "Puntuación",
        "reading": "Interpretación",
        "inverted": "INVERTIDO: puntuación alta = área de mejora",
        "resource": "puntuación alta = fortaleza",
        "notes_title": "Notas",
        "instructions": "Instrucciones",
        "files_intro": "Esta carpeta contiene estos archivos, y SOLO se pueden usar estos:",
        "document_file": (
            "- `documento.md`: el perfil del estudiante, con las puntuaciones y el "
            "texto cargado. Es de solo lectura: no lo modifiques."
        ),
        "notes_file": (
            "- `appunti.md`: archivo de notas modificable. Escribe aquí resúmenes "
            "y reflexiones cuando el estudiante lo solicite."
        ),
        "rules": "Reglas:",
        "counselor_rule": (
            "- Eres un orientador educativo. Ayuda al estudiante a interpretar su "
            "perfil con un tono alentador y sin juicios."
        ),
        "scores_rule": "- No inventes puntuaciones. Usa solo las de `documento.md`.",
        "inverted_rule": (
            "- En los factores marcados INVERTIDO, una puntuación alta indica un "
            "área de mejora, no una fortaleza."
        ),
        "workspace_rule": "- Trabaja exclusivamente con los archivos de esta carpeta.",
        "prompt": (
            "Eres un orientador educativo. En esta carpeta están documento.md con "
            "el perfil del estudiante y appunti.md para las notas. Lee primero "
            "documento.md y AGENTS.md. {directive} Preséntate en una línea, resume "
            "el perfil en cinco líneas y espera las preguntas del estudiante."
        ),
    },
    "fr": {
        "profile": "Profil",
        "scores": "Scores du profil",
        "document": "Texte du document téléversé",
        "unreadable": "Le texte du PDF n'a pas pu être extrait.",
        "factor": "Facteur",
        "name": "Nom",
        "score": "Score",
        "reading": "Interprétation",
        "inverted": "INVERSÉ : score élevé = axe de progression",
        "resource": "score élevé = point fort",
        "notes_title": "Notes",
        "instructions": "Instructions",
        "files_intro": "Ce dossier contient les fichiers suivants, et SEULS ceux-ci peuvent être utilisés :",
        "document_file": (
            "- `documento.md` : le profil de l'étudiant, avec les scores et le texte "
            "téléversé. Il est en lecture seule : ne le modifie pas."
        ),
        "notes_file": (
            "- `appunti.md` : fichier de notes modifiable. Écris-y les synthèses et "
            "réflexions demandées par l'étudiant."
        ),
        "rules": "Règles :",
        "counselor_rule": (
            "- Tu es conseiller pédagogique. Aide l'étudiant à interpréter son "
            "profil avec un ton encourageant et sans jugement."
        ),
        "scores_rule": "- N'invente aucun score. Utilise seulement ceux de `documento.md`.",
        "inverted_rule": (
            "- Pour les facteurs marqués INVERSÉ, un score élevé indique un axe "
            "de progression et non un point fort."
        ),
        "workspace_rule": "- Travaille exclusivement avec les fichiers de ce dossier.",
        "prompt": (
            "Tu es conseiller pédagogique. Ce dossier contient documento.md avec "
            "le profil de l'étudiant et appunti.md pour les notes. Lis d'abord "
            "documento.md et AGENTS.md. {directive} Présente-toi en une ligne, "
            "résume le profil en cinq lignes, puis attends les questions de l'étudiant."
        ),
    },
    "de": {
        "profile": "Profil",
        "scores": "Profilwerte",
        "document": "Text des hochgeladenen Dokuments",
        "unreadable": "Der PDF-Text konnte nicht extrahiert werden.",
        "factor": "Faktor",
        "name": "Name",
        "score": "Wert",
        "reading": "Interpretation",
        "inverted": "INVERTIERT: hoher Wert = Entwicklungsbereich",
        "resource": "hoher Wert = Stärke",
        "notes_title": "Notizen",
        "instructions": "Anweisungen",
        "files_intro": "Dieser Ordner enthält folgende Dateien, und NUR diese dürfen verwendet werden:",
        "document_file": (
            "- `documento.md`: das Profil mit Fragebogenwerten und hochgeladenem "
            "Text. Die Datei ist schreibgeschützt und darf nicht geändert werden."
        ),
        "notes_file": (
            "- `appunti.md`: eine bearbeitbare Notizdatei. Schreibe hier auf Wunsch "
            "des Studierenden Zusammenfassungen und Reflexionen."
        ),
        "rules": "Regeln:",
        "counselor_rule": (
            "- Du bist Bildungsberater. Hilf dem Studierenden, das Profil "
            "ermutigend und wertfrei zu interpretieren."
        ),
        "scores_rule": "- Erfinde keine Werte. Verwende nur die Werte aus `documento.md`.",
        "inverted_rule": (
            "- Bei INVERTIERT markierten Faktoren bedeutet ein hoher Wert einen "
            "Entwicklungsbereich und keine Stärke."
        ),
        "workspace_rule": "- Arbeite ausschließlich mit den Dateien in diesem Ordner.",
        "prompt": (
            "Du bist Bildungsberater. Dieser Ordner enthält documento.md mit dem "
            "Profil und appunti.md für Notizen. Lies zuerst documento.md und "
            "AGENTS.md. {directive} Stelle dich in einer Zeile vor, fasse das "
            "Profil in fünf Zeilen zusammen und warte dann auf Fragen."
        ),
    },
    "sv": {
        "profile": "Profil",
        "scores": "Profilpoäng",
        "document": "Text från uppladdat dokument",
        "unreadable": "Texten kunde inte extraheras från PDF-filen.",
        "factor": "Faktor",
        "name": "Namn",
        "score": "Poäng",
        "reading": "Tolkning",
        "inverted": "OMVÄND: hög poäng = utvecklingsområde",
        "resource": "hög poäng = styrka",
        "notes_title": "Anteckningar",
        "instructions": "Instruktioner",
        "files_intro": "Den här mappen innehåller följande filer, och ENDAST dessa får användas:",
        "document_file": (
            "- `documento.md`: studentens profil med frågeformulärspoäng och "
            "uppladdad text. Filen är skrivskyddad och får inte ändras."
        ),
        "notes_file": (
            "- `appunti.md`: en redigerbar anteckningsfil. Skriv sammanfattningar "
            "och reflektioner här när studenten ber om det."
        ),
        "rules": "Regler:",
        "counselor_rule": (
            "- Du är utbildningsvägledare. Hjälp studenten att tolka profilen "
            "med en uppmuntrande och icke-dömande ton."
        ),
        "scores_rule": "- Hitta inte på poäng. Använd endast poängen i `documento.md`.",
        "inverted_rule": (
            "- För faktorer markerade OMVÄND betyder en hög poäng ett "
            "utvecklingsområde, inte en styrka."
        ),
        "workspace_rule": "- Arbeta endast med filerna i den här mappen.",
        "prompt": (
            "Du är utbildningsvägledare. Mappen innehåller documento.md med "
            "studentens profil och appunti.md för anteckningar. Läs först "
            "documento.md och AGENTS.md. {directive} Presentera dig på en rad, "
            "sammanfatta profilen på fem rader och invänta sedan studentens frågor."
        ),
    },
}


def workspace_key(workspace_id: str) -> str:
    return "cb-" + hashlib.sha1(workspace_id.encode("utf-8")).hexdigest()[:24]


def pdf_storage_path(token: str) -> str:
    return os.path.join(QSA_PDF_STORAGE_DIR, f"{token}.pdf")


def _extract_pdf_text(path: str, max_chars: int = 120_000) -> str:
    from pypdf import PdfReader

    reader = PdfReader(path)
    parts: list[str] = []
    total = 0
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception:  # pagina corrotta: salta
            continue
        parts.append(text)
        total += len(text)
        if total >= max_chars:
            break
    return "\n\n".join(parts)[:max_chars].strip()


def _scores_markdown(
    db: Session, questionnaire_type: str, scores: dict[str, float], locale: str
) -> str:
    """Punteggi come tabella leggibile, arricchita dal catalogo Factor.

    Per i fattori con interpretazione invertita (es. QSA C3/A1...) il punteggio
    alto indica un'area di crescita, non una risorsa: annotato esplicitamente
    perche' OpenCode non ha il contesto di chat_logic.
    """
    if not scores:
        return ""
    factors = {
        f.code: f
        for f in db.query(models.Factor)
        .filter(models.Factor.instrument_code == questionnaire_type)
        .all()
    }
    copy = _LANG_COPY[locale]
    label_attr = f"label_{locale}" if locale in ("it", "en", "es", "sv") else "label_en"
    lines = [
        f"| {copy['factor']} | {copy['name']} | {copy['score']} | {copy['reading']} |",
        "|---|---|---|---|",
    ]
    for code in sorted(scores):
        factor = factors.get(code)
        label = (
            getattr(factor, label_attr, None)
            or getattr(factor, "label_en", None)
            or getattr(factor, "label_it", None)
            or ""
        ) if factor else ""
        inverted = bool(factor and factor.is_interpretation_inverted)
        reading = copy["inverted"] if inverted else copy["resource"]
        lines.append(f"| {code} | {label} | {scores[code]} | {reading} |")
    return "\n".join(lines)


def _guided_prompt_markdown(
    db: Session,
    ai_service: AIService,
    questionnaire_type: str,
    locale: str,
) -> str:
    """Esporta la guida effettiva usata dalla chat guidata per lo strumento."""
    _ensure_questionnaire_guided_steps(db, questionnaire_type)
    steps = (
        db.query(models.GuidedStep)
        .filter(models.GuidedStep.questionnaire_type == questionnaire_type)
        .order_by(models.GuidedStep.sort_order)
        .all()
    )
    sections = [
        f"# Guided prompts: {questionnaire_type}",
        "",
        "Use these prompts as the authoritative questionnaire-specific counseling guide.",
        "Choose the relevant step for the student's question; do not mechanically run every step.",
        "",
    ]
    for step in steps:
        prompt_key, system_prompt = _resolve_system_prompt(
            ai_service, step.system_prompt_mode, step.id, db
        )
        system_prompt = _apply_language_directive(system_prompt, locale)
        system_prompt = _apply_qsa_factor_directive(
            system_prompt, questionnaire_type, locale
        )
        sections.extend([
            f"## {step.sort_order}. {step.label}",
            "",
            f"- Step ID: `{step.id}`",
            f"- Mode: `{step.system_prompt_mode}`",
            f"- System prompt key: `{prompt_key}`",
            "",
            "### System prompt",
            "",
            system_prompt.strip(),
            "",
            "### Step prompt",
            "",
            step.prompt.strip(),
            "",
        ])
    return "\n".join(sections).strip() + "\n"


def _agent_command_sync(action: str, args: list[str]) -> dict:
    payload = (json.dumps({"action": action, "args": args}) + "\n").encode("utf-8")
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(90)
        client.connect(AGENT_SOCKET)
        client.sendall(payload)
        data = b""
        while b"\n" not in data:
            chunk = client.recv(65536)
            if not chunk:
                break
            data += chunk
    if not data:
        raise RuntimeError("host-agent non ha risposto")
    response = json.loads(data.split(b"\n", 1)[0])
    if not response.get("ok"):
        raise RuntimeError(str(response.get("error") or "host-agent error"))
    stdout = response.get("stdout") or "{}"
    return json.loads(stdout)


async def _start_opencode_api(key: str) -> dict[str, str]:
    host_dir = f"{OPENCODE_WS_HOST_ROOT}/{key}"
    instance = await asyncio.to_thread(
        _agent_command_sync, "opencode-server-start", [host_dir]
    )
    config = {
        "url": str(instance["url"]).rstrip("/"),
        "username": str(instance.get("username") or "opencode"),
        "password": str(instance["password"]),
    }
    _store_api_instance(key, config)
    return config


def _api_instance_path(key: str) -> str:
    return os.path.join(OPENCODE_RUNTIME_DIR, f"{key}.json")


def _store_api_instance(key: str, config: dict[str, str]) -> None:
    os.makedirs(OPENCODE_RUNTIME_DIR, mode=0o700, exist_ok=True)
    path = _api_instance_path(key)
    tmp_path = f"{path}.{os.getpid()}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(config, fh)
    os.chmod(tmp_path, 0o600)
    os.replace(tmp_path, path)
    _api_instances[key] = config


def _get_api_instance(key: str) -> dict[str, str] | None:
    cached = _api_instances.get(key)
    if cached:
        return cached
    try:
        with open(_api_instance_path(key), encoding="utf-8") as fh:
            config = json.load(fh)
        if not all(config.get(field) for field in ("url", "username", "password")):
            return None
    except (OSError, ValueError, TypeError):
        return None
    normalized = {
        "url": str(config["url"]).rstrip("/"),
        "username": str(config["username"]),
        "password": str(config["password"]),
    }
    _api_instances[key] = normalized
    return normalized


def _remove_api_instance(key: str) -> None:
    _api_instances.pop(key, None)
    try:
        os.unlink(_api_instance_path(key))
    except OSError:
        pass


def _api_auth(config: dict[str, str]) -> httpx.BasicAuth:
    return httpx.BasicAuth(config["username"], config["password"])


async def _api_json(
    config: dict[str, str],
    method: str,
    path: str,
    *,
    json_body: dict | None = None,
) -> object:
    async with httpx.AsyncClient(
        auth=_api_auth(config),
        timeout=httpx.Timeout(90, connect=10),
    ) as client:
        response = await client.request(
            method, f"{config['url']}{path}", json=json_body
        )
        response.raise_for_status()
        if not response.content:
            return {}
        return response.json()


def _message_text(parts: list[dict]) -> str:
    return "".join(
        str(part.get("text") or "")
        for part in parts
        if part.get("type") == "text"
    ).strip()


async def _ensure_opencode_session(
    key: str, config: dict[str, str]
) -> tuple[str, list[dict[str, str]], bool]:
    ws_dir = os.path.join(OPENCODE_WS_ROOT, key)
    session_path = os.path.join(ws_dir, ".opencode-session")
    session_id = ""
    try:
        with open(session_path, encoding="utf-8") as fh:
            candidate = fh.read(100).strip()
        if _OPENCODE_SESSION_RE.match(candidate):
            await _api_json(config, "GET", f"/session/{candidate}")
            session_id = candidate
    except (OSError, httpx.HTTPError):
        session_id = ""

    if not session_id:
        created = await _api_json(
            config,
            "POST",
            "/session?directory=%2Fwork",
            json_body={"title": "CounselorBot OpenCode"},
        )
        if not isinstance(created, dict) or not _OPENCODE_SESSION_RE.match(
            str(created.get("id") or "")
        ):
            raise RuntimeError("OpenCode non ha creato una sessione valida")
        session_id = str(created["id"])
        with open(session_path, "w", encoding="utf-8") as fh:
            fh.write(session_id)
        _chmod(session_path, 0o444)

    raw_messages = await _api_json(
        config, "GET", f"/session/{session_id}/message?directory=%2Fwork"
    )
    seed_prompt = ""
    try:
        with open(os.path.join(ws_dir, ".opencode-prompt"), encoding="utf-8") as fh:
            seed_prompt = fh.read().strip()
    except OSError:
        pass

    history: list[dict[str, str]] = []
    has_assistant = False
    if isinstance(raw_messages, list):
        for item in raw_messages:
            if not isinstance(item, dict):
                continue
            info = item.get("info") or {}
            role = str(info.get("role") or "")
            text = _message_text(item.get("parts") or [])
            if not text or role not in ("user", "assistant"):
                continue
            if role == "user" and seed_prompt and text == seed_prompt:
                continue
            history.append({"role": role, "content": text})
            if role == "assistant":
                has_assistant = True
    return session_id, history, not has_assistant


@router.post("/opencode/workspace")
async def create_opencode_workspace(
    request: OpencodeWorkspaceRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_current_user),
):
    if not _WORKSPACE_ID_RE.match(request.workspace_id):
        raise HTTPException(status_code=400, detail="workspace_id non valido")
    if request.pdf_token and not _PDF_TOKEN_RE.match(request.pdf_token):
        raise HTTPException(status_code=400, detail="pdf_token non valido")

    locale = request.locale if request.locale in _LANG_DIRECTIVES else "it"
    lang_directive = _LANG_DIRECTIVES[locale]
    copy = _LANG_COPY[locale]
    key = workspace_key(request.workspace_id)
    ws_dir = os.path.join(OPENCODE_WS_ROOT, key)
    os.makedirs(ws_dir, exist_ok=True)

    instrument = (
        db.query(models.Instrument)
        .filter(models.Instrument.code == request.questionnaire_type)
        .first()
    )
    ai_service = AIService(db)
    instrument_name_attr = f"name_{locale}" if locale in ("it", "en", "es", "sv") else "name_en"
    q_name = (
        getattr(instrument, instrument_name_attr, None)
        or getattr(instrument, "name_en", None)
        or getattr(instrument, "name_it", None)
        or request.questionnaire_type
    )

    # documento.md: testo del PDF caricato (se presente) + punteggi del profilo.
    sections = [f"# {copy['profile']} {q_name}", ""]
    scores_md = _scores_markdown(db, request.questionnaire_type, request.scores, locale)
    session_memory.update_context(
        request.workspace_id,
        questionnaire_type=request.questionnaire_type,
        scores_context=scores_md,
        language=locale,
    )
    memory_request = ChatRequest(
        message=f"{request.questionnaire_type} OpenCode counseling",
        mode="generic",
        session_id=request.workspace_id,
        scores_context=scores_md,
        questionnaire_type=request.questionnaire_type,
        language=locale,
    )
    memory_context, strategy_ids = _retrieved_context(
        db,
        request.workspace_id,
        memory_request,
        request.questionnaire_type,
        f"{request.questionnaire_type} profile counseling",
        ai_service=ai_service,
        username=identity.get("username", ""),
    )
    guided_prompts = _guided_prompt_markdown(
        db, ai_service, request.questionnaire_type, locale
    )
    if scores_md:
        sections += [f"## {copy['scores']}", "", scores_md, ""]
    if request.pdf_token:
        pdf_path = pdf_storage_path(request.pdf_token)
        if os.path.isfile(pdf_path):
            try:
                pdf_text = await asyncio.to_thread(_extract_pdf_text, pdf_path)
            except Exception as exc:
                logger.warning("OpenCode PDF extraction failed for %s: %s", request.pdf_token, exc)
                pdf_text = f"_{copy['unreadable']}_"
            sections += [f"## {copy['document']}", "", pdf_text, ""]
    documento = "\n".join(sections)

    def _write_workspace() -> None:
        documento_path = os.path.join(ws_dir, "documento.md")
        appunti_path = os.path.join(ws_dir, "appunti.md")
        guide_path = os.path.join(ws_dir, "guida-questionario.md")
        memory_path = os.path.join(ws_dir, "memoria.md")
        # documento.md viene rigenerato a ogni apertura; appunti.md mai
        # sovrascritto (e' il file di lavoro dell'agente/studente).
        _chmod(documento_path, 0o666)
        with open(documento_path, "w", encoding="utf-8") as fh:
            fh.write(documento)
        _chmod(guide_path, 0o666)
        with open(guide_path, "w", encoding="utf-8") as fh:
            fh.write(guided_prompts)
        _chmod(memory_path, 0o666)
        with open(memory_path, "w", encoding="utf-8") as fh:
            fh.write(memory_context or "# Shared memory\n\nNo previous memory is available.\n")
        if not os.path.isfile(appunti_path):
            with open(appunti_path, "w", encoding="utf-8") as fh:
                fh.write(f"# {copy['notes_title']}\n\n")

        meta_path = os.path.join(ws_dir, ".opencode-meta")
        with open(meta_path, "w", encoding="utf-8") as fh:
            json.dump({"locale": locale, "questionnaire_type": request.questionnaire_type}, fh)

        agents = "\n".join([
            f"# {copy['instructions']}",
            "",
            copy["files_intro"],
            copy["document_file"],
            (
                "- `guida-questionario.md`: the authoritative prompts and guided steps "
                "for this questionnaire. Use the relevant parts to guide every answer."
            ),
            (
                "- `memoria.md`: shared read-only memory from the guided experience, "
                "including relevant user context, goals and approved strategies."
            ),
            copy["notes_file"],
            "",
            copy["rules"],
            f"- {lang_directive}",
            copy["counselor_rule"],
            copy["scores_rule"],
            copy["inverted_rule"],
            copy["workspace_rule"],
            (
                "- Keep `appunti.md` updated with concise facts, goals, preferences and "
                "decisions that should remain available in the guided experience."
            ),
            "",
        ])
        with open(os.path.join(ws_dir, "AGENTS.md"), "w", encoding="utf-8") as fh:
            fh.write(agents)

        # Niente shell ne' rete per l'agente nel container.
        with open(os.path.join(ws_dir, "opencode.json"), "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "$schema": "https://opencode.ai/config.json",
                    "permission": {"bash": "deny", "webfetch": "deny"},
                },
                fh,
                indent=2,
            )
            fh.write("\n")

        # Seed prompt letto dal launcher del container (opencode --prompt).
        # Solo caratteri shell-safe, come in ai4educ (niente apici/!/<>/$).
        prompt = " ".join([
            copy["prompt"].format(directive=lang_directive),
            _SOURCE_DIRECTIVES[locale],
        ])
        prompt = re.sub(r"['\"\\$`!<>]", " ", prompt)
        with open(os.path.join(ws_dir, ".opencode-prompt"), "w", encoding="utf-8") as fh:
            fh.write(prompt)

        with open(os.path.join(ws_dir, ".workspace.json"), "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "source": "counselorbot",
                    "questionnaire_type": request.questionnaire_type,
                    "workspace_id": request.workspace_id,
                    "locale": locale,
                    "username": identity.get("username") or "",
                    "strategy_ids": strategy_ids,
                },
                fh,
            )

        # Il container effimero gira come root ma OpenCode come utente: dir
        # scrivibile, solo appunti.md modificabile, fonti/config in sola lettura
        # (mitiga prompt-injection, stesso schema di ai4educ).
        _chmod(ws_dir, 0o777)
        _chmod(appunti_path, 0o666)
        for name in ("documento.md", "guida-questionario.md", "memoria.md",
                     "AGENTS.md", "opencode.json", ".opencode-prompt",
                     ".workspace.json"):
            _chmod(os.path.join(ws_dir, name), 0o444)

    await asyncio.to_thread(_write_workspace)
    try:
        api_config = await _start_opencode_api(key)
        opencode_session_id, history, needs_seed = await _ensure_opencode_session(
            key, api_config
        )
        return {
            "ok": True,
            "key": key,
            "api_available": True,
            "session_id": opencode_session_id,
            "history": history,
            "needs_seed": needs_seed,
        }
    except Exception as exc:
        logger.warning("OpenCode headless unavailable for %s: %s", key, exc)
        _remove_api_instance(key)
        return {
            "ok": True,
            "key": key,
            "api_available": False,
            "api_error": str(exc),
        }


def _workspace_session_id(key: str) -> str:
    path = os.path.join(OPENCODE_WS_ROOT, key, ".opencode-session")
    try:
        with open(path, encoding="utf-8") as fh:
            session_id = fh.read(100).strip()
    except OSError as exc:
        raise HTTPException(status_code=404, detail="Sessione OpenCode non trovata") from exc
    if not _OPENCODE_SESSION_RE.match(session_id):
        raise HTTPException(status_code=500, detail="Sessione OpenCode non valida")
    return session_id


@router.post("/opencode/workspace/{key}/chat")
async def chat_opencode(
    key: str,
    request: OpencodeChatRequest,
    identity: dict = Depends(auth.get_current_user),
):
    if not _KEY_RE.match(key):
        raise HTTPException(status_code=400, detail="Workspace key non valida")
    config = _get_api_instance(key)
    if not config:
        raise HTTPException(status_code=503, detail="OpenCode grafico non disponibile")
    expected_session_id = _workspace_session_id(key)
    if request.session_id != expected_session_id:
        raise HTTPException(status_code=400, detail="Sessione OpenCode non valida")

    prompt = request.message.strip()
    if request.seed:
        try:
            with open(
                os.path.join(OPENCODE_WS_ROOT, key, ".opencode-prompt"),
                encoding="utf-8",
            ) as fh:
                prompt = fh.read().strip()
        except OSError as exc:
            raise HTTPException(status_code=500, detail="Prompt iniziale non disponibile") from exc
    if not prompt:
        raise HTTPException(status_code=400, detail="Messaggio vuoto")
    if len(prompt) > 12000:
        raise HTTPException(status_code=400, detail="Messaggio troppo lungo")

    async def stream() -> AsyncIterator[str]:
        full_text = ""
        current_part_id = ""
        text_part_count = 0
        completed = False
        timeout = httpx.Timeout(30, read=None)

        # Read workspace meta for locale + questionnaire_type
        meta = {}
        try:
            meta_path = os.path.join(OPENCODE_WS_ROOT, key, ".opencode-meta")
            with open(meta_path, encoding="utf-8") as fh:
                meta = json.load(fh)
        except Exception:
            pass
        oc_locale = meta.get("locale", "it")
        oc_qtype = meta.get("questionnaire_type", "OPENCODE")

        try:
            async with httpx.AsyncClient(
                auth=_api_auth(config), timeout=timeout
            ) as client:
                async with client.stream(
                    "GET", f"{config['url']}/event?directory=%2Fwork"
                ) as events:
                    events.raise_for_status()
                    body = {
                        "model": {
                            "providerID": "ollama",
                            "modelID": OPENCODE_CHAT_MODEL,
                        },
                        "system": (
                            "Do not expose internal reasoning or narrate tool calls. "
                            "Return only the final student-facing answer in the required language."
                        ),
                        "parts": [{"type": "text", "text": prompt}],
                    }
                    response = await client.post(
                        f"{config['url']}/session/{request.session_id}/prompt_async"
                        "?directory=%2Fwork",
                        json=body,
                    )
                    response.raise_for_status()

                    async for line in events.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        try:
                            event = json.loads(line[5:].strip())
                        except (ValueError, TypeError):
                            continue
                        properties = event.get("properties") or {}
                        if properties.get("sessionID") != request.session_id:
                            continue
                        event_type = event.get("type")
                        if event_type == "message.part.delta" and properties.get("field") == "text":
                            delta = str(properties.get("delta") or "")
                            if delta:
                                part_id = str(properties.get("partID") or "")
                                if part_id and part_id != current_part_id:
                                    current_part_id = part_id
                                    text_part_count += 1
                                    full_text = ""
                                full_text += delta
                                if text_part_count > 1:
                                    yield f"data: {json.dumps({'display': full_text})}\n\n"
                        elif event_type == "session.error":
                            error = properties.get("error") or "OpenCode error"
                            yield f"data: {json.dumps({'error': str(error)})}\n\n"
                            return
                        elif event_type == "session.idle":
                            completed = True
                            if not full_text:
                                messages = await client.get(
                                    f"{config['url']}/session/{request.session_id}/message"
                                    "?directory=%2Fwork"
                                )
                                messages.raise_for_status()
                                items = messages.json()
                                for item in reversed(items if isinstance(items, list) else []):
                                    if (item.get("info") or {}).get("role") == "assistant":
                                        full_text = _message_text(item.get("parts") or [])
                                        break

                            # Persist response as candidate for student feedback
                            response_id = None
                            try:
                                def _save_candidate():
                                    db = database.SessionLocal()
                                    try:
                                        rid = shared_response_memory.create_candidate(
                                            db, full_text, oc_qtype, phase="opencode", language=oc_locale,
                                        )
                                        db.commit()
                                        return rid
                                    except Exception:
                                        db.rollback()
                                        return None
                                    finally:
                                        db.close()
                                response_id = await asyncio.to_thread(_save_candidate)
                            except Exception:
                                pass

                            yield (
                                "data: "
                                + json.dumps({"done": True, "response": full_text, "session_id": request.session_id, "response_id": response_id})
                                + "\n\n"
                            )
                            return
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("OpenCode chat stream failed for %s: %s", key, exc)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        finally:
            if not completed:
                try:
                    await _api_json(
                        config,
                        "POST",
                        f"/session/{request.session_id}/abort?directory=%2Fwork",
                    )
                except Exception:
                    pass

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/opencode/workspace/{key}/abort")
async def abort_opencode(
    key: str,
    identity: dict = Depends(auth.get_current_user),
):
    if not _KEY_RE.match(key):
        raise HTTPException(status_code=400, detail="Workspace key non valida")
    config = _get_api_instance(key)
    if not config:
        raise HTTPException(status_code=503, detail="OpenCode grafico non disponibile")
    session_id = _workspace_session_id(key)
    await _api_json(
        config, "POST", f"/session/{session_id}/abort?directory=%2Fwork"
    )
    return {"ok": True}


@router.post("/opencode/workspace/{key}/reset")
async def reset_opencode(
    key: str,
    identity: dict = Depends(auth.get_current_user),
):
    if not _KEY_RE.match(key):
        raise HTTPException(status_code=400, detail="Workspace key non valida")
    config = _get_api_instance(key)
    if not config:
        raise HTTPException(status_code=503, detail="OpenCode grafico non disponibile")
    created = await _api_json(
        config,
        "POST",
        "/session?directory=%2Fwork",
        json_body={"title": "CounselorBot OpenCode"},
    )
    session_id = str(created.get("id") if isinstance(created, dict) else "")
    if not _OPENCODE_SESSION_RE.match(session_id):
        raise HTTPException(status_code=502, detail="OpenCode non ha creato la sessione")
    session_path = os.path.join(OPENCODE_WS_ROOT, key, ".opencode-session")
    _chmod(session_path, 0o666)
    with open(session_path, "w", encoding="utf-8") as fh:
        fh.write(session_id)
    _chmod(session_path, 0o444)
    return {"ok": True, "session_id": session_id, "needs_seed": True}


@router.post("/opencode/workspace/{key}/sync-memory")
async def sync_opencode_memory(
    key: str,
    identity: dict = Depends(auth.get_current_user),
):
    if not _KEY_RE.match(key):
        raise HTTPException(status_code=400, detail="Workspace key non valida")
    ws_dir = os.path.join(OPENCODE_WS_ROOT, key)
    metadata_path = os.path.join(ws_dir, ".workspace.json")
    notes_path = os.path.join(ws_dir, "appunti.md")
    if not os.path.isfile(metadata_path):
        raise HTTPException(status_code=404, detail="Workspace non trovato")
    try:
        with open(metadata_path, encoding="utf-8") as fh:
            metadata = json.load(fh)
        workspace_id = str(metadata.get("workspace_id") or "")
        if not _WORKSPACE_ID_RE.match(workspace_id):
            raise ValueError("workspace_id non valido")
        notes = ""
        if os.path.isfile(notes_path):
            with open(notes_path, encoding="utf-8") as fh:
                notes = fh.read(4000)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="Workspace non leggibile") from exc

    session_memory.sync_external_notes(workspace_id, notes)
    return {"ok": True}


def _chmod(path: str, mode: int) -> None:
    try:
        os.chmod(path, mode)
    except OSError:
        pass


@router.get("/opencode/pdf/{token}")
async def get_uploaded_pdf(
    token: str,
    identity: dict = Depends(auth.get_current_user),
):
    if not _PDF_TOKEN_RE.match(token):
        raise HTTPException(status_code=400, detail="Token non valido")
    path = pdf_storage_path(token)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="PDF non trovato")
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="profilo.pdf"'},
    )


# --- Bridge WebSocket ↔ PTY socket di host-agent ------------------------------
# Protocollo NDJSON di host-agent (vedi ai4educ-console/host-agent/agent.js):
#   client → agent: {t:init,mode,dir,shell,cols,rows} | {t:data,d:<b64>} |
#                   {t:resize,cols,rows}
#   agent → client: {t:ready,shell} | {t:data,d:<b64>} | {t:exit,code} |
#                   {t:error,err}
# Lato browser il payload e' testo xterm puro + JSON di controllo
# (resize/close/ping), identico a embeddedTerminalSession.js di ai4educ.

def _clamp(value, lo: int, hi: int, fallback: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(lo, min(hi, n))


async def _ws_identity(websocket: WebSocket) -> dict:
    """Identita' sul WebSocket: stessi criteri di auth.get_identity.

    L'upgrade WS arriva dalla location nginx dedicata (/api/term) che passa
    gli header del proxy; in assenza di segreto condiviso si ripiega sulla
    verifica diretta del cookie presso ai4auth.
    """
    headers = websocket.headers
    supplied_secret = headers.get("x-forwarded-auth-secret", "")
    if auth.FORWARD_AUTH_SHARED_SECRET and supplied_secret:
        import secrets as _secrets

        if _secrets.compare_digest(supplied_secret, auth.FORWARD_AUTH_SHARED_SECRET):
            return auth._identity_from_headers(headers)

    cookie = headers.get("cookie", "")
    if not cookie or not auth.AI4AUTH_VERIFY_URL:
        return auth._anonymous_identity()

    public_host = (
        auth.AI4AUTH_PUBLIC_HOST
        or headers.get("x-forwarded-host", "").split(",")[0].strip()
        or headers.get("host", "")
    )
    verify_headers = {"Cookie": cookie}
    if public_host:
        verify_headers["Host"] = public_host
        verify_headers["X-Original-URL"] = f"https://{public_host}/term"

    import httpx

    try:
        async with httpx.AsyncClient(timeout=4.0, follow_redirects=False) as client:
            response = await client.get(auth.AI4AUTH_VERIFY_URL, headers=verify_headers)
        if response.status_code == 200:
            return auth._identity_from_headers(response.headers)
    except httpx.HTTPError:
        pass
    return auth._anonymous_identity()


async def _agent_to_ws(reader: asyncio.StreamReader, websocket: WebSocket) -> None:
    buf = b""
    while True:
        chunk = await reader.read(4096)
        if not chunk:
            return
        buf += chunk
        while True:
            idx = buf.find(b"\n")
            if idx == -1:
                break
            line, buf = buf[:idx], buf[idx + 1:]
            if not line:
                continue
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            kind = msg.get("t")
            if kind == "data":
                text = base64.b64decode(msg.get("d") or "").decode("utf-8", "replace")
                await websocket.send_text(text)
            elif kind == "ready":
                await websocket.send_text(
                    f"\x1b[2m[connesso a {msg.get('shell')}]\x1b[0m\r\n"
                )
            elif kind == "exit":
                await websocket.send_text(
                    f"\r\n\x1b[2m[sessione terminata code={msg.get('code')}]\x1b[0m\r\n"
                )
                return
            elif kind == "error":
                await websocket.send_text(
                    f"\r\n\x1b[31m[errore host-agent: {msg.get('err')}]\x1b[0m\r\n"
                )
                return


async def _ws_to_agent(websocket: WebSocket, writer: asyncio.StreamWriter) -> None:
    while True:
        text = await websocket.receive_text()
        ctrl = None
        if text.startswith("{"):
            try:
                obj = json.loads(text)
                if isinstance(obj, dict) and obj.get("t"):
                    ctrl = obj
            except ValueError:
                pass
        if ctrl is not None:
            kind = ctrl.get("t")
            if kind == "resize":
                writer.write((json.dumps({
                    "t": "resize",
                    "cols": _clamp(ctrl.get("cols"), 20, 500, 80),
                    "rows": _clamp(ctrl.get("rows"), 5, 200, 24),
                }) + "\n").encode("utf-8"))
                await writer.drain()
                continue
            if kind == "close":
                return
            if kind == "ping":
                # Keepalive: nginx/tunnel chiudono i WS senza traffico.
                await websocket.send_text(json.dumps({"t": "pong"}))
                continue
        payload = base64.b64encode(text.encode("utf-8")).decode("ascii")
        writer.write((json.dumps({"t": "data", "d": payload}) + "\n").encode("utf-8"))
        await writer.drain()


@router.websocket("/term")
async def opencode_terminal(websocket: WebSocket):
    identity = await _ws_identity(websocket)
    if not identity["authenticated"]:
        await websocket.close(code=4403)
        return
    key = websocket.query_params.get("key") or ""
    if not _KEY_RE.match(key):
        await websocket.close(code=4400)
        return
    cols = _clamp(websocket.query_params.get("cols"), 20, 500, 80)
    rows = _clamp(websocket.query_params.get("rows"), 5, 200, 24)

    await websocket.accept()
    try:
        reader, writer = await asyncio.open_unix_connection(AGENT_PTY_SOCKET)
    except OSError as exc:
        await websocket.send_text(
            f"\x1b[31m[host-agent non raggiungibile: {exc}]\x1b[0m\r\n"
        )
        await websocket.close()
        return

    # dir come la vede l'HOST: host-agent rivalida che stia sotto la sua root.
    host_dir = f"{OPENCODE_WS_HOST_ROOT}/{key}"
    writer.write((json.dumps({
        "t": "init", "mode": "opencode", "dir": host_dir,
        "shell": "wsl", "cols": cols, "rows": rows,
    }) + "\n").encode("utf-8"))
    await writer.drain()

    to_ws = asyncio.create_task(_agent_to_ws(reader, websocket))
    to_agent = asyncio.create_task(_ws_to_agent(websocket, writer))
    try:
        done, pending = await asyncio.wait(
            {to_ws, to_agent}, return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
        for task in done:
            exc = task.exception()
            if exc and not isinstance(exc, (WebSocketDisconnect, OSError)):
                logger.warning("OpenCode WS bridge: %s", exc)
    except WebSocketDisconnect:
        pass
    finally:
        for task in (to_ws, to_agent):
            task.cancel()
        try:
            writer.close()
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass
