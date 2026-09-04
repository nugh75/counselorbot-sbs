"""Storico append-only dei prompt: chi ha scritto cosa, e come tornare indietro.

I prompt vivi stanno nel DB (`configs`, `guided_steps`, `counselors`) e sono
modificabili dal pannello admin. Finora pero' nessuno teneva traccia delle
modifiche: non c'era rollback, e le migrazioni d'avvio dovevano indovinare se
una riga fosse ancora quella di fabbrica cercando frasi dentro al testo.

Qui la domanda "chi ha scritto questo prompt?" diventa una lettura di `origin`.
Una riga con `origin="admin"` e' personalizzata e nessuna migrazione la tocca:
e' cosi' che i prompt restano editabili dall'admin qualunque sia la sorgente da
cui sono nati.
"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from . import models

# Dove vive il prompt.
SCOPE_CONFIG = "config"
SCOPE_GUIDED_STEP = "guided_step"
SCOPE_COUNSELOR_PERSONA = "counselor_persona"

SCOPES = (SCOPE_CONFIG, SCOPE_GUIDED_STEP, SCOPE_COUNSELOR_PERSONA)

# Chi ha scritto il prompt.
ORIGIN_SEED = "seed"            # default di fabbrica, primo inserimento
ORIGIN_MIGRATION = "migration"  # riscrittura automatica all'avvio
ORIGIN_ADMIN = "admin"          # modifica dal pannello

ORIGINS = (ORIGIN_SEED, ORIGIN_MIGRATION, ORIGIN_ADMIN)


def is_versioned_config_key(key: str) -> bool:
    """True per le chiavi di `configs` che contengono testo di prompt.

    `configs` ospita anche impostazioni operative (provider attivo, flag PII,
    nomi di modello): versionarle riempirebbe la storia di rumore. Le chiavi
    dichiarate nei registri di `prompt_config` sono l'elenco autorevole; le
    varianti per lingua (`text_ztpi_conclusion__en`) seguono la chiave base.
    """
    from .prompt_config import ALL_CONFIG_TEXT_DEFINITIONS

    known = {item["key"] for item in ALL_CONFIG_TEXT_DEFINITIONS}
    return key in known or key.split("__", 1)[0] in known


def latest(db: Session, scope: str, target_key: str) -> Optional[models.PromptRevision]:
    """Ultima revisione registrata per quel prompt, o None se non ne ha."""
    return (
        db.query(models.PromptRevision)
        .filter(
            models.PromptRevision.scope == scope,
            models.PromptRevision.target_key == target_key,
        )
        .order_by(models.PromptRevision.id.desc())
        .first()
    )


def record(
    db: Session,
    scope: str,
    target_key: str,
    value: Optional[str],
    origin: str,
    author: Optional[str] = None,
    note: Optional[str] = None,
) -> bool:
    """Appende una revisione. Non committa: lo fa il chiamante.

    Se il testo coincide con l'ultima revisione non appende nulla, altrimenti
    ogni riavvio riscriverebbe la stessa riga all'infinito.
    """
    text = value or ""
    previous = latest(db, scope, target_key)
    if previous is not None and previous.value == text:
        return False

    db.add(
        models.PromptRevision(
            scope=scope,
            target_key=target_key,
            value=text,
            origin=origin,
            author=author,
            note=note,
        )
    )
    return True


def is_admin_owned(db: Session, scope: str, target_key: str) -> bool:
    """True se l'ultima parola su questo prompt e' di un admin.

    Le migrazioni d'avvio la interrogano prima di riscrivere: un testo
    personalizzato resta com'e', anche quando il default di fabbrica cambia.
    """
    current = latest(db, scope, target_key)
    return current is not None and current.origin == ORIGIN_ADMIN


def history(
    db: Session,
    scope: Optional[str] = None,
    target_key: Optional[str] = None,
    limit: int = 50,
) -> List[models.PromptRevision]:
    """Revisioni piu' recenti, filtrabili per prompt."""
    query = db.query(models.PromptRevision)
    if scope:
        query = query.filter(models.PromptRevision.scope == scope)
    if target_key:
        query = query.filter(models.PromptRevision.target_key == target_key)
    return query.order_by(models.PromptRevision.id.desc()).limit(limit).all()


def live_value(db: Session, scope: str, target_key: str) -> Optional[str]:
    """Testo attualmente servito per quel prompt, o None se la riga non esiste."""
    if scope == SCOPE_CONFIG:
        row = db.query(models.Config).filter(models.Config.key == target_key).first()
        return None if row is None else (row.value or "")
    if scope == SCOPE_GUIDED_STEP:
        row = db.query(models.GuidedStep).filter(models.GuidedStep.id == target_key).first()
        return None if row is None else (row.prompt or "")
    if scope == SCOPE_COUNSELOR_PERSONA:
        row = db.query(models.Counselor).filter(models.Counselor.id == int(target_key)).first()
        return None if row is None else (row.persona or "")
    raise ValueError(f"scope sconosciuto: {scope}")


def write_live(db: Session, scope: str, target_key: str, value: str) -> bool:
    """Scrive il testo nella riga viva. False se la riga non esiste piu'."""
    if scope == SCOPE_CONFIG:
        row = db.query(models.Config).filter(models.Config.key == target_key).first()
        if row is None:
            return False
        row.value = value
    elif scope == SCOPE_GUIDED_STEP:
        row = db.query(models.GuidedStep).filter(models.GuidedStep.id == target_key).first()
        if row is None:
            return False
        row.prompt = value
    elif scope == SCOPE_COUNSELOR_PERSONA:
        row = db.query(models.Counselor).filter(models.Counselor.id == int(target_key)).first()
        if row is None:
            return False
        row.persona = value
    else:
        raise ValueError(f"scope sconosciuto: {scope}")
    return True


