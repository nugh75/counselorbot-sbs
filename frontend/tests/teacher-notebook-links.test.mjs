import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.TEACHER_ERRORS_BASE_URL || 'http://127.0.0.1:3124').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function fixture({ groups = ['docenti'], admin = false, lang = 'it', width = 390, denied = false, legacy = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(({ lang, legacy }) => {
        localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light');
        if (legacy) Object.defineProperty(window, 'navigation', { value: undefined });
    }, { lang, legacy });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const state = { data: { subjects: 'Materia demo' }, writes: [], dialogs: [], accept: false, failure: false, hold: null, errors: [] };
    page.on('pageerror', error => state.errors.push(error.message));
    page.on('dialog', async dialog => { state.dialogs.push(dialog.message()); await (state.accept ? dialog.accept() : dialog.dismiss()); });
    await context.route('**/*', async route => {
        const req = route.request(); const url = new URL(req.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return req.method() === 'GET' ? route.continue() : route.abort();
        if (req.method() !== 'GET') {
            state.writes.push({ path: url.pathname, body: req.postDataJSON() });
            if (state.hold) await state.hold;
            if (state.failure) return route.fulfill({ status: 503, json: {} });
            if (url.pathname === '/api/user/teacher-notebook') state.data = req.postDataJSON();
            return route.fulfill({ json: {} });
        }
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, username: 'teacher.fixture', groups, is_admin: admin };
        else if (url.pathname === '/api/user/teacher-notebook') data = { data: state.data };
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true };
        else if (url.pathname === '/api/user/account-preferences') data = { setup_completed: true, counselor_ready: true, notebook_ready: true };
        else if (url.pathname === '/api/telegram/bot-info') data = {};
        else if (url.pathname === '/api/user/timeline') data = { revision: 0, workspace: { actions: [], timeline: { title: '', events: [] } } };
        else if (url.pathname === '/api/orientation-directory') data = { institution: null, events: [], referrals: [] };
        if (denied && url.pathname === '/api/admin/groups') return route.fulfill({ status: 403, json: {} });
        return route.fulfill({ json: data });
    });
    await page.goto(`${origin}/docente/taccuino`, { waitUntil: 'networkidle' });
    const field = page.locator('#teacher-notebook-subjects');
    if (groups.includes('studenti') && groups.length === 1 && !admin) await page.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
    else await page.waitForFunction(() => document.querySelector('#teacher-notebook-subjects')?.value === 'Materia demo');
    return { context, page, state, field, notebook: page.locator('[data-teacher-notebook]') };
}

test('dedicated page header exit protects dirty text and focus before navigation', async () => {
    const f = await fixture();
    try {
        await f.field.fill('Bozza riservata'); await f.field.focus();
        await f.field.evaluate(e => e.setSelectionRange(2, 8));
        await f.page.locator('[data-teacher-area-header] a[href="/docente"]').evaluate(e => e.click());
        assert.equal(f.state.dialogs.length, 1, 'dirty exit asks to discard');
        assert.equal(new URL(f.page.url()).pathname, '/docente/taccuino');
        assert.equal(await f.field.inputValue(), 'Bozza riservata');
        assert.deepEqual(await f.field.evaluate(e => [e === document.activeElement, e.selectionStart, e.selectionEnd]), [true, 2, 8]);
        assert.deepEqual(f.state.writes, []);
    } finally { await f.context.close(); }
});

