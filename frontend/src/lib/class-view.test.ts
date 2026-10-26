import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { classViewOptions, currentClassView, parseClassView, saveClassView } from './class-view.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { clearUserAccessCache, getCachedUserAccess, type UserAccess } from './user-access.ts';

const base: UserAccess = {
    restricted: true,
    tool_keys: ['QSA'],
    counselor_ids: [1],
    default_counselor_id: null,
    class_ids: [10],
    view: 'classes',
    classes: [{ id: 10, name: '3B' }],
};

test('no selector without classes (no class, staff, old payload)', () => {
    assert.deepEqual(classViewOptions(null), []);
    assert.deepEqual(classViewOptions({ ...base, restricted: false, class_ids: [], classes: [] }), []);
    const legacy: UserAccess = { ...base };
    delete legacy.classes;
    delete legacy.view;
    assert.deepEqual(classViewOptions(legacy), []);
});

test('one class: full view and that class (the class view itself)', () => {
    assert.deepEqual(classViewOptions(base), [
        { value: 'all', kind: 'all' },
        { value: 'classes', kind: 'class', name: '3B' },
    ]);
});

test('several classes: full view, all my classes, then each class', () => {
    const access = { ...base, class_ids: [10, 11], classes: [{ id: 10, name: '3B' }, { id: 11, name: 'Lab' }] };
    assert.deepEqual(classViewOptions(access), [
        { value: 'all', kind: 'all' },
        { value: 'classes', kind: 'classes' },
        { value: '10', kind: 'class', name: '3B' },
        { value: '11', kind: 'class', name: 'Lab' },
    ]);
});

test('current view maps to a select value; a single class always reads as the class view', () => {
    assert.equal(currentClassView(base), 'classes');
    assert.equal(currentClassView({ ...base, view: 'all', restricted: false }), 'all');
    assert.equal(currentClassView({ ...base, view: 10 }), 'classes');
    const several = { ...base, view: 11, class_ids: [10, 11], classes: [{ id: 10, name: '3B' }, { id: 11, name: 'Lab' }] };
    assert.equal(currentClassView(several), '11');
    assert.equal(currentClassView(null), 'classes');
});

test('parseClassView turns a select value into the API payload', () => {
    assert.equal(parseClassView('all'), 'all');
    assert.equal(parseClassView('classes'), 'classes');
    assert.equal(parseClassView('11'), 11);
});

test('saveClassView stores server side, refreshes the cache and notifies listeners', async () => {
    clearUserAccessCache();
    const answer: UserAccess = { ...base, restricted: false, view: 'all', counselor_ids: null };
    const calls: { url: string; init?: RequestInit }[] = [];
    const events: unknown[] = [];
    const originalFetch = globalThis.fetch;
    const originalWindow = (globalThis as { window?: unknown }).window;
    const target = new EventTarget();
    (globalThis as { window?: unknown }).window = Object.assign(target, {
        localStorage: undefined,
        location: { search: '' },
        sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 },
    });
    target.addEventListener('cb-user-access-changed', (event) => events.push((event as CustomEvent).detail));
    (globalThis as { fetch: typeof originalFetch }).fetch = (async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return { ok: true, status: 200, json: async () => answer } as Response;
    }) as typeof originalFetch;
    try {
        const result = await saveClassView('all');
        assert.deepEqual(result, answer);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, '/api/user/access/view');
        assert.equal(calls[0].init?.method, 'PUT');
        assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { view: 'all' });
        assert.deepEqual(getCachedUserAccess(), answer);
        assert.deepEqual(events, [answer]);
    } finally {
        (globalThis as { fetch: typeof originalFetch }).fetch = originalFetch;
        (globalThis as { window?: unknown }).window = originalWindow;
        clearUserAccessCache();
    }
});

test('saveClassView reports a refused choice', async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as { fetch: typeof originalFetch }).fetch = (async () =>
        ({ ok: false, status: 400, json: async () => ({ detail: 'class_not_joined' }) }) as Response) as typeof originalFetch;
    try {
        await assert.rejects(saveClassView(99), /class_not_joined/);
    } finally {
        (globalThis as { fetch: typeof originalFetch }).fetch = originalFetch;
    }
});
