import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { canManageInstitutes } from './roles.ts';

const identity = (extra: object) => ({ authenticated: true, is_admin: false, email: '', username: 'user', name: 'User', groups: [] as string[], ...extra });

test('teachers and administrators manage institutes from the teacher area', () => {
    assert.equal(canManageInstitutes(identity({ groups: ['docenti'] })), true);
    assert.equal(canManageInstitutes(identity({ is_admin: true, groups: ['admins'] })), true);
});

test('researchers, students and anonymous visitors do not', () => {
    assert.equal(canManageInstitutes(identity({ is_researcher: true, groups: ['researchers'] })), false);
    assert.equal(canManageInstitutes(identity({ groups: ['studenti'] })), false);
    assert.equal(canManageInstitutes(null), false);
});
