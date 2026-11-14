import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { classPickerText } from '../src/lib/i18n-class-picker.ts';
import { classGroupTexts } from '../src/components/teacher/class-group-texts.ts';
import { notebookLinkText } from '../src/lib/teacher-notebook-links.ts';

const origin = new URL(process.env.TEACHER_PICKER_BASE_URL || 'http://127.0.0.1:3134').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const demo = { id: 91, name: 'Classe Demo', code: 'GR-DEMO91', school: 'Ente Demo', school_level: null, institution_id: null, description: 'Contesto salvato', methodologies: 'Laboratorio', context_visible_to_students: false, owner_username: 'teacher.fixture', is_active: true, members_count: 2 };
async function fixture({ lang = 'it', width = 390, scale = 1, roles = ['docenti'], admin = false, legacy = false, readFailure = 0, empty = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, deviceScaleFactor: scale });
    await context.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
    if (legacy) await context.addInitScript(() => Object.defineProperty(window, 'navigation', { value: undefined }));
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const state = { rows: empty ? [] : [structuredClone(demo), { ...demo, id: 92, name: 'Gruppo condiviso', owner_username: 'other.fixture', description: 'Secondo contesto' }], writes: [], reads: [], errors: [], readFailure, failure: 0, roles, admin, holdWrite: null, holdRead: null, holdInstitutions: null, institutionsFailure: 0, confirms: [], accept: false };
    page.on('pageerror', error => state.errors.push(error.message));
    page.on('dialog', async dialog => { state.confirms.push(dialog.message()); await (state.accept ? dialog.accept() : dialog.dismiss()); });
    await context.route('**/*', async route => {
        const req = route.request(); const url = new URL(req.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) {
            if (url.pathname === '/_next/image' && url.searchParams.get('url') === '/images/cards/eventi.png') return route.fulfill({ contentType: 'image/png', body: readFileSync('public/images/cards/eventi.png') });
            return req.method() === 'GET' ? route.continue() : route.abort();
        }
        if (req.method() !== 'GET') {
            const body = req.postDataJSON(); state.writes.push({ path: url.pathname, method: req.method(), body });
            assert.match(url.pathname, /^\/api\/admin\/groups\/\d+$/); assert.equal(req.method(), 'PUT');
            const failure = state.failure;
            if (state.holdWrite) await state.holdWrite;
            if (failure) return route.fulfill({ status: failure, json: { detail: 'PRIVATE DETAIL' } });
            const id = Number(url.pathname.split('/').at(-1));
            state.rows = state.rows.map(row => row.id === id ? { ...row, ...body } : row);
            return route.fulfill({ json: state.rows.find(row => row.id === id) ?? {} });
        }
        state.reads.push(url.pathname); let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, username: 'teacher.fixture', groups: state.roles, is_admin: state.admin };
        else if (url.pathname === '/api/user/teacher-notebook') data = { data: { subjects: 'Materia demo' } };
        else if (url.pathname === '/api/admin/groups') {
            const failure = state.readFailure; const snapshot = structuredClone(state.rows);
            if (state.holdRead) await state.holdRead;
            if (failure) return route.fulfill({ status: failure, json: { detail: 'PRIVATE DETAIL' } });
            data = snapshot;
        }
        else if (url.pathname === '/api/teacher/institutions') {
            if (state.holdInstitutions) await state.holdInstitutions;
            if (state.institutionsFailure) return route.fulfill({ status: state.institutionsFailure, json: {} });
            data = [{ id: 5, name: 'Istituto Demo' }];
        }
        else if (url.pathname === '/api/user/account-preferences') data = { setup_completed: true, counselor_ready: true, notebook_ready: true };
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true };
        else if (url.pathname === '/api/telegram/bot-info') data = {};
        return route.fulfill({ json: data });
    });
    await page.goto(`${origin}/docente/taccuino`, { waitUntil: 'networkidle' });
    const opener = page.getByRole('button', { name: notebookLinkText(lang, 'classes'), exact: true });
    const popup = page.getByRole('dialog', { name: classPickerText(lang, 'title'), exact: true });
    const selector = popup.getByLabel(classPickerText(lang, 'label'), { exact: true });
    const description = popup.getByLabel(classGroupTexts[lang].descriptionLabel, { exact: true });
    const save = popup.locator('[id^="class-picker-save-"]');
    const cancel = popup.getByRole('button', { name: classGroupTexts[lang].cancel, exact: true });
    const hold = kind => { let release; state[kind] = new Promise(resolve => { release = resolve; }); return () => { state[kind] = null; release(); }; };
    const open = async () => { await opener.click(); await popup.waitFor(); };
    const select = async (id = '91') => { await selector.selectOption(id); await description.waitFor(); };
    const confirm = page.getByRole('dialog', { name: classPickerText(lang, 'discardTitle'), exact: true });
    return { context, page, state, opener, popup, selector, description, save, cancel, hold, open, select, confirm };
}

