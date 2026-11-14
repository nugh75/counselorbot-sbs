import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { teacherAreaName, teacherAreaText } from '../src/lib/i18n-teacher-area.ts';
import { personalAreaName } from '../src/lib/i18n-personal-area.ts';

// S16 route seam: anonymous localhost fixtures, no backend/SSO/database.
const origin = new URL(process.env.TEACHER_PICKER_BASE_URL || 'http://127.0.0.1:3134').origin;
const routePath = '/docente/taccuino';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function fixture({ lang = 'it', groups = ['docenti'], admin = false, preview = '', width = 1440 } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(({ lang, preview }) => {
        localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light');
        if (preview) sessionStorage.setItem('cb_view_as_user', preview);
    }, { lang, preview });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const state = { reads: [], writes: [], errors: [], dialogs: [], accept: false, holdIdentity: null, holdWrite: null, saveFailure: false };
    page.on('pageerror', e => state.errors.push(e.message));
    page.on('dialog', async dialog => {
        state.dialogs.push(dialog.type()); await (state.accept ? dialog.accept() : dialog.dismiss());
    });
    await context.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        if (request.method() !== 'GET') {
            state.writes.push({ path: url.pathname, body: request.postDataJSON() });
            if (state.holdWrite) await state.holdWrite;
            if (state.saveFailure) return route.fulfill({ status: 503, json: {} });
            return route.fulfill({ json: {} });
        }
        state.reads.push({ path: url.pathname, preview: request.headers()['x-view-as'] });
        let data = [];
        if (url.pathname === '/api/auth/me') {
            if (state.holdIdentity) await state.holdIdentity;
            data = { authenticated: true, username: 's16.fixture', name: 'Alex · Demo', groups, is_admin: admin };
        }
        else if (url.pathname === '/api/user/teacher-notebook') data = { data: { subjects: 'Teacher-only demo' } };
        else if (url.pathname === '/api/user/learner-profile') data = { id: 1, data: { notes: 'Student-only demo' }, source: 'manual', created_at: '2026-10-03T08:00:00Z' };
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true };
        else if (url.pathname === '/api/user/account-preferences') data = { setup_completed: true, counselor_ready: true, notebook_ready: true };
        else if (url.pathname === '/api/telegram/bot-info') data = {};
        return route.fulfill({ json: data });
    });
    const go = path => page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
    const field = page.locator('#teacher-notebook-subjects');
    const ready = () => page.waitForFunction(() => document.querySelector('#teacher-notebook-subjects')?.value === 'Teacher-only demo');
    return { context, page, state, go, field, ready };
}

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) for (const width of [320, 1440]) test(`${lang}: first home entry, keyboard, canonical route, direct refresh and clean return at ${width}px`, async () => {
    const f = await fixture({ lang, width });
    try {
        await f.go('/docente');
        const entry = f.page.getByRole('link', { name: teacherAreaName(lang, 'taccuino'), exact: true });
        assert.equal(await entry.getAttribute('href'), routePath);
        const home = f.page.locator('[data-teacher-area-home]');
        // The sectioned home opens on the classroom and closes on the profile with the notebook.
        const hrefs = await home.locator('a').evaluateAll(elements => elements.map(e => e.getAttribute('href')));
        assert.equal(hrefs[0], '/docente/classi');
        assert.equal(hrefs.at(-1), routePath, 'the notebook closes the home destinations');
        assert.equal(hrefs.filter(h => h === routePath).length, 1);
        assert.equal(await home.locator('[data-testid="teacher-profile-notebook-section"] a').first().getAttribute('href'), routePath);
        assert.equal(await home.locator('[tabindex]').evaluateAll(elements => elements.filter(e => e.tabIndex > 0).length), 0);
        const notebookBox = await entry.boundingBox();
        const tryBox = await home.locator('[data-testid="teacher-try-tools-section"]').boundingBox();
        assert.ok(notebookBox && tryBox && notebookBox.y >= tryBox.y + tryBox.height, 'notebook follows Provare');
        assert.equal(await f.page.locator('[data-teacher-notebook], textarea[id^="teacher-notebook-"]').count(), 0);
        assert.equal(f.state.reads.filter(r => r.path === '/api/user/teacher-notebook').length, 0, 'home entry fetches no notebook');
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        // Natural Tab order: the previous home control leads to the notebook entry.
        await f.page.locator(`[data-teacher-area-home] a[href="${hrefs.at(-2)}"]`).focus();
        await f.page.keyboard.press('Tab');
        assert.equal(await entry.evaluate(e => e === document.activeElement), true, 'Tab reaches the notebook after the previous destination');
        await f.page.keyboard.press('Enter'); await f.ready();
        assert.equal(new URL(f.page.url()).pathname, routePath);
        const title = f.page.getByRole('heading', { level: 1, name: teacherAreaName(lang, 'taccuino'), exact: true });
        assert.equal(await title.evaluate(e => e === document.activeElement), true);
        assert.equal(await f.page.getByRole('heading', { level: 1 }).count(), 1);
        assert.equal(await f.page.locator('[data-teacher-notebook]').count(), 1);
        assert.equal(await f.page.locator('[data-teacher-notebook] textarea').count(), 6);
        assert.equal(await f.page.locator('[data-teacher-notebook]').getByRole('heading', { level: 2 }).count(), 3);
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await f.page.reload({ waitUntil: 'networkidle' }); await f.ready();
        const back = f.page.locator('[data-teacher-area-header]').getByRole('link', { name: teacherAreaText(lang, 'title'), exact: true });
        assert.equal(await back.getAttribute('href'), '/docente');
        await back.focus(); await f.page.keyboard.press('Enter'); await f.page.waitForURL(`${origin}/docente`);
        assert.equal(await f.page.locator('[data-teacher-notebook]').count(), 0);
        await f.go(routePath); await f.ready();
        assert.equal(f.state.reads.filter(r => r.path === '/api/user/learner-profile').length, 0, 'teacher page has no student data request');
        assert.deepEqual(f.state.dialogs, []); assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const [name, options, allowed] of [
    ['teacher', {}, true], ['researcher', { groups: ['ricercatori'] }, true],
    ['admin', { groups: [], admin: true }, true], ['dual role', { groups: ['docenti', 'studenti'] }, true],
    ['student', { groups: ['studenti'] }, false],
    ['preview teacher', { groups: [], admin: true, preview: 'docente.demo' }, true],
    ['preview researcher', { groups: [], admin: true, preview: 'ricercatore.demo' }, true],
    ['preview student', { groups: [], admin: true, preview: 'studente.demo' }, false],
]) test(`${name}: direct route and refresh preserve the existing plan-manager/preview guard`, async () => {
    const f = await fixture(options);
    try {
        for (const reload of [false, true]) {
            if (reload) await f.page.reload({ waitUntil: 'networkidle' }); else await f.go(routePath);
            if (allowed) await f.ready();
            else await f.page.getByText(teacherAreaText('it', 'forbidden'), { exact: true }).waitFor();
            assert.equal(await f.page.locator('[data-teacher-notebook]').count(), allowed ? 1 : 0);
        }
        const reads = f.state.reads.filter(r => r.path === '/api/user/teacher-notebook');
        // One component per load; dev StrictMode may replay the effect, so dev reads range over 2-4.
        if (!allowed) assert.equal(reads.length, 0);
        else if (process.env.TEACHER_NOTEBOOK_COMPILED === '1') assert.equal(reads.length, 2);
        else assert.ok(reads.length >= 2 && reads.length <= 4, `dev reads: ${reads.length}`);
        if (options.preview && allowed) assert.ok(reads.every(r => r.preview === options.preview));
        assert.deepEqual(f.state.writes, []);
        // Baseline 88b1b17 has the same SSR/client RolePreviewBanner mismatch
        // on direct entry and refresh. Keep that debt explicit; reject every
        // other error, and do not change the existing preview implementation.
        if (options.preview) {
            assert.equal(f.state.errors.length, 2);
            for (const error of f.state.errors) {
                if (process.env.TEACHER_NOTEBOOK_COMPILED === '1') assert.match(error, /Minified React error #418/);
                else { assert.match(error, /^Hydration failed/); assert.match(error, /RolePreviewBanner/); }
            }
        } else assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('access loading never mounts or fetches the notebook before identity resolves', async () => {
    const f = await fixture(); let release;
    try {
        f.state.holdIdentity = new Promise(resolve => { release = resolve; });
        await f.page.goto(`${origin}${routePath}`, { waitUntil: 'domcontentloaded' });
        await f.page.locator('main .animate-pulse').first().waitFor();
        assert.equal(await f.page.locator('[data-teacher-notebook]').count(), 0);
        assert.equal(f.state.reads.filter(r => r.path === '/api/user/teacher-notebook').length, 0);
        release(); await f.ready(); assert.deepEqual(f.state.errors, []);
    } finally { release?.(); await f.context.close(); }
});

for (const exit of ['header', 'navbar', 'reload']) test(`${exit}: cancel keeps draft DOM, text, focus and selection; discard leaves without saving`, async () => {
    const f = await fixture();
    try {
        await f.go('/docente');
        await f.page.getByRole('link', { name: teacherAreaName('it', 'taccuino'), exact: true }).click(); await f.ready();
        await f.field.fill('Bozza privata'); await f.field.focus();
        await f.field.evaluate(e => { e.setSelectionRange(2, 7); window.s16DraftNode = e; });
        const leave = async () => {
            if (exit === 'reload') {
                const dialog = f.page.waitForEvent('dialog');
                await f.page.evaluate(() => location.reload());
                await dialog;
                if (f.state.accept) await f.page.waitForLoadState('networkidle');
            } else {
                // Desktop navbar: the «Area» selector (P4) opens the panel with the area links.
                const areaButton = f.page.locator('header').first().locator('button[aria-controls="area-panel"]');
                if (exit === 'navbar' && await areaButton.getAttribute('aria-expanded') !== 'true') await areaButton.click();
                const link = exit === 'header' ? f.page.locator('[data-teacher-area-header] a') : f.page.locator('#area-panel').getByRole('link', { name: 'Area docente', exact: true });
                await link.click();
            }
        };
        await leave();
        assert.equal(new URL(f.page.url()).pathname, routePath);
        // The «Area» panel closes and returns focus to its selector; other exits keep it on the draft.
        assert.deepEqual(await f.field.evaluate(e => [e === window.s16DraftNode, e.value, e === document.activeElement, e.selectionStart, e.selectionEnd]), [true, 'Bozza privata', exit !== 'navbar', 2, 7]);
        if (exit === 'navbar') assert.equal(await f.page.locator('header').first().locator('button[aria-controls="area-panel"]').evaluate(e => e === document.activeElement), true);
        assert.equal(f.state.dialogs.length, 1); assert.deepEqual(f.state.writes, []);
        f.state.accept = true; await leave();
        if (exit === 'reload') { await f.ready(); assert.equal(await f.field.inputValue(), 'Teacher-only demo'); }
        else { await f.page.waitForURL(`${origin}/docente`); assert.equal(await f.page.locator('[data-teacher-notebook]').count(), 0); }
        assert.equal(f.state.dialogs.length, 2); assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const failure of [false, true]) test(`header during save: no exit/double submit; ${failure ? 'failure protects draft and retry recovers' : 'success allows clean return'}`, async () => {
    const f = await fixture(); let release;
    try {
        await f.go(routePath); await f.ready(); await f.field.fill('  Bozza da salvare  ');
        f.state.saveFailure = failure; f.state.holdWrite = new Promise(resolve => { release = resolve; });
        const save = f.page.getByRole('button', { name: 'Salva taccuino', exact: true });
        await save.click();
        await f.page.getByRole('status').filter({ hasText: 'Salvataggio in corso' }).waitFor();
        await save.evaluate(e => e.click());
        const back = f.page.locator('[data-teacher-area-header] a[href="/docente"]');
        await back.click();
        assert.equal(new URL(f.page.url()).pathname, routePath);
        assert.equal(await f.field.inputValue(), '  Bozza da salvare  ');
        const payload = { subjects: 'Bozza da salvare', experience: null, methodologies: null, classes_overview: null, formation_interests: null, notes: null };
        assert.deepEqual(f.state.writes, [{ path: '/api/user/teacher-notebook', body: payload }]);
        assert.deepEqual(f.state.dialogs, []);
        release(); f.state.holdWrite = null;
        if (failure) {
            await f.page.getByRole('alert').waitFor(); await back.click();
            assert.equal(f.state.dialogs.length, 1); assert.equal(new URL(f.page.url()).pathname, routePath);
            assert.equal(await f.field.inputValue(), '  Bozza da salvare  ');
            f.state.saveFailure = false; await save.click();
            assert.deepEqual(f.state.writes, [1, 2].map(() => ({ path: '/api/user/teacher-notebook', body: payload })));
        }
        await f.page.getByRole('button', { name: 'Taccuino salvato', exact: true }).waitFor();
        assert.equal(await f.field.inputValue(), 'Bozza da salvare');
        await back.click(); await f.page.waitForURL(`${origin}/docente`);
        assert.equal(f.state.dialogs.length, failure ? 1 : 0); assert.deepEqual(f.state.errors, []);
    } finally { release?.(); await f.context.close(); }
});

for (const groups of [['studenti'], ['docenti', 'studenti']]) test(`${groups.join('+')}: student notebook stays separate; dual role chooses either route`, async () => {
    const f = await fixture({ groups });
    try {
        await f.go('/profilo/taccuino');
        await f.page.getByRole('heading', { level: 1, name: personalAreaName('it', 'taccuino'), exact: true }).waitFor();
        await f.page.getByText('Student-only demo', { exact: true }).waitFor();
        assert.equal(new URL(f.page.url()).pathname, '/profilo/taccuino');
        assert.equal(await f.page.locator('[data-teacher-notebook]').count(), 0);
        assert.equal(f.state.reads.filter(r => r.path === '/api/user/teacher-notebook').length, 0);
        if (groups.includes('docenti')) {
            await f.go(routePath); await f.ready();
            assert.equal(await f.page.getByText('Student-only demo', { exact: true }).count(), 0);
            await f.go('/profilo/taccuino'); await f.page.getByText('Student-only demo', { exact: true }).waitFor();
        }
        assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) test(`${lang}: public guide opens the Teacher area task and enlarges its anonymous screenshot`, async () => {
    const f = await fixture({ lang, width: 320 });
    try {
        // The task-based guide maps the old teacher section 1 to the Teacher area task,
        // which explains the notebook and opens the Teacher area.
        await f.go('/guide#guide-teacher-section-1');
        const section = f.page.locator('#guide-task-teacher-home');
        await section.waitFor();
        const link = section.locator('a[href="/docente"]');
        assert.equal(await link.count(), 1, 'generic Teacher area entry remains');
        const figure = section.locator('figure');
        // The screenshot is lazy: decode() waits until it is near the viewport.
        await figure.scrollIntoViewIfNeeded();
        await figure.locator('img').evaluate(e => e.decode());
        assert.ok(await figure.locator('img').evaluate(e => e.naturalWidth > 0));
        const enlarge = figure.getByRole('button'); await enlarge.focus(); await f.page.keyboard.press('Enter');
        const zoom = f.page.getByRole('dialog'); await zoom.locator('img').evaluate(e => e.decode());
        await f.page.keyboard.press('Escape'); assert.equal(await zoom.count(), 0);
        assert.equal(await enlarge.evaluate(e => e === document.activeElement), true);
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await link.click(); await f.page.waitForURL(`${origin}/docente`);
        await f.page.locator('[data-testid="teacher-classroom-section"]').waitFor();
        assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});
