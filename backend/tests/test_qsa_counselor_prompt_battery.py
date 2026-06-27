#!/usr/bin/env python3
r"""QSA Counselor Prompt & Performance Battery — guida i test ATTRAVERSO la
Prompt Audit API (`/admin/prompt-audit/*`), non con chiamate dirette ai modelli.

Differenza dal benchmark Ollama (`test_ollama_qsa_benchmark.py`): quel file ri-
implementa i prompt e parla direttamente con Ollama. QUESTA batteria invece
esercita la *pipeline reale* dell'app (prompt resolution + envelope + direttive
+ counselor preset + sanitizzazione) tramite gli endpoint:

  - POST /admin/prompt-audit/matrix   (discovery step × counselor, no modello)
  - POST /admin/prompt-audit/dry-run  (envelope risolto, no modello)   → batteria PROMPT
  - POST /admin/prompt-audit/live     (esecuzione reale del counselor) → batteria PERFORMANCE

I PARAMETRI DI VALUTAZIONE (liste di parole positive/negative, nomi fattori,
set invertiti, accuratezza interpretazione) sono ripresi da
`test_ollama_qsa_benchmark.py` — qui sono ricopiati per restare stdlib-only e
profilabili sul profilo canonico, ma la logica è la stessa.

TUTTI i test usano lo STESSO profilo QSA (CANONICAL_PROFILE, dall'handoff
`docs/handoff/qsa-counselor-reasoning-confined.md`).

Uso:
  # batteria completa (statica + live) con report markdown
  python -m backend.tests.test_qsa_counselor_prompt_battery

  # solo statica (nessun modello, veloce, deterministica)
  QSA_BATTERY_LIVE=0 python -m backend.tests.test_qsa_counselor_prompt_battery

Variabili d'ambiente:
  PROMPT_AUDIT_BASE_URL   default http://localhost:8088
  PROMPT_AUDIT_API_TOKEN  obbligatorio (altrimenti i test sono SKIP). Se assente
                          nell'env viene letto da .env nella root del repo.
  QSA_BATTERY_LANG        default it
  QSA_BATTERY_COUNSELORS  csv di counselor_id (default: tutti gli attivi dal matrix)
  QSA_BATTERY_STEPS       csv di step_id      (default: tutti gli step QSA con fattori)
  QSA_BATTERY_LIVE        1/0  esegui la batteria live (default 1)
  QSA_BATTERY_MAX_TOKENS  default 700
  QSA_BATTERY_OUTPUT      path file markdown del report (default: solo stdout)

Compatibile pytest: `test_qsa_prompt_battery_static` (statica, su tutto il matrix)
e `test_qsa_counselor_performance_smoke` (live, 1 counselor × 2 step). Entrambi
SKIP se l'API non è raggiungibile / manca il token.
"""
from __future__ import annotations

import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Configurazione
# ---------------------------------------------------------------------------
DEFAULT_BASE_URL = "http://localhost:8088"
LANG = os.environ.get("QSA_BATTERY_LANG", "it")
MAX_TOKENS = int(os.environ.get("QSA_BATTERY_MAX_TOKENS", "700"))
RUN_LIVE = os.environ.get("QSA_BATTERY_LIVE", "1").lower() in ("1", "true", "yes")
OUTPUT_FILE = os.environ.get("QSA_BATTERY_OUTPUT", "")
MIN_WORDS = int(os.environ.get("QSA_BATTERY_MIN_WORDS", "30"))

# Profilo QSA canonico (handoff qsa-counselor-reasoning-confined.md). UNICO per
# tutta la batteria: ogni counselor riceve esattamente questi punteggi.
CANONICAL_PROFILE: dict[str, int] = {
    "C1": 7, "C2": 5, "C3": 3, "C4": 6, "C5": 4, "C6": 7, "C7": 5,
    "A1": 8, "A2": 6, "A3": 5, "A4": 8, "A5": 3, "A6": 3, "A7": 7,
}

# ---------------------------------------------------------------------------
# PARAMETRI DI VALUTAZIONE — ripresi da backend/tests/test_ollama_qsa_benchmark.py
# (nomi fattori, set invertiti, lessici positivi/negativi, ecc.). Tenere
# allineati a quel file e a frontend/src/lib/qsa-model.ts.
# ---------------------------------------------------------------------------
QSA_INVERTED = ("C3", "C6", "A1", "A4", "A5", "A7")