test('opening/selection/closing preserve private notebook DOM, values, selection and storage without writes', async () => {
    const f = await fixture();
    try {
        const notebook = f.page.locator('#teacher-notebook-subjects');
        await notebook.fill('Bozza privata & class=segreta'); await notebook.focus();
        await notebook.evaluate(e => { e.setSelectionRange(2, 8); window.notebookNode = e; });
        const storage = await f.page.evaluate(() => JSON.stringify(localStorage));
        await f.open(); assert.equal(await f.selector.inputValue(), ''); assert.equal(await f.description.count(), 0);
        await f.select(); await f.selector.selectOption('92');
        assert.equal(await f.description.inputValue(), 'Secondo contesto');
        await f.cancel.click(); await f.popup.waitFor({ state: 'hidden' });
        assert.equal(await notebook.inputValue(), 'Bozza privata & class=segreta');
        assert.deepEqual(await notebook.evaluate(e => [e === window.notebookNode, e.selectionStart, e.selectionEnd]), [true, 2, 8]);
        assert.equal(await f.opener.evaluate(e => e === document.activeElement), true);
        await f.open(); assert.equal(await f.selector.inputValue(), ''); await f.page.keyboard.press('Escape');
        await f.popup.waitFor({ state: 'hidden' });
        assert.equal(await f.page.evaluate(() => JSON.stringify(localStorage)), storage);
        assert.equal(new URL(f.page.url()).pathname, '/docente/taccuino'); assert.equal(new URL(f.page.url()).search, '');
        assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.confirms, []); assert.deepEqual(f.state.errors, []);
        assert.equal(await f.page.locator('[data-teacher-area-header] a[href="/docente"]').count(), 1, 'return to teacher home remains');
    } finally { await f.context.close(); }
});

