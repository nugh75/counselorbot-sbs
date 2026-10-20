import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { chatPreferenceLabel, essentialAdvancesOnSignal, essentialPhasesFor, essentialReplyPhase, essentialSignalAdvances, essentialSteps } from './chat-preferences.ts';

const LANGS = ['it', 'en', 'es', 'fr', 'de', 'sv'] as const;
const completed = { completed: true, marker: true, entry: false };

test('QSA essential keeps clarifications in the current phase until a completed choice', () => {
    assert.equal(essentialAdvancesOnSignal('QSA'), true);
    assert.equal(essentialSignalAdvances('QSA', 'qsa-essential-focus', { ...completed, marker: false }), false);
    assert.equal(essentialSignalAdvances('QSA', 'qsa-essential-focus', { ...completed, completed: false }), false);
    assert.equal(essentialSignalAdvances('QSA', 'qsa-essential-focus', { ...completed, entry: true }), false);
    assert.equal(essentialReplyPhase('QSA', 'qsa-essential-focus'), 'qsa-essential-focus');
    assert.equal(essentialSignalAdvances('QSA', 'qsa-essential-focus', completed), true);
});

for (const type of ['OBIETTIVO_STUDIO', 'OBIETTIVO_DOCENZA']) {
    const [focus, define, plan, summary] = essentialPhasesFor(type);

    test(`${type}: a reply stays in its stage until the marker closes it`, () => {
        assert.equal(essentialAdvancesOnSignal(type), true);
        for (const phase of [focus, define, plan, summary]) assert.equal(essentialReplyPhase(type, phase), phase);
        assert.equal(essentialSignalAdvances(type, focus, { ...completed, marker: false }), false, 'no marker, no advance');
        assert.equal(essentialSignalAdvances(type, focus, completed), true);
        assert.equal(essentialSignalAdvances(type, define, completed), true);
        assert.equal(essentialSignalAdvances(type, plan, completed), true);
    });

    test(`${type}: an interrupted stream never advances`, () => {
        for (const phase of [focus, define, plan]) {
            assert.equal(essentialSignalAdvances(type, phase, { ...completed, completed: false }), false);
            assert.equal(essentialSignalAdvances(type, phase, { completed: false, marker: true, entry: true }), false);
        }
    });

    test(`${type}: openings advance only when the objective is already defined`, () => {
        assert.equal(essentialSignalAdvances(type, focus, { ...completed, entry: true }), false, 'focus needs the person');
        assert.equal(essentialSignalAdvances(type, plan, { ...completed, entry: true }), false, 'plan needs the person');
        assert.equal(essentialSignalAdvances(type, define, { ...completed, entry: true }), true);
        assert.equal(essentialSignalAdvances(type, summary, completed), false, 'the summary is the end');
        assert.equal(essentialSignalAdvances(type, summary, { ...completed, entry: true }), false);
    });

    test(`${type}: stage labels name focus, objective and plan in six languages`, () => {
        for (const lang of LANGS) {
            const labels = essentialSteps(type, lang).map((step: { label: string }) => step.label);
            assert.equal(labels.length, 4);
            assert.ok(labels.every((label: string) => label.trim()), `${type}/${lang}`);
            assert.equal(labels[0], chatPreferenceLabel(lang, 'focusDraft'));
            assert.equal(labels[1], chatPreferenceLabel(lang, 'completeObjective'));
            assert.equal(labels[2], chatPreferenceLabel(lang, type === 'OBIETTIVO_DOCENZA' ? 'alignAssess' : 'planProof'));
            assert.ok(chatPreferenceLabel(lang, 'essentialHelpGoal').startsWith('3 '), lang);
            assert.doesNotMatch(chatPreferenceLabel(lang, 'essentialHelpGoal'), /repl|rispost|respuest|réponse|Antwort|svar/i);
        }
    });
}

test('the guided chat advances Obiettivo stages only through the shared helpers', () => {
    const source = readFileSync(new URL('../components/qsa/GuidedChatInterface.tsx', import.meta.url), 'utf8');
    assert.match(source, /essentialReplyPhase\(questionnaireType, currentPhase\)/);
    assert.match(source, /essentialSignalAdvances\(questionnaireType, currentPhase, \{ completed: true, marker: shouldAdvance, entry: false \}\)/);
    assert.match(source, /essentialSignalAdvances\(questionnaireType, step\.id, \{ completed: true, marker: shouldAdvance, entry: true \}\)/);
    assert.match(source, /questionnaireType === 'QSA' \? 'essentialHelp' : 'essentialHelpGoal'/);
    assert.doesNotMatch(source, /nextEssentialPhase\(currentPhase\)/);
});
