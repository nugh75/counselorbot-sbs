import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { activityToolHref, parseActivityTools } from './activity-tools.ts';

test('activity tools open their page, embedded inside the popup', () => {
    assert.equal(activityToolHref('goals'), '/profilo/obiettivi');
    assert.equal(activityToolHref('tavolo', true), '/profilo/tavolo?embedded=1');
});

test('only known tools are kept; availability defaults to true', () => {
    assert.deepEqual(parseActivityTools([{ key: 'tavolo' }, { key: 'timeline', available: false }, { key: 'QSA' }, null]),
        [{ key: 'tavolo', available: true }, { key: 'timeline', available: false }]);
    assert.deepEqual(parseActivityTools(undefined), []);
});
