import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('the notebook suggestion is loaded by session, shown only when ready, and requires an explicit action', () => {
    const source = readFileSync(
        new URL('../components/profile/LearnerProfileCard.tsx', import.meta.url),
        'utf8',
    );
    assert.match(source, /learner-profile\/suggestion\?session_id=/);
    assert.match(source, /suggestion\?\.status === 'ready'/);
    assert.match(source, /onClick=\{useSuggestion\}/);
    assert.match(source, /setForm\(\(current\) => \(\{ \.\.\.current, \.\.\.suggestion\.data \}\)\)/);

});
