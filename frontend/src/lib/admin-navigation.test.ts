import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { ADMIN_CLASSES_HREF, adminTabUrl, parseAdminTab } from './admin-navigation.ts';

test('admin classes link deep-links the groups and classes tab', () => {
    const url = new URL(ADMIN_CLASSES_HREF, 'https://example.test');
    assert.equal(url.pathname, '/admin');
    assert.equal(parseAdminTab(url.search), 'groupsClasses');
});

test('unknown or missing tab falls back to null', () => {
    assert.equal(parseAdminTab(''), null);
    assert.equal(parseAdminTab('?tab=nope'), null);
    assert.equal(parseAdminTab('?section=models'), null);
});

test('tab url keeps other params and drops the default tab', () => {
    assert.equal(adminTabUrl('https://example.test/admin?section=models', 'groupsClasses'), '/admin?section=models&tab=groupsClasses');
    assert.equal(adminTabUrl('https://example.test/admin?tab=groupsClasses', 'config'), '/admin');
    assert.equal(adminTabUrl('https://example.test/admin?tab=groupsClasses', 'groupsClasses'), null);
    assert.equal(adminTabUrl('https://example.test/admin', 'config'), null);
});
