import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { ACTIVE_QUESTIONNAIRE_IDS, TEACHER_AREA_INSTRUMENT_IDS, TOOL_CATEGORIES, isStartableQuestionnaireId, orientationSkippedThisVisit, skipOrientationThisVisit } from './tool-catalog.ts';

test('every active questionnaire appears in exactly one home category, or is the declared teacher-area exception', () => {
    const categorized = TOOL_CATEGORIES.flatMap((group) => group.questionnaireIds);
    const accounted = [...categorized, ...TEACHER_AREA_INSTRUMENT_IDS];
    assert.deepEqual([...accounted].sort(), [...ACTIVE_QUESTIONNAIRE_IDS].sort());
    assert.equal(new Set(categorized).size, categorized.length);
    // L'eccezione è dell'area docenti: lo strumento non può stare anche in
    // una categoria studente.
    for (const id of TEACHER_AREA_INSTRUMENT_IDS) {
        assert.equal(categorized.includes(id), false);
    }
});

test('deep-link validation uses the shared active catalog', () => {
    assert.equal(isStartableQuestionnaireId('QSA'), true);
    assert.equal(isStartableQuestionnaireId('UNKNOWN'), false);
});

function withStorage(impl: Record<string, unknown> | undefined, run: () => void) {
    const kept = (globalThis as { sessionStorage?: unknown }).sessionStorage;
    (globalThis as { sessionStorage?: unknown }).sessionStorage = impl;
    try { run(); } finally { (globalThis as { sessionStorage?: unknown }).sessionStorage = kept; }
}

function memoryStorage() {
    const store: Record<string, string> = {};
    return {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => { store[key] = value; },
    };
}

test('the compass is not skipped until someone skips it, and then stays skipped', () => {
    withStorage(memoryStorage(), () => {
        assert.equal(orientationSkippedThisVisit(), false);
        skipOrientationThisVisit();
        assert.equal(orientationSkippedThisVisit(), true);
    });
});

test('a storage that refuses to answer does not turn the skip into a broken screen', () => {
    withStorage({
        getItem() { throw new Error('storage disabled'); },
        setItem() { throw new Error('storage disabled'); },
    }, () => {
        assert.doesNotThrow(() => skipOrientationThisVisit());
        assert.equal(orientationSkippedThisVisit(), false);
    });
});
