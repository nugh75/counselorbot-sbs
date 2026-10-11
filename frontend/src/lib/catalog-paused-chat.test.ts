import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

// Il catalogo strumenti è confluito in «Attività e percorsi» (step `base`):
// dopo il fiocco si atterra lì, con l'avviso della chat in pausa.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('freezing a guided chat lands on activities and paths with the paused chat', () => {
    const page = read('../app/page.tsx');
    const start = page.indexOf('onFrozen={() => {');
    const onFrozen = page.slice(start, page.indexOf('}}', start));
    assert.match(onFrozen, /setPausedChat\(\{ sessionId, questionnaireId: selectedQuestionnaire\.id \}\)/);
    assert.match(onFrozen, /setStep\('base'\)/);
    assert.match(page, /pausedChat=\{pausedChat\}/);
    assert.match(page, /if \(step !== 'base'\) setPausedChat\(null\)/);
});

test('the old tool catalog step and page are gone', () => {
    const page = read('../app/page.tsx');
    assert.doesNotMatch(page, /questionnaire-select/);
    assert.doesNotMatch(page, /QuestionnaireSelector/);
    assert.ok(!existsSync(new URL('../components/questionnaire/QuestionnaireSelector.tsx', import.meta.url)));
    assert.ok(!existsSync(new URL('../app/strumenti/page.tsx', import.meta.url)));
    // I vecchi link `?view=questionnaires` portano ad «Attività e percorsi».
    assert.match(page, /setStep\(view === 'intro' \? 'intro' : 'base'\)/);
});

test('activities and paths carry the tool catalog pieces', () => {
    const home = read('../components/home/ReturningHome.tsx');
    assert.match(home, /resumeHref\(\{ session_id: pausedChat\.sessionId \}\)/);
    for (const key of ['selector.paused.title', 'selector.paused.resume', 'selector.paused.dismiss', 'selector.badge.pausedOn',
        'selector.suggested.title', 'selector.openStrategic', 'selector.externalCredentials', 'selector.upcoming.title',
        'selector.unavailable.title', 'selector.experimentalBadge']) {
        assert.ok(home.includes(key), `missing ${key}`);
    }
    assert.match(home, /suggestTools\(/);
    assert.match(home, /latestPausedByTool\(frozen\)/);
});

test('the green brand palette stays: no off-brand sky colours in the new pieces', () => {
    assert.doesNotMatch(read('../components/home/ReturningHome.tsx'), /\bsky-\d/);
});
