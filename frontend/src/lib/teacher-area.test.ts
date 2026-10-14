import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { teacherAreaSlugs, teacherAreaGroups, teacherAreaImages } from './teacher-area.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { teacherAreaName, teacherAreaDescription } from './i18n-teacher-area.ts';
import type { Lang } from './i18n.ts';

const languages: readonly Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];

test('classroom group includes compilazioni alongside classes and assignments', () => {
    const classroomGroup = teacherAreaGroups.find(g => g.id === 'classroom');
    assert.ok(classroomGroup, 'classroom group exists');
    assert.ok(classroomGroup.slugs.includes('compilazioni'), 'compilazioni is in classroom group');
    assert.ok(classroomGroup.slugs.includes('classi'), 'classi is in classroom group');
    assert.ok(classroomGroup.slugs.includes('assegnazioni'), 'assegnazioni is in classroom group');
});

test('every teacher area slug has an associated platform image', () => {
    for (const slug of teacherAreaSlugs) {
        assert.ok(teacherAreaImages[slug], `missing image for ${slug}`);
        assert.ok(teacherAreaImages[slug].startsWith('/images/'), `image path invalid for ${slug}`);
    }
});

test('every teacher area slug has localized name and description across all 6 languages', () => {
    for (const slug of teacherAreaSlugs) {
        for (const lang of languages) {
            const name = teacherAreaName(lang, slug);
            assert.ok(name && name.trim().length > 0, `missing name for ${slug} in ${lang}`);
            const desc = teacherAreaDescription(lang, slug);
            assert.ok(desc && desc.trim().length > 0, `missing description for ${slug} in ${lang}`);
        }
    }
});

test('didactic design hero and workflow labels are fully localized across all 6 languages', async () => {
    // @ts-expect-error -- Node runs TypeScript files directly.
    const { teacherAreaText } = await import('./i18n-teacher-area.ts');
    const didacticKeys = [
        'didacticDesign',
        'didacticDesignBadge',
        'didacticDesignPrimaryTitle',
        'didacticDesignPrimaryDescription',
        'didacticDesignPrimaryCta',
        'didacticDesignBloomTag',
        'didacticDesignSmartTag',
        'didacticDesignAlignmentTag',
        'didacticDesignWorkflowNote',
        'didacticDesignWorkflowDescription',
        'didacticDesignCatalogLink',
        'didacticDesignCatalogDesc',
        'didacticDesignPathsLink',
        'didacticDesignPathsDesc',
    ] as const;

    for (const key of didacticKeys) {
        for (const lang of languages) {
            const val = teacherAreaText(lang, key);
            assert.ok(val && val.trim().length > 0, `missing label ${key} in ${lang}`);
        }
    }
});

test('my classes dashboard section labels are fully localized across all 6 languages', async () => {
    // @ts-expect-error -- Node runs TypeScript files directly.
    const { teacherAreaText } = await import('./i18n-teacher-area.ts');
    const myClassesKeys = [
        'myClassesTitle',
        'myClassesSubtitle',
        'myClassesManageAll',
        'myClassesOpenHub',
        'myClassesStudents',
        'myClassesStudentSingle',
        'myClassesInviteCode',
        'myClassesEmptyTitle',
        'myClassesEmptyDescription',
        'myClassesCreateFirst',
        'myClassesError',
        'myClassesRetry',
        'myClassesLoading',
        'myClassesActiveBadge',
    ] as const;

    for (const key of myClassesKeys) {
        for (const lang of languages) {
            const val = teacherAreaText(lang, key);
            assert.ok(val && val.trim().length > 0, `missing label ${key} in ${lang}`);
        }
    }
});

test('catalogs group contains only standard catalog slugs', () => {
    const catalogsGroup = teacherAreaGroups.find(g => g.id === 'catalogs');
    assert.ok(catalogsGroup, 'catalogs group exists');
    assert.deepEqual([...catalogsGroup.slugs], ['catalogo-obiettivi', 'strategie', 'materiali']);
});

test('practice gym and teacher profile labels are fully localized across all 6 languages', async () => {
    // @ts-expect-error -- Node runs TypeScript files directly.
    const { teacherAreaText } = await import('./i18n-teacher-area.ts');
    const gymKeys = [
        'practiceGymTitle',
        'practiceGymBadge',
        'practiceGymPrimaryTitle',
        'practiceGymPrimaryDescription',
        'practiceGymCta',
        'practiceGymTagSimulatedStudents',
        'practiceGymTagPromptTesting',
        'practiceGymTagSafeEnvironment',
        'practiceGymManageNotebooks',
        'teacherProfileHeading',
        'teacherProfileSubtitle',
    ] as const;

    for (const key of gymKeys) {
        for (const lang of languages) {
            const val = teacherAreaText(lang, key);
            assert.ok(val && val.trim().length > 0, `missing label ${key} in ${lang}`);
        }
    }
});

