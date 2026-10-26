import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAdminTavoloImages } from './tavolo-images.ts';

const image = { id: 'a', name: 'Studio', usage: 'Scrivania', original_name: 'a.png', created_by: 'admin', url: '/x' };

test('the admin catalog reads the images list the backend wraps in an object', () => {
    assert.deepEqual(parseAdminTavoloImages({ images: [image] }), [image]);
});

test('an unexpected admin catalog body becomes an empty list instead of crashing the page', () => {
    assert.deepEqual(parseAdminTavoloImages({}), []);
    assert.deepEqual(parseAdminTavoloImages({ images: 'none' }), []);
    assert.deepEqual(parseAdminTavoloImages(null), []);
    assert.deepEqual(parseAdminTavoloImages({ images: [image, null, 'x'] }), [image]);
});
