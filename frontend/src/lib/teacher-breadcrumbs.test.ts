import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { getClassBreadcrumbs, getTeacherBreadcrumbsForSlug } from './teacher-breadcrumbs.js';
// @ts-expect-error -- Node runs TypeScript files directly.
import { teacherAreaSlugs } from './teacher-area.js';
import type { Lang } from './i18n.js';

const languages: readonly Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];

test('every teacher area slug generates valid breadcrumbs starting with Area docenti root', () => {
    for (const slug of teacherAreaSlugs) {
        for (const lang of languages) {
            const items = getTeacherBreadcrumbsForSlug(slug, lang);
            assert.ok(items.length >= 2, `slug ${slug} should have at least 2 breadcrumb items in ${lang}`);

            // First item is always Area docenti pointing to /docente
            assert.equal(items[0].href, '/docente');
            assert.ok(items[0].label && items[0].label.trim().length > 0);

            // Last item is always current page without href
            const last = items[items.length - 1];
            assert.equal(last.current, true);
            assert.equal(last.href, undefined);
            assert.ok(last.label && last.label.trim().length > 0);

            // Every item has valid label
            for (const item of items) {
                assert.ok(item.label && item.label.trim().length > 0, `empty label in ${slug} for ${lang}`);
            }
        }
    }
});

test('strategie and materiali produce 3-level breadcrumbs under Risorse didattiche', () => {
    for (const lang of languages) {
        const stratItems = getTeacherBreadcrumbsForSlug('strategie', lang);
        assert.equal(stratItems.length, 3);
        assert.equal(stratItems[0].href, '/docente');
        assert.equal(stratItems[1].href, '/docente/risorse');
        assert.equal(stratItems[2].current, true);

        const matItems = getTeacherBreadcrumbsForSlug('materiali', lang);
        assert.equal(matItems.length, 3);
        assert.equal(matItems[0].href, '/docente');
        assert.equal(matItems[1].href, '/docente/risorse');
        assert.equal(matItems[2].current, true);
    }
});

test('taccuini-prova produces 3-level breadcrumbs under Palestra di prova', () => {
    for (const lang of languages) {
        const items = getTeacherBreadcrumbsForSlug('taccuini-prova', lang);
        assert.equal(items.length, 3);
        assert.equal(items[0].href, '/docente');
        assert.equal(items[1].href, '/docente/palestra');
        assert.equal(items[2].current, true);
    }
});

test('catalogo-obiettivi and percorsi produce direct 2-level breadcrumbs', () => {
    for (const lang of languages) {
        const goalItems = getTeacherBreadcrumbsForSlug('catalogo-obiettivi', lang);
        assert.equal(goalItems.length, 2);
        assert.equal(goalItems[0].href, '/docente');
        assert.equal(goalItems[1].current, true);

        const pathItems = getTeacherBreadcrumbsForSlug('piani-operativi', lang);
        assert.equal(pathItems.length, 2);
        assert.equal(pathItems[0].href, '/docente');
        assert.equal(pathItems[1].current, true);
    }
});