for (const action of ['select', 'cancel', 'X', 'Escape', 'backdrop']) test(`${action}: dirty guard keeps class/text/focus/selection, then discards only on explicit confirmation`, async () => {
    const f = await fixture({ width: 900 });
    try {
        await f.open(); await f.select(); await f.description.fill('Contesto in bozza'); await f.description.focus();
        await f.description.evaluate(e => e.setSelectionRange(2, 7));
        const trigger = async () => {
            if (action === 'select') await f.selector.selectOption('92');
            else if (action === 'cancel') await f.cancel.click();
            else if (action === 'X') await f.popup.getByRole('button', { name: 'Chiudi', exact: true }).click();
            else if (action === 'Escape') await f.page.keyboard.press('Escape');
            else await f.page.mouse.click(1, 1);
        };
        await trigger(); await f.confirm.waitFor();
        assert.equal(await f.selector.inputValue(), '91'); assert.equal(await f.description.inputValue(), 'Contesto in bozza');
        await f.confirm.getByRole('button', { name: 'Continua a modificare', exact: true }).click();
        assert.equal(await f.description.inputValue(), 'Contesto in bozza');
        assert.deepEqual(await f.description.evaluate(e => [e === document.activeElement, e.selectionStart, e.selectionEnd]), [true, 2, 7]);
        await trigger(); await f.confirm.getByRole('button', { name: 'Scarta modifiche e prosegui', exact: true }).click();
        if (action === 'select') {
            assert.equal(await f.description.inputValue(), 'Secondo contesto'); await f.selector.selectOption('91');
            assert.equal(await f.description.inputValue(), 'Contesto salvato');
        } else await f.popup.waitFor({ state: 'hidden' });
        assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('exact class-only context payload; immediate selects survive Cancel; success baseline and other class stay independent', async () => {
    const f = await fixture();
    try {
        await f.open(); await f.select();
        for (const [label, value] of [['Fascia', 'adulti'], ['Istituto', '5']]) {
            const read = f.page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/groups' && r.request().method() === 'GET');
            await f.popup.getByLabel(label, { exact: true }).selectOption(value); await read;
            await f.page.waitForFunction(() => !document.querySelector('[id^="class-picker-save-"]')?.disabled);
        }
        await f.description.fill('  Classe salvata  '); await f.popup.getByLabel('Metodologie con questa classe', { exact: true }).fill('  Progetti  ');
        await f.popup.getByRole('checkbox').check(); await f.save.click();
        await f.popup.getByRole('status').filter({ hasText: 'Salvato' }).waitFor();
        assert.equal(await f.description.inputValue(), 'Classe salvata');
        await f.selector.selectOption('92'); assert.equal(await f.description.inputValue(), 'Secondo contesto');
        await f.selector.selectOption('91'); await f.description.fill('Solo bozza'); await f.cancel.click();
        await f.confirm.getByRole('button', { name: 'Scarta modifiche e prosegui', exact: true }).click();
        await f.open(); await f.select();
        assert.equal(await f.description.inputValue(), 'Classe salvata');
        assert.equal(await f.popup.getByLabel('Fascia', { exact: true }).inputValue(), 'adulti');
        assert.equal(await f.popup.getByLabel('Istituto', { exact: true }).inputValue(), '5');
        assert.deepEqual(f.state.writes, [
            { path: '/api/admin/groups/91', method: 'PUT', body: { school_level: 'adulti' } },
            { path: '/api/admin/groups/91', method: 'PUT', body: { institution_id: 5 } },
            { path: '/api/admin/groups/91', method: 'PUT', body: { description: 'Classe salvata', methodologies: 'Progetti', context_visible_to_students: true } },
        ]);
        assert.ok((await f.popup.innerText()).includes('già salvati restano tali'));
        assert.equal(await f.popup.getByRole('textbox').count(), 2, 'name and school are read-only');
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const operation of ['context', 'level', 'institution']) test(`${operation} in-flight blocks every exit/selection and duplicate PUT; newer context survives response`, async () => {
    const f = await fixture(); let release;
    try {
        await f.open(); await f.select(); await f.description.fill('Versione inviata'); release = f.hold('holdWrite');
        if (operation === 'context') await f.save.click();
        else await f.popup.getByLabel(operation === 'level' ? 'Fascia' : 'Istituto', { exact: true }).selectOption(operation === 'level' ? 'universita' : '5');
        await f.popup.getByRole('status').filter({ hasText: 'Salvataggio in corso' }).waitFor();
        assert.equal(await f.selector.isDisabled(), true); assert.equal(await f.cancel.isDisabled(), true);
        await f.save.evaluate(e => e.click()); await f.cancel.evaluate(e => e.click());
        await f.popup.getByRole('button', { name: 'Chiudi', exact: true }).evaluate(e => e.click());
        await f.page.keyboard.press('Escape'); await f.page.mouse.click(1, 1);
        assert.equal(await f.popup.isVisible(), true); assert.equal(await f.confirm.count(), 0); assert.equal(f.state.writes.length, 1);
        await f.description.fill('Versione successiva'); release();
        await f.page.waitForFunction(() => !document.querySelector('[id^="class-picker-save-"]')?.disabled);
        assert.equal(await f.description.inputValue(), 'Versione successiva');
        await f.cancel.click(); await f.confirm.waitFor(); await f.page.keyboard.press('Escape');
        await f.confirm.waitFor({ state: 'hidden' }); assert.equal(await f.description.inputValue(), 'Versione successiva');
        if (operation === 'context') {
            await f.description.fill('Versione inviata'); await f.cancel.click(); await f.popup.waitFor({ state: 'hidden' });
        }
        assert.deepEqual(f.state.errors, []);
    } finally { release?.(); await f.context.close(); }
});

test('failure retains text and protection; retry uses the latest draft, reversion removes dirty guard', async () => {
    const f = await fixture();
    try {
        await f.open(); await f.select(); await f.description.fill('Invio fallito'); f.state.failure = 503; await f.save.click();
        await f.popup.getByRole('alert').waitFor(); assert.equal(await f.description.inputValue(), 'Invio fallito');
        assert.ok(!(await f.popup.innerText()).includes('PRIVATE DETAIL'));
        await f.selector.selectOption('92'); await f.confirm.waitFor(); await f.confirm.getByRole('button', { name: 'Continua a modificare' }).click();
        await f.description.fill('Nuova versione'); f.state.failure = 0;
        await f.popup.getByRole('button', { name: 'Riprova salvataggio', exact: true }).click();
        await f.popup.getByRole('status').filter({ hasText: 'Salvato' }).waitFor();
        assert.equal(f.state.writes[1].body.description, 'Nuova versione');
        await f.description.fill('Un cambio'); await f.description.fill('Nuova versione'); await f.selector.selectOption('92');
        assert.equal(await f.confirm.count(), 0); assert.equal(await f.description.inputValue(), 'Secondo contesto');
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const failure of [401, 403]) test(`${failure} read is access denied, never empty or selectable; PUT denial hides drafts`, async () => {
    const f = await fixture({ readFailure: failure });
    try {
        await f.open(); await f.popup.getByRole('alert').waitFor();
        assert.equal(await f.selector.isDisabled(), true); assert.equal(await f.selector.locator('option').count(), 1);
        assert.equal(await f.description.count(), 0); assert.ok(!(await f.popup.innerText()).includes('PRIVATE DETAIL'));
        await f.cancel.click(); f.state.readFailure = 0; await f.open(); await f.select();
        await f.description.fill('Dato riservato'); f.state.failure = failure; await f.save.click();
        await f.popup.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
        assert.equal(await f.description.count(), 0); assert.equal(await f.selector.locator('option').count(), 1);
    } finally { await f.context.close(); }
});

test('loading, real empty and recoverable list/institution errors are separate; no unauthorized preselection', async () => {
    const f = await fixture({ empty: true }); let release;
    try {
        release = f.hold('holdRead'); await f.open(); await f.popup.getByRole('status').waitFor();
        assert.equal(await f.selector.isDisabled(), true); release();
        await f.popup.getByText(classGroupTexts.it.empty, { exact: true }).waitFor(); await f.cancel.click();
        f.state.rows = [demo]; f.state.readFailure = 503; await f.open();
        await f.popup.getByRole('alert').waitFor(); assert.equal(await f.description.count(), 0);
        f.state.readFailure = 0; await f.popup.getByRole('button', { name: 'Riprova', exact: true }).click();
        await f.select(); assert.equal(await f.selector.locator('option').count(), 2); await f.cancel.click();
        f.state.institutionsFailure = 503; await f.open(); await f.select();
        await f.popup.getByRole('alert').waitFor(); assert.equal(await f.save.isDisabled(), true);
        f.state.institutionsFailure = 0; await f.popup.getByRole('button', { name: 'Riprova', exact: true }).click();
        await f.page.waitForFunction(() => !document.querySelector('[id^="class-picker-save-"]')?.disabled);
        assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { release?.(); await f.context.close(); }
});

for (const [name, options] of [['teacher', {}], ['dual role', { roles: ['docenti', 'studenti'] }], ['researcher', { roles: ['ricercatori'] }], ['admin', { roles: [], admin: true }]]) test(`${name}: visible owned/shared classes only and independent class/notebook drafts`, async () => {
    const f = await fixture(options);
    try {
        const notebook = f.page.locator('#teacher-notebook-notes'); await notebook.fill('Nota personale');
        await f.open(); await f.select('92'); await f.description.fill('Bozza condivisa'); await f.save.click();
        await f.popup.getByRole('status').filter({ hasText: 'Salvato' }).waitFor(); await f.cancel.click();
        assert.equal(await notebook.inputValue(), 'Nota personale'); assert.equal(f.state.writes[0].path, '/api/admin/groups/92');
        assert.deepEqual(f.state.reads.filter(p => /students|shares|assignments|notebook-context/.test(p)), []);
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('student gate excludes notebook and popup', async () => {
    const f = await fixture({ roles: ['studenti'] });
    try { assert.equal(await f.opener.count(), 0); assert.equal(await f.popup.count(), 0); assert.ok(!f.state.reads.includes('/api/admin/groups')); }
    finally { await f.context.close(); }
});

test('preview identity drift during PUT rejects late response; reopening cannot expose old class draft', async () => {
    const f = await fixture(); let release;
    try {
        await f.open(); await f.select(); await f.description.fill('Vecchia identità'); release = f.hold('holdWrite'); await f.save.click();
        await f.popup.getByRole('status').waitFor();
        await f.page.evaluate(() => sessionStorage.setItem('cb_view_as_user', 'studente.demo')); release();
        await f.popup.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor();
        assert.equal(await f.description.count(), 0); assert.equal(await f.selector.locator('option').count(), 1);
    } finally { release?.(); await f.context.close(); }
});

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) for (const scale of [1, 2, 4]) test(`${lang}: labels, focus trap/restore and no overflow at ${scale === 1 ? '320px' : `${scale * 100}% zoom equivalent`}`, async () => {
    const f = await fixture({ lang, width: scale === 2 ? 640 : 320, scale });
    try {
        await f.opener.focus(); await f.page.keyboard.press('Enter'); await f.popup.waitFor(); await f.select();
        assert.equal(await f.popup.getByRole('textbox').count(), 2); assert.equal(await f.popup.getByRole('checkbox').count(), 1);
        const overflow = await f.popup.evaluate(e => ({ scroll: e.scrollWidth, width: e.clientWidth, page: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(overflow.scroll <= overflow.width + 1); assert.ok(overflow.page <= overflow.viewport + 1);
        await f.cancel.focus(); await f.page.keyboard.press('Tab');
        assert.equal(await f.popup.evaluate(e => e.contains(document.activeElement)), true);
        await f.page.keyboard.press('Shift+Tab'); assert.equal(await f.cancel.evaluate(e => e === document.activeElement), true);
        await f.page.keyboard.press('Escape'); await f.popup.waitFor({ state: 'hidden' });
        assert.equal(await f.opener.evaluate(e => e === document.activeElement), true);
        assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const operation of ['level', 'institution']) test(`${operation} failure is retryable without modifying a different group`, async () => {
    const f = await fixture();
    try {
        await f.open(); await f.select(); f.state.failure = 503;
        await f.popup.getByLabel(operation === 'level' ? 'Fascia' : 'Istituto', { exact: true }).selectOption(operation === 'level' ? 'adulti' : '5');
        await f.popup.getByRole('alert').waitFor();
        assert.equal(await f.description.inputValue(), 'Contesto salvato'); f.state.failure = 0;
        await f.popup.getByRole('button', { name: 'Riprova salvataggio', exact: true }).click();
        await f.page.waitForFunction(() => !document.querySelector('[id^="class-picker-save-"]')?.disabled);
        assert.deepEqual(f.state.writes[0], f.state.writes[1]); await f.selector.selectOption('92');
        assert.equal(await f.description.inputValue(), 'Secondo contesto');
        assert.equal(await f.popup.getByLabel(operation === 'level' ? 'Fascia' : 'Istituto', { exact: true }).inputValue(), '');
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('late GET after closing/reopening cannot expose another popup instance or account cache', async () => {
    const f = await fixture(); let release;
    try {
        release = f.hold('holdRead'); await f.open(); await f.popup.getByRole('status').waitFor();
        await f.cancel.click(); f.state.rows = [{ ...demo, id: 93, name: 'Nuova classe', description: 'Nuovo contesto' }];
        const old = release; f.state.holdRead = null; await f.open(); await f.select('93'); old();
        assert.equal(await f.selector.locator('option').count(), 2); assert.equal(await f.description.inputValue(), 'Nuovo contesto');
        assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { release?.(); await f.context.close(); }
});

test('role change through the existing reload clears private popup state and excludes student access', async () => {
    const f = await fixture();
    try {
        await f.open(); await f.select(); await f.description.fill('Bozza vecchio ruolo');
        f.state.roles = ['studenti']; f.state.rows = []; f.state.accept = true;
        await f.page.reload({ waitUntil: 'networkidle' });
        assert.equal(await f.opener.count(), 0); assert.equal(await f.popup.count(), 0);
        f.state.roles = ['docenti']; f.state.rows = [demo]; await f.page.reload({ waitUntil: 'networkidle' });
        await f.open(); await f.select(); assert.equal(await f.description.inputValue(), 'Contesto salvato');
        assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const legacy of [false, true]) test(`${legacy ? 'legacy history' : 'navigation API'}: dirty class protects Back/unload; in-flight PUT blocks Back`, async () => {
    const f = await fixture(); let release;
    try {
        if (legacy) await f.page.addInitScript(() => Object.defineProperty(window, 'navigation', { value: undefined }));
        await f.page.goto(`${origin}/docente/classi`, { waitUntil: 'networkidle' });
        await f.page.goto(`${origin}/docente/taccuino`, { waitUntil: 'networkidle' });
        await f.open(); await f.select(); await f.description.fill('Bozza da conservare');
        const unload = () => f.page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
        assert.equal(await unload(), true); await f.description.focus(); await f.description.evaluate(e => e.setSelectionRange(1, 4));
        await f.page.evaluate(() => history.back());
        await f.page.waitForFunction(() => document.querySelector('[id^="class-picker-desc-"]')?.value === 'Bozza da conservare');
        assert.deepEqual(await f.description.evaluate(e => [e === document.activeElement, e.selectionStart, e.selectionEnd]), [true, 1, 4]);
        release = f.hold('holdWrite'); await f.save.click(); await f.popup.getByRole('status').waitFor();
        await f.page.evaluate(() => history.back()); assert.equal(await f.popup.isVisible(), true);
        release(); await f.popup.getByRole('status').filter({ hasText: 'Salvato' }).waitFor();
        assert.equal(await unload(), false); assert.deepEqual(f.state.errors, []);
    } finally { release?.(); await f.context.close(); }
});

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) test(`${lang}: public guide shows and enlarges the anonymous popup screenshot`, async () => {
    const f = await fixture({ lang, width: 320 });
    try {
        await f.page.goto(`${origin}/guide?audience=teacher`, { waitUntil: 'networkidle' });
        const section = f.page.locator('#guide-teacher-section-1');
        assert.equal(await section.locator('figure').count(), 3); // Home, dedicated notebook, Classi popup.
        const figure = section.locator('figure').filter({ has: f.page.getByRole('img', { name: classPickerText(lang, 'title'), exact: true }) });
        await figure.scrollIntoViewIfNeeded(); await figure.locator('img').evaluate(e => e.decode());
        assert.ok(await figure.locator('img').evaluate(e => e.naturalWidth > 0));
        await figure.getByRole('button').click();
        const zoom = f.page.getByRole('dialog'); await zoom.locator('img').evaluate(e => e.decode());
        await f.page.keyboard.press('Escape'); assert.equal(await zoom.count(), 0);
        assert.equal(await figure.getByRole('button').evaluate(e => e === document.activeElement), true);
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const legacy of [false, true]) test(`${legacy ? 'legacy history' : 'navigation API'}: class discard never asks to discard the independent dirty notebook`, async () => {
    const f = await fixture({ legacy });
    try {
        const notebook = f.page.locator('#teacher-notebook-subjects'); await notebook.fill('Taccuino privato');
        await f.open(); await f.select(); await f.description.fill('Solo bozza della classe');
        await f.cancel.click(); await f.confirm.getByRole('button', { name: 'Scarta modifiche e prosegui', exact: true }).click();
        await f.popup.waitFor({ state: 'hidden' });
        await f.page.waitForTimeout(150); // Let legacy marker cleanup deliver its asynchronous popstate.
        assert.deepEqual(f.state.confirms, [], 'closing a class dialog must never trigger private notebook navigation');
        assert.equal(await notebook.inputValue(), 'Taccuino privato'); assert.equal(new URL(f.page.url()).pathname, '/docente/taccuino');
        assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('keyboard class switch and discard dialog trap/restore focus without changing the selected class', async () => {
    const f = await fixture();
    try {
        await f.open(); await f.select(); await f.description.fill('Bozza tastiera'); await f.selector.focus();
        await f.page.keyboard.press('ArrowDown'); await f.confirm.waitFor();
        const keep = f.confirm.getByRole('button', { name: 'Continua a modificare', exact: true });
        const discard = f.confirm.getByRole('button', { name: 'Scarta modifiche e prosegui', exact: true });
        assert.equal(await keep.evaluate(e => e === document.activeElement), true);
        await f.page.keyboard.press('Tab'); assert.equal(await discard.evaluate(e => e === document.activeElement), true);
        await f.page.keyboard.press('Tab'); assert.equal(await keep.evaluate(e => e === document.activeElement), true);
        await f.page.keyboard.press('Escape'); await f.confirm.waitFor({ state: 'hidden' });
        assert.equal(await f.selector.evaluate(e => e === document.activeElement), true);
        assert.equal(await f.selector.inputValue(), '91'); assert.equal(await f.description.inputValue(), 'Bozza tastiera');
        assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('long class/school/owner values and German controls fit 320px at 400% zoom equivalent', async () => {
    const f = await fixture({ lang: 'de', width: 320, scale: 4 });
    try {
        f.state.rows = [{ ...demo, name: 'Klasse'.repeat(40), school: 'Bildungseinrichtung'.repeat(30), owner_username: 'Lehrkraft'.repeat(30) }];
        await f.open(); await f.select();
        assert.ok(await f.popup.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await f.cancel.scrollIntoViewIfNeeded(); assert.equal(await f.cancel.isVisible(), true);
        assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});
