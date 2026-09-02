// Dove si compila un questionario. La regola era ripetuta in due file con la
// stessa tabella di URL copiata, e assente dove serviva davvero: in Bussola e
// nella schermata di inserimento dei punteggi, cioe' i due punti in cui allo
// studente vengono chiesti numeri che non ha ancora.
//
// In italiano i sei questionari si compilano su competenzestrategiche.it e qui
// si lavora sui risultati; nelle altre cinque lingue si compilano dentro
// CounselorBot. SAVICKAS, IDEA e gli eventi non sono questionari: non hanno
// nulla da compilare prima, e per loro non esiste sorgente.
//
// La tabella qui sotto e' anche l'elenco degli strumenti che hanno qualcosa da
// compilare: chi non c'e' non ha sorgente, in nessuna lingua. Se si aggiunge un
// questionario con punteggi va aggiunto qui — e nella lista di CONTEXT.md,
// "Adding an instrument". Il modulo non importa nulla di proposito, cosi' resta
// eseguibile da `node --test` (vedi questionnaire-sources.test.ts) e lo stesso
// elenco vive anche in backend/orientation.py, per il prompt della Bussola.

export const STRATEGIC_COMPETENCES_URLS: Record<string, string> = {
    QSA: 'https://www.competenzestrategiche.it/QSA/',
    QSAr: 'https://www.competenzestrategiche.it/QSAr/',
    QPCS: 'https://www.competenzestrategiche.it/QPCS/',
    QPCC: 'https://www.competenzestrategiche.it/QPCC/',
    ZTPI: 'https://www.competenzestrategiche.it/ZTPI/',
    QAP: 'https://www.competenzestrategiche.it/QAP/',
};

// Credenziali del sito esterno: valgono solo per il ramo italiano.
export const STRATEGIC_COMPETENCES_CODE = '1087';
export const STRATEGIC_COMPETENCES_PASSWORD = 'counselor';

export type QuestionnaireSource =
    | { kind: 'external'; href: string; code: string; password: string }
    | { kind: 'in-app'; href: string }
    | null;

/**
 * Dove mandare lo studente per compilare `id` nella lingua `lang`.
 * `null` quando non c'e' nulla da compilare: strumenti condotti dall'agente
 * (SAVICKAS, IDEA, eventi) o id fuori catalogo.
 */
export function questionnaireSource(id: string, lang: string): QuestionnaireSource {
    const external = STRATEGIC_COMPETENCES_URLS[id];
    if (!external) return null;

    if (lang === 'it') {
        return {
            kind: 'external',
            href: external,
            code: STRATEGIC_COMPETENCES_CODE,
            password: STRATEGIC_COMPETENCES_PASSWORD,
        };
    }

    return { kind: 'in-app', href: `/somministrazione/${id}/${lang}` };
}
