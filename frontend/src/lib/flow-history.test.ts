import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Node's built-in TypeScript runner requires the explicit extension; the app's
// bundler configuration intentionally does not enable TS extension imports.
// @ts-expect-error -- executed directly by `node --test`.
import { enterStep, startTrail, stepAtDepth } from './flow-history.ts';

test('the trail opens on the step the page entered from', () => {
    assert.deepEqual(startTrail('intro'), { steps: ['intro'], depth: 1 });
});

test('each new step extends the trail and moves the depth with it', () => {
    const trail = enterStep(enterStep(startTrail('intro'), 'notebook'), 'questionnaire-select');
    assert.deepEqual(trail, { steps: ['intro', 'notebook', 'questionnaire-select'], depth: 3 });
});

test('re-entering the current step changes nothing', () => {
    const trail = enterStep(startTrail('intro'), 'notebook');
    assert.equal(enterStep(trail, 'notebook'), trail);
});

test('going back returns the step actually walked through, not a guessed one', () => {
    // Con un counselor già scelto il percorso salta la sua fase: tornare
    // indietro dal profilo deve dare il metodo di inserimento, non la fase saltata.
    let trail = startTrail('base');
    for (const step of ['questionnaire-select', 'method-select', 'upload-input', 'dashboard']) {
        trail = enterStep(trail, step);
    }

    const back = stepAtDepth(trail, 4);
    assert.equal(back.step, 'upload-input');
    const further = stepAtDepth(back.trail, 3);
    assert.equal(further.step, 'method-select');
});

test('forward after back walks the trail again instead of going back twice', () => {
    let trail = startTrail('base');
    trail = enterStep(trail, 'questionnaire-select');
    trail = enterStep(trail, 'counselor-select');

    const back = stepAtDepth(trail, 2);
    assert.equal(back.step, 'questionnaire-select');
    const forward = stepAtDepth(back.trail, 3);
    assert.equal(forward.step, 'counselor-select');
});

test('a new step after going back cuts what stood ahead', () => {
    let trail = startTrail('base');
    trail = enterStep(trail, 'questionnaire-select');
    trail = enterStep(trail, 'counselor-select');
    trail = stepAtDepth(trail, 2).trail;

    trail = enterStep(trail, 'notebook');
    assert.deepEqual(trail, { steps: ['base', 'questionnaire-select', 'notebook'], depth: 3 });
});

test('a depth outside the known trail moves nothing', () => {
    const trail = enterStep(startTrail('intro'), 'notebook');
    assert.equal(stepAtDepth(trail, 0).step, null);
    assert.equal(stepAtDepth(trail, 5).step, null);
    assert.equal(stepAtDepth(trail, 1.5).step, null);
});

test('the home page pushes a history entry per step and answers popstate', () => {
    const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
    assert.match(source, /enterStep/);
    assert.match(source, /stepAtDepth/);
    assert.match(source, /window\.history\.pushState\(\{ cbDepth/);
    assert.match(source, /addEventListener\('popstate'/);
});
