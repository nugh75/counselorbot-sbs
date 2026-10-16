import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { currentHeaderLink, HEADER_LINKS, headerNavigation, matchesHref } from './header-navigation.ts';
import { ENTRY_HREFS, LABELS, PROFILES as FIXTURES, VIEWPORTS, band, expectedNavbar } from '../../tests/fixtures/navbar-contract.mjs';
import type { Identity } from './auth';
import type { HeaderLink, HeaderNavigation } from './header-navigation';
import type { UserAccess } from './user-access';

type Profile = { identity: Identity; access: UserAccess | null };
const PROFILES = FIXTURES as unknown as Record<keyof typeof FIXTURES, Profile>;
type ProfileKey = keyof typeof PROFILES;

// Header link key -> P0 fixture entry (labels and destinations written by hand).
const FIXTURE_ENTRY: Record<HeaderLink['key'], keyof typeof ENTRY_HREFS & keyof typeof LABELS> = {
    orientation: 'bussola',
    assistant: 'assistant',
    guide: 'guide',
    profile: 'student',
    'teacher-panel': 'teacher',
    admin: 'admin',
};
const LINK_LABELS = Object.fromEntries(Object.entries(FIXTURE_ENTRY).map(([key, entry]) => [key, LABELS[entry]])) as Record<HeaderLink['key'], string>;
const LINK_NAMES = new Set(Object.values(LINK_LABELS));

const nav = (key: ProfileKey, extra: Partial<Parameters<typeof headerNavigation>[0]> = {}): HeaderNavigation =>
    headerNavigation({ identity: PROFILES[key].identity, access: PROFILES[key].access, accessLoading: false, ...extra });
const keys = (navigation: HeaderNavigation) => navigation.links.map((link) => link.key);

// Where the Header renders each link (P4): below `lg` every link in the menu;
// from `lg` the `area` group behind the «Area» selector (a plain link when it
// holds one area), then the `support` group with its bar labels.
function placed(navigation: HeaderNavigation, width: number) {
    const label = (link: HeaderLink) => LINK_LABELS[link.key];
    if (band(width) === 'compact') return { bar: [], menu: navigation.links.map(label), areas: null };
    const areas = navigation.links.filter((link) => link.group === 'area').map(label);
    const support = navigation.links.filter((link) => link.group === 'support')
        .map((link) => (link.barLabelKey ? LABELS.bussolaBar : label(link)));
    return {
        bar: [...(areas.length > 1 ? [LABELS.area] : areas), ...support],
        menu: [],
        areas: areas.length > 1 ? areas : null,
    };
}

const BAR_NAMES = new Set([...LINK_NAMES, LABELS.area, LABELS.bussolaBar]);

test('one description drives the bar, the Area selector and the menu at every width', () => {
    for (const key of Object.keys(PROFILES) as ProfileKey[]) {
        for (const width of VIEWPORTS) {
            const { bar, menu, areas } = expectedNavbar(key, width);
            assert.deepEqual(placed(nav(key), width), {
                bar: bar.filter((name: string) => BAR_NAMES.has(name)),
                menu: (menu ?? []).filter((name: string) => LINK_NAMES.has(name)),
                areas,
            }, `${key} at ${width}px`);
        }
    }
});

test('links keep their order, destinations and groups', () => {
    assert.deepEqual(HEADER_LINKS.map((link: HeaderLink) => link.key), ['orientation', 'assistant', 'guide', 'profile', 'teacher-panel', 'admin']);
    for (const link of HEADER_LINKS as readonly HeaderLink[]) assert.equal(link.href, ENTRY_HREFS[FIXTURE_ENTRY[link.key]], link.key);
    // The «Area» selector of P4 reads this group: Studente, Docente, Amministrazione.
    assert.deepEqual(HEADER_LINKS.filter((link: HeaderLink) => link.group === 'area').map((link: HeaderLink) => link.key), ['profile', 'teacher-panel', 'admin']);
    // Only the Compass has a shorter bar label than its menu call to action.
    assert.deepEqual(HEADER_LINKS.filter((link: HeaderLink) => link.barLabelKey).map((link: HeaderLink) => [link.key, link.barLabelKey]), [['orientation', 'nav.orientation']]);
});

