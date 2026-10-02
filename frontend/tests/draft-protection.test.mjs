import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { learningText } from '../src/lib/i18n-assignment-work.ts';
import { readingText } from '../src/lib/i18n-reading.ts';

// Browser controls and HTTP contracts; anonymous, in-memory fixtures only.
const origin = process.env.DRAFTS_BASE_URL || 'http://127.0.0.1:3112';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
async function fixture({ reading = false, lang = 'it', width = 1440 } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1050 } });
    await context.addInitScript(lang => localStorage.setItem('cb_lang', lang), lang);
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const mutations = []; const dialogs = []; let accept = false; let failure = false; let hold = null;
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await (accept ? dialog.accept() : dialog.dismiss()); });
    const w = key => learningText(lang, key); const r = key => readingText(lang, key);
    const work = id => ({ revision: 1, workspace_revision: 1, planned: true, action: { id: `action-${id}`, title: `Activity ${id}`, stage: 'planned', reflection: `Saved work ${id}` }, event: null, linked_goals: [], submission: null, submitted_at: null, feedback: '', feedback_at: null });
    const works = Object.fromEntries([1, 2, 3].map(id => [id, work(id)]));
    const readings = Object.fromEntries(['result-a', 'result-b'].map(id => [id, { session_id: id, questionnaire_type: 'QSA', strengths: [], growth_areas: [], note: `Saved ${id}`, goal_ids: [] }]));
    await page.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const path = url.pathname.slice(4); let data = [];
        if (request.method() !== 'GET') {
            const body = request.postDataJSON(); mutations.push({ path, method: request.method(), body });
            if (hold) { const pending = hold; hold = null; await pending; }
            if (failure) { failure = false; return route.fulfill({ status: 500, json: {} }); }
            const match = path.match(/^\/user\/assignments\/(\d+)\/(reflection|submission)$/);
            if (match) {
                const id = Number(match[1]); const row = works[id];
                assert.equal(body.revision, row.revision);
                works[id] = { ...row, revision: row.revision + 1, workspace_revision: row.workspace_revision + 1,
                    ...(match[2] === 'reflection' ? { action: { ...row.action, reflection: body.reflection } } : { submission: { text: body.text }, submitted_at: '2026-10-02T09:00:00Z' }) };
                data = works[id];
            } else if (path.startsWith('/user/readings/')) {
                const id = path.split('/').at(-1); assert.ok(readings[id]);
                data = readings[id] = { ...readings[id], ...body, strengths: body.strengths.filter(Boolean), growth_areas: body.growth_areas.filter(Boolean) };
            } else assert.fail(`Unexpected mutation: ${path}`);
        } else if (path === '/auth/me') data = { authenticated: true, username: 'draft-fixture', name: 'Demo', groups: ['studenti'] };
        else if (path === '/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/orientation/status') data = { required: false, completed: true };
        else if (path === '/tavolo/enabled') data = { enabled: false };
        else if (path === '/orientation-directory') data = { institution: null, events: [], referrals: [] };
        else if (path === '/counselors') data = [{ id: 1, name: 'Demo', language: ['*'], is_active: true }];
        else if (path === '/user/questionnaire-results') data = reading ? ['result-a', 'result-b'].map((id, i) => ({ id: i + 1, session_id: id, questionnaire_type: 'QSA', scores: { A1: 5 }, submitted_at: `2026-09-${20 + i}T09:00:00Z` })) : [];
        else if (path === '/user/readings') data = readings[url.searchParams.get('session_id')];
        else if (path === '/user/assignments') data = [1, 2, 3].map(id => ({ id, author_name: 'Teacher Demo', group_name: id === 1 ? 'Group A' : 'Group B', source_kind: id === 1 ? 'goal' : 'reading', intent: id === 1 ? 'requested' : 'proposal', created_at: '2026-09-20T09:00:00Z', revoked_at: null, instructions: '', progress: { planned: true, shared: id === 2 }, snapshot: { title: `Assignment ${id}`, description: '', details: '' } }));
        else if (/^\/user\/assignments\/\d+\/work$/.test(path)) data = works[Number(path.split('/')[3])];
        await route.fulfill({ json: data });
    });
    await page.goto(`${origin}/profilo/${reading ? 'compilazioni' : 'assegnazioni'}`);
    const card = id => page.locator(`#assignment-${id}`);
    const open = async id => {
        await card(id).locator('button[aria-expanded]').first().waitFor();
        const details = card(id).getByRole('button', { name: w('openDetail'), exact: true });
        if (await details.count()) await details.click();
        await card(id).getByRole('button', { name: w('openWork'), exact: true }).click();
        await card(id).getByRole('textbox').first().waitFor();
    };
    if (reading) await page.locator('textarea').first().waitFor(); else await open(1);
    return { page, context, errors, mutations, dialogs, w, r, card, open,
        discard: value => { accept = value; }, fail: () => { failure = true; },
        hold: () => { let release; hold = new Promise(resolve => { release = resolve; }); return release; } };
}

