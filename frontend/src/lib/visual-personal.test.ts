import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { emptyWorkspace } from './visual-tools.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { annotationEntries, importAnnotation, visualEntries, type ImportTarget } from './visual-personal.ts';
const entry = { id: 'notebook_goal', label: 'Obiettivo', text: 'Studiare meglio', source: 'Taccuino · Obiettivo' };
for (const target of ['cards', 'actions', 'comparison'] as ImportTarget[]) {
    test(`explicit import to ${target} preserves source, original work and prevents retry duplicates`, () => {
        const original = emptyWorkspace();
        const next = importAnnotation(original, entry, target, 'Testo rivisto', 'Titolo');
        const items = target === 'comparison' ? next.comparison.options : next[target];
        assert.equal(items.length, 1);
        assert.equal(items[0].source, entry.source);
        assert.deepEqual(original, emptyWorkspace());
        const another = importAnnotation(next, entry, target, 'Un altro estratto', 'Titolo');
        assert.equal((target === 'comparison' ? another.comparison.options : another[target]).length, 2);
        assert.equal(next.comparison.chosen, null);
        assert.throws(() => importAnnotation(next, entry, target, 'Testo rivisto', 'Titolo'), /personalDuplicate/);
        assert.throws(() => importAnnotation(original, entry, target, 'x'.repeat(1001), 'Titolo'), /personalLength/);
    });
}
test('only nonempty annotation fields are offered and visual selections retain their content', () => {
    const entries = annotationEntries({ questionnaire_type: 'QSA', limits: { notebook: 600, booklet: 2000 }, sources: {}, notebook: { goal: entry.text }, booklets: [{ id: 1, title: 'Scheda', data: { objective: 'Una prova', strategy: '  ' } }] }, key => key, key => key);
    assert.deepEqual(entries.map(item => item.id), ['notebook_goal', 'booklet_1_objective']);
    const work = importAnnotation(emptyWorkspace(), entry, 'actions', 'Testo rivisto', 'Titolo');
    work.actions[0].reflection = 'Riflessione';
    const result = visualEntries(work, key => key);
    assert.equal(result.length, 1);
    assert.match(result[0].text, /Testo rivisto/);
    assert.match(result[0].text, /Riflessione/);
    assert.match(result[0].text, /Taccuino/);
});