test('computeClassSwitchUrl preserves active tabs and handles overview properly', async () => {
    // @ts-expect-error -- Node runs TypeScript files directly.
    const { computeClassSwitchUrl, getActiveSwitchGroups } = await import('./teacher-quick-switcher.ts');

    assert.equal(computeClassSwitchUrl(42), '/docente/classi/42');
    assert.equal(computeClassSwitchUrl(42, 'overview'), '/docente/classi/42');
    assert.equal(computeClassSwitchUrl(42, 'students'), '/docente/classi/42?tab=students');
    assert.equal(computeClassSwitchUrl(42, 'toolsTab'), '/docente/classi/42?tab=toolsTab');
    assert.equal(computeClassSwitchUrl(42, 'paths'), '/docente/classi/42?tab=paths');

    const sampleGroups = [
        { id: 1, name: '3A', is_active: true, code: 'C1', school: null, school_level: null, institution_id: null, description: null, methodologies: null, context_visible_to_students: false, owner_username: 'u1', members_count: 5, created_at: null },
        { id: 2, name: '3B (archiviata)', is_active: false, code: 'C2', school: null, school_level: null, institution_id: null, description: null, methodologies: null, context_visible_to_students: false, owner_username: 'u1', members_count: 0, created_at: null },
        { id: 3, name: '4A', is_active: true, code: 'C3', school: null, school_level: null, institution_id: null, description: null, methodologies: null, context_visible_to_students: false, owner_username: 'u1', members_count: 12, created_at: null },
    ];

    const active = getActiveSwitchGroups(sampleGroups);
    assert.equal(active.length, 2);
    assert.deepEqual(active.map((g: { id: number }) => g.id), [1, 3]);
    assert.deepEqual(getActiveSwitchGroups(undefined), []);

    // Custom basePath support (e.g. /admin/classi)
    assert.equal(computeClassSwitchUrl(42, undefined, '/admin/classi'), '/admin/classi/42');
    assert.equal(computeClassSwitchUrl(42, 'overview', '/admin/classi'), '/admin/classi/42');
    assert.equal(computeClassSwitchUrl(42, 'students', '/admin/classi'), '/admin/classi/42?tab=students');
    assert.equal(computeClassSwitchUrl(42, 'toolsTab', '/admin/classi'), '/admin/classi/42?tab=toolsTab');
    assert.equal(computeClassSwitchUrl(42, 'paths', '/admin/classi'), '/admin/classi/42?tab=paths');
});

test('getClassBreadcrumbs generates correct hierarchy for teacher and admin routes', () => {
    for (const lang of languages) {
        // Teacher route overview: [Area docenti, Classe 3A]
        const teacherOverview = getClassBreadcrumbs('Classe 3A', 10, 'overview', lang, false);
        assert.equal(teacherOverview.length, 2);
        assert.equal(teacherOverview[0].href, '/docente');
        assert.equal(teacherOverview[1].label, 'Classe 3A');
        assert.equal(teacherOverview[1].href, undefined);
        assert.equal(teacherOverview[1].current, true);

        // Teacher route sub-tab: [Area docenti, Classe 3A (link), Tab]
        const teacherStudents = getClassBreadcrumbs('Classe 3A', 10, 'students', lang, false);
        assert.equal(teacherStudents.length, 3);
        assert.equal(teacherStudents[0].href, '/docente');
        assert.equal(teacherStudents[1].label, 'Classe 3A');
        assert.equal(teacherStudents[1].href, '/docente/classi/10');
        assert.equal(teacherStudents[1].current, false);
        assert.equal(teacherStudents[2].current, true);
        assert.ok(teacherStudents[2].label && teacherStudents[2].label.trim().length > 0);

        // Admin route overview: [Dashboard Admin, Classi, Classe 3A]
        const adminOverview = getClassBreadcrumbs('Classe 3A', 10, 'overview', lang, true);
        assert.equal(adminOverview.length, 3);
        assert.equal(adminOverview[0].href, '/admin');
        assert.ok(adminOverview[0].label && adminOverview[0].label.trim().length > 0);
        assert.equal(adminOverview[1].href, '/admin?tab=groupsClasses');
        assert.ok(adminOverview[1].label && adminOverview[1].label.trim().length > 0);
        assert.equal(adminOverview[2].label, 'Classe 3A');
        assert.equal(adminOverview[2].href, undefined);
        assert.equal(adminOverview[2].current, true);

        // Admin route sub-tab: [Dashboard Admin, Classi, Classe 3A (link), Tab]
        for (const subTab of ['students', 'toolsTab', 'paths', 'forum', 'audit'] as const) {
            const adminTab = getClassBreadcrumbs('Classe 3A', 10, subTab, lang, true);
            assert.equal(adminTab.length, 4);
            assert.equal(adminTab[0].href, '/admin');
            assert.equal(adminTab[1].href, '/admin?tab=groupsClasses');
            assert.equal(adminTab[2].label, 'Classe 3A');
            assert.equal(adminTab[2].href, '/admin/classi/10');
            assert.equal(adminTab[2].current, false);
            assert.equal(adminTab[3].current, true);
            assert.ok(adminTab[3].label && adminTab[3].label.trim().length > 0);
        }

        // Fallback name when empty
        const fallback = getClassBreadcrumbs('', 10, 'overview', lang, false);
        assert.ok(fallback[1].label && fallback[1].label.trim().length > 0);
    }
});

