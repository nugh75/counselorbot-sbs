import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.LEGACY_ROUTES_BASE_URL || 'http://127.0.0.1:3147';
const query = 'tag=uno&tag=due&next=%2Fprofilo%3Fsection%3Dresults&label=caff%C3%A8+%26+t%C3%A8&empty=';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

for (const pathname of ['/strumenti', '/strumenti/']) {
    for (const search of ['', `?${query}`, `?view=intro&${query}`]) {
        test(`HTTP 308: ${pathname}${search}`, async () => {
            let current = new URL(pathname + search, origin);
            let redirects = 0;
            while (true) {
                const response = await fetch(current, { redirect: 'manual' });
                await response.text();
                if (response.status === 200) break;
                assert.equal(response.status, 308);
                assert.ok(++redirects <= 2, 'no redirect loop (at most slash normalization + catalog)');
                const location = response.headers.get('location');
                assert.ok(location);
                current = new URL(location, current);
                if (current.pathname === '/strumenti') continue;
                assert.equal(current.pathname, '/');
                assert.equal(current.searchParams.get('view'), 'home');
                const preserved = new URLSearchParams(search);
                preserved.delete('view');
                const actual = new URLSearchParams(current.search);
                actual.delete('view');
                assert.deepEqual([...actual], [...preserved]);
            }
            assert.ok(redirects > 0);
            assert.equal(current.pathname, '/');
            assert.equal(current.searchParams.get('view'), 'home');
        });
    }
}

test('HTTP deep links stay on their instrument page, with query intact', async () => {
    for (const id of ['QSA', 'IDEA', 'CUSTOM_FIXTURE']) {
        const url = new URL(`/strumenti/${id}?${query}`, origin);
        const response = await fetch(url, { redirect: 'manual' });
        await response.text();
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('location'), null);
        assert.equal(response.url, url.href);
    }
});

test('existing operational-plan and counselorbot redirects still work', async () => {
    for (const [source, destination] of [
        ['/docente/percorsi', '/docente/piani-operativi'],
        ['/profilo/percorsi/12/34/approfondimento', '/profilo/piani-operativi/12/34/approfondimento'],
        ['/counselorbot/strumenti/QSA', '/strumenti/QSA'],
    ]) {
        const response = await fetch(`${origin}${source}?${query}`, { redirect: 'manual' });
        await response.text();
        assert.equal(response.status, 308);
        const location = new URL(response.headers.get('location'), origin);
        assert.equal(location.pathname, destination);
        assert.deepEqual([...location.searchParams], [...new URLSearchParams(query)]);
    }
});

async function fixture(options = {}) {
    const context = await browser.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block', ...options });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    page.setDefaultNavigationTimeout(90_000);
    await page.addInitScript(() => { localStorage.setItem('cb_lang', 'it'); });
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, username: 'legacy-fixture', groups: ['studenti'], is_admin: false };
        else if (url.pathname === '/api/user/access') data = { restricted: false, classes: [] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true };
        else if (url.pathname === '/api/groups/join') data = { name: 'Classe sintetica' };
        return route.fulfill({ json: data });
    });
    return { context, page };
}

test('browser keeps the anchor and Back/Forward follows the HTTP redirect', async () => {
    // Isolate HTTP/browser fragment inheritance from the home app, which consumes
    // its entry query with replaceState after hydration. Rendering is tested below.
    const { context, page } = await fixture({ javaScriptEnabled: false });
    try {
        await page.goto(`${origin}/guide`);
        // Next orders the merged query freely: compare parameters, not the string.
        const destination = url => url.origin === origin && url.pathname === '/'
            && url.searchParams.get('view') === 'home'
            && url.searchParams.getAll('tag').join() === 'uno,due'
            && url.hash === '#home-catalog-section';
        await page.goto(`${origin}/strumenti/?tag=uno&tag=due#home-catalog-section`);
        await page.waitForURL(destination);
        await page.goBack();
        await page.waitForURL(`${origin}/guide`);
        await page.goForward();
        await page.waitForURL(destination);
    } finally { await context.close(); }
});

test('redirect renders the catalog and instrument deep links still render details', async () => {
    const { context, page } = await fixture();
    try {
        await page.goto(`${origin}/strumenti`);
        await page.getByRole('heading', { name: 'Attività e percorsi', exact: true }).waitFor();
        await page.locator('#home-catalog-section').waitFor();
        await page.goto(`${origin}/strumenti/QSA?source=legacy#details`);
        await page.getByRole('heading', { name: 'QSA', exact: true }).waitFor();
        assert.equal(page.url(), `${origin}/strumenti/QSA?source=legacy#details`);
    } finally { await context.close(); }
});

test('group invitation still links directly to the home catalog', async () => {
    const { context, page } = await fixture();
    try {
        await page.goto(`${origin}/gruppo?g=fixture`);
        const link = page.getByRole('link', { name: 'Vai agli strumenti', exact: true });
        await link.waitFor();
        assert.equal(await link.getAttribute('href'), '/?view=home');
        await link.click();
        await page.getByRole('heading', { name: 'Attività e percorsi', exact: true }).waitFor();
        await page.locator('#home-catalog-section').waitFor();
    } finally { await context.close(); }
});
