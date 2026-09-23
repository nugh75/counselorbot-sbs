import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { resumeLabel } from './resume-label.ts';

const translate = (key: string, fallback: string) => ({
    'q.OBIETTIVO_DOCENZA.name': 'Obiettivi per la classe',
    'q.EVENTO_STUDIO.name': 'Evento di studio',
}[key] ?? fallback);

test('resume translates generated codes while preserving the saved phase', () => {
    assert.equal(resumeLabel('OBIETTIVO_DOCENZA', 'OBIETTIVO_DOCENZA — Piano e prova', translate), 'Obiettivi per la classe — Piano e prova');
    assert.equal(resumeLabel('EVENTO_STUDIO', 'EVENTO_STUDIO - Presentazione', translate), 'Evento di studio - Presentazione');
    assert.equal(resumeLabel('EVENTO_STUDIO', null, translate), 'Evento di studio');
    assert.equal(resumeLabel('EVENTO_STUDIO', 'EVENTO_STUDIO', translate), 'Evento di studio');
});

test('resume preserves custom titles and unknown instruments', () => {
    assert.equal(resumeLabel('EVENTO_STUDIO', 'Il mio primo esame', translate), 'Il mio primo esame');
    assert.equal(resumeLabel('EVENTO_STUDIO', 'EVENTO_STUDIO personale', translate), 'EVENTO_STUDIO personale');
    assert.equal(resumeLabel('FUTURE_TOOL', 'FUTURE_TOOL — Phase', translate), 'FUTURE_TOOL — Phase');
});