// S14 Classi opens a popup (covered by teacher-class-picker). The other three
// keep every previous navigation, payload, focus and draft-guard assertion.
const destinations = [
    ['Per la mia crescita: Obiettivi personali', '/profilo/obiettivi', 'Obiettivi'],
    ['Per una tappa: Linea del tempo', '/profilo/timeline', 'Linea del tempo'],
    ['Per un lavoro: Portfolio', '/profilo/portfolio', 'Portfolio'],
];
for (const [role, options] of [
    ['teacher', {}], ['dual role', { groups: ['docenti', 'studenti'] }],
    ['researcher', { groups: ['ricercatori'] }], ['admin', { groups: [], admin: true }],
]) {
    test(`${role}: three unchanged named destinations navigate without transferring or creating data; clean return`, async () => {
        const f = await fixture(options);
        try {
            assert.deepEqual(await f.notebook.locator('a').evaluateAll(links => links.map(l => l.getAttribute('href'))), destinations.map(d => d[1]));
            const preferences = await f.page.evaluate(() => JSON.stringify(localStorage));
            for (const [name, path, heading] of destinations) {
                const link = f.notebook.getByRole('link', { name, exact: true });
                await link.focus(); await f.page.keyboard.press('Enter');
                await f.page.waitForURL(`${origin}${path}`);
                await f.page.getByRole('heading', { name: heading, exact: true }).first().waitFor();
                assert.equal(new URL(f.page.url()).search, '');
                assert.equal(new URL(f.page.url()).hash, '');
                await f.page.goBack({ waitUntil: 'networkidle' });
                await f.page.waitForFunction(() => document.querySelector('#teacher-notebook-subjects')?.value === 'Materia demo');
                assert.equal(await f.field.inputValue(), 'Materia demo');
            }
            assert.deepEqual(f.state.dialogs, []);
            assert.deepEqual(f.state.writes, []);
            assert.equal(await f.page.evaluate(() => JSON.stringify(localStorage)), preferences);
            assert.deepEqual(f.state.errors, []);
        } finally { await f.context.close(); }
    });
}

test('explicit discard navigates; dirty text is neither saved nor added to URL', async () => {
    const f = await fixture();
    try {
        await f.field.fill('Testo riservato & classe=privata'); f.state.accept = true;
        await f.notebook.getByRole('link', { name: destinations[0][0], exact: true }).click();
        await f.page.waitForURL(`${origin}/profilo/obiettivi`);
        assert.equal(f.state.dialogs.length, 1); assert.deepEqual(f.state.writes, []);
        await f.page.goBack({ waitUntil: 'networkidle' });
        await f.page.waitForFunction(() => document.querySelector('#teacher-notebook-subjects')?.value === 'Materia demo');
        assert.equal(await f.field.inputValue(), 'Materia demo');
    } finally { await f.context.close(); }
});

test('reverting to saved values is clean and needs no discard dialog', async () => {
    const f = await fixture();
    try {
        await f.field.fill('Cambio'); await f.field.fill('Materia demo');
        await f.notebook.getByRole('link', { name: destinations[0][0], exact: true }).click();
        await f.page.waitForURL(`${origin}/profilo/obiettivi`);
        assert.deepEqual(f.state.dialogs, []); assert.deepEqual(f.state.writes, []);
    } finally { await f.context.close(); }
});

for (const failure of [false, true]) {
    test(`save in flight blocks exits and double submits; ${failure ? 'failure preserves guard' : 'success updates baseline'}`, async () => {
        const f = await fixture(); let release;
        try {
            await f.field.fill('  Bozza demo  '); f.state.failure = failure;
            f.state.hold = new Promise(resolve => { release = resolve; });
            const save = f.notebook.getByRole('button', { name: 'Salva taccuino', exact: true });
            await save.click();
            await f.notebook.getByRole('status').filter({ hasText: 'Salvataggio in corso' }).waitFor();
            await save.evaluate(e => e.click());
            await f.notebook.getByRole('link', { name: destinations[0][0], exact: true }).click();
            assert.equal(new URL(f.page.url()).pathname, '/docente/taccuino');
            assert.equal(await f.field.inputValue(), '  Bozza demo  ');
            assert.deepEqual(f.state.dialogs, []); assert.equal(f.state.writes.length, 1);
            release(); f.state.hold = null;
            if (failure) {
                await f.notebook.getByRole('alert').waitFor();
                await f.notebook.getByRole('link', { name: destinations[0][0], exact: true }).click();
                assert.equal(f.state.dialogs.length, 1); assert.equal(await f.field.inputValue(), '  Bozza demo  ');
            } else {
                await f.notebook.getByRole('button', { name: 'Taccuino salvato', exact: true }).waitFor();
                assert.equal(await f.field.inputValue(), 'Bozza demo');
                await f.notebook.getByRole('link', { name: destinations[0][0], exact: true }).click();
                await f.page.waitForURL(`${origin}/profilo/obiettivi`);
                assert.deepEqual(f.state.dialogs, []);
                await f.page.goBack({ waitUntil: 'networkidle' });
                await f.page.waitForFunction(() => document.querySelector('#teacher-notebook-subjects')?.value === 'Bozza demo');
                assert.equal(await f.field.inputValue(), 'Bozza demo');
            }
            assert.deepEqual(f.state.writes, [{ path: '/api/user/teacher-notebook', body: { subjects: 'Bozza demo', experience: null, methodologies: null, classes_overview: null, formation_interests: null, notes: null } }]);
        } finally { release?.(); await f.context.close(); }
    });
}

