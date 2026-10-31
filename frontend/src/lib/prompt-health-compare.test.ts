import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node runs TypeScript files directly.
import { cellStatus, codeIssueUrl, compareTargets, findingRanges, highlightSegments, lineDiff, otherSentence } from './prompt-health.ts';

const conflict = {
    id: 'a1', code: 'rule_conflict', severity: 'medium' as const, prompts: ['code:turn_contract', 'guided_step:sl-elaboration'],
    surfaces: ['QSA · sl-elaboration · entry'], params: { field: 'questions' }, editable: ['guided_step:sl-elaboration'],
    factory: ['code:turn_contract'], ack: null,
    sentences: [
        { prompt: 'code:turn_contract', text: 'exactly ONE question', start: null, end: null },
        { prompt: 'guided_step:sl-elaboration', text: 'exactly THREE open questions', start: 31, end: 59 },
    ],
};

test('conflicting passages are located in the current text, also after edits moved them', () => {
    const text = 'Read C1 with the student.\nAsk exactly THREE open questions.';
    const ranges = findingRanges([conflict], 'guided_step:sl-elaboration', text);
    assert.equal(ranges.length, 1);
    assert.equal(text.slice(ranges[0].start, ranges[0].end), 'exactly THREE open questions');
    assert.equal(ranges[0].number, 1);
    // The sentence was deleted while editing: no stale highlight.
    assert.deepEqual(findingRanges([conflict], 'guided_step:sl-elaboration', 'Read C1.'), []);
    // The other prompt of a conflict is named in the explanation.
    assert.equal(otherSentence(conflict, 'guided_step:sl-elaboration')?.prompt, 'code:turn_contract');
});

test('highlight segments split the text without losing characters and keep overlaps', () => {
    const text = 'abcdefghij';
    const segments = highlightSegments(text, [
        { start: 2, end: 5, number: 1, findingId: 'x', severity: 'high' },
        { start: 4, end: 7, number: 2, findingId: 'y', severity: 'low' },
    ]);
    assert.equal(segments.map((s: { text: string }) => s.text).join(''), text);
    assert.deepEqual(segments.map((s: { text: string; numbers: number[] }) => [s.text, s.numbers]), [
        ['ab', []], ['cd', [1]], ['e', [1, 2]], ['fg', [2]], ['hij', []],
    ]);
});

test('map cells: error for high, warning for others, unused without prompt, acknowledged ignored', () => {
    const step = { id: 'sl-elaboration', prompts: ['guided_step:sl-elaboration', 'config:prompt_factor'], surfaces: ['QSA · sl-elaboration · entry'] };
    assert.equal(cellStatus(step, []), 'ok');
    assert.equal(cellStatus(step, [conflict]), 'warning');
    assert.equal(cellStatus(step, [{ ...conflict, severity: 'high' as const }]), 'error');
    assert.equal(cellStatus(step, [{ ...conflict, ack: { note: 'ok' } }]), 'ok');
    assert.equal(cellStatus(step, [{ ...conflict, code: 'step_without_prompt', severity: 'medium' as const, prompts: ['guided_step:sl-elaboration'], surfaces: [] }]), 'unused');
});

test('compare opens the editable prompts of a finding, at most three', () => {
    assert.deepEqual(compareTargets(conflict), ['guided_step:sl-elaboration']);
    assert.deepEqual(compareTargets({ ...conflict, editable: ['config:a', 'config:b', 'config:c', 'config:d'] }), ['config:a', 'config:b', 'config:c']);
});

test('line diff against the factory text', () => {
    assert.deepEqual(lineDiff('a\nb\nc', 'a\nB\nc'), [
        { type: 'same', text: 'a' }, { type: 'del', text: 'b' }, { type: 'add', text: 'B' }, { type: 'same', text: 'c' },
    ]);
});

test('a factory-text finding opens a prefilled GitHub issue', () => {
    const url = new URL(codeIssueUrl(conflict, 'Regole in conflitto'));
    assert.equal(url.origin + url.pathname, 'https://github.com/nugh75/counselorbot-sbs/issues/new');
    assert.match(url.searchParams.get('title') || '', /Regole in conflitto/);
    const body = url.searchParams.get('body') || '';
    assert.match(body, /code:turn_contract/);
    assert.match(body, /exactly THREE open questions/);
    assert.match(body, /QSA · sl-elaboration · entry/);
    assert.match(body, /a1/);
});
