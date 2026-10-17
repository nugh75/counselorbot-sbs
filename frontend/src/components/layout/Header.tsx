'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ResumeEntry } from '@/components/layout/ResumeEntry';
import { ResumeLoadError } from '@/components/layout/ResumeLoadError';
import { BookOpen, Bot, Compass, GraduationCap, LayoutGrid, LogIn, LogOut, Moon, MoreVertical, RotateCcw, Settings, Sun, User, type LucideIcon } from 'lucide-react';
import { ClassViewSwitcher } from './ClassViewSwitcher';
import { HeaderAccount } from './HeaderAccount';
import { HeaderAreas } from './HeaderAreas';
import { HeaderCounselor } from './HeaderCounselor';
import { HeaderInstrument } from './HeaderInstrument';
import { HeaderResume } from './HeaderResume';
import { MotionToggle } from './MotionToggle';
import { VoiceReaderMenuEntry } from '@/components/voice-reader/VoiceReader';
import { FlagIcon } from './FlagIcon';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { LANGUAGES } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ai4authLoginUrl, AI4AUTH_LOGOUT_URL, AI4EDUC_PORTAL_URL, AI4EDUC_MANAGER_URL, getIdentity, type Identity } from '@/lib/auth';
import { currentHeaderLink, headerNavigation, type HeaderLink, type HeaderLinkKey } from '@/lib/header-navigation';
import { resumeLabel } from '@/lib/resume-label';
import { useUserAccess } from '@/lib/use-user-access';
import type { UserAccess } from '@/lib/user-access';
import { useI18n } from '@/lib/i18n-context';
import { useDarkMode } from '@/lib/use-dark-mode';
import { useDisclosure } from '@/lib/use-disclosure';
import { LOCAL_RESUME_HREF, PQBL_RESUME_HREF, resumeHref, useResumeEntries, type ResumeEntries } from '@/lib/use-resume-entries';

const LINK_ICONS: Record<HeaderLinkKey, LucideIcon> = {
    orientation: Compass,
    assistant: Bot,
    guide: BookOpen,
    profile: User,
    'teacher-panel': GraduationCap,
    admin: Settings,
};

const SEPARATOR = 'mx-1 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700';

