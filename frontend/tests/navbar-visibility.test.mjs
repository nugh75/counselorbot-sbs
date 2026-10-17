// Visible navbar contract (P0 of docs/operations/audit-navbar.md): what each
// synthetic role really sees at each viewport, with loading and API failures.
// Runs against an isolated Next dev server (scripts/dev-navbar-tests.sh); every
// /api request is answered here and every external request is aborted.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { ENTRY_HREFS, FROZEN_ROWS, LABELS, LOCALIZED, PQBL_PROGRESS, PROFILES, VIEWPORTS, expectedNavbar } from './fixtures/navbar-contract.mjs';

const origin = process.env.NAVBAR_BASE_URL || 'http://127.0.0.1:3149';
const shots = process.env.NAVBAR_SCREENSHOTS || '';
// Dev compilation and hydration can be slow on a cold server or a slow disk.
const SETTLE_MS = Number(process.env.NAVBAR_SETTLE_MS || 45000);
let browser;
before(async () => {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    if (shots) mkdirSync(shots, { recursive: true });
});
after(async () => { await browser?.close(); });

function deferred() {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    return { promise, release };
}

// `auth`, `access` and `state.frozen` take 'ok', 'error' (HTTP 500), 'abort'
// (network failure) or a deferred() that holds the answer until released.
async function fixture({ profile = 'S', width = 1440, locale = 'it', dark = false, reducedMotion = 'no-preference', touch = false, auth = 'ok', access = 'ok', frozen = [], storage = {}, identity: identityOverride = {}, scale = 1 } = {}) {
    const identity = { ...PROFILES[profile].identity, ...identityOverride };
    let accessPayload = PROFILES[profile].access;
    const state = { frozen };
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: scale, reducedMotion, hasTouch: touch });
    await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(SETTLE_MS);
    page.setDefaultNavigationTimeout(600000);
    const errors = [], writes = [], reads = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ locale, dark, storage }) => {
        localStorage.setItem('cb_lang', locale);
        localStorage.setItem('cb_theme', dark ? 'dark' : 'light');
        for (const [key, value] of Object.entries(storage)) if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    }, { locale, dark, storage });
    const answer = async (route, mode, json) => {
        if (mode && typeof mode === 'object') await mode.promise;
        if (mode === 'error') return route.fulfill({ status: 500, json: { detail: 'Fixture failure' } });
        if (mode === 'abort') return route.abort('failed');
        return route.fulfill({ json });
    };
    await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (request.method() !== 'GET') writes.push({ path, body: request.postDataJSON() });
        else reads.push(path);
        if (path === '/api/auth/me') return answer(route, auth, identity);
        if (path === '/api/user/access/view' && request.method() === 'PUT') {
            const view = request.postDataJSON().view;
            accessPayload = view === 'all'
                ? { ...accessPayload, restricted: false, view, tool_keys: [...new Set([...accessPayload.tool_keys, 'bussola', 'assistant'])] }
                : { ...PROFILES[profile].access, view };
            return route.fulfill({ json: accessPayload });
        }
        if (path === '/api/user/access') {
            if (!accessPayload) return route.fulfill({ status: 401, json: { detail: 'Non autenticato' } });
            return answer(route, access, accessPayload);
        }
        if (path === '/api/session/frozen') return Array.isArray(state.frozen) ? route.fulfill({ json: state.frozen }) : answer(route, state.frozen, []);
        if (path === '/api/user/account-preferences') return route.fulfill({ json: { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true } });
        if (path === '/api/orientation/status') return route.fulfill({ json: { required: false, completed: true } });
        if (path === '/api/counselors') return route.fulfill({ json: [{ id: 1, name: 'Counselor Sintetico', slug: 'c1', language: ['it'], is_active: true, suitable: true, model_origin: 'local' }] });
        return route.fulfill({ json: [] });
    });
    return { page, context, errors, writes, reads, state };
}

const header = page => page.locator('header.console-header');
const trigger = page => page.locator('button[aria-controls="mobile-menu"]');
const mobileMenu = page => page.locator('#mobile-menu');
const resumePanel = page => page.locator('#resume-panel');
// Desktop bar from 1024px (P4): «Area» selector and account menu.
const areaTrigger = page => page.locator('button[aria-controls="area-panel"]');
const areaPanel = page => page.locator('#area-panel');
const accountTrigger = page => page.locator('button[aria-controls="account-panel"]');
const accountPanel = page => page.locator('#account-panel');
const PANELS = '#mobile-menu, #resume-panel, #area-panel, #account-panel';

// Accessible names of the controls a person can see, in DOM order. The bar
// excludes the open header panels; each panel is read on its own.
function names(locator) {
    return locator.evaluate((root, panels) => [...root.querySelectorAll('a, button, select')]
        .filter(el => root.matches(panels) || !el.closest(panels))
        .filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
        .map(el => el.getAttribute('aria-label') || el.labels?.[0]?.textContent?.trim() || el.textContent.trim()), PANELS);
}

