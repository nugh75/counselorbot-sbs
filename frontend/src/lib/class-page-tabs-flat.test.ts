import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// #957: every tab of the teacher class page is flat like the Plans tab.
const read = (path: string) => readFileSync(new URL(`../components/teacher/${path}`, import.meta.url), 'utf8');

const FILES = [
    'ClassOverviewTab.tsx', 'OrientationTab.tsx', 'ClassNoticingTab.tsx', 'ClassCouncilTab.tsx',
    'ClassStudentsTab.tsx', 'ClassEmailInvitations.tsx', 'ClassSettingsAudit.tsx', 'ClassImageModal.tsx',
    'ClassCompilationsSection.tsx', 'ClassPairingSection.tsx',
];

test('class page tabs have no boxed Card, hand-made field or pill', () => {
    for (const file of FILES) {
        const source = read(file);
        const bad = source.match(/<Card(?![^>]*variant="flat")[\s>]|<(?:select|textarea)\b|<input(?![^>]*type="(?:checkbox|file)")\b|rounded-full px-|outline-none|font-bold|font-medium|fixed inset-0|shadow-card|\b(?:slate|indigo|teal|sky)-\d|dark:/g);
        assert.equal(bad, null, `${file}: ${bad}`);
    }
});

test('role sections are flat with a role badge, the audit is a ruled list, the modals use Dialog', () => {
    assert.match(read('ClassStudentsTab.tsx'), /<RoleBadge role="student">/);
    assert.match(read('ClassEmailInvitations.tsx'), /<RoleBadge role="teacher">/);
    assert.doesNotMatch(read('ClassEmailInvitations.tsx'), /bg-role-teacher-soft/);
    assert.match(read('ClassSettingsAudit.tsx'), /divide-y divide-line/);
    assert.match(read('ClassImageModal.tsx'), /from '@\/components\/ui\/Dialog'/);
    assert.match(read('ClassOverviewTab.tsx'), /from '@\/components\/ui\/Dialog'/);
});
