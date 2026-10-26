import assert from 'node:assert/strict';
import test from 'node:test';
import { parseClassGroups, type StudentGroup } from '../components/teacher/class-group-types.ts';
import { classSettingsText, classSettingsTexts } from './i18n-class-settings.ts';
import { classGroupTexts } from '../components/teacher/class-group-texts.ts';

const languages = ['it', 'en', 'es', 'fr', 'de', 'sv'] as const;

function resolveBasePath(explicitBasePath?: string, pathname?: string): string {
    return explicitBasePath ?? (pathname?.startsWith('/admin') ? '/admin/classi' : '/docente/classi');
}

function computeIsShared(
    group: { owner_username: string; shares_count?: number },
    currentUsername?: string,
    fallbackSharesCount?: number,
): boolean {
    const count = group.shares_count !== undefined ? group.shares_count : (fallbackSharesCount ?? 0);
    const notOwner = Boolean(
        currentUsername &&
        group.owner_username &&
        group.owner_username.toLowerCase() !== currentUsername.toLowerCase()
    );
    return count > 0 || notOwner;
}

test('resolveBasePath respects explicitBasePath and falls back to pathname detection', () => {
    assert.equal(resolveBasePath('/custom/base'), '/custom/base');
    assert.equal(resolveBasePath(undefined, '/admin'), '/admin/classi');
    assert.equal(resolveBasePath(undefined, '/admin?tab=groupsClasses'), '/admin/classi');
    assert.equal(resolveBasePath(undefined, '/docente/classi'), '/docente/classi');
    assert.equal(resolveBasePath(undefined, '/docente/istituti'), '/docente/classi');
    assert.equal(resolveBasePath(undefined, undefined), '/docente/classi');
});

test('computeIsShared correctly identifies shared status based on owner and shares_count', () => {
    // Current user is owner, no shares
    assert.equal(
        computeIsShared({ owner_username: 'prof.rossi', shares_count: 0 }, 'prof.rossi'),
        false
    );

    // Current user is owner, shared with colleagues
    assert.equal(
        computeIsShared({ owner_username: 'prof.rossi', shares_count: 2 }, 'prof.rossi'),
        true
    );

    // Current user is not owner (co-teacher access)
    assert.equal(
        computeIsShared({ owner_username: 'prof.bianchi', shares_count: 0 }, 'prof.rossi'),
        true
    );

    // Current user is not owner, case-insensitive comparison
    assert.equal(
        computeIsShared({ owner_username: 'PROF.ROSSI', shares_count: 0 }, 'prof.rossi'),
        false
    );

    // Fallback shares count when group.shares_count is undefined
    assert.equal(
        computeIsShared({ owner_username: 'prof.rossi' }, 'prof.rossi', 1),
        true
    );
    assert.equal(
        computeIsShared({ owner_username: 'prof.rossi' }, 'prof.rossi', 0),
        false
    );
});

test('parseClassGroups preserves shares_count in StudentGroup items', () => {
    const raw = [
        {
            id: 1,
            code: 'GR-123456',
            name: 'Classe 3A',
            school: 'Liceo Fermi',
            school_level: 'secondaria',
            institution_id: 1,
            description: null,
            methodologies: null,
            context_visible_to_students: false,
            owner_username: 'prof.rossi',
            is_active: true,
            members_count: 25,
            shares_count: 3,
            created_at: '2026-09-01T08:00:00Z',
        },
    ];

    const parsed = parseClassGroups(raw);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].shares_count, 3);
});

test('directory i18n keys are present and localized across all 6 languages', () => {
    const requiredSettingsKeys: (keyof typeof classSettingsTexts)[] = [
        'statusActive',
        'statusInactive',
        'shared',
        'copyCode',
        'copied',
        'open',
        'owner',
        'students',
        'toolsTab',
        'paths',
    ];

    for (const lang of languages) {
        for (const key of requiredSettingsKeys) {
            const val = classSettingsText(lang, key);
            assert.ok(val && val.length > 0, `Missing translation for key ${key} in ${lang}`);
        }

        const groupDict = classGroupTexts[lang];
        assert.ok(groupDict, `Missing classGroupTexts for ${lang}`);
        assert.ok(groupDict.sharedBadge, `Missing sharedBadge in ${lang}`);
        assert.ok(groupDict.activeBadge, `Missing activeBadge in ${lang}`);
        assert.ok(groupDict.inactiveBadge, `Missing inactiveBadge in ${lang}`);
        assert.ok(groupDict.copyCode, `Missing copyCode in ${lang}`);
        assert.ok(groupDict.codeCopied, `Missing codeCopied in ${lang}`);
        assert.ok(groupDict.openClass, `Missing openClass in ${lang}`);
        assert.ok(groupDict.ownerLabel, `Missing ownerLabel in ${lang}`);
    }
});

test('admin class links route directly to the admin class hub and tabs', () => {
    const adminBasePath = resolveBasePath(undefined, '/admin?tab=groupsClasses');
    assert.equal(adminBasePath, '/admin/classi');

    const groupId = 55;
    // Overview Hub Link
    const overviewHref = `${adminBasePath}/${groupId}`;
    assert.equal(overviewHref, '/admin/classi/55');

    // Students Tab Link (replaces legacy /docente/classi redirection)
    const studentsHref = `${adminBasePath}/${groupId}?tab=students`;
    assert.equal(studentsHref, '/admin/classi/55?tab=students');

    // Tools and Paths tabs
    assert.equal(`${adminBasePath}/${groupId}?tab=tools`, '/admin/classi/55?tab=tools');
    assert.equal(`${adminBasePath}/${groupId}?tab=paths`, '/admin/classi/55?tab=paths');
});

