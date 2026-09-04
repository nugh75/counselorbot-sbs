import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { parseDiagramSpec, splitDiagramContent } from './diagram-content.ts';

const CYCLE = {
    type: 'cycle',
    title: 'Circolo dell\'evitamento',
    nodes: [
        { id: 'a', label: 'Compito difficile' },
        { id: 'b', label: 'Rimando' },
    ],
    edges: [{ from: 'a', to: 'b' }],
};

test('a declared form reaches the renderer', () => {
    const spec = parseDiagramSpec({
        ...CYCLE,
        nodes: [{ id: 'a', label: 'Scrivo il piano?', form: 'decision' }, CYCLE.nodes[1]],
    });
    assert.equal(spec?.nodes[0].form, 'decision');
});

test('an invented form is dropped, like an invented icon', () => {
    const spec = parseDiagramSpec({
        ...CYCLE,
        nodes: [{ id: 'a', label: 'Compito difficile', form: 'trapezio' }, CYCLE.nodes[1]],
    });
    // Il nodo resta: una forma sconosciuta e' una decorazione mancata, non un
    // diagramma rotto.
    assert.equal(spec?.nodes.length, 2);
    assert.equal(spec?.nodes[0].form, undefined);
});

test('the note travels with the spec', () => {
    const note = 'Il rimando allunga il compito, e il compito allungato fa rimandare ancora.';
    const spec = parseDiagramSpec({ ...CYCLE, note });
    assert.equal(spec?.note, note);
});

test('a fenced diagram carrying a note is still recognised in a message', () => {
    const message = ['Ecco lo schema.', '', '```diagram', JSON.stringify({ ...CYCLE, note: 'Come si legge.' }), '```'].join('\n');
    const segments = splitDiagramContent(message);
    const diagram = segments.find((segment) => segment.kind === 'diagram');
    assert.ok(diagram && diagram.kind === 'diagram');
    assert.equal(diagram.spec.note, 'Come si legge.');
});
