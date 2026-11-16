import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { teacherAreaName, teacherAreaDescription } from '../src/lib/i18n-teacher-area.ts';
import { teacherAreaIllustrations } from '../src/lib/teacher-area.ts';

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

test('dispositivi slug has name, description and illustration in every language', () => {
    assert.ok(teacherAreaIllustrations.dispositivi);
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

test('goal catalog and teacher orientation pages are flat: no boxed rows or nested boxes, notices keep theirs', () => {
    const catalog = read('components/goals/GoalCatalogEditor.tsx');
    assert.match(catalog, /<Card as="section" variant="flat"/);
    assert.doesNotMatch(catalog, /rounded-card/);
    // Tree and map reuse the student components through the catalogGoals adapter; parents are edited in the form (#907).
    assert.match(catalog, /<GoalTree goals=\{goals\}/);
    assert.match(catalog, /<GoalMap goals=\{goals\}/);
    assert.match(catalog, /catalogGoals\(rows\)/);
    assert.match(catalog, /\/parents`, 'POST'/);
    assert.match(catalog, /role="alert"[^>]*>\{l\('cycle'\)\}/);
    const orientation = read('app/docente/orientamento/page.tsx');
    assert.doesNotMatch(orientation, /rounded-card border border-line(?! bg-surface p-2)/);
    assert.doesNotMatch(orientation, /<form className="[^"]*rounded-card/);
    assert.match(orientation, /<Callout variant="warning">/);
});

test('student plans are flat: flat Card, step rows without boxes, FlowStepper colours and a status line (#918)', () => {
    const hero = read('components/profile/ClassPathHeroCard.tsx');
    assert.match(hero, /<Card\s+as="section"\s+variant="flat"/);
    assert.doesNotMatch(hero, /<Card(?![^>]*variant="flat")[^>]*>/);
    assert.doesNotMatch(hero, /rounded-card|shadow-card|bg-brand-soft|ring-brand-line|bg-surface-sunken p-2/);
    assert.match(hero, /divide-y divide-line/);
    assert.match(hero, /bg-ochre-600/);
    assert.match(hero, /bg-indigo-600/);
    assert.match(hero, /data-step-status/);
    assert.match(hero, /id=\{`class-step-\$\{step\.id\}`\}/);
    // #989: one «To do now» block, plain wording, no uppercase eyebrow, no [n], no percentage, no faded rows.
    assert.match(hero, /data-testid="class-path-do-now"/);
    assert.match(hero, /l\('assignedEyebrow'\)/);
    assert.match(hero, /next_step_id/);
    assert.doesNotMatch(hero, /uppercase|\[\$\{stepNumber\}\]|progressPercent\}%`\}<|opacity-60|piano\.builder\.independentSteps|sourceAutomatic/);
    assert.match(read('components/administration/PlanChatCompleted.tsx'), /<Card variant="flat"/);
    assert.match(read('components/profile/PersonalAreaHome.tsx'), /<Callout variant="danger">/);
    assert.match(read('components/profile/PersonalAreaHome.tsx'), /<ClassPathHeroList[^>]*nextOnly/);
    const flow = read('components/profile/PlanActivityFlow.tsx');
    assert.doesNotMatch(flow, /rounded-card border border-line bg-surface p-4/);
    assert.match(flow, /<Callout variant="danger">/);
});

test('teacher operational plans page is flat and uses the shared form primitives (#950)', () => {
    for (const file of ['ClassPathsTab', 'PathTemplatesPanel', 'ClassPathProgress', 'TeacherClassPathsPage']) {
        const source = read(`components/teacher/${file}.tsx`);
        assert.doesNotMatch(source, /<Card(?![^>]*variant="flat")[^>]*>/, file);
        assert.doesNotMatch(source, /rounded-card border/, file);
        assert.doesNotMatch(source, /border border-line-strong/, file);
        assert.doesNotMatch(source, /<(select|textarea)[\s>]/, file);
    }
    assert.match(read('components/teacher/ClassPathsTab.tsx'), /<StatusBadge tone=/);
    assert.match(read('components/teacher/ClassPathProgress.tsx'), /<Callout icon=\{null\}>/);
});

test('student and teacher areas share one breadcrumb row; PageHeader puts the back link above the title', () => {
    const shared = read('components/ui/AreaBreadcrumbs.tsx');
    assert.match(shared, /aria-current="page"/);
    assert.match(shared, /<nav\s/);
    assert.match(shared, /<ol /);
    assert.match(read('components/teacher/TeacherBreadcrumbs.tsx'), /<AreaBreadcrumbs [^>]*testId="teacher-breadcrumbs"/);
    assert.match(read('components/profile/PersonalAreaHeader.tsx'), /<AreaBreadcrumbs/);
    assert.doesNotMatch(read('app/profilo/page.tsx'), /backHref="\/"/);
    const header = read('components/ui/PageHeader.tsx');
    assert.ok(header.indexOf('PreviousPageButton variant') < header.indexOf('<h1'));
    assert.match(header, /className="space-y-2"/);
});
