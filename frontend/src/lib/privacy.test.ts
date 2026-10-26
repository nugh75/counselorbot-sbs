import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { canRecordNewChoice, currentChoice, documentForPurpose, documentHref, documentKindLabelKey, formatPrivacyDate, historyEventLabelKey, historyTarget, initialSwitchState, legalBasisLabelKey, parseSharingTarget, privacyErrorKey, purposeDescription, purposeLabelKey, purposeState, sharingRows, shortHash } from './privacy.ts';
// Type-only imports are erased, so tsc accepts the extension the Node runner needs.
import type { PrivacyChoice, PrivacyDocument, PrivacyGroup, PrivacyPurpose } from './privacy.ts';

const purpose: PrivacyPurpose = {
    key: 'teacher_sharing',
    description_i18n: { it: 'Condivisione del taccuino', en: '[TO BE VALIDATED]' },
    legal_basis: 'consent',
    requires_consent: true,
    active: true,
    retention_policy_key: 'school_year',
    document_kind: 'consent_sharing',
};

const document: PrivacyDocument = {
    id: 7,
    kind: 'consent_sharing',
    version: '1.0.0',
    locale: 'it',
    content_hash: 'a'.repeat(64),
    body_ref: '/privacy/documents/7',
    published_at: '2026-10-25T08:00:00Z',
    requires_new_consent: false,
};

const group: PrivacyGroup = {
    membership_id: 3,
    group_id: 12,
    code: 'GR-ABC123',
    name: '3B',
};

const granted: PrivacyChoice = {
    purpose: 'teacher_sharing',
    target: 'share:12:teacher-pid',
    granted: true,
    choice: 'given',
    event_id: 5,
    teacher_username: 'docente.demo',
};

test('switch starts off without an explicit granted choice', () => {
    assert.equal(purposeState(purpose, null), 'unset');
    assert.equal(initialSwitchState(purpose, null), false);
    assert.equal(initialSwitchState(purpose, { ...granted, granted: false, choice: 'refused' }), false);
    assert.equal(initialSwitchState(purpose, granted), true);
    assert.equal(purposeState({ ...purpose, active: false }, granted), 'disabled');
    assert.equal(purposeState({ ...purpose, legal_basis: 'undefined' }, granted), 'disabled');
});

test('current choice is scoped by purpose and target', () => {
    const other = { ...granted, target: 'share:13:other-pid' };
    assert.equal(currentChoice([other, granted], 'teacher_sharing', 'share:12:teacher-pid')?.event_id, 5);
    assert.equal(currentChoice([granted], 'research'), null);
});

test('sharing targets parse only the documented shape', () => {
    assert.deepEqual(parseSharingTarget('share:12:pid'), { groupId: 12, teacherPid: 'pid' });
    assert.equal(parseSharingTarget('share:0:pid'), null);
    assert.equal(parseSharingTarget('share:12'), null);
    assert.equal(parseSharingTarget('legacy_client'), null);
    assert.equal(parseSharingTarget(null), null);
});

test('active sharing rows use current choices, group names and teacher username', () => {
    const rows = sharingRows([
        granted,
        { ...granted, event_id: 4, target: 'share:13:old-pid', granted: false, choice: 'withdrawn' },
        { ...granted, event_id: 3, target: 'share:99:unknown-pid', teacher_username: null },
    ], [group]);
    assert.deepEqual(rows.map((row) => [row.groupName, row.teacherUsername]), [['3B', 'docente.demo'], ['#99', null]]);
});

test('documents are chosen by the purpose document kind', () => {
    assert.equal(documentForPurpose(purpose, [document])?.id, 7);
    assert.equal(documentForPurpose({ ...purpose, document_kind: 'notice_ai' }, [document]), null);
    assert.equal(canRecordNewChoice(purpose, document), true);
    assert.equal(canRecordNewChoice({ ...purpose, active: false }, document), false);
    assert.equal(canRecordNewChoice(purpose, null), false);
});

test('label keys stay in the privacy namespace and unknown bases fall back to undefined', () => {
    assert.equal(purposeLabelKey('research'), 'privacy.purposes.purpose.research');
    assert.equal(documentKindLabelKey('notice_student'), 'privacy.documents.kind.notice_student');
    assert.equal(documentKindLabelKey('unknown'), 'privacy.documents.current');
    assert.equal(legalBasisLabelKey('consent'), 'privacy.purposes.basis.consent');
    assert.equal(legalBasisLabelKey('surprise'), 'privacy.purposes.basis.undefined');
});

test('purpose descriptions fall back and mark placeholder text', () => {
    assert.deepEqual(purposeDescription(purpose, 'it'), { text: 'Condivisione del taccuino', pending: false });
    assert.deepEqual(purposeDescription(purpose, 'fr'), { text: '[TO BE VALIDATED]', pending: true });
    assert.deepEqual(purposeDescription({ ...purpose, description_i18n: null }, 'it'), { text: '', pending: false });
});

test('only relative and http(s) document references become links', () => {
    assert.equal(documentHref('/privacy/documents/7'), '/privacy/documents/7');
    assert.equal(documentHref('https://example.test/notice'), 'https://example.test/notice');
    assert.equal(documentHref('http://example.test/notice'), 'http://example.test/notice');
    assert.equal(documentHref('javascript:alert(1)'), null);
    assert.equal(documentHref('data:text/html,hello'), null);
    assert.equal(documentHref('//evil.test/notice'), null);
    assert.equal(documentHref('archive:notice-1'), null);
});

test('error codes map to readable privacy messages', () => {
    assert.equal(privacyErrorKey(401, 'anything'), 'privacy.purposes.error.authentication_required');
    assert.equal(privacyErrorKey(403, 'privacy.errors.purpose_disabled'), 'privacy.purposes.error.purpose_disabled');
    assert.equal(privacyErrorKey(403, { error_code: 'privacy.errors.audit_unavailable' }), 'privacy.purposes.error.audit_unavailable');
    assert.equal(privacyErrorKey(500, 'boom'), 'privacy.purposes.error.generic');
});

test('history labels and targets never expose the raw sharing PID', () => {
    assert.equal(historyEventLabelKey('consent_given'), 'privacy.history.event.given');
    assert.equal(historyEventLabelKey('notice_viewed'), 'privacy.history.event.notice');
    assert.equal(historyTarget({ target: 'share:12:pid' } as never, [group]), '3B');
    assert.equal(historyTarget({ target: 'share:99:pid' } as never, [group]), '#99');
    assert.equal(historyTarget({ target: 'legacy_client' } as never, [group]), 'legacy_client');
});

test('dates and hashes format without throwing', () => {
    assert.match(formatPrivacyDate('2026-10-25T08:00:00Z', 'it'), /2026/);
    assert.equal(formatPrivacyDate('not-a-date', 'it'), '');
    assert.equal(formatPrivacyDate(null, 'it'), '');
    assert.equal(shortHash('a'.repeat(64)), `${'a'.repeat(12)}…${'a'.repeat(12)}`);
    assert.equal(shortHash('abc'), 'abc');
});
