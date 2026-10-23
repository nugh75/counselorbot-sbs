import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const languages = ['it', 'en', 'es', 'fr', 'de', 'sv'] as const;

// The presentation strings live either in a double-quoted literal or in a
// six-element array of single-quoted literals, one per language.
function values(file: URL, key: string): string[] {
    const lines = readFileSync(file, 'utf8').split('\n')
        .filter((row) => row.trimStart().startsWith(`'${key}':`) || row.trimStart().startsWith(`${key}:`));
    const result: string[] = [];
    for (const line of lines) {
        const body = line.slice(line.indexOf(':') + 1);
        const single = [...body.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((match) => match[1]);
        result.push(...(single.length ? single : [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1])));
    }
    return result;
}

// Every place that presents the Compass must say what it does (suggests a
// starting tool) and what it does not do (no questionnaires, no scores).
const presentations: Array<[string, URL, string, string[], string[]]> = [
    ['page intro', new URL('./i18n-orientation.ts', import.meta.url), 'orientation.subtitle',
        ['consiglia', 'suggests', 'sugiere', 'suggère', 'empfiehlt', 'föreslår'],
        ['questionari', 'questionnaires', 'cuestionarios', 'questionnaires', 'Fragebögen', 'enkäter']],
    ['home entry', new URL('./i18n.ts', import.meta.url), 'app.intro.entry.compass.body',
        ['consiglia', 'suggests', 'sugiere', 'suggère', 'empfiehlt', 'föreslår'],
        ['questionari', 'questionnaires', 'cuestionarios', 'questionnaire', 'Fragebögen', 'enkäter']],
    ['catalog card', new URL('./i18n.ts', import.meta.url), 'app.intro.action.compass.desc',
        ['conversazione', 'conversation', 'conversación', 'conversation', 'Gespräch', 'samtal'],
        ['questionari', 'questionnaires', 'cuestionarios', 'questionnaires', 'Fragebögen', 'enkäter']],
    ['guide', new URL('./i18n.ts', import.meta.url), 'guide.section2.body',
        ['Bussola', 'Compass', 'Brújula', 'Boussole', 'Kompass', 'Kompassen'],
        ['questionari', 'questionnaires', 'cuestionarios', 'questionnaires', 'Fragebögen', 'enkäter']],
    ['teacher area', new URL('./i18n-class-settings.ts', import.meta.url), 'supportGuide',
        ['Bussola', 'Compass', 'Brújula', 'Boussole', 'Kompass', 'Kompassen'],
        ['questionari', 'questionnaires', 'cuestionarios', 'questionnaires', 'Fragebögen', 'enkäter']],
];

test('every Compass presentation says what it suggests and what it does not do, in six languages', () => {
    for (const [label, file, key, suggestions, limits] of presentations) {
        const texts = values(file, key);
        assert.equal(texts.length, languages.length, `${label} must exist in six languages`);
        texts.forEach((text, index) => {
            assert.ok(text.includes(suggestions[index]), `${label}/${languages[index]} must say what the Compass suggests: ${text}`);
            assert.ok(text.includes(limits[index]), `${label}/${languages[index]} must say it does not administer questionnaires: ${text}`);
        });
    }
});
