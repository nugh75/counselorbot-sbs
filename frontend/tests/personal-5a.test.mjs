import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// Lotto 5A (audit Area personale): lista assegnazioni con filtri e un solo
// dettaglio aperto (F27), pianificazione spiegata (F28), anteprima con
// destinatario e copia statica (F29), Telegram a passi con scadenza e verifica
// al ritorno (F32), collegamenti contestuali fra Classi, Assegnazioni e
// messaggi del docente (F30).
const origin = process.env.PERSONAL_5A_BASE_URL || 'http://127.0.0.1:3108';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { browser?.close(); });

const identity = { authenticated: true, username: 'student-5a', name: 'Studente 5A', is_admin: false, groups: ['studenti'] };

const assignmentRows = [
    { id: 1, intent: 'proposal', due_date: null, author_name: 'Prof. Rinaldi', group_name: 'Classe 3B', source_kind: 'goal', instructions: 'Leggi con attenzione', created_at: '2026-09-20T09:00:00Z', revoked_at: null, progress: { planned: true, shared: false, feedback_available: false }, snapshot: { title: 'Obiettivo condiviso', description: 'Descrizione lunga della prima assegnazione', details: '', content_warning: '', where_to_find: '', source_reference: '' } },
    { id: 2, intent: 'requested', due_date: '2026-10-15', response_prompt: 'Racconta come è andata', author_name: 'Prof. Rinaldi', group_name: 'Classe 3B', source_kind: 'strategy', instructions: '', created_at: '2026-09-21T09:00:00Z', revoked_at: null, progress: { planned: true, shared: true, feedback_available: true }, snapshot: { title: 'Strategia con riscontro', description: 'Descrizione lunga della seconda', details: '', content_warning: '', where_to_find: '', source_reference: '' } },
    { id: 3, intent: 'proposal', due_date: null, author_name: 'Prof. Moretti', group_name: 'Gruppo studio', source_kind: 'reading', instructions: '', created_at: '2026-09-22T09:00:00Z', revoked_at: null, progress: { planned: false, shared: false, feedback_available: false }, snapshot: { title: 'Film da vedere', description: 'Descrizione lunga della terza', details: '', content_warning: '', where_to_find: '', source_reference: '' } },
];

async function fixture(width, handlers, me = identity) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); localStorage.setItem('cb_theme', 'light'); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        const path = url.pathname.slice(4);
        const handler = handlers[path];
        if (handler) return handler(route, path, url);
        let data = [];
        if (path === '/auth/me') data = me;
        else if (path === '/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/orientation/status') data = { required: false, completed: true };
        else if (path === '/tavolo/enabled') data = { enabled: false };
        else if (path === '/orientation-directory') data = { institution: null, events: [], referrals: [] };
        return route.fulfill({ json: data });
    });
    return { page, context, errors };
}

const card = (page, id) => page.locator(`#assignment-${id}`);

