// Institute-owned credentials (#149) on synthetic intercepted APIs; no external traffic.
// Run against a dev frontend: CREDENTIALS_BASE_URL=http://127.0.0.1:3149 node --test frontend/tests/institute-credentials.test.mjs
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.CREDENTIALS_BASE_URL || 'http://127.0.0.1:3149').origin;
const SECRET = ' Synthetic-Pass 149 ';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const school = { id: 51, slug: 'synthetic', name: 'Synthetic school', kind: 'school', revision: 1, is_active: true, created_by: 'first',
    institution_code: null, credentials_configured: false, member_count: 1, needs_admin_review: false, website_url: null, orientation_page_url: null };
const plan = { id: 7, code: 'AP-SYN149', title: 'Synthetic plan', instrument_code: 'QSA', group_id: null, group_name: null, locale: 'en',
    school_level: null, scheduled_at: null, location: null, notes: null, status: 'active', institution_id: null, institution_name: null,
    institution_code: null, institution_credentials_configured: false, institution_link_state: 'unlinked', reconciliation_reason: null,
    legacy_institution_code: null, revision: 1, created_by_username: 'first', created_at: '2026-10-09T08:00:00Z', updated_at: null,
    researchers: [], responses_count: 0 };
const rules = { instrument: { code: 'QSA', name: 'QSA', response_scale_min: 1, response_scale_max: 4, response_labels: null, report_scale_type: 'stanine', status: 'validated' },
    uses_validated_norms: true, locale_status: 'validated', available_locales: ['en'], factors: [],
    items: [1, 2].map(item_number => ({ item_number, factor_code: 'C1', reverse_scoring: false, active: true, text: `Synthetic item ${item_number}` })) };

async function fixture({ lang = 'en', width = 390, role = 'docenti' } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    await context.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const state = { school: { ...school }, plans: [{ ...plan }], writes: [], urls: [], errors: [], respond: {} };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url()), path = url.pathname;
        if (url.origin !== origin) return route.abort();
        state.urls.push(req.url());
        if (!path.startsWith('/api/')) return route.continue();
        const forced = state.respond[`${req.method()} ${path}`]?.shift();
        if (req.method() !== 'GET') {
            const body = req.postData() ? req.postDataJSON() : null;
            state.writes.push({ path, method: req.method(), body });
            if (forced) return route.fulfill(forced);
            if (path === `/api/teacher/institutions/${school.id}/credentials`) {
                state.school = { ...state.school, institution_code: body.institution_code, credentials_configured: true, revision: state.school.revision + 1 };
                return route.fulfill({ json: state.school });
            }
            if (path === '/api/admin/administration-plans' || path.startsWith('/api/admin/administration-plans/')) {
                const id = path.endsWith('plans') ? 8 : Number(path.split('/').at(-1));
                const current = state.plans.find(row => row.id === id) ?? { ...plan, id, code: 'AP-NEW149', revision: 0 };
                // Mirrors the server: only an explicit institution_id changes or resolves the link.
                const explicit = 'institution_id' in body;
                const linked = explicit ? body.institution_id : current.institution_id;
                const next = { ...current, ...body, institution_id: linked, institution_name: linked ? state.school.name : null,
                    institution_code: linked ? state.school.institution_code : null, institution_credentials_configured: Boolean(linked && state.school.credentials_configured),
                    institution_link_state: explicit ? (linked ? 'linked' : 'unlinked') : current.institution_link_state,
                    reconciliation_reason: explicit ? null : current.reconciliation_reason, revision: current.revision + 1 };
                state.plans = [...state.plans.filter(row => row.id !== id), next];
                return route.fulfill({ json: next });
            }
            if (path === '/api/user/administrations/7/verify-institution') {
                if (body.password !== SECRET) return route.fulfill({ status: 403, json: { detail: 'institution_verification_failed' } });
                return route.fulfill({ json: { grant: 'g'.repeat(43), expires_at: '2026-10-09T10:00:00Z', institution: { id: 51, name: 'Synthetic school', institution_code: 'SYN-149' } } });
            }
            if (path === '/api/instruments/QSA/score') {
                if (body.institution_grant !== 'g'.repeat(43)) {
                    return route.fulfill({ status: 403, json: { detail: { code: 'institution_verification_required', administration_plan_id: 7, institution_name: 'Synthetic school', institution_code: 'SYN-149' } } });
                }
                return route.fulfill({ json: { instrument: 'QSA', locale: 'en', status: 'validated', uses_validated_norms: true, results: [] } });
            }
            throw new Error(`Unexpected write ${path}`);
        }
        if (forced) return route.fulfill(forced);
        let data = [];
        if (path === '/api/auth/me') data = { authenticated: true, username: 'first', name: 'Synthetic user', groups: [role], is_admin: role === 'admins' };
        else if (path === '/api/user/account-preferences') data = { setup_completed: true, counselor_ready: true, notebook_ready: true };
        else if (path === '/api/orientation/status') data = { required: false, completed: true };
        else if (path === '/api/teacher/institutions') data = [state.school];
        else if (path === `/api/teacher/institutions/${school.id}`) data = state.school;
        else if (path === '/api/admin/administration-plans') data = [...state.plans].sort((a, b) => a.id - b.id);
        else if (path === '/api/admin/administration-plans/institution-options') data = [{ id: 51, name: state.school.name, institution_code: state.school.institution_code, credentials_configured: state.school.credentials_configured }];
        else if (path === '/api/instruments/QSA/rules') data = rules;
        else if (path === '/api/user/anonymous-research-code') data = { code: 'SBS-SYN1-4900' };
        else if (path === '/api/telegram/bot-info') data = { enabled: false };
        return route.fulfill({ json: data });
    });
    return { context, page, state };
}

