import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { instrumentLabel } from './instrument-label.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { personalAreaText } from './i18n-personal-area.ts';

// Navbar wording (audit-navbar P1). Expected strings are written by hand, so a
// copy change shows up in this diff instead of passing by reading the renderer's
// own dictionaries. i18n.ts imports modules without extensions, so the six base
// dictionaries are read from its source.
const languages = ['it', 'en', 'es', 'fr', 'de', 'sv'] as const;
type Lang = typeof languages[number];
const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'i18n.ts'), 'utf8');

function dictionary(lang: Lang): Map<string, string> {
    const start = source.indexOf(`const ${lang}: Dict = {`);
    const end = source.indexOf('\n};', start);
    assert.ok(start >= 0 && end > start, `dictionary ${lang} not found`);
    const entries = new Map<string, string>();
    for (const match of source.slice(start, end).matchAll(/^\s*'([^']+)':\s*(['"])((?:\\.|(?!\2).)*)\2,/gm)) {
        entries.set(match[1], match[3].replace(/\\(.)/g, '$1'));
    }
    return entries;
}

const dicts = Object.fromEntries(languages.map((lang) => [lang, dictionary(lang)])) as Record<Lang, Map<string, string>>;
// Same fallback order as lookup() in i18n.ts: language, English, Italian.
const translator = (lang: Lang) => (key: string, fallback: string) => dicts[lang].get(key) ?? dicts.en.get(key) ?? dicts.it.get(key) ?? fallback;
const byLang = (key: string) => languages.map((lang) => dicts[lang].get(key));

test('the Assistant is generic in every language, as its access is', () => {
    assert.deepEqual(byLang('assistant.title'), ['Assistente', 'Assistant', 'Asistente', 'Assistant', 'Assistent', 'Assistent']);
    const teacherWording = /docent|enseignant|Lehrkr|lärar/i;
    for (const key of ['assistant.title', 'assistant.authBody', 'assistant.deniedTitle', 'assistant.deniedBody']) {
        languages.forEach((lang) => assert.doesNotMatch(dicts[lang].get(key) ?? '', teacherWording, `${lang} ${key}`));
    }
});

test('the /profilo entry stays «Area studente» in the navbar and in its pages', () => {
    const student = ['Area studente', 'Student area', 'Área del estudiante', 'Espace élève', 'Bereich für Lernende', 'Elevområde'];
    assert.deepEqual(byLang('profile.nav'), student);
    assert.deepEqual(languages.map((lang) => personalAreaText(lang, 'title')), student);
});

test('the header badge shows the instrument name in the UI language', () => {
    assert.deepEqual(
        languages.map((lang) => instrumentLabel('EVENTO_STUDIO', 'Evento significativo di studio', translator(lang))),
        ['Evento di studio', 'Study event', 'Evento de estudio', 'Événement d’étude', 'Lernereignis', 'Studiehändelse'],
    );
    assert.deepEqual(languages.map((lang) => instrumentLabel('IDEA', 'Idea', translator(lang))), ['Idea', 'Idea', 'Idea', 'Idée', 'Idee', 'Idé']);
});

test('the header badge falls back to the catalogue name, then to the dynamic code', () => {
    assert.equal(instrumentLabel('QSA', 'QSA', translator('fr')), 'QSA');
    assert.equal(instrumentLabel('MY_SCHOOL_TOOL', undefined, translator('de')), 'MY_SCHOOL_TOOL');
});

test('the satisfaction questionnaire sits on the introduction, right after the catalogue link, and on the sign-in screen, not in the header', () => {
    assert.deepEqual(byLang('app.intro.feedback.title'), ['Dicci com’è andata', 'Tell us how it went', 'Cuéntanos qué tal te fue', 'Dites-nous comment ça s’est passé', 'Sag uns, wie es war', 'Berätta hur det gick']);
    assert.deepEqual(byLang('app.intro.feedback.body'), [
        'Questionario di gradimento: aiutaci a migliorare CounselorBot.',
        'Feedback survey: help us improve CounselorBot.',
        'Encuesta de satisfacción: ayúdanos a mejorar CounselorBot.',
        'Questionnaire de satisfaction : aidez-nous à améliorer CounselorBot.',
        'Zufriedenheitsumfrage: Hilf uns, CounselorBot zu verbessern.',
        'Nöjdhetsenkät: hjälp oss att förbättra CounselorBot.',
    ]);
    const component = (file: string) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../components', file), 'utf8');
    assert.doesNotMatch(component('layout/Header.tsx'), /\/questionario/);
    assert.match(component('home/FeedbackEntry.tsx'), /<Link href="\/questionario"/);
    const intro = component('home/IntroScreen.tsx');
    const all = intro.indexOf("t('app.intro.entry.all')");
    const feedback = intro.indexOf('<FeedbackEntry');
    assert.ok(all >= 0 && feedback > all, 'feedback entry after «Vedi tutte le attività e i percorsi»');
    assert.equal(intro.slice(all, feedback).match(/<(Link|button|a)\b/g), null, 'no other control in between');
    // Anonymous people see the sign-in screen instead of the introduction.
    const home = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/page.tsx'), 'utf8');
    assert.ok(home.indexOf('<FeedbackEntry', home.indexOf("t('home.auth.cta')")) > 0, 'feedback entry on the sign-in screen');
});
