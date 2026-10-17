// Visibility contract of the global navbar (P0 of
// docs/operations/audit-navbar.md, desktop updated by P4). Synthetic identities
// and access payloads only: no SSO, no real accounts. Labels are written here
// instead of being read from the dictionaries, so any copy or visibility change
// shows up as a test change that the redesign PRs (P1–P5) must update on purpose.

export const VIEWPORTS = [390, 768, 1023, 1024, 1279, 1280, 1440];

// Tailwind `lg` and `xl` at the browser's default 16px root font size. Since P4
// the bar is the same from `lg`: `xl` only widens the account name.
export function band(width) {
    return width < 1024 ? 'compact' : width < 1280 ? 'lg' : 'xl';
}

const STUDENT_TOOLS = ['QSA', 'SAVICKAS', 'notebook', 'results', 'classes', 'assignments', 'goals', 'actions', 'pqbl'];
const unrestricted = (classes = [], view = undefined) => ({
    restricted: false,
    tool_keys: [...STUDENT_TOOLS, 'bussola', 'assistant'],
    counselor_ids: null,
    default_counselor_id: null,
    class_ids: classes.map(item => item.id),
    classes,
    ...(view ? { view } : {}),
});
const restricted = (classes, tools, view = 'classes') => ({
    restricted: true,
    tool_keys: tools,
    counselor_ids: null,
    default_counselor_id: null,
    class_ids: classes.map(item => item.id),
    classes,
    view,
});
const person = (username, name, groups, extra = {}) => ({
    authenticated: true,
    username,
    name,
    email: `${username}@example.invalid`,
    groups,
    is_admin: false,
    is_researcher: false,
    ...extra,
});
const ONE_CLASS = [{ id: 11, name: 'Terza B' }];
const TWO_CLASSES = [{ id: 11, name: 'Terza B' }, { id: 12, name: 'Laboratorio' }];

// `access: null` means GET /api/user/access answers 401, as for a guest.
// `expect` is the role contract the unit test checks against lib/roles.ts and
// lib/user-access.ts; the browser test checks the rendered navbar.
export const PROFILES = {
    A: {
        identity: { authenticated: false, username: '', name: '', email: '', groups: [], is_admin: false, is_researcher: false },
        access: null,
        expect: { bussola: false, assistant: false, student: false, teacher: false, admin: false, services: null, view: [], auth: 'adminLogin' },
    },
    S: {
        identity: person('studente.sintetico', 'Studente Sintetico', ['studenti']),
        access: unrestricted(),
        expect: { bussola: true, assistant: true, student: true, teacher: false, admin: false, services: null, view: [], auth: 'logout' },
    },
    // One class that turns the Assistant, Savickas and pQBL off.
    S1: {
        identity: person('studente.classe', 'Studente Classe', ['studenti']),
        access: restricted(ONE_CLASS, [...STUDENT_TOOLS.filter(key => key !== 'pqbl' && key !== 'SAVICKAS'), 'bussola']),
        expect: { bussola: true, assistant: false, student: true, teacher: false, admin: false, services: null, view: ['Tutti gli strumenti', 'Classe Terza B'], auth: 'logout' },
    },
    // Union of two classes that turns the Compass off.
    S2: {
        identity: person('studente.classi', 'Studente Due Classi', ['studenti']),
        access: restricted(TWO_CLASSES, [...STUDENT_TOOLS, 'assistant']),
        expect: { bussola: false, assistant: true, student: true, teacher: false, admin: false, services: null, view: ['Tutti gli strumenti', 'Le mie classi', 'Classe Terza B', 'Classe Laboratorio'], auth: 'logout' },
    },
    // Same student in the full view: no class filter, the selector stays.
    Sall: {
        identity: person('studente.tutto', 'Studente Vista Completa', ['studenti']),
        access: unrestricted(TWO_CLASSES, 'all'),
        expect: { bussola: true, assistant: true, student: true, teacher: false, admin: false, services: null, view: ['Tutti gli strumenti', 'Le mie classi', 'Classe Terza B', 'Classe Laboratorio'], auth: 'logout' },
    },
    D: {
        identity: person('docente.sintetico', 'Docente Sintetico', ['docenti']),
        access: unrestricted(),
        expect: { bussola: true, assistant: true, student: true, teacher: true, admin: false, services: null, view: [], auth: 'logout' },
    },
    R: {
        identity: person('ricerca.sintetica', 'Ricerca Sintetica', ['ricercatori'], { is_researcher: true }),
        access: unrestricted(),
        expect: { bussola: true, assistant: true, student: true, teacher: true, admin: true, services: 'portal', view: [], auth: 'logout' },
    },
    M: {
        identity: person('admin.sintetico', 'Admin Sintetico', ['admins'], { is_admin: true }),
        access: unrestricted(),
        expect: { bussola: true, assistant: true, student: true, teacher: true, admin: true, services: 'manager', view: [], auth: 'logout' },
    },
};

