import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';

// Public browser controls + HTTP boundary. All data is anonymous and in memory;
// external traffic is blocked and no backend/database is used.
const origin = new URL(process.env.TEACHER_ERRORS_BASE_URL || 'http://127.0.0.1:3124').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const group = { id: 91, name: 'Classe Demo', code: 'DEMO-91', school: null, school_level: null, institution_id: null, description: 'Contesto salvato', methodologies: '', context_visible_to_students: false, owner_username: 'teacher.fixture', is_active: true, members_count: 0 };
const stream = data => `data: ${JSON.stringify(data)}\n\n`;
async function fixture({ surface = 'groups', failure = 503, lang = 'it', width = 390 } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1050 } });
    await context.addInitScript(({ lang }) => {
        localStorage.setItem('cb_lang', lang);
        localStorage.setItem('cb_theme', 'light');
        localStorage.setItem('counselorbot_selected_counselor', '1');
        localStorage.setItem('cb-docenza-group-ids', '[91]');
        localStorage.setItem('counselorbot_resume', JSON.stringify({ instrument: 'OBIETTIVO_DOCENZA', experience: 'standard', sessionId: 'teacher-errors', counselorId: 1 }));
    }, { lang });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const state = { failure, saveFailure: false, groups: [group], notebook: { data: { subjects: 'Matematica salvata' } }, gets: 0, mutations: [], errors: [], hold: null, holdWrite: null,
        identity: { authenticated: true, username: 'teacher.fixture', name: 'Teacher Demo', is_admin: false, groups: ['docenti'] } };
    page.on('pageerror', error => state.errors.push(error.message));
    const target = surface === 'notebook' ? '/user/teacher-notebook' : '/admin/groups';
    await page.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        const path = url.pathname.slice(4); let data = [];
        if (path === target && request.method() === 'GET') {
            state.gets++;
            const failure = state.failure;
            const payload = structuredClone(surface === 'notebook' ? state.notebook : state.groups);
            if (state.hold) await state.hold;
            if (failure === 'network') return route.abort('failed');
            if (failure) return route.fulfill({ status: failure, json: { detail: 'PRIVATE SERVER DETAIL' } });
            return route.fulfill({ json: payload });
        }
        if (request.method() !== 'GET') {
            state.mutations.push({ path, body: request.postDataJSON(), method: request.method() });
            if (state.holdWrite) { const ready = state.holdWrite; state.holdWrite = null; await ready; }
            if (state.saveFailure) return route.fulfill({ status: 503, json: {} });
            if (path === '/chat/stream') {
                const reply = `Risposta docente: ${request.postDataJSON().message}`;
                return route.fulfill({ contentType: 'text/event-stream', body: stream({ conversation_id: 'teacher-demo' }) + stream({ display: reply }) + stream({ done: true, response: reply, conversation_id: 'teacher-demo' }) });
            }
            if (path === '/session/freeze') return route.fulfill({ json: request.postDataJSON() });
            assert.ok(path.startsWith('/admin/groups') || path === '/user/teacher-notebook', `Unexpected write: ${path}`);
            return route.fulfill({ json: {} });
        }
        if (path === '/auth/me') data = state.identity;
        else if (path === '/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/orientation/status') data = { required: false, completed: true };
        else if (path === '/counselors') data = [{ id: 1, name: 'Demo', slug: 'fixture', language: ['*'], suitable: true, is_active: true }];
        else if (path === '/user/teacher-notebook') data = state.notebook;
        else if (path === '/session/frozen/teacher-errors') data = null;
        else if (path === '/qsa/guided-ui-texts') data = { guided_steps: [{ id: 'intro', label: 'Introduzione', sort_order: 0, system_prompt_mode: 'generic' }] };
        else if (path.startsWith('/memory/') || path === '/telegram/bot-info') data = {};
        else if (path.endsWith('/recommendations')) data = { reading: [], strategy: [] };
        else if (path === '/tavolo/enabled') data = { enabled: false };
        return route.fulfill({ json: data });
    });
    const go = async () => {
        await page.goto(`${origin}${surface === 'groups' ? '/docente/classi' : surface === 'notebook' ? '/docente/taccuino' : '/?resume=1'}`, { waitUntil: 'domcontentloaded' });
        if (surface === 'chat') await page.getByRole('button', { name: 'Inizia', exact: true }).click();
    };
    const hold = () => { let release; state.hold = new Promise(resolve => { release = resolve; }); return () => { state.hold = null; release(); }; };
    const holdSave = () => { let release; state.holdWrite = new Promise(resolve => { release = resolve; }); return release; };
    return { page, context, state, go, hold, holdSave, allowReads: () => { state.hold = null; } };
}

