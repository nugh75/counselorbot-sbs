import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { fillTemplate, invitationMailto } from './class-invitations.ts';

test('mailto encodes recipient, subject and body', () => {
    const url = invitationMailto('anna+2a@example.test', 'Invito alla classe 2A & B', 'Apri: https://x.test/gruppo?g=GR-1&a=b');
    assert.equal(
        url,
        'mailto:anna%2B2a%40example.test?subject=Invito%20alla%20classe%202A%20%26%20B&body=Apri%3A%20https%3A%2F%2Fx.test%2Fgruppo%3Fg%3DGR-1%26a%3Db',
    );
});

test('fillTemplate replaces known placeholders and keeps unknown ones', () => {
    assert.equal(fillTemplate('{class} - {email} {other}', { class: '2A', email: 'a@b.it' }), '2A - a@b.it {other}');
});