test('edits made during save survive success and stay guarded until restored to that save', async () => {
    const f = await fixture(); let release;
    try {
        await f.field.fill('Versione inviata');
        f.state.hold = new Promise(resolve => { release = resolve; });
        await f.notebook.getByRole('button', { name: 'Salva taccuino', exact: true }).click();
        await f.notebook.getByRole('status').filter({ hasText: 'Salvataggio in corso' }).waitFor();
        await f.field.fill('Versione successiva'); release(); f.state.hold = null;
        await f.notebook.getByRole('button', { name: 'Salva taccuino', exact: true }).waitFor({ state: 'visible' });
        await f.page.waitForFunction(() => !document.querySelector('button.bg-indigo-600:disabled'));
        await f.notebook.getByRole('link', { name: destinations[0][0], exact: true }).click();
        assert.equal(f.state.dialogs.length, 1); assert.equal(await f.field.inputValue(), 'Versione successiva');
        await f.field.fill('Versione inviata');
        await f.notebook.getByRole('link', { name: destinations[0][0], exact: true }).click();
        await f.page.waitForURL(`${origin}/profilo/obiettivi`);
        assert.equal(f.state.dialogs.length, 1); assert.equal(f.state.writes.length, 1);
    } finally { release?.(); await f.context.close(); }
});

test('modifier click and a new-tab link retain the source draft without confirmation', async () => {
    const f = await fixture();
    try {
        await f.field.fill('Bozza del tab origine');
        const link = f.notebook.getByRole('link', { name: destinations[0][0], exact: true });
        for (const modifier of [true, false]) {
            await f.field.focus();
            if (!modifier) await link.evaluate(e => { e.target = '_blank'; });
            const opened = f.context.waitForEvent('page');
            await link.click(modifier ? { modifiers: ['Control'] } : {});
            const other = await opened; await other.waitForURL(`${origin}/profilo/obiettivi`);
            assert.equal(new URL(other.url()).pathname, '/profilo/obiettivi');
            assert.equal(await f.field.inputValue(), 'Bozza del tab origine');
            assert.equal(new URL(f.page.url()).pathname, '/docente/taccuino');
            await other.close();
        }
        assert.deepEqual(f.state.dialogs, []); assert.deepEqual(f.state.writes, []);
        await link.evaluate(e => { e.target = ''; });
        await link.focus(); await f.page.keyboard.press('Enter');
        assert.equal(f.state.dialogs.length, 1);
        assert.equal(await link.evaluate(e => e === document.activeElement), true, 'new-tab pointer state must not change a later keyboard cancellation');
    } finally { await f.context.close(); }
});