# Nomi fattori CANONICI (PDF Pellerey). Dopo l'allineamento, frontend (i18n-factors
# + questionnaires), backend (_qsa_factor_names) e questo file usano gli stessi nomi.
QSA_FACTOR_IT: dict[str, str] = {
    "C1": "Strategie elaborative", "C2": "Autoregolazione", "C3": "Disorientamento",
    "C4": "Disponibilità alla collaborazione", "C5": "Uso di organizzatori semantici",
    "C6": "Difficoltà di concentrazione", "C7": "Autointerrogazione",
    "A1": "Ansietà di base", "A2": "Volizione",
    "A3": "Attribuzione a cause controllabili", "A4": "Attribuzione a cause incontrollabili",
    "A5": "Mancanza di perseveranza", "A6": "Percezione di competenza",
    "A7": "Interferenze emotive",
}
QSA_FACTOR_EN: dict[str, str] = {
    "C1": "Elaborative strategies", "C2": "Self-regulation", "C3": "Disorientation",
    "C4": "Willingness to collaborate", "C5": "Use of semantic organisers",
    "C6": "Concentration difficulties", "C7": "Self-questioning",
    "A1": "Baseline anxiety", "A2": "Volition",
    "A3": "Attribution to controllable causes", "A4": "Attribution to uncontrollable causes",
    "A5": "Lack of perseverance", "A6": "Perceived competence",
    "A7": "Emotional interference",
}

# Le risposte vengono riscritte su questi nomi da `_annotate_qsa_factor_codes`:
# ora coincidono coi nomi frontend, quindi l'alias punta alla stessa mappa.
QSA_FACTOR_IT_BACKEND = QSA_FACTOR_IT


def _response_names(lang: str) -> dict[str, str]:
    """Nomi attesi NEL TESTO della risposta (post-annotazione)."""
    return QSA_FACTOR_IT_BACKEND if lang == "it" else QSA_FACTOR_EN

# Lessici (sentiment) — da test_ollama_qsa_benchmark.py.
_POSITIVE_WORDS = {
    "it": {"punto di forza", "forza", "forte", "buono", "efficace", "positivo", "competente",
           "capace", "adeguato", "beneficio", "risorsa", "vantaggio", "abilità"},
    "en": {"strength", "strong", "good", "effective", "positive", "capable", "skilled",
           "competent", "well", "benefit", "resource", "advantage", "ability"},
}
_NEGATIVE_WORDS = {
    "it": {"area di miglioramento", "area di crescita", "da migliorare", "migliorare",
           "difficoltà", "criticità", "problematico", "debolezza", "carenza", "lacuna",
           "ostacolo", "sfida", "può migliorare", "bisogno di", "limitazione"},
    "en": {"area for growth", "growth area", "improvement", "challenge", "difficulty",
           "problem", "weakness", "struggle", "needs work", "caution", "gap",
           "obstacle", "limitation", "can improve", "need to work"},
}
_PRACTICAL_ADVICE_WORDS = {
    "it": {"consiglio", "prova a", "suggerisco", "potresti", "puoi", "esercizio",
           "strategia", "pratica", "azione", "prova", "fai", "provare", "cerca di",
           "ti suggerisco", "ti consiglio", "utilizza", "usa"},
    "en": {"try", "suggest", "practice", "strategy", "exercise", "action",
           "you can", "you could", "recommend", "advice", "use", "start by",
           "consider", "attempt", "implement", "adopt"},
}
# Lessico della CONNESSIONE tra fattori: include sia i termini generici di relazione
# sia i VERBI CAUSALI di interazione (rinforza/compensa/frena…) richiesti dalla
# direttiva [FACTOR INTERPLAY] del prompt di secondo livello — altrimenti la metrica
# non vedrebbe frasi corrette come "A6 frena A2 / A2 è sostenuta da A6".
_CONNECTION_WORDS = {
    "it": {"insieme", "relazione", "collegamento", "correlato", "interazione",
           "connesso", "influenza", "impatto", "combina", "combinazione",
           "rinforza", "rinforzano", "compensa", "frena", "frenano", "ostacola",
           "ostacolata", "amplifica", "sostiene", "sostenuta", "indebolisce",
           "indebolita", "alimenta", "favorisce", "aggrava", "a vicenda",
           "si influenzano", "vicenda"},
    "en": {"together", "relationship", "connection", "correlated", "interaction",
           "linked", "influences", "impact", "combines", "combination",
           "reinforce", "reinforces", "compensate", "compensates", "hinder",
           "hinders", "amplifies", "supports", "weakens", "undermines", "fuels",
           "holds back", "each other"},
}

# Etichette di interpretazione (frontend analyzeScore) → usate nel scores_context.
_FRONTEND_LABELS = {
    "strength": "Forza", "adequate": "Adeguato", "weakness": "Debolezza",
    "normal": "Normale", "balanced": "Equilibrata",
}