test('groups: initial HTTP failure is an alert with retry, never empty or creatable', async () => {
    const f = await fixture();
    try {
        await f.go();
        await f.page.getByRole('heading', { name: 'Gruppi e classi che gestisco' }).waitFor();
        // Fails on S1 baseline: HTTP 503 becomes the ordinary empty-state hint.
        assert.equal(await f.page.getByText('Non gestisci ancora gruppi o classi.', { exact: false }).count(), 0);
        await f.page.getByRole('alert').filter({ hasText: 'Impossibile caricare le classi' }).waitFor();
        assert.equal(await f.page.getByRole('button', { name: 'Nuovo gruppo o classe' }).isDisabled(), true);
        const before = f.state.gets; f.state.failure = false;
        await f.page.getByRole('button', { name: 'Riprova', exact: true }).click();
        await f.page.getByRole('heading', { name: 'Classe Demo', exact: true }).waitFor();
        assert.equal(f.state.gets, before + 1);
        assert.deepEqual(f.state.mutations, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const surface of ['groups', 'notebook', 'chat']) {
    for (const failure of [503, 'network']) {
        test(`${surface}: ${failure} stays an error after failed retry; a successful retry recovers`, async () => {
            const f = await fixture({ surface, failure });
            try {
                await f.go();
                const alert = f.page.getByRole('alert').filter({ hasText: 'Impossibile caricare' });
                await alert.waitFor();
                assert.equal(await f.page.getByText(/Non gestisci ancora|Nessuna classe da gestire|Taccuino vuoto:/).count(), 0);
                const before = f.state.gets;
                const release = f.hold();
                const retry = alert.getByRole('button', { name: 'Riprova', exact: true });
                await retry.focus(); await f.page.keyboard.press('Enter');
                await f.page.getByRole('status').filter({ hasText: 'Caricamento' }).waitFor();
                assert.equal(await alert.count(), 0);
                release(); await alert.waitFor();
                assert.equal(f.state.gets, before + 1, 'one explicit attempt');
                await f.page.waitForTimeout(250);
                assert.equal(f.state.gets, before + 1, 'no automatic retry loop');
                f.state.failure = false;
                await retry.click();
                if (surface === 'notebook') await f.page.waitForFunction(() => document.querySelector('#teacher-notebook-subjects')?.value === 'Matematica salvata');
                else await f.page.getByText('Classe Demo', { exact: true }).waitFor();
                assert.equal(await alert.count(), 0);
                assert.equal(f.state.gets, before + 2);
                assert.equal(f.state.mutations.filter(m => m.path.startsWith('/admin/groups') || m.path === '/user/teacher-notebook').length, 0);
                assert.deepEqual(f.state.errors, []);
            } finally { await f.context.close(); }
        });
    }

    test(`${surface}: loading and legitimate empty success are distinct`, async () => {
        const f = await fixture({ surface, failure: false });
        f.state.groups = []; f.state.notebook = null;
        const release = f.hold();
        try {
            await f.go();
            await f.page.getByRole('status').filter({ hasText: 'Caricamento' }).waitFor();
            assert.equal(await f.page.getByText(/Non gestisci ancora|Nessuna classe da gestire|Taccuino vuoto:/).count(), 0);
            if (surface === 'notebook') assert.equal(await f.page.getByRole('button', { name: 'Salva taccuino' }).isDisabled(), true);
            release();
            await f.page.getByText(surface === 'groups' ? /Non gestisci ancora/ : surface === 'notebook' ? /Taccuino vuoto:/ : /Nessuna classe da gestire/).waitFor();
            assert.equal(await f.page.getByRole('alert').filter({ hasText: /Impossibile caricare|Operazione non riuscita|PRIVATE SERVER DETAIL/ }).count(), 0);
            if (surface === 'notebook') assert.equal(await f.page.getByRole('button', { name: 'Salva taccuino' }).isEnabled(), true);
            assert.deepEqual(f.state.errors, []);
        } finally { release(); await f.context.close(); }
    });

    for (const failure of [401, 403]) {
        test(`${surface}: ${failure} uses the access guard and hides server details`, async () => {
            const f = await fixture({ surface, failure });
            try {
                await f.go();
                await f.page.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
                assert.equal(await f.page.getByText(/Non gestisci ancora|Nessuna classe da gestire|Taccuino vuoto:|PRIVATE SERVER DETAIL/).count(), 0);
                assert.equal(await f.page.getByText('Classe Demo', { exact: true }).count(), 0);
                if (surface === 'notebook') assert.equal(await f.page.getByLabel('Discipline insegnate').count(), 0);
                if (surface === 'chat') assert.equal(await f.page.locator('#guided-composer').isEnabled(), true);
                assert.deepEqual(f.state.errors, []);
            } finally { await f.context.close(); }
        });
    }
}

test('groups: failed refresh retains class context and creation drafts; retry success keeps unsaved text', async () => {
    const f = await fixture({ failure: false, width: 1440 });
    try {
        await f.go(); await f.page.getByRole('heading', { name: 'Classe Demo', exact: true }).waitFor();
        await f.page.getByLabel('Descrizione della classe', { exact: true }).waitFor();
        const description = f.page.getByLabel('Descrizione della classe');
        await description.fill('Bozza privata della classe');
        await f.page.getByLabel('Condividi il contesto con gli studenti iscritti').check();
        await f.page.getByRole('button', { name: 'Nuovo gruppo o classe' }).click();
        const name = f.page.getByPlaceholder('Nome (es. 3B, universitari, formazione adulti)');
        await name.fill('Nuovo nome in bozza');
        f.state.failure = 'network';
        await f.page.getByRole('combobox', { name: 'Fascia', exact: true }).last().selectOption('adulti');
        await f.page.getByRole('alert').filter({ hasText: 'Impossibile caricare' }).waitFor();
        assert.equal(await f.page.getByRole('heading', { name: 'Classe Demo', exact: true }).count(), 1);
        assert.equal(await description.inputValue(), 'Bozza privata della classe');
        assert.equal(await name.inputValue(), 'Nuovo nome in bozza');
        f.state.failure = false;
        f.state.groups = [{ ...group, description: 'Nuova versione server', context_visible_to_students: false }];
        await f.page.getByRole('button', { name: 'Riprova', exact: true }).click();
        await f.page.getByRole('button', { name: 'Riprova', exact: true }).waitFor({ state: 'hidden' });
        await f.page.getByRole('status').filter({ hasText: 'Caricamento' }).waitFor({ state: 'hidden' });
        assert.equal(await description.inputValue(), 'Bozza privata della classe');
        assert.equal(await f.page.getByLabel('Condividi il contesto con gli studenti iscritti').isChecked(), true);
        assert.equal(await name.inputValue(), 'Nuovo nome in bozza');
        assert.equal(f.state.mutations.length, 1, 'only the explicit level change, no autosave');
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('groups: a successful refresh updates pristine context fields from the server', async () => {
    const f = await fixture({ failure: false });
    try {
        await f.go(); await f.page.getByRole('heading', { name: 'Classe Demo', exact: true }).waitFor();
        await f.page.getByLabel('Descrizione della classe', { exact: true }).waitFor();
        f.state.groups = [{ ...group, description: 'Contesto aggiornato sul server' }];
        const response = f.page.waitForResponse(r => r.url().endsWith('/api/admin/groups') && r.request().method() === 'GET');
        await f.page.getByRole('combobox', { name: 'Fascia', exact: true }).selectOption('adulti');
        await response; await f.page.getByRole('status').filter({ hasText: 'Caricamento' }).waitFor({ state: 'hidden' });
        assert.equal(await f.page.getByLabel('Descrizione della classe').inputValue(), 'Contesto aggiornato sul server');
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('notebook: failed refresh, successful retry and save failure all preserve the draft', async () => {
    const f = await fixture({ surface: 'notebook', failure: false, width: 1440 });
    try {
        await f.go();
        const subjects = f.page.getByLabel('Discipline insegnate');
        await f.page.waitForFunction(() => document.querySelector('#teacher-notebook-subjects')?.value === 'Matematica salvata');
        await subjects.fill('Bozza privata');
        f.state.failure = 503;
        await f.page.getByRole('button', { name: 'Aggiorna', exact: true }).click();
        await f.page.getByRole('alert').filter({ hasText: 'Impossibile caricare' }).waitFor();
        assert.equal(await subjects.inputValue(), 'Bozza privata');
        f.state.failure = false; f.state.notebook = { data: { subjects: 'Nuovo testo server' } };
        await f.page.getByRole('button', { name: 'Riprova', exact: true }).click();
        await f.page.getByRole('button', { name: 'Aggiorna', exact: true }).waitFor();
        assert.equal(await subjects.inputValue(), 'Bozza privata');
        f.state.saveFailure = true;
        await f.page.getByRole('button', { name: 'Salva taccuino' }).click();
        await f.page.getByRole('alert').filter({ hasText: 'Operazione non riuscita.' }).waitFor();
        assert.equal(await subjects.inputValue(), 'Bozza privata');
        assert.equal(f.state.mutations.length, 1);
        assert.equal(f.state.mutations[0].body.subjects, 'Bozza privata');
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('notebook: pending save prevents duplicate sends and later edits survive the response', async () => {
    const f = await fixture({ surface: 'notebook', failure: false });
    let release;
    try {
        await f.go();
        await f.page.waitForFunction(() => document.querySelector('#teacher-notebook-subjects')?.value === 'Matematica salvata');
        const subjects = f.page.getByLabel('Discipline insegnate'); await subjects.fill('Versione inviata');
        release = f.holdSave();
        const save = f.page.getByRole('button', { name: 'Salva taccuino' });
        await save.click();
        assert.equal(await save.isDisabled(), true);
        await subjects.fill('Versione successiva non salvata');
        assert.equal(f.state.mutations.length, 1);
        release(); await f.page.waitForFunction(node => !node.disabled, await save.elementHandle());
        assert.equal(await subjects.inputValue(), 'Versione successiva non salvata');
        assert.equal(await f.page.getByRole('button', { name: 'Taccuino salvato' }).count(), 0);
        assert.deepEqual(f.state.errors, []);
    } finally { release?.(); await f.context.close(); }
});

test('chat: failed refresh keeps class chips, selected ids and composer draft across retries', async () => {
    const f = await fixture({ surface: 'chat', failure: false });
    try {
        await f.go();
        const chip = f.page.getByRole('button', { name: 'Classe Demo', exact: true }); await chip.waitFor();
        await f.page.locator('#guided-composer').fill('Bozza della conversazione');
        f.state.failure = 'network';
        await f.page.getByRole('button', { name: 'Aggiorna', exact: true }).click();
        await f.page.getByRole('alert').filter({ hasText: 'Impossibile caricare' }).waitFor();
        assert.equal(await chip.getAttribute('aria-pressed'), 'true');
        assert.equal(await f.page.locator('#guided-composer').inputValue(), 'Bozza della conversazione');
        f.state.failure = false;
        await f.page.getByRole('button', { name: 'Riprova', exact: true }).click(); await f.page.getByRole('button', { name: 'Aggiorna', exact: true }).waitFor();
        assert.equal(await chip.getAttribute('aria-pressed'), 'true');
        assert.equal(await f.page.locator('#guided-composer').inputValue(), 'Bozza della conversazione');
        assert.equal(await f.page.evaluate(() => localStorage.getItem('cb-docenza-group-ids')), '[91]');
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const surface of ['groups', 'notebook', 'chat']) {
    test(`${surface}: a late response after unmount/account change cannot overwrite the new identity`, async () => {
        const f = await fixture({ surface, failure: false });
        const release = f.hold();
        try {
            await f.go();
            await f.page.getByRole('status').filter({ hasText: 'Caricamento' }).waitFor();
            if (surface === 'notebook') {
                // S16: return through the page header, then open the existing Classi entry.
                await f.page.locator('[data-teacher-area-header] a[href="/docente"]').click();
                await f.page.locator('a[aria-labelledby="teacher-link-classi"]').click();
                await f.page.getByRole('heading', { name: 'Gruppi e classi che gestisco' }).waitFor();
            } else await f.page.goto(`${origin}/guide`, { waitUntil: 'domcontentloaded' });
            f.allowReads();
            f.state.identity = { ...f.state.identity, username: 'teacher.other' };
            f.state.groups = [{ ...group, id: 92, name: 'Classe nuova identità' }];
            f.state.notebook = { data: { subjects: 'Taccuino nuova identità' } };
            await f.go();
            if (surface === 'notebook') await f.page.waitForFunction(() => document.querySelector('#teacher-notebook-subjects')?.value === 'Taccuino nuova identità');
            else await f.page.getByText('Classe nuova identità', { exact: true }).waitFor();
            release(); await f.page.waitForTimeout(200);
            assert.equal(await f.page.getByText('Classe Demo', { exact: true }).count(), 0);
            if (surface === 'notebook') assert.equal(await f.page.getByLabel('Discipline insegnate').inputValue(), 'Taccuino nuova identità');
            assert.deepEqual(f.state.errors, []);
        } finally { release(); await f.context.close(); }
    });

    test(`${surface}: a late teacher response cannot reveal data after a role downgrade`, async () => {
        const f = await fixture({ surface, failure: false });
        const release = f.hold();
        try {
            await f.go(); await f.page.getByRole('status').filter({ hasText: 'Caricamento' }).waitFor();
            if (surface === 'notebook') {
                // S16: return through the page header, then open the existing Classi entry.
                await f.page.locator('[data-teacher-area-header] a[href="/docente"]').click();
                await f.page.locator('a[aria-labelledby="teacher-link-classi"]').click();
                await f.page.getByRole('heading', { name: 'Gruppi e classi che gestisco' }).waitFor();
            } else await f.page.goto(`${origin}/guide`, { waitUntil: 'domcontentloaded' });
            f.allowReads(); f.state.identity = { ...f.state.identity, groups: ['studenti'] }; f.state.failure = 403;
            await f.go();
            await f.page.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
            release(); await f.page.waitForTimeout(200);
            assert.equal(await f.page.getByText('Classe Demo', { exact: true }).count(), 0);
            assert.equal(await f.page.getByLabel('Discipline insegnate').count(), 0);
            assert.deepEqual(f.state.errors, []);
        } finally { release(); await f.context.close(); }
    });
}

test('notebook: editing during a pending reread keeps the new draft on success', async () => {
    const f = await fixture({ surface: 'notebook', failure: false });
    let release;
    try {
        await f.go(); await f.page.waitForFunction(() => document.querySelector('#teacher-notebook-subjects')?.value === 'Matematica salvata');
        f.state.notebook = { data: { subjects: 'Versione server più recente' } };
        release = f.hold();
        await f.page.getByRole('button', { name: 'Aggiorna', exact: true }).click();
        await f.page.getByRole('status').filter({ hasText: 'Caricamento' }).waitFor();
        await f.page.getByLabel('Discipline insegnate').fill('Scritta durante la rilettura');
        release(); await f.page.getByRole('status').filter({ hasText: 'Caricamento' }).waitFor({ state: 'hidden' });
        assert.equal(await f.page.getByLabel('Discipline insegnate').inputValue(), 'Scritta durante la rilettura');
        assert.deepEqual(f.state.mutations, []); assert.deepEqual(f.state.errors, []);
    } finally { release?.(); await f.context.close(); }
});

for (const [lang, retry] of [['it', 'Riprova'], ['en', 'Try again'], ['es', 'Reintentar'], ['fr', 'Réessayer'], ['de', 'Erneut versuchen'], ['sv', 'Försök igen']]) {
    for (const surface of ['groups', 'notebook', 'chat']) {
        test(`${surface}: retry is localized and keyboard accessible in ${lang}`, async () => {
            const f = await fixture({ surface, lang });
            try {
                // The chat path-choice button is localized too; select the
                // existing primary action through its stable form container.
                if (surface === 'chat') {
                    await f.page.goto(`${origin}/?resume=1`);
                    await f.page.locator('main button.bg-indigo-600, main button.bg-teal-700').last().click();
                } else await f.go();
                const alert = f.page.getByRole('alert').filter({ has: f.page.getByRole('button', { name: retry, exact: true }) });
                await alert.waitFor();
                assert.equal(await alert.getByRole('button', { name: retry, exact: true }).isEnabled(), true);
                const before = f.state.gets; f.state.failure = false;
                await alert.getByRole('button', { name: retry, exact: true }).focus(); await f.page.keyboard.press('Enter');
                await alert.waitFor({ state: 'hidden' });
                await f.page.getByRole('status').filter({ hasText: /Caricamento|Loading|Cargando|Chargement|Laden|Laddar/ }).waitFor({ state: 'hidden' });
                assert.equal(f.state.gets, before + 1);
                assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
                assert.deepEqual(f.state.errors, []);
            } finally { await f.context.close(); }
        });
    }
}

for (const surface of ['groups', 'notebook', 'chat']) {
    test(`${surface}: a preview changed during a read hides data from the old scope`, async () => {
        const f = await fixture({ surface, failure: false });
        f.state.identity = { ...f.state.identity, is_admin: true };
        const release = f.hold();
        try {
            await f.go(); await f.page.getByRole('status').filter({ hasText: 'Caricamento' }).waitFor();
            await f.page.evaluate(() => sessionStorage.setItem('cb_view_as_user', 'ricercatore.demo'));
            release();
            await f.page.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
            assert.equal(await f.page.getByText('Classe Demo', { exact: true }).count(), 0);
            assert.equal(await f.page.getByLabel('Discipline insegnate').count(), 0);
            assert.deepEqual(f.state.errors, []);
        } finally { release(); await f.context.close(); }
    });
}

for (const [lang, message] of [['it', 'usa Riprova'], ['en', 'use Try again'], ['es', 'usa Reintentar'], ['fr', 'utilisez Réessayer'], ['de', 'wählen Sie Erneut versuchen'], ['sv', 'välj Försök igen']]) {
    test(`teacher guide explains recovery and opens the class screenshot from keyboard in ${lang}`, async () => {
        const f = await fixture({ lang });
        try {
            await f.page.goto(`${origin}/guide?audience=teacher`, { waitUntil: 'networkidle' });
            const section = f.page.locator('#guide-teacher-section-2');
            await section.getByText(message, { exact: false }).waitFor();
            const imageButton = section.locator('figure').first().getByRole('button');
            await imageButton.focus(); await f.page.keyboard.press('Enter');
            await f.page.getByRole('dialog').waitFor();
            await f.page.keyboard.press('Escape'); await f.page.getByRole('dialog').waitFor({ state: 'hidden' });
            assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.deepEqual(f.state.errors, []);
        } finally { await f.context.close(); }
    });
}

test('notebook: initial network failure cannot become an empty, savable notebook', async () => {
    const f = await fixture({ surface: 'notebook', failure: 'network' });
    try {
        await f.go(); await f.page.getByLabel('Discipline insegnate').waitFor();
        assert.equal(await f.page.getByRole('button', { name: 'Salva taccuino' }).isDisabled(), true);
        await f.page.getByRole('alert').filter({ hasText: 'Impossibile caricare il taccuino del docente' }).waitFor();
        assert.equal(await f.page.getByText('Taccuino vuoto:', { exact: false }).count(), 0);
        const before = f.state.gets; f.state.failure = false;
        await f.page.getByRole('button', { name: 'Riprova', exact: true }).click();
        await f.page.getByRole('button', { name: 'Salva taccuino' }).waitFor();
        await f.page.waitForFunction(() => document.querySelector('#teacher-notebook-subjects')?.value === 'Matematica salvata');
        assert.equal(f.state.gets, before + 1);
        assert.equal(await f.page.getByRole('button', { name: 'Salva taccuino' }).isEnabled(), true);
        assert.deepEqual(f.state.mutations, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('chat: failed class selector keeps the selection and the conversation usable', async () => {
    const f = await fixture({ surface: 'chat' });
    try {
        await f.go(); await f.page.locator('#guided-composer').waitFor();
        assert.equal(await f.page.getByText('Nessuna classe da gestire:', { exact: false }).count(), 0);
        await f.page.getByRole('alert').filter({ hasText: 'Impossibile caricare le classi' }).waitFor();
        assert.equal(await f.page.locator('#guided-composer').isEnabled(), true);
        await f.page.locator('#guided-composer').fill('Una proposta per la mia classe');
        await f.page.locator('#guided-composer').press('Enter');
        await f.page.getByRole('log').getByText('Risposta docente: Una proposta per la mia classe', { exact: true }).waitFor();
        assert.deepEqual(f.state.mutations.filter(m => m.path === '/chat/stream').at(-1).body.group_ids, [91]);
        const before = f.state.gets; f.state.failure = false;
        await f.page.getByRole('button', { name: 'Riprova', exact: true }).click();
        await f.page.getByRole('button', { name: 'Classe Demo', exact: true }).waitFor();
        assert.equal(await f.page.getByRole('button', { name: 'Classe Demo', exact: true }).getAttribute('aria-pressed'), 'true');
        assert.equal(f.state.gets, before + 1);
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});
