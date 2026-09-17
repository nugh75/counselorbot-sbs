import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { bookletDataFromForm, formFromDraft, isEventInstrument } from './event-booklet.ts';

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

test('saving turns the lines back into booklet lists and drops empty lines', () => {
    const data = bookletDataFromForm({
        ...formFromDraft(null), title: '  Riunione  ', worked: 'Ordine del giorno chiaro\n\n  ', didNotWork: '',
    });
    assert.equal(data.title, 'Riunione');
    assert.deepEqual(data.strength, ['Ordine del giorno chiaro']);
    assert.deepEqual(data.growth_area, []);
});