// Visible controls marked as the current page.
function currentNames(locator) {
    return locator.evaluate((root, panels) => [...root.querySelectorAll('[aria-current="page"]')]
        .filter(el => root.matches(panels) || !el.closest(panels))
        .filter(el => el.checkVisibility({ checkVisibilityCSS: true }))
        .map(el => el.getAttribute('aria-label') || el.textContent.trim()), PANELS);
}

// Names of the navigation landmarks a person can reach.
function landmarks(locator) {
    return locator.evaluate(root => [...root.querySelectorAll('nav')]
        .filter(el => el.checkVisibility({ checkVisibilityCSS: true }))
        .map(el => el.getAttribute('aria-label')));
}

function links(locator) {
    return locator.evaluate(root => [...root.querySelectorAll('a')]
        .filter(el => el.checkVisibility({ checkVisibilityCSS: true }))
        .map(el => ({ name: el.getAttribute('aria-label') || el.textContent.trim(), href: el.getAttribute('href') })));
}

async function eventually(read, expected, message) {
    const deadline = Date.now() + SETTLE_MS;
    let actual;
    do {
        actual = await read();
        if (JSON.stringify(actual) === JSON.stringify(expected)) return;
        await new Promise(resolve => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    assert.deepEqual(actual, expected, message);
}

function assertDestinations(rows, profile) {
    for (const { name, href } of rows) {
        const key = Object.keys(ENTRY_HREFS).find(entry => LABELS[entry] === name);
        if (key) assert.equal(href, ENTRY_HREFS[key], name);
        if (name === LABELS.home) assert.equal(href, '/');
        assert.notEqual(href, '/questionario', `${name}: the satisfaction questionnaire lives on the home page`);
        // One door to /profilo (P4): the person's name is not a link.
        assert.notEqual(name, PROFILES[profile].identity.name, 'the account name is not a link');
        if (name === LABELS.logout || name === LABELS.signOut) assert.match(href, /\/logout/);
        if (name === LABELS.adminLogin) assert.match(decodeURIComponent(href), /\/admin/);
        if (name === LABELS.signIn) assert.match(decodeURIComponent(href), /\/login\?rd=http:\/\/127\.0\.0\.1:\d+\/guide$/);
    }
}

async function noHorizontalScroll(page) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');
}

async function shot(page, name) {
    if (shots) await page.screenshot({ path: join(shots, `navbar-${name}.png`) });
}

for (const profile of Object.keys(PROFILES)) {
    for (const width of VIEWPORTS) {
        test(`visible navbar entries for ${profile} at ${width}px`, async () => {
            const { page, context, errors } = await fixture({ profile, width });
            try {
                const expected = expectedNavbar(profile, width);
                await page.goto(`${origin}/guide`);
                await eventually(() => names(header(page)), expected.bar, 'bar');
                assertDestinations(await links(header(page)), profile);
                await noHorizontalScroll(page);
                await shot(page, `${profile}-${width}`);
                if (expected.menu) {
                    await trigger(page).click();
                    await eventually(() => names(mobileMenu(page)), expected.menu, 'menu');
                    assertDestinations(await links(mobileMenu(page)), profile);
                    await shot(page, `${profile}-${width}-menu`);
                } else {
                    assert.equal(await trigger(page).isVisible(), false, 'no three-dot menu from 1024px');
                    assert.equal(await areaTrigger(page).count(), expected.areas ? 1 : 0, 'Area selector');
                    if (expected.areas) {
                        await areaTrigger(page).click();
                        await eventually(() => names(areaPanel(page)), expected.areas, 'areas');
                        assertDestinations(await links(areaPanel(page)), profile);
                        await shot(page, `${profile}-${width}-areas`);
                        await page.keyboard.press('Escape');
                    }
                    await accountTrigger(page).click();
                    await eventually(() => names(accountPanel(page)), expected.account, 'account');
                    assertDestinations(await links(accountPanel(page)), profile);
                    await noHorizontalScroll(page);
                    await shot(page, `${profile}-${width}-account`);
                }
                assert.deepEqual(errors, []);
            } finally { await context.close(); }
        });
    }
}

// The satisfaction questionnaire left the navbar for the home page: the
// introduction, or the sign-in screen anonymous people get on `/`.
test('the satisfaction questionnaire is on the home page, not in the navbar', async () => {
    for (const [profile, width, screen] of [['A', 390, 'main'], ['S', 1440, '[data-testid="intro-screen"]']]) {
        const { page, context, errors } = await fixture({ profile, width });
        try {
            await page.goto(`${origin}/`);
            const feedback = page.locator(screen).getByRole('link', { name: /^Dicci com’è andata/ });
            await feedback.waitFor();
            assert.equal(await feedback.getAttribute('href'), '/questionario');
            const expected = expectedNavbar(profile, width);
            await eventually(() => names(header(page)), expected.bar, `${profile} bar`);
            // Below 1024px the three-dot menu, from 1024px the account menu (P4).
            await (expected.menu ? trigger(page) : accountTrigger(page)).click();
            await eventually(() => names(expected.menu ? mobileMenu(page) : accountPanel(page)), expected.menu ?? expected.account, `${profile} menu`);
            assert.equal(await header(page).locator('a[href="/questionario"]').count(), 0);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    }
});

// P3/P4: same entries on every page; the «Area» selector names the current
// area and marks it with aria-current="page" in its panel, inside the named
// navigation landmark.
test('the navbar marks the current page in a named navigation landmark', async () => {
    const { page, context } = await fixture({ profile: 'D', width: 1280 });
    // After /guide the dev server keeps optimising its screenshots: those
    // /_next/image requests hold the browser's six connections and the next
    // page waited in the queue for minutes (P2 notes). Images are not navbar.
    await context.route('**/_next/image**', route => route.abort());
    try {
        for (const [path, bar, area, inPanel] of [['/guide', [LABELS.guide], null, []], ['/profilo', [], LABELS.student, [LABELS.student]], ['/docente', [], LABELS.teacher, [LABELS.teacher]], ['/questionario', [], null, []]]) {
            await page.goto(`${origin}${path}`);
            await eventually(() => names(header(page)), expectedNavbar('D', 1280, { area }).bar, path);
            assert.deepEqual(await currentNames(header(page)), bar, `${path} bar`);
            assert.deepEqual(await landmarks(header(page)), ['Navigazione principale'], `${path} bar landmark`);
            await areaTrigger(page).click();
            assert.deepEqual(await currentNames(areaPanel(page)), inPanel, `${path} Area selector`);
            assert.deepEqual(await landmarks(header(page)), ['Navigazione principale'], `${path} selector inside the landmark`);
            await page.keyboard.press('Escape');
        }
    } finally { await context.close(); }
});

test('compact menu marks the current page; a single area is a current link from lg', async () => {
    for (const [profile, width, path, current, menuLandmarks] of [['S', 390, '/profilo', [LABELS.student], ['Navigazione del menu']], ['S', 1024, '/profilo', [LABELS.student], null], ['A', 1024, '/guide', [LABELS.guide], null]]) {
        const { page, context } = await fixture({ profile, width });
        try {
            await page.goto(`${origin}${path}`);
            await eventually(() => names(header(page)), expectedNavbar(profile, width).bar, `${profile} bar`);
            if (menuLandmarks) {
                await trigger(page).click();
                await eventually(() => names(mobileMenu(page)), expectedNavbar(profile, width).menu, `${profile} menu`);
                assert.deepEqual(await landmarks(mobileMenu(page)), menuLandmarks, `${profile} menu landmark`);
            } else {
                assert.deepEqual(await landmarks(header(page)), ['Navigazione principale'], `${profile}: one landmark from lg`);
            }
            const all = [...await currentNames(header(page)), ...(menuLandmarks ? await currentNames(mobileMenu(page)) : [])];
            assert.deepEqual(all, current, `${profile} at ${width}px`);
        } finally { await context.close(); }
    }
});

test('one identity read; opening the menu reads no access again', async () => {
    const { page, context, reads } = await fixture({ profile: 'S2', width: 390 });
    try {
        await page.goto(`${origin}/guide`);
        await eventually(() => names(header(page)), expectedNavbar('S2', 390).bar, 'bar');
        await trigger(page).click();
        await mobileMenu(page).getByLabel(LABELS.view, { exact: true }).waitFor();
        const accessReads = reads.filter(path => path === '/api/user/access').length;
        for (let i = 0; i < 2; i++) {
            await page.keyboard.press('Escape');
            await trigger(page).click();
            await mobileMenu(page).getByLabel(LABELS.view, { exact: true }).waitFor();
        }
        await page.waitForTimeout(500);
        assert.equal(reads.filter(path => path === '/api/auth/me').length, 1, 'identity');
        assert.equal(reads.filter(path => path === '/api/user/access').length, accessReads, 'access');
    } finally { await context.close(); }
});

for (const [locale, copy] of Object.entries(LOCALIZED)) {
    test(`role entries and guest access in ${locale}`, async () => {
        for (const [profile, width] of [['R', 390], ['R', 1440], ['A', 1440]]) {
            const { page, context } = await fixture({ profile, width, locale });
            try {
                await page.goto(`${origin}/guide`);
                let visible, wanted, absent;
                if (width < 1024) {
                    await page.getByRole('button', { name: copy.menu, exact: true }).click();
                    visible = [...await names(header(page)), ...await names(mobileMenu(page))];
                    wanted = [copy.bussola, copy.assistant, copy.guide, copy.student, copy.menu, copy.teacher, copy.admin, copy.logout];
                    absent = [copy.adminLogin];
                } else if (profile === 'A') {
                    await page.getByRole('button', { name: copy.preferences, exact: true }).click();
                    visible = [...await names(header(page)), ...await names(accountPanel(page))];
                    wanted = [copy.guide, copy.preferences, copy.signIn];
                    absent = [copy.student, copy.teacher, copy.admin, copy.signOut, copy.logout, copy.adminLogin, copy.area];
                } else {
                    await page.getByRole('button', { name: copy.area, exact: true }).click();
                    visible = [...await names(header(page)), ...await names(areaPanel(page))];
                    await page.keyboard.press('Escape');
                    await page.getByRole('button', { name: `${copy.account}${PROFILES.R.identity.name}`, exact: true }).click();
                    visible.push(...await names(accountPanel(page)));
                    wanted = [copy.area, copy.bussolaBar, copy.assistant, copy.guide, copy.student, copy.teacher, copy.admin, copy.signOut];
                    absent = [copy.signIn, copy.adminLogin, copy.menu];
                }
                assert.equal(await page.evaluate(() => document.documentElement.lang), locale);
                assert.deepEqual(visible.filter(name => wanted.includes(name)), [...new Set(visible.filter(name => wanted.includes(name)))], 'no duplicate entry');
                for (const name of wanted) assert.ok(visible.includes(name), `${locale} ${profile} ${width}: ${name}`);
                for (const name of absent) assert.equal(visible.includes(name), false, `${locale} ${profile} ${width}: ${name}`);
            } finally { await context.close(); }
        }
    });
}

for (const width of [390, 1024, 1440]) {
    test(`placeholders while the identity loads at ${width}px`, async () => {
        const gate = deferred();
        const { page, context } = await fixture({ profile: 'D', width, auth: gate });
        try {
            await page.goto(`${origin}/guide`);
            await eventually(() => names(header(page)), expectedNavbar('D', width, { loading: true }).bar, 'loading');
            assert.equal(await trigger(page).count(), 0);
            gate.release();
            await eventually(() => names(header(page)), expectedNavbar('D', width).bar, 'loaded');
        } finally { await context.close(); }
    });
}

test('Compass and Assistant wait for the class access', async () => {
    const gate = deferred();
    const { page, context } = await fixture({ profile: 'S1', width: 1024, access: gate });
    try {
        await page.goto(`${origin}/guide`);
        await eventually(() => names(header(page)), expectedNavbar('S1', 1024, { accessLoading: true, override: { view: [] } }).bar, 'access pending');
        gate.release();
        await eventually(() => names(header(page)), expectedNavbar('S1', 1024).bar, 'access loaded');
    } finally { await context.close(); }
});

for (const failure of ['error', 'abort']) {
    for (const width of [390, 1440]) {
        test(`identity ${failure} falls back to the guest navbar at ${width}px`, async () => {
            const { page, context } = await fixture({ profile: 'D', width, auth: failure });
            try {
                const expected = expectedNavbar('A', width);
                await page.goto(`${origin}/guide`);
                await eventually(() => names(header(page)), expected.bar, 'bar');
                await (expected.menu ? trigger(page) : accountTrigger(page)).click();
                await eventually(() => names(expected.menu ? mobileMenu(page) : accountPanel(page)), expected.menu ?? expected.account, 'menu');
            } finally { await context.close(); }
        });
    }
    test(`class access ${failure} shows every tool, without the view selector`, async () => {
        const { page, context } = await fixture({ profile: 'S1', width: 1024, access: failure });
        try {
            await page.goto(`${origin}/guide`);
            await eventually(() => names(header(page)), expectedNavbar('S1', 1024, { override: { bussola: true, assistant: true, view: [] } }).bar);
        } finally { await context.close(); }
    });
}

for (const width of [390, 1440]) {
    test(`resume list error offers a retry at ${width}px`, async () => {
        const { page, context, state } = await fixture({ profile: 'S', width, frozen: 'error' });
        try {
            await page.goto(`${origin}/guide`);
            const failed = expectedNavbar('S', width, { resume: { rows: [], error: true } });
            await eventually(() => names(header(page)), failed.bar, 'bar');
            const list = width < 1024 ? mobileMenu(page) : resumePanel(page);
            await (width < 1024 ? trigger(page) : header(page).getByRole('button', { name: LABELS.resume, exact: true })).click();
            if (width < 1024) await eventually(() => names(list), failed.menu, 'menu');
            state.frozen = FROZEN_ROWS;
            await list.getByRole('button', { name: LABELS.retry, exact: true }).click();
            const rows = FROZEN_ROWS.map(row => row.label);
            await eventually(() => names(list), width < 1024
                ? expectedNavbar('S', width, { resume: { rows } }).menu
                : rows.flatMap(label => [label, `${LABELS.deleteSession}: ${label}`]), 'after retry');
        } finally { await context.close(); }
    });
}

for (const [profile, allowed] of [['S', ['QSA', 'SAVICKAS']], ['S1', ['QSA']]]) {
    for (const width of [390, 1440]) {
        test(`resumable sessions follow the class tools for ${profile} at ${width}px`, async () => {
            const { page, context } = await fixture({ profile, width, frozen: FROZEN_ROWS });
            try {
                const rows = FROZEN_ROWS.filter(row => allowed.includes(row.questionnaire_type)).map(row => row.label);
                const expected = expectedNavbar(profile, width, { resume: { rows } });
                await page.goto(`${origin}/guide`);
                await eventually(() => names(header(page)), expected.bar, 'bar');
                if (width < 1024) {
                    await trigger(page).click();
                    await eventually(() => names(mobileMenu(page)), expected.menu, 'menu');
                } else {
                    await header(page).getByRole('button', { name: LABELS.resume, exact: true }).click();
                    await eventually(() => names(resumePanel(page)), rows.flatMap(label => [label, `${LABELS.deleteSession}: ${label}`]), 'popover');
                }
                for (const row of FROZEN_ROWS.filter(row => allowed.includes(row.questionnaire_type))) {
                    const link = page.getByRole('link', { name: row.label, exact: true });
                    assert.equal(await link.getAttribute('href'), `/?frozen=${row.session_id}`);
                }
            } finally { await context.close(); }
        });
    }
}

const pqblRow = `${LABELS.resumeLocal} · ${LABELS.pqbl}`;
const pqblStorage = { counselorbot_pqbl_progress_v1: JSON.stringify(PQBL_PROGRESS) };

test('pQBL progress is listed as resumable when the class allows it', async () => {
    const { page, context } = await fixture({ profile: 'S', width: 390, storage: pqblStorage });
    try {
        await page.goto(`${origin}/guide`);
        await trigger(page).click();
        await eventually(() => names(mobileMenu(page)), expectedNavbar('S', 390, { resume: { rows: [pqblRow] } }).menu);
        assert.equal(await mobileMenu(page).getByRole('link', { name: pqblRow, exact: true }).getAttribute('href'), '/profilo/pqbl');
    } finally { await context.close(); }
});

// Contract decided in P0 (N7): a class that turns pQBL off hides its resume
// entry like the other resumable sessions, because continuing is a write the
// server rejects; the local progress is kept, the page stays readable.
test('pQBL resume is hidden when the class turns pQBL off (N7)', async () => {
    const { page, context } = await fixture({ profile: 'S1', width: 390, storage: pqblStorage });
    try {
        await page.goto(`${origin}/guide`);
        await trigger(page).click();
        // Access is loaded once the class-filtered Compass entry is listed.
        await mobileMenu(page).getByRole('link', { name: LABELS.bussola, exact: true }).waitFor();
        assert.deepEqual(await names(mobileMenu(page)), expectedNavbar('S1', 390).menu);
        assert.ok(await page.evaluate(() => localStorage.getItem('counselorbot_pqbl_progress_v1')), 'progress kept');
    } finally { await context.close(); }
});

test('class view switch updates the navbar without a reload', async () => {
    const { page, context, writes } = await fixture({ profile: 'S2', width: 1024 });
    try {
        await page.goto(`${origin}/guide`);
        await eventually(() => names(header(page)), expectedNavbar('S2', 1024).bar, 'class view');
        const select = header(page).getByLabel(LABELS.view, { exact: true });
        assert.deepEqual(await select.locator('option').allTextContents(), PROFILES.S2.expect.view);
        await select.selectOption('all');
        await eventually(() => names(header(page)), expectedNavbar('S2', 1024, { override: { bussola: true } }).bar, 'full view');
        assert.deepEqual(writes, [{ path: '/api/user/access/view', body: { view: 'all' } }]);
    } finally { await context.close(); }
});

test('menu disclosure: keyboard open, Escape closes and returns focus', async () => {
    const { page, context } = await fixture({ profile: 'D', width: 390 });
    try {
        await page.goto(`${origin}/guide`);
        await trigger(page).waitFor();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Vai al contenuto');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), LABELS.home);
        await trigger(page).focus();
        await page.keyboard.press('Enter');
        assert.equal(await trigger(page).getAttribute('aria-expanded'), 'true');
        await page.keyboard.press('Tab');
        assert.ok(await page.evaluate(() => Boolean(document.activeElement?.closest('#mobile-menu'))));
        await page.keyboard.press('Escape');
        assert.equal(await mobileMenu(page).count(), 0);
        assert.equal(await trigger(page).getAttribute('aria-expanded'), 'false');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-controls')), 'mobile-menu');
    } finally { await context.close(); }
});

// P2 (audit N4/N8), P4: three-dot menu, Riprendi, «Area» selector and account
// menu share one disclosure pattern.
const focusedName = page => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim());
const focusedPanel = page => page.evaluate(panels => document.activeElement?.closest(panels)?.id || null, PANELS);

test('area, resume and account panels are disclosures with Tab and Escape', async () => {
    const { page, context } = await fixture({ profile: 'D', width: 1440, frozen: FROZEN_ROWS });
    try {
        await page.goto(`${origin}/guide`);
        await eventually(() => names(header(page)), expectedNavbar('D', 1440, { resume: { rows: FROZEN_ROWS.map(row => row.label) } }).bar, 'bar');
        for (const id of ['area-panel', 'resume-panel', 'account-panel']) {
            const button = page.locator(`button[aria-controls="${id}"]`);
            assert.equal(await button.getAttribute('aria-expanded'), 'false', id);
            assert.equal(await button.getAttribute('aria-haspopup'), null, id);
            await button.focus();
            await page.keyboard.press('Enter');
            assert.equal(await button.getAttribute('aria-expanded'), 'true', id);
            assert.equal(await header(page).locator('[role="menu"], [role="menuitem"]').count(), 0, `${id}: no ARIA menu`);
            await page.keyboard.press('Tab');
            assert.equal(await focusedPanel(page), id, `${id}: Tab enters the panel`);
            await page.keyboard.press('Escape');
            assert.equal(await page.locator(`#${id}`).count(), 0, `${id}: Escape closes`);
            assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-controls')), id, `${id}: focus back on the trigger`);
        }
    } finally { await context.close(); }
});

test('Tab reaches every visible menu control, then leaving the menu closes it', async () => {
    const { page, context } = await fixture({ profile: 'D', width: 390, frozen: FROZEN_ROWS });
    try {
        await page.goto(`${origin}/guide`);
        await eventually(() => names(header(page)), expectedNavbar('D', 390).bar, 'bar');
        await trigger(page).focus();
        await page.keyboard.press('Enter');
        const expected = expectedNavbar('D', 390, { resume: { rows: FROZEN_ROWS.map(row => row.label) } }).menu;
        await eventually(() => names(mobileMenu(page)), expected, 'menu');
        const reached = [];
        for (let i = 0; i <= expected.length; i++) {
            await page.keyboard.press('Tab');
            if (await focusedPanel(page) !== 'mobile-menu') break;
            reached.push(await focusedName(page));
        }
        assert.deepEqual(reached, expected, 'Tab order is the visible order');
        assert.equal(await mobileMenu(page).count(), 0, 'Tab out closes the menu');
        assert.equal(await trigger(page).getAttribute('aria-expanded'), 'false');
    } finally { await context.close(); }
});

test('a language choice is exposed and keeps or returns the focus', async () => {
    for (const width of [1440, 390]) {
        const { page, context } = await fixture({ profile: 'A', width });
        try {
            await page.goto(`${origin}/guide`);
            await eventually(() => names(header(page)), expectedNavbar('A', width).bar, 'bar');
            const id = width < 1024 ? 'mobile-menu' : 'account-panel';
            await page.locator(`button[aria-controls="${id}"]`).focus();
            await page.keyboard.press('Enter');
            const panel = page.locator(`#${id}`);
            const pressed = () => panel.locator('button[aria-pressed="true"][lang]').evaluateAll(els => els.map(el => el.getAttribute('aria-label') || el.textContent.trim()));
            assert.deepEqual(await pressed(), ['Italiano'], `${width}: current language exposed`);
            const english = panel.getByRole('button', { name: 'English', exact: true });
            assert.equal(await english.getAttribute('lang'), 'en');
            await english.focus();
            await page.keyboard.press('Enter');
            assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
            if (width < 1024) {
                assert.equal(await panel.count(), 0, `${width}: choice closes the menu`);
                assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-controls')), id, `${width}: focus back on the trigger`);
                assert.equal(await header(page).getByRole('status').textContent(), 'Change language: English');
            } else {
                // Preferences change in place (P4): the panel stays, the focus
                // stays on the chosen language, now pressed.
                assert.equal(await panel.count(), 1, `${width}: panel stays open`);
                assert.equal(await focusedName(page), 'English');
                assert.deepEqual(await pressed(), ['English']);
                assert.equal(await accountTrigger(page).textContent(), 'Preferences');
            }
        } finally { await context.close(); }
    }
});

test('the theme row returns focus to the menu trigger', async () => {
    const { page, context } = await fixture({ profile: 'A', width: 390 });
    try {
        await page.goto(`${origin}/guide`);
        await eventually(() => names(header(page)), expectedNavbar('A', 390).bar, 'bar');
        await trigger(page).click();
        await mobileMenu(page).getByRole('button', { name: LABELS.darkRow, exact: true }).focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
        assert.equal(await mobileMenu(page).count(), 0);
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-controls')), 'mobile-menu');
    } finally { await context.close(); }
});

test('the focus ring keeps 3:1 on the dark header and stays inside panels', async () => {
    const { page, context } = await fixture({ profile: 'A', width: 390, dark: true });
    try {
        await page.goto(`${origin}/guide`);
        await trigger(page).waitFor();
        for (let i = 0; i < 6 && await page.evaluate(() => document.activeElement?.getAttribute('aria-controls')) !== 'mobile-menu'; i++) {
            await page.keyboard.press('Tab');
        }
        const ring = el => ({ visible: el.matches(':focus-visible'), color: getComputedStyle(el).outlineColor, offset: getComputedStyle(el).outlineOffset });
        // #67c1c4 on #1e293b: 6.97:1 (the petrol #155e63 gave 1.96:1).
        assert.deepEqual(await trigger(page).evaluate(ring), { visible: true, color: 'rgb(103, 193, 196)', offset: '2px' });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Tab');
        const inside = await page.evaluate(() => {
            const el = document.activeElement;
            return { panel: el?.closest('#mobile-menu')?.id, color: getComputedStyle(el).outlineColor, offset: getComputedStyle(el).outlineOffset };
        });
        assert.deepEqual(inside, { panel: 'mobile-menu', color: 'rgb(103, 193, 196)', offset: '-2px' });
    } finally { await context.close(); }
});

test('desktop bar and account menu keep 44px targets with a coarse pointer', async () => {
    const { page, context } = await fixture({ profile: 'A', width: 1440, touch: true });
    try {
        await page.goto(`${origin}/guide`);
        assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true, 'coarse pointer emulated');
        await eventually(() => names(header(page)), expectedNavbar('A', 1440).bar, 'bar');
        const barSizes = await header(page).locator('a:visible, button:visible').evaluateAll(els => els.filter(el => el.getAttribute('aria-label') !== 'Torna alla home').map(el => [el.getAttribute('aria-label') || el.textContent.trim(), el.getBoundingClientRect().height]));
        for (const [name, height] of barSizes) assert.ok(height >= 44, `${name}: ${height}px`);
        await accountTrigger(page).click();
        const sizes = await accountPanel(page).locator('button').evaluateAll(els => els.map(el => {
            const box = el.getBoundingClientRect();
            return Math.min(box.width, box.height);
        }));
        assert.equal(sizes.length, 3 + LABELS.languages.length, 'theme, motion, reader and six languages');
        for (const size of sizes) assert.ok(size >= 44, `option ${size}px`);
    } finally { await context.close(); }
});

