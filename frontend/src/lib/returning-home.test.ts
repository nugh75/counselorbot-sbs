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

test('changing the counselor from home returns to home after confirmation', () => {
    const pageSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
    assert.match(pageSource, /onChangeCounselor=\{\(\) => \{[\s\S]*setCounselorOpenedFromHome\(true\)/);
    assert.match(pageSource, /if \(counselorOpenedFromHome\) \{[\s\S]*setStep\(homeStep\(\)\)/);
});
