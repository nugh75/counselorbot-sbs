import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const origin = new URL(process.env.DESIGN_BASE_URL || 'http://127.0.0.1:3000').origin;
let browser;
browser = await chromium.launch({ headless: true });


async function fixture({ width = 390, height = 844, touch = true, locale = 'it', admin = false, dark = false, motion = 'reduce', experience = 'standard' } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, reducedMotion: motion, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ locale, dark }) => {
        localStorage.setItem('cb_lang', locale);
        localStorage.setItem('cb_theme', dark ? 'dark' : 'light');
        localStorage.setItem('counselorbot_selected_counselor', '1');
    }, { locale, dark });
    const snapshot = {
        session_id: 'design-fixture', questionnaire_type: 'QSA', current_phase: 'intro', counselor_id: 1,
        locale, response_length: 'medium', experience, scores: { C1: 7, C2: 5 },
        messages: [{ role: 'system', content: '--- Introduzione ---' }, ...Array.from({ length: 16 }, (_, i) => ({
            role: i % 2 ? 'assistant' : 'user',
            content: i % 2 ? 'Possiamo partire da una situazione concreta. Pensa all’ultima volta che hai studiato: che cosa ti ha aiutato a iniziare e che cosa ti ha fatto interrompere?' : 'Vorrei organizzare meglio lo studio.',
        }))],
    };
    // Every API request is local to this fixture, including automatic freezing.
    await page.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return request.method() === 'GET' ? route.continue() : route.abort();
        let data = [];
        if (url.pathname === '/api/auth/me') data = { authenticated: true, is_admin: admin, username: 'design-fixture', name: 'Studente con un nome molto lungo per la prova', groups: [admin ? 'admins' : 'studenti'] };
        else if (url.pathname === '/api/user/account-preferences') data = { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true };
        else if (url.pathname === '/api/counselors') data = [{ id: 1, name: 'Counselor di prova con nome lungo', slug: 'fixture', language: ['it'], questionnaire_types: ['QSA', 'SAVICKAS'], suitable: true, is_active: true }];
        else if (url.pathname === '/api/user/learner-profile') data = { created_at: '2026-09-05T08:00:00Z', profile: {} };
        else if (url.pathname === '/api/orientation/status') data = { required: false };
        else if (url.pathname === '/api/session/frozen') data = [{ ...snapshot, label: 'QSA · Organizzare lo studio' }];
        else if (url.pathname === '/api/session/frozen/design-fixture') data = snapshot;
        else if (url.pathname === '/api/qsa/guided-ui-texts') data = { guided_steps: [{ id: 'intro', label: 'Introduzione', sort_order: 1, system_prompt_mode: 'qsa-intro', suggested_questions: ['Come funziona questo percorso?'] }] };
        else if (url.pathname.endsWith('/recommendations')) data = { reading: [], strategy: [] };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    return { page, context, errors };
}

const { page, context } = await fixture({ width: 320, height: 568, touch: true });
await page.goto(`${origin}/?frozen=design-fixture`, { waitUntil: 'networkidle', timeout: 90000 });
await page.locator('#guided-composer').waitFor();
await page.waitForTimeout(1000);
const parts = await page.evaluate(() => [...document.querySelectorAll('.console-header, section[aria-labelledby="guided-chat-title"] > *, section[aria-labelledby="guided-chat-title"] header, [role="log"], #guided-composer, nav[aria-label]')].map(e => `${e.tagName}.${(e.className||'').toString().slice(0,40)} ${e.getAttribute('aria-label')||''} y=${Math.round(e.getBoundingClientRect().y)} h=${Math.round(e.getBoundingClientRect().height)}`));
console.log(parts.join('\n'));
await page.screenshot({ path: '/private/tmp/claude-501/-Volumes-sviluppo-progetti-Counselorbot-wt-911/6c04ebc7-1eb5-47ae-88e4-b6819da03806/scratchpad/du320.png' });
await context.close(); await browser.close();
