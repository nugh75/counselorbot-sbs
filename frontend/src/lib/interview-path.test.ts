import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { acceptsAgreement, advanceButtons, advanceLabelKey, autoAdvancesOnGenerate, interviewQuickReplies, isAgreementStep, stepInstructionsMessage, userDecidesAdvance } from './interview-path.ts';

const idle = { analysisStep: true, suggestion: false, userMessages: 0 };

test('each interview path opens with its own agreement step', () => {
    assert.equal(isAgreementStep('SAVICKAS', 'savickas-patto'), true);
    assert.equal(isAgreementStep('QPCC', 'qpcc-intro'), true);
    assert.equal(isAgreementStep('QAP', 'qap-intro'), true);
    assert.equal(isAgreementStep('EVENTO_STUDIO', 'evstudio-patto'), true);
    assert.equal(isAgreementStep('EVENTO_PROFESSIONALE', 'evprof-patto'), true);
    assert.equal(isAgreementStep('SAVICKAS', 'savickas-q1'), false);
});

test('instruments outside the interview family have no agreement step', () => {
    assert.equal(isAgreementStep('QSA', 'intro'), false);
    assert.equal(isAgreementStep('QPCS', 'qpcs-intro'), false);
});

test('the agreement is accepted in the session language, and only on the agreement step', () => {
    assert.equal(acceptsAgreement('QPCC', 'qpcc-intro', 'it', 'Accetto'), true);
    assert.equal(acceptsAgreement('QAP', 'qap-intro', 'en', 'I agree'), true);
    assert.equal(acceptsAgreement('SAVICKAS', 'savickas-patto', 'sv', 'jag accepterar'), true);
    assert.equal(acceptsAgreement('QPCC', 'qpcc-intro', 'it', 'sì va bene'), false);
    assert.equal(acceptsAgreement('QPCC', 'qpcc-comunicazione', 'it', 'Accetto'), false);
    assert.equal(acceptsAgreement('QSA', 'intro', 'it', 'Accetto'), false);
});

test('an unknown language falls back to the Italian acceptance', () => {
    assert.equal(acceptsAgreement('SAVICKAS', 'savickas-patto', 'pt', 'accetto'), true);
});

// Il pulsante "Accetto" manda la sua etichetta come messaggio: se una
// traduzione smette di combaciare, il patto non si chiude piu' da pulsante.
test('the Accept button label closes the agreement in every language', () => {
    const source = readFileSync(new URL('./i18n.ts', import.meta.url), 'utf8');
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
        const block = source.slice(source.indexOf(`const ${lang}: Dict = {`));
        const label = block.match(/'guided\.qr\.accept':\s*'([^']+)'/)?.[1] ?? '';
        assert.equal(acceptsAgreement('QAP', 'qap-intro', lang, label), true, `${lang}: "${label}"`);
    }
});

test('every interview turn carries the step instructions', () => {
    assert.equal(
        stepInstructionsMessage('QAP', 'Explore concern.', 'es', 'Pienso poco en el futuro'),
        'CURRENT STEP INTERNAL INSTRUCTIONS (use them only as guidance; answer the student in language "es"):\n'
            + 'Explore concern.\n\nSTUDENT ANSWER:\nPienso poco en el futuro',
    );
});

test('a turn without step instructions, or outside the family, is sent as written', () => {
    assert.equal(stepInstructionsMessage('SAVICKAS', undefined, 'it', 'ciao'), 'ciao');
    assert.equal(stepInstructionsMessage('QSA', 'Analyse C1.', 'it', 'ciao'), 'ciao');
});

test('generating a step advances by itself only on the final summary of an interview path', () => {
    assert.equal(autoAdvancesOnGenerate('SAVICKAS', 'savickas-final'), true);
    assert.equal(autoAdvancesOnGenerate('SAVICKAS', 'savickas-q1'), false);
    assert.equal(autoAdvancesOnGenerate('QPCC', 'qpcc-sintesi'), true);
    assert.equal(autoAdvancesOnGenerate('QPCC', 'qpcc-comunicazione'), false);
    assert.equal(autoAdvancesOnGenerate('EVENTO_PROFESSIONALE', 'evprof-final'), true);
    assert.equal(autoAdvancesOnGenerate('EVENTO_PROFESSIONALE', 'evprof-prossima'), false);
});

test('generating a step keeps the old rules outside the family', () => {
    assert.equal(autoAdvancesOnGenerate('QPCS', 'qpcs-emozioni'), false);
    assert.equal(autoAdvancesOnGenerate('QSA', 'cognitive'), true);
});

