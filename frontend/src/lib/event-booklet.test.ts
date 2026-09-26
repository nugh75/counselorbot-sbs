import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { formFromDraft, isEventInstrument, milestoneFromForm } from './event-booklet.ts';

test('only the two significant-event paths offer the booklet draft', () => {
    assert.equal(isEventInstrument('EVENTO_STUDIO'), true);
    assert.equal(isEventInstrument('EVENTO_PROFESSIONALE'), true);
    assert.equal(isEventInstrument('SAVICKAS'), false);
});

test('a draft from the summary fills the form, lists one item per line', () => {
    const form = formFromDraft({
        title: 'La lezione sulle frazioni', bio_date: '2026-03-12', event_role: 'observer',
        bio_context: 'Tirocinio', strength: ['Esempi concreti', 'Tempo per provare'], growth_area: ['Poche domande'],
        discovery: 'Conta il tempo lasciato all’errore', objective: 'Cinque minuti di domande', strategy: 'Giovedì',
    });
    assert.equal(form.worked, 'Esempi concreti\nTempo per provare');
    assert.equal(form.didNotWork, 'Poche domande');
    assert.equal(form.event_role, 'observer');
});

test('without a draft the form opens empty, and an unknown role is not kept', () => {
    assert.equal(formFromDraft(null).title, '');
    assert.equal(formFromDraft({ event_role: 'boss' as never }).event_role, '');
});

test('saving turns the form into a timeline milestone and drops empty lines', () => {
    const data = milestoneFromForm({
        ...formFromDraft(null), title: '  Riunione  ', bio_date: '2026-03-12', event_role: 'observer',
        worked: 'Ordine del giorno chiaro\n\n  ', didNotWork: '', bio_context: 'Consiglio di classe',
        discovery: 'Serve un tempo per le domande', objective: 'Cinque minuti di domande', strategy: 'Giovedì',
    });
    assert.equal(data.title, 'Riunione');
    assert.equal(data.date, '2026-03-12');
    assert.deepEqual(data.review, {
        role: 'observer', worked: ['Ordine del giorno chiaro'], did_not_work: [],
        reading: 'Consiglio di classe\n\nServe un tempo per le domande', try_next: 'Cinque minuti di domande', how_when: 'Giovedì',
    });
});

test('a milestone without date or role sends null for both', () => {
    const data = milestoneFromForm({ ...formFromDraft(null), title: 'Colloquio' });
    assert.equal(data.date, null);
    assert.equal(data.review.role, null);
    assert.equal(data.review.reading, '');
});
