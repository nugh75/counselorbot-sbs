import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { isToolAllowed, fetchUserAccess, getCachedUserAccess, clearUserAccessCache, type UserAccess } from './user-access.ts';

function withStorage(impl: Record<string, unknown> | undefined, run: () => void | Promise<void>) {
    const kept = (globalThis as { sessionStorage?: unknown }).sessionStorage;
    (globalThis as { sessionStorage?: unknown }).sessionStorage = impl;
    try {
        const res = run();
        if (res && typeof (res as Promise<void>).then === 'function') {
            return (res as Promise<void>).finally(() => {
                (globalThis as { sessionStorage?: unknown }).sessionStorage = kept;
            });
        }
    } finally {
        if (!impl || !(globalThis as { sessionStorage?: unknown }).sessionStorage) {
            (globalThis as { sessionStorage?: unknown }).sessionStorage = kept;
        }
    }
}

function memoryStorage() {
    const store: Record<string, string> = {};
    return {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
        key: (idx: number) => Object.keys(store)[idx] ?? null,
        get length() { return Object.keys(store).length; },
    };
}

test('isToolAllowed allows all when access is null or unrestricted', () => {
    assert.equal(isToolAllowed(null, 'QSA'), true);
    assert.equal(isToolAllowed(undefined, 'QSA'), true);

    const unrestricted: UserAccess = {
        restricted: false,
        tool_keys: [],
        counselor_ids: null,
        default_counselor_id: null,
        class_ids: [],
    };
    assert.equal(isToolAllowed(unrestricted, 'QSA'), true);
    assert.equal(isToolAllowed(unrestricted, 'SAVICKAS'), true);
    assert.equal(isToolAllowed(unrestricted, 'ANY_CUSTOM_TOOL'), true);
});

test('isToolAllowed filters tools when access is restricted', () => {
    const restricted: UserAccess = {
        restricted: true,
        tool_keys: ['QSA', 'IDEA', 'notebook'],
        counselor_ids: [1, 2],
        default_counselor_id: 1,
        class_ids: [10],
    };
    assert.equal(isToolAllowed(restricted, 'QSA'), true);
    assert.equal(isToolAllowed(restricted, 'IDEA'), true);
    assert.equal(isToolAllowed(restricted, 'ZTPI'), false);
    assert.equal(isToolAllowed(restricted, 'SAVICKAS'), false);
});

test('getCachedUserAccess returns stored access from sessionStorage', () => {
    const store = memoryStorage();
    withStorage(store, () => {
        clearUserAccessCache();
        assert.equal(getCachedUserAccess(), null);

        const data: UserAccess = {
            restricted: true,
            tool_keys: ['QSA'],
            counselor_ids: null,
            default_counselor_id: null,
            class_ids: [1],
        };
        store.setItem('cb_user_access_self', JSON.stringify(data));
        assert.deepEqual(getCachedUserAccess(), data);

        clearUserAccessCache();
        assert.equal(getCachedUserAccess(), null);
    });
});

test('fetchUserAccess caches results in sessionStorage once fetched', async () => {
    const store = memoryStorage();
    await withStorage(store, async () => {
        clearUserAccessCache();
        let fetchCount = 0;
        const fakeData: UserAccess = {
            restricted: true,
            tool_keys: ['QSA', 'SAVICKAS'],
            counselor_ids: null,
            default_counselor_id: null,
            class_ids: [5],
        };

        const originalFetch = globalThis.fetch;
        (globalThis as { fetch: typeof originalFetch }).fetch = (async () => {
            fetchCount++;
            return {
                ok: true,
                status: 200,
                json: async () => fakeData,
            } as Response;
        }) as typeof originalFetch;

        try {
            const first = await fetchUserAccess();
            assert.deepEqual(first, fakeData);
            assert.equal(fetchCount, 1);

            // Second fetch should use the cached session value, not triggering network call
            const second = await fetchUserAccess();
            assert.deepEqual(second, fakeData);
            assert.equal(fetchCount, 1);
        } finally {
            (globalThis as { fetch: typeof originalFetch }).fetch = originalFetch;
            clearUserAccessCache();
        }
    });
});
