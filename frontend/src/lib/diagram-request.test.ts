import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { addMessageDiagrams, buildDiagramFromMessageRequest, messageDiagramId, messageDiagramList } from './diagram-request.ts';

test('an on-demand diagram request carries the counselor selected for the chat', () => {
    assert.deepEqual(
        buildDiagramFromMessageRequest('Testo della risposta', 'it', 'Mostra il passaggio', 42),
        {
            text: 'Testo della risposta',
            lang: 'it',
            spec_only: true,
            instruction: 'Mostra il passaggio',
            counselor_id: 42,
        },
    );
});

test('saving uses the full original message while model input stays bounded', () => {
    const source = 'Messaggio originale '.repeat(1000);
    const request = buildDiagramFromMessageRequest(source, 'it', '  Solo due passi  ', 42, 'session-a', source);
    assert.equal(request.text.length, 8000);
    assert.equal(request.source_text, source);
    assert.equal(request.session_id, 'session-a');
    assert.equal(request.instruction, 'Solo due passi');
});

test('a correction sends the visible diagram, an empty request redraws from scratch', () => {
    const spec = { type: 'flow', title: 'Un piano aiuta', nodes: [], edges: [] };
    // @ts-expect-error -- a minimal spec is enough for the request shape.
    assert.deepEqual(buildDiagramFromMessageRequest('Testo', 'it', ' Togli un nodo ', 42, 's', 'Testo', spec).previous_spec, spec);
    // @ts-expect-error -- a minimal spec is enough for the request shape.
    assert.equal('previous_spec' in buildDiagramFromMessageRequest('Testo', 'it', '  ', 42, 's', 'Testo', spec), false);
});

test('a new diagram joins the earlier ones of its message, other messages keep theirs', () => {
    const first = { source_key: 'a', title: 'Primo' };
    const second = { source_key: 'a', title: 'Secondo' };
    const other = { source_key: 'b', title: 'Altro messaggio' };
    const loaded = addMessageDiagrams({}, [first, other]);
    const after = addMessageDiagrams(loaded, [second]);
    assert.deepEqual(after, { a: [first, second], b: [other] });
    assert.deepEqual(loaded, { a: [first], b: [other] });
});

test('the sidebar lists every diagram in drawing order with the id its message uses', () => {
    const saved = [
        { source_key: 'a', source_text: 'Prima risposta', spec: { title: 'Mappa iniziale' } },
        { source_key: 'b', source_text: 'Seconda risposta\naltro', spec: { title: ' ' } },
        { source_key: 'a', source_text: 'Prima risposta', spec: { title: 'Mappa corretta' } },
    ];
    assert.deepEqual(messageDiagramList(saved), [
        { id: messageDiagramId('a', 0), title: 'Mappa iniziale' },
        { id: messageDiagramId('b', 0), title: 'Seconda risposta' },
        { id: messageDiagramId('a', 1), title: 'Mappa corretta' },
    ]);
    assert.notEqual(messageDiagramId('a', 0), messageDiagramId('a', 1));
});
