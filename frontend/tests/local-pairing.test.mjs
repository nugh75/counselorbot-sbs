import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// #602: pairing studente dal tunnel docente (ADR-0002 §4). Le API sono
// simulate: il flusso UI, la privacy del frammento e gli stati sono coperti qui;
// le API reali sono coperte da backend/tests/test_local_pairing.py.
const origin = new URL(process.env.LOCAL_PAIRING_BASE_URL || 'http://127.0.0.1:3170').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const PAIR_BODY = { username: 's-abc123def4', pseudonym: 'Luna', group_id: 88, status: 'active', personal_code: 'ABC123DEF456' };
const TEACHER = { authenticated: true, username: 'docente', name: 'Docente', groups: ['docenti', 'admins'], is_admin: true, auth_provider: 'local' };
const ACTIVE_STUDENT = { authenticated: true, username: PAIR_BODY.username, name: 'Luna', groups: ['studenti'], is_admin: false, auth_provider: 'local' };
const ANON = { authenticated: false, username: '', name: '', groups: [], is_admin: false, auth_provider: 'local' };

const group = { id: 88, name: 'Classe 3A', code: 'GR-PAIR88', owner_username: 'docente', members_count: 2, is_active: true };
const classTool = (key, category) => ({ key, kind: 'instrument', category, label_i18n: { it: key, en: key, es: key, fr: key, de: key, sv: key }, enabled: true, admin_enabled: true, always_on: false });
const settings = { group_id: 88, revision: 1, disabled_tool_keys: [], disabled_counselor_ids: [], default_counselor_id: null, students_personal_ai: true, forum: { students_can_open: false, premoderation: false }, tools: [classTool('QSA', 'assessment'), classTool('IDEA', 'guided')] };
const devices = { classes: [{ group_id: 88, group_name: 'Classe 3A', devices: [
    { id: 7, username: 's-abc123def4', pseudonym: 'Luna', device_label: 'Tablet 3', status: 'active', created_at: '2026-10-26T08:00:00Z', last_seen_at: '2026-10-26T08:30:00Z' },
    { id: 9, username: 's-xyz789abc0', pseudonym: 'Sole', device_label: null, status: 'pending', created_at: '2026-10-26T09:00:00Z', last_seen_at: '2026-10-26T09:10:00Z' },
] }] };

function runtimeConfigJs(config) {
    return { contentType: 'application/javascript', body: `window.__COUNSELORBOT_CONFIG__=${JSON.stringify(config)};\n` };
}

async function openPage(browser, { path, identity = ANON, runtime = { authProvider: 'local', publicOrigin: 'https://classe.example.test' }, handlers = {} } = {}) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => localStorage.setItem('cb_lang', 'it'));
    const page = await context.newPage();
    // In dev la prima compilazione di una route supera i 10s predefiniti.
    page.setDefaultTimeout(30000);
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/runtime-config.js', route => route.fulfill(runtimeConfigJs(runtime)));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const pathApi = url.pathname.slice(4);
        const method = request.method();
        if (method !== 'GET' && pathApi !== '/auth/me') writes.push(`${method} ${pathApi}`);
        const handler = handlers[`${method} ${pathApi}`] ?? handlers[pathApi];
        if (handler) return handler(route, url);
        if (pathApi === '/auth/me') return route.fulfill({ json: identity });
        return route.fulfill({ json: {} });
    });
    await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
    return { context, page, errors, writes };
}

