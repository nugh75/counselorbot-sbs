import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { stepLine } from './idea-step.ts';
import type { IdeaNextStep } from './idea-map';

const panel = () => readFileSync(new URL('../components/qsa/IdeaPanel.tsx', import.meta.url), 'utf8');
const chat = () => readFileSync(new URL('../components/qsa/GuidedChatInterface.tsx', import.meta.url), 'utf8');

const move = (over: Partial<IdeaNextStep>): IdeaNextStep => ({
    step_id: 'idea-intro', focus: 'idea', reason: 'missing-role', detail: '', reason_text: '',
    task_label: null, pivot: '', statuses: {}, flaws: {}, turns_used: 0, budget: 0,
    pace_stops: [], ...over,
} as IdeaNextStep);

test('the panel says which leg of the reasoning is missing, not just that one is', () => {
    assert.deepEqual(stepLine(move({ reason: 'missing-role', role: 'evidence' })),
        { key: 'idea.step.missingRole', role: 'evidence' });
});

test('a flaw is named in the words the person reads elsewhere', () => {
    assert.deepEqual(stepLine(move({ reason: 'flaw', reason_text: 'affermazione non sostenuta' })),
        { key: 'idea.step.flaw', text: 'affermazione non sostenuta' });
});

test('a branch that has what it needs is asked the pivot question', () => {
    assert.deepEqual(stepLine(move({ reason: 'ready-to-close', pivot: 'compared to what?' })),
        { key: 'idea.step.readyToClose', text: 'compared to what?' });
});

test('without a map the line says so instead of staying silent', () => {
    assert.deepEqual(stepLine(move({ reason: 'no-map' })), { key: 'idea.step.noMap' });
    assert.equal(stepLine(null), null);
});

test('a turn that left the map untouched says so and offers to ask for it', () => {
    // Stanotte la mappa e' rimasta ferma per diciassette turni senza che
    // niente lo dicesse, e sembrava rotta.
    assert.match(chat(), /setIdeaDrew\(result\.idea_revision_id != null\)/);
    assert.match(panel(), /idea\.map\.stale/);
    assert.match(panel(), /onAskForMap/);
});