test('theme and motion entries follow the stored and system preferences', async () => {
    const swap = list => list.filter(name => name !== LABELS.motion)
        .map(name => name === LABELS.darkIcon ? LABELS.lightIcon : name === LABELS.darkRow ? LABELS.lightRow : name);
    for (const width of [390, 1440]) {
        const { page, context } = await fixture({ profile: 'A', width, dark: true, reducedMotion: 'reduce' });
        try {
            const expected = expectedNavbar('A', width);
            await page.goto(`${origin}/guide`);
            await eventually(() => names(header(page)), swap(expected.bar), 'bar');
            await (expected.menu ? trigger(page) : accountTrigger(page)).click();
            await eventually(() => names(expected.menu ? mobileMenu(page) : accountPanel(page)), swap(expected.menu ?? expected.account), 'menu');
        } finally { await context.close(); }
    }
});

// P4: «Accedi» returns to the current page, query included; from /admin it
// keeps the explicit admin access. External requests are aborted: the test
// reads the sign-in request the click starts.
test('guest sign-in returns to the current page, /admin included', async () => {
    const { page, context } = await fixture({ profile: 'A', width: 1280 });
    try {
        for (const path of ['/guide?sezione=accesso', '/admin']) {
            await page.goto(`${origin}${path}`);
            const signIn = header(page).getByRole('link', { name: LABELS.signIn, exact: true });
            await signIn.waitFor();
            const request = page.waitForRequest(request => new URL(request.url()).pathname === '/login' && request.url().includes('rd='));
            await signIn.click();
            const rd = new URL((await request).url()).searchParams.get('rd');
            assert.equal(rd, `${new URL(origin).origin}${path}`, path);
        }
    } finally { await context.close(); }
});