const PREDICATES: [string, ProfileKey, Record<string, unknown>][] = [
    ['guest', 'A', { links: ['guide'], classView: false, account: null, services: null, auth: 'adminLogin' }],
    ['student without classes', 'S', { links: ['orientation', 'assistant', 'guide', 'profile'], classView: false, services: null, auth: 'logout' }],
    ['student whose class turns the Assistant off', 'S1', { links: ['orientation', 'guide', 'profile'], classView: true }],
    ['student whose classes turn the Compass off', 'S2', { links: ['assistant', 'guide', 'profile'], classView: true }],
    ['student in the full view', 'Sall', { links: ['orientation', 'assistant', 'guide', 'profile'], classView: true }],
    ['teacher', 'D', { links: ['orientation', 'assistant', 'guide', 'profile', 'teacher-panel'], classView: false, services: null }],
    ['researcher', 'R', { links: ['orientation', 'assistant', 'guide', 'profile', 'teacher-panel', 'admin'], services: 'portal' }],
    ['admin', 'M', { links: ['orientation', 'assistant', 'guide', 'profile', 'teacher-panel', 'admin'], services: 'manager' }],
];

for (const [name, key, expected] of PREDICATES) {
    test(`navigation predicates for the ${name}`, () => {
        const navigation = nav(key);
        const actual: Record<string, unknown> = { links: keys(navigation), classView: navigation.classView, account: navigation.account, services: navigation.services, auth: navigation.auth };
        for (const field of Object.keys(expected)) assert.deepEqual(actual[field], expected[field], field);
    });
}

test('the account names the person, never a second link to the student area', () => {
    assert.deepEqual(nav('D').account, {
        label: 'Docente Sintetico',
        detail: 'docente.sintetico@example.invalid',
        title: 'docente.sintetico - docente.sintetico@example.invalid - docenti',
    });
    const unnamed = { ...PROFILES.S.identity, name: '' };
    assert.deepEqual(headerNavigation({ identity: unnamed, access: null, accessLoading: false }).account, {
        label: 'studente.sintetico@example.invalid',
        detail: 'studente.sintetico',
        title: 'studente.sintetico - studente.sintetico@example.invalid - studenti',
    });
    const usernameOnly = { ...PROFILES.S.identity, name: '', email: '' };
    assert.equal(headerNavigation({ identity: usernameOnly, access: null, accessLoading: false }).account?.detail, null);
});

test('nothing but the brand while the identity loads, even for staff with access cached', () => {
    const loading = headerNavigation({ identity: undefined, access: PROFILES.M.access, accessLoading: false });
    assert.equal(loading.loading, true);
    assert.deepEqual(loading.links, []);
    assert.equal(loading.account, null);
    assert.equal(loading.services, null);
});

test('tool entries wait for the class access, role entries do not', () => {
    assert.deepEqual(keys(nav('D', { accessLoading: true })), ['guide', 'profile', 'teacher-panel']);
    assert.deepEqual(keys(nav('S1', { accessLoading: true })), ['guide', 'profile']);
});

test('a failed identity read is a guest, a failed access read filters nothing', () => {
    const guest = headerNavigation({ identity: null, access: null, accessLoading: false });
    assert.equal(guest.loading, false);
    assert.deepEqual(keys(guest), ['guide']);
    assert.equal(guest.auth, 'adminLogin');
    const unfiltered = nav('S1', { access: null });
    assert.deepEqual(keys(unfiltered), ['orientation', 'assistant', 'guide', 'profile']);
    assert.equal(unfiltered.classView, false);
});

