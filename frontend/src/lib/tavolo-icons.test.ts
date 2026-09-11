// La ricerca del selettore d'icona: cento voci si trovano per parola, non a occhio.
import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { iconUrl, matchIcons } from './tavolo-icons.ts';

const icons = [
    { id: 'brain', meaning: 'memory or reasoning', label: 'Memoria e ragionamento' },
    { id: 'clock', meaning: 'time available', label: 'Tempo disponibile' },
    { id: 'distress', meaning: 'distress', label: 'Disagio' },
];

test('an icon is addressed by its catalogue id', () => {
    assert.equal(iconUrl('brain'), '/api/diagram-icons/brain.svg');
});

test('the search reads the label and the meaning', () => {
    assert.deepEqual(matchIcons(icons, 'memoria').map((icon) => icon.id), ['brain']);
    assert.deepEqual(matchIcons(icons, 'time').map((icon) => icon.id), ['clock']);
});

test('the search ignores case and accents', () => {
    assert.deepEqual(matchIcons(icons, 'MEMÒRIA').map((icon) => icon.id), ['brain']);
});

test('an empty search keeps the whole catalogue', () => {
    assert.equal(matchIcons(icons, '  ').length, 3);
});
