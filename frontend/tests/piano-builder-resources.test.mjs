import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { chromium } from 'playwright';
import { classPathText } from '../src/lib/i18n-class-paths.js';
import { pathForumText } from '../src/lib/i18n-path-forum.js';
import { stepKindText } from '../src/lib/i18n-step-kinds.js';
import { classMeetingText } from '../src/lib/i18n-class-meetings.js';
import { forumText } from '../src/lib/i18n-forum.js';

const origin = new URL(process.env.PIANO_BUILDER_BASE_URL || 'http://127.0.0.1:3176').origin;
const labels = {
    it: {'piano.builder.manageMeetings': 'Gestisci incontri', 'piano.builder.editMeeting': 'Modifica incontro', 'piano.builder.createDiscussion': 'Crea discussione', 'piano.builder.editDiscussion': 'Modifica discussione'},
    sv: {'piano.builder.manageMeetings': 'Hantera möten', 'piano.builder.editMeeting': 'Redigera möte', 'piano.builder.createDiscussion': 'Skapa diskussion', 'piano.builder.editDiscussion': 'Redigera diskussion'},
};
let browser;
before(async () => { browser = await chromium.launch({headless: true}); });
after(async () => { await browser?.close(); });

async function fixture(lang = 'it', width = 1280) {
    const context = await browser.newContext({viewport: {width, height: 900}});
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
    const group = {id: 11, name: 'Classe sintetica', code: 'S11-SYN', owner_username: 'teacher.test',
        is_active: true, members_count: 1, institution_id: null};
    const state = {topics: [], creates: [], patches: [], saves: [], failCreate: 0, failPatch: 0, detailGroup: 11, meetings: [], meetingCreates: [], meetingUpdates: [], slotCreates: [], failMeetingCreate: 0, failMeetingUpdate: 0, failSlot: 0};
    let path = {id: 301, group_id: 11, title: 'Piano sintetico', mode: 'recommended', status: 'draft', revision: 1,
        steps_count: 1, steps: [{id: 1, position: 1, step_type: 'tool', tool_key: 'timeline', auto_detect: false}]};
    await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url()), p = url.pathname;
        if (url.origin !== origin) return route.abort();
        if (!p.startsWith('/api/')) return route.continue();
        const json = (value, status = 200) => route.fulfill({status, json: value});
        if (p === '/api/auth/me') return json({authenticated: true, username: 'teacher.test', name: 'Docente sintetico', groups: ['docenti'], is_admin: false});
        if (p === '/api/user/account-preferences') return json({counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true});
        if (p === '/api/user/account') return json({setup_complete: true, notebook_completed: true});
        if (p === '/api/orientation/status') return json({required: false, completed: true});
        if (p === '/api/admin/groups') return json([group]);
        if (p === '/api/teacher/path-templates') return json({mine: [], shared: []});
        if (p === '/api/teacher/groups/11/paths') return json([path]);
        if (p === '/api/teacher/groups/11/settings') return json({group_id: 11, revision: 1, disabled_tool_keys: [], tools: [
            {key: 'timeline', kind: 'personal', category: 'personal', enabled: true, admin_enabled: true, always_on: false, label_i18n: {}},
            {key: 'forum', kind: 'personal', category: 'forum', enabled: true, admin_enabled: true, always_on: false, label_i18n: {}},
        ]});
        if (p === '/api/user/forum/links') return json({links: []});
        if (p === '/api/teacher/paths/301') {
            if (req.method() === 'PUT') {
                const body = req.postDataJSON(); state.saves.push(body);
                path = {...path, ...body, revision: path.revision + 1, steps: body.steps.map((step, index) => ({...step, id: step.id ?? 900 + index, position: index + 1, target_summary: step.step_type === 'meeting' ? state.meetings.find(row => row.id === step.meeting_id) : step.step_type === 'forum' ? {id: step.topic_id, group_id: 11, locked: false} : undefined}))};
            }
            return json(path);
        }
        if (p === '/api/teacher/groups/11/meeting-referents') return json([]);
        if (p === '/api/teacher/groups/11/meetings') {
            if (req.method() === 'POST') {
                const body = req.postDataJSON(); state.meetingCreates.push(body);
                if (state.failMeetingCreate-- > 0) return json({detail: 'temporary'}, 500);
                const row = {...body, id: 41 + state.meetings.length, group_id: 11, group_ids: [11], group_names: [group.name],
                    host_kind: 'teacher', host_name: null, host_role: null, referral_id: null, status: 'scheduled', revision: 1,
                    attendance_count: 0, slots: []};
                state.meetings.push(row); return json(row, 201);
            }
            return json(state.meetings);
        }
        const meetingId = p.match(/^\/api\/teacher\/meetings\/(\d+)$/)?.[1];
        if (meetingId && req.method() === 'PUT') {
            const body = req.postDataJSON(); state.meetingUpdates.push(body);
            const row = state.meetings.find(item => item.id === Number(meetingId));
            if (state.failMeetingUpdate-- > 0) {
                row.revision += 1; row.title = 'Versione remota';
                return json({detail: 'meeting_revision_mismatch'}, 409);
            }
            if (body.revision !== row.revision) return json({detail: 'meeting_revision_mismatch'}, 409);
            Object.assign(row, body, {revision: row.revision + 1, group_ids: [11]}); return json(row);
        }
        const slotMeeting = p.match(/^\/api\/teacher\/meetings\/(\d+)\/slots$/)?.[1];
        if (slotMeeting && req.method() === 'POST') {
            const body = req.postDataJSON(); state.slotCreates.push(body);
            if (state.failSlot-- > 0) return json({detail: 'temporary'}, 500);
            const row = state.meetings.find(item => item.id === Number(slotMeeting));
            row.slots.push({...body, id: 501, status: 'open', revision: 1, booking: null});
            row.revision += 1; return json(row, 201);
        }
        if (p === '/api/groups/11/forum/topics') {
            if (req.method() === 'POST') {
                const body = req.postDataJSON(); state.creates.push(body);
                if (state.failCreate-- > 0) return json({detail: 'temporary'}, 500);
                const topic = {id: 12 + state.topics.length, group_id: 11, ...body, author_display_name: 'Docente',
                    hidden: false, deleted: false, hidden_reason: null, own: true, created_at: '2026-10-25T12:00:00Z',
                    edited_at: null, status: 'published', pinned: false, locked: false, replies_count: 0};
                state.topics.push(topic); return json(topic, 201);
            }
            return json({group, forum_enabled: true, can_open_topic: true, can_moderate: true, has_more: false, topics: state.topics});
        }
        const topicId = p.match(/^\/api\/forum\/topics\/(\d+)$/)?.[1];
        if (topicId) {
            const topic = state.topics.find(row => row.id === Number(topicId));
            if (req.method() === 'PATCH') {
                const body = req.postDataJSON(); state.patches.push(body);
                if (state.failPatch-- > 0) return json({detail: 'temporary'}, 409);
                Object.assign(topic, body); return json(topic);
            }
            return json({topic: {...topic, group_id: state.detailGroup}, forum_enabled: true, posts: [], can_reply: true, can_moderate: true, has_more: false});
        }
        return json([]);
    });
    await page.goto(`${origin}/docente/piani-operativi`, {waitUntil: 'domcontentloaded', timeout: 120000});
    await page.getByRole('button', {name: classPathText(lang, 'open'), exact: true}).click().catch(async error => {
        console.error('Builder fixture did not load:', errors, await page.locator('body').innerText());
        throw error;
    });
    await page.locator('[data-testid="path-step-card"]').waitFor();
    return {context, page, state, errors, tr: key => labels[lang][key]};
}

