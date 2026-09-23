import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { categoryText } from '../src/lib/i18n-institution-categories.ts';
const origin = process.env.CATEGORIES_BASE_URL || 'http://127.0.0.1:3108';
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function fixture(lang) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const school = id => ({ id, name: `Istituto ${id}`, slug: `school-${id}`, kind: 'school' });
    const category = (id, name) => ({ id, name, description: 'Descrizione scelta dai docenti' });
    const referral = (id, institution_id, category_ids) => ({ id, institution_id, category_ids, role: id, person: '', needs: ['scelta-percorso'], what_for: '', how_to_reach: '', email: '', hours: '', location: '', page_url: '' });
    const event = (id, institution_id, category_ids) => ({ id, institution_id, category_ids, title: id, starts_at: '2026-11-10T10:00:00Z', needs: ['scelta-percorso'], page_url: '', summary: '', location: '', is_online: false });
    const first = { institution: school(1), categories: [category('1-a', 'Risorse'), category('1-b', 'Esperienze')], referrals: [referral('Contatto esperienze', 1, ['1-b']), referral('Contatto senza categoria', 1, [])], events: [event('Appuntamento risorse', 1, ['1-a'])] };
    const second = { institution: school(2), categories: [category('2-a', 'Risorse')], referrals: [referral('Contatto secondo istituto', 2, ['2-a'])], events: [] };
    const data = { institution: school(1), institution_groups: [first, second], referrals: [...first.referrals, ...second.referrals, referral('Contatto nazionale', null, [])], events: [...first.events] };
    let failing = false;
    await page.route('**/api/**', route => {
        assert.equal(route.request().method(), 'GET');
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/orientation-directory') return failing ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: data });
        let value = [];
        if (path === '/api/auth/me') value = { authenticated: true, username: 'student.demo', groups: ['studenti'], is_admin: false };
        else if (path === '/api/user/account-preferences') value = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (path === '/api/orientation/status') value = { required: false, completed: true };
        else if (path === '/api/tavolo/enabled') value = { enabled: false };
        return route.fulfill({ json: value });
    });
    return { page, context, data, errors, fail: value => { failing = value; }, open: () => page.goto(`${origin}/profilo/orientamento`, { waitUntil: 'networkidle' }) };
}

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) test(`student filters isolate institutions and keep national content visible (${lang})`, async () => {
    const f = await fixture(lang); const { page } = f;
    try {
        await f.open();
        const first = page.getByRole('region', { name: 'Istituto 1', exact: true });
        const second = page.getByRole('region', { name: 'Istituto 2', exact: true });
        const national = page.getByRole('region', { name: categoryText(lang, 'national'), exact: true });
        await first.getByRole('button', { name: 'Risorse', exact: true }).click();
        assert.equal(await first.getByText('Contatto esperienze', { exact: true }).count(), 0);
        assert.equal(await first.getByText('Contatto senza categoria', { exact: true }).count(), 0);
        assert.ok(await first.getByText('Appuntamento risorse', { exact: true }).isVisible());
        assert.ok(await second.getByText('Contatto secondo istituto', { exact: true }).isVisible());
        assert.ok(await national.getByText('Contatto nazionale', { exact: true }).isVisible());
        assert.equal(await page.getByText('Contatto nazionale', { exact: true }).count(), 1);
        await first.getByRole('button', { name: 'Esperienze', exact: true }).focus(); await page.keyboard.press('Enter');
        assert.equal(await first.getByRole('button', { name: 'Esperienze', exact: true }).getAttribute('aria-pressed'), 'true');
        assert.ok(await first.getByText('Contatto esperienze', { exact: true }).isVisible());
        assert.equal(await first.getByText('Appuntamento risorse', { exact: true }).count(), 0);
        await first.getByRole('group', { name: categoryText(lang, 'categories'), exact: true }).getByRole('button').first().click();
        assert.ok(await first.getByText('Contatto senza categoria', { exact: true }).isVisible());
        assert.equal(await page.getByRole('button', { name: /Scelta del percorso/ }).count(), 0);
        for (const width of [320, 390, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            if (lang === 'it') { await page.addStyleTag({ content: 'nextjs-portal { display:none }' }); await page.screenshot({ path: `/tmp/institution-directory-${width}.png`, fullPage: true }); }
        }
        await page.evaluate(() => document.documentElement.classList.add('dark'));
        if (lang === 'it') await page.screenshot({ path: '/tmp/institution-directory-dark.png', fullPage: true });
        await first.getByRole('button', { name: 'Risorse', exact: true }).click();
        f.data.institution_groups[0].categories = [];
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await first.getByRole('group').count(), 0);
        assert.ok(await first.getByText('Contatto senza categoria', { exact: true }).isVisible());
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});

test('directory retries errors and works with only national content', async () => {
    const f = await fixture('it');
    try {
        f.fail(true); await f.open();
        f.fail(false); f.data.institution = null; f.data.institution_groups = [];
        await f.page.getByRole('button', { name: categoryText('it', 'retry'), exact: true }).click();
        await f.page.getByText('Contatto nazionale', { exact: true }).waitFor();
        assert.equal(await f.page.getByRole('group', { name: categoryText('it', 'categories'), exact: true }).count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});


test('older directory response never labels another institution as the first', async () => {
    const f = await fixture('it');
    try {
        delete f.data.institution_groups;
        await f.open();
        await f.page.getByText('Contatto senza categoria', { exact: true }).waitFor();
        assert.equal(await f.page.getByText('Contatto secondo istituto', { exact: true }).count(), 0);
        assert.ok(await f.page.getByText('Contatto nazionale', { exact: true }).isVisible());
        assert.equal(await f.page.getByRole('group', { name: categoryText('it', 'categories'), exact: true }).count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.context.close(); }
});
