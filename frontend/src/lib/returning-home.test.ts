import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
    new URL('../components/home/ReturningHome.tsx', import.meta.url),
    'utf8',
);

test('returning home includes the pQBL tool card', () => {
    assert.match(source, /href="\/pqbl"/);
    assert.match(source, /pqbl\.card\.title/);
    assert.match(source, /pqbl\.card\.desc/);
    assert.match(source, /pqbl\.card\.cta/);
});

test('changing the counselor from home shows a single back action and no stepper', () => {
    const pageSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
    assert.match(pageSource, /onChangeCounselor=\{\(\) => \{[\s\S]*setCounselorOpenedFromHome\(true\)/);
    // Aperto dalla home: una sola freccia (niente conferma in avanti).
    assert.match(pageSource, /onContinue=\{counselorOpenedFromHome \? undefined/);
    // Aperto dalla home: niente stati (FlowStepper) sopra.
    assert.match(pageSource, /!\(step === 'counselor-select' && counselorOpenedFromHome\)/);
    // Il ritorno alla home resta nel gestore "indietro".
    assert.match(pageSource, /step === 'counselor-select' && counselorOpenedFromHome\) \{[\s\S]*setStep\(homeStep\(\)\)/);
});