# ---------------------------------------------------------------------------
# Profilo → scores_context fedele (mirror frontend formatScoresForPrompt+analyzeScore)
# ---------------------------------------------------------------------------
def _interpretation_label(code: str, score: int) -> str:
    inverted = code in QSA_INVERTED
    if score <= 3:
        level = "Low"
    elif score <= 6:
        level = "Mid"
    else:
        level = "High"
    if inverted:
        return {"Low": _FRONTEND_LABELS["strength"],
                "Mid": _FRONTEND_LABELS["normal"],
                "High": _FRONTEND_LABELS["weakness"]}[level]
    if level == "Mid":
        return _FRONTEND_LABELS["balanced"] if code == "A3" else _FRONTEND_LABELS["adequate"]
    return _FRONTEND_LABELS["strength"] if level == "High" else _FRONTEND_LABELS["weakness"]


def build_scores_context(profile: dict[str, int]) -> str:
    """Riproduce frontend/src/components/qsa/ChatInterface.tsx formatScoresForPrompt."""
    names = QSA_FACTOR_IT
    lines = ["PROFILO QSA DELLO STUDENTE:", "", "Strategie Cognitive:"]
    for code in [c for c in names if c.startswith("C")]:
        v = profile[code]
        lines.append(f"- {code} ({names[code]}): {v}/9 ({_interpretation_label(code, v)})")
    lines.append("")
    lines.append("Strategie Affettive:")
    for code in [c for c in names if c.startswith("A")]:
        v = profile[code]
        lines.append(f"- {code} ({names[code]}): {v}/9 ({_interpretation_label(code, v)})")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# HTTP client (stdlib): nessuna dipendenza esterna
# ---------------------------------------------------------------------------
class APIUnavailable(Exception):
    pass


