import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { orientationGateBypass, orientationToolHref, safeOrientationNext } from './tool-catalog.ts';

test('Bussola links only to tools in the shared catalog', () => {
    assert.equal(orientationToolHref('QSA'), '/?start=QSA');
    assert.equal(orientationToolHref('IDEA'), '/?start=IDEA');
    assert.equal(orientationToolHref('pqbl'), '/pqbl');
    assert.equal(orientationToolHref('unknown'), '/?view=questionnaires');
});

test('the return destination stays inside the app and outside Bussola', () => {
    assert.equal(safeOrientationNext('/profilo?section=portfolio'), '/profilo?section=portfolio');
    assert.equal(safeOrientationNext('//outside.example'), null);
    assert.equal(safeOrientationNext('/bussola?next=/profilo'), null);
    assert.equal(safeOrientationNext('https://outside.example'), null);
});

test('required orientation does not interrupt recovery links', () => {
    assert.equal(orientationGateBypass('/', '?frozen=session-1'), true);
    assert.equal(orientationGateBypass('/', '?resume=1'), true);
    assert.equal(orientationGateBypass('/', '?session_id=session-2&instrument=QSA'), true);
    assert.equal(orientationGateBypass('/', '?start=QSA'), false);
    assert.equal(orientationGateBypass('/bussola'), true);
});

test('Bussola opens the notebook before and after the conversation, and never the booklet', () => {
    const source = readFileSync(new URL('../app/bussola/page.tsx', import.meta.url), 'utf8');
    assert.match(source, /variant="review"[\s\S]*onDone=\{startAfterNotebook\}/);
    assert.match(source, /session\.status === 'completed' && <LearnerProfileCard variant="update"/);
    assert.doesNotMatch(source, /StudentBookletCard/);
});

test('a recommended tool can be opened at any point, through the notebook question', () => {
    const source = readFileSync(new URL('../app/bussola/page.tsx', import.meta.url), 'utf8');
    // Il bottone dello strumento non dipende più dallo stato della sessione.
    // (È una <Button>, la primitiva, da quando il percorso studente la adotta.)
    assert.match(source, /<Button type="button" onClick=\{\(\) => onPick\(item\.id\)\}/);
    assert.match(source, /session && pendingTool \? \(\s*<LearnerProfileCard\s+variant="update"/);
    assert.match(source, /onDone=\{\(\) => void leaveForTool\(\)\}/);
    // Il gate rimanda alla Bussola chi non l'ha conclusa: uscire deve completarla.
    assert.match(source, /completeOrientation\(session\.session_id\)/);
    assert.match(source, /router\.push\(orientationToolHref\(pendingTool\)\)/);
});

test('the Compass header carries no feature blurbs', () => {
    const source = readFileSync(new URL('../app/bussola/page.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /orientation\.feature\.|orientation\.platform/);
});

test('Bussola only advises: it writes neither notebook nor booklet', () => {
    const api = readFileSync(new URL('./orientation-api.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(api, /notebook-review|notebook_draft|notebook_reviewed/);
});

test('Bussola asks for a counselor before creating the conversation', () => {
    const source = readFileSync(new URL('../app/bussola/page.tsx', import.meta.url), 'utf8');
    assert.match(source, /CounselorSelector/);
    assert.match(source, /orientation\.counselor\.title/);
    assert.match(source, /setPendingCounselorId\(counselorId\)/);
    assert.match(source, /createSession\(pendingNewSession, pendingCounselorId\)/);
});