// Italian accessible names of the navbar controls.
export const LABELS = {
    home: 'Torna alla home',
    menu: 'Menu',
    counselor: 'Scegli il counselor',
    view: 'Vista attiva',
    bussola: 'Apri la Bussola',
    // Desktop bar label (P4); the compact menu keeps the call to action.
    bussolaBar: 'Bussola',
    assistant: 'Assistente',
    guide: 'Guida',
    student: 'Area studente',
    teacher: 'Area docente',
    admin: 'Area amministrazione',
    // Desktop «Area» selector outside the areas; inside one it names the area.
    area: 'Area',
    // Desktop account menu (P4): trigger, guest preferences, sign in and out.
    account: name => `Account: ${name}`,
    preferences: 'Preferenze',
    signIn: 'Accedi',
    signOut: 'Esci',
    reader: 'Lettore audio',
    resume: 'Riprendi un’attività',
    retry: 'Riprova',
    services: 'Servizi piattaforma ai4educ',
    logout: 'Logout',
    adminLogin: 'Accesso admin',
    darkIcon: 'Passa al tema scuro',
    darkRow: 'Tema scuro',
    lightIcon: 'Passa al tema chiaro',
    lightRow: 'Tema chiaro',
    motion: 'Riduci il movimento',
    // The trigger names the current language (P2), announced again after a choice.
    language: 'Cambia lingua: Italiano',
    languages: ['Italiano', 'English', 'Español', 'Français', 'Deutsch', 'Svenska'],
    deleteSession: 'Elimina sessione',
    resumeLocal: 'Riprendi',
    pqbl: 'Studiare da un PDF',
};

// Role-dependent labels in the six languages, independent of the dictionaries.
export const LOCALIZED = {
    it: { menu: 'Menu', guide: 'Guida', student: 'Area studente', teacher: 'Area docente', admin: 'Area amministrazione', assistant: 'Assistente', bussola: 'Apri la Bussola', logout: 'Logout', adminLogin: 'Accesso admin', bussolaBar: 'Bussola', area: 'Area', account: 'Account: ', preferences: 'Preferenze', signIn: 'Accedi', signOut: 'Esci' },
    en: { menu: 'Menu', guide: 'Guide', student: 'Student area', teacher: 'Teacher area', admin: 'Administration area', assistant: 'Assistant', bussola: 'Open the Compass', logout: 'Logout', adminLogin: 'Admin access', bussolaBar: 'Compass', area: 'Area', account: 'Account: ', preferences: 'Preferences', signIn: 'Sign in', signOut: 'Sign out' },
    es: { menu: 'Menú', guide: 'Guía', student: 'Área del estudiante', teacher: 'Área docente', admin: 'Área de administración', assistant: 'Asistente', bussola: 'Abrir la Brújula', logout: 'Salir', adminLogin: 'Acceso admin', bussolaBar: 'Brújula', area: 'Área', account: 'Cuenta: ', preferences: 'Preferencias', signIn: 'Iniciar sesión', signOut: 'Cerrar sesión' },
    fr: { menu: 'Menu', guide: 'Guide', student: 'Espace élève', teacher: 'Espace enseignant', admin: 'Espace administration', assistant: 'Assistant', bussola: 'Ouvrir la Boussole', logout: 'Déconnexion', adminLogin: 'Accès admin', bussolaBar: 'Boussole', area: 'Espace', account: 'Compte : ', preferences: 'Préférences', signIn: 'Se connecter', signOut: 'Se déconnecter' },
    de: { menu: 'Menü', guide: 'Anleitung', student: 'Bereich für Lernende', teacher: 'Lehrkräftebereich', admin: 'Verwaltungsbereich', assistant: 'Assistent', bussola: 'Kompass öffnen', logout: 'Abmelden', adminLogin: 'Admin-Zugang', bussolaBar: 'Kompass', area: 'Bereich', account: 'Konto: ', preferences: 'Einstellungen', signIn: 'Anmelden', signOut: 'Abmelden' },
    sv: { menu: 'Meny', guide: 'Guide', student: 'Elevområde', teacher: 'Lärarområde', admin: 'Administrationsområde', assistant: 'Assistent', bussola: 'Öppna Kompassen', logout: 'Logga ut', adminLogin: 'Adminåtkomst', bussolaBar: 'Kompass', area: 'Område', account: 'Konto: ', preferences: 'Inställningar', signIn: 'Logga in', signOut: 'Logga ut' },
};

