import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Dopo il fiocco si atterra nel catalogo: senza l'avviso lo studente non sa
// che la chat è in pausa né come tornarci.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('freezing a guided chat hands the paused chat to the catalog', () => {
    const page = read('../app/page.tsx');
    const onFrozen = page.slice(page.indexOf('onFrozen={() => {'), page.indexOf("setStep('questionnaire-select');", page.indexOf('onFrozen={() => {')));
    assert.match(onFrozen, /setPausedChat\(\{ sessionId, questionnaireId: selectedQuestionnaire\.id \}\)/);
    assert.match(page, /pausedChat=\{pausedChat\}/);
    assert.match(page, /if \(step !== 'questionnaire-select'\) setPausedChat\(null\)/);
});

test('the catalog banner resumes the frozen snapshot', () => {
    const selector = read('../components/questionnaire/QuestionnaireSelector.tsx');
    assert.match(selector, /resumeHref\(\{ session_id: pausedChat\.sessionId \}\)/);
    for (const key of ['title', 'body', 'resume', 'dismiss']) {
        assert.ok(selector.includes(`selector.paused.${key}`), `missing selector.paused.${key}`);
    }
});