for (const legacy of [false, true]) {
    test(`${legacy ? 'fallback history' : 'navigation API'}: Back cancel preserves page and selection, discard permits return`, async () => {
        const f = await fixture({ legacy });
        try {
            await f.page.goto(`${origin}/docente/classi`, { waitUntil: 'networkidle' });
            await f.page.goto(`${origin}/docente/taccuino`, { waitUntil: 'networkidle' });
            await f.field.fill('Bozza indietro'); await f.field.focus();
            await f.field.evaluate(e => e.setSelectionRange(1, 5));
            await f.page.evaluate(() => history.back());
            await f.page.waitForFunction(() => location.pathname === '/docente/taccuino');
            assert.equal(f.state.dialogs.length, 1);
            assert.deepEqual(await f.field.evaluate(e => [e.value, e === document.activeElement, e.selectionStart, e.selectionEnd]), ['Bozza indietro', true, 1, 5]);
            f.state.accept = true; await f.page.evaluate(() => history.back());
            await f.page.waitForURL(`${origin}/docente/classi`);
            assert.equal(f.state.dialogs.length, 2); assert.deepEqual(f.state.writes, []);
        } finally { await f.context.close(); }
    });
}

for (const [lang, phrase, group] of [
    ['it', 'rimandi volontari a Gruppi e classi', 'La mia crescita e altre informazioni'], ['en', 'optional links open Groups and classes', 'My development and other information'],
    ['es', 'enlaces voluntarios a Grupos y clases', 'Mi desarrollo y otra información'], ['fr', 'des liens facultatifs ouvrent Groupes et classes', 'Mon développement et autres informations'],
    ['de', 'freiwillige Links zu Gruppen und Klassen', 'Meine Entwicklung und weitere Angaben'], ['sv', 'frivilliga länkar till Grupper och klasser', 'Min utveckling och övrig information'],
]) {
    test(`${lang}: public teacher guide explains the voluntary links and draft protection`, async () => {
        const f = await fixture({ lang });
        try {
            await f.page.goto(`${origin}/guide?audience=teacher`, { waitUntil: 'networkidle' });
            const teacherGuide = await f.page.locator('#guide-teacher-section-1').innerText();
            assert.ok(teacherGuide.includes(phrase));
            assert.ok(teacherGuide.includes(group));
            assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
        } finally { await f.context.close(); }
    });
}

test('S14 Classi popup 403 keeps its existing guard; student has no notebook links', async () => {
    const f = await fixture({ denied: true });
    try {
        await f.notebook.getByRole('button', { name: 'Gestisci gruppi e classi', exact: true }).click();
        await f.page.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
        assert.equal(await f.page.getByRole('button', { name: 'Nuovo gruppo', exact: true }).count(), 0);
        assert.deepEqual(f.state.writes, []);
    } finally { await f.context.close(); }
    const student = await fixture({ groups: ['studenti'] });
    try { assert.equal(await student.page.locator('textarea[id^="teacher-notebook-"]').count(), 0); }
    finally { await student.context.close(); }
});

for (const legacy of [false, true]) {
    test(`${legacy ? 'fallback history' : 'navigation API'}: pending save protects Back and clean/reverted draft removes the close guard`, async () => {
        const f = await fixture({ legacy }); let release;
        try {
            await f.page.goto(`${origin}/docente/classi`, { waitUntil: 'networkidle' });
            await f.page.goto(`${origin}/docente/taccuino`, { waitUntil: 'networkidle' });
            await f.page.waitForFunction(() => document.querySelector('#teacher-notebook-subjects')?.value === 'Materia demo');
            const closeGuard = () => f.page.evaluate(() => {
                const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
            });
            assert.equal(await closeGuard(), false);
            await f.field.fill('Versione inviata'); assert.equal(await closeGuard(), true);
            f.state.hold = new Promise(resolve => { release = resolve; });
            await f.notebook.getByRole('button', { name: 'Salva taccuino', exact: true }).click();
            await f.notebook.getByRole('status').filter({ hasText: 'Salvataggio in corso' }).waitFor();
            await f.page.evaluate(() => history.back());
            await f.page.waitForFunction(() => location.pathname === '/docente/taccuino');
            assert.equal(await f.field.inputValue(), 'Versione inviata');
            // Cross-document Back may need the browser's native beforeunload
            // warning (empty message); dismissing it retains the pending save.
            assert.ok(f.state.dialogs.every(message => message === ''));
            f.state.dialogs.length = 0;
            release(); f.state.hold = null;
            await f.notebook.getByRole('button', { name: 'Taccuino salvato', exact: true }).waitFor();
            assert.equal(await closeGuard(), false);
            await f.field.fill('Cambio'); await f.field.fill('Versione inviata');
            assert.equal(await closeGuard(), false);
            await f.notebook.getByRole('link', { name: destinations[0][0], exact: true }).click();
            await f.page.waitForURL(`${origin}/profilo/obiettivi`);
            assert.deepEqual(f.state.dialogs, []);
        } finally { release?.(); await f.context.close(); }
    });
}

