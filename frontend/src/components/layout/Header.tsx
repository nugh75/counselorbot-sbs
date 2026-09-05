'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Bot, ClipboardList, Compass, LayoutGrid, LogIn, LogOut, Moon, MoreVertical, RotateCcw, Settings, Sun, User, Users, type LucideIcon } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { HeaderCounselor } from './HeaderCounselor';
import { HeaderInstrument } from './HeaderInstrument';
import { HeaderResume } from './HeaderResume';
import { MotionToggle } from './MotionToggle';
import { ThemeToggle } from './ThemeToggle';
import { FlagIcon } from './FlagIcon';
import { Tooltip, TooltipProvider } from '@/components/ui/Tooltip';
import { CompassMark } from '@/components/ui/CompassMark';
import { LANGUAGES } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ai4authLoginUrl, AI4AUTH_LOGOUT_URL, AI4EDUC_PORTAL_URL, AI4EDUC_MANAGER_URL, getIdentity, type Identity } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { canUseAssistant, canUsePersonalPage, canUseResearchConsole, canUseTeacherAssistant, isResearcher, isTeacher } from '@/lib/roles';
import { useDarkMode } from '@/lib/use-dark-mode';
import { LOCAL_RESUME_HREF, PQBL_RESUME_HREF, resumeHref, useResumeEntries, type ResumeEntries } from '@/lib/use-resume-entries';

interface SecondaryItem {
    key: string;
    href: string;
    external?: boolean;
    icon: LucideIcon;
    label: string;
}

const SEPARATOR = 'mx-1 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700';

