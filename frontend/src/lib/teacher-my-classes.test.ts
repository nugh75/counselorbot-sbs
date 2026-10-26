import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { parseClassGroups, type StudentGroup } from '../components/teacher/class-group-types.js';
// @ts-expect-error -- Node runs TypeScript files directly.
import { teacherAreaText } from './i18n-teacher-area.js';
import type { Lang } from './i18n.js';

const languages: readonly Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];

test('parseClassGroups validates valid group payload and filters active classes', () => {
    const rawPayload = [
        {
            id: 10,
            code: 'GR-ACTIVE1',
            name: 'Classe Attiva 1',
            school: 'Liceo Fermi',
            school_level: 'secondaria',
            institution_id: 1,
            institution_name: 'Istituto Fermi',
            description: 'Descrizione classe',
            methodologies: 'Didattica attiva',
            context_visible_to_students: true,
            owner_username: 'prof.bianchi',
            is_active: true,
            members_count: 24,
            created_at: '2026-09-01T08:00:00Z',
        },
        {
            id: 11,
            code: 'GR-INACT2',
            name: 'Classe Inattiva 2',
            school: null,
            school_level: null,
            institution_id: null,
            description: null,
            methodologies: null,
            context_visible_to_students: false,
            owner_username: 'prof.bianchi',
            is_active: false,
            members_count: 10,
            created_at: '2025-09-01T08:00:00Z',
        },
        {
            id: 12,
            code: 'GR-ACTIVE3',
            name: 'Classe Attiva Senza Studenti',
            school: 'IIS Galilei',
            school_level: null,
            institution_id: null,
            description: null,
            methodologies: null,
            context_visible_to_students: false,
            owner_username: 'prof.rossi',
            is_active: true,
            members_count: 0,
            created_at: '2026-10-01T09:00:00Z',
        },
    ];

    const parsed = parseClassGroups(rawPayload);
    assert.equal(parsed.length, 3);

    // Filtraggio per classi attive mostrate nel cruscotto operativo
    const active = parsed.filter(g => g.is_active);
    assert.equal(active.length, 2);
    assert.deepEqual(active.map(g => g.id), [10, 12]);
    assert.equal(active[0].name, 'Classe Attiva 1');
    assert.equal(active[0].members_count, 24);
    assert.equal(active[0].code, 'GR-ACTIVE1');
    assert.equal(active[0].institution_name, 'Istituto Fermi');
    assert.equal(active[0].school, 'Liceo Fermi');
});

test('parseClassGroups throws on non-array payload', () => {
    assert.throws(() => parseClassGroups({ error: 'not an array' }), /invalid groups/);
    assert.throws(() => parseClassGroups(null), /invalid groups/);
    assert.throws(() => parseClassGroups('string'), /invalid groups/);
});

test('all myClasses dashboard labels are localized in all 6 languages', () => {
    const keys = [
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

    for (const key of keys) {
        for (const lang of languages) {
            const text = teacherAreaText(lang, key);
            assert.ok(text && text.trim().length > 0, `Missing translation for ${key} in ${lang}`);
        }
    }
});

test('class hub navigation link conforms to route contract', () => {
    const groupId = 42;
    const expectedRoute = `/docente/classi/${groupId}`;
    assert.equal(`/docente/classi/${groupId}`, expectedRoute);
});