// Role preview: the real admin sees the bar of the previewed account, never
// the Area selector entries or the services of the real role.
test('a role preview shows the previewed account in the desktop bar', async () => {
    for (const [username, name, like] of [['studente.demo', 'Alice Bianchi', 'S'], ['docente.demo', 'Prof.ssa Neri', 'D']]) {
        const { page, context } = await fixture({ profile: 'M', width: 1440 });
        try {
            await page.goto(`${origin}/guide?view_as=${username}`);
            const expected = expectedNavbar(like, 1440);
            const bar = expected.bar.map(label => label === LABELS.account(PROFILES[like].identity.name) ? LABELS.account(name) : label);
            await eventually(() => names(header(page)), bar, username);
            if (expected.areas) {
                await areaTrigger(page).click();
                assert.deepEqual(await names(areaPanel(page)), expected.areas, `${username} areas`);
                await page.keyboard.press('Escape');
            }
            await accountTrigger(page).click();
            assert.deepEqual(await names(accountPanel(page)), expected.account, `${username} account`);
            assert.equal(await accountPanel(page).getByText(LABELS.services).count(), 0);
        } finally { await context.close(); }
    }
});

// Visible controls of the header: inside the viewport, not overlapping, labels
// of the navigation not cut.
function headerFit(page) {
    return header(page).evaluate(root => {
        const els = [...root.querySelectorAll('a, button, select')].filter(el => !el.closest('#mobile-menu, #resume-panel, #area-panel, #account-panel') && el.checkVisibility({ checkVisibilityCSS: true }));
        const boxes = els.map(el => ({ name: el.getAttribute('aria-label') || el.textContent.trim(), rect: el.getBoundingClientRect() }));
        const overlaps = boxes.flatMap((a, i) => boxes.slice(i + 1)
            .filter(b => Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > 1 && Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > 1)
            .map(b => `${a.name} / ${b.name}`));
        const outside = boxes.filter(({ rect }) => rect.left < 0 || rect.right > innerWidth || rect.top < 0 || rect.bottom > root.getBoundingClientRect().bottom).map(({ name }) => name);
        const cut = [...root.querySelectorAll('nav span')].filter(el => el.checkVisibility() && el.scrollWidth > el.clientWidth + 1).map(el => el.textContent);
        return { overlaps, outside, cut };
    });
}

