import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { DIAGRAM_ICONS, parseDiagramSpec, splitDiagramContent } from './diagram-content.ts';

const CYCLE = {
    type: 'cycle',
    title: 'Circolo dell\'evitamento',
    nodes: [
        { id: 'a', label: 'Compito difficile' },
        { id: 'b', label: 'Rimando' },
    ],
    edges: [{ from: 'a', to: 'b' }],
};

test('all 100 catalogued icons survive parsing alongside a node without an icon', () => {
    const catalog = JSON.parse(readFileSync(new URL('../../../backend/diagram_icon_catalog.json', import.meta.url), 'utf8')) as { id: string }[];
    assert.equal(catalog.length, 100);
    assert.deepEqual(DIAGRAM_ICONS, catalog.map(entry => entry.id));
    for (const { id } of catalog) {
        const spec = parseDiagramSpec({ ...CYCLE, nodes: [
            { id: 'a', label: 'Significato specifico', icon: id },
            { id: 'b', label: 'Obiettivo non ancora raggiunto', icon: null, form: 'outcome' },
        ] });
        assert.equal(spec?.nodes[0].icon, id);
        assert.equal(spec?.nodes[1].icon, undefined);
        assert.equal(spec?.nodes[1].label, 'Obiettivo non ancora raggiunto');
        assert.equal(spec?.nodes[1].form, 'outcome');
    }
});

test('factor identities and questionnaire scope survive restore and rendering requests', () => {
    const spec = parseDiagramSpec({ ...CYCLE, questionnaire_type: 'QSA', nodes: [
        { id: 'a', label: 'Percezione di competenza bassa', factor: 'QSA:A6' },
        { id: 'b', label: 'Cause controllabili', factor: 'QSA:A3', icon: 'access' },
    ] });
    assert.equal(spec?.questionnaire_type, 'QSA');
    assert.equal(spec?.nodes[0].factor, 'QSA:A6');
    assert.equal(spec?.nodes[0].label, 'Percezione di competenza bassa');
    assert.equal(spec?.nodes[1].icon, 'access');
});

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
