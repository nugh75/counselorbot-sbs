import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node runs TypeScript files directly.
import { USAGE_DEFECTS, USAGE_SURFACES, sortedDefects, stepLabel, withDefects } from './prompt-usage.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { PROMPT_USAGE_DICTS } from './i18n-prompt-usage.ts';

test('defects are listed from the most frequent, ties in registry order', () => {
    assert.deepEqual(sortedDefects({ wrong_language: 1, visible_json: 1, too_many_questions: 4, missing_step_marker: 0 }),
        [['too_many_questions', 4], ['visible_json', 1], ['wrong_language', 1]]);
});

test('rows without defects in either window are hidden; labels drop empty parts', () => {
    const base = { defects: {}, trend: null };
    const rows = [
        { ...base, id: 'a', defects_total: 0, previous_total: 0 },
        { ...base, id: 'b', defects_total: 0, previous_total: 2 },
        { ...base, id: 'c', defects_total: 1, previous_total: 0 },
    ];
    assert.deepEqual(withDefects(rows).map((row: { id: string }) => row.id), ['b', 'c']);
    assert.equal(stepLabel({ instrument: 'QSA', step: 'sl-social' }), 'QSA · sl-social');
    assert.equal(stepLabel({ instrument: null, step: 'competenze' }), 'competenze');
});

test('every defect, surface and trend has a label in the six languages', () => {
    const keys = [
        ...USAGE_DEFECTS.map((code: string) => `admin.promptUsage.defect.${code}`),
        ...USAGE_SURFACES.map((surface: string) => `admin.promptUsage.surface.${surface}`),
        ...['up', 'down', 'flat', 'new'].map(trend => `admin.promptUsage.trend.${trend}`),
    ];
    const italian = Object.keys(PROMPT_USAGE_DICTS.it).sort();
    for (const [lang, dict] of Object.entries(PROMPT_USAGE_DICTS) as [string, Record<string, string>][]) {
        assert.deepEqual(Object.keys(dict).sort(), italian, `${lang}: same keys as Italian`);
        for (const key of keys) assert.ok(dict[key], `${lang}: ${key}`);
    }
});
