import assert from 'node:assert/strict';
import test from 'node:test';
import { headerNavigation } from './header-navigation.ts';
import { classViewOptions } from './class-view.ts';
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
        instruments: has('instruments'),
        bussola: has('orientation'),
        assistant: has('assistant'),
        student: has('profile'),
        teacher: has('teacher-panel'),
        admin: has('admin'),
        services: nav.services,
        view: (nav.classView ? classViewOptions(access) : []).map((option: { kind: string; name?: string }) =>
            option.kind === 'class' ? classViewText('it', 'class', option.name) : classViewText('it', option.kind as 'all' | 'classes')),
    };
}

for (const [key, profile] of Object.entries(PROFILES)) {
    test(`navbar role contract for ${key}`, () => {
        assert.deepEqual(navbarFlags(profile), profile.expect);
    });
}

test('a failed access read shows every tool: the server stays the guard', () => {
    const flags = navbarFlags({ ...PROFILES.S1, access: null });
    assert.equal(flags.instruments, true);
    assert.equal(flags.bussola, true);
    assert.equal(flags.assistant, true);
    assert.deepEqual(flags.view, []);
});

test('the bar changes at 1024px; from there xl only widens the account name', () => {
    assert.deepEqual(VIEWPORTS.map(band), ['compact', 'compact', 'compact', 'compact', 'lg', 'lg', 'xl', 'xl']);
    assert.notDeepEqual(expectedNavbar('D', 1023), expectedNavbar('D', 1024));
    assert.deepEqual(expectedNavbar('D', 1279), expectedNavbar('D', 1280));
});

// Parity (P5): the same entries under the same names in every band. The
// selector, account and «Menu» triggers only open panels.
test('every entry stays reachable in each band, privileged ones only for their roles', () => {
    for (const key of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
        const triggers = [LABELS.area, LABELS.preferences, LABELS.account(PROFILES[key].identity.name), LABELS.menu];
        const reachable = VIEWPORTS.map(width => {
            const { bar, menu, areas, account } = expectedNavbar(key, width);
            return new Set([...bar, ...(menu ?? []), ...(areas ?? []), ...(account ?? [])]
                .filter(name => !triggers.includes(name)));
        });
        for (const names of reachable) assert.deepEqual([...names].sort(), [...reachable[0]].sort(), key);
        const names = reachable[0];
        assert.equal(names.has(LABELS.teacher), ['D', 'R', 'M'].includes(key), `${key} teacher area`);
        assert.equal(names.has(LABELS.admin), ['R', 'M'].includes(key), `${key} administration`);
        assert.equal(names.has(LABELS.student), key !== 'A', `${key} student area`);
    }
});

test('from 1024px the areas sit behind the Area selector, a single area is a link', () => {
    for (const key of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
        for (const width of VIEWPORTS.filter(width => band(width) !== 'compact')) {
            const { bar, menu, areas } = expectedNavbar(key, width);
            assert.equal(menu, null, `${key} has no three-dot menu at ${width}px`);
            assert.equal(bar.includes(LABELS.teacher) || bar.includes(LABELS.admin), false);
            const expected = { A: null, S: null, S1: null, S2: null, Sall: null, D: [LABELS.student, LABELS.teacher], R: [LABELS.student, LABELS.teacher, LABELS.admin], M: [LABELS.student, LABELS.teacher, LABELS.admin] }[key];
            assert.deepEqual(areas, expected, `${key} at ${width}px`);
            assert.equal(bar.includes(LABELS.area), expected !== null);
            assert.equal(bar.includes(LABELS.student), key !== 'A' && expected === null);
        }
    }
});

test('one door to the student area: the account menu names the person only', () => {
    for (const key of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
        const { bar, areas, account } = expectedNavbar(key, 1440);
        const doors = [...bar, ...(areas ?? []), ...(account ?? [])].filter(name => name === LABELS.student);
        assert.equal(doors.length, key === 'A' ? 0 : 1, key);
        assert.equal(account?.at(-1), key === 'A' ? LABELS.languages.at(-1) : LABELS.signOut, `${key}: sign out last`);
    }
});

// P5: language and sign out never come after the resume rows; the account
// group of the «Menu» panel is the desktop account panel.
test('the Menu panel ends with the account group, resume rows stay in their sub-panel', () => {
    const rows = ['Sessione A', 'Sessione B', 'Sessione C'];
    // The fixture infers `rows: never[]` from its default value.
    const menu = (key: keyof typeof PROFILES, resumeOpen: boolean) =>
        expectedNavbar(key, 390, { resume: { rows, error: false }, resumeOpen } as never).menu as string[];
    for (const key of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
        const closed = menu(key, false);
        const open = menu(key, true);
        const account = expectedNavbar(key, 1440).account as string[];
        const tail = key === 'A' ? [...account, LABELS.signIn] : account;
        assert.deepEqual(closed.slice(-tail.length), tail, `${key}: account group last`);
        assert.equal(closed.some(name => rows.includes(name)), false, `${key}: rows closed`);
        assert.ok(closed.indexOf(LABELS.resume) < closed.indexOf(LABELS.languages[0]), key);
        assert.equal(open.filter(name => rows.includes(name)).length, rows.length, `${key}: rows open`);
        assert.ok(open.indexOf(rows.at(-1)!) < open.indexOf(LABELS.languages[0]), `${key}: rows before the account group`);
    }
});
