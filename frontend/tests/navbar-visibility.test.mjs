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
async function fixture({ profile = 'S', width = 1440, locale = 'it', dark = false, reducedMotion = 'no-preference', auth = 'ok', access = 'ok', frozen = [], storage = {} } = {}) {
    const { identity } = PROFILES[profile];
    let accessPayload = PROFILES[profile].access;
    const state = { frozen };
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
    await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(SETTLE_MS);
    page.setDefaultNavigationTimeout(600000);
    const errors = [], writes = [];
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
    return { page, context, errors, writes, state };
}

const header = page => page.locator('header.console-header');
const trigger = page => page.locator('button[aria-controls="mobile-menu"]');
const mobileMenu = page => page.locator('#mobile-menu');

// Accessible names of the controls a person can see, in DOM order. The bar
// excludes the open menu; the menu and resume popover are read on their own.
function names(locator) {
    return locator.evaluate(root => [...root.querySelectorAll('a, button, select')]
        .filter(el => root.id === 'mobile-menu' || !el.closest('#mobile-menu, [role="menu"]'))
        .filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
        .map(el => el.getAttribute('aria-label') || el.labels?.[0]?.textContent?.trim() || el.textContent.trim()));
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
        if (name === PROFILES[profile].identity.name) assert.equal(href, '/profilo');
        if (name === LABELS.logout) assert.match(href, /\/logout/);
        if (name === LABELS.adminLogin) assert.match(decodeURIComponent(href), /\/admin/);
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
                await trigger(page).click();
                await eventually(() => names(mobileMenu(page)), expected.menu, 'menu');
                assertDestinations(await links(mobileMenu(page)), profile);
                await shot(page, `${profile}-${width}-menu`);
                assert.deepEqual(errors, []);
            } finally { await context.close(); }
        });
    }
}

test('the navbar ignores the current page: same entries, no current marker', async () => {
    const { page, context } = await fixture({ profile: 'D', width: 1280 });
    try {
        for (const path of ['/guide', '/profilo', '/docente', '/questionario']) {
            await page.goto(`${origin}${path}`);
            await eventually(() => names(header(page)), expectedNavbar('D', 1280).bar, path);
            assert.equal(await header(page).locator('[aria-current]').count(), 0, path);
            assert.equal(await header(page).locator('nav').count(), 0, `${path} has no navigation landmark`);
        }
    } finally { await context.close(); }
});

for (const [locale, copy] of Object.entries(LOCALIZED)) {
    test(`role entries and guest access in ${locale}`, async () => {
        for (const [profile, width] of [['R', 390], ['R', 1440], ['A', 1440]]) {
            const { page, context } = await fixture({ profile, width, locale });
            try {
                await page.goto(`${origin}/guide`);
                await page.getByRole('button', { name: copy.menu, exact: true }).click();
                assert.equal(await page.evaluate(() => document.documentElement.lang), locale);
                const visible = [...await names(header(page)), ...await names(mobileMenu(page))];
                const wanted = profile === 'A'
                    ? [copy.guide, copy.menu, copy.adminLogin]
                    : [copy.bussola, copy.assistant, copy.guide, copy.student, copy.menu, copy.teacher, copy.admin, copy.logout];
                assert.deepEqual(visible.filter(name => wanted.includes(name)), [...new Set(visible.filter(name => wanted.includes(name)))], 'no duplicate entry');
                for (const name of wanted) assert.ok(visible.includes(name), `${locale} ${profile} ${width}: ${name}`);
                for (const name of profile === 'A' ? [copy.student, copy.teacher, copy.admin, copy.logout] : [copy.adminLogin]) {
                    assert.equal(visible.includes(name), false, `${locale} ${profile}: ${name}`);
                }
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
                await trigger(page).click();
                await eventually(() => names(mobileMenu(page)), expected.menu, 'menu');
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
            const list = width < 1280 ? mobileMenu(page) : header(page).locator('[role="menu"]');
            await (width < 1280 ? trigger(page) : header(page).getByRole('button', { name: LABELS.resume, exact: true })).click();
            if (width < 1280) await eventually(() => names(list), failed.menu, 'menu');
            state.frozen = FROZEN_ROWS;
            await list.getByRole('button', { name: LABELS.retry, exact: true }).click();
            const rows = FROZEN_ROWS.map(row => row.label);
            await eventually(() => names(list), width < 1280
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
                if (width < 1280) {
                    await trigger(page).click();
                    await eventually(() => names(mobileMenu(page)), expected.menu, 'menu');
                } else {
                    await header(page).getByRole('button', { name: LABELS.resume, exact: true }).click();
                    await eventually(() => names(header(page).locator('[role="menu"]')), rows.flatMap(label => [label, `${LABELS.deleteSession}: ${label}`]), 'popover');
                }
                for (const row of FROZEN_ROWS.filter(row => allowed.includes(row.questionnaire_type))) {
                    const link = page.getByRole(width < 1280 ? 'link' : 'menuitem', { name: row.label, exact: true });
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

test('theme and motion entries follow the stored and system preferences', async () => {
    const swap = list => list.filter(name => name !== LABELS.motion)
        .map(name => name === LABELS.darkIcon ? LABELS.lightIcon : name === LABELS.darkRow ? LABELS.lightRow : name);
    for (const width of [390, 1440]) {
        const { page, context } = await fixture({ profile: 'A', width, dark: true, reducedMotion: 'reduce' });
        try {
            const expected = expectedNavbar('A', width);
            await page.goto(`${origin}/guide`);
            await eventually(() => names(header(page)), swap(expected.bar), 'bar');
            await trigger(page).click();
            await eventually(() => names(mobileMenu(page)), swap(expected.menu), 'menu');
        } finally { await context.close(); }
    }
});
