import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { clearAdministrationDraft, loadAdministrationDraft, saveAdministrationDraft } from './compilation-draft.ts';

class MemoryStorage {
    private values = new Map<string, string>();
    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, value); }
}

const emptyMetadata = {
    age_range: '',
    gender: '',
    education_context: '',
    participation_context: '',
    recruitment_source: '',
    study: '',
};

function draft(overrides: Record<string, unknown> = {}) {
    return {
        instrument: 'QSA',
        locale: 'it',
        answers: { 1: 5, 2: 3 },
        metadata: emptyMetadata,
        savedAt: '2026-09-02T10:00:00.000Z',
        ...overrides,
    };
}

test('a draft comes back for the instrument and language that wrote it', () => {
    const storage = new MemoryStorage() as Storage;
    saveAdministrationDraft(draft(), storage);
    assert.deepEqual(loadAdministrationDraft('QSA', 'it', storage)?.answers, { 1: 5, 2: 3 });
});

test('a draft never crosses to another instrument or another language', () => {
    const storage = new MemoryStorage() as Storage;
    saveAdministrationDraft(draft(), storage);
    // Gli item sono numerati per strumento: riversarli darebbe risposte a
    // domande mai lette.
    assert.equal(loadAdministrationDraft('QSAr', 'it', storage), null);
    assert.equal(loadAdministrationDraft('QSA', 'en', storage), null);
});

test('an empty draft is not a draft', () => {
    const storage = new MemoryStorage() as Storage;
    saveAdministrationDraft(draft({ answers: {} }), storage);
    assert.equal(loadAdministrationDraft('QSA', 'it', storage), null);
});

test('clearing removes it', () => {
    const storage = new MemoryStorage() as Storage;
    saveAdministrationDraft(draft(), storage);
    clearAdministrationDraft(storage);
    assert.equal(loadAdministrationDraft('QSA', 'it', storage), null);
});

test('damaged storage content is treated as no draft, not as a crash', () => {
    const storage = new MemoryStorage() as Storage;
    storage.setItem('counselorbot_administration_draft_v1', '{not json');
    assert.equal(loadAdministrationDraft('QSA', 'it', storage), null);
});

test('consent is never carried in the draft', () => {
    // Il consenso è un gesto, non un dato: ritrovarlo spuntato farebbe passare
    // per acconsentito quel che in questa sessione nessuno ha spuntato.
    const storage = new MemoryStorage() as Storage;
    saveAdministrationDraft(draft(), storage);
    assert.equal(storage.getItem('counselorbot_administration_draft_v1')?.includes('consent'), false);

    const source = readFileSync(
        new URL('../components/administration/QuestionnaireRunner.tsx', import.meta.url),
        'utf8',
    );
    assert.match(source, /saveAdministrationDraft/);
    assert.match(source, /loadAdministrationDraft/);
    assert.match(source, /clearAdministrationDraft/);
    // Il ripristino tocca risposte e metadati, mai il consenso.
    assert.doesNotMatch(source, /consent: (?:draft|restored)/);
});

test('the runner holds its submit while the scoring call is in flight', () => {
    const source = readFileSync(
        new URL('../components/administration/QuestionnaireRunner.tsx', import.meta.url),
        'utf8',
    );
    assert.match(source, /setSubmitting\(true\)/);
    assert.match(source, /disabled=\{submitting\}/);
});

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { clearScoreDraft, loadScoreDraft, saveScoreDraft } from './compilation-draft.ts';

test('manually entered scores come back for the instrument that wrote them', () => {
    const storage = new MemoryStorage() as Storage;
    saveScoreDraft({ instrument: 'QSA', scores: { C1: 5, A3: 7 }, savedAt: '2026-09-02T10:00:00.000Z' }, storage);
    assert.deepEqual(loadScoreDraft('QSA', storage)?.scores, { C1: 5, A3: 7 });
    assert.equal(loadScoreDraft('ZTPI', storage), null);
    clearScoreDraft(storage);
    assert.equal(loadScoreDraft('QSA', storage), null);
});

test('the score form keeps a draft and drops it once the scores are submitted', () => {
    const source = readFileSync(
        new URL('../components/qsa/ScoreInputForm.tsx', import.meta.url),
        'utf8',
    );
    assert.match(source, /loadScoreDraft\(questionnaire\.id\)/);
    assert.match(source, /onChange=\{rememberDraft\}/);
    assert.match(source, /clearScoreDraft\(\);\n\s*onSubmit\(scores\);/);
});
