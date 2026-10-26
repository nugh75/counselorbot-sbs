import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { parsePlanInstitutionOptions, planIdFromHash, planInstitutionField } from './administration-plans.js';

test('institution options must carry identity and readiness, never credentials', () => {
    assert.throws(() => parsePlanInstitutionOptions({ detail: 'forbidden' }));
    assert.throws(() => parsePlanInstitutionOptions([{ id: 1, name: 'Synthetic' }]));
    const rows = parsePlanInstitutionOptions([{ id: 1, name: 'Synthetic', institution_code: 'SYN-149', credentials_configured: true }]);
    assert.deepEqual(rows, [{ id: 1, name: 'Synthetic', institution_code: 'SYN-149', credentials_configured: true }]);
});

test('new plans always send an explicit institute choice', () => {
    assert.deepEqual(planInstitutionField('', null, false), { institution_id: null });
    assert.deepEqual(planInstitutionField('4', null, false), { institution_id: 4 });
});

test('edits send the institute only when changed or when reconciliation is explicitly confirmed', () => {
    const linked = { institution_id: 4, institution_link_state: 'linked' };
    assert.deepEqual(planInstitutionField('4', linked, false), {});
    assert.deepEqual(planInstitutionField('', linked, false), { institution_id: null });
    const pending = { institution_id: 4, institution_link_state: 'needs_reconciliation' };
    // Saving unrelated fields must not silently resolve a legacy reconciliation.
    assert.deepEqual(planInstitutionField('4', pending, false), {});
    assert.deepEqual(planInstitutionField('4', pending, true), { institution_id: 4 });
    assert.deepEqual(planInstitutionField('', pending, true), { institution_id: null });
});

test('classroom links address one plan of the research view by hash', () => {
    assert.equal(planIdFromHash('#plan-12'), 12);
    assert.equal(planIdFromHash('#plan-'), null);
    assert.equal(planIdFromHash('#plan-12x'), null);
    assert.equal(planIdFromHash(''), null);
});

// @ts-expect-error -- Node runs TypeScript files directly.
import { changePlanArchive } from './administration-plans.js';

test('archive flow asks confirmation, cancels without writes, and restores as planned', async () => {
    const calls: {url: string; body: unknown}[] = [];
    const request = async (url: string, init: RequestInit) => {
        calls.push({url, body: JSON.parse(String(init.body))});
        return new Response('{}');
    };
    const plan = {id: 7, revision: 3, status: 'active'};
    assert.equal(await changePlanArchive(plan, () => false, request), 'cancelled');
    assert.equal(calls.length, 0);
    assert.equal(await changePlanArchive(plan, () => true, request), 'saved');
    assert.deepEqual(calls[0], {url: '/api/admin/administration-plans/7', body: {revision: 3, status: 'archived'}});
    await changePlanArchive({...plan, status: 'archived', revision: 4}, () => true, request);
    assert.deepEqual(calls[1].body, {revision: 4, status: 'planned'});
    assert.equal(await changePlanArchive(plan, () => true, async () => new Response('{}', {status: 409})), 'conflict');
    await assert.rejects(changePlanArchive(plan, () => true, async () => new Response('{}', {status: 403})));
});

// @ts-expect-error -- Node runs TypeScript files directly.
import { replacePlan } from './administration-plans.js';

test('replacement confirmation sends a single atomic request and keeps the chosen draft on failures', async () => {
    const source = {id: 7, revision: 3, status: 'active'};
    const replacement = {title: 'New plan', instrument_code: 'ZTPI', status: 'active'};
    let calls = 0;
    const request = async (url: string, init: RequestInit) => {
        calls++;
        assert.equal(url, '/api/admin/administration-plans/7/replace');
        assert.equal(init.method, 'POST');
        assert.deepEqual(JSON.parse(String(init.body)), {revision: 3, replacement});
        return new Response('{}', {status: 409});
    };
    assert.equal(await replacePlan(source, replacement, () => false, request), null);
    assert.equal(calls, 0);
    const response = await replacePlan(source, replacement, () => true, request);
    assert.equal(response?.status, 409);
    assert.equal(calls, 1);
    assert.equal(source.status, 'active');
    assert.equal(replacement.title, 'New plan');
    await assert.rejects(replacePlan(source, replacement, () => true, async () => {throw new Error('offline');}));
});
