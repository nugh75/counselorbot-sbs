import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { effectiveDefaultCounselor, filterClassCounselors, parseClassSettings } from './class-settings.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { classSettingsText, classSettingsTexts } from './i18n-class-settings.ts';

test('settings reads reject malformed responses instead of presenting enabled controls', () => {
    for (const payload of [null, [], {}, { group_id: 88, revision: 0, tools: [], disabled_tool_keys: [] },
        { group_id: 88, revision: 1, tools: [{}], disabled_tool_keys: [] }]) {
        assert.throws(() => parseClassSettings(payload), /Invalid class settings/);
    }
    assert.equal(parseClassSettings({ group_id: 88, revision: 1, tools: [], disabled_tool_keys: [] }).revision, 1);
});

test('class settings labels cover six languages and fallback to English', () => {
    for (const [key, translations] of Object.entries(classSettingsTexts)) {
        assert.equal(translations.length, 6, key);
        assert.ok(translations.every(text => text.trim().length > 0), key);
    }
    assert.equal(classSettingsText('en', 'open'), 'Open class');
    assert.equal(classSettingsText('sv', 'save'), 'Spara');
    assert.equal(classSettingsText('fr', 'overview'), 'Vue d’ensemble');
    assert.equal(classSettingsText('unknown', 'save'), 'Save');
});

test('counselor fields are validated and default to an unfiltered class', () => {
    const base = { group_id: 88, revision: 1, tools: [], disabled_tool_keys: [] };
    const parsed = parseClassSettings(base);
    assert.deepEqual([parsed.counselors, parsed.disabled_counselor_ids, parsed.default_counselor_id], [[], [], null]);
    for (const bad of [{ counselors: [{ id: 'x' }] }, { disabled_counselor_ids: ['1'] }, { default_counselor_id: 'x' }]) {
        assert.throws(() => parseClassSettings({ ...base, ...bad }), /Invalid class settings/);
    }
    const row = parseClassSettings({ ...base, counselors: [{ id: 1, name: 'Clio', admin_enabled: true, enabled: true }] });
    assert.deepEqual(row.counselors[0].approach_categories, []);
});

test('an unusable stored default is not offered; filters combine category and name', () => {
    const counselors = [
        { id: 1, name: 'Clio', approach_categories: ['maieutic'], admin_enabled: true, enabled: true },
        { id: 2, name: 'Giulio', approach_categories: ['philosopher'], admin_enabled: true, enabled: false },
        { id: 3, name: 'Iride', approach_categories: ['maieutic'], admin_enabled: false, enabled: false },
    ];
    const settings = { group_id: 1, revision: 1, tools: [], disabled_tool_keys: [], disabled_counselor_ids: [2], counselors, default_counselor_id: 1 };
    assert.equal(effectiveDefaultCounselor(settings), 1);
    assert.equal(effectiveDefaultCounselor({ ...settings, default_counselor_id: 2 }), null);
    assert.equal(effectiveDefaultCounselor({ ...settings, default_counselor_id: 3 }), null);
    assert.deepEqual(filterClassCounselors(counselors, 'maieutic', '').map(row => row.id), [1, 3]);
    assert.deepEqual(filterClassCounselors(counselors, 'maieutic', ' IRI ').map(row => row.id), [3]);
    assert.deepEqual(filterClassCounselors(counselors, '', 'g').map(row => row.id), [2]);
});

test('lock metadata survives parsing and malformed locks cannot enable controls', () => {
    const tool = { key: 'QSA', kind: 'instrument', category: 'assessment', label_i18n: {}, admin_enabled: true, enabled: false, always_on: false,
        locked: true, locked_enabled: false, locked_by: 'admin', locked_at: '2026-10-09T09:00:00Z' };
    const base = { group_id: 1, revision: 2, tools: [tool], disabled_tool_keys: ['QSA'] };
    assert.equal(parseClassSettings(base).tools[0].locked, true);
    for (const metadata of [{ locked: 'true' }, { locked_enabled: 'false' }, { locked_by: 42 }]) {
        assert.throws(() => parseClassSettings({ ...base, tools: [{ ...tool, ...metadata }] }), /Invalid class settings/);
    }
});
