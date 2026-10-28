// OC3: real editor/student surfaces, synthetic APIs, no backend or provider.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { classPathText as text } from '../src/lib/i18n-class-paths.js';

const origin = new URL(process.env.CLASS_PATH_PRESENTATION_BASE_URL || 'http://127.0.0.1:3161').origin;
const browser = await chromium.launch({headless: true});
const group = {id: 11, name: 'Classe sintetica', code: 'SYN-OC3', owner_username: 'teacher.test',
    is_active: true, members_count: 1, institution_id: 5};
const meeting = {id: 10, group_id: 11, title: 'Colloquio di ottobre', starts_at: '2026-10-24T23:30:00Z',
    description: 'Dettagli propri dell’incontro', duration_minutes: 30, kind: 'group', mode: 'in_person',
    status: 'scheduled', revision: 1};
function fixture() {
    return {id: 301, group_id: 11, group_name: group.name, title: 'Piano sintetico OC3', description: 'Presentazione unica OC3',
        mode: 'recommended', status: 'draft', revision: 1, total: 5, done: 0, next_step_id: 1, steps_count: 5,
        steps: [
            {id: 1, position: 1, step_type: 'questionnaire_administration', administration_plan_id: 5,
                target_summary: {id: 5, instrument_code: 'QSA', title: 'Strategie di apprendimento', code: 'AP-SYN', scheduled_at: '2026-10-23T12:00:00Z'}},
            {id: 2, position: 2, step_type: 'assignment', assignment_id: 8,
                target_summary: {id: 8, title: 'Organizza la settimana', due_date: '2026-10-26', attachments: []}},
            {id: 3, position: 3, step_type: 'meeting', meeting_id: 10, target_summary: meeting},
            {id: 4, position: 4, step_type: 'forum', topic_id: 12, title: 'Confronto in classe'},
            {id: 5, position: 5, step_type: 'tool', tool_key: 'timeline', title: 'La mia storia', instructions: 'Nota personale\nseconda riga', due_date: '2026-10-30'},
        ].map(step => ({auto_detect: true, state: 'not_done', ...step}))};
}
async function prepare(lang, width, student = false) {
    const context = await browser.newContext({viewport: {width, height: 950}, timezoneId: 'Europe/Stockholm', reducedMotion: 'reduce'});
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    const saves = [];
    let path = fixture();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(lang => {localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light');}, lang);
    await page.route('**/*', route => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const p = url.pathname;
        const json = data => route.fulfill({json: data});
        if (p === '/api/auth/me') return json({authenticated: true, is_admin: false, username: student ? 'student.test' : 'teacher.test', name: 'Persona sintetica', groups: [student ? 'studenti' : 'docenti']});
        if (p === '/api/user/account-preferences') return json({counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true});
        if (p === '/api/user/account') return json({setup_complete: true, notebook_completed: true});
        if (p === '/api/orientation/status') return json({required: false, completed: true});
        if (p === '/api/user/access') return json({restricted: false, tool_keys: ['QSA', 'timeline', 'bussola'], class_ids: [11], counselor_ids: null});
        if (p === '/api/counselors') return json([{id: 1, name: 'Clio', slug: 'clio', language: [lang], suitable: true, is_active: true}]);
        if (p === '/api/user/learner-profile') return json({profile: {}, created_at: '2026-10-01'});
        if (p === '/api/user/forum/unread') return json({total: 0, by_group: {}});
        if (p === '/api/user/forum/links') return json({links: []});
        if (p === '/api/user/meetings') return json([meeting]);
        if (p === '/api/user/paths') return json([path]);
        if (p === '/api/admin/groups') return json([group]);
        if (p === '/api/teacher/path-templates') return json({mine: [], shared: []});
        if (p === '/api/teacher/groups/11/paths') return json([path]);
        if (p === '/api/teacher/groups/11/settings') return json({group_id: 11, revision: 1, disabled_tool_keys: [], tools: [
            {key: 'timeline', kind: 'personal', category: 'personal', enabled: true, admin_enabled: true, always_on: false, label_i18n: {}},
        ]});
        if (p === '/api/teacher/paths/301') {
            if (req.method() === 'PUT') {
                const body = req.postDataJSON();
                saves.push(body);
                path = {...path, ...body, revision: path.revision + 1, steps: body.steps.map(step => ({...path.steps.find(row => row.id === step.id), ...step}))};
            }
            return json(path);
        }
        if (p === '/api/groups/11/forum/topics') return json({topics: []});
        return json([]);
    });
    return {context, page, errors, saves};
}
try {
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) for (const width of [390, 1440]) {
        const {context, page, errors, saves} = await prepare(lang, width);
        await page.goto(`${origin}/docente/piani-operativi`);
        await page.getByRole('button', {name: text(lang, 'open'), exact: true}).click();
        const cards = page.getByTestId('path-step-card');
        await cards.nth(0).getByText('Strategie di apprendimento', {exact: false}).waitFor();
        // Saved steps open with «Modifica»; closed, they show the effective title and note.
        assert.equal(await cards.nth(4).getByText('La mia storia', {exact: true}).count(), 1);
        for (let position = 1; position <= 5; position += 1) {
            await page.getByRole('button', {name: `${text(lang, 'editStep')} #${position}`, exact: true}).click();
        }
        assert.equal(await cards.nth(0).getByRole('textbox').count(), 0);
        assert.equal(await cards.nth(2).locator('input[type=date]').count(), 0);
        assert.equal(await cards.nth(2).getByRole('button', {name: text(lang, 'differentDate')}).count(), 0);
        assert.equal(await cards.nth(4).getByLabel(text(lang, 'noteLabel')).inputValue(), 'Nota personale\nseconda riga');
        if (lang === 'it') {
            const card = cards.nth(0);
            await card.getByRole('button', {name: text(lang, 'personalizeTitle')}).click();
            await card.getByLabel(text(lang, 'stepTitleLabel'), {exact: true}).fill('Titolo scelto');
            await card.getByRole('button', {name: text(lang, 'addNote')}).click();
            const note = card.getByLabel(text(lang, 'noteLabel'));
            assert.equal(await note.getAttribute('maxlength'), '1000');
            await note.fill('Nota aggiuntiva\nsenza duplicati');
            await card.getByRole('button', {name: text(lang, 'differentDate')}).click();
            await card.getByLabel(text(lang, 'dueDateLabel'), {exact: true}).fill('2026-10-28');
            await page.getByRole('button', {name: text(lang, 'saveDraft'), exact: true}).first().click();
            await page.getByText(text(lang, 'saved'), {exact: true}).waitFor();
            assert.equal(saves.at(-1).steps[0].title, 'Titolo scelto');
            assert.equal(saves.at(-1).steps[0].instructions, 'Nota aggiuntiva\nsenza duplicati');
            assert.equal(saves.at(-1).steps[0].due_date, '2026-10-28');
            // Saving closes saved steps again, as for every plan.
            await page.getByRole('button', {name: `${text(lang, 'editStep')} #1`, exact: true}).click();
            await card.getByRole('button', {name: text(lang, 'useDefaultTitle')}).click();
            await card.getByRole('button', {name: text(lang, 'useObjectDate')}).click();
            await card.getByRole('button', {name: text(lang, 'removeNote')}).click();
            await page.getByRole('button', {name: text(lang, 'saveDraft'), exact: true}).first().click();
            await page.getByText(text(lang, 'saved'), {exact: true}).waitFor();
            assert.equal(saves.at(-1).steps[0].title, null);
            assert.equal(saves.at(-1).steps[0].due_date, null);
            assert.equal(saves.at(-1).steps[4].title, 'La mia storia');
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${lang} ${width} editor overflow`);
        await mkdir('output/playwright', {recursive: true});
        await page.screenshot({path: `output/playwright/presentation-editor-${lang}-${width}.png`, fullPage: true});
        if (width === 1440 && process.env.UPDATE_GUIDE_SCREENSHOTS === '1') {
            // Guide image: the steps panel only, with two steps open to show the
            // presentation controls, and no fixed bars painted over it.
            await page.reload();
            await page.getByRole('button', {name: text(lang, 'open'), exact: true}).click();
            for (const position of [1, 5]) {
                await page.getByRole('button', {name: `${text(lang, 'editStep')} #${position}`, exact: true}).click();
            }
            await page.addStyleTag({content: 'header, nav, .fixed, .sticky { visibility: hidden !important; }'});
            const panel = page.getByRole('heading', {name: `${text(lang, 'stepsHeading')} (5)`, exact: true}).locator('xpath=../..');
            await panel.screenshot({path: `public/guide/${lang}/teacher-class-paths.png`});
        }
        assert.deepEqual(errors, []);
        await context.close();
        const student = await prepare(lang, width, true);
        await student.page.goto(`${origin}/profilo/piani-operativi`);
        await student.page.getByRole('heading', {name: 'Strategie di apprendimento', exact: true}).waitFor();
        assert.equal(await student.page.getByText('Presentazione unica OC3', {exact: true}).count(), 1);
        assert.equal(await student.page.getByText('Nota personale\nseconda riga', {exact: true}).count(), 1);
        const row = student.page.locator('#class-step-3');
        assert.equal(await row.locator('time').count(), 1);
        assert.match(await row.locator('time').textContent(), /25/); // local day, not UTC 24th
        assert.equal(await row.getByText(/2026-10-25/).count(), 0); // no duplicate generic deadline
        assert.ok(await student.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${lang} ${width} student overflow`);
        await student.page.screenshot({path: `output/playwright/presentation-student-${lang}-${width}.png`, fullPage: true});
        await student.page.goto(`${origin}/?view=home`);
        const hero = student.page.getByTestId('class-path-hero-card');
        await hero.getByRole('heading', {name: 'Strategie di apprendimento', exact: true}).waitFor();
        // On the home every plan starts folded: open it to read the step details.
        await hero.getByRole('button', {name: 'Strategie di apprendimento', exact: true}).click();
        await hero.locator('time').first().waitFor();
        assert.equal(await hero.locator('time').count(), 1);
        assert.deepEqual(student.errors, []);
        await student.context.close();
        console.log(`presentation ${lang} ${width} OK`);
    }
} finally {await browser.close();}