export function Header() {
    const { t } = useI18n();
    const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);
    // Le voci "Riprendi" vivono qui e servono due rendering: l'icona su schermi
    // >= xl e il menu mobile. Un solo fetch, lo stesso elenco.
    const resumeEntries = useResumeEntries();

    useEffect(() => {
        getIdentity().then(setIdentity);
    }, []);

    const accountLabel = identity?.name || identity?.email || identity?.username;
    // Console ai4educ: admin -> manager, tutti gli altri (incl. caricamento) -> portale.
    const consoleUrl = identity?.is_admin ? AI4EDUC_MANAGER_URL : AI4EDUC_PORTAL_URL;
    const canOpenAssistant = canUseAssistant(identity);
    const canOpenResearchConsole = canUseResearchConsole(identity);
    const canOpenPersonalPage = canUsePersonalPage(identity);

    const isLoading = identity === undefined;
    const isAuthenticated = !!identity?.authenticated;
    const showServices = isAuthenticated && canOpenResearchConsole;
    const authHref = isAuthenticated ? AI4AUTH_LOGOUT_URL : ai4authLoginUrl('/admin');
    const authLabel = isAuthenticated ? t('nav.logout') : t('nav.adminLogin');
    const AuthIcon = isAuthenticated ? LogOut : LogIn;

    // Azioni di navigazione secondarie: in linea da `xl`, raccolte in un menu su mobile.
    const secondaryItems: SecondaryItem[] = [];
    // Guida all'interfaccia: disponibile per tutti, anche senza login.
    secondaryItems.push({ key: 'guide', href: '/guide', icon: BookOpen, label: t('nav.guide') });
    if (isAuthenticated && !identity?.is_admin && !isResearcher(identity) && !isTeacher(identity)) {
        secondaryItems.push({ key: 'orientation', href: '/bussola', icon: Compass, label: t('nav.orientation') });
    }
    if (canOpenAssistant) {
        secondaryItems.push({ key: 'assistant', href: '/assistente', icon: Bot, label: t('assistant.title') });
    }
    if (canOpenPersonalPage) {
        secondaryItems.push({ key: 'profile', href: '/profilo', icon: User, label: t('profile.nav') });
    }
    if (canUseTeacherAssistant(identity)) {
        // Docenti, ricercatori e admin: gruppi/classi (piani di somministrazione).
        secondaryItems.push({
            key: 'teacher-panel',
            href: '/docente',
            icon: Users,
            label: t(canOpenResearchConsole ? 'nav.groupsClasses' : 'nav.teacherPanel'),
        });
    }
    if (canOpenResearchConsole) {
        secondaryItems.push({ key: 'admin', href: '/admin', icon: Settings, label: t('nav.admin') });
    }

    return (
        <TooltipProvider delayDuration={300}>
            <header className="console-header fixed top-0 left-0 right-0 z-50">
                <div className="page-wide h-full flex items-center gap-3 px-3 sm:gap-4 sm:px-6">
                    <div className="flex shrink-0 items-center gap-3 min-w-0">
                        <CompassMark className="h-8 w-8 shrink-0" />
                        {/* CounselorBot e' il brand principale: titolo grande -> home. */}
                        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                        <a href="/" className="font-display block -m-2 p-2 text-lg sm:text-2xl font-bold text-slate-900 whitespace-nowrap hover:opacity-80 transition-opacity leading-none" aria-label={t('nav.homeAria')}>
                            CounselorBot
                        </a>
                    </div>

                    <div className="ml-auto flex min-w-0 items-center gap-1">
                        {/* Strumento e counselor selezionati: badge compatti durante il percorso. */}
                        <div className="hidden shrink-0 items-center gap-1 xl:flex">
                            <HeaderInstrument />
                            <HeaderCounselor />
                        </div>

                        {isLoading ? (
                            // Riserva lo spazio mentre l'identità arriva: niente layout shift.
                            <div className="hidden items-center gap-1 xl:flex" aria-hidden="true">
                                <span className="console-topbar-icon"><span className="block h-4 w-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /></span>
                                <span className="console-topbar-icon"><span className="block h-4 w-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /></span>
                            </div>
                        ) : (
                            <>
                                <MobileHeaderMenu
                                    items={secondaryItems}
                                    resumeEntries={resumeEntries}
                                    label={t('header.menu')}
                                    accountLabel={accountLabel}
                                    authHref={authHref}
                                    authLabel={authLabel}
                                    authIcon={AuthIcon}
                                    servicesHref={showServices ? consoleUrl : undefined}
                                    servicesLabel={t('header.services')}
                                />

                                {accountLabel && canOpenPersonalPage && (
                                    <Link
                                        href="/profilo"
                                        title={[identity?.username, identity?.email, identity?.groups.join(', ')].filter(Boolean).join(' - ')}
                                        className="hidden xl:inline min-w-0 max-w-32 truncate px-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors font-medium"
                                    >
                                        {accountLabel}
                                    </Link>
                                )}
                                {accountLabel && !canOpenPersonalPage && (
                                    <span
                                        title={[identity?.username, identity?.email, identity?.groups.join(', ')].filter(Boolean).join(' - ')}
                                        className="hidden xl:inline min-w-0 max-w-32 truncate px-2 text-sm text-slate-500 font-medium"
                                    >
                                        {accountLabel}
                                    </span>
                                )}

                                {/* Navigazione secondaria: in linea su schermi >= xl; su mobile sta tutta nel menu. */}
                                {secondaryItems.length > 0 && (
                                    <div className="hidden items-center gap-1 xl:flex">
                                        {secondaryItems.map((item) => {
                                            const Icon = item.icon;
                                            return (
                                                <Tooltip key={item.key} content={item.label}>
                                                    {item.external ? (
                                                        <a href={item.href} className="console-topbar-icon" aria-label={item.label}>
                                                            <Icon className="w-4 h-4" />
                                                        </a>
                                                    ) : (
                                                        <Link href={item.href} className="console-topbar-icon" aria-label={item.label}>
                                                            <Icon className="w-4 h-4" />
                                                        </Link>
                                                    )}
                                                </Tooltip>
                                            );
                                        })}
                                    </div>
                                )}

                                {secondaryItems.length > 0 && <span className={cn(SEPARATOR, 'hidden xl:block')} />}

                                {/* Accedi ad altre risorse: subito prima di Esci. */}
                                {showServices && (
                                    <div className="hidden xl:block">
                                        <Tooltip content={t('header.services')}>
                                            <a href={consoleUrl} className="console-topbar-icon" aria-label={t('header.services')} title={t('header.services')}>
                                                <LayoutGrid className="w-4 h-4" />
                                            </a>
                                        </Tooltip>
                                    </div>
                                )}

                                <div className="hidden xl:block">
                                    <Tooltip content={authLabel}>
                                        <a href={authHref} className="console-topbar-icon" aria-label={authLabel}>
                                            <AuthIcon className="w-4 h-4" />
                                        </a>
                                    </Tooltip>
                                </div>
                            </>
                        )}

                        <span className={cn(SEPARATOR, 'hidden xl:block')} />

                        {/* Riprendi la sessione interrotta (se presente). Su mobile la
                            stessa lista sta nel menu: qui l'icona affollerebbe la barra. */}
                        <div className="hidden xl:block">
                            <HeaderResume entries={resumeEntries} />
                        </div>

                        {/* Set minimo sempre disponibile: feedback, tema, lingua. */}
                        <div className="hidden items-center gap-1 xl:flex">
                            <Tooltip content={t('nav.feedback')}>
                                <Link href="/questionario" className="console-topbar-icon" aria-label={t('nav.feedback')}>
                                    <ClipboardList className="w-4 h-4" />
                                </Link>
                            </Tooltip>
                            <ThemeToggle />
                            <MotionToggle />
                            <LanguageSwitcher />
                        </div>
                    </div>
                </div>
            </header>
        </TooltipProvider>
    );
}

