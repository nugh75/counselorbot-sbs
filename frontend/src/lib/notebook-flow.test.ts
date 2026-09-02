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
    // Il pulsante passa dal wrapper che ferma l'autosalvataggio prima di uscire.
    assert.match(source, /onClick=\{handleComplete\}/);
    assert.match(source, /const handleComplete = \(\) => \{[\s\S]*?onComplete\(\);/);
});

test('the notebook suggestion is loaded by session, shown only when ready, and requires an explicit action', () => {
    const source = readFileSync(
        new URL('../components/profile/LearnerProfileCard.tsx', import.meta.url),
        'utf8',
    );
    assert.match(source, /learner-profile\/suggestion\?session_id=/);
    assert.match(source, /suggestion\?\.status === 'ready'/);
    assert.match(source, /onClick=\{useSuggestion\}/);
    assert.match(source, /setForm\(\(current\) => \(\{ \.\.\.current, \.\.\.suggestion\.data \}\)\)/);

    const assistantSource = readFileSync(
        new URL('../app/assistente/page.tsx', import.meta.url),
        'utf8',
    );
    assert.match(assistantSource, /message\.role === 'user'\)\.length >= 4/);
    assert.match(assistantSource, /LearnerProfileCard[\s\S]*suggestionOnly/);
});
