import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// M2 ha una scala neutra: la barra grigia non e' un errore, ma va spiegata.
// Il punteggio resta quello calcolato e non diventa forza o area di crescita.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the QPCC M2 bar stays neutral and carries the explanation', () => {
    const source = read('../components/qsa/ProfileVisualization.tsx');
    assert.match(source, /const isNeutral = questionnaireId === 'QPCC' && code === 'M2'/);
    assert.match(source, /isNeutral && "bg-slate-500"/);
    assert.match(source, /profile\.QPCC\.neutralNote/);
    assert.match(source, /profile\.legend\.neutralScale/);
});

test('the neutral scale note and legend label exist in all six languages', () => {
    const source = read('./i18n.ts');
    for (const key of ['profile.QPCC.neutralNote', 'profile.legend.neutralScale']) {
        assert.equal(source.split(`'${key}'`).length - 1, 6, `${key}: expected six languages`);
    }
});
