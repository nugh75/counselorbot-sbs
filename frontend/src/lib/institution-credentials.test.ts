import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { contextFailure, credentialDraftError, credentialPayload, parseVerificationGrant, verificationRequest, verifyFailure, withInstitutionGrant } from './institution-credentials.ts';

const SECRET = ' Synthetic-Pass 149 ';

test('credential payload trims only the code and never transforms the password', () => {
    assert.deepEqual(credentialPayload(' SYN-149 ', SECRET, 3), { institution_code: 'SYN-149', password: SECRET, revision: 3 });
});

test('credential drafts reject invalid codes and empty or over-long passwords before sending', () => {
    assert.equal(credentialDraftError('SYN-149', SECRET), null);
    assert.equal(credentialDraftError('bad code!', SECRET), 'code');
    assert.equal(credentialDraftError('', SECRET), 'code');
    assert.equal(credentialDraftError('SYN-149', ''), 'password');
    // 74 UTF-8 bytes exceed the verifier limit even though they are 37 characters.
    assert.equal(credentialDraftError('SYN-149', 'é'.repeat(37)), 'password');
});

test('only a server verification requirement with a plan id opens the verification form', () => {
    const detail = { code: 'institution_verification_required', administration_plan_id: 7, institution_name: 'Synthetic', institution_code: 'SYN-149' };
    assert.deepEqual(verificationRequest(403, { detail }), { planId: 7, institutionName: 'Synthetic', institutionCode: 'SYN-149' });
    for (const code of ['institution_grant_expired', 'institution_grant_mismatch', 'institution_grant_invalid']) {
        assert.equal(verificationRequest(403, { detail: { code, administration_plan_id: 7 } })?.planId, 7);
    }
    assert.equal(verificationRequest(403, { detail: 'Accesso negato' }), null);
    assert.equal(verificationRequest(409, { detail }), null);
    assert.equal(verificationRequest(403, { detail: { code: 'institution_verification_required', administration_plan_id: '7' } }), null);
});

test('unavailable administration contexts are reported instead of falling back to a standalone save', () => {
    for (const code of ['administration_needs_reconciliation', 'institution_credentials_missing', 'institution_inactive', 'administration_instrument_mismatch']) {
        assert.equal(contextFailure({ detail: { code } }), 'unavailable');
    }
    assert.equal(contextFailure({ detail: 'other' }), null);
});

test('verification failures map to distinct actionable states', () => {
    assert.equal(verifyFailure(403, { detail: 'institution_verification_failed' }), 'failed');
    assert.equal(verifyFailure(429, { detail: 'institution_verification_throttled' }), 'throttled');
    assert.equal(verifyFailure(409, { detail: 'institution_credentials_missing' }), 'unavailable');
    assert.equal(verifyFailure(500, null), 'error');
});

test('the grant travels at the top level of the body, never in persisted research metadata', () => {
    const body = { session_id: 's', response_metadata: { study_code: 'AP-149' } };
    const sent = withInstitutionGrant(body, 'grant-149');
    assert.equal(sent.institution_grant, 'grant-149');
    assert.deepEqual(sent.response_metadata, { study_code: 'AP-149' });
    assert.equal('institution_grant' in withInstitutionGrant(body, null), false);
});

test('grant responses are validated before use', () => {
    assert.throws(() => parseVerificationGrant({ grant: '' }));
    const parsed = parseVerificationGrant({ grant: 'g'.repeat(43), expires_at: '2026-10-09T10:00:00Z', institution: { id: 1, name: 'Synthetic', institution_code: 'SYN-149' } });
    assert.equal(parsed.grant.length, 43);
});
