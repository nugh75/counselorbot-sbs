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

test('the landing shows before the gate, and its only way forward is the compass', () => {
    // Chi entra per la prima volta -- anche come ospite, che per il cancello è
    // uno studente come gli altri -- veniva spedito alla Bussola senza aver
    // letto che cos'è questo posto.
    assert.equal(orientationGateBypass('/'), true);
    assert.equal(orientationGateBypass('/', ''), true);
    // I collegamenti che entrano dritti nel percorso restano al di qua.
    assert.equal(orientationGateBypass('/', '?view=questionnaires'), false);
    assert.equal(orientationGateBypass('/', '?start=IDEA'), false);
    // E il tasto della presentazione porta alla Bussola, o passare di qui
    // sarebbe saltarla.
    const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
    const handler = source.slice(source.indexOf('const startFromIntro'), source.indexOf('const homeStep'));
    assert.match(handler, /status\.required/);
    assert.match(handler, /router\.push\('\/bussola'\)/);
    assert.match(source, /<IntroScreen onStart=\{startFromIntro\}/);
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

test('the gate settles once per page load instead of re-checking on every route', () => {
    const source = readFileSync(
        new URL('../components/layout/OrientationGate.tsx', import.meta.url),
        'utf8',
    );
    // Una volta accertato che la Bussola non serve, il cancello non interroga
    // più il server né svuota il contenuto a ogni cambio rotta.
    assert.match(source, /let gateSettled = false/);
    assert.match(source, /if \(gateSettled\) \{[\s\S]*?setChecking\(false\)/);
    assert.match(source, /if \(!status\.required\) \{\s*\n\s*gateSettled = true/);
    // Un errore di rete non deve spegnere il cancello per tutta la sessione.
    assert.doesNotMatch(source, /catch \{[\s\S]{0,200}gateSettled = true/);
});

test('the real identity is fetched once and shared by its callers', () => {
    const source = readFileSync(new URL('./auth.ts', import.meta.url), 'utf8');
    assert.match(source, /let identityRequest: Promise<Identity \| null> \| null = null/);
    assert.match(source, /if \(identityRequest\) return identityRequest/);
    // Un errore di rete non resta in cache.
    assert.match(source, /identityRequest = null/);
});

test('a concluded Compass has a way out even when no tool is opened', () => {
    const source = readFileSync(new URL('../app/bussola/page.tsx', import.meta.url), 'utf8');
    // Senza `?next=` — cioè per chi apre la Bussola dalla topbar invece di
    // esserci rimandato dal cancello — il pannello finale non aveva alcun
    // collegamento: restavano le schede degli strumenti e nient'altro.
    assert.match(source, /href=\{nextHref \?\? '\/'\}/);
    assert.match(source, /nextHref \? t\('orientation\.continue'\) : t\('nav\.home'\)/);
    // Il taccuino chiesto prima di aprire uno strumento sostituisce la pagina:
    // senza ritorno, ogni suo comando portava comunque a quello strumento.
    assert.match(source, /onBack=\{\(\) => setPendingTool\(null\)\}/);
});

test('Bussola cards do not use decorative left borders', () => {
    const source = readFileSync(new URL('../app/bussola/page.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /border-l-/);
});