export const ENTRY_HREFS = {
    bussola: '/bussola',
    assistant: '/assistente',
    guide: '/guide',
    student: '/profilo',
    teacher: '/docente',
    admin: '/admin',
    counselor: '/counselor',
};

// Synthetic resumable sessions: one per allowed and one per class-disabled tool.
export const FROZEN_ROWS = [
    { session_id: 'navbar-qsa', questionnaire_type: 'QSA', label: 'Sessione sintetica QSA', updated_at: '2026-10-15T10:00:00Z' },
    { session_id: 'navbar-savickas', questionnaire_type: 'SAVICKAS', label: 'Sessione sintetica Savickas', updated_at: '2026-10-14T10:00:00Z' },
];

export const PQBL_PROGRESS = { version: 1, language: 'it', phase: 'quiz', size: 10, questions: [], currentIndex: 0 };

// Names of the resume block rows for `rows` (labels already resolved) plus error.
function resumeBlock({ rows = [], error = false }) {
    if (rows.length === 0 && !error) return [];
    return [
        ...(error ? [LABELS.retry] : []),
        ...rows.flatMap(label => [label, `${LABELS.deleteSession}: ${label}`]),
    ];
}

// Ordered accessible names of the visible navbar controls. Below 1024px: `bar`
// outside the three-dot menu, `menu` inside it once opened (unchanged since P0,
// P5 redesigns it). From 1024px (P4) there is no three-dot menu: `areas` lists
// the «Area» selector panel (null when a single area is a plain link) and
// `account` the account panel («Preferenze» for guests). `resume` lists
// resolved row labels; `loading` is the state before /api/auth/me answers;
// `override` replaces parts of the role contract (e.g. a failed access read);
// `area` is the label of the current area, shown by the selector.
export function expectedNavbar(profileKey, width, { resume = { rows: [], error: false }, loading = false, accessLoading = false, override = {}, area = null } = {}) {
    const { identity } = PROFILES[profileKey];
    const expect = { ...PROFILES[profileKey].expect, ...override };
    const compact = band(width) === 'compact';
    const auth = identity.authenticated;
    const account = auth && (identity.name || identity.email || identity.username);
    const resumeVisible = resume.rows.length > 0 || resume.error;

    if (loading) {
        return { bar: [LABELS.home], menu: null, areas: null, account: null };
    }

    const tools = accessLoading ? [] : [
        ...(expect.bussola ? [compact ? LABELS.bussola : LABELS.bussolaBar] : []),
        ...(expect.assistant ? [LABELS.assistant] : []),
    ];
    const areaItems = [
        ...(expect.student ? [LABELS.student] : []),
        ...(expect.teacher ? [LABELS.teacher] : []),
        ...(expect.admin ? [LABELS.admin] : []),
    ];
    const view = auth && expect.view.length > 0 ? [LABELS.view] : [];

    if (!compact) {
        const areaEntry = areaItems.length > 1 ? [area ?? LABELS.area] : areaItems;
        const bar = [LABELS.home, ...areaEntry, ...tools, LABELS.guide, ...view];
        if (auth) bar.push(LABELS.counselor);
        if (resumeVisible) bar.push(LABELS.resume);
        bar.push(account ? LABELS.account(account) : LABELS.preferences);
        if (!auth) bar.push(LABELS.signIn);
        return {
            bar,
            menu: null,
            areas: areaItems.length > 1 ? areaItems : null,
            account: [
                ...(expect.services ? [LABELS.services] : []),
                LABELS.darkRow, LABELS.motion, LABELS.reader, ...LABELS.languages,
                ...(auth ? [LABELS.signOut] : []),
            ],
        };
    }

    const menu = [];
    if (account) menu.push(LABELS.counselor, ...view);
    menu.push(...tools, LABELS.guide, ...areaItems, LABELS.reader, ...resumeBlock(resume));
    if (expect.services) menu.push(LABELS.services);
    menu.push(LABELS[expect.auth], LABELS.darkRow, LABELS.motion, ...LABELS.languages);
    return { bar: [LABELS.home, LABELS.menu], menu, areas: null, account: null };
}
