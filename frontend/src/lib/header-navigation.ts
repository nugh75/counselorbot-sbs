// Global navbar (P3 of docs/operations/audit-navbar.md): one ordered
// description of the header links and of the conditions that show them, read
// by the desktop bar and by the compact menu alike. Pure data: Header maps
// `key` to an icon, `labelKey` to the current language, services and auth to
// the configured ai4auth/ai4educ URLs.
//
// Placement (P4): below `lg` (1024px) every link sits in the three-dot menu.
// From `lg` the bar shows them with visible labels: the `area` group through
// the «Area» selector (a plain link when only one area is open), then the
// `support` group.

import type { Identity } from './auth';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { canUseAssistant, canUsePersonalPage, canUseResearchConsole, canUseTeacherAssistant } from './roles.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { classViewOptions } from './class-view.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { isToolAllowed, type UserAccess } from './user-access.ts';

export type HeaderLinkKey = 'orientation' | 'assistant' | 'guide' | 'profile' | 'teacher-panel' | 'admin';

// `support`: tools and help open to everyone allowed. `area`: the workspaces a
// person can enter (Studente / Docente / Amministrazione), the entries of the
// desktop «Area» selector (P4) and a group of the grouped mobile menu (P5).
export type HeaderLinkGroup = 'support' | 'area';

export interface HeaderLink {
    key: HeaderLinkKey;
    href: string;
    labelKey: string;
    group: HeaderLinkGroup;
    // Shorter label for the desktop bar, where the menu's call to action
    // («Apri la Bussola») would read as a sentence; the menu keeps `labelKey`.
    barLabelKey?: string;
}

export interface HeaderNavigationInput {
    // Effective identity (`getIdentity`): during a role preview it is the
    // previewed account, so the bar never adds the real admin's entries; /admin
    // keeps checking the real identity. `undefined` while /api/auth/me is
    // pending, `null` after an error, which reads as a guest.
    identity: Identity | null | undefined;
    // `null` before the first answer or after a failed read: no class filter,
    // the server stays the guard of every tool.
    access: UserAccess | null | undefined;
    accessLoading: boolean;
}

export interface HeaderNavigation {
    // Identity pending: only the brand and the placeholders, no menu, so no
    // privileged entry can flash before the role is known.
    loading: boolean;
    authenticated: boolean;
    links: HeaderLink[];
    // Student with classes: the active view selector.
    classView: boolean;
    // Name on the account menu trigger and in the compact menu: an identifier,
    // never a second door to /profilo (the «Area studente» entry is the one).
    // `detail` is the email or username shown under the name when it differs.
    account: { label: string; detail: string | null; title: string } | null;
    // ai4educ services: manager for admins, portal for researchers.
    services: 'manager' | 'portal' | null;
    // Compact menu only: «Accesso admin» back to /admin. The desktop bar
    // offers guests «Accedi» back to the current page instead.
    auth: 'logout' | 'adminLogin';
}

type Visible = (input: HeaderNavigationInput) => boolean;

const authenticated: Visible = ({ identity }) => Boolean(identity?.authenticated);
// Tool entries wait for the class access, then follow its filter.
const tool = (key: string): Visible => ({ access, accessLoading }) => !accessLoading && isToolAllowed(access, key);

// Order is the reading order of both the bar and the menu.
export const HEADER_LINKS: readonly (HeaderLink & { visible: Visible })[] = [
    {
        key: 'orientation', href: '/bussola', labelKey: 'orientation.landing.open', group: 'support', barLabelKey: 'nav.orientation',
        visible: (input) => authenticated(input) && tool('bussola')(input),
    },
    {
        key: 'assistant', href: '/assistente', labelKey: 'assistant.title', group: 'support',
        visible: (input) => canUseAssistant(input.identity) && tool('assistant')(input),
    },
    // Interface guide: for everyone, guests included.
    { key: 'guide', href: '/guide', labelKey: 'nav.guide', group: 'support', visible: () => true },
    {
        key: 'profile', href: '/profilo', labelKey: 'profile.nav', group: 'area',
        visible: ({ identity }) => canUsePersonalPage(identity),
    },
    // Teachers, researchers and admins: classes, plans and resources.
    {
        key: 'teacher-panel', href: '/docente', labelKey: 'nav.teacherPanel', group: 'area',
        visible: ({ identity }) => canUseTeacherAssistant(identity),
    },
    {
        key: 'admin', href: '/admin', labelKey: 'nav.admin', group: 'area',
        visible: ({ identity }) => canUseResearchConsole(identity),
    },
];

export function headerNavigation(input: HeaderNavigationInput): HeaderNavigation {
    const { identity, access } = input;
    const isAuthenticated = Boolean(identity?.authenticated);
    const label = identity?.name || identity?.email || identity?.username;
    const detail = [identity?.email, identity?.username].find((value) => value && value !== label) ?? null;
    return {
        loading: identity === undefined,
        authenticated: isAuthenticated,
        links: identity === undefined ? [] : HEADER_LINKS.filter((link) => link.visible(input)),
        classView: isAuthenticated && classViewOptions(access).length > 0,
        account: label ? {
            label,
            detail,
            title: [identity?.username, identity?.email, identity?.groups.join(', ')].filter(Boolean).join(' - '),
        } : null,
        services: isAuthenticated && canUseResearchConsole(identity) ? (identity?.is_admin ? 'manager' : 'portal') : null,
        auth: isAuthenticated ? 'logout' : 'adminLogin',
    };
}

// Query parameters that open a conversation on the home page: an open chat is
// not the home, even on `/`. The home strips them from the address bar once
// read, so a later `/` alone does not tell the catalog from a chat.
export const CHAT_QUERY_KEYS = ['frozen', 'resume', 'start', 'q', 'session_id', 'instrument', 'practice_notebook_id', 'practice_result_id'];

// `href` is current for its page and its sub-pages, on path segment
// boundaries; `/` only for itself without chat parameters. A query in `href`
// (e.g. `/?view=home`) must also be present in `search`.
export function matchesHref(href: string, pathname: string, search = ''): boolean {
    const target = new URL(href, 'http://localhost');
    const params = new URLSearchParams(search);
    if (target.pathname === '/') {
        if (pathname !== '/' || CHAT_QUERY_KEYS.some((key) => params.has(key))) return false;
    } else if (pathname !== target.pathname && !pathname.startsWith(`${target.pathname}/`)) {
        return false;
    }
    return [...target.searchParams].every(([key, value]) => params.get(key) === value);
}

// The one link that gets aria-current="page": the most specific match.
export function currentHeaderLink(links: readonly HeaderLink[], pathname: string, search = ''): HeaderLinkKey | null {
    const matches = links.filter((link) => matchesHref(link.href, pathname, search));
    matches.sort((a, b) => b.href.length - a.href.length);
    return matches[0]?.key ?? null;
}
