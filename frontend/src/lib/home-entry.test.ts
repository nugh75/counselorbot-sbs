import assert from 'node:assert/strict';
import test from 'node:test';
import type { Identity } from './auth';
// @ts-expect-error -- Node runs TypeScript files directly.
import { hasHomeToolEntry, homeLandingHref, instrumentStartHref } from './home-entry.ts';

const user: Identity = { authenticated: true, username: 'fixture', email: '', name: '', groups: [], is_admin: false };

test('landing prioritizes a staff role over student enrollment and keeps unrelated query parameters', () => {
    const query = new URLSearchParams('view=questionnaires&tag=one&tag=two');
    assert.equal(homeLandingHref(user, query, '#home-catalog-section'), '/profilo?tag=one&tag=two#profile-instrument-catalog');
    assert.equal(homeLandingHref({ ...user, groups: ['studenti', 'docenti'] }, query, ''), '/docente?tag=one&tag=two');
    assert.equal(homeLandingHref({ ...user, groups: ['researchers'] }, query, ''), '/docente?tag=one&tag=two');
    assert.equal(homeLandingHref({ ...user, is_admin: true }, query, ''), '/docente?tag=one&tag=two');
    assert.equal(query.get('view'), 'questionnaires');
});

test('tool entry links take precedence over the generic landing', () => {
    for (const query of ['start=QSA', 'q=QSA', 'frozen=id', 'resume=1', 'session_id=id&instrument=QSA']) {
        assert.equal(hasHomeToolEntry(new URLSearchParams(`view=home&${query}`)), true);
    }
    assert.equal(hasHomeToolEntry(new URLSearchParams('view=home&session_id=id')), false);
    assert.equal(instrumentStartHref('A+B', true), '/?start=A%2BB&from=student');
    assert.equal(instrumentStartHref('QSA'), '/?start=QSA');
});
