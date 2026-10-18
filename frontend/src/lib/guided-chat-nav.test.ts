import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { advanceButtons, advanceLabelKey, interviewQuickReplies, isAgreementStep } from './interview-path.ts';

const source = readFileSync(new URL('../components/qsa/GuidedChatInterface.tsx', import.meta.url), 'utf8');

test('GuidedChatInterface always renders the previous and next step buttons without hiding them conditionally', () => {
    // Indietro is always rendered and guarded only by disabled state
    assert.match(source, /<Button[^>]*aria-label=\{t\('guided\.prevStep'\)\}[^>]*disabled=\{isLoading \|\| !canGoPrevious\}/);
    assert.doesNotMatch(source, /\{showPreviousStep &&/);

    // Avanti is always rendered and guarded only by disabled state
    assert.match(source, /<Button[^>]*aria-label=\{nextStepLabel\}[^>]*disabled=\{isLoading \|\| !hasNextPhase\}/);
    assert.doesNotMatch(source, /\{\(showStandardAdvance \|\| showInterviewAdvance\) &&/);

    // Step navigation bar is rendered as long as phases exist
    assert.match(source, /const hasStepNavigation = phases\.length > 0;/);
});

test('canGoPrevious and hasNextPhase determine navigation capability', () => {
    assert.match(source, /const canGoPrevious = phases\.indexOf\(currentPhase\) > 0;/);
    assert.match(source, /const hasNextPhase = phases\.indexOf\(currentPhase\) < phases\.length - 1;/);
    assert.match(source, /const targetPhase = hasNextPhase\s*\?\s*phases\[phases\.indexOf\(currentPhase\) \+ 1\]\s*:\s*undefined;/);
});

test('interview path logic and advance suggestions remain intact in interview-path module', () => {
    const idle = { conclusion: false, suggestion: false, userMessages: 0 };
    // advanceButtons function in interview-path preserves its domain logic
    assert.deepEqual(advanceButtons('SAVICKAS', 'savickas-q1', 'savickas-interview', idle), { standard: false, interview: false });
    assert.deepEqual(advanceButtons('SAVICKAS', 'savickas-q1', 'savickas-interview', { ...idle, userMessages: 3 }), { standard: false, interview: true });
    assert.deepEqual(advanceButtons('SAVICKAS', 'conclusion', undefined, { ...idle, conclusion: true }), { standard: false, interview: false });

    // Quick replies for interview steps are preserved
    assert.ok(isAgreementStep('SAVICKAS', 'savickas-patto'));
    assert.equal(advanceLabelKey('SAVICKAS', 'savickas-q1'), 'guided.nextTopic');
    assert.equal(advanceLabelKey('ZTPI', 'ztpi-t1'), 'guided.nextStep');
});
