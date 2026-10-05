import assert from 'node:assert/strict';
import test from 'node:test';

import type { PromptMap, PromptMapEntry } from './prompt-map';
// @ts-expect-error -- Node runs TypeScript files directly.
import { badgeFor, booleanFlags, componentsValue, entryText, findEntry, levelCounts, moveItem, needsSharedConfirm, saveRequest, sortOrderChanges, stepsByInstrument } from './prompt-map.ts';

function entry(overrides: Partial<PromptMapEntry>): PromptMapEntry {
    return {
        key: 'prompt_meta_QSA', kind: 'config', role: 'meta', level: 'instrument', destination: 'model', when: 'every_turn',
        value: 'testo', stored: true, shared: false, used_by: { instruments: ['QSA'], steps: [] },
        editor: { method: 'POST', path: '/admin/config' }, read_only: false, description: 'Meta QSA',
        ...overrides,
    };
}

test('badge follows destination first, then timing', () => {
    assert.equal(badgeFor({ destination: 'model', when: 'entry' }), 'model-entry');
    assert.equal(badgeFor({ destination: 'model', when: 'every_turn' }), 'model-turn');
    assert.equal(badgeFor({ destination: 'model', when: 'follow_up' }), 'model-follow-up');
    assert.equal(badgeFor({ destination: 'student', when: 'student' }), 'student');
    assert.equal(badgeFor({ destination: 'admin', when: 'admin' }), 'admin');
    assert.equal(badgeFor({ destination: 'context_filter', when: 'every_turn' }), 'context');
});

test('group entries and entries used by several steps ask for confirmation', () => {
    assert.equal(needsSharedConfirm(entry({})), false);
    assert.equal(needsSharedConfirm(entry({ level: 'group', used_by: { instruments: ['EVENTO_STUDIO', 'EVENTO_PROFESSIONALE'], steps: [] } })), true);
    const twoSteps = [{ instrument: 'QSA', step_id: 'cognitive', label: 'C' }, { instrument: 'QSA', step_id: 'affective', label: 'A' }];
    assert.equal(needsSharedConfirm(entry({ key: 'prompt_factor', used_by: { instruments: ['QSA'], steps: twoSteps } })), true);
});

test('config entries save through the existing config API, keeping the description', () => {
    assert.deepEqual(saveRequest(entry({}), 'nuovo'), {
        url: '/api/admin/config', method: 'POST', body: { key: 'prompt_meta_QSA', value: 'nuovo', description: 'Meta QSA' },
    });
    const text = entry({ key: 'text_qsar_conclusion', destination: 'student', when: 'student', translations: { en: 'Done' } });
    assert.equal(saveRequest(text, 'Klart', 'sv').body.key, 'text_qsar_conclusion__sv');
    assert.equal(saveRequest(text, 'Fatto', 'it').body.key, 'text_qsar_conclusion');
});

test('step fields save through the guided step API', () => {
    const prompt = entry({ key: 'guided_step:intro:prompt', kind: 'guided_step', field: 'prompt', editor: { method: 'PUT', path: '/admin/guided-steps/intro', field: 'prompt' } });
    assert.deepEqual(saveRequest(prompt, 'Apri'), { url: '/api/admin/guided-steps/intro', method: 'PUT', body: { prompt: 'Apri' } });
    const label = entry({ key: 'guided_step:intro:label', kind: 'guided_step', field: 'label', value: 'Presentazione', translations: { en: 'Intro' }, editor: { method: 'PUT', path: '/admin/guided-steps/intro', field: 'label' } });
    assert.deepEqual(saveRequest(label, 'Inicio', 'es').body, { label_i18n: { en: 'Intro', es: 'Inicio' } });
    assert.deepEqual(saveRequest(label, 'Avvio', 'it').body, { label: 'Avvio' });
    assert.equal(entryText(label, 'en'), 'Intro');
    assert.equal(entryText(label, 'it'), 'Presentazione');
    assert.throws(() => saveRequest(entry({ kind: 'counselor_persona', read_only: true }), 'x'));
});

test('component flags keep saved strategies and limits', () => {
    const stored = JSON.stringify({ knowledge: false, allowed_strategies: ['s1'], certified_strategies_limit: 1 });
    assert.deepEqual(JSON.parse(componentsValue(stored, { knowledge: true, history: false })), {
        knowledge: true, history: false, allowed_strategies: ['s1'], certified_strategies_limit: 1,
    });
    assert.deepEqual(JSON.parse(componentsValue('', { knowledge: true })), { knowledge: true });
    assert.deepEqual(booleanFlags({ knowledge: true, allowed_strategies: null, limit: 2 }), { knowledge: true });
});

test('inherited refs resolve to the entry on its level', () => {
    const map: PromptMap = {
        instrument: 'QSA', instruments: [{ id: 'QSA', step_count: 1 }],
        levels: {
            common: [entry({ key: 'directive_context', level: 'common' })],
            groups: [{ instruments: ['QSA', 'IDEA'], entries: [entry({ key: 'text_guided_conclusion', level: 'group' })] }],
            instrument: [entry({ key: 'prompt_factor' })],
            steps: [],
        },
    };
    assert.equal(findEntry(map, 'prompt_factor')?.level, 'instrument');
    assert.equal(findEntry(map, 'text_guided_conclusion')?.level, 'group');
    assert.deepEqual(levelCounts(map), { common: 1, group: 1, instrument: 1, step: 0 });
});

test('shared entries list their steps under each instrument, in the instruments order', () => {
    const shared = entry({
        key: 'prompt_evento_interview', level: 'group',
        used_by: {
            instruments: ['EVENTO_STUDIO', 'EVENTO_PROFESSIONALE'],
            steps: [
                { instrument: 'EVENTO_PROFESSIONALE', step_id: 'fatto', label: 'Il fatto' },
                { instrument: 'EVENTO_STUDIO', step_id: 'evento', label: "L'evento" },
                { instrument: 'EVENTO_STUDIO', step_id: 'fatto', label: 'Il fatto' },
            ],
        },
    });
    assert.deepEqual(stepsByInstrument(shared).map(({ instrument, steps }) => [instrument, steps.map(step => step.step_id)]), [
        ['EVENTO_STUDIO', ['evento', 'fatto']],
        ['EVENTO_PROFESSIONALE', ['fatto']],
    ]);
});

test('moving an item keeps the others in order and ignores moves out of range', () => {
    assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
    assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
    assert.deepEqual(moveItem(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
    assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 3), ['a', 'b', 'c']);
});

test('a new order reuses the existing sort_order slots and only sends who moved', () => {
    const steps = [{ id: 'intro', sort_order: 10 }, { id: 'cognitive', sort_order: 11 }, { id: 'affective', sort_order: 14 }];
    assert.deepEqual(sortOrderChanges(moveItem(steps, 2, 1)), [{ id: 'affective', sort_order: 11 }, { id: 'cognitive', sort_order: 14 }]);
    assert.deepEqual(sortOrderChanges(steps), []);
    // Valori ripetuti (domande tutte a 0): si rinumera 0..n-1.
    const questions = [{ id: 1, sort_order: 0 }, { id: 2, sort_order: 0 }, { id: 3, sort_order: 0 }];
    assert.deepEqual(sortOrderChanges(moveItem(questions, 2, 0)), [{ id: 1, sort_order: 1 }, { id: 2, sort_order: 2 }]);
});
