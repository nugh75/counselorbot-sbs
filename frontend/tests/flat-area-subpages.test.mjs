import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { teacherAreaName, teacherAreaDescription } from '../src/lib/i18n-teacher-area.ts';
import { teacherAreaImages } from '../src/lib/teacher-area.ts';

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Card flat variant drops box, shadow and background', () => {
    const card = read('components/ui/Card.tsx');
    assert.match(card, /variant === 'flat' \? 'border-t border-line py-6'/);
    assert.match(card, /variant = 'boxed'/);
});

test('area subpages use the flat Card', () => {
    for (const file of ['components/teacher/ClassSettingsPage.tsx', 'components/teacher/ClassCompilationsSection.tsx', 'components/teacher/TeacherMeetingsPage.tsx', 'components/teacher/TeacherDevicesPanel.tsx', 'components/profile/StudentClassPathsPage.tsx']) {
        const source = read(file);
        assert.match(source, /<Card [^>]*variant="flat"|<Card variant="flat"/, file);
        assert.doesNotMatch(source, /<Card(?![^>]*variant="flat")[^>]*>/, file);
    }
});

test('pages without an area header now mount it', () => {
    assert.match(read('app/docente/dispositivi/page.tsx'), /TeacherAreaPage slug="dispositivi"/);
    assert.match(read('app/docente/orientamento/page.tsx'), /TeacherAreaHeader slug="orientamento"/);
    assert.match(read('app/profilo/cambiamenti/page.tsx'), /PersonalAreaHeader slug="cambiamenti"/);
    assert.match(read('app/profilo/classi/[id]/forum/page.tsx'), /PersonalAreaHeader slug="classi"/);
});

test('dispositivi slug has name, description and image in every language', () => {
    assert.ok(teacherAreaImages.dispositivi);
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
        assert.ok(teacherAreaName(lang, 'dispositivi'));
        assert.ok(teacherAreaDescription(lang, 'dispositivi'));
    }
});

test('administrations panel is flat: plans and form use the flat Card, no nested boxes', () => {
    const source = read('components/admin/AdministrationPlansPanel.tsx');
    assert.equal([...source.matchAll(/<Card as="section" variant="flat"/g)].length, 2);
    assert.doesNotMatch(source, /<Card(?![^>]*variant="flat")[^>]*>/);
    assert.doesNotMatch(source, /rounded-lg|shadow-card|bg-brand-soft\/40|bg-surface-sunken p-4|rounded-control border border-line bg-surface p-4/);
});
