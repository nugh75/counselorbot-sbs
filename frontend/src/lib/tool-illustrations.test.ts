import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { toolIllustration } from './tool-illustrations.ts';

const IDS = ['QSA', 'QSAr', 'QPCS', 'QPCC', 'ZTPI', 'QAP', 'SAVICKAS', 'EVENTO_STUDIO', 'EVENTO_PROFESSIONALE', 'OBIETTIVO_STUDIO', 'OBIETTIVO_DOCENZA', 'IDEA'];

test('every approved tool has an inline illustration', () => {
    for (const id of IDS) assert.equal(toolIllustration(id).kind, 'svg', id);
});

test('dynamic or unknown tools fall back to the category image', () => {
    assert.deepEqual(toolIllustration('custom-42', 'assessment'), { kind: 'image', src: '/images/intro/profiles.png' });
    assert.deepEqual(toolIllustration('toString'), { kind: 'image', src: '/images/intro/paths.png' });
});
