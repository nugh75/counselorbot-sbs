import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { getTeacherBreadcrumbsForSlug } from './teacher-breadcrumbs.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { teacherAreaSlugs } from './teacher-area.ts';
import type { Lang } from './i18n.ts';

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

        const pathItems = getTeacherBreadcrumbsForSlug('percorsi', lang);
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
});