export function Header() {
    const { t } = useI18n();
    const { access, loading: accessLoading } = useUserAccess();
    const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);
    // Solo il percorso: nessuna voce punta a `/`, e la home toglie dall'URL le
    // query della chat appena lette (vedi `CHAT_QUERY_KEYS`).
    const pathname = usePathname();
    // Le voci "Riprendi" vivono qui e servono due rendering: il pulsante della
    // barra da `lg` e il menu mobile. Un solo fetch, lo stesso elenco.
    const resumeEntries = useResumeEntries(Boolean(identity?.authenticated));

    useEffect(() => {
        getIdentity().then(setIdentity);
    }, []);

    // Una sola descrizione delle voci per barra e menu (P3 dell'audit navbar).
    const nav = headerNavigation({ identity, access, accessLoading });
    const current = currentHeaderLink(nav.links, pathname);
    const servicesHref = nav.services === 'manager' ? AI4EDUC_MANAGER_URL : nav.services === 'portal' ? AI4EDUC_PORTAL_URL : undefined;
    // Menu compatto (< lg, P5): «Accesso admin» torna a /admin come prima.
    const authHref = nav.auth === 'logout' ? AI4AUTH_LOGOUT_URL : ai4authLoginUrl('/admin');
    const authLabel = nav.auth === 'logout' ? t('nav.logout') : t('nav.adminLogin');
    const AuthIcon = nav.auth === 'logout' ? LogOut : LogIn;

    // Barra desktop (P4): prima l'ingresso alle aree, poi gli strumenti di
    // supporto, con etichette visibili e mai tagliate. Se lo spazio manca si
    // accorciano vista classe, counselor e nome dell'account, a destra.
    const workInline = (
        <nav aria-label={t('header.navigation')} className="hidden shrink-0 items-center gap-1 lg:flex">
            <HeaderAreas areas={nav.links.filter(link => link.group === 'area')} current={current} icons={LINK_ICONS} />
            {nav.links.filter(link => link.group === 'support').map((link) => {
                const Icon = LINK_ICONS[link.key];
                return (
                    <Link key={link.key} href={link.href} className="console-topbar-action shrink-0" aria-current={link.key === current ? 'page' : undefined}>
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="whitespace-nowrap">{t(link.barLabelKey ?? link.labelKey)}</span>
                    </Link>
                );
            })}
        </nav>
    );

    return (
        <TooltipProvider delayDuration={300}>
            <header className="console-header fixed top-0 left-0 right-0 z-50">
                <div className="page-wide h-full flex items-center gap-3 px-3 sm:gap-4 sm:px-6">
                    <div className="flex shrink-0 items-center gap-3 min-w-0">
                        <Image src="/images/platform/bussola.png" alt="" width={32} height={32} className="h-8 w-8 shrink-0 object-contain" />
                        {/* CounselorBot e' il brand principale: titolo grande -> home. */}
                        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                        <a href="/" className="font-display block -m-2 p-2 text-lg sm:text-2xl font-bold text-slate-900 whitespace-nowrap hover:opacity-80 transition-opacity leading-none" aria-label={t('nav.homeAria')}>
                            CounselorBot
                        </a>
                    </div>

                    {nav.loading ? (
                        // Riserva lo spazio mentre l'identità arriva: niente layout shift.
                        <div className="hidden items-center gap-1 lg:flex" aria-hidden="true">
                            <span className="console-topbar-icon"><span className="block h-4 w-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /></span>
                            <span className="console-topbar-icon"><span className="block h-4 w-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /></span>
                        </div>
                    ) : workInline}

                    <div className="ml-auto flex min-w-0 items-center gap-1">
                        {/* Vista attiva dello studente con classi (#146). */}
                        {!nav.loading && nav.classView && <ClassViewSwitcher access={access} className="hidden lg:flex" />}

                        {/* Contesto della conversazione: strumento e counselor scelti,
                            Riprendi. Selezioni salvate, non la prova di una chat aperta. */}
                        <div role="group" aria-label={t('header.conversation')} className="header-group hidden shrink-0 items-center gap-1 lg:flex">
                            <HeaderInstrument />
                            {nav.authenticated && <HeaderCounselor />}
                            <HeaderResume entries={resumeEntries} />
                        </div>

                        {!nav.loading && (
                            <>
                                <span className={cn(SEPARATOR, 'hidden lg:block')} />
                                <div className="hidden min-w-0 items-center gap-1 lg:flex">
                                    <HeaderAccount
                                        account={nav.account}
                                        servicesHref={servicesHref}
                                        servicesLabel={t('header.services')}
                                        logoutHref={nav.authenticated ? AI4AUTH_LOGOUT_URL : undefined}
                                    />
                                    {!nav.authenticated && <SignInLink pathname={pathname} />}
                                </div>

                                <div className="lg:hidden">
                                    <HeaderMenu
                                        links={nav.links}
                                        current={current}
                                        resumeEntries={resumeEntries}
                                        label={t('header.menu')}
                                        accountLabel={nav.account?.label}
                                        access={access}
                                        classView={nav.classView}
                                        authHref={authHref}
                                        authLabel={authLabel}
                                        authIcon={AuthIcon}
                                        servicesHref={servicesHref}
                                        servicesLabel={t('header.services')}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </header>
        </TooltipProvider>
    );
}

// «Accedi» per chi non ha fatto l'accesso: ai4auth riporta alla pagina
// corrente (solo percorsi di questa app, vedi `createAuthUrls`). L'accesso
// amministrativo esplicito resta /login, che torna a /admin, o «Accedi» da /admin.
function SignInLink({ pathname }: { pathname: string }) {
    const { t } = useI18n();
    return (
        <a
            href={ai4authLoginUrl(pathname)}
            // La query (es. /admin?tab=logs) non passa da usePathname: si legge al click.
            onClick={(event) => { event.currentTarget.href = ai4authLoginUrl(`${location.pathname}${location.search}${location.hash}`); }}
            className="console-topbar-action shrink-0 font-semibold text-indigo-700"
        >
            <LogIn className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">{t('header.signIn')}</span>
        </a>
    );
}

function HeaderMenu({
    links,
    current,
    resumeEntries,
    label,
    accountLabel,
    access,
    classView,
    authHref,
    authLabel,
    authIcon: AuthIcon,
    servicesHref,
    servicesLabel,
}: {
    links: HeaderLink[];
    current: HeaderLinkKey | null;
    resumeEntries: ResumeEntries;
    label: string;
    accountLabel?: string;
    access: UserAccess | null;
    classView: boolean;
    authHref: string;
    authLabel: string;
    authIcon: LucideIcon;
    servicesHref?: string;
    servicesLabel: string;
}) {
    const { lang, setLang, t, tf } = useI18n();
    const dark = useDarkMode();
    // L'id resta `mobile-menu`: lo cercano il dialog counselor e i test.
    const { open, containerRef, triggerRef, triggerProps, onBlur, close, closeToTrigger } = useDisclosure('mobile-menu');
    // Il menu si chiude dopo il cambio lingua: la regione di stato annuncia la
    // lingua scelta mentre il focus torna al pulsante del menu.
    const [chosenLanguage, setChosenLanguage] = useState<string | null>(null);
    const { frozen, localResume, pqbl: pqblResume, count: resumeCount } = resumeEntries;
    const currentLanguage = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

    // Ricarica invece di navigare: la home legge lo snapshot dai query param al mount.
    const resumeWithReload = (href: string) => {
        window.location.assign(href);
    };
    const toggleTheme = () => {
        const next = !dark;
        document.documentElement.classList.toggle('dark', next);
        try {
            localStorage.setItem('cb_theme', next ? 'dark' : 'light');
        } catch {
            /* storage non disponibile: la scelta vale solo per la sessione */
        }
        closeToTrigger();
    };
    const itemClass = 'flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700';

    return (
        <div ref={containerRef} className="relative" onBlur={onBlur}>
            <button
                type="button"
                ref={triggerRef}
                {...triggerProps}
                className="console-topbar-icon console-topbar-icon--lg"
                aria-label={label}
            >
                <MoreVertical className="w-4 h-4" />
            </button>
            <span role="status" className="sr-only">
                {chosenLanguage === lang ? `${t('nav.language')}: ${currentLanguage.label}` : ''}
            </span>
            {open && (
                <div id="mobile-menu" className="header-panel absolute right-0 top-full z-[60] mt-2 max-h-[calc(100dvh-4.5rem)] w-[min(88vw,18rem)] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    <div className="compact-header-selection flex flex-wrap items-center gap-2 px-3 py-2 empty:hidden">
                        <HeaderInstrument />
                        {accountLabel && <HeaderCounselor inline onNavigate={close} />}
                    </div>
                    {accountLabel && (
                        <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
                            <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{t('header.account')}</div>
                            <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={accountLabel}>
                                {accountLabel}
                            </div>
                        </div>
                    )}
                    {accountLabel && classView && (
                        <ClassViewSwitcher access={access} labelled className="border-b border-slate-100 px-3 py-2 dark:border-slate-700" />
                    )}
                    <nav aria-label={t('header.menuNavigation')}>
                        {links.map((link) => {
                            const Icon = LINK_ICONS[link.key];
                            return (
                                <Link key={link.key} href={link.href} className={itemClass} aria-current={link.key === current ? 'page' : undefined} onClick={close}>
                                    <Icon className="w-4 h-4 shrink-0" />
                                    <span className="truncate">{t(link.labelKey)}</span>
                                </Link>
                            );
                        })}
                    </nav>
                    {/* Il lettore segue le voci di navigazione, dopo "Gruppi e classi". */}
                    <VoiceReaderMenuEntry className={itemClass} onActivate={close} getOpener={() => triggerRef.current} />
                    <div>
                    {/* Sessioni congelate + chat locale interrotta: su mobile questa è
                        l'unica porta, l'icona "Riprendi" della topbar non c'è. */}
                    {(resumeCount > 0 || resumeEntries.error) && (
                        <div className="border-y border-slate-100 py-1 dark:border-slate-700">
                            <div className="px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-slate-500">
                                {t('frozen.resumeTitle')}
                            </div>
                            <ResumeLoadError entries={resumeEntries} />
                            {frozen.map((row) => (
                                <ResumeEntry key={row.session_id} target={{ kind: 'session', sessionId: row.session_id }} label={resumeLabel(row.questionnaire_type, row.label, tf)}>
                                    <Link
                                        href={resumeHref(row)}
                                        className={itemClass}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            close();
                                            resumeWithReload(resumeHref(row));
                                        }}
                                    >
                                        <RotateCcw className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{resumeLabel(row.questionnaire_type, row.label, tf)}</span>
                                    </Link>
                                </ResumeEntry>
                            ))}
                            {localResume && (
                                <ResumeEntry target={{ kind: 'session', sessionId: localResume.sessionId }} label={`${t('header.resume')} · ${resumeLabel(localResume.instrument, null, tf)}`}>
                                    <Link
                                        href={LOCAL_RESUME_HREF}
                                        className={itemClass}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            close();
                                            resumeWithReload(LOCAL_RESUME_HREF);
                                        }}
                                    >
                                        <RotateCcw className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{t('header.resume')} · {resumeLabel(localResume.instrument, null, tf)}</span>
                                    </Link>
                                </ResumeEntry>
                            )}
                            {pqblResume && (
                                <ResumeEntry target={{ kind: 'pqbl' }} label={`${t('header.resume')} · ${t('pqbl.card.title')}`}>
                                    <Link href={PQBL_RESUME_HREF} className={itemClass} onClick={close}>
                                        <RotateCcw className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{t('header.resume')} · {t('pqbl.card.title')}</span>
                                    </Link>
                                </ResumeEntry>
                            )}
                        </div>
                    )}
                    {servicesHref && (
                        <a href={servicesHref} className={itemClass} onClick={close}>
                            <LayoutGrid className="h-4 w-4 shrink-0" />
                            <span className="truncate">{servicesLabel}</span>
                        </a>
                    )}
                    <a href={authHref} className={itemClass} onClick={close}>
                        <AuthIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{authLabel}</span>
                    </a>
                    <button type="button" className={itemClass} onClick={toggleTheme}>
                        {dark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                        <span className="truncate">{dark ? t('theme.toLight') : t('theme.toDark')}</span>
                    </button>
                    <MotionToggle labelled />
                    <div className="border-t border-slate-100 p-2 dark:border-slate-700">
                        <div className="px-1 pb-1 text-2xs font-semibold uppercase tracking-wide text-slate-500">
                            {t('nav.language')}: {currentLanguage.label}
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                            {LANGUAGES.map((language) => (
                                <button
                                    key={language.code}
                                    type="button"
                                    onClick={() => {
                                        setLang(language.code);
                                        setChosenLanguage(language.code);
                                        closeToTrigger();
                                    }}
                                    title={language.label}
                                    aria-label={language.label}
                                    aria-pressed={language.code === lang}
                                    lang={language.code}
                                    className={cn(
                                        'flex min-h-[44px] items-center justify-center rounded-md transition-colors hover:bg-slate-50 dark:hover:bg-slate-700',
                                        language.code === lang && 'bg-indigo-50 ring-1 ring-indigo-200 dark:bg-indigo-950',
                                    )}
                                >
                                    <FlagIcon code={language.code} className="h-4 w-6" />
                                </button>
                            ))}
                        </div>
                    </div>
                    </div>
                </div>
            )}
        </div>
    );
}
