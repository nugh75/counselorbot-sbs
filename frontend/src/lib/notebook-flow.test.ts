import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Node's built-in TypeScript runner requires the explicit extension; the app's
// bundler configuration intentionally does not enable TS extension imports.
// @ts-expect-error -- executed directly by `node --test`.
import { shouldReviewNotebookBeforeInstrument } from './notebook-flow.ts';

test('the notebook is proposed before the first instrument only', () => {
    assert.equal(shouldReviewNotebookBeforeInstrument(false, false), true);
    assert.equal(shouldReviewNotebookBeforeInstrument(false, true), false);
    assert.equal(shouldReviewNotebookBeforeInstrument(true, false), false);
});

test('the guided instrument proposes a notebook update at its conclusion', () => {
    const source = readFileSync(
        new URL('../components/qsa/GuidedChatInterface.tsx', import.meta.url),
        'utf8',
    );
    assert.match(source, /currentPhase === FIXED_CONCLUSION_ID[\s\S]*LearnerProfileCard variant="update"/);
});

test('pQBL proposes a notebook update with its final results', () => {
    const source = readFileSync(
        new URL('../app/pqbl/page.tsx', import.meta.url),
        'utf8',
    );
    assert.match(source, /phase === 'finalResults'[\s\S]*LearnerProfileCard[\s\S]*variant="update"/);
});

test('OpenCode has an explicit conclusion that proposes a notebook update', () => {
    const source = readFileSync(
        new URL('../components/qsa/OpenCodeExperience.tsx', import.meta.url),
        'utf8',
    );
    assert.match(source, /opencode\.conclude/);
    assert.match(source, /LearnerProfileCard variant="update"/);
    assert.match(source, /onClick=\{onComplete\}/);
});
