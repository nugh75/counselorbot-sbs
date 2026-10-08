import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { parseClassSettings } from './class-settings.ts';
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