test('in an interview the person decides when to change topic, except on the summary', () => {
    assert.equal(userDecidesAdvance('SAVICKAS', 'savickas-q3', 'Mini-sintesi.'), true);
    assert.equal(userDecidesAdvance('SAVICKAS', 'savickas-final', 'Sintesi.'), false);
    assert.equal(userDecidesAdvance('QAP', 'qap-fiducia', 'Mini-sintesi.'), true);
    assert.equal(userDecidesAdvance('QAP', 'qap-sintesi', 'Sintesi.'), false);
});

// Alla richiesta "andiamo avanti" il modello risponde con il solo marcatore:
// e' la persona che ha deciso, e fermarsi lascerebbe il turno senza risposta.
test('a reply made only of the marker means the person asked to move on', () => {
    assert.equal(userDecidesAdvance('EVENTO_STUDIO', 'evstudio-intro', ''), false);
    assert.equal(userDecidesAdvance('QPCC', 'qpcc-controllo', '   '), false);
});

test('outside the family only QPCS leaves the advance to the person', () => {
    assert.equal(userDecidesAdvance('QPCS', 'qpcs-emozioni', 'Mini-sintesi.'), true);
    assert.equal(userDecidesAdvance('ZTPI', 'ztpi-t1', 'Analisi.'), false);
});

test('the agreement step offers only the acceptance', () => {
    assert.deepEqual(interviewQuickReplies('QPCC', 'qpcc-intro', idle), [
        { key: 'guided.qr.accept', action: 'send', emphasis: true },
    ]);
});

test('an interview step offers rephrasing and reflection, then the way on once the person has spoken', () => {
    assert.deepEqual(interviewQuickReplies('QAP', 'qap-controllo', idle), [
        { key: 'guided.qr.rephrase', action: 'send' },
        { key: 'guided.qr.reflect', action: 'send' },
    ]);
    assert.deepEqual(interviewQuickReplies('QAP', 'qap-controllo', { ...idle, userMessages: 1 }).at(-1), {
        key: 'guided.qr.readyNext', action: 'advance',
    });
    assert.deepEqual(interviewQuickReplies('SAVICKAS', 'savickas-q2', { ...idle, suggestion: true }).at(-1), {
        key: 'guided.qr.readyNext', action: 'advance',
    });
});

test('no quick replies outside a step or outside the family', () => {
    assert.deepEqual(interviewQuickReplies('SAVICKAS', 'conclusion', { ...idle, analysisStep: false }), []);
    assert.deepEqual(interviewQuickReplies('QSA', 'cognitive', idle), []);
});

const buttons = (type: string, phase: string, stepMode: string | undefined, over = {}) =>
    advanceButtons(type, phase, stepMode, { conclusion: false, suggestion: false, userMessages: 0, ...over });

test('an interview step shows the way on after the suggestion or three answers', () => {
    assert.deepEqual(buttons('SAVICKAS', 'savickas-q1', 'savickas-interview'), { standard: false, interview: false });
    assert.deepEqual(buttons('SAVICKAS', 'savickas-q1', 'savickas-interview', { userMessages: 3 }), { standard: false, interview: true });
    assert.deepEqual(buttons('QPCC', 'qpcc-convinzioni', 'qpcc-interview', { suggestion: true }), { standard: false, interview: true });
    assert.deepEqual(buttons('QAP', 'qap-sintesi', 'qap-summary', { userMessages: 3 }), { standard: false, interview: true });
});

test('the agreement step never shows the way on: only the acceptance moves it', () => {
    assert.deepEqual(buttons('QPCC', 'qpcc-intro', 'qpcc-interview', { suggestion: true, userMessages: 5 }), { standard: false, interview: false });
});

test('steps that are not interview steps keep the way on always visible', () => {
    assert.deepEqual(buttons('SAVICKAS', 'savickas-intro', 'intro'), { standard: true, interview: false });
    assert.deepEqual(buttons('QPCC', 'qpcc-profilo', 'qpcc-factor'), { standard: true, interview: false });
    assert.deepEqual(buttons('QAP', 'questions', undefined), { standard: true, interview: false });
});

test('outside the family the way on is always visible, and nowhere after the conclusion', () => {
    assert.deepEqual(buttons('QSA', 'cognitive', 'factor'), { standard: true, interview: false });
    assert.deepEqual(buttons('SAVICKAS', 'conclusion', undefined, { conclusion: true }), { standard: false, interview: false });
});

test('the way on reads as a new topic in an interview and as the next step elsewhere', () => {
    assert.equal(advanceLabelKey('QPCC', 'qpcc-profilo'), 'guided.nextTopic');
    assert.equal(advanceLabelKey('ZTPI', 'ztpi-t1'), 'guided.nextStep');
    assert.equal(advanceLabelKey('SAVICKAS', 'questions'), 'guided.concludeSession');
});
