import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { noticingMessageId, parseNoticing } from './teacher-noticing.ts';

test('noticing keeps only known kinds with valid quoted evidence', () => {
    const parsed = parseNoticing({ status: 'ready', generated_at: '2026-10-23T10:00:00', items: [
        { kind: 'revisit', text: 'Tema', evidence: [{ message: 2, quote: 'ho paura' }, { message: -1, quote: 'x' }, { message: 1.5, quote: 'y' }] },
        { kind: 'diagnosis', text: 'No', evidence: [{ message: 0, quote: 'z' }] },
        { kind: 'resource', text: 'Senza prove', evidence: [] },
        null,
    ] });
    assert.deepEqual(parsed.items, [{ kind: 'revisit', text: 'Tema', evidence: [{ message: 2, quote: 'ho paura' }] }]);
    assert.equal(parsed.generated_at, '2026-10-23T10:00:00');
});

test('noticing states are explicit and invalid payloads fail', () => {
    for (const status of ['ready', 'stale', 'missing', 'empty', 'unavailable']) {
        assert.equal(parseNoticing({ status, items: [], generated_at: null }).status, status);
    }
    assert.throws(() => parseNoticing({ status: 'other', items: [] }));
    assert.throws(() => parseNoticing({ status: 'ready' }));
    assert.throws(() => parseNoticing(null));
    assert.equal(noticingMessageId('r1', 4), 'r1-message-4');
});

test('noticing texts exist in the six languages', () => {
    const source = readFileSync(new URL('./i18n-noticing.ts', import.meta.url), 'utf8');
    assert.match(source, /satisfies Record<string, Localized>/);
});
