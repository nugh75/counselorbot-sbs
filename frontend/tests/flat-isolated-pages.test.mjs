import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const FLAT = [
    'app/gruppo/page.tsx',
    'app/privacy/page.tsx',
    'components/council/ClassCouncilView.tsx',
    'components/privacy/ChoiceHistory.tsx',
    'components/privacy/ConsentToggles.tsx',
    'components/privacy/DocumentViewer.tsx',
    'components/privacy/SharingRevocation.tsx',
];

const MEDIUM_BUTTONS = [
    'components/forum/ForumView.tsx',
    'components/teacher/TeacherDevicesPanel.tsx',
    'components/teacher/ClassMeetingsManager.tsx',
    'components/profile/MeetingDetails.tsx',
    'components/profile/LearnerProfileCard.tsx',
    'components/teacher/ClassImageModal.tsx',
];

test('isolated pages use tokens only: no dark: variants, glass panels or raw palette colours', () => {
    for (const file of FLAT) {
        const bad = read(file).match(/dark:|glass-panel|\b(?:slate|indigo|emerald|teal)-\d|min-h-11\b|font-bold|uppercase tracking-wide/g);
        assert.equal(bad, null, `${file}: ${bad}`);
    }
});

test('buttons are the 44 px size, never sm', () => {
    for (const file of [...FLAT, ...MEDIUM_BUTTONS]) {
        assert.ok(!/size="sm"/.test(read(file)), file);
    }
});

test('the document modal uses the shared Dialog', () => {
    assert.match(read('components/privacy/DocumentViewer.tsx'), /from '@\/components\/ui\/Dialog'/);
});