const LONG_NAME = 'Maximiliane-Charlotte von Hohenzollern-Sigmaringen';
for (const locale of ['de', 'fr']) {
    for (const width of [1024, 1280, 1440]) {
        test(`long names in ${locale} fit the desktop bar at ${width}px`, async () => {
            // Admin inside the teacher area (longest selector label), student
            // with two classes (view selector) in the student area.
            for (const [profile, path] of [['M', '/docente'], ['S2', '/profilo']]) {
                const { page, context } = await fixture({ profile, width, locale, frozen: FROZEN_ROWS, identity: { name: LONG_NAME } });
                try {
                    await page.goto(`${origin}${path}`);
                    await accountTrigger(page).waitFor();
                    await page.locator('button[aria-controls="resume-panel"]').waitFor();
                    await header(page).getByText('Counselor Sintetico', { exact: true }).waitFor();
                    assert.deepEqual(await headerFit(page), { overlaps: [], outside: [], cut: [] }, `${profile} ${locale} ${width}`);
                    await noHorizontalScroll(page);
                    await shot(page, `long-${profile}-${locale}-${width}`);
                    await accountTrigger(page).click();
                    const panel = await accountPanel(page).boundingBox();
                    assert.ok(panel.x >= 0 && panel.x + panel.width <= width, 'account panel inside the viewport');
                } finally { await context.close(); }
            }
        });
    }
}

