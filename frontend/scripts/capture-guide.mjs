// Real application rendering, isolated synthetic API fixtures; no production writes.
// Run from frontend: node --experimental-strip-types scripts/capture-guide.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { personalAreaName } from '../src/lib/i18n-personal-area.ts';
import { categoryText } from '../src/lib/i18n-institution-categories.ts';
import { goalText } from '../src/lib/i18n-goals.ts';
import { assignmentText } from '../src/lib/i18n-assignments.ts';
import { learningText } from '../src/lib/i18n-assignment-work.ts';
import { emptyWorkspace } from '../src/lib/visual-tools.ts';
import { visualLabel } from '../src/lib/i18n-visual-tools.ts';

const origin = new URL(process.env.GUIDE_BASE_URL || 'http://127.0.0.1:3000').origin;
const locales = ['it', 'en', 'es', 'fr', 'de', 'sv'];
const captureLocales = process.env.GUIDE_LANGUAGES?.split(',') || locales;
assert.ok(captureLocales.every(lang => locales.includes(lang)), 'Unsupported guide language');
const samples = {
    it: ['Organizzare lo studio', 'Laboratorio di studio', 'Prova due brevi sessioni di ripasso.', 'Racconta cosa ha funzionato e cosa cambieresti.', 'Ho distribuito il ripasso su due giornate.', 'Nel prossimo tentativo confronta anche ciò che ricordi senza appunti.'],
    en: ['Organize my study', 'Study workshop', 'Try two short review sessions.', 'Describe what worked and what you would change.', 'I spread my review over two days.', 'Next time, also compare what you recall without notes.'],
    es: ['Organizar el estudio', 'Taller de estudio', 'Prueba dos sesiones breves de repaso.', 'Cuenta qué funcionó y qué cambiarías.', 'Distribuí el repaso en dos días.', 'La próxima vez compara también lo que recuerdas sin apuntes.'],
    fr: ['Organiser mon travail', 'Atelier d’étude', 'Essaie deux courtes séances de révision.', 'Décris ce qui a fonctionné et ce que tu changerais.', 'J’ai réparti les révisions sur deux jours.', 'La prochaine fois, compare aussi ce que tu retiens sans tes notes.'],
    de: ['Mein Lernen organisieren', 'Lernwerkstatt', 'Probiere zwei kurze Wiederholungen aus.', 'Beschreibe, was funktioniert hat und was du ändern würdest.', 'Ich habe das Wiederholen auf zwei Tage verteilt.', 'Vergleiche beim nächsten Mal auch, woran du dich ohne Notizen erinnerst.'],
    sv: ['Planera mina studier', 'Studieverkstad', 'Prova två korta repetitionspass.', 'Beskriv vad som fungerade och vad du skulle ändra.', 'Jag fördelade repetitionen över två dagar.', 'Jämför nästa gång också vad du minns utan anteckningar.'],
};
const names = ['personal-area', 'personal-goals', 'study-event', 'professional-event', 'teacher-area', 'teacher-groups', 'teacher-catalog', 'teacher-assignment', 'teacher-feedback', 'introduction', 'activities', 'pdf-study', 'flashcards', 'access', 'counselors', 'tool-selection', 'notebook', 'cards', 'calendar', 'received-assignments', 'personal-groups', 'goal-sharing', 'orientation', 'institution-categories'];
const browser = await chromium.launch({ headless: true });
try {
    for (const lang of captureLocales) {
        const [title, groupName, instructions, responsePrompt, response, feedback] = samples[lang];
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: lang, timezoneId: 'Europe/Rome', reducedMotion: 'reduce' });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        let teacher = false;
        let authenticated = false;
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
        const group = { id: 91, name: groupName, code: 'DEMO-3B', school: '', school_level: 'secondaria', owner_username: 'teacher.demo', is_active: true, members_count: 2, created_at: '2026-09-21T08:00:00Z' };
        const goal = { id: 1, title, motivation: instructions, criteria: responsePrompt, reflection: '', status: 'active', priority: 2, review_date: '2026-10-15', shared_group_id: null, revision: 1, catalog_id: null, catalog_snapshot: {}, links: [] };
        const assignment = { id: 1, author_name: 'Alex · Demo', group_name: groupName, source_kind: 'goal', recipient_username: null, recipient_count: 2, instructions, created_at: '2026-09-21T08:00:00Z', revoked_at: null, snapshot: { title, description: '', details: '' }, intent: 'requested', due_date: '2026-10-15', response_prompt: responsePrompt };
        const catalog = [{ id: 1, author_username: 'teacher.demo', group_id: 91, status: 'published', version: 1, data: { title, description: instructions, criteria: responsePrompt, suggestions: '', area: '', audience: '', language: lang } }];
        const workspace = {
            ...emptyWorkspace(),
            card_decks: [{ id: 'default', title }], active_deck_id: 'default',
            cards: [{ id: 'guide-card', text: instructions, bucket: 'explore', source: '', deck_id: 'default' }],
            timeline: { title, events: [{ id: 'guide-event', title, period: '', date_mode: 'point', start_date: '2026-09-24', end_date: null, tense: 'future', symbol: 'study', planned: instructions, reflection: response, source: '', action_ids: [], portfolio: [] }] },
        };
        await page.route('**/*', async route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== origin) return route.abort();
            if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
            assert.equal(request.method(), 'GET', `Screenshot attempted a write: ${url.pathname}`);
            let data = [];
            const path = url.pathname.slice(4);
            if (path === '/auth/me') data = { authenticated, is_admin: false, is_researcher: false, username: authenticated ? (teacher ? 'teacher.demo' : 'student.demo') : null, name: authenticated ? 'Alex · Demo' : null, groups: authenticated ? [teacher ? 'docenti' : 'studenti'] : [] };
            else if (path === '/counselors') data = ['Clio', 'Giulio', 'Iride'].map((name, i) => ({ id: i + 1, name, slug: name.toLowerCase(), language: locales, is_active: true, suitable: true, model_origin: 'local' }));
            else if (path === '/user/learner-profile') data = { id: 1, data: { goal: title, context: groupName, notes: response }, source: 'manual', created_at: '2026-09-23T08:00:00Z' };
            else if (path === '/user/timeline') data = { revision: 1, workspace };
            else if (path === '/user/account') data = { setup_complete: true, notebook_completed: true };
            else if (path === '/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
            else if (path === '/orientation/status') data = { required: false, completed: true };
            else if (path === '/orientation-directory') data = { institution: null, events: [], referrals: [] };
            else if (path === '/teacher/institutions') data = [{ id: 1, name: groupName, slug: 'demo', kind: 'school' }];
            else if (path === '/teacher/institutions/1/orientation-categories') data = { revision: 1, categories: [{ id: 'demo-category', name: title, description: instructions, position: 0, is_active: true, updated_by: 'teacher.demo', updated_at: '2026-09-23T08:00:00Z' }] };
            else if (path === '/tavolo/enabled') data = { enabled: false };
            else if (path === '/telegram/bot-info') data = {};
            else if (path === '/user/flashcards') data = { revision: 0, workspace: { decks: [{ id: 'demo', title, cards: [{ id: 'demo-card', front: responsePrompt, back: instructions }] }] } };
            else if (path === '/session/frozen') data = [{ session_id: 'demo-resume', questionnaire_type: 'QSA', label: 'QSA', current_phase: 'intro', counselor_id: 1, experience: 'standard', frozen_at: '2026-09-23T08:00:00Z' }];
            else if (path === '/user/goals') data = [goal];
            else if (path === '/user/goal-catalog' || path === '/teacher/goal-catalog') data = catalog;
            else if (path === '/user/goal-groups' || path === '/admin/groups') data = [group];
            else if (path === '/user/groups') data = [{ membership_id: 1, group_id: 91, name: groupName, code: 'DEMO-3B', joined_via: 'web' }];
            else if (path === '/user/assignments' || path === '/teacher/assignments') data = [assignment];
            else if (path === '/teacher/assignment-targets') data = [{ id: 91, name: groupName, participants: [{ username: 'student.demo', name: 'Sam · Demo' }, { username: 'student2.demo', name: 'Robin · Demo' }] }];
            else if (path === '/teacher/assignments/1/submissions') data = [{ username: 'student.demo', revision: 1, submission: { text: response }, submitted_at: '2026-09-22T08:00:00Z', feedback, feedback_at: '2026-09-22T09:00:00Z' }];
            return route.fulfill({ json: data });
        });
        mkdirSync(`public/guide/${lang}`, { recursive: true });
        async function go(path) { await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' }); await page.locator('main h1, main h2').first().waitFor(); }
        async function capture(name, locator) {
            await page.mouse.move(1430, 10);
            if (name === 'institution-categories') {
                await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
                await page.locator('[data-institution-categories] img').evaluate(element => element.decode());
            }
            if (name === 'personal-area') {
                await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
                for (const image of await page.locator('[data-personal-area-home] img').all()) {
                    await image.scrollIntoViewIfNeeded();
                    await image.evaluate(element => element.decode());
                }
                await page.evaluate(() => window.scrollTo(0, 0));
            }
            await page.evaluate(() => document.fonts.ready);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert.deepEqual(errors, []);
            assert.deepEqual((await page.getByRole('alert').allTextContents()).filter(text => text.trim()), []);
            await (locator || page).screenshot({ path: `public/guide/${lang}/${name}.png`, ...(['activities', 'personal-area'].includes(name) ? { fullPage: true } : {}) });
            console.log(`${lang}/${name}`);
        }
        if (process.env.GUIDE_SCREENS === 'teacher-area') {
            authenticated = true; teacher = true;
            await go('/docente');
            await page.getByRole('link', { name: categoryText(lang, 'title'), exact: true }).waitFor();
            await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
            await capture('teacher-area');
            await context.close();
            continue;
        }
        if (process.env.GUIDE_SCREENS === 'institution-categories') {
            authenticated = true; teacher = true;
            await go('/docente/orientamento');
            await page.getByRole('button', { name: categoryText(lang, 'new'), exact: true }).waitFor();
            await page.getByRole('heading', { name: title, exact: true }).waitFor();
            await capture('institution-categories');
            await context.close();
            continue;
        }
        if (process.env.GUIDE_SCREENS === 'orientation') {
            authenticated = true;
            await go('/profilo/orientamento');
            await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
            for (const image of await page.locator('[data-personal-area-header] img').all()) { await image.scrollIntoViewIfNeeded(); await image.evaluate(el => el.decode()); }
            await capture('orientation');
            await context.close();
            continue;
        }
        if (process.env.GUIDE_SCREENS === 'personal-area') {
            authenticated = true;
            await go('/profilo');
            await page.getByRole('link', { name: personalAreaName(lang, 'obiettivi'), exact: true }).waitFor();
            await capture('personal-area');
            await context.close();
            continue;
        }
        await go('/'); await capture('access');
        authenticated = true;
        await go('/counselor'); await page.getByText('Clio', { exact: true }).first().waitFor(); await capture('counselors');
        await go('/?view=home'); await capture('tool-selection', page.locator('#tools-assessment'));
        await go('/profilo/taccuino'); await capture('notebook');
        await go('/profilo/carte');
        await page.getByRole('button', { name: `${visualLabel(lang, 'cardDecks')}: ${title}`, exact: true }).click();
        await capture('cards');
        await go('/profilo/timeline?event=guide-event'); await capture('calendar', page.locator('#timeline-guide-event'));
        await go('/profilo/assegnazioni'); await capture('received-assignments');
        await go('/profilo/classi'); await capture('personal-groups');
        await go('/'); await capture('introduction');
        await go('/?view=home'); await capture('activities');
        await go('/profilo/pqbl'); await capture('pdf-study');
        await go('/profilo/flashcard'); await capture('flashcards');
        await go('/profilo'); await page.getByRole('link', { name: personalAreaName(lang, 'obiettivi'), exact: true }).waitFor(); await capture('personal-area');
        await go('/profilo/orientamento'); await capture('orientation');
        await go('/profilo/obiettivi?goal=1'); await page.getByLabel(goalText(lang, 'motivation'), { exact: true }).waitFor(); await capture('personal-goals');
        const sharingForm = page.locator('form').filter({ has: page.getByLabel(goalText(lang, 'share'), { exact: true }) });
        await capture('goal-sharing', sharingForm);
        await go('/strumenti/EVENTO_STUDIO'); await capture('study-event');
        await go('/strumenti/EVENTO_PROFESSIONALE'); await capture('professional-event');
        teacher = true;
        await go('/docente/orientamento'); await page.getByRole('heading', { name: title, exact: true }).waitFor(); await capture('institution-categories');
        await go('/docente'); await page.locator('#teacher-catalogs-title').waitFor(); await capture('teacher-area');
        const groupCard = page.locator('section').filter({ has: page.getByRole('heading', { name: groupName, exact: true }) }).last();
        await capture('teacher-groups', groupCard.locator('..').locator('..'));
        await page.locator('summary').filter({ hasText: goalText(lang, 'catalog') }).click();
        const catalogSection = page.getByRole('region', { name: goalText(lang, 'catalog'), exact: true });
        await catalogSection.getByRole('heading', { name: title, exact: true }).waitFor();
        await capture('teacher-catalog', page.locator('section[aria-labelledby="teacher-catalogs-title"]'));
        await catalogSection.getByRole('button', { name: assignmentText(lang, 'assign'), exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel(assignmentText(lang, 'group'), { exact: true }).selectOption('91');
        await dialog.getByLabel(assignmentText(lang, 'instructions'), { exact: true }).fill(instructions);
        await dialog.getByLabel(learningText(lang, 'intent')).selectOption('requested');
        await dialog.getByLabel(learningText(lang, 'dueDate'), { exact: true }).fill('2026-10-15');
        await dialog.getByLabel(learningText(lang, 'responsePrompt'), { exact: true }).fill(responsePrompt);
        await capture('teacher-assignment', dialog);
        await page.keyboard.press('Escape');
        await page.locator('#assignment-1').getByRole('button', { name: learningText(lang, 'submissions'), exact: true }).click();
        await page.locator('#assignment-1').getByRole('textbox').waitFor();
        await capture('teacher-feedback', page.locator('#assignment-1'));
        await context.close();
    }
    const imports = locales.flatMap(lang => names.map((name, i) => `import ${lang}${i} from '../../public/guide/${lang}/${name}.png';`));
    writeFileSync('src/lib/guide-images.ts', '// Generated by scripts/capture-guide.mjs. Real UI with synthetic data.\n' + imports.join('\n') + '\n\nexport const guideImages = {\n' + locales.map(lang => `    ${lang}: { ${names.map((name, i) => `'${name}': ${lang}${i}`).join(', ')} },`).join('\n') + '\n};\n');
} finally { await browser.close(); }