// getIdentity() applies the role preview: is_admin false, the previewed groups.
const preview = (groups: string[], is_researcher = false): Identity => ({
    ...PROFILES.M.identity, username: 'demo', name: 'Demo', email: 'demo@anteprima.local', groups, is_admin: false, is_researcher,
});

test('a role preview shows the previewed account, never the real admin entries', () => {
    const student = headerNavigation({ identity: preview(['studenti']), access: PROFILES.S.access, accessLoading: false });
    assert.deepEqual(keys(student), ['orientation', 'assistant', 'guide', 'profile']);
    assert.equal(student.services, null);
    const teacher = headerNavigation({ identity: preview(['docenti']), access: PROFILES.D.access, accessLoading: false });
    assert.deepEqual(keys(teacher), ['orientation', 'assistant', 'guide', 'profile', 'teacher-panel']);
    const researcher = headerNavigation({ identity: preview(['ricercatori'], true), access: PROFILES.R.access, accessLoading: false });
    assert.equal(researcher.services, 'portal');
});

const HREF_CASES: [string, string, string, boolean][] = [
    ['/profilo', '/profilo', '', true],
    ['/profilo', '/profilo/pqbl', '', true],
    ['/profilo', '/profilo/', '', true],
    ['/profilo', '/profilo-vecchio', '', false],
    ['/profilo', '/', '', false],
    ['/docente', '/docente/classi/12', '?tab=students', true],
    ['/admin', '/admin', '?tab=logs', true],
    ['/admin', '/admin/classi/7', '', true],
    ['/guide', '/guide', '', true],
    ['/guide', '/guidelines', '', false],
    ['/', '/', '', true],
    ['/', '/', '?view=home', true],
    ['/', '/', '?frozen=abc', false],
    ['/', '/', '?resume=1', false],
    ['/', '/', '?start=QSA', false],
    ['/', '/', '?q=QSA', false],
    ['/', '/', '?session_id=5&instrument=QSA', false],
    ['/', '/', '?practice_notebook_id=3', false],
    ['/', '/guide', '', false],
    ['/?view=home', '/', '?view=home', true],
    ['/?view=home', '/', '', false],
    ['/?view=home', '/', '?view=home&frozen=abc', false],
    ['/?view=home', '/profilo', '?view=home', false],
];

for (const [href, pathname, search, expected] of HREF_CASES) {
    test(`${href} is ${expected ? '' : 'not '}current on ${pathname}${search}`, () => {
        assert.equal(matchesHref(href, pathname, search), expected);
    });
}

const CURRENT_CASES: [ProfileKey, string, string, string | null][] = [
    ['D', '/guide', '', 'guide'],
    ['D', '/profilo/pqbl', '', 'profile'],
    ['D', '/docente', '', 'teacher-panel'],
    ['D', '/docente/risorse/strategie', '', 'teacher-panel'],
    ['D', '/admin', '', null],
    ['M', '/admin', '?tab=costs', 'admin'],
    ['S', '/bussola', '', 'orientation'],
    ['S', '/assistente', '', 'assistant'],
    ['S1', '/assistente', '', null],
    ['S', '/questionario', '', null],
    ['S', '/counselor', '?next=%2F%3Ffrozen%3Dabc', null],
    ['S', '/', '?frozen=abc', null],
    ['S', '/', '', null],
    ['A', '/profilo', '', null],
];

for (const [key, pathname, search, expected] of CURRENT_CASES) {
    test(`current link for ${key} on ${pathname}${search}`, () => {
        assert.equal(currentHeaderLink(nav(key).links, pathname, search), expected);
    });
}

test('the most specific link is the current one', () => {
    const links = [
        { key: 'teacher-panel', href: '/docente', labelKey: '', group: 'area' },
        { key: 'guide', href: '/docente/risorse', labelKey: '', group: 'support' },
    ] as HeaderLink[];
    assert.equal(currentHeaderLink(links, '/docente/risorse/materiali'), 'guide');
    assert.equal(currentHeaderLink(links, '/docente/classi'), 'teacher-panel');
});