test('assignment: cancel closing details preserves the draft and open card', async () => {
    const f = await fixture();
    try {
        const note = f.card(1).getByRole('textbox').first();
        await note.fill('Unsaved private work A');
        await f.card(1).getByRole('button', { name: f.w('closeDetail'), exact: true }).click();
        assert.equal(f.dialogs.length, 1, 'Closing details must ask before unmounting the editor');
        assert.equal(await note.inputValue(), 'Unsaved private work A');
        assert.equal(await f.card(1).getByRole('button', { name: f.w('closeDetail'), exact: true }).getAttribute('aria-expanded'), 'true');
        assert.deepEqual(f.mutations, []); assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('reading: cancel changing compilation preserves note and selected result', async () => {
    const f = await fixture({ reading: true });
    try {
        const note = f.page.locator('textarea').first();
        await note.fill('Unsaved reading A');
        const select = f.page.getByRole('combobox').first();
        await select.selectOption('result-b');
        assert.equal(f.dialogs.length, 1, 'Changing compilation must ask before replacing the reading');
        assert.equal(await select.inputValue(), 'result-a');
        assert.equal(await note.inputValue(), 'Unsaved reading A');
        assert.deepEqual(f.mutations, []); assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('assignment: cancel switching cards, then discard and save only the new assignment', async () => {
    const f = await fixture();
    try {
        await f.card(1).getByRole('textbox').first().fill('Private draft A');
        await f.card(2).getByRole('button', { name: f.w('openDetail'), exact: true }).click();
        assert.equal(f.dialogs.length, 1);
        assert.equal(await f.card(1).getByRole('textbox').first().inputValue(), 'Private draft A');
        assert.equal(await f.card(2).getByRole('button', { name: f.w('openDetail'), exact: true }).getAttribute('aria-expanded'), 'false');
        f.discard(true); await f.open(2);
        const note = f.card(2).getByRole('textbox').first();
        assert.equal(await note.inputValue(), 'Saved work 2');
        await note.fill('Work B');
        await f.card(2).getByRole('button', { name: f.w('saveReflection'), exact: true }).click();
        await f.card(2).getByRole('status').filter({ hasText: f.w('saved') }).waitFor();
        assert.deepEqual(f.mutations.map(m => [m.path, m.body.reflection]), [['/user/assignments/2/reflection', 'Work B']]);
        const count = f.dialogs.length;
        await f.card(2).getByRole('button', { name: f.w('closeDetail'), exact: true }).click();
        assert.equal(f.dialogs.length, count); assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

for (const [key, value] of [['filterGroup', 'Group B'], ['filterKind', 'reading'], ['intent', 'proposal'], ['filterStatus', 'shared']]) {
    test(`assignment: cancel ${key} preserves its previous value; discard applies it`, async () => {
        const f = await fixture();
        try {
            const note = f.card(1).getByRole('textbox').first(); await note.fill('Unsaved A');
            const filter = f.page.getByRole('combobox', { name: f.w(key), exact: true });
            await filter.selectOption(value);
            assert.equal(f.dialogs.length, 1); assert.equal(await filter.inputValue(), '');
            assert.equal(await note.inputValue(), 'Unsaved A');
            f.discard(true); await filter.selectOption(value);
            assert.equal(await filter.inputValue(), value); assert.equal(await f.card(1).count(), 0);
            await filter.selectOption(''); await f.open(1);
            assert.equal(await f.card(1).getByRole('textbox').first().inputValue(), 'Saved work 1');
            assert.equal(f.dialogs.length, 2); assert.deepEqual(f.mutations, []); assert.deepEqual(f.errors, []);
        } finally { await f.context.close(); }
    });
}

test('assignment: restoring saved text clears dirty; failed save preserves work and response', async () => {
    const f = await fixture();
    try {
        const note = f.card(1).getByRole('textbox').first();
        await note.fill('Change'); await note.fill('Saved work 1');
        await f.card(1).getByRole('button', { name: f.w('closeDetail'), exact: true }).click();
        assert.equal(f.dialogs.length, 0); await f.open(1);
        await f.card(1).locator('summary').click();
        const response = f.card(1).getByRole('textbox').nth(1); await response.fill('Response draft');
        f.fail(); await f.card(1).getByRole('button', { name: f.w('share'), exact: true }).click();
        await f.card(1).getByRole('alert').waitFor();
        await f.card(1).getByRole('button', { name: f.w('closeDetail'), exact: true }).click();
        assert.equal(f.dialogs.length, 1); assert.equal(await response.inputValue(), 'Response draft');
        await f.card(1).getByRole('button', { name: f.w('reload'), exact: true }).click();
        assert.equal(f.dialogs.length, 2); assert.equal(await response.inputValue(), 'Response draft');
        await f.card(1).getByRole('button', { name: f.w('share'), exact: true }).click();
        await f.card(1).getByRole('status').filter({ hasText: f.w('saved') }).waitFor();
        await f.card(1).getByRole('button', { name: f.w('closeDetail'), exact: true }).click();
        assert.equal(f.dialogs.length, 2); assert.equal(f.mutations.length, 2); assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('assignment: saving disables destructive transitions and rejects duplicate submits', async () => {
    const f = await fixture(); let release;
    try {
        await f.card(1).getByRole('textbox').first().fill('Pending A'); release = f.hold();
        const save = f.card(1).getByRole('button', { name: f.w('saveReflection'), exact: true });
        await save.click();
        await f.page.waitForFunction(() => document.querySelector('#assignment-1 button[aria-expanded]')?.disabled);
        assert.equal(await f.card(1).getByRole('button', { name: f.w('closeDetail'), exact: true }).isDisabled(), true);
        assert.equal(await f.card(2).getByRole('button', { name: f.w('openDetail'), exact: true }).isDisabled(), true);
        for (const filter of await f.page.getByRole('combobox').all()) assert.equal(await filter.isDisabled(), true);
        await f.page.evaluate(() => { location.hash = '#assignment-2'; });
        await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await f.card(1).getByRole('textbox').first().inputValue(), 'Pending A');
        assert.equal(new URL(f.page.url()).hash, '');
        await save.locator('xpath=ancestor::form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
        release();
        await f.card(1).getByRole('status').filter({ hasText: f.w('saved') }).waitFor();
        assert.equal(f.mutations.length, 1); await f.open(2);
        assert.equal(await f.card(2).getByRole('textbox').first().inputValue(), 'Saved work 2');
        assert.equal(await f.card(2).getByRole('status').count(), 0);
        assert.equal(f.dialogs.length, 0); assert.deepEqual(f.errors, []);
    } finally { release?.(); await f.context.close(); }
});

test('reading: collapse retains the draft; search cancellation preserves filter and selection', async () => {
    const f = await fixture({ reading: true });
    try {
        const note = f.page.locator('textarea').first(); await note.fill('Reading draft A');
        const collapse = f.page.locator('button[aria-controls="submission-result-content"]');
        await collapse.focus(); await f.page.keyboard.press('Enter');
        assert.equal(await collapse.getAttribute('aria-expanded'), 'false');
        assert.equal(await note.inputValue(), 'Reading draft A'); assert.equal(f.dialogs.length, 0);
        const search = f.page.locator('input').first(); await search.fill('result-b');
        assert.equal(f.dialogs.length, 1); assert.equal(await search.inputValue(), '');
        assert.equal(await f.page.getByRole('combobox').first().inputValue(), 'result-a');
        assert.equal(await note.inputValue(), 'Reading draft A');
        f.discard(true); await search.fill('result-b');
        await f.page.waitForFunction(() => document.querySelector('textarea')?.value === 'Saved result-b');
        assert.equal(await f.page.getByRole('combobox').first().inputValue(), 'result-b');
        await note.fill('Reading B'); await f.page.getByRole('button', { name: f.r('save'), exact: true }).click();
        await f.page.getByRole('status').filter({ hasText: f.r('saved') }).waitFor();
        assert.deepEqual(f.mutations.map(m => [m.path, m.body.note]), [['/user/readings/result-b', 'Reading B']]);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('reading: restoring values and successful save clear dirty; failed save retains it', async () => {
    const f = await fixture({ reading: true });
    try {
        const note = f.page.locator('textarea').first(); const select = f.page.getByRole('combobox').first();
        await note.fill('Change'); await note.fill('Saved result-a');
        await select.selectOption('result-b');
        await f.page.waitForFunction(() => document.querySelector('textarea')?.value === 'Saved result-b');
        assert.equal(f.dialogs.length, 0);
        await note.fill('Draft B'); f.fail();
        await f.page.getByRole('button', { name: f.r('save'), exact: true }).click();
        await f.page.getByRole('status').waitFor();
        await select.selectOption('result-a');
        assert.equal(f.dialogs.length, 1); assert.equal(await select.inputValue(), 'result-b');
        assert.equal(await note.inputValue(), 'Draft B');
        await f.page.getByRole('button', { name: f.r('save'), exact: true }).click();
        await f.page.getByRole('status').filter({ hasText: f.r('saved') }).waitFor();
        await select.selectOption('result-a');
        assert.equal(f.dialogs.length, 1);
        assert.equal(f.mutations.length, 2); assert.ok(f.mutations.every(m => m.path === '/user/readings/result-b'));
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('reading: in-flight save freezes fields and selection, with one request and scoped feedback', async () => {
    const f = await fixture({ reading: true }); let release;
    try {
        const note = f.page.locator('textarea').first(); await note.fill('Pending A'); release = f.hold();
        const save = f.page.getByRole('button', { name: f.r('save'), exact: true }); await save.click();
        await f.page.waitForFunction(() => document.querySelector('select')?.disabled);
        assert.equal(await f.page.getByRole('combobox').first().isDisabled(), true);
        assert.equal(await f.page.locator('input').first().isDisabled(), true);
        assert.equal(await note.isDisabled(), true);
        await save.evaluate(button => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        release(); await f.page.getByRole('status').filter({ hasText: f.r('saved') }).waitFor();
        assert.equal(f.mutations.length, 1); assert.equal(f.mutations[0].body.note, 'Pending A');
        await f.page.getByRole('combobox').first().selectOption('result-b');
        await f.page.waitForFunction(() => document.querySelector('textarea')?.value === 'Saved result-b');
        assert.equal(f.dialogs.length, 0); assert.deepEqual(f.errors, []);
    } finally { release?.(); await f.context.close(); }
});

test('assignment: hash navigation cannot silently replace a dirty editor', async () => {
    const f = await fixture();
    try {
        await f.card(1).getByRole('textbox').first().fill('Hash draft A');
        await f.page.evaluate(() => { location.hash = '#assignment-2'; });
        await f.page.waitForFunction(() => document.querySelector('#assignment-2 button')?.getAttribute('aria-expanded') === 'true' || document.querySelector('#assignment-1 textarea')?.value === 'Hash draft A');
        // Wait for the hashchange event, not an arbitrary timer.
        await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(f.dialogs.length, 1);
        assert.equal(await f.card(1).getByRole('textbox').first().inputValue(), 'Hash draft A');
        assert.equal(new URL(f.page.url()).hash, '');
        f.discard(true); await f.page.evaluate(() => { location.hash = '#assignment-2'; });
        await f.card(2).getByRole('textbox').first().waitFor();
        assert.equal(await f.card(2).getByRole('textbox').first().inputValue(), 'Saved work 2');
        assert.equal(f.dialogs.length, 2);
        assert.deepEqual(f.mutations, []); assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('assignment: saving reflection leaves the separate response draft protected', async () => {
    const f = await fixture();
    try {
        await f.card(1).getByRole('textbox').first().fill('Private work');
        await f.card(1).locator('summary').click();
        await f.card(1).getByRole('textbox').nth(1).fill('Unshared response');
        f.fail(); await f.card(1).getByRole('button', { name: f.w('saveReflection'), exact: true }).click();
        await f.card(1).getByRole('alert').waitFor();
        await f.card(1).getByRole('button', { name: f.w('closeDetail'), exact: true }).click();
        assert.equal(await f.card(1).getByRole('textbox').first().inputValue(), 'Private work');
        await f.card(1).getByRole('button', { name: f.w('saveReflection'), exact: true }).click();
        await f.card(1).getByRole('status').filter({ hasText: f.w('saved') }).waitFor();
        await f.card(1).getByRole('button', { name: f.w('closeDetail'), exact: true }).click();
        assert.equal(f.dialogs.length, 2);
        assert.equal(await f.card(1).getByRole('textbox').nth(1).inputValue(), 'Unshared response');
        assert.ok(f.mutations.every(m => m.path.endsWith('/reflection')));
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('reading: factors are dirty until restored or saved; empty placeholders stay clean', async () => {
    const f = await fixture({ reading: true });
    try {
        const result = f.page.getByRole('combobox').first();
        const strengths = f.page.getByRole('combobox').nth(1);
        const factor = await strengths.getByRole('option').nth(1).getAttribute('value');
        await strengths.selectOption(factor); await result.selectOption('result-b');
        assert.equal(f.dialogs.length, 1); assert.equal(await result.inputValue(), 'result-a');
        await strengths.selectOption(''); await result.selectOption('result-b');
        await f.page.waitForFunction(() => document.querySelector('textarea')?.value === 'Saved result-b');
        assert.equal(f.dialogs.length, 1);
        await f.page.getByRole('combobox').nth(2).selectOption(factor);
        await f.page.getByRole('button', { name: f.r('save'), exact: true }).click();
        await f.page.getByRole('status').filter({ hasText: f.r('saved') }).waitFor();
        await result.selectOption('result-a'); assert.equal(f.dialogs.length, 1);
        assert.deepEqual(f.mutations[0].body.growth_areas, [factor]); assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

for (const reading of [false, true]) {
    test(`${reading ? 'reading' : 'assignment'}: link cancellation and browser close guard keep the draft`, async () => {
        const f = await fixture({ reading });
        try {
            const note = reading ? f.page.locator('textarea').first() : f.card(1).getByRole('textbox').first();
            await note.fill('Guarded draft');
            const prevented = await f.page.evaluate(() => {
                const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
            });
            assert.equal(prevented, true);
            await f.page.locator('a[href="/profilo"]').first().click();
            assert.equal(f.dialogs.length, 1); assert.equal(await note.inputValue(), 'Guarded draft');
            assert.equal(new URL(f.page.url()).pathname, `/profilo/${reading ? 'compilazioni' : 'assegnazioni'}`);
            assert.deepEqual(f.mutations, []); assert.deepEqual(f.errors, []);
        } finally { await f.context.close(); }
    });
}

test('reading: explicitly leaving during a save does not show late feedback on another page', async () => {
    const f = await fixture({ reading: true }); let release;
    try {
        await f.page.locator('textarea').first().fill('Pending reading A'); release = f.hold();
        await f.page.getByRole('button', { name: f.r('save'), exact: true }).click();
        await f.page.waitForFunction(() => document.querySelector('select')?.disabled);
        f.discard(true); await f.page.locator('a[href="/profilo"]').first().click();
        await f.page.waitForURL(`${origin}/profilo`);
        const response = f.page.waitForResponse(res => res.url().endsWith('/user/readings/result-a') && res.request().method() === 'PUT');
        release(); await response;
        await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await f.page.getByRole('status').filter({ hasText: f.r('saved') }).count(), 0);
        assert.equal(f.mutations.length, 1); assert.equal(f.mutations[0].body.note, 'Pending reading A');
        assert.deepEqual(f.errors, []);
    } finally { release?.(); await f.context.close(); }
});

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    test(`draft confirmation, keyboard, guide and existing screenshots in ${lang} at 390px`, async () => {
        const f = await fixture({ lang, width: 390 });
        try {
            await f.card(1).getByRole('textbox').first().fill('Draft A');
            const close = f.card(1).getByRole('button', { name: f.w('closeDetail'), exact: true });
            await close.focus(); await f.page.keyboard.press('Enter');
            assert.deepEqual(f.dialogs, [f.w('leaveDraft')]);
            assert.equal(await f.card(1).getByRole('textbox').first().inputValue(), 'Draft A');
            f.discard(true); await close.focus(); await f.page.keyboard.press('Space');
            assert.equal(await f.card(1).getByRole('textbox').count(), 0);
            await f.open(1);
            assert.equal(await f.card(1).getByRole('textbox').first().inputValue(), 'Saved work 1');
            assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        } finally { await f.context.close(); }
        const g = await fixture({ reading: true, lang, width: 390 });
        try {
            await g.page.locator('textarea').first().fill('Draft reading A');
            await g.page.getByRole('combobox').first().selectOption('result-b');
            assert.deepEqual(g.dialogs, [g.w('leaveDraft')]);
            await g.page.locator('textarea').first().fill('Saved result-a');
            await g.page.goto(`${origin}/guide?audience=student`);
            for (const n of [12, 14]) {
                const section = g.page.locator(`#guide-section-${n}`);
                await section.waitFor({ state: 'attached' });
                assert.ok((await section.locator('p').first().innerText()).length > 200);
                const images = section.locator('figure img'); assert.ok(await images.count() > 0);
                for (const img of await images.all()) { await img.scrollIntoViewIfNeeded(); await img.evaluate(img => img.decode()); assert.ok(await img.getAttribute('alt')); }
            }
            assert.ok(await g.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await g.page.screenshot({ path: `../.tmp/s3/guide-${lang}.png` });
            assert.deepEqual(g.mutations, []); assert.deepEqual(g.errors, []);
        } finally { await g.context.close(); }
    });
}
