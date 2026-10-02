import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { goalText } from '../src/lib/i18n-goals.ts';

// Browser UI + API boundary only; no backend or database is contacted.
const origin = process.env.GOALS_BASE_URL || 'http://127.0.0.1:3112';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
async function fixture({ lang = 'it', width = 1440, existing = true } = {}) {
    const l = key => goalText(lang, key);
    const context = await browser.newContext({ viewport: { width, height: 1050 } });
    await context.addInitScript(lang => localStorage.setItem('cb_lang', lang), lang);
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const mutations = [];
    let hold = null; let failure = null;
    const holdMutation = path => {
        let release; const ready = new Promise(resolve => { release = resolve; });
        hold = { path, ready }; return release;
    };
    const failMutation = path => { failure = path; };
    let goal = { id: 1, title: 'Esame di storia', motivation: '', criteria: '', reflection: '', status: 'active', priority: 2, review_date: null, shared_group_id: null, revision: 1, method: [], catalog_id: null, catalog_snapshot: {}, links: [], parent_ids: [], origin: null, reviews: [], checks: [] };
    let present = existing;
    await page.route('**/api/**', async route => {
        const request = route.request(); const path = new URL(request.url()).pathname.slice(4);
        let data = [];
        if (request.method() !== 'GET') {
            const body = request.postDataJSON(); mutations.push({ path, method: request.method(), body });
            if (hold?.path === path) { const ready = hold.ready; hold = null; await ready; }
            if (failure === path) { failure = null; return route.fulfill({ status: 500, json: {} }); }
            assert.ok(path === '/user/goals' || path === '/user/goals/1' || path === '/user/goals/1/actions', `Unexpected mutation: ${path}`);
            if (path.endsWith('/actions')) {
                goal = { ...goal, revision: goal.revision + 1, links: [...goal.links, { id: 5, kind: 'action', target_id: 'demo-action', title: body.title, href: '/profilo/azioni#action-demo-action', available: true, role: 'means', action_kind: 'activity', date: body.date }] };
            } else {
                goal = { ...goal, ...body, revision: goal.revision + 1, method: (body.method || []).map(ref => ({ ...ref, title: 'Autoverifica pianificata', available: true })) }; present = true;
            }
            data = goal;
        } else if (path === '/user/goals') data = present ? [goal] : [];
        else if (path === '/user/certified-strategies') data = [{ slug: 'self-check', name: 'Autoverifica pianificata' }];
        else if (path === '/auth/me') data = { authenticated: true, username: 'method-fixture', name: 'Demo', groups: ['studenti'] };
        else if (path === '/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/orientation/status') data = { required: false, completed: true };
        else if (path === '/tavolo/enabled') data = { enabled: false };
        else if (path === '/counselors') data = [{ id: 1, name: 'Demo', language: ['*'], is_active: true }];
        else if (path === '/orientation-directory') data = { events: [] };
        await route.fulfill({ json: data });
    });
    await page.goto(`${origin}/profilo/obiettivi`);
    if (existing) await page.getByRole('button', { name: goal.title, exact: true }).click();
    return { page, context, errors, mutations, l, holdMutation, failMutation };
}

