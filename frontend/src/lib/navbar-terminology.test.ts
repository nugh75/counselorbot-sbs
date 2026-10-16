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
