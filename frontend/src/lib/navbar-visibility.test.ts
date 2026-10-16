import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { headerNavigation } from './header-navigation.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { classViewOptions } from './class-view.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { classViewText } from './i18n-class-view.ts';
import { LABELS, PROFILES as FIXTURES, VIEWPORTS, band, expectedNavbar } from '../../tests/fixtures/navbar-contract.mjs';
import type { Identity } from './auth';
import type { UserAccess } from './user-access';

type Profile = { identity: Identity; access: UserAccess | null; expect: Record<string, unknown> };
const PROFILES = FIXTURES as unknown as Record<keyof typeof FIXTURES, Profile>;

// The role contract read from the one description the Header renders
// (lib/header-navigation.ts); tests/navbar-visibility.test.mjs checks the
// rendered navbar.
function navbarFlags({ identity, access }: Profile) {
    const nav = headerNavigation({ identity, access, accessLoading: false });
    const has = (key: string) => nav.links.some((link: { key: string }) => link.key === key);
    return {
        bussola: has('orientation'),
        assistant: has('assistant'),
        student: has('profile'),
        teacher: has('teacher-panel'),
        admin: has('admin'),
        services: nav.services,
        view: (nav.classView ? classViewOptions(access) : []).map((option: { kind: string; name?: string }) =>
            option.kind === 'class' ? classViewText('it', 'class', option.name) : classViewText('it', option.kind as 'all' | 'classes')),
        auth: nav.auth,
    };
}

for (const [key, profile] of Object.entries(PROFILES)) {
    test(`navbar role contract for ${key}`, () => {
        assert.deepEqual(navbarFlags(profile), profile.expect);
    });
}

test('a failed access read shows every tool: the server stays the guard', () => {
    const flags = navbarFlags({ ...PROFILES.S1, access: null });
    assert.equal(flags.bussola, true);
    assert.equal(flags.assistant, true);
    assert.deepEqual(flags.view, []);
});

test('the viewport bands switch exactly at 1024px and 1280px', () => {
    assert.deepEqual(VIEWPORTS.map(band), ['compact', 'compact', 'compact', 'lg', 'lg', 'xl', 'xl']);
    assert.notDeepEqual(expectedNavbar('D', 1023), expectedNavbar('D', 1024));
    assert.notDeepEqual(expectedNavbar('D', 1279), expectedNavbar('D', 1280));
});

test('every entry stays reachable in each band, privileged ones only for their roles', () => {
    for (const key of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
        const reachable = VIEWPORTS.map(width => {
            const { bar, menu } = expectedNavbar(key, width);
            // The xl bar adds the account name, a second door to /profilo; its
            // theme icon and language picker are the menu rows under other names.
            return new Set([...bar, ...(menu ?? [])]
                .filter(name => name !== PROFILES[key].identity.name)
                .flatMap(name => name === LABELS.darkIcon ? [LABELS.darkRow] : name === LABELS.language ? LABELS.languages : [name]));
        });
        for (const names of reachable) assert.deepEqual([...names].sort(), [...reachable[0]].sort(), key);
        const names = reachable[0];
        assert.equal(names.has(LABELS.teacher), ['D', 'R', 'M'].includes(key), `${key} teacher area`);
        assert.equal(names.has(LABELS.admin), ['R', 'M'].includes(key), `${key} administration`);
        assert.equal(names.has(LABELS.student), key !== 'A', `${key} student area`);
    }
});

test('teacher and administration areas never leave the three-dot menu', () => {
    for (const key of ['D', 'R', 'M'] as const) {
        for (const width of VIEWPORTS) {
            const { bar, menu } = expectedNavbar(key, width);
            assert.equal(bar.includes(LABELS.teacher) || bar.includes(LABELS.admin), false);
            assert.ok(menu?.includes(LABELS.teacher));
        }
    }
});
