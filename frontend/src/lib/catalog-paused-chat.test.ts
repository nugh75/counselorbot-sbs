import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

// L'Area studente prende in carico l'avviso dopo il fiocco.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the pause notice is transferred once to the Student area', () => {
    const page = read('../app/page.tsx');
    const start = page.indexOf('const handleInteractionFrozen');
    const onFrozen = page.slice(start, page.indexOf('const analyzeAnother', start));
    assert.match(onFrozen, /rememberPausedChat\(\{ sessionId, questionnaireId: selectedQuestionnaire\.id \}\)/);
    assert.match(onFrozen, /router\.push\('\/profilo'\)/);
    const personalArea = read('../components/profile/PersonalAreaHome.tsx');
    assert.match(personalArea, /setPausedChat\(takePausedChat\(\)\)/);
    assert.match(personalArea, /pausedChat=\{pausedChat\}/);
});

test('the old tool catalog step and page are gone', () => {
    const page = read('../app/page.tsx');
    assert.doesNotMatch(page, /questionnaire-select/);
    assert.doesNotMatch(page, /QuestionnaireSelector/);
    assert.ok(!existsSync(new URL('../components/questionnaire/QuestionnaireSelector.tsx', import.meta.url)));
    assert.ok(!existsSync(new URL('../app/strumenti/page.tsx', import.meta.url)));
    // I vecchi link `?view=questionnaires` portano ad «Attività e percorsi».
    assert.match(page, /router\.replace\(homeLandingHref\(/);
});

test('activities and paths carry the tool catalog pieces', () => {
    const home = read('../components/home/InstrumentCatalog.tsx');
    assert.match(home, /resumeHref\(frozen\.find\(row => row\.session_id === pausedChat\.sessionId\)/);
    for (const key of ['selector.paused.title', 'selector.paused.resume', 'selector.paused.dismiss', 'selector.badge.pausedOn',
        'selector.suggested.title', 'selector.openStrategic', 'selector.externalCredentials', 'selector.upcoming.title',
        'selector.unavailable.title', 'selector.experimentalBadge']) {
        assert.ok(home.includes(key), `missing ${key}`);
    }
    assert.match(home, /suggestTools\(/);
    assert.match(home, /latestPausedByTool\(frozen\)/);
});

test('the green brand palette stays: no off-brand sky colours in the new pieces', () => {
    assert.doesNotMatch(read('../components/home/InstrumentCatalog.tsx'), /\bsky-\d/);
});
