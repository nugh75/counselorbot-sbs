import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { ACTIVE_QUESTIONNAIRE_IDS, TOOL_CATEGORIES, isStartableQuestionnaireId, orientationSkippedThisVisit, skipOrientationThisVisit } from './tool-catalog.ts';

test('every active questionnaire appears in exactly one home category', () => {
    const categorized = TOOL_CATEGORIES.flatMap((group) => group.questionnaireIds);
    assert.deepEqual([...categorized].sort(), [...ACTIVE_QUESTIONNAIRE_IDS].sort());
    assert.equal(new Set(categorized).size, categorized.length);
});

test('pQBL is part of the shared standalone catalog', () => {
    assert.equal(TOOL_CATEGORIES.some((group) => group.standaloneIds.includes('pqbl')), true);
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
