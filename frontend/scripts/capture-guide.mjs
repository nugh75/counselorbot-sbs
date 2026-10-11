// Real application rendering, isolated synthetic API fixtures; no production writes.
// Run from frontend: node --experimental-strip-types scripts/capture-guide.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { personalAreaName } from '../src/lib/i18n-personal-area.ts';
import { teacherAreaName } from '../src/lib/i18n-teacher-area.ts';
import { categoryText } from '../src/lib/i18n-institution-categories.ts';
import { goalText } from '../src/lib/i18n-goals.ts';
import { assignmentText } from '../src/lib/i18n-assignments.ts';
import { learningText } from '../src/lib/i18n-assignment-work.ts';
import { emptyWorkspace } from '../src/lib/visual-tools.ts';
import { visualLabel } from '../src/lib/i18n-visual-tools.ts';
import { classPickerText } from '../src/lib/i18n-class-picker.ts';
import { classSettingsText } from '../src/lib/i18n-class-settings.ts';
import { notebookLinkText } from '../src/lib/teacher-notebook-links.ts';
import { classPathText } from '../src/lib/i18n-class-paths.ts';

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
const names = ['personal-area', 'personal-goals', 'study-event', 'professional-event', 'teacher-area', 'teacher-groups', 'teacher-catalog', 'teacher-assignment', 'teacher-feedback', 'introduction', 'activities', 'pdf-study', 'flashcards', 'access', 'counselors', 'tool-selection', 'notebook', 'cards', 'calendar', 'received-assignments', 'personal-groups', 'goal-sharing', 'orientation', 'institution-categories', 'teacher-class-picker', 'teacher-notebook', 'class-forum', 'teacher-forum', 'class-overview', 'class-tools', 'admin-classes', 'admin-locks', 'admin-audit', 'teacher-class-paths', 'class-paths'];
const browser = await chromium.launch({ headless: true });
try {
    for (const lang of captureLocales) {
        const [title, groupName, instructions, responsePrompt, response, feedback] = samples[lang];
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: lang, timezoneId: 'Europe/Rome', reducedMotion: 'reduce' });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        let teacher = false;
        let admin = false;
        let classSettingsCapture = process.env.GUIDE_SCREENS === 'class-settings';
        const classPathsCapture = process.env.GUIDE_SCREENS === 'class-paths';
        let authenticated = false;
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(lang => { localStorage.setItem('cb_lang', lang); localStorage.setItem('cb_theme', 'light'); }, lang);
        const group = { id: 91, name: groupName, code: 'DEMO-3B', school: '', school_level: 'secondaria', institution_id: null, description: instructions, methodologies: null, context_visible_to_students: false, owner_username: 'teacher.demo', is_active: true, members_count: 2, created_at: '2026-09-21T08:00:00Z' };
        const labels = key => Object.fromEntries(locales.map(locale => [locale, classSettingsText(locale, key)]));
        const tool = (key, category, enabled = true, admin_enabled = true, locked = false) => ({
            key, category, kind: ['QSA', 'ZTPI', 'QPCS', 'SAVICKAS'].includes(key) ? 'instrument' : 'personal',
            label_i18n: ['QSA', 'ZTPI', 'QPCS', 'SAVICKAS'].includes(key) ? Object.fromEntries(locales.map(locale => [locale, key])) : labels(key),
            enabled, admin_enabled, always_on: category === 'always_on', locked,
            locked_enabled: locked ? enabled : null, locked_by: locked ? 'admin.demo' : null,
            locked_at: locked ? '2026-10-09T08:00:00Z' : null, changed_by_admin: locked || key === 'goals',
        });
        const settings = {
            group_id: 91, revision: 7, disabled_tool_keys: ['ZTPI'], disabled_counselor_ids: [3], default_counselor_id: 2,
            tools: [tool('QSA', 'assessment'), tool('ZTPI', 'assessment', false, true, true),
                tool('QPCS', 'assessment', false, false), tool('SAVICKAS', 'guided'), tool('goals', 'personal'),
                tool('bussola', 'support'), tool('assistant', 'support'), tool('forum', 'forum'),
                ...['notebook', 'results', 'classes', 'assignments'].map(key => tool(key, 'always_on'))],
            counselors: ['Clio', 'Giulio', 'Iride'].map((name, i) => ({
                id: i + 1, name, avatar_url: null, approach_categories: ['tutor'], admin_enabled: true, enabled: i !== 2,
                locked: i === 1, locked_enabled: i === 1 ? true : null,
                locked_by: i === 1 ? 'admin.demo' : null, locked_at: i === 1 ? '2026-10-09T08:00:00Z' : null,
                changed_by_admin: i === 1,
            })),
            forum: { students_can_open: true, premoderation: false, premoderation_locked: true,
                premoderation_lock: { value: false, locked_by: 'admin.demo', locked_at: '2026-10-09T08:00:00Z' } },
        };
        const goal = { id: 1, title, motivation: instructions, criteria: responsePrompt, reflection: '', status: 'active', priority: 2, review_date: '2026-10-15', shared_group_id: null, revision: 1, catalog_id: null, catalog_snapshot: {}, links: [], parent_ids: [], method: [], origin: null, reviews: [], checks: [] };
        const assignment = { id: 1, author_name: 'Alex · Demo', group_name: groupName, source_kind: 'goal', recipient_username: null, recipient_count: 2, instructions, created_at: '2026-09-21T08:00:00Z', revoked_at: null, snapshot: { title, description: '', details: '' }, intent: 'requested', due_date: '2026-10-15', response_prompt: responsePrompt };
        const catalog = [{ id: 1, author_username: 'teacher.demo', group_id: 91, status: 'published', version: 1, data: { title, description: instructions, criteria: responsePrompt, suggestions: '', area: '', audience: '', language: lang } }];
        const demoInstitution = { id: 1, name: groupName, slug: 'demo', kind: 'school' };
        const demoCategory = { id: 'demo-category', name: title, description: instructions, position: 0, is_active: true, updated_by: 'teacher.demo', updated_at: '2026-09-23T08:00:00Z' };
        const demoReferral = { id: 'demo-contact', institution_id: 1, category_ids: ['demo-category'], role: `${categoryText(lang, 'contacts')} · Demo`, person: '', needs: ['metodo-studio'], what_for: instructions, how_to_reach: '', email: '', hours: '', location: '', page_url: '' };
        const demoEvent = { id: 'demo-event', institution_id: 1, category_ids: ['demo-category'], title: `${categoryText(lang, 'events')} · Demo`, starts_at: '2026-11-10T10:00:00Z', needs: ['metodo-studio'], summary: instructions, page_url: '', location: '', is_online: true };
        // #101: a class path with a personal tool, a guided chat and its follow-up meeting.
        const meeting = { id: 5, group_id: 91, title: groupName, description: null, starts_at: '2026-11-10T09:00:00Z', duration_minutes: 60,
            kind: 'group', host_kind: 'teacher', host_name: null, host_role: null, mode: 'in_person', place: 'Lab 2', link: null,
            status: 'scheduled', revision: 1, show_on_timeline: true, attendance_count: 0, group_ids: [91], group_names: [groupName],
            group_name: groupName, attended: false, can_mark: false };
        const pathSteps = [
            { id: 1, position: 1, step_type: 'tool', tool_key: 'goals', title, instructions, auto_detect: true, can_self_mark: false },
            { id: 2, position: 2, step_type: 'guided_chat', tool_key: 'SAVICKAS', title: null, instructions: responsePrompt, auto_detect: true, can_self_mark: false },
            { id: 3, position: 3, step_type: 'meeting', tool_key: null, meeting_id: 5, follows_step_id: 2, target_summary: meeting,
              title: null, instructions: null, auto_detect: true, can_self_mark: false },
        ];
        const classPath = { id: 31, group_id: 91, title: groupName, description: instructions, mode: 'recommended', status: 'published',
            revision: 2, created_by: 'teacher.demo', template_id: null, published_at: '2026-10-01T08:00:00Z', steps_count: 3, steps: pathSteps };
        const studentPath = { id: 31, group_id: 91, group_name: groupName, title: groupName, description: instructions, mode: 'recommended',
            next_step_id: 2, done: 1, total: 3, steps: pathSteps.map((step, i) => ({ ...step, state: i === 0 ? 'done' : 'not_done',
                source: i === 0 ? 'automatic' : null, start_href: i === 0 ? '/profilo/obiettivi' : i === 1 ? '/?start=SAVICKAS' : null,
                availability_reason: null })) };
        const workspace = {
            ...emptyWorkspace(),
            card_decks: [{ id: 'default', title }], active_deck_id: 'default',
            cards: [{ id: 'guide-card', text: instructions, bucket: 'explore', source: '', deck_id: 'default' }],
            timeline: { title, events: [{ id: 'guide-event', title, period: '', date_mode: 'point', start_date: '2026-09-24', end_date: null, tense: 'past', symbol: 'study', planned: instructions, reflection: response, source: '', action_ids: [], portfolio: [] }] },
        };
        await page.route('**/*', async route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== origin) return route.abort();
            if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
            assert.equal(request.method(), 'GET', `Screenshot attempted a write: ${url.pathname}`);
            let data = [];
            const path = url.pathname.slice(4);
            if (path === '/auth/me') data = { authenticated, is_admin: admin, is_researcher: false, username: authenticated ? (teacher ? 'teacher.demo' : 'student.demo') : null, name: authenticated ? (admin ? 'Admin · Demo' : teacher ? 'Prof. Demo' : 'Alex · Demo') : null, groups: authenticated ? [admin ? 'admins' : teacher ? 'docenti' : 'studenti'] : [] };
            else if (path === '/counselors') data = (classSettingsCapture && !teacher ? ['Clio', 'Giulio'] : ['Clio', 'Giulio', 'Iride']).map((name, i) => ({ id: i + 1, name, slug: name.toLowerCase(), language: locales, is_active: true, suitable: true, model_origin: 'local' }));
            else if (path === '/user/access') data = { restricted: classSettingsCapture && !teacher,
                tool_keys: ['QSA', 'SAVICKAS', 'goals', 'bussola', 'assistant', 'forum'], counselor_ids: [1, 2],
                default_counselor_id: 2, class_ids: [91] };
            else if (path === '/admin/classes') data = [{ ...group, institution_name: groupName, institution_id: 1,
                owner_display_name: 'Prof. Demo', co_teachers: [], has_custom_settings: true, locked_items_count: 3 }];
            else if (path === '/teacher/groups/91/settings/audit-log') data = [
                { id: 3, actor_username: 'admin.demo', actor_display_name: 'Admin · Demo', actor_role: 'admin', action: 'unlock',
                    target_kind: 'tool', target_id: 'goals', old_value: { enabled: true, locked: true }, new_value: { enabled: true, locked: false }, reason: instructions, created_at: '2026-10-09T08:15:00Z' },
                { id: 2, actor_username: 'admin.demo', actor_display_name: 'Admin · Demo', actor_role: 'admin', action: 'lock',
                    target_kind: 'tool', target_id: 'ZTPI', old_value: { enabled: true, locked: false }, new_value: { enabled: false, locked: true }, reason: instructions, created_at: '2026-10-09T08:00:00Z' },
                { id: 1, actor_username: 'teacher.demo', actor_display_name: 'Prof. Demo', actor_role: 'teacher', action: 'setting_change',
                    target_kind: 'counselor', target_id: '3', old_value: { enabled: true }, new_value: { enabled: false }, reason: null, created_at: '2026-10-09T07:45:00Z' },
            ];
            else if (path === '/user/learner-profile') data = { id: 1, data: { goal: title, context: groupName, notes: response }, source: 'manual', created_at: '2026-09-23T08:00:00Z' };
            else if (path === '/user/teacher-notebook') data = null;
            else if (path === '/user/timeline') data = { revision: 1, workspace };
            else if (path === '/user/account') data = { setup_complete: true, notebook_completed: true };
            else if (path === '/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
            else if (path === '/orientation/status') data = { required: false, completed: true };
            else if (path === '/orientation-directory') data = { institution: demoInstitution, institution_groups: [{ institution: demoInstitution, categories: [demoCategory], referrals: [demoReferral], events: [demoEvent] }], events: [demoEvent], referrals: [demoReferral] };
            else if (path === '/teacher/institutions') data = [{ id: 1, name: groupName, slug: 'demo', kind: 'school' }];
            else if (path === '/teacher/institutions/1/orientation-contents') data = { revision: 1, categories: [demoCategory], contents: [{ id: 1, kind: 'referral', title: demoReferral.role, category_ids: ['demo-category'], updated_at: demoCategory.updated_at }, { id: 2, kind: 'event', title: demoEvent.title, starts_at: demoEvent.starts_at, category_ids: ['demo-category'], updated_at: demoCategory.updated_at }] };
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
            else if (path.startsWith('/groups/91/forum/topics')) data = {
                group: { id: 91, name: groupName, is_active: true },
                can_open_topic: true,
                can_moderate: teacher,
                topics: [
                    {
                        id: 1, group_id: 91, title, pinned: true, locked: false,
                        author_display_name: 'Prof. Demo', author_username: 'teacher.demo', body: instructions,
                        created_at: '2026-09-21T08:00:00Z', edited_at: null, hidden: false, deleted: false, hidden_reason: null,
                        own: teacher, status: 'published', replies_count: 3, unread_count: 2, last_post_at: '2026-09-22T10:00:00Z',
                        link: { kind: 'path_step', id: 1, title: groupName, tool_key: 'QSA', path_title: title, available: true },
                    },
                    {
                        id: 2, group_id: 91, title: responsePrompt, pinned: false, locked: false,
                        author_display_name: 'Alex · Demo', author_username: 'student.demo', body: response,
                        created_at: '2026-09-22T09:00:00Z', edited_at: null, hidden: false, deleted: false, hidden_reason: null,
                        own: !teacher, status: 'published', replies_count: 2, unread_count: 0, last_post_at: '2026-09-22T09:30:00Z',
                        link: null,
                    },
                ],
                has_more: false,
                pending_count: teacher ? 1 : 0,
                forum_enabled: true,
                premoderated: false,
                mute: null,
            };
            else if (path === '/teacher/path-templates') data = { mine: [], shared: [] };
            else if (path === '/teacher/groups/91/paths') data = [classPath];
            else if (path === '/teacher/paths/31/progress') data = { path_id: 31, group_id: 91, title: groupName, mode: 'recommended', status: 'published',
                published_at: classPath.published_at, steps: pathSteps.map((step, i) => ({ ...step, available: true, done_count: [2, 1, 0][i] })), students: [] };
            else if (path === '/teacher/groups/91/meetings') data = [meeting];
            else if (path === '/teacher/groups/91/meeting-referents') data = [];
            else if (path === '/user/paths') data = [studentPath];
            else if (path === '/user/meetings') data = [meeting];
            else if (path === '/teacher/groups/91/settings') data = classSettingsCapture || classPathsCapture ? settings : {
                group_id: 91, revision: 1, disabled_tool_keys: [], tools: [], disabled_counselor_ids: [],
                default_counselor_id: null, counselors: [], forum: { students_can_open: true, premoderation: false },
            };
            else if (path === '/user/forum/unread') data = { total: 2, by_group: { '91': 2 } };
            else if (path === '/user/forum/links') data = { links: [] };
            return route.fulfill({ json: data });
        });
        mkdirSync(`public/guide/${lang}`, { recursive: true });
        async function go(path) { await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' }); await page.locator('main h1, main h2').first().waitFor(); }
        async function capture(name, locator) {
            await page.mouse.move(1430, 10);
            if (name === 'teacher-groups' || name === 'teacher-notebook') {
                await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
                for (const image of await page.locator('[data-teacher-area-header] img').all()) await image.evaluate(element => element.decode());
                await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
                locator = null; // Include creation and header; avoid sticky-header overlap on an element crop.
            }
            if (name === 'institution-categories') {
                await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
                await page.locator('[data-institution-categories] img').evaluate(element => element.decode());
                await page.locator('summary').filter({ hasText: categoryText(lang, 'contacts') }).evaluate(el => { el.parentElement.open = true; });
                await page.locator('summary').filter({ hasText: categoryText(lang, 'events') }).evaluate(el => { el.parentElement.open = true; });
                await page.evaluate(() => window.scrollTo(0, 0));
            }
            if (name === 'personal-area' || name === 'teacher-area') {
                await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
                for (const image of await page.locator('[data-personal-area-home] img, [data-teacher-area-home] img').all()) {
                    await image.scrollIntoViewIfNeeded();
                    await image.evaluate(element => element.decode());
                }
                await page.evaluate(() => window.scrollTo(0, 0));
            }
            await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
            const fullClassPage = ['class-overview', 'class-tools', 'admin-classes', 'admin-locks', 'admin-audit'].includes(name);
            if (fullClassPage) {
                // A tall viewport keeps the real sticky Save bar at the end without obscuring rows.
                await page.evaluate(() => window.scrollTo(0, 0));
                await page.setViewportSize({ width: 1440, height: await page.evaluate(() => document.documentElement.scrollHeight) });
                await page.evaluate(() => window.scrollTo(0, 0));
                locator = null;
            }
            await page.evaluate(() => document.fonts.ready);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert.deepEqual(errors, []);
            assert.deepEqual((await page.getByRole('alert').allTextContents()).filter(text => text.trim()), []);
            if (name === 'orientation') await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
            await (locator || page).screenshot({ path: `public/guide/${lang}/${name}.png`, ...(fullClassPage || ['activities', 'personal-area', 'teacher-area', 'teacher-groups', 'teacher-notebook', 'institution-categories', 'orientation'].includes(name) ? { fullPage: true } : {}) });
            if (fullClassPage) await page.setViewportSize({ width: 1440, height: 1000 });
            console.log(`${lang}/${name}`);
        }
        async function captureNotebook() {
            await go('/docente/taccuino');
            await page.locator('#teacher-notebook-subjects:not(:disabled)').waitFor();
            await capture('teacher-notebook');
        }
        async function capturePicker() {
            await go('/docente/taccuino');
            await page.getByRole('button', { name: notebookLinkText(lang, 'classes'), exact: true }).click();
            const popup = page.getByRole('dialog', { name: classPickerText(lang, 'title'), exact: true });
            await popup.getByLabel(classPickerText(lang, 'label'), { exact: true }).selectOption('91');
            await popup.locator('#class-picker-save-91:not(:disabled)').waitFor();
            await capture('teacher-class-picker', popup);
            await page.keyboard.press('Escape');
        }
        async function captureClassSettings() {
            classSettingsCapture = true;
            authenticated = true; teacher = false;
            await go('/counselor');
            await page.getByText('Clio', { exact: true }).first().waitFor();
            assert.equal(await page.getByText('Iride', { exact: true }).count(), 0);
            await capture('counselors');
            await go('/?view=home');
            await capture('tool-selection', page.locator('#tools-assessment'));
            teacher = true;
            await go('/docente/classi');
            await page.getByRole('heading', { name: groupName, exact: true }).waitFor();
            await capture('teacher-groups');
            await go('/docente/classi/91');
            await page.locator('#class-tab-overview[aria-selected="true"]').waitFor();
            await capture('class-overview', page.locator('main section').first());
            await page.locator('#class-tab-toolsTab').click();
            await page.getByRole('radio', { name: classSettingsText(lang, 'counselorDefault') + ': Giulio', exact: true }).waitFor();
            assert.equal(await page.getByRole('checkbox', { name: 'ZTPI', exact: true }).isDisabled(), true);
            await capture('class-tools', page.locator('main section').first());
            admin = true;
            await go('/admin/classi');
            await page.getByRole('heading', { name: classSettingsText(lang, 'adminClasses'), exact: true }).waitFor();
            await page.getByRole('article').waitFor();
            await capture('admin-classes', page.locator('main.page-wide'));
            await go('/admin/classi/91');
            await page.locator('#class-tab-toolsTab').click();
            await page.getByRole('button', { name: classSettingsText(lang, 'unlock'), exact: true }).first().waitFor();
            await capture('admin-locks', page.locator('main section').first());
            await page.locator('#class-tab-audit').click();
            await page.getByText('Admin · Demo (admin.demo)', { exact: false }).first().waitFor();
            await capture('admin-audit', page.locator('main section').first());
        }
        if (classSettingsCapture) {
            await captureClassSettings();
            await context.close();
            continue;
        }
        if (['teacher-class-picker' , 'teacher-notebook'].includes(process.env.GUIDE_SCREENS)) {
            authenticated = true; teacher = true;
            await go('/docente');
            await capture('teacher-area');
            await captureNotebook();
            await capturePicker();
            await context.close();
            continue;
        }
        if (['teacher-area', 'teacher-loading', 'teacher-classes'].includes(process.env.GUIDE_SCREENS)) {
            authenticated = true; teacher = true;
            if (process.env.GUIDE_SCREENS !== 'teacher-classes') {
                await go('/docente');
                await page.getByRole('link', { name: teacherAreaName(lang, 'orientamento'), exact: true }).waitFor();
                await capture('teacher-area');
            }
            if (process.env.GUIDE_SCREENS !== 'teacher-area') {
                await go('/docente/classi');
                const groupCard = page.locator('section').filter({ has: page.getByRole('heading', { name: groupName, exact: true }) }).last();
                await groupCard.waitFor();
                await capture('teacher-groups', groupCard.locator('..').locator('..'));
            }
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
        if (classPathsCapture) {
            authenticated = true; teacher = true;
            await go('/docente/percorsi?class=91');
            await page.getByRole('button', { name: classPathText(lang, 'open'), exact: true }).click();
            const editor = page.locator('[data-testid="add-step"]').locator('..');
            await editor.locator('[data-testid="path-step-card"]').nth(2).waitFor();
            await capture('teacher-class-paths', editor);
            teacher = false;
            await go('/profilo/percorsi');
            await page.locator('[data-testid="meeting-details"]').first().waitFor();
            await capture('class-paths', page.locator('main#contenuto'));
            await context.close();
            continue;
        }
        if (process.env.GUIDE_SCREENS === 'forum') {
            authenticated = true; teacher = false;
            await go('/profilo/classi/91/forum');
            await page.getByRole('heading', { level: 1 }).first().waitFor();
            await capture('class-forum', page.locator('section').first());
            teacher = true;
            await go('/docente/classi/91');
            await page.locator('#class-tab-forum').click();
            await page.locator('#class-panel-forum').waitFor();
            await capture('teacher-forum', page.locator('section').first());
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
        await go('/profilo/timeline?event=guide-event'); await capture('calendar', page.locator('#timeline-milestone-guide-event'));
        await go('/profilo/assegnazioni'); await capture('received-assignments');
        await go('/profilo/classi'); await capture('personal-groups');
        await go('/profilo/classi/91/forum');
        await page.getByRole('heading', { level: 1 }).first().waitFor();
        await capture('class-forum', page.locator('section').first());
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
        await go('/docente'); await page.getByRole('link', { name: teacherAreaName(lang, 'orientamento'), exact: true }).waitFor(); await capture('teacher-area');
        await captureNotebook();
        await capturePicker();
        await go('/docente/classi');
        const groupCard = page.locator('section').filter({ has: page.getByRole('heading', { name: groupName, exact: true }) }).last();
        await capture('teacher-groups', groupCard.locator('..').locator('..'));
        await go('/docente/classi/91');
        await page.locator('#class-tab-forum').click();
        await page.locator('#class-panel-forum').waitFor();
        await capture('teacher-forum', page.locator('section').first());
        await go('/docente/catalogo-obiettivi');
        const catalogSection = page.getByRole('region', { name: goalText(lang, 'catalog'), exact: true });
        await catalogSection.getByRole('heading', { name: title, exact: true }).waitFor();
        await capture('teacher-catalog', catalogSection);
        await catalogSection.getByRole('button', { name: assignmentText(lang, 'assign'), exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel(assignmentText(lang, 'group'), { exact: true }).selectOption('91');
        await dialog.getByLabel(assignmentText(lang, 'instructions'), { exact: true }).fill(instructions);
        await dialog.getByLabel(learningText(lang, 'intent')).selectOption('requested');
        await dialog.getByLabel(learningText(lang, 'dueDate'), { exact: true }).fill('2026-10-15');
        await dialog.getByLabel(learningText(lang, 'responsePrompt'), { exact: true }).fill(responsePrompt);
        await capture('teacher-assignment', dialog);
        await page.keyboard.press('Escape');
        await go('/docente/assegnazioni');
        await page.locator('#assignment-1').getByRole('button', { name: learningText(lang, 'submissions'), exact: true }).click();
        await page.locator('#assignment-1').getByRole('textbox').waitFor();
        await capture('teacher-feedback', page.locator('#assignment-1'));
        await captureClassSettings();
        await context.close();
    }
    const imports = locales.flatMap(lang => names.map((name, i) => `import ${lang}${i} from '../../public/guide/${lang}/${name}.png';`));
    writeFileSync('src/lib/guide-images.ts', '// Generated by scripts/capture-guide.mjs. Real UI with synthetic data.\n' + imports.join('\n') + '\n\nexport const guideImages = {\n' + locales.map(lang => `    ${lang}: { ${names.map((name, i) => `'${name}': ${lang}${i}`).join(', ')} },`).join('\n') + '\n};\n');
} finally { await browser.close(); }