async function storage(page) {
    return page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
}

test('teacher saves write-only credentials on the institute; the password is never shown again', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/docente/istituti`);
        await f.page.getByRole('button', { name: 'Enter external credentials', exact: true }).click();
        await f.page.getByLabel('Institution code (issued by competenzestrategiche.it)').fill(' SYN-149 ');
        await f.page.getByLabel('Institution password').fill(SECRET);
        assert.equal(f.state.writes.length, 0);
        await f.page.getByRole('button', { name: 'Save credentials', exact: true }).click();
        await f.page.getByText('External credentials: Configured').waitFor();
        assert.deepEqual(f.state.writes.at(-1).body, { institution_code: 'SYN-149', password: SECRET, revision: 1 });
        await f.page.reload();
        await f.page.getByText('SYN-149', { exact: true }).waitFor();
        await f.page.getByRole('button', { name: 'Replace external credentials', exact: true }).click();
        assert.equal(await f.page.getByLabel('Institution password').inputValue(), '');
        assert.equal(await f.page.getByLabel('Institution code (issued by competenzestrategiche.it)').inputValue(), 'SYN-149');
        assert.ok(!(await f.page.content()).includes(SECRET.trim()));
        assert.ok(!(await storage(f.page)).includes(SECRET.trim()));
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('a stale revision or code conflict keeps the code draft and sends nothing else', async () => {
    const f = await fixture();
    try {
        f.state.respond[`PUT /api/teacher/institutions/${school.id}/credentials`] = [
            { status: 409, json: { detail: 'institution_revision_conflict' } },
            { status: 409, json: { detail: 'institution_code_conflict' } },
        ];
        await f.page.goto(`${origin}/docente/istituti`);
        await f.page.getByRole('button', { name: 'Enter external credentials', exact: true }).click();
        await f.page.getByLabel('Institution code (issued by competenzestrategiche.it)').fill('SYN-149');
        await f.page.getByLabel('Institution password').fill(SECRET);
        await f.page.getByRole('button', { name: 'Save credentials', exact: true }).click();
        await f.page.getByText('The institute changed elsewhere. Reload; your entries stay here.').waitFor();
        assert.equal(await f.page.getByLabel('Institution code (issued by competenzestrategiche.it)').inputValue(), 'SYN-149');
        await f.page.getByRole('button', { name: 'Save credentials', exact: true }).click();
        await f.page.getByText('Another institute already uses this code.', { exact: false }).waitFor();
        assert.equal(f.state.writes.length, 2);
        // Invalid drafts are refused locally before any request.
        await f.page.getByLabel('Institution code (issued by competenzestrategiche.it)').fill('bad code!');
        await f.page.getByRole('button', { name: 'Save credentials', exact: true }).click();
        await f.page.getByText('Use letters, digits and hyphens only (max 50).').waitFor();
        assert.equal(f.state.writes.length, 2);
    } finally { await f.context.close(); }
});

test('administration editor round-trips the canonical institute, never sends credentials and keeps drafts on 409', async () => {
    const f = await fixture();
    try {
        f.state.school = { ...f.state.school, institution_code: 'SYN-149', credentials_configured: true };
        await f.page.goto(`${origin}/docente/somministrazioni`);
        await f.page.getByRole('heading', { name: 'Synthetic plan' }).waitFor();
        assert.equal(await f.page.getByLabel('Institution password').count(), 0);
        await f.page.getByTitle('Edit', { exact: true }).first().click();
        await f.page.getByRole('combobox', { name: 'Institute', exact: true }).selectOption('51');
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByText('Institute: Synthetic school (SYN-149)').waitFor();
        const first = f.state.writes.at(-1).body;
        assert.equal(first.institution_id, 51);
        assert.equal(first.revision, 1);
        assert.ok(!('institution_code' in first) && !('institution_password' in first));
        await f.page.reload();
        await f.page.getByText('Institute: Synthetic school (SYN-149)').waitFor();
        f.state.respond['PUT /api/admin/administration-plans/7'] = [{ status: 409, json: { detail: 'administration_revision_conflict' } }];
        await f.page.getByTitle('Edit', { exact: true }).first().click();
        await f.page.getByLabel('Place', { exact: true }).fill('Draft room');
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByText('This plan changed elsewhere. Reload the list; your draft stays in the form.').waitFor();
        assert.equal(await f.page.getByLabel('Place', { exact: true }).inputValue(), 'Draft room');
        // An unchanged institute is not resent, so unrelated edits cannot relink or resolve anything.
        assert.equal(f.state.writes.at(-1).body.revision, 2);
        assert.ok(!('institution_id' in f.state.writes.at(-1).body));
        assert.deepEqual(f.state.errors, []);
    } finally { await f.context.close(); }
});

test('reconciliation needs an explicit confirmation before the institute choice is sent', async () => {
    const f = await fixture();
    try {
        f.state.plans = [{ ...plan, institution_id: 51, institution_name: 'Synthetic school', institution_link_state: 'needs_reconciliation',
            reconciliation_reason: 'credential_conflict', legacy_institution_code: 'LEGACY-149' }];
        await f.page.goto(`${origin}/docente/somministrazioni`);
        await f.page.getByText('Needs reconciliation').first().waitFor();
        await f.page.getByTitle('Edit', { exact: true }).first().click();
        await f.page.getByText('LEGACY-149').waitFor();
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByText('Needs reconciliation').first().waitFor();
        assert.ok(!('institution_id' in f.state.writes.at(-1).body));
        await f.page.getByTitle('Edit', { exact: true }).first().click();
        await f.page.getByLabel('Confirm this institute choice (resolves reconciliation)').check();
        await f.page.getByRole('button', { name: 'Save', exact: true }).click();
        await f.page.getByText('Institute: Synthetic school').waitFor();
        assert.equal(f.state.writes.at(-1).body.institution_id, 51);
    } finally { await f.context.close(); }
});

test('student verifies the institute in memory and the answers are saved once with the grant in the body', async () => {
    const f = await fixture({ role: 'studenti' });
    try {
        await f.page.goto(`${origin}/somministrazione/QSA?study=AP-SYN149`);
        await f.page.getByText('Synthetic item 1').first().waitFor();
        for (const item of [1, 2]) await f.page.locator(`input[name="item-${item}"][value="3"]`).check();
        await f.page.locator('input[type="checkbox"]').last().check();
        await f.page.getByRole('button', { name: /submit|send/i }).click();
        await f.page.getByText('This administration belongs to Synthetic school.', { exact: false }).waitFor();
        assert.equal(await f.page.getByLabel('Code', { exact: true }).inputValue(), 'SYN-149');
        await f.page.getByLabel('Institution password').fill('wrong-pass');
        await f.page.getByRole('button', { name: 'Verify and save', exact: true }).click();
        await f.page.getByText('Code or password not valid.').waitFor();
        await f.page.getByLabel('Institution password').fill(SECRET);
        await f.page.getByRole('button', { name: 'Verify and save', exact: true }).click();
        await f.page.getByText('Code or password not valid.').waitFor({ state: 'detached' });
        await f.page.waitForFunction(() => !document.querySelector('fieldset legend'));
        const scores = f.state.writes.filter(write => write.path === '/api/instruments/QSA/score');
        assert.equal(scores.length, 2);
        assert.equal(scores[1].body.institution_grant, 'g'.repeat(43));
        assert.ok(!JSON.stringify(scores[1].body.response_metadata).includes('g'.repeat(43)));
        assert.ok(f.state.urls.every(url => !url.includes('g'.repeat(43)) && !url.includes(encodeURIComponent(SECRET))));
        assert.ok(!(await storage(f.page)).includes('g'.repeat(43)));
        assert.ok(!(await storage(f.page)).includes(SECRET.trim()));
    } finally { await f.context.close(); }
});

const translations = {
    it: ['Inserisci credenziali esterne', 'Salva credenziali'],
    en: ['Enter external credentials', 'Save credentials'],
    es: ['Introducir credenciales externas', 'Guardar credenciales'],
    fr: ['Saisir les identifiants externes', 'Enregistrer les identifiants'],
    de: ['Externe Zugangsdaten eingeben', 'Zugangsdaten speichern'],
    sv: ['Ange externa inloggningsuppgifter', 'Spara inloggningsuppgifter'],
};
for (const [lang, [open, save]] of Object.entries(translations)) {
    test(`${lang}: credential editor is translated and fits 320 px`, async () => {
        const f = await fixture({ lang, width: 320 });
        try {
            await f.page.goto(`${origin}/docente/istituti`);
            await f.page.getByRole('button', { name: open, exact: true }).click();
            await f.page.getByRole('button', { name: save, exact: true }).waitFor();
            assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            if (process.env.CREDENTIALS_CAPTURE_GUIDE === '1') {
                await f.page.setViewportSize({ width: 1440, height: 1000 });
                await f.page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
                await f.page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
                await f.page.screenshot({ path: `frontend/public/guide/${lang}/teacher-institute-credentials.png`, fullPage: true });
            }
            assert.deepEqual(f.state.errors, []);
        } finally { await f.context.close(); }
    });
}
