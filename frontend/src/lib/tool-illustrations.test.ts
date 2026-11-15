import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { toolIllustration } from './tool-illustrations.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { personalAreaIllustrations } from './personal-area.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { teacherAreaIllustrations } from './teacher-area.ts';

const IDS = ['QSA', 'QSAr', 'QPCS', 'QPCC', 'ZTPI', 'QAP', 'SAVICKAS', 'EVENTO_STUDIO', 'EVENTO_PROFESSIONALE', 'OBIETTIVO_STUDIO', 'OBIETTIVO_DOCENZA', 'IDEA'];

const FALLBACKS = new Set([toolIllustration('custom-42', 'assessment'), toolIllustration('custom-42')]);

test('every approved tool has its own inline illustration', () => {
    for (const id of IDS) assert.ok(!FALLBACKS.has(toolIllustration(id)), id);
});

test('every personal and teacher area entry has its own SVG on the --i-* palette', () => {
    const ids = [...Object.values(personalAreaIllustrations), ...Object.values(teacherAreaIllustrations)] as string[];
    for (const id of ids) {
        const body = toolIllustration(id);
        assert.ok(!FALLBACKS.has(body), id);
        assert.match(body, /var\(--i-/, id);
        assert.doesNotMatch(body, /<text|<image|Gradient|#[0-9a-f]{3,6}/i, id);
    }
});

test('dynamic or unknown tools fall back to a category SVG, never an image', () => {
    assert.equal(FALLBACKS.size, 2);
    assert.equal(toolIllustration('toString'), toolIllustration('custom-42'));
    for (const body of FALLBACKS) assert.match(body, /^<(rect|path)/);
});