test('the student pairs from the link fragment and sees the personal code once', async () => {
    let pairBody = null;
    const { context, page, errors, writes } = await openPage(browser, {
        path: '/unisciti#k=SECRET-CLASS-KEY',
        handlers: { 'POST /local-auth/pair': async route => {
            pairBody = route.request().postDataJSON();
            return route.fulfill({ status: 201, json: PAIR_BODY });
        } },
    });
    try {
        await page.getByLabel('Codice di abbinamento della classe').waitFor();
        assert.equal(await page.getByLabel('Codice di abbinamento della classe').inputValue(), 'SECRET-CLASS-KEY');
        // Il frammento con la chiave non resta nella cronologia del browser.
        assert.ok(!page.url().includes('SECRET-CLASS-KEY'), page.url());
        await page.getByLabel('Pseudonimo').fill('Luna');
        await page.getByLabel('Nome del dispositivo (facoltativo)').fill('Tablet 3');
        await page.getByRole('button', { name: 'Entra nella classe' }).click();
        await page.getByRole('heading', { name: 'Sessione attiva' }).waitFor();
        assert.deepEqual(pairBody, { key: 'SECRET-CLASS-KEY', pseudonym: 'Luna', device_label: 'Tablet 3' });
        await page.getByRole('textbox', { name: 'Codice personale', exact: true }).waitFor();
        assert.equal(await page.getByRole('textbox', { name: 'Codice personale', exact: true }).inputValue(), 'ABC1-23DE-F456');
        // Il codice è mostrato una sola volta: il proseguimento richiede la conferma.
        assert.equal(await page.getByRole('button', { name: 'Continua' }).isDisabled(), true);
        await page.getByRole('checkbox', { name: 'Ho salvato il codice personale' }).check();
        await page.getByRole('button', { name: 'Continua' }).click();
        await page.waitForURL(`${origin}/`);
        assert.ok(writes.every(write => write.includes('/local-auth/')), writes.join(', '));
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('a pending student sees the approval state and can keep the code', async () => {
    const { context, page, errors } = await openPage(browser, {
        path: '/unisciti',
        handlers: { 'POST /local-auth/pair': async route => route.fulfill({ status: 201, json: { ...PAIR_BODY, status: 'pending' } }) },
    });
    try {
        await page.getByLabel('Codice di abbinamento della classe').fill('SECRET-CLASS-KEY');
        await page.getByLabel('Pseudonimo').fill('Luna');
        await page.getByRole('button', { name: 'Entra nella classe' }).click();
        await page.getByRole('heading', { name: 'In attesa di approvazione' }).waitFor();
        await page.getByText('Il docente deve approvare il dispositivo', { exact: false }).waitFor();
        await page.getByRole('textbox', { name: 'Codice personale', exact: true }).waitFor();
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('an invalid class code never creates a session or reveals details', async () => {
    const { context, page, errors } = await openPage(browser, {
        path: '/unisciti',
        handlers: { 'POST /local-auth/pair': async route => route.fulfill({ status: 401, json: { detail: 'invalid_or_expired_code' } }) },
    });
    try {
        await page.getByLabel('Codice di abbinamento della classe').fill('made-up');
        await page.getByLabel('Pseudonimo').fill('Luna');
        await page.getByRole('button', { name: 'Entra nella classe' }).click();
        await page.getByText('Il codice non è valido o non è più utilizzabile', { exact: false }).waitFor();
        assert.equal(await page.getByRole('heading', { name: 'Sessione attiva' }).count(), 0);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('rate limiting shows the wait without backend details', async () => {
    const { context, page, errors } = await openPage(browser, {
        path: '/unisciti',
        handlers: { 'POST /local-auth/pair': async route => route.fulfill({ status: 429, headers: { 'Retry-After': '30' }, json: { detail: 'rate_limited' } }) },
    });
    try {
        await page.getByLabel('Codice di abbinamento della classe').fill('SECRET-CLASS-KEY');
        await page.getByLabel('Pseudonimo').fill('Luna');
        await page.getByRole('button', { name: 'Entra nella classe' }).click();
        await page.getByText('Attendi 30 secondi', { exact: false }).waitFor();
        assert.equal(await page.getByText('rate_limited').count(), 0);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('the personal code recovers the session on a new device', async () => {
    let recovered = false;
    const { context, page, errors } = await openPage(browser, {
        path: '/unisciti',
        handlers: {
            'POST /local-auth/recover': async route => {
                recovered = true;
                return route.fulfill({ json: { username: PAIR_BODY.username, pseudonym: 'Luna' } });
            },
            // La pagina interroga /auth/me al mount: resta anonima finché il
            // recupero non è avvenuto, poi la sessione è attiva.
            '/auth/me': async route => route.fulfill({ json: recovered ? ACTIVE_STUDENT : ANON }),
        },
    });
    try {
        await page.getByRole('textbox', { name: 'Codice personale', exact: true }).waitFor();
        await page.getByRole('textbox', { name: 'Codice personale', exact: true }).fill('abc1-23de-f456');
        await page.getByRole('button', { name: 'Recupera la sessione' }).click();
        await page.getByRole('heading', { name: 'Sessione attiva' }).waitFor();
        await page.getByText('Sei entrato come Luna', { exact: false }).waitFor();
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('an active student returning to /unisciti sees their session, not a second pairing', async () => {
    const { context, page, errors } = await openPage(browser, { path: '/unisciti', identity: ACTIVE_STUDENT });
    try {
        await page.getByRole('heading', { name: 'Sessione attiva' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Entra nella classe' }).count(), 0);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('the teacher approves, regenerates and revokes from the devices page', async () => {
    let current = structuredClone(devices);
    const { context, page, errors, writes } = await openPage(browser, {
        path: '/docente/dispositivi',
        identity: TEACHER,
        handlers: {
            '/local-auth/devices': async route => route.fulfill({ json: current }),
            'POST /local-auth/devices/9/approve': async route => {
                current.classes[0].devices[1].status = 'active';
                return route.fulfill({ status: 204 });
            },
            'POST /local-auth/students/s-abc123def4/personal-code': async route => route.fulfill({ json: { personal_code: 'ZZZ999YYY888' } }),
            'DELETE /local-auth/devices/7': async route => {
                current.classes[0].devices = current.classes[0].devices.filter(device => device.id !== 7);
                return route.fulfill({ status: 204 });
            },
        },
    });
    try {
        await page.getByRole('heading', { name: 'Classe 3A' }).waitFor();
        await page.getByText('In attesa', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Approva', exact: true }).click();
        await page.waitForTimeout(300);
        assert.equal(await page.getByText('In attesa', { exact: true }).count(), 0);
        await page.getByRole('button', { name: 'Rigenera codice personale' }).first().click();
        await page.getByText('Nuovo codice per Luna', { exact: false }).waitFor();
        await page.getByRole('textbox', { name: 'Codice personale', exact: true }).waitFor();
        assert.equal(await page.getByRole('textbox', { name: 'Codice personale', exact: true }).inputValue(), 'ZZZ9-99YY-Y888');
        // La revoca chiede conferma: annulla non invia nulla.
        await page.getByRole('button', { name: 'Revoca dispositivo' }).first().click();
        await page.getByText('Revocare questo dispositivo?', { exact: false }).waitFor();
        await page.getByRole('button', { name: 'Annulla' }).click();
        assert.ok(!writes.some(write => write.startsWith('DELETE')), writes.join(', '));
        await page.getByRole('button', { name: 'Revoca dispositivo' }).first().click();
        await page.getByText('Revocare questo dispositivo?', { exact: false }).waitFor();
        await page.getByRole('group', { name: 'Revocare questo dispositivo?' }).getByRole('button', { name: 'Revoca dispositivo' }).click();
        await page.waitForTimeout(300);
        assert.equal(await page.getByText('Luna', { exact: true }).count(), 0);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('the class overview offers pairing only with the local provider', async () => {
    const base = {
        '/admin/groups': async route => route.fulfill({ json: [group] }),
        '/teacher/groups/88/settings': async route => route.fulfill({ json: settings }),
        '/telegram/bot-info': async route => route.fulfill({ json: { enabled: false } }),
        '/admin/groups/88/shares': async route => route.fulfill({ json: [] }),
        '/admin/users-summary': async route => route.fulfill({ json: { users: [] } }),
        '/teacher/institutions': async route => route.fulfill({ json: [] }),
        '/local-auth/devices': async route => route.fulfill({ json: devices }),
    };
    const local = await openPage(browser, { path: '/docente/classi/88', identity: TEACHER, handlers: base });
    try {
        await local.page.getByRole('heading', { name: 'Accesso dal tunnel docente' }).waitFor();
        await local.page.getByRole('button', { name: 'Genera nuovo link' }).waitFor();
        assert.equal(await local.page.getByRole('checkbox', { name: 'Richiedi l’approvazione del docente' }).isChecked(), true);
        assert.deepEqual(local.errors, []);
    } finally { await local.context.close(); }

    const production = await openPage(browser, {
        path: '/docente/classi/88',
        identity: { ...TEACHER, auth_provider: 'ai4auth' },
        runtime: { authProvider: 'ai4auth' },
        handlers: base,
    });
    try {
        await production.page.getByRole('heading', { name: 'Invito studenti' }).waitFor();
        assert.equal(await production.page.getByRole('heading', { name: 'Accesso dal tunnel docente' }).count(), 0);
        assert.deepEqual(production.errors, []);
    } finally { await production.context.close(); }
});

test('the pairing link warns when the tunnel is not configured', async () => {
    let link = 'https://classe.example.test/unisciti#k=GOOD';
    const { context, page, errors } = await openPage(browser, {
        path: '/docente/classi/88',
        identity: TEACHER,
        handlers: {
            '/admin/groups': async route => route.fulfill({ json: [group] }),
            '/teacher/groups/88/settings': async route => route.fulfill({ json: settings }),
            '/telegram/bot-info': async route => route.fulfill({ json: { enabled: false } }),
            '/admin/groups/88/shares': async route => route.fulfill({ json: [] }),
            '/admin/users-summary': async route => route.fulfill({ json: { users: [] } }),
            '/teacher/institutions': async route => route.fulfill({ json: [] }),
            '/local-auth/devices': async route => route.fulfill({ json: { classes: [] } }),
            'POST /local-auth/classes/88/pairing-code': async route => {
                assert.equal(route.request().postDataJSON().requires_approval, true);
                return route.fulfill({ json: { link, expires_at: '2026-11-02T08:00:00Z' } });
            },
        },
    });
    try {
        await page.getByRole('heading', { name: 'Accesso dal tunnel docente' }).waitFor();
        await page.getByRole('button', { name: 'Genera nuovo link' }).click();
        await page.getByRole('textbox', { name: 'Link di abbinamento', exact: true }).waitFor();
        assert.equal(await page.getByText('Il link non contiene un indirizzo pubblico', { exact: false }).count(), 0);
        link = '/unisciti#k=NO-TUNNEL';
        await page.getByRole('button', { name: 'Genera nuovo link' }).click();
        await page.getByText('Il link non contiene un indirizzo pubblico', { exact: false }).waitFor();
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