function MobileHeaderMenu({
    items,
    resumeEntries,
    label,
    accountLabel,
    authHref,
    authLabel,
    authIcon: AuthIcon,
    servicesHref,
    servicesLabel,
}: {
    items: SecondaryItem[];
    resumeEntries: ResumeEntries;
    label: string;
    accountLabel?: string;
    authHref: string;
    authLabel: string;
    authIcon: LucideIcon;
    servicesHref?: string;
    servicesLabel: string;
}) {
    const { lang, setLang, t } = useI18n();
    const dark = useDarkMode();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const { frozen, localResume, pqbl: pqblResume, count: resumeCount } = resumeEntries;
    const currentLanguage = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const close = () => setOpen(false);
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
        close();
    };
    const itemClass = 'flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700';

    return (
        <div ref={ref} className="relative xl:hidden">
            <button
                type="button"
                ref={triggerRef}
                className="console-topbar-icon console-topbar-icon--lg"
                aria-expanded={open}
                aria-controls="mobile-menu"
                aria-label={label}
                onClick={() => setOpen((v) => !v)}
            >
                <MoreVertical className="w-4 h-4" />
            </button>
            {open && (
                <div id="mobile-menu" className="absolute right-0 top-full z-[60] mt-2 max-h-[calc(100dvh-4.5rem)] w-[min(88vw,18rem)] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    <div className="compact-header-selection flex flex-wrap items-center gap-2 px-3 py-2 empty:hidden">
                        <HeaderInstrument />
                        <HeaderCounselor />
                    </div>
                    {accountLabel && (
                        <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
                            <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{t('header.account')}</div>
                            <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={accountLabel}>
                                {accountLabel}
                            </div>
                        </div>
                    )}
                    {items.map((item) => {
                        const Icon = item.icon;
                        const inner = (
                            <>
                                <Icon className="w-4 h-4 shrink-0" />
                                <span className="truncate">{item.label}</span>
                            </>
                        );
                        return item.external ? (
                            <a key={item.key}href={item.href} className={itemClass} onClick={close}>
                                {inner}
                            </a>
                        ) : (
                            <Link key={item.key}href={item.href} className={itemClass} onClick={close}>
                                {inner}
                            </Link>
                        );
                    })}
                    {/* Sessioni congelate + chat locale interrotta: su mobile questa è
                        l'unica porta, l'icona "Riprendi" della topbar non c'è. */}
                    {resumeCount > 0 && (
                        <div className="border-y border-slate-100 py-1 dark:border-slate-700">
                            <div className="px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-slate-500">
                                {t('frozen.resumeTitle')}
                            </div>
                            {frozen.map((row) => (
                                <Link
                                    key={row.session_id}
                                    href={resumeHref(row)}
                                    className={itemClass}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        close();
                                        resumeWithReload(resumeHref(row));
                                    }}
                                >
                                    <RotateCcw className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{row.label || row.questionnaire_type}</span>
                                </Link>
                            ))}
                            {localResume && (
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
                                    <span className="truncate">{t('header.resume')} · {localResume.instrument}</span>
                                </Link>
                            )}
                            {pqblResume && (
                                <Link href={PQBL_RESUME_HREF} className={itemClass} onClick={close}>
                                    <RotateCcw className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{t('header.resume')} · {t('pqbl.card.badge')}</span>
                                </Link>
                            )}
                        </div>
                    )}
                    <Link href="/questionario" className={itemClass} onClick={close}>
                        <ClipboardList className="h-4 w-4 shrink-0" />
                        <span className="truncate">{t('nav.feedback')}</span>
                    </Link>
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
                                        close();
                                    }}
                                    title={language.label}
                                    aria-label={language.label}
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
            )}
        </div>
    );
}