for (const [lang, width] of [['it', 1280], ['sv', 390]]) {
    test(`forum create/edit stays in the builder and preserves drafts (${lang}, ${width}px)`, {timeout: 240000}, async () => {
        const {context, page, state, errors, tr} = await fixture(lang, width);
        try {
            await page.getByRole('button', {name: classPathText(lang, 'editPlan'), exact: true}).click();
            await page.locator('#path-title').fill('Piano ancora da salvare');
            const add = page.locator('[data-testid="add-step"]');
            await add.getByRole('button', {name: stepKindText(lang, 'addStep'), exact: true}).click();
            await add.getByRole('radio', {name: stepKindText(lang, 'discussion'), exact: true}).check();
            await add.getByRole('button', {name: tr('piano.builder.createDiscussion'), exact: true}).click();
            const modal = page.getByRole('dialog');
            await modal.getByRole('textbox', {name: new RegExp('^' + forumText(lang, 'title'))}).fill('Discussione del piano');
            await modal.getByRole('textbox', {name: new RegExp('^' + forumText(lang, 'body'))}).fill('Testo originale');
            state.failCreate = 1;
            await modal.getByRole('button', {name: forumText(lang, 'send'), exact: true}).click();
            await modal.getByText(forumText(lang, 'sendError'), {exact: true}).waitFor();
            assert.equal(await modal.getByRole('textbox', {name: new RegExp('^' + forumText(lang, 'body'))}).inputValue(), 'Testo originale');
            await modal.getByRole('button', {name: forumText(lang, 'send'), exact: true}).click();
            await modal.waitFor({state: 'hidden'});
            await add.getByRole('option', {name: 'Discussione del piano', exact: true}).waitFor({state: 'attached'});
            assert.equal(await add.getByRole('combobox', {name: pathForumText(lang, 'choose'), exact: true}).inputValue(), '12');
            assert.equal(state.topics.length, 1);
            assert.equal(state.saves.length, 0);
            await add.getByRole('button', {name: classPathText(lang, 'addStep'), exact: true}).click();
            const step = page.locator('[data-testid="path-step-card"]').nth(1);
            await step.getByRole('button', {name: tr('piano.builder.editDiscussion'), exact: true}).click();
            await modal.getByRole('textbox', {name: new RegExp('^' + forumText(lang, 'title'))}).fill('Discussione aggiornata');
            await modal.getByRole('textbox', {name: new RegExp('^' + forumText(lang, 'body'))}).fill('Testo aggiornato');
            state.failPatch = 1;
            await modal.getByRole('button', {name: forumText(lang, 'save'), exact: true}).click();
            await modal.getByText(forumText(lang, 'sendError'), {exact: true}).waitFor();
            assert.equal(await modal.getByRole('textbox', {name: new RegExp('^' + forumText(lang, 'body'))}).inputValue(), 'Testo aggiornato');
            await modal.getByRole('button', {name: forumText(lang, 'save'), exact: true}).click();
            await modal.waitFor({state: 'hidden'});
            await step.getByText(`${pathForumText(lang, 'forum')} · Discussione aggiornata`, {exact: true}).waitFor();
            assert.equal(state.topics[0].body, 'Testo aggiornato');
            assert.equal(state.saves.length, 0);
            assert.equal(await page.locator('#path-title').inputValue(), 'Piano ancora da salvare');
            assert.equal(page.url(), `${origin}/docente/piani-operativi`);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            // Closing a resource cannot discard the plan draft. Escape also guards the resource draft.
            await step.getByRole('button', {name: tr('piano.builder.editDiscussion'), exact: true}).click();
            await modal.getByRole('textbox', {name: new RegExp('^' + forumText(lang, 'body'))}).fill('Da scartare');
            await page.keyboard.press('Tab');
            assert.ok(await modal.evaluate(node => node.contains(document.activeElement)));
            page.once('dialog', dialog => void dialog.dismiss());
            await page.keyboard.press('Escape');
            assert.equal(await modal.isVisible(), true);
            page.once('dialog', dialog => void dialog.accept());
            await page.keyboard.press('Escape');
            await modal.waitFor({state: 'hidden'});
            assert.equal(await page.locator('#path-title').inputValue(), 'Piano ancora da salvare');
            assert.equal(state.patches.length, 2);
            // A foreign-class detail must never become an editable form in this builder.
            state.detailGroup = 99;
            await step.getByRole('button', {name: tr('piano.builder.editDiscussion'), exact: true}).click();
            await modal.getByText(forumText(lang, 'forbidden'), {exact: true}).waitFor();
            assert.equal(await modal.getByRole('textbox').count(), 0);
            await modal.getByRole('button', {name: stepKindText(lang, 'close'), exact: true}).click();
            await page.getByRole('button', {name: classPathText(lang, 'saveDraft'), exact: true}).click();
            await page.locator('[data-testid="path-summary"]').waitFor();
            assert.equal(state.saves.length, 1);
            assert.equal(state.saves[0].title, 'Piano ancora da salvare');
            assert.deepEqual(state.saves[0].steps.filter(row => row.step_type === 'forum').map(row => row.topic_id), [12]);
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}


for (const [lang, width, kind] of [['it', 1280, 'group'], ['sv', 390, 'individual']]) {
    test(`meetings stay in the builder with current metadata and revisions (${lang}, ${kind})`, {timeout: 240000}, async () => {
        const {context, page, state, errors, tr} = await fixture(lang, width);
        const m = key => classMeetingText(lang, key);
        try {
            await page.getByRole('button', {name: classPathText(lang, 'editPlan'), exact: true}).click();
            await page.locator('#path-title').fill('Bozza con incontro');
            const add = page.locator('[data-testid="add-step"]');
            await add.getByRole('button', {name: stepKindText(lang, 'addStep'), exact: true}).click();
            await add.getByRole('radio', {name: stepKindText(lang, 'meeting'), exact: true}).check();
            await add.getByRole('button', {name: tr('piano.builder.manageMeetings'), exact: true}).click();
            const modal = page.getByRole('dialog');
            await modal.getByRole('button', {name: m('newMeeting'), exact: true}).click();
            if (kind === 'individual') await modal.getByRole('radio', {name: m('individual'), exact: true}).check();
            const title = modal.getByRole('textbox', {name: m('topic'), exact: true});
            await title.fill('Incontro del piano');
            await modal.getByRole('textbox', {name: m('place'), exact: true}).fill('Aula 7');
            if (kind === 'group') await modal.locator('input[type="datetime-local"]').fill('2030-11-01T10:00');
            state.failMeetingCreate = 1;
            await modal.getByRole('button', {name: m('save'), exact: true}).click();
            await modal.getByRole('alert').getByText(m('error'), {exact: true}).waitFor();
            assert.equal(await title.inputValue(), 'Incontro del piano');
            await modal.getByRole('button', {name: m('save'), exact: true}).click();
            await modal.getByRole('option', {name: /Incontro del piano/}).waitFor({state: 'attached'});
            if (kind === 'individual') {
                const slots = modal.locator('[data-testid="meeting-slots"]');
                await slots.locator('input[type="datetime-local"]').fill('2030-11-02T09:00');
                state.failSlot = 1;
                await slots.getByRole('button', {name: m('addSlot'), exact: true}).click();
                await modal.getByRole('alert').getByText(m('error'), {exact: true}).waitFor();
                assert.equal(await slots.locator('input[type="datetime-local"]').inputValue(), '2030-11-02T09:00');
                await slots.getByRole('button', {name: m('addSlot'), exact: true}).click();
                await slots.getByRole('listitem').waitFor();
                assert.equal(state.meetings[0].slots.length, 1);
            }
            await modal.getByRole('button', {name: classPathText(lang, 'addStep'), exact: true}).click();
            await modal.waitFor({state: 'hidden'});
            const card = page.locator('[data-testid="path-step-card"]').nth(1);
            assert.equal(await page.locator('[data-testid="path-step-card"]').count(), 2);
            await card.getByText(new RegExp('^' + m('meeting') + ' · Incontro del piano')).first().waitFor();
            await card.getByRole('button', {name: tr('piano.builder.editMeeting'), exact: true}).click();
            await title.fill('Incontro aggiornato');
            await modal.getByRole('textbox', {name: m('description'), exact: true}).fill('Descrizione aggiornata');
            if (kind === 'group') await modal.locator('input[type="datetime-local"]').fill('2030-11-03T11:30');
            state.failMeetingUpdate = 1;
            await modal.getByRole('button', {name: m('save'), exact: true}).click();
            await modal.getByRole('alert').getByText(m('conflict'), {exact: true}).waitFor();
            assert.equal(await title.inputValue(), 'Incontro aggiornato');
            page.once('dialog', dialog => void dialog.dismiss());
            await modal.getByRole('button', {name: classPathText(lang, 'reload'), exact: true}).click();
            assert.equal(await title.inputValue(), 'Incontro aggiornato');
            page.once('dialog', dialog => void dialog.accept());
            await modal.getByRole('button', {name: classPathText(lang, 'reload'), exact: true}).click();
            await page.waitForFunction(() => document.querySelector('[role="dialog"] input[maxlength="200"]')?.value === 'Versione remota');
            await title.fill('Incontro aggiornato');
            if (kind === 'group') await modal.locator('input[type="datetime-local"]').fill('2030-11-03T11:30');
            await modal.getByRole('button', {name: m('save'), exact: true}).click();
            await title.waitFor({state: 'hidden'});
            await modal.getByRole('button', {name: stepKindText(lang, 'close'), exact: true}).click();
            await modal.waitFor({state: 'hidden'});
            await card.getByText(new RegExp('^' + m('meeting') + ' · Incontro aggiornato')).first().waitFor();
            assert.equal(state.meetingUpdates[1].revision, state.meetingUpdates[0].revision + 1);
            assert.equal(await page.locator('#path-title').inputValue(), 'Bozza con incontro');
            assert.equal(state.saves.length, 0);
            assert.equal(page.url(), `${origin}/docente/piani-operativi`);
            if (kind === 'group') assert.equal(new Date(state.meetings[0].starts_at).getDate(), 3);
            await page.getByRole('button', {name: classPathText(lang, 'saveDraft'), exact: true}).click();
            await page.locator('[data-testid="path-summary"]').waitFor();
            assert.deepEqual(state.saves[0].steps.map(row => row.step_type), ['tool', 'meeting']);
            assert.equal(state.saves[0].steps[1].meeting_id, 41);
            assert.ok(!('follows' in state.saves[0].steps[1]));
            const savePlan = page.getByRole('button', {name: classPathText(lang, 'saveDraft'), exact: true});
            assert.equal(await savePlan.isDisabled(), true);
            // Editing a shared resource refreshes the card without dirtying an already saved plan.
            await card.getByRole('button', {name: tr('piano.builder.editMeeting'), exact: true}).click();
            await title.fill('Titolo finale');
            await modal.getByRole('button', {name: m('save'), exact: true}).click();
            await title.waitFor({state: 'hidden'});
            if (kind === 'individual') {
                const slots = modal.locator('[data-testid="meeting-slots"]');
                await slots.locator('input[type="datetime-local"]').fill('2030-11-04T10:00');
                page.once('dialog', dialog => void dialog.dismiss());
                await page.keyboard.press('Escape');
                assert.equal(await modal.isVisible(), true);
                page.once('dialog', dialog => void dialog.accept());
                await page.keyboard.press('Escape');
            } else await modal.getByRole('button', {name: stepKindText(lang, 'close'), exact: true}).click();
            await modal.waitFor({state: 'hidden'});
            await card.getByText(new RegExp('^' + m('meeting') + ' · Titolo finale')).first().waitFor();
            assert.equal(await savePlan.isDisabled(), true);
            assert.equal(state.saves.length, 1);
            assert.equal(state.meetings[0].slots.length, kind === 'individual' ? 1 : 0);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}
