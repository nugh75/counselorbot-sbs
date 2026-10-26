import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isShellInternalPath } from './shell-internal.ts';

test('blocks the backend shell-only routes behind the /api rewrite', () => {
    for (const path of ['/api/internal', '/api/internal/', '/api/internal/ping', '/API/Internal/ping', '//api//internal/x', '/api/%69nternal/ping']) {
        assert.equal(isShellInternalPath(path), true, path);
    }
});

test('leaves the other api routes alone', () => {
    for (const path of ['/api/internals', '/api/chat/stream', '/internal/ping', '/api/admin/internal']) {
        assert.equal(isShellInternalPath(path), false, path);
    }
});
