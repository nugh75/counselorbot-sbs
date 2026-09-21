import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error -- Node runs TypeScript files directly.
import { biographyEventsFromBooklet, bookletWithBiographyEvents } from './booklet-biography.ts';

test('legacy learning-biography fields become one event', () => {
    assert.deepEqual(biographyEventsFromBooklet({
        bio_date: '2026-09-20',
        bio_context: 'Laboratorio',
        bio_discovery: 'So chiedere aiuto',
        bio_keywords: 'collaborazione',
    }), [{
        id: 'legacy-1', date: '2026-09-20', context: 'Laboratorio',
        discovery: 'So chiedere aiuto', keywords: 'collaborazione',
    }]);
});

test('multiple biography events are preserved and mirror the first legacy entry', () => {
    const events = [
        { id: 'one', date: '2026-09-20', context: 'Laboratorio', discovery: 'Una cosa', keywords: 'uno' },
        { id: 'two', date: '2026-09-21', context: 'Tirocinio', discovery: 'Due cose', keywords: 'due' },
    ];
    const saved = bookletWithBiographyEvents({ title: 'Scheda' }, events);

    assert.deepEqual(biographyEventsFromBooklet(saved), events);
    assert.equal(saved.bio_date, '2026-09-20');
    assert.equal(saved.bio_context, 'Laboratorio');
});

test('empty editor rows are not persisted as timeline or PDF events', () => {
    const saved = bookletWithBiographyEvents({ title: 'Scheda' }, [
        { id: 'empty', date: '', context: '', discovery: '', keywords: '' },
        { id: 'kept', date: '2026-09-21', context: 'Tirocinio', discovery: '', keywords: '' },
    ]);

    assert.deepEqual(saved.bio_events.map(event => event.id), ['kept']);
    assert.equal(saved.bio_date, '2026-09-21');
});
