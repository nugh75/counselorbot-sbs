import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { parsePlanInstitutionOptions, planInstitutionField } from './administration-plans.ts';

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
