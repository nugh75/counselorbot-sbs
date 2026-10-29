import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium } from 'playwright';
import { classCompilationsText as copy } from '../src/lib/i18n-class-compilations.ts';
import { guideTaskCopy } from '../src/lib/i18n-guide-tasks.ts';

const origin = new URL(process.env.TEACHER_COMPILATIONS_BASE_URL || 'http://127.0.0.1:3143').origin;
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
const groups = [
    { id: 91, name: 'Classe propria', school: null, owner_username: 'teacher.fixture' },
    { id: 92, name: 'Classe condivisa', school: 'Istituto sintetico', owner_username: 'colleague.fixture' },
    { id: 93, name: 'Classe vuota', school: null, owner_username: 'teacher.fixture' },
];
const result = (id, type, date, session = `session-${id}`) => ({ id, questionnaire_type: type, submitted_at: date, session_id: session, scores: type === 'SAVICKAS' ? null : { C1: 7 } });
const payloads = {
    91: { group_id: 91, students: [
        { username: 'student.first', results: [result(1, 'QSA', '2026-10-01T08:00:00Z'), result(2, 'ZTPI', '2026-10-12T09:00:00Z')] },
        { username: 'student.without.results', results: [] },
    ] },
    92: { group_id: 92, students: [{ username: 'student.shared', results: [result(3, 'SAVICKAS', '2026-10-13T10:00:00Z', 'synthetic/session ?')] }] },
    93: { group_id: 93, students: [] },
};
async function fixture({ lang = 'it', role = 'docenti', noClasses = false, listFailure = 0, width = 390, theme = 'light' } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    await context.addInitScript(({ lang, theme }) => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', theme); }, { lang, theme });
    const page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(60000);
    const state = { rows: noClasses ? [] : structuredClone(groups), payloads: structuredClone(payloads), conversation: [{ role: 'student', text: 'Messaggio sintetico dello studente' }, { role: 'counselor', text: 'Risposta sintetica AI' }], listFailure, resultFailure: 0, conversationFailure: 0, pdfFailure: 0, reading: { strengths: ['C1 - Elaborazione'], growth_areas: ['Organizzazione'], note: 'Riflessione scritta dallo studente', updated_at: '2026-10-14T12:00:00Z' }, detailOverride: null, reads: [], writes: [], errors: [], holds: new Map() };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/*', async route => {
        const req = route.request(); const url = new URL(req.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (req.method() !== 'GET') { state.writes.push(url.pathname); return route.abort(); }
        state.reads.push(url.pathname);
        let data = [];
        let failure = 0;
        if (url.pathname === '/api/auth/me') data = { authenticated: true, username: 'teacher.fixture', name: 'Teacher Fixture', groups: [role], is_admin: false };
        else if (url.pathname === '/api/user/account-preferences') data = { setup_completed: true, counselor_ready: true, notebook_ready: true };
        else if (url.pathname === '/api/orientation/status') data = { required: false, completed: true };
        else if (url.pathname === '/api/admin/groups') { data = state.rows; failure = state.listFailure; }
        else if (/^\/api\/admin\/groups\/\d+\/students$/.test(url.pathname)) { data = state.payloads[url.pathname.split('/')[4]]; failure = state.resultFailure; }
        else if (/\/results\/\d+(\/pdf)?$/.test(url.pathname)) {
            const parts = url.pathname.split('/');
            const id = Number(parts[8]);
            const username = decodeURIComponent(parts[6]);
            const row = Object.values(state.payloads).flatMap(group => group.students).find(student => student.username === username)?.results.find(row => row.id === id);
            if (url.pathname.endsWith('/pdf')) {
                if (state.pdfFailure) return route.fulfill({ status: state.pdfFailure, json: {} });
                return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4 synthetic fixture' });
            }
            data = state.detailOverride ?? { ...row, username, summary: `Sintesi del counselor ${id}`, conversation: state.conversation, reading: state.reading };
            failure = state.conversationFailure;
        }
        else if (/\/teacher\/groups\/\d+\/settings$/.test(url.pathname)) data = { group_id: 91, revision: 1, disabled_tool_keys: [], tools: [], counselors: [], disabled_counselor_ids: [], default_counselor_id: null, forum_enabled: false };
        const hold = state.holds.get(url.pathname);
        if (hold) await hold;
        if (failure === 'network') return route.abort('failed');
        return route.fulfill({ status: failure || 200, json: failure ? { detail: 'PRIVATE SERVER DETAIL' } : data });
    });
    await page.goto(`${origin}/docente/compilazioni`, { waitUntil: 'domcontentloaded' });
    const section = page.locator('[data-class-compilations]');
    const picker = section.getByLabel(copy(lang, 'classLabel'), { exact: true });
    const choose = async id => { await picker.selectOption(String(id)); };
    const hold = path => { let release; state.holds.set(path, new Promise(resolve => { release = resolve; })); return () => { state.holds.delete(path); release(); }; };
    return { page, context, state, section, picker, choose, hold };
}
function clean(state) { assert.deepEqual(state.errors, []); assert.deepEqual(state.writes, []); }

test('visible section, explicit class choice, saved results only, dates, descending order and shared result flow', async () => {
    const f = await fixture({ width: 1440 });
    try {
        await f.picker.waitFor();
        assert.equal(await f.picker.inputValue(), '');
        assert.equal(f.state.reads.some(path => path.endsWith('/students')), false);
        await f.page.getByRole('heading', { name: copy('it', 'title'), exact: true }).waitFor();
        await f.choose(91); await f.section.getByText('ZTPI', { exact: true }).waitFor();
        assert.deepEqual(await f.section.locator('time').evaluateAll(rows => rows.map(row => row.dateTime)), ['2026-10-12T09:00:00Z', '2026-10-01T08:00:00Z']);
        assert.equal(await f.section.locator('li > p').filter({ hasText: 'student.without.results' }).count(), 0);
        assert.equal(await f.section.getByText('C1=7', { exact: true }).count(), 2);
        assert.equal(f.state.reads.some(path => /\/results\/\d+$/.test(path)), false);
        const button = f.section.getByRole('button', { name: /Apri compilazione.*student.first.*ZTPI/ });
        await button.focus(); await f.page.keyboard.press('Enter');
        await f.section.getByText('Messaggio sintetico dello studente', { exact: false }).waitFor();
        assert.equal(await button.getAttribute('aria-expanded'), 'true');
        assert.ok(f.state.reads.includes('/api/admin/groups/91/students/student.first/results/2'));
        await f.choose(92); await f.section.locator('li > p').filter({ hasText: 'student.shared' }).waitFor();
        assert.equal(await f.section.locator('li > p').filter({ hasText: 'student.first' }).count(), 0);
        assert.equal(await f.section.getByText('Messaggio sintetico dello studente', { exact: false }).count(), 0);
        await f.section.getByRole('button', { name: /Apri compilazione/ }).click();
        await f.section.getByText('Risposta sintetica AI', { exact: false }).waitFor();
        assert.ok(f.state.reads.includes('/api/admin/groups/92/students/student.shared/results/3'));
        assert.equal(f.state.reads.some(path => /\/notes|learner-profile|teacher-notebook|\/messages/.test(path)), false);
        clean(f.state);
    } finally { await f.context.close(); }
});

test('late class and transcript responses cannot replace the current selection', async () => {
    const f = await fixture();
    try {
        const release = f.hold('/api/admin/groups/91/students');
        await f.choose(91); await f.section.getByRole('status').waitFor();
        await f.choose(92); await f.section.locator('li > p').filter({ hasText: 'student.shared' }).waitFor();
        release();
        await f.page.waitForTimeout(100);
        assert.equal(await f.section.locator('li > p').filter({ hasText: 'student.first' }).count(), 0);
        const releaseTranscript = f.hold('/api/admin/groups/92/students/student.shared/results/3');
        await f.section.getByRole('button', { name: /Apri compilazione/ }).click();
        await f.section.getByRole('status').waitFor();
        await f.choose(93); await f.section.getByText(copy('it', 'empty'), { exact: true }).waitFor();
        releaseTranscript(); await f.page.waitForTimeout(100);
        assert.equal(await f.section.getByText('Risposta sintetica AI', { exact: false }).count(), 0);
        await f.choose('');
        assert.equal(await f.section.locator('li').count(), 0);
        clean(f.state);
    } finally { await f.context.close(); }
});

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) test(`${lang}: mobile, keyboard, light/dark and empty states`, async () => {
    for (const theme of ['light', 'dark']) {
        const f = await fixture({ lang, width: 320, theme });
        try {
            await f.picker.waitFor();
            assert.equal(await f.page.getByRole('heading', { name: copy(lang, 'title'), exact: true }).count(), 1);
            await f.picker.focus(); await f.page.keyboard.press('ArrowDown'); await f.page.keyboard.press('Enter');
            await f.choose(91); await f.section.getByText('ZTPI', { exact: true }).waitFor();
            assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.ok((await f.picker.boundingBox()).height >= 44);
            for (const button of await f.section.getByRole('button').all()) assert.ok((await button.boundingBox()).height >= 44);
            await f.choose(93); await f.section.getByText(copy(lang, 'empty'), { exact: true }).waitFor();
            clean(f.state);
        } finally { await f.context.close(); }
    }
    const f = await fixture({ lang, noClasses: true });
    try { await f.section.getByText(copy(lang, 'noClasses'), { exact: true }).waitFor(); assert.equal(await f.picker.count(), 0); clean(f.state); }
    finally { await f.context.close(); }
});

for (const failure of [503, 'network', 401, 403]) test(`class list ${failure}: readable error and retry or denied access`, async () => {
    const f = await fixture({ listFailure: failure });
    try {
        await f.section.getByRole('alert').waitFor();
        assert.equal(await f.picker.count(), 0);
        assert.equal(await f.section.getByText('PRIVATE SERVER DETAIL', { exact: true }).count(), 0);
        if (failure === 401 || failure === 403) assert.equal(await f.section.getByRole('button').count(), 0);
        else {
            await f.section.getByText(copy('it', 'classesError'), { exact: true }).waitFor();
            f.state.listFailure = 0;
            await f.section.getByRole('button', { name: 'Riprova', exact: true }).click();
            await f.picker.waitFor();
        }
        clean(f.state);
    } finally { await f.context.close(); }
});

for (const failure of [401, 403, 404, 503, 'network']) test(`class results ${failure}: no previous data, denied access or retry`, async () => {
    const f = await fixture();
    try {
        await f.choose(91); await f.section.locator('li > p').filter({ hasText: 'student.first' }).first().waitFor();
        f.state.resultFailure = failure;
        await f.choose(92); await f.section.getByRole('alert').waitFor();
        assert.equal(await f.section.locator('li').count(), 0);
        if (failure === 401 || failure === 403) assert.equal(await f.section.getByRole('button').count(), 0);
        else {
            f.state.resultFailure = 0;
            await f.section.getByRole('button', { name: 'Riprova', exact: true }).click();
            await f.section.locator('li > p').filter({ hasText: 'student.shared' }).waitFor();
        }
        clean(f.state);
    } finally { await f.context.close(); }
});

test('conversation errors can retry; revoked access hides messages', async () => {
    const f = await fixture();
    try {
        await f.choose(91); await f.section.getByText('ZTPI', { exact: true }).waitFor();
        f.state.conversationFailure = 503;
        const button = f.section.getByRole('button', { name: /Apri compilazione.*ZTPI/ });
        await button.click(); await f.section.getByText(copy('it', 'detailError'), { exact: true }).waitFor();
        f.state.conversationFailure = 0;
        await f.section.getByRole('button', { name: 'Riprova', exact: true }).click();
        await f.section.getByText('Risposta sintetica AI', { exact: false }).waitFor();
        await button.click(); f.state.conversationFailure = 403; await button.click();
        await f.section.getByRole('alert').waitFor();
        assert.equal(await f.section.getByText('Risposta sintetica AI', { exact: false }).count(), 0);
        clean(f.state);
    } finally { await f.context.close(); }
});

test('student role never mounts the section or requests managed classes', async () => {
    const f = await fixture({ role: 'studenti' });
    try { await f.page.getByText('Pagina riservata a docenti, ricercatori e amministratori.', { exact: true }).waitFor(); assert.equal(await f.section.count(), 0); assert.equal(f.state.reads.includes('/api/admin/groups'), false); clean(f.state); }
    finally { await f.context.close(); }
});

test('existing class participants reuse the same result and transcript component', async () => {
    const f = await fixture();
    try {
        await f.page.goto(`${origin}/docente/classi/91?tab=students`);
        await f.page.getByRole('button', { name: 'Elenco partecipanti', exact: true }).click();
        const participant = f.page.getByRole('button', { name: /student.first/ }).first();
        await participant.click();
        const conversation = f.page.getByRole('button', { name: /Apri compilazione.*student.first.*QSA/ });
        await conversation.click(); await f.page.getByText('Risposta sintetica AI', { exact: false }).waitFor();
        assert.ok(f.state.reads.includes('/api/admin/groups/91/students/student.first/results/1'));
        clean(f.state);
    } finally { await f.context.close(); }
});

test('class with participants without results and imported result without messages', async () => {
    const f = await fixture();
    try {
        f.state.payloads[93].students = [{ username: 'empty.participant', results: [] }];
        await f.choose(93); await f.section.getByText(copy('it', 'empty'), { exact: true }).waitFor();
        assert.equal(await f.section.locator('li').count(), 0);
        f.state.payloads[92].students[0].results[0].submitted_at = null;
        f.state.conversation = [];
        await f.choose(92); await f.section.locator('li > p').filter({ hasText: 'student.shared' }).waitFor();
        assert.equal(await f.section.locator('time').count(), 0);
        await f.section.getByRole('button', { name: /Apri compilazione/ }).click();
        await f.section.getByText(copy('it', 'noConversation'), { exact: true }).waitFor();
        clean(f.state);
    } finally { await f.context.close(); }
});

test('response for a different group is never rendered', async () => {
    const f = await fixture();
    try {
        f.state.payloads[91] = f.state.payloads[92];
        await f.choose(91); await f.section.getByText(copy('it', 'resultsError'), { exact: true }).waitFor();
        assert.equal(await f.section.locator('li').count(), 0);
        clean(f.state);
    } finally { await f.context.close(); }
});

test('a changed preview account rejects the previous pending read', async () => {
    const f = await fixture();
    try {
        const release = f.hold('/api/admin/groups/91/students');
        await f.choose(91); await f.section.getByRole('status').waitFor();
        await f.page.evaluate(() => sessionStorage.setItem('cb_view_as_user', 'docente.demo'));
        release(); await f.section.getByRole('alert').waitFor();
        assert.equal(await f.section.locator('li').count(), 0);
        clean(f.state);
    } finally { await f.context.close(); }
});

test('teacher guide explains the dashboard section in all six languages', async () => {
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
        const f = await fixture({ lang });
        try {
            await f.page.goto(`${origin}/guide?audience=teacher&task=student-results`);
            await f.page.getByText(guideTaskCopy(lang, 'student-results').intro, { exact: true }).waitFor();
            clean(f.state);
        } finally { await f.context.close(); }
    }
});

for (const width of [320, 1440]) test(`submission includes results, distinct student reading, summary and PDF at ${width}px`, async () => {
    const f = await fixture({ width });
    try {
        await f.choose(91);
        await f.section.getByRole('button', { name: /Apri compilazione.*QSA/ }).click();
        const detail = f.section.locator('[data-student-result-detail]');
        await detail.getByText('Riflessione scritta dallo studente', { exact: true }).waitFor();
        await detail.getByText('Sintesi del counselor 1', { exact: true }).waitFor();
        assert.ok(await detail.getByRole('region', { name: copy('it', 'studentReading'), exact: true }).getByText('C1 - Elaborazione').count());
        assert.equal(await detail.getByText('Messaggio sintetico dello studente', { exact: true }).count(), 1);
        const downloadButton = detail.getByRole('button', { name: /PDF/ });
        const downloaded = f.page.waitForEvent('download');
        await downloadButton.click();
        assert.equal((await downloaded).suggestedFilename(), 'counselorbot_QSA_1.pdf');
        assert.ok(f.state.reads.includes('/api/admin/groups/91/students/student.first/results/1/pdf'));
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.ok((await downloadButton.boundingBox()).height >= 44);
        assert.ok(await detail.locator('span[title]').evaluateAll(items => items.every(item => { const panel = item.closest('.glass-panel'); return item.getBoundingClientRect().right <= panel.getBoundingClientRect().right - parseFloat(getComputedStyle(panel).paddingRight) + 1; })));
        await f.page.screenshot({ path: `/tmp/counselorbot-406-detail-${width}.png`, fullPage: true });
        clean(f.state);
    } finally { await f.context.close(); }
});

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) test(`${lang}: missing student reading is explicit in an opened qualitative submission`, async () => {
    const f = await fixture({ lang, theme: 'dark', width: 390 });
    try {
        f.state.reading = null;
        await f.choose(92);
        await f.section.getByRole('button', { name: new RegExp(copy(lang, 'detail')) }).click();
        const detail = f.section.locator('[data-student-result-detail]');
        await detail.getByText(copy(lang, 'noReading'), { exact: true }).waitFor();
        await detail.getByText(copy(lang, 'noScores'), { exact: true }).waitFor();
        assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        clean(f.state);
    } finally { await f.context.close(); }
});

test('PDF error retries and revoked PDF access hides the entire compilation detail', async () => {
    const f = await fixture();
    try {
        await f.choose(91);
        await f.section.getByRole('button', { name: /Apri compilazione.*QSA/ }).click();
        const detail = f.section.locator('[data-student-result-detail]');
        const download = detail.getByRole('button', { name: /PDF/ });
        f.state.pdfFailure = 503;
        await download.click(); await detail.getByText(copy('it', 'pdfError'), { exact: true }).waitFor();
        f.state.pdfFailure = 403;
        await download.click(); await f.section.getByRole('alert').waitFor();
        assert.equal(await detail.count(), 0);
        assert.equal(await f.section.getByText('Riflessione scritta dallo studente', { exact: true }).count(), 0);
        clean(f.state);
    } finally { await f.context.close(); }
});

test('a mismatched compilation response never exposes another reflection', async () => {
    const f = await fixture();
    try {
        f.state.detailOverride = { ...result(999, 'QSA', null), username: 'other.student', reading: f.state.reading, conversation: [] };
        await f.choose(91);
        await f.section.getByRole('button', { name: /Apri compilazione.*QSA/ }).click();
        await f.section.getByText(copy('it', 'detailError'), { exact: true }).waitFor();
        assert.equal(await f.section.locator('[data-student-result-detail]').count(), 0);
        clean(f.state);
    } finally { await f.context.close(); }
});

test('matrix changes student without retaining an open detail or its reflection', async () => {
    const f = await fixture({ width: 1440 });
    try {
        f.state.payloads[91].students.push({ username: 'student.second', results: [result(4, 'QSA', '2026-10-16T10:00:00Z')] });
        await f.page.goto(`${origin}/docente/classi/91?tab=students`);
        await f.page.getByRole('button', { name: /^student.first — QSA:/ }).click();
        await f.page.getByRole('button', { name: /Apri compilazione.*QSA/ }).click();
        await f.page.getByText('Riflessione scritta dallo studente', { exact: true }).waitFor();
        await f.page.getByRole('button', { name: /^student.second — QSA:/ }).click();
        assert.equal(await f.page.locator('[data-student-result-detail]').count(), 0);
        f.state.reading.note = 'Riflessione del secondo studente';
        await f.page.getByRole('button', { name: /Apri compilazione.*QSA/ }).click();
        await f.page.getByText('Riflessione del secondo studente', { exact: true }).waitFor();
        assert.equal(await f.page.getByText('Riflessione scritta dallo studente', { exact: true }).count(), 0);
        clean(f.state);
    } finally { await f.context.close(); }
});

test('two submissions of the same questionnaire request their exact result ids and have distinct accessible dates', async () => {
    const f = await fixture();
    try {
        f.state.payloads[91].students[0].results.push(result(5, 'QSA', '2026-10-15T10:00:00Z'));
        await f.choose(91);
        const buttons = f.section.getByRole('button', { name: /Apri compilazione.*QSA/ });
        assert.equal(await buttons.count(), 2);
        assert.notEqual(await buttons.first().innerText(), await buttons.last().innerText());
        await buttons.first().click();
        await f.section.getByText('Sintesi del counselor 5', { exact: true }).waitFor();
        await buttons.first().click();
        f.state.reading.note = 'Riflessione della prima compilazione';
        await buttons.last().click();
        await f.section.getByText('Sintesi del counselor 1', { exact: true }).waitFor();
        await f.section.getByText('Riflessione della prima compilazione', { exact: true }).waitFor();
        assert.equal(await f.section.getByText('Sintesi del counselor 5', { exact: true }).count(), 0);
        assert.ok(f.state.reads.includes('/api/admin/groups/91/students/student.first/results/5'));
        assert.ok(f.state.reads.includes('/api/admin/groups/91/students/student.first/results/1'));
        clean(f.state);
    } finally { await f.context.close(); }
});
