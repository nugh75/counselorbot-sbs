import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { inProgressActions, readWorkspaceActions } from './active-actions.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { activeActionsText } from './i18n-active-actions.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { visualLabel } from './i18n-visual-tools.ts';
import type { Lang } from './i18n';

test('resume includes only titled work in progress, ordered by due date then title', () => {
    const actions = readWorkspaceActions({ workspace: { actions: [
        { id: 'undated', title: 'Undated', stage: 'doing' },
        { id: 'later', title: 'Later', stage: 'doing', start_date: '2026-10-01', end_date: '2026-11-01' },
        { id: 'beta', title: 'Beta', stage: 'doing', start_date: '2026-10-27' },
        { id: 'alpha', title: 'Alpha', stage: 'doing', start_date: '2026-10-27' },
        { id: 'todo', title: 'Not started', stage: 'todo' },
        { id: 'done', title: 'Finished', stage: 'done' },
        { id: 'blank', title: '  ', stage: 'doing' },
    ] } });
    const before = structuredClone(actions);
    const items = inProgressActions(actions);
    assert.deepEqual(items.map(item => item.id), ['alpha', 'beta', 'later', 'undated']);
    assert.equal(items[2].date, '2026-11-01');
    assert.equal(items[3].date, null);
    assert.deepEqual(actions, before);
});

test('resume tolerates missing workspace, malformed rows and invalid dates', () => {
    for (const payload of [null, undefined, {}, { workspace: null }, { workspace: { actions: {} } }]) {
        assert.deepEqual(readWorkspaceActions(payload), []);
    }
    const items = inProgressActions(readWorkspaceActions({ workspace: { actions: [
        null, 1, {}, { id: 'bad', title: 4, stage: 'doing' }, { id: 'stage', title: 'Bad', stage: 'other' },
        { id: 'date', title: 'Invalid date', stage: 'doing', end_date: {}, start_date: '2026-02-30' },
        { id: 'fallback', title: 'Start date', stage: 'doing', end_date: 'invalid', start_date: '2026-10-27' },
    ] } }));
    assert.deepEqual(items, [
        { id: 'fallback', title: 'Start date', date: '2026-10-27' },
        { id: 'date', title: 'Invalid date', date: null },
    ]);
});

test('resume and confirmation labels are available in all six interface languages', () => {
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv'] as Lang[]) {
        for (const key of ['title', 'subtitle', 'open', 'all', 'loading', 'error', 'retry'] as const) {
            assert.ok(activeActionsText(lang, key).trim());
        }
        assert.notEqual(visualLabel(lang, 'confirmDeleteAction'), 'confirmDeleteAction');
    }
    assert.equal(visualLabel('it', 'confirmDeleteAction'), 'Sei sicuro di voler eliminare questa attività?');
});