test('dirty method cannot create an action draft that disables both saves', async () => {
    const { page, context, mutations, l } = await fixture();
    try {
        await page.getByLabel(l('pickStrategy'), { exact: true }).selectOption('c:self-check');
        const practice = page.getByRole('button', { name: l('putInPractice'), exact: true });
        // On the broken baseline, exercise the actual click and report the two blocked saves.
        if (await practice.isEnabled()) {
            await practice.click();
            const actionForm = page.getByLabel(l('actionTitle'), { exact: true }).first().locator('xpath=ancestor::form');
            console.log('Baseline: goal save disabled =', await page.getByRole('button', { name: l('save'), exact: true }).isDisabled(), '; action save disabled =', await actionForm.getByRole('button', { includeHidden: true }).isDisabled());
        }
        assert.equal(await practice.isDisabled(), true, 'Save the method before preparing an action');
        assert.equal(await page.getByRole('button', { name: l('save'), exact: true }).isEnabled(), true);
        assert.equal(await practice.getAttribute('aria-describedby'), 'goal-practice-help');
        assert.equal(await page.locator('#goal-practice-help').innerText(), l('saveMethodFirst'));
        assert.equal(await page.locator('#goal-practice-help').isVisible(), true);
        assert.equal(mutations.length, 0, 'Preparing the method must not autosave');
    } finally { await context.close(); }
});

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    test(`saved method opens an editable action and saves it in ${lang}`, async () => {
        const { page, context, errors, mutations, l } = await fixture({ lang, width: 390 });
        try {
            await page.getByLabel(l('pickStrategy'), { exact: true }).selectOption('c:self-check');
            const practice = page.getByRole('button', { name: l('putInPractice'), exact: true });
            assert.equal(await practice.isDisabled(), true);
            assert.equal(await page.locator('#goal-practice-help').innerText(), l('saveMethodFirst'));
            await page.getByRole('button', { name: l('save'), exact: true }).click();
            await page.getByRole('status').filter({ hasText: l('saved') }).waitFor();
            await practice.click();
            const title = page.getByLabel(l('actionTitle'), { exact: true }).first();
            assert.equal(await title.isVisible(), true, 'The prefilled form must open');
            assert.equal(await title.inputValue(), 'Autoverifica pianificata');
            assert.equal(await title.evaluate(input => input === document.activeElement), true);
            assert.equal(await practice.isDisabled(), true, 'A second practice click must not overwrite the draft');
            await title.fill('Ripasso personale');
            const actionForm = title.locator('xpath=ancestor::form');
            await actionForm.getByLabel(l('detail'), { exact: true }).fill('Spiego i concetti a voce');
            await actionForm.getByLabel(l('date'), { exact: true }).fill('2026-10-15');
            assert.equal(await actionForm.getByRole('button').isEnabled(), true);
            // Closing a details disclosure must never hide or erase the draft permanently.
            await actionForm.locator('xpath=..').locator('summary').click();
            await actionForm.locator('xpath=..').locator('summary').click();
            assert.equal(await title.inputValue(), 'Ripasso personale');
            await actionForm.getByRole('button').click();
            await page.getByRole('link', { name: 'Ripasso personale', exact: true }).waitFor();
            const [methodSave, actionSave] = mutations;
            assert.equal(mutations.length, 2);
            assert.deepEqual(methodSave.body.method, [{ kind: 'certified', slug: 'self-check' }]);
            assert.equal(actionSave.path, '/user/goals/1/actions');
            assert.equal(actionSave.body.revision, 2);
            assert.equal(actionSave.body.title, 'Ripasso personale');
            assert.equal(actionSave.body.detail, 'Spiego i concetti a voce');
            assert.equal(actionSave.body.date, '2026-10-15');
            assert.ok(actionSave.body.request_id);
            assert.equal(await practice.isEnabled(), true);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.goto(`${origin}/guide?audience=student`);
            const guide = page.locator('#guide-section-12');
            await guide.waitFor({ state: 'attached' });
            assert.ok((await guide.locator('p').first().innerText()).includes(l('putInPractice')), 'The localized guide explains practice');
            for (const thumbnail of await guide.locator('figure img').all()) {
                await thumbnail.scrollIntoViewIfNeeded(); await thumbnail.evaluate(img => img.decode());
            }
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}

test('new goal is saved before method and action; cancelling exit preserves drafts', async () => {
    const { page, context, mutations, l } = await fixture({ existing: false });
    try {
        await page.getByRole('button', { name: l('custom'), exact: true }).click();
        assert.equal(await page.getByRole('button', { name: l('putInPractice'), exact: true }).count(), 0);
        await page.getByLabel(l('title'), { exact: true }).fill('Nuovo obiettivo');
        await page.getByRole('button', { name: l('save'), exact: true }).click();
        await page.getByLabel(l('pickStrategy'), { exact: true }).selectOption('c:self-check');
        page.once('dialog', dialog => dialog.dismiss());
        await page.getByRole('button', { name: l('cancel'), exact: true }).click();
        assert.equal(await page.getByRole('button', { name: l('putInPractice'), exact: true }).isDisabled(), true);
        await page.getByRole('button', { name: l('save'), exact: true }).click();
        await page.getByRole('status').filter({ hasText: l('saved') }).waitFor();
        await page.getByRole('button', { name: l('putInPractice'), exact: true }).click();
        const title = page.getByLabel(l('actionTitle'), { exact: true }).first();
        await title.fill('Bozza da conservare');
        page.once('dialog', dialog => dialog.dismiss());
        await page.keyboard.press('Escape');
        assert.equal(await title.inputValue(), 'Bozza da conservare');
        assert.equal(mutations.length, 2, 'Cancel and practice must not create an action');
        await title.fill(''); // Explicitly abandon the draft without discarding the saved method.
        assert.equal(await page.getByLabel(l('pickStrategy'), { exact: true }).isEnabled(), true);
        await page.getByRole('button', { name: l('cancel'), exact: true }).click();
        await page.getByRole('button', { name: 'Nuovo obiettivo', exact: true }).click();
        await page.getByRole('button', { name: l('putInPractice'), exact: true }).click();
        assert.equal(await title.inputValue(), 'Autoverifica pianificata');
        await title.locator('xpath=ancestor::form').getByRole('button').click();
        await page.getByRole('link', { name: 'Autoverifica pianificata', exact: true }).waitFor();
        assert.equal(mutations.length, 3);
    } finally { await context.close(); }
});

test('failed saves preserve method/action; in-flight and duplicate submits cannot create sibling drafts', async () => {
    const { page, context, mutations, l, holdMutation, failMutation } = await fixture();
    try {
        await page.getByLabel(l('pickStrategy'), { exact: true }).selectOption('c:self-check');
        failMutation('/user/goals/1');
        await page.getByRole('button', { name: l('save'), exact: true }).click();
        await page.getByRole('dialog').getByRole('alert').waitFor();
        const practice = page.getByRole('button', { name: l('putInPractice'), exact: true });
        assert.equal(await practice.isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: l('save'), exact: true }).isEnabled(), true);
        const releaseMethod = holdMutation('/user/goals/1');
        const methodRequest = page.waitForRequest(request => request.method() === 'PUT');
        await page.locator('#goal-dialog-form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
        await methodRequest;
        assert.equal(await practice.isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: l('save'), exact: true }).isDisabled(), true);
        releaseMethod();
        await page.getByRole('status').filter({ hasText: l('saved') }).waitFor();
        await practice.click();
        const title = page.getByLabel(l('actionTitle'), { exact: true }).first();
        const form = title.locator('xpath=ancestor::form');
        failMutation('/user/goals/1/actions');
        await form.getByRole('button').click();
        await page.getByRole('dialog').getByRole('alert').waitFor();
        assert.equal(await title.inputValue(), 'Autoverifica pianificata');
        const releaseAction = holdMutation('/user/goals/1/actions');
        const actionRequest = page.waitForRequest(request => request.url().endsWith('/actions'));
        await form.evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
        await actionRequest;
        assert.equal(await form.getByRole('button').isDisabled(), true);
        assert.equal(await practice.isDisabled(), true);
        releaseAction();
        await page.getByRole('link', { name: 'Autoverifica pianificata', exact: true }).waitFor();
        assert.equal(mutations.length, 4, 'One failed and one successful request for each save');
        assert.equal(mutations[2].body.request_id, mutations[3].body.request_id, 'Retry keeps its idempotency key');
    } finally { await context.close(); }
});

test('another pending draft disables practice without being replaced', async () => {
    const { page, context, l } = await fixture();
    try {
        await page.getByLabel(l('pickStrategy'), { exact: true }).selectOption('c:self-check');
        await page.getByRole('button', { name: l('save'), exact: true }).click();
        await page.getByRole('status').filter({ hasText: l('saved') }).waitFor();
        const check = page.getByLabel(l('actionTitle'), { exact: true }).nth(1);
        const form = check.locator('xpath=ancestor::form');
        await form.locator('xpath=..').locator('summary').click();
        await check.fill('Verifica personale');
        assert.equal(await page.getByRole('button', { name: l('putInPractice'), exact: true }).isDisabled(), true);
        assert.equal(await check.inputValue(), 'Verifica personale');
        await check.fill('');
        assert.equal(await page.getByRole('button', { name: l('putInPractice'), exact: true }).isEnabled(), true);
    } finally { await context.close(); }
});