test('mouse cancellation restores textbox focus and selection; keyboard cancellation keeps link focus', async () => {
    const f = await fixture();
    try {
        await f.field.fill('Bozza riservata'); await f.field.focus();
        await f.field.evaluate(e => e.setSelectionRange(2, 8));
        const link = f.notebook.getByRole('link', { name: destinations[0][0], exact: true });
        await link.click();
        assert.equal(f.state.dialogs.length, 1);
        assert.deepEqual(await f.field.evaluate(e => [e === document.activeElement, e.selectionStart, e.selectionEnd]), [true, 2, 8]);
        await link.focus(); await f.page.keyboard.press('Enter');
        assert.equal(f.state.dialogs.length, 2);
        assert.equal(await link.evaluate(e => e === document.activeElement), true);
        assert.equal(await f.field.inputValue(), 'Bozza riservata');
    } finally { await f.context.close(); }
});

for (const dirty of [false, true]) {
    test(`open groups preserve ${dirty ? 'dirty' : 'clean'} draft, focus and selection through language and resource rerenders`, async () => {
        const f = await fixture({ width: 320 });
        try {
            const text = dirty ? 'Bozza di ruolo demo' : 'Materia demo';
            if (dirty) await f.field.fill(text);
            await f.field.focus();
            await f.field.evaluate(e => e.setSelectionRange(2, 7));
            const headings = [
                ['en', 'My role'], ['es', 'Mi rol'], ['fr', 'Mon rôle'],
                ['de', 'Meine Rolle'], ['sv', 'Min roll'], ['it', 'Il mio ruolo'],
            ];
            for (const [lang, name] of headings) {
                // A language preference changed in another tab uses the public storage event.
                await f.page.evaluate(lang => {
                    localStorage.setItem('cb_lang', lang);
                    window.dispatchEvent(new StorageEvent('storage', { key: 'cb_lang', newValue: lang }));
                }, lang);
                await f.notebook.getByRole('group', { name, exact: true }).waitFor();
                assert.equal(await f.field.inputValue(), text);
                assert.deepEqual(await f.field.evaluate(e => [e === document.activeElement, e.selectionStart, e.selectionEnd]), [true, 2, 7]);
                assert.equal(await f.notebook.getByRole('group').count(), 3);
            }
            const reread = f.page.waitForResponse(r => new URL(r.url()).pathname === '/api/user/teacher-notebook');
            await f.notebook.getByRole('button', { name: 'Aggiorna', exact: true }).evaluate(e => e.click());
            await reread;
            await f.notebook.getByRole('button', { name: 'Aggiorna', exact: true }).waitFor();
            await f.page.waitForFunction(() => !document.querySelector('button:disabled'));
            assert.equal(await f.field.inputValue(), text);
            assert.deepEqual(await f.field.evaluate(e => [e === document.activeElement, e.selectionStart, e.selectionEnd]), [true, 2, 7]);
            const link = f.notebook.getByRole('link', { name: destinations[0][0], exact: true });
            await link.click();
            if (dirty) {
                assert.equal(f.state.dialogs.length, 1);
                assert.equal(new URL(f.page.url()).pathname, '/docente/taccuino');
                assert.deepEqual(await f.field.evaluate(e => [e === document.activeElement, e.selectionStart, e.selectionEnd]), [true, 2, 7]);
            } else {
                await f.page.waitForURL(`${origin}/profilo/obiettivi`);
                assert.deepEqual(f.state.dialogs, []);
            }
            assert.deepEqual(f.state.writes, []);
            assert.deepEqual(f.state.errors, []);
        } finally { await f.context.close(); }
    });
}
