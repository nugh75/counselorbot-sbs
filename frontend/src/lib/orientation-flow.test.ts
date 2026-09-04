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

test('Bussola exposes editable notebook and instrument booklet after completion', () => {
    const source = readFileSync(new URL('../app/bussola/page.tsx', import.meta.url), 'utf8');
    assert.match(source, /LearnerProfileCard variant="edit"/);
    assert.match(source, /StudentBookletCard/);
    assert.match(source, /EVENT_BOOKLET_TYPES/);
    assert.match(source, /disabled=\{!session\.notebook_reviewed \|\| completing\}/);
});

test('Bussola asks for a counselor before creating the conversation', () => {
    const source = readFileSync(new URL('../app/bussola/page.tsx', import.meta.url), 'utf8');
    assert.match(source, /CounselorSelector/);
    assert.match(source, /orientation\.counselor\.title/);
    assert.match(source, /createSession\(newSession, counselorId\)/);
});

test('Bussola cards do not use decorative left borders', () => {
    const source = readFileSync(new URL('../app/bussola/page.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /border-l-/);
});