def _base_url() -> str:
    return os.environ.get("PROMPT_AUDIT_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _load_token() -> str:
    token = os.environ.get("PROMPT_AUDIT_API_TOKEN", "").strip()
    if token:
        return token
    env_file = _repo_root() / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line.startswith("PROMPT_AUDIT_API_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def _post(path: str, payload: dict[str, Any], token: str, timeout: float = 240.0) -> dict[str, Any]:
    url = f"{_base_url()}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Prompt-Audit-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise APIUnavailable(f"HTTP {exc.code} su {path}: {body[:300]}") from exc
    except urllib.error.URLError as exc:
        raise APIUnavailable(f"API non raggiungibile su {url}: {exc}") from exc


# ---------------------------------------------------------------------------
# Valutatori (riusano i parametri del benchmark, parametrizzati sul profilo)
# ---------------------------------------------------------------------------
_CODE_RE = re.compile(r"\b([AC]\d)\b")


def _codes_in(text: str) -> set[str]:
    return {m.group(1).upper() for m in _CODE_RE.finditer(text or "")}


def _expected_polarity(code: str, score: int) -> str:
    """positive=forza, negative=debolezza/crescita, neutral=adeguato/normale."""
    inverted = code in QSA_INVERTED
    if inverted:
        if score <= 3:
            return "positive"
        if score >= 7:
            return "negative"
        return "neutral"
    if score >= 7:
        return "positive"
    if score <= 3:
        return "negative"
    return "neutral"


def _candidate_names(code: str, lang: str) -> list[str]:
    """Tutti i nomi con cui il fattore può comparire nella risposta: backend
    (post-annotazione) + frontend (se il modello ricopia il scores_context)."""
    names = {_response_names(lang).get(code, "")}
    names.add((QSA_FACTOR_IT if lang == "it" else QSA_FACTOR_EN).get(code, ""))
    return [n for n in names if n]


def _sentences_mentioning(names: list[str], text: str) -> list[str]:
    alt = "|".join(re.escape(n) for n in names)
    pat = rf"[^.!?\n]*(?:{alt})[^.!?\n]*[.!?\n]"
    return re.findall(pat, text, re.IGNORECASE)


def _found_polarity(names: list[str], text: str, lang: str) -> tuple[bool, bool]:
    pos_words = _POSITIVE_WORDS.get(lang, _POSITIVE_WORDS["en"])
    neg_words = _NEGATIVE_WORDS.get(lang, _NEGATIVE_WORDS["en"])
    sentences = _sentences_mentioning(names, text)
    found_pos = any(re.search(rf"\b{re.escape(p)}\b", s, re.IGNORECASE) for s in sentences for p in pos_words)
    found_neg = any(re.search(rf"\b{re.escape(n)}\b", s, re.IGNORECASE) for s in sentences for n in neg_words)
    return found_pos, found_neg


def interpretation_eval(visible: str, covered_codes: list[str], profile: dict[str, int], lang: str) -> dict[str, Any]:
    """Accuratezza interpretazione + violazioni di inversione (il bug A5).

    Una *violazione di inversione* = un fattore di cui la risposta afferma la
    polarità OPPOSTA a quella attesa (es. A5=3 invertito → atteso "forza" ma la
    risposta lo tratta come debolezza, oppure A1=8 invertito → atteso "debolezza"
    ma trattato come forza). È il criterio QSA più critico."""
    total = 0
    correct = 0.0
    violations: list[dict[str, Any]] = []
    lowered = visible.lower()
    for code in covered_codes:
        score = profile.get(code)
        names = _candidate_names(code, lang)
        if score is None or not any(n.lower() in lowered for n in names):
            continue
        total += 1
        expected = _expected_polarity(code, score)
        found_pos, found_neg = _found_polarity(names, visible, lang)
        inverted = code in QSA_INVERTED
        if expected == "positive":
            if found_pos and not found_neg:
                correct += 1
            elif found_neg and not found_pos:
                # Falso positivo frequente: un fattore invertito a punteggio BASSO
                # (es. C3=3 Disorientamento, A5=3 Mancanza di perseveranza) è una
                # forza, ma il suo nome è negativo → la prosa usa lessico negativo
                # pur leggendolo bene. Quindi "screening", non "high".
                sev = "screening" if (inverted and score <= 3) else "high"
                violations.append({"code": code, "score": score, "expected": "forza",
                                   "found": "debolezza", "inverted": inverted, "severity": sev})
            elif not found_pos and not found_neg:
                correct += 0.5
        elif expected == "negative":
            if found_neg and not found_pos:
                correct += 1
            elif found_pos and not found_neg:
                # Errore ad alta confidenza: il modello chiama "forza" un'area che
                # è una debolezza/crescita (es. A1=8 ansia letta come forza — il bug
                # storico dell'inversione ad alto punteggio).
                violations.append({"code": code, "score": score, "expected": "debolezza",
                                   "found": "forza", "inverted": inverted, "severity": "high"})
            elif not found_pos and not found_neg:
                correct += 0.5
        else:  # neutral
            correct += 1
    accuracy = correct / total if total else 1.0
    return {"accuracy": round(accuracy, 3), "evaluated": total, "violations": violations}


def practical_advice_score(visible: str, lang: str) -> float:
    words = _PRACTICAL_ADVICE_WORDS.get(lang, _PRACTICAL_ADVICE_WORDS["en"])
    count = sum(1 for w in words if re.search(rf"\b{re.escape(w)}\b", visible, re.IGNORECASE))
    return round(min(count / 3, 1.0), 3)


def connection_score(visible: str, mode: str, lang: str) -> Optional[float]:
    if mode not in ("second-level", "qsar-second-level"):
        return None
    words = _CONNECTION_WORDS.get(lang, _CONNECTION_WORDS["en"])
    count = sum(1 for w in words if re.search(rf"\b{re.escape(w)}\b", visible, re.IGNORECASE))
    return round(min(count / 2, 1.0), 3)


# ---------------------------------------------------------------------------
# Strutture risultato
# ---------------------------------------------------------------------------
@dataclass
class LiveCell:
    counselor_id: Optional[int]
    counselor_name: str
    provider: str
    model: str
    step_id: str
    step_label: str
    mode: str
    duration_ms: int
    cost_usd: Optional[float]
    word_count: int
    api_checks: dict[str, Any]
    interp: dict[str, Any]
    practical: float
    connection: Optional[float]
    error: Optional[str] = None

    @property
    def inversion_violations(self) -> list[dict[str, Any]]:
        return list(self.interp.get("violations", []))

    @property
    def inversion_high(self) -> list[dict[str, Any]]:
        """Errori d'inversione ad alta confidenza (es. ansia alta letta come forza)."""
        return [v for v in self.inversion_violations if v.get("severity") == "high"]

    @property
    def inversion_screening(self) -> list[dict[str, Any]]:
        """Sospetti da verificare a mano (fattore invertito a basso punteggio:
        nome negativo + lessico negativo → spesso falso positivo)."""
        return [v for v in self.inversion_violations if v.get("severity") != "high"]

    @property
    def hard_fail(self) -> bool:
        """Fallimento bloccante: leak di reasoning, rifiuto, o inversione ad alta
        confidenza. Lo screening NON è bloccante (rumore del lessico)."""
        if self.error:
            return True
        c = self.api_checks
        if not c.get("reasoning_leak", {}).get("ok", True):
            return True
        if not c.get("refusal", {}).get("ok", True):
            return True
        if self.inversion_high:
            return True
        return False

    @property
    def soft_flags(self) -> list[str]:
        flags = []
        c = self.api_checks
        if c.get("language", {}).get("ok") is False:
            flags.append("lingua")
        if c.get("no_greeting", {}).get("ok") is False:
            flags.append("saluto")
        if c.get("factor_code_format", {}).get("ok") is False:
            flags.append("codice-isolato")
        if c.get("factor_coverage", {}).get("ok") is False:
            flags.append("copertura")
        if self.word_count < MIN_WORDS:
            flags.append("scarno")
        if self.connection is not None and self.connection < 0.5:
            flags.append("poca-connessione")
        if self.practical < 0.34:
            flags.append("pochi-consigli")
        if self.inversion_screening:
            flags.append("inversione?")
        return flags


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------
def discover(token: str, qtype: str = "QSA") -> tuple[list[dict], list[dict]]:
    """Ritorna (steps, counselors) dal matrix. steps con factor codes via dry-run."""
    matrix = _post("/admin/prompt-audit/matrix",
                   {"questionnaire_type": qtype, "language": LANG, "include_knowledge": False,
                    "scores_context": build_scores_context(CANONICAL_PROFILE)},
                   token, timeout=120)
    rows = matrix["rows"]
    counselor_ids: list[Optional[int]] = []
    counselors: list[dict] = []
    for r in rows:
        cid = r["counselor_id"]
        if cid not in counselor_ids:
            counselor_ids.append(cid)
            counselors.append({"id": cid, "provider": r["provider"], "model": r["model"]})
    step_ids: list[str] = []
    steps: list[dict] = []
    for r in rows:
        if r["step_id"] not in step_ids:
            step_ids.append(r["step_id"])
            steps.append({"id": r["step_id"], "label": r["step_label"],
                          "prompt_key": r["prompt_key"], "warnings_sample": r["warnings"]})
    return steps, counselors


def step_envelope(token: str, step_id: str, counselor_id: Optional[int]) -> dict[str, Any]:
    """dry-run di uno step → envelope risolto + mode + scoped codes (no modello)."""
    payload = {
        "questionnaire_type": "QSA", "language": LANG, "phase": step_id,
        "mode": "factor", "use_phase_prompt": True, "counselor_id": counselor_id,
        "include_knowledge": False, "max_tokens": MAX_TOKENS,
        "scores_context": build_scores_context(CANONICAL_PROFILE),
        "session_id": f"qsa-battery-dry-{step_id}",
    }
    return _post("/admin/prompt-audit/dry-run", payload, token, timeout=120)


# ---------------------------------------------------------------------------
# Batteria 1 — PROMPT (statica, nessun modello): valuta envelope/direttive/warning
# ---------------------------------------------------------------------------
def run_static_prompt_battery(token: str, steps: list[dict], counselors: list[dict],
                              report: list[str]) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    analysis_steps = [s for s in steps if s["id"] != "intro"]
    ref_counselor = counselors[0]["id"] if counselors else None

    for step in analysis_steps:
        env = step_envelope(token, step["id"], ref_counselor)
        sysp = env["envelope"]["system_prompt_final"]
        scoped = env["inputs"].get("scoped_scores_context") or ""
        resolved_mode = (env["resolved"].get("step") or {}).get("mode")
        scoped_codes = sorted(_codes_in(scoped))
        problems = []
        # Direttive obbligatorie
        if "[FACTOR LABELS]" not in sysp:
            problems.append("manca [FACTOR LABELS]")
        if "[INTERPRETATION TABLE]" not in sysp:
            problems.append("manca [INTERPRETATION TABLE]")
        # Inversione pre-risolta: i fattori invertiti devono mostrare bande invertite
        for code in scoped_codes:
            if code in QSA_INVERTED:
                row = re.search(rf"- {code} \([^)]*\): ([^\n]+)", sysp)
                if row and "7-9 = Forza" in row.group(1):
                    problems.append(f"{code} invertito ma riga mostra 7-9=Forza")
        # Fattori dello step presenti nello scoped context
        if not scoped_codes:
            problems.append("scoped_scores_context vuoto")
        findings.append({
            "step": step["id"], "mode": resolved_mode,
            "scoped_codes": scoped_codes,
            "system_prompt_length": len(sysp),
            "warnings": env.get("warnings", []),
            "problems": problems,
        })

    # Warning su tutta la matrice (counselor × step), col profilo canonico così i
    # warning riflettono lo scenario reale (non un missing_factor_scores fittizio).
    matrix = _post("/admin/prompt-audit/matrix",
                   {"questionnaire_type": "QSA", "language": LANG, "include_knowledge": False,
                    "scores_context": build_scores_context(CANONICAL_PROFILE)},
                   token, timeout=120)
    warned = [r for r in matrix["rows"] if r["warnings"]]

    report.append("## Batteria PROMPT (statica, dry-run / matrix)\n")
    report.append(f"- Step analizzati: **{len(analysis_steps)}**  ·  counselor di riferimento per envelope: `{ref_counselor}`")
    report.append(f"- Celle matrice con warning: **{len(warned)} / {len(matrix['rows'])}**\n")
    report.append("| Step | Mode | Fattori scoped | Len sysprompt | Problemi |")
    report.append("|---|---|---|---:|---|")
    for f in findings:
        prob = "✅" if not f["problems"] else "⚠️ " + "; ".join(f["problems"])
        report.append(f"| {f['step']} | {f['mode']} | {', '.join(f['scoped_codes'])} | {f['system_prompt_length']} | {prob} |")
    report.append("")
    if warned:
        report.append("Celle con warning:")
        for r in warned[:20]:
            codes = ", ".join(w["code"] for w in r["warnings"])
            report.append(f"- counselor {r['counselor_id']} / {r['step_id']}: {codes}")
        report.append("")

    total_problems = sum(len(f["problems"]) for f in findings) + len(warned)
    return {"findings": findings, "warned_cells": warned, "total_problems": total_problems}


# ---------------------------------------------------------------------------
# Batteria 2 — PERFORMANCE (live): esegue i counselor sullo stesso profilo
# ---------------------------------------------------------------------------
def run_live_cell(token: str, counselor: dict, step: dict) -> LiveCell:
    payload = {
        "questionnaire_type": "QSA", "language": LANG, "phase": step["id"],
        "mode": step.get("mode", "factor"), "use_phase_prompt": True,
        "counselor_id": counselor["id"], "include_knowledge": False,
        "max_tokens": MAX_TOKENS,
        "scores_context": build_scores_context(CANONICAL_PROFILE),
        "session_id": f"qsa-battery-live-{counselor['id']}-{step['id']}",
    }
    try:
        resp = _post("/admin/prompt-audit/live", payload, token, timeout=300)
    except APIUnavailable as exc:
        return LiveCell(
            counselor_id=counselor["id"], counselor_name=str(counselor["id"]),
            provider=counselor.get("provider", "?"), model=counselor.get("model", "?"),
            step_id=step["id"], step_label=step["label"], mode=step.get("mode", "factor"),
            duration_ms=0, cost_usd=None, word_count=0, api_checks={}, interp={},
            practical=0.0, connection=None, error=str(exc),
        )
    resolved = resp.get("resolved", {})
    cobj = resolved.get("counselor") or {}
    visible = resp.get("response_visible") or ""
    scoped = resp.get("inputs", {}).get("scoped_scores_context") or ""
    covered = sorted(_codes_in(scoped))
    mode = (resolved.get("step") or {}).get("mode") or step.get("mode", "factor")
    interp = interpretation_eval(visible, covered, CANONICAL_PROFILE, LANG)
    return LiveCell(
        counselor_id=resolved.get("counselor", {}).get("id", counselor["id"]),
        counselor_name=cobj.get("name") or str(counselor["id"]),
        provider=resolved.get("provider", counselor.get("provider", "?")),
        model=resolved.get("model", counselor.get("model", "?")),
        step_id=step["id"], step_label=step["label"], mode=mode,
        duration_ms=int(resp.get("duration_ms") or 0),
        cost_usd=resp.get("cost_usd"),
        word_count=len(visible.split()),
        api_checks=resp.get("checks", {}),
        interp=interp,
        practical=practical_advice_score(visible, LANG),
        connection=connection_score(visible, mode, LANG),
    )


def run_live_performance_battery(token: str, steps: list[dict], counselors: list[dict],
                                 report: list[str]) -> list[LiveCell]:
    analysis_steps = [s for s in steps if s["id"] != "intro"]
    # mode per step (da dry-run, una volta)
    for step in analysis_steps:
        try:
            env = step_envelope(token, step["id"], counselors[0]["id"] if counselors else None)
            step["mode"] = (env["resolved"].get("step") or {}).get("mode") or "factor"
        except APIUnavailable:
            step["mode"] = "factor"

    cells: list[LiveCell] = []
    total = len(counselors) * len(analysis_steps)
    i = 0
    for counselor in counselors:
        for step in analysis_steps:
            i += 1
            print(f"  [{i}/{total}] counselor {counselor['id']} · {step['id']} ...", file=sys.stderr, flush=True)
            cell = run_live_cell(token, counselor, step)
            cells.append(cell)
    _render_live_report(cells, report)
    return cells


def _render_live_report(cells: list[LiveCell], report: list[str]) -> None:
    report.append("## Batteria PERFORMANCE (live, /admin/prompt-audit/live)\n")
    report.append(f"Profilo unico per tutti: `{json.dumps(CANONICAL_PROFILE)}`\n")

    # Scheda per counselor
    by_counselor: dict[Any, list[LiveCell]] = {}
    for c in cells:
        by_counselor.setdefault((c.counselor_id, c.counselor_name, c.provider, c.model), []).append(c)

    report.append("### Scorecard per counselor\n")
    report.append("| Counselor | Provider/Model | Celle | Hard-fail | Inv.alta | Inv.screen | Acc.interp | Leak | Lat.media | Costo tot |")
    report.append("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for (cid, name, prov, model), group in by_counselor.items():
        ok = [c for c in group if not c.error]
        hard = sum(1 for c in group if c.hard_fail)
        inv_high = sum(len(c.inversion_high) for c in group)
        inv_screen = sum(len(c.inversion_screening) for c in group)
        acc = statistics.mean([c.interp.get("accuracy", 0) for c in ok]) if ok else 0
        leaks = sum(1 for c in ok if not c.api_checks.get("reasoning_leak", {}).get("ok", True))
        lat = statistics.mean([c.duration_ms for c in ok]) if ok else 0
        costs = [c.cost_usd for c in ok if isinstance(c.cost_usd, (int, float))]
        cost = sum(costs) if costs else 0
        report.append(f"| {name} ({cid}) | {prov}/{model} | {len(group)} | {hard} | {inv_high} | {inv_screen} | "
                      f"{acc:.2f} | {leaks} | {lat/1000:.1f}s | ${cost:.4f} |")
    report.append("\n_Inv.alta = inversione errata ad alta confidenza (bloccante). "
                  "Inv.screen = sospetto da verificare a mano (fattore invertito a basso "
                  "punteggio: il nome negativo inganna l'euristica, spesso falso positivo)._\n")

    # Dettaglio celle con problemi
    report.append("### Celle con hard-fail o flag\n")
    flagged = [c for c in cells if c.hard_fail or c.soft_flags]
    if not flagged:
        report.append("Nessuna. ✅\n")
    else:
        report.append("| Counselor | Step | Hard-fail | Flag | Inversioni errate |")
        report.append("|---|---|---|---|---|")
        for c in flagged:
            hf = "❌" if c.hard_fail else ""
            def _fmt(vs):
                return "; ".join(f"{v['code']}={v['score']} ({v['expected']}→{v['found']})" for v in vs)
            invs = ""
            if c.inversion_high:
                invs += "ALTA: " + _fmt(c.inversion_high)
            if c.inversion_screening:
                invs += ("  ·  " if invs else "") + "screen: " + _fmt(c.inversion_screening)
            if c.error:
                invs = f"ERRORE: {c.error[:80]}"
            report.append(f"| {c.counselor_name} | {c.step_id} | {hf} | {', '.join(c.soft_flags)} | {invs} |")
        report.append("")

    # Regressione mirata: il bug storico = fattore invertito ad ALTO punteggio letto
    # come forza (A1=8 ansia, A4=8 attrib. incontrollabile, A7=7). La tabella pre-
    # risolta dovrebbe averlo eliminato: qui si verifica che resti eliminato.
    report.append("### Regressione mirata — inversione ad alto punteggio (A1=8, A4=8, A7=7)\n")
    focus = {"A1", "A4", "A7"}
    hits = []
    for c in cells:
        if c.error:
            continue
        rel = [v for v in c.inversion_high if v["code"] in focus]
        if rel:
            hits.append(f"| {c.counselor_name} | {c.step_id} | ❌ {', '.join(v['code'] for v in rel)} |")
    report.append("| Counselor | Step | Errore |")
    report.append("|---|---|---|")
    report.extend(hits)
    if not hits:
        report.append("| — | — | ✅ nessun errore: l'inversione ad alto punteggio è gestita |")
    report.append("")


# ---------------------------------------------------------------------------
# Orchestrazione + report
# ---------------------------------------------------------------------------
def _filtered(steps: list[dict], counselors: list[dict]) -> tuple[list[dict], list[dict]]:
    step_env = os.environ.get("QSA_BATTERY_STEPS", "").strip()
    coun_env = os.environ.get("QSA_BATTERY_COUNSELORS", "").strip()
    if step_env:
        wanted = [s.strip() for s in step_env.split(",") if s.strip()]
        steps = [s for s in steps if s["id"] in wanted]
    if coun_env:
        wanted_ids = {int(x) for x in coun_env.split(",") if x.strip()}
        counselors = [c for c in counselors if c["id"] in wanted_ids]
    return steps, counselors


def build_report(token: str) -> tuple[str, dict[str, Any]]:
    steps, counselors = discover(token)
    steps, counselors = _filtered(steps, counselors)
    report: list[str] = []
    report.append(f"# QSA Counselor Prompt & Performance Battery\n")
    report.append(f"_Generato: {datetime.now(timezone.utc).isoformat(timespec='seconds')}_  ·  "
                  f"base: `{_base_url()}`  ·  lingua: `{LANG}`\n")
    report.append(f"Counselor sotto test: {', '.join(str(c['id']) for c in counselors)}  ·  "
                  f"Step: {', '.join(s['id'] for s in steps if s['id'] != 'intro')}\n")
    report.append("> ⚠️ **Limiti della metrica.** I segnali DETERMINISTICI (no reasoning-leak, "
                  "no refusal, struttura del prompt, tabella d'inversione pre-risolta, copertura "
                  "fattori, formato codici) sono affidabili. Il check di **polarità interpretativa** "
                  "(`Inv.alta`/`Inv.screen`, `Acc.interp`) è invece **euristico-lessicale**: ha falsi "
                  "positivi (un fattore invertito a basso punteggio ha un nome negativo) ed è sensibile "
                  "alla non-determinismo dei modelli. Vanno letti come *celle da rivedere a mano* e come "
                  "*ranking relativo tra modelli*, non come verdetti assoluti.\n")

    static = run_static_prompt_battery(token, steps, counselors, report)
    cells: list[LiveCell] = []
    if RUN_LIVE:
        cells = run_live_performance_battery(token, steps, counselors, report)
    else:
        report.append("## Batteria PERFORMANCE (live)\n\n_(saltata: QSA_BATTERY_LIVE=0)_\n")

    summary = {
        "static_problems": static["total_problems"],
        "live_cells": len(cells),
        "live_hard_fail": sum(1 for c in cells if c.hard_fail),
        "live_inversion_high": sum(len(c.inversion_high) for c in cells),
        "live_inversion_screening": sum(len(c.inversion_screening) for c in cells),
    }
    return "\n".join(report), summary


def main() -> int:
    token = _load_token()
    if not token:
        print("PROMPT_AUDIT_API_TOKEN mancante (env o .env). Impossibile eseguire.", file=sys.stderr)
        return 2
    try:
        md, summary = build_report(token)
    except APIUnavailable as exc:
        print(f"API non disponibile: {exc}", file=sys.stderr)
        return 2
    print(md)
    if OUTPUT_FILE:
        Path(OUTPUT_FILE).write_text(md, encoding="utf-8")
        print(f"\n[report scritto in {OUTPUT_FILE}]", file=sys.stderr)
    print(f"\n[SUMMARY] {json.dumps(summary)}", file=sys.stderr)
    return 0


# ---------------------------------------------------------------------------
# Entry-point pytest (SKIP se API non raggiungibile / token assente)
# ---------------------------------------------------------------------------
def _skip(msg: str):
    try:
        import pytest
        pytest.skip(msg)
    except ImportError:
        print(f"SKIP: {msg}", file=sys.stderr)
        raise SystemExit(0)


def test_qsa_prompt_battery_static():
    token = _load_token()
    if not token:
        _skip("PROMPT_AUDIT_API_TOKEN assente")
    try:
        steps, counselors = discover(token)
    except APIUnavailable as exc:
        _skip(f"API non raggiungibile: {exc}")
        return
    report: list[str] = []
    result = run_static_prompt_battery(token, steps, counselors, report)
    # Le direttive QSA e l'inversione pre-risolta devono essere intatte su ogni step.
    broken = [f for f in result["findings"] if f["problems"]]
    assert not broken, f"Problemi nelle direttive/inversione: {broken}"
    # Nessuna cella della matrice deve avere warning di prompt.
    assert not result["warned_cells"], f"Celle con warning: {result['warned_cells'][:5]}"


def test_qsa_counselor_performance_smoke():
    if not RUN_LIVE:
        _skip("QSA_BATTERY_LIVE=0")
    token = _load_token()
    if not token:
        _skip("PROMPT_AUDIT_API_TOKEN assente")
    try:
        steps, counselors = discover(token)
    except APIUnavailable as exc:
        _skip(f"API non raggiungibile: {exc}")
        return
    # smoke bounded: 1 counselor × 2 step (cognitive + affective)
    counselors = counselors[:1]
    wanted = [s for s in steps if s["id"] in ("cognitive", "affective")]
    for step in wanted:
        env = step_envelope(token, step["id"], counselors[0]["id"])
        step["mode"] = (env["resolved"].get("step") or {}).get("mode") or "factor"
    cells = [run_live_cell(token, counselors[0], s) for s in wanted]
    for c in cells:
        assert c.error is None, f"Errore live su {c.step_id}: {c.error}"
        # Solo l'inversione ad ALTA confidenza è bloccante: lo screening su fattori
        # invertiti a basso punteggio è rumore del lessico (vedi docstring).
        assert not c.inversion_high, f"Inversione (alta) errata su {c.step_id}: {c.inversion_high}"
        assert c.api_checks.get("reasoning_leak", {}).get("ok", True), f"Reasoning leak su {c.step_id}"
        assert c.api_checks.get("refusal", {}).get("ok", True), f"Refusal su {c.step_id}"


if __name__ == "__main__":
    raise SystemExit(main())
