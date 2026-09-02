// Bozze di compilazione: quel che una persona ha già scritto non si perde
// perché una pagina si ricarica o un componente si smonta. Due superfici, due
// chiavi, lo stesso schema di `pqbl-progress.ts` — per browser, non fra
// dispositivi, che è ciò che fanno invece le sessioni congelate.
//
// ── Somministrazione ────────────────────────────────────────────────────────
// Le risposte vivevano in un solo `useState`: un ricaricamento, una scheda
// chiusa per sbaglio o una batteria scarica a metà QSA cancellavano cento item.
// Era l'unica superficie lunga senza rete, mentre la chat guidata si congela da
// sola dopo ogni turno e pQBL tiene il proprio avanzamento.
//
// Il consenso non si ripristina mai: è un gesto, non un dato. Ritrovare la
// casella già spuntata farebbe passare per acconsentito qualcosa che in questa
// sessione nessuno ha spuntato.

const STORAGE_KEY = 'counselorbot_administration_draft_v1';

export interface AdministrationDraftMetadata {
    age_range: string;
    gender: string;
    education_context: string;
    participation_context: string;
    recruitment_source: string;
    study: string;
}

export interface AdministrationDraft {
    instrument: string;
    locale: string;
    answers: Record<number, number>;
    metadata: AdministrationDraftMetadata;
    savedAt: string;
}

function browserStorage(): Storage | null {
    return typeof window === 'undefined' ? null : window.localStorage;
}

// Una bozza vale solo per lo strumento e la lingua in cui è stata scritta: gli
// item sono numerati per strumento, e riversarli su un altro darebbe risposte
// a domande mai lette.
export function loadAdministrationDraft(
    instrument: string,
    locale: string,
    storage: Storage | null = browserStorage(),
): AdministrationDraft | null {
    if (!storage) return null;
    let draft: AdministrationDraft | null = null;
    try {
        const raw = storage.getItem(STORAGE_KEY);
        draft = raw ? JSON.parse(raw) as AdministrationDraft : null;
    } catch {
        return null;
    }
    if (!draft || draft.instrument !== instrument || draft.locale !== locale) return null;
    if (!draft.answers || Object.keys(draft.answers).length === 0) return null;
    return draft;
}

export function saveAdministrationDraft(
    draft: AdministrationDraft,
    storage: Storage | null = browserStorage(),
): void {
    if (!storage) return;
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
        // Storage pieno o non disponibile: la compilazione in corso funziona lo stesso.
    }
}

export function clearAdministrationDraft(storage: Storage | null = browserStorage()): void {
    try {
        storage?.removeItem(STORAGE_KEY);
    } catch {
        // Niente da fare se lo storage non è disponibile.
    }
}

// ── Punteggi inseriti a mano ────────────────────────────────────────────────
// Stesso problema, un gradino più in basso: i venticinque campi del modulo dei
// punteggi vivevano solo dentro react-hook-form, quindi si perdevano non solo
// al ricaricamento ma anche tornando indietro di un passo, perché il
// componente si smonta. Sono numeri copiati da un PDF: ridigitarli è lavoro.

const SCORE_STORAGE_KEY = 'counselorbot_score_draft_v1';

export interface ScoreDraft {
    instrument: string;
    scores: Record<string, number>;
    savedAt: string;
}

export function loadScoreDraft(
    instrument: string,
    storage: Storage | null = browserStorage(),
): ScoreDraft | null {
    if (!storage) return null;
    let draft: ScoreDraft | null = null;
    try {
        const raw = storage.getItem(SCORE_STORAGE_KEY);
        draft = raw ? JSON.parse(raw) as ScoreDraft : null;
    } catch {
        return null;
    }
    if (!draft || draft.instrument !== instrument) return null;
    if (!draft.scores || Object.keys(draft.scores).length === 0) return null;
    return draft;
}

export function saveScoreDraft(
    draft: ScoreDraft,
    storage: Storage | null = browserStorage(),
): void {
    if (!storage) return;
    try {
        storage.setItem(SCORE_STORAGE_KEY, JSON.stringify(draft));
    } catch {
        // Come sopra: senza storage il modulo funziona, solo non si ricorda.
    }
}

export function clearScoreDraft(storage: Storage | null = browserStorage()): void {
    try {
        storage?.removeItem(SCORE_STORAGE_KEY);
    } catch {
        // Niente da fare se lo storage non è disponibile.
    }
}
