import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { buildDiagramFromMessageRequest } from './diagram-request.ts';

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