test('assignment list: filters keep one detail open and localize dates', async () => {
    const { page, context, errors } = await fixture(390, {
        '/user/assignments': route => route.fulfill({ json: assignmentRows }),
        '/user/assignments/1/work': route => route.fulfill({ json: { revision: 1, workspace_revision: 1, planned: true, action: { id: 'a1', title: 'Prova', stage: 'todo', reflection: '' }, event: null, linked_goals: [], submission: null, submitted_at: null, feedback: '', feedback_at: null } }),
        '/user/goals': route => route.fulfill({ json: [] }),
        '/user/portfolio': route => route.fulfill({ json: [] }),
    });
    try {
        await page.goto(`${origin}/profilo/assegnazioni`);
        await page.getByRole('heading', { name: 'Obiettivo condiviso', exact: true }).waitFor();
        // Lista breve: le descrizioni lunghe restano chiuse.
        assert.equal(await page.getByText('Descrizione lunga della prima assegnazione').count(), 0);
        // Dettaglio singolo: aprire il secondo chiude il primo.
        await card(page, 1).getByRole('button', { name: 'Dettagli', exact: true }).click();
        await card(page, 1).getByText('Descrizione lunga della prima assegnazione').waitFor();
        await card(page, 2).getByRole('button', { name: 'Dettagli', exact: true }).click();
        await card(page, 2).getByText('Descrizione lunga della seconda').waitFor();
        assert.equal(await page.getByText('Descrizione lunga della prima assegnazione').count(), 0);

        // F27: Filtro finalità (intent: proposta vs richiesta con restituzione).
        await page.getByLabel('Tipo di assegnazione', { exact: true }).selectOption('requested');
        assert.equal(await card(page, 1).count(), 0);
        assert.equal(await card(page, 2).count(), 1);
        assert.equal(await card(page, 3).count(), 0);
        await page.getByLabel('Tipo di assegnazione', { exact: true }).selectOption('proposal');
        assert.equal(await card(page, 1).count(), 1);
        assert.equal(await card(page, 2).count(), 0);
        assert.equal(await card(page, 3).count(), 1);
        await page.getByLabel('Tipo di assegnazione', { exact: true }).selectOption('');

        // F27: Filtro stato (nuova/pianificata/condivisa/con riscontro).
        await page.getByLabel('Stato', { exact: true }).selectOption('new');
        assert.equal(await card(page, 1).count(), 0);
        assert.equal(await card(page, 2).count(), 0);
        assert.equal(await card(page, 3).count(), 1);
        await page.getByLabel('Stato', { exact: true }).selectOption('planned');
        assert.equal(await card(page, 1).count(), 1);
        assert.equal(await card(page, 2).count(), 0);
        assert.equal(await card(page, 3).count(), 0);
        await page.getByLabel('Stato', { exact: true }).selectOption('shared');
        assert.equal(await card(page, 1).count(), 0);
        assert.equal(await card(page, 2).count(), 1);
        assert.equal(await card(page, 3).count(), 0);
        await page.getByLabel('Stato', { exact: true }).selectOption('feedback');
        assert.equal(await card(page, 1).count(), 0);
        assert.equal(await card(page, 2).count(), 1);
        assert.equal(await card(page, 3).count(), 0);
        await page.getByLabel('Stato', { exact: true }).selectOption('');

        // Filtro gruppo: solo le assegnazioni del gruppo scelto.
        await page.getByLabel('Gruppo', { exact: true }).selectOption({ label: 'Gruppo studio' });
        assert.equal(await card(page, 2).count(), 0);
        assert.equal(await card(page, 3).count(), 1);
        // Il collegamento dal gruppo preimposta il filtro.
        await page.goto(`${origin}/profilo/assegnazioni?group=${encodeURIComponent('Classe 3B')}`);
        await page.getByLabel('Gruppo', { exact: true }).waitFor();
        assert.equal(await page.getByLabel('Gruppo', { exact: true }).inputValue(), 'Classe 3B');
        // Date localizzate: niente ISO grezze nel testo.
        await page.getByText('15/10/2026').waitFor();
        assert.equal(await page.getByText('2026-10-15').count(), 0);

        // F29: l'anteprima della restituzione mostra esplicitamente il destinatario (autore assegnazione).
        await card(page, 1).getByRole('button', { name: 'Dettagli', exact: true }).click();
        await card(page, 1).getByRole('button', { name: 'Lavora su questa assegnazione', exact: true }).click();
        await card(page, 1).getByText('Restituzione al docente').click();
        await card(page, 1).getByText('Destinatario: Prof. Rinaldi', { exact: true }).waitFor();

        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('telegram: distinct states, steps with expiry and verify on return', async () => {
    // Il 503 resta finché il Riprova non incontra dati validi; il link ha esito
    // positivo solo dopo la verifica esplicita (doppio mount in dev incluso).
    let recovered = false;
    let verified = false;
    const { page, context, errors } = await fixture(390, {
        '/telegram/bot-info': route => route.fulfill({ json: { bot_username: 'CounselorBotDemoBot' } }),
        '/telegram/link-status': route => {
            if (!recovered) return route.fulfill({ status: 503, body: '{}' });
            return route.fulfill({ json: { linked: verified, telegram_username: verified ? 'demo' : null, linked_at: verified ? '2026-09-26T10:00:00Z' : null } });
        },
        '/telegram/link-code': route => route.fulfill({ json: { code: 'ABC234', expires_in_minutes: 10 } }),
    });
    try {
        await page.goto(`${origin}/profilo/telegram`);
        // F03: un 503 sullo stato è un errore con Riprova, non «non collegato».
        await page.getByRole('alert').filter({ hasText: 'Impossibile verificare lo stato di Telegram' }).waitFor();
        recovered = true;
        await page.getByRole('button', { name: 'Riprova', exact: true }).click();
        await page.getByText('Telegram non collegato', { exact: true }).waitFor();
        // Passi espliciti: Apri il bot → Conferma nel bot → Verifica qui.
        await page.getByRole('listitem').filter({ hasText: 'Apri il bot su Telegram' }).first().waitFor();
        await page.getByRole('listitem').filter({ hasText: 'Conferma il collegamento nel bot' }).first().waitFor();
        await page.getByRole('listitem').filter({ hasText: 'Torna qui e verifica il collegamento' }).first().waitFor();
        // Codice con scadenza esplicita nel riquadro.
        await page.getByRole('button', { name: 'Genera codice', exact: true }).click();
        await page.getByText('/link ABC234', { exact: false }).waitFor();
        await page.getByText('Il codice resta valido per 10 minuti.', { exact: true }).waitFor();
        verified = true;
        await page.getByRole('button', { name: 'Verifica il collegamento', exact: true }).click();
        await page.getByText('Telegram collegato (@demo)', { exact: true }).waitFor();
        // Il ritorno dal bot (tab di nuovo visibile) riverifica lo stato.
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.getByText('Telegram collegato (@demo)', { exact: true }).waitFor();
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('classes page links to its assignments and shows teacher messages', async () => {
    const { page, context, errors } = await fixture(390, {
        '/user/groups': route => route.fulfill({ json: [{ membership_id: 7, group_id: 3, code: 'GR-3A', name: 'Classe 3A', joined_via: 'web', joined_at: '2026-09-01T00:00:00Z' }] }),
        '/user/teacher-notes': route => route.fulfill({ json: [{ id: 1, author_username: 'prof.rinaldi', kind: 'message', text: 'Benvenuti nella classe.', created_at: '2026-09-25T08:00:00Z' }] }),
    });
    try {
        await page.goto(`${origin}/profilo/classi`);
        // F30: dalla classe alle assegnazioni con il filtro già impostato.
        const link = page.getByRole('link', { name: 'Assegnazioni — Classe 3A', exact: true });
        await link.waitFor();
        assert.equal(await link.getAttribute('href'), `/profilo/assegnazioni?group=${encodeURIComponent('Classe 3A')}`);
        // F30: i messaggi generali del docente sono leggibili nella pagina Classi.
        await page.getByText('Benvenuti nella classe.').first().waitFor();
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('teacher list: assignments are always expanded with recipients and submissions', async () => {
    const teacherRows = assignmentRows.map(row => ({ ...row, recipient_username: null, recipient_count: 4 }));
    const { page, context, errors } = await fixture(390, {
        '/teacher/assignments': route => route.fulfill({ json: teacherRows }),
    }, { ...identity, username: 'teacher-5a', name: 'Docente 5A', groups: ['docenti'] });
    try {
        await page.goto(`${origin}/docente/assegnazioni`);
        const sent = page.getByRole('region', { name: 'Assegnazioni effettuate', exact: true });
        await sent.getByRole('heading', { name: 'Obiettivo condiviso', exact: true }).waitFor();
        // Docente sempre espanso: destinatari e descrizioni subito visibili senza click o bottoni dettagli.
        for (const id of [1, 2, 3]) {
            await card(page, id).getByText('Destinatari: Intero gruppo o classe (4)', { exact: true }).waitFor();
        }
        await card(page, 1).getByText('Descrizione lunga della prima assegnazione').waitFor();
        assert.equal(await sent.getByRole('button', { name: 'Dettagli' }).count(), 0);
        assert.equal(await sent.getByRole('button', { name: 'Apri tutti' }).count(), 0);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