def restore(db: Session, revision: models.PromptRevision, author: Optional[str] = None) -> bool:
    """Riporta la riga viva al testo di una revisione passata.

    Il ripristino e' esso stesso una modifica admin: viene appeso in coda alla
    storia invece di riaprirla, cosi' la tabella resta append-only e il prompt
    ripristinato risulta di proprieta' dell'admin (le migrazioni lo lasceranno
    stare).
    """
    scope, target_key = revision.scope, revision.target_key
    if not write_live(db, scope, target_key, revision.value):
        return False

    record(
        db,
        scope,
        target_key,
        revision.value,
        ORIGIN_ADMIN,
        author=author,
        note=f"ripristino della revisione #{revision.id}",
    )
    return True


def _factory_defaults() -> dict:
    """Testo di fabbrica di ogni prompt, per (scope, target_key).

    Le persone dei counselor non compaiono: i loro default stanno nei seed di
    `main`, che importa questo modulo. Restano comunque protette, perche' la
    protezione guarda `origin`, non il default.
    """
    from . import prompt_config

    defaults = {
        (SCOPE_CONFIG, item["key"]): item["default"]
        for item in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS
    }
    step_lists = (
        prompt_config.DEFAULT_GUIDED_STEPS,
        prompt_config.DEFAULT_QSAR_GUIDED_STEPS,
        prompt_config.DEFAULT_ZTPI_GUIDED_STEPS,
        prompt_config.DEFAULT_SAVICKAS_GUIDED_STEPS,
        prompt_config.DEFAULT_IDEA_GUIDED_STEPS,
        prompt_config.DEFAULT_QPCS_GUIDED_STEPS,
        prompt_config.DEFAULT_QPCC_GUIDED_STEPS,
        prompt_config.DEFAULT_QAP_GUIDED_STEPS,
    )
    for steps in step_lists:
        for step in steps:
            defaults[(SCOPE_GUIDED_STEP, step["id"])] = step.get("prompt", "")
    return defaults


def live_prompt_rows(db: Session) -> List[tuple]:
    """Ogni prompt vivo come `(scope, target_key, testo)`."""
    rows: List[tuple] = []
    for cfg in db.query(models.Config).all():
        if is_versioned_config_key(cfg.key):
            rows.append((SCOPE_CONFIG, cfg.key, cfg.value or ""))
    for step in db.query(models.GuidedStep).all():
        rows.append((SCOPE_GUIDED_STEP, step.id, step.prompt or ""))
    for counselor in db.query(models.Counselor).all():
        rows.append((SCOPE_COUNSELOR_PERSONA, str(counselor.id), counselor.persona or ""))
    return rows


def _latest_by_target(db: Session) -> dict:
    """Ultima revisione di ogni prompt, indicizzata per `(scope, target_key)`."""
    newest = {}
    for revision in db.query(models.PromptRevision).order_by(models.PromptRevision.id.asc()).all():
        newest[(revision.scope, revision.target_key)] = revision
    return newest


def snapshot_admin_owned(db: Session) -> List[tuple]:
    """Fotografa i prompt personalizzati prima delle migrazioni d'avvio."""
    newest = _latest_by_target(db)
    owned = []
    for (scope, target_key), revision in newest.items():
        if revision.origin != ORIGIN_ADMIN:
            continue
        current = live_value(db, scope, target_key)
        if current is not None:
            owned.append((scope, target_key, current))
    return owned


def restore_admin_owned(db: Session, snapshot: List[tuple]) -> List[str]:
    """Rimette il testo dell'admin dove le migrazioni l'hanno cambiato.

    Non committa. Restituisce i prompt ripristinati, per il log d'avvio.
    """
    reverted = []
    for scope, target_key, value in snapshot:
        if live_value(db, scope, target_key) == value:
            continue
        if write_live(db, scope, target_key, value):
            reverted.append(f"{scope}:{target_key}")
    return reverted


def reconcile(db: Session) -> int:
    """Allinea lo storico allo stato vivo dei prompt. Non committa.

    Alla prima esecuzione la tabella e' vuota e questa passata fa da baseline:
    un prompt gia' diverso dal default di fabbrica viene marcato come
    personalizzato, cosi' le migrazioni successive lo rispettano senza doverlo
    riconoscere cercando frasi nel testo. Dalle volte successive registra le
    riscritture automatiche, che altrimenti non lascerebbero traccia.
    """
    first_run = db.query(models.PromptRevision.id).first() is None
    defaults = _factory_defaults() if first_run else {}
    recorded = 0

    for scope, target_key, value in live_prompt_rows(db):
        previous = latest(db, scope, target_key)
        if previous is not None and previous.value == value:
            continue

        if first_run:
            default = defaults.get((scope, target_key))
            # A live prompt without a factory entry (notably a counselor persona)
            # predates this revision system. Treat it as user-owned: guessing that
            # it is a seed would make the first migration free to overwrite it.
            customised = default is None or value.strip() != default.strip()
            origin = ORIGIN_ADMIN if customised else ORIGIN_SEED
            note = "personalizzazione preesistente" if customised else "default di fabbrica"
        elif previous is None:
            origin, note = ORIGIN_SEED, "primo seed"
        else:
            origin, note = ORIGIN_MIGRATION, "riscrittura all'avvio"

        if record(db, scope, target_key, value, origin, note=note):
            recorded += 1

    return recorded