// Browser zoom 200% halves the CSS viewport: a 2048px window gives the 1024px
// desktop bar, a 1440px window the compact bar (P5), both at DPR 2.
test('zoom 200%: the bar still fits, the menu or the account panel opens', async () => {
    for (const width of [1024, 720]) {
        const { page, context } = await fixture({ profile: 'R', width, scale: 2, frozen: FROZEN_ROWS });
        try {
            await page.goto(`${origin}/guide`);
            const expected = expectedNavbar('R', width, { resume: { rows: FROZEN_ROWS.map(row => row.label) } });
            await eventually(() => names(header(page)), expected.bar, 'bar');
            await header(page).getByText('Counselor Sintetico', { exact: true }).or(trigger(page)).first().waitFor();
            assert.deepEqual(await headerFit(page), { overlaps: [], outside: [], cut: [] }, `${width}px at 200%`);
            await noHorizontalScroll(page);
            await (width < 1024 ? trigger(page) : accountTrigger(page)).click();
            const panel = await (width < 1024 ? mobileMenu(page) : accountPanel(page)).boundingBox();
            assert.ok(panel.x >= 0 && panel.x + panel.width <= width, 'panel inside the viewport');
            await shot(page, `zoom200-${width}`);
        } finally { await context.close(); }
    }
});
