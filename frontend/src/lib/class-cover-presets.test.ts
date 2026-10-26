import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_COVER_PRESETS, getClassCoverUrl, composeClassCoverAIPrompt } from './class-cover-presets.ts';

test('CLASS_COVER_PRESETS defines all 10 counselor-style class covers', () => {
    assert.equal(CLASS_COVER_PRESETS.length, 10);

    const expectedIds = [
        'science',
        'space',
        'humanities',
        'arts',
        'tech',
        'nature',
        'math',
        'music',
        'sports',
        'geography',
    ];

    const actualIds = CLASS_COVER_PRESETS.map((p) => p.id);
    assert.deepEqual(actualIds, expectedIds);

    for (const preset of CLASS_COVER_PRESETS) {
        assert.ok(preset.id, 'preset must have an id');
        assert.ok(preset.labelKey.startsWith('cover'), 'preset labelKey must start with cover');
        assert.ok(preset.url.startsWith('/images/classes/class-'), 'preset url must match /images/classes/class-*');
        assert.ok(preset.url.endsWith('.svg'), 'preset url must end with .svg');
        assert.ok(preset.themePrompt.length > 10, 'themePrompt must have descriptive context');
    }
});

test('getClassCoverUrl prioritizes custom image_url when available', () => {
    const custom = {
        id: 12,
        name: '3B Informatica',
        image_url: '/api/groups/12/image?v=123456',
    };
    assert.equal(getClassCoverUrl(custom), '/api/groups/12/image?v=123456');

    const customStatic = {
        id: 15,
        name: '1A Artistico',
        image_url: '/images/classes/class-arts.svg',
    };
    assert.equal(getClassCoverUrl(customStatic), '/images/classes/class-arts.svg');
});

test('getClassCoverUrl deterministically selects a fallback preset based on group identity', () => {
    const groupA = { id: 1, name: '1A Classico', image_url: null };
    const coverA1 = getClassCoverUrl(groupA);
    const coverA2 = getClassCoverUrl(groupA);

    assert.equal(coverA1, coverA2, 'Same group must consistently return the same default cover');
    assert.ok(coverA1.startsWith('/images/classes/class-'));

    const groupB = { id: 7, name: '5T Elettronica', image_url: null };
    const coverB = getClassCoverUrl(groupB);
    assert.ok(coverB.startsWith('/images/classes/class-'));
});

test('composeClassCoverAIPrompt produces compliant 16:9 prompt in counselor style without text', () => {
    const prompt = composeClassCoverAIPrompt('4B Liceo Scientifico', 'biologia e chimica');

    assert.ok(prompt.includes('16:9'), 'Must specify 16:9 aspect ratio');
    assert.ok(prompt.includes('4B Liceo Scientifico'), 'Must contain the class name');
    assert.ok(prompt.includes('verde petrolio'), 'Must mention brand petrol palette');
    assert.ok(prompt.includes('senza assolutamente alcun testo, scritte o lettere'), 'Must strictly forbid text');
    assert.ok(prompt.includes('senza figure umane realistiche'), 'Must prevent photorealistic humans');
});
