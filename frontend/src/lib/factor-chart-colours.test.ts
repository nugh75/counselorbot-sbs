import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QUESTIONNAIRES, tailwindColorFromTheme } from './questionnaires.ts';
import { getZTPIAlignmentColorClass } from './ztpi-model.ts';

// Profile factor charts (#933): petrol/slate scale plus ochre, no rainbow.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const TOKEN = /^bg-(chart-[1-5]|chart-accent)$/;

test('every questionnaire colour is a chart token', () => {
    for (const q of Object.values(QUESTIONNAIRES)) assert.match(q.color, TOKEN, q.id);
    for (const theme of ['blue', 'sky', 'teal', 'cyan', 'indigo', 'purple', 'amber', 'emerald', 'green', 'rose', 'unknown', undefined]) {
        assert.match(tailwindColorFromTheme(theme), TOKEN, String(theme));
    }
});

test('ZTPI alignment uses state tokens', () => {
    const classes = new Set(['T1', 'T2', 'T3', 'T4', 'T5'].flatMap(code => [1, 3, 5].map(s => getZTPIAlignmentColorClass(code as never, s))));
    for (const c of classes) assert.match(c, /^bg-(success|warning|danger)$/);
});

test('the two lib files carry no -500 palette class', () => {
    for (const file of ['./questionnaires.ts', './ztpi-model.ts']) assert.doesNotMatch(read(file), /bg-[a-z]+-[0-9]{3}/, file);
});

test('chart tokens exist in light and dark and are exposed to Tailwind', () => {
    const css = read('../app/globals.css');
    for (const name of ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-accent']) {
        assert.match(css, new RegExp(`--color-${name}: var\\(--${name}\\)`), name);
        assert.equal(css.split(`  --${name}:`).length - 1, 2, `${name} light + dark`);
    }
});

test('profile panels: group labels are plain, no uppercase, no shadow', () => {
    for (const file of ['../components/qsa/ProfileScoresPanel.tsx', '../components/qsa/ProfileVisualization.tsx']) {
        const src = read(file);
        assert.doesNotMatch(src, /uppercase|tracking-wide|shadow-md|font-bold|text-(green|amber)-[0-9]/, file);
    }
});
