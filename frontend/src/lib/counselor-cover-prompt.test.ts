import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNSELOR_METAPHOR_PRESETS, composeCounselorCoverAIPrompt } from './counselor-cover-prompt.ts';

test('COUNSELOR_METAPHOR_PRESETS defines rich thematic visual metaphors for counselors', () => {
    assert.ok(COUNSELOR_METAPHOR_PRESETS.length >= 10);

    for (const preset of COUNSELOR_METAPHOR_PRESETS) {
        assert.ok(preset.id, 'preset must have an id');
        assert.ok(preset.label.length > 3, 'preset must have a descriptive label');
        assert.ok(preset.themePrompt.length > 10, 'preset must have a theme prompt');
    }

    const ids = COUNSELOR_METAPHOR_PRESETS.map((p) => p.id);
    assert.ok(ids.includes('explorer'));
    assert.ok(ids.includes('lighthouse'));
    assert.ok(ids.includes('workshop'));
    assert.ok(ids.includes('mountain-guide'));
});

test('composeCounselorCoverAIPrompt produces compliant 16:9 prompt in counselor style', () => {
    const prompt = composeCounselorCoverAIPrompt({
        name: 'Marco',
        approach: 'metodo socratico e orientamento universitario',
        metaphor: 'bussola antica e carte nautiche',
    });

    assert.ok(prompt.includes('16:9'), 'Must specify 16:9 aspect ratio');
    assert.ok(prompt.includes('Marco'), 'Must contain counselor name');
    assert.ok(prompt.includes('metodo socratico'), 'Must contain approach');
    assert.ok(prompt.includes('bussola antica'), 'Must contain visual metaphor');
    assert.ok(prompt.includes('verde petrolio (#042f2e / #0f766e)'), 'Must include brand petrol gradient');
    assert.ok(prompt.includes('indaco/blu notte (#1e1b4b / #312e81)'), 'Must include indigo palette');
    assert.ok(prompt.includes('senza assolutamente alcun testo, scritte o lettere'), 'Must strictly forbid text');
    assert.ok(prompt.includes('senza figure umane realistiche né ritratti fotografici'), 'Must forbid photorealistic humans');
});

test('composeCounselorCoverAIPrompt handles defaults gracefully when options are empty', () => {
    const prompt = composeCounselorCoverAIPrompt();

    assert.ok(prompt.includes('16:9'));
    assert.ok(prompt.includes('Counselor'));
    assert.ok(prompt.includes('orientamento maieutico e riflessivo'));
    assert.ok(prompt.includes('bussola e rotta verso il futuro'));
});
