'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Bot, ClipboardList, LayoutGrid, LogIn, LogOut, Moon, MoreVertical, RotateCcw, Settings, Sun, User, type LucideIcon } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { HeaderCounselor } from './HeaderCounselor';
import { HeaderInstrument } from './HeaderInstrument';
import { HeaderResume } from './HeaderResume';
import { ThemeToggle } from './ThemeToggle';
import { FlagIcon } from './FlagIcon';
import { Tooltip, TooltipProvider } from '@/components/ui/Tooltip';
import { CompassMark } from '@/components/ui/CompassMark';
import { LANGUAGES } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ai4authLoginUrl, AI4AUTH_LOGOUT_URL, AI4EDUC_PORTAL_URL, AI4EDUC_MANAGER_URL, getIdentity, type Identity } from '@/lib/auth';
import { getResume, subscribeToResume } from '@/lib/resume';
import { useI18n } from '@/lib/i18n-context';
import { canUseAssistant, canUsePersonalPage, canUseResearchConsole } from '@/lib/roles';
import { useDarkMode } from '@/lib/use-dark-mode';

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

    // Azioni di navigazione secondarie: in linea da `sm`, raccolte in un menu su mobile.
    const secondaryItems: SecondaryItem[] = [];
    if (canOpenAssistant) {
        secondaryItems.push({ key: 'assistant', href: '/assistente', icon: Bot, label: t('assistant.title') });
    }
    if (canOpenPersonalPage) {
        secondaryItems.push({ key: 'profile', href: '/profilo', icon: User, label: t('profile.nav') });
    }
    if (canOpenResearchConsole) {
        secondaryItems.push({ key: 'admin', href: '/admin', icon: Settings, label: t('nav.admin') });
    }

    return (
        <TooltipProvider delayDuration={300}>
            <header className="console-header fixed top-0 left-0 right-0 z-50">
                <div className="page-wide h-full flex items-center gap-3 px-3 sm:gap-4 sm:px-6">
                    <div className="flex items-center gap-3 min-w-0">
                        <CompassMark className="h-8 w-8 shrink-0" />
                        {/* CounselorBot e' il brand principale: titolo grande -> home. */}
                        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                        <a href="/" className="font-display block text-lg sm:text-2xl font-bold text-slate-900 whitespace-nowrap hover:opacity-80 transition-opacity leading-none" aria-label={t('nav.homeAria')}>
                            CounselorBot
                        </a>
                    </div>

                    <div className="ml-auto flex min-w-0 items-center gap-1">
                        {/* Strumento e counselor selezionati: badge compatti durante il percorso. */}
                        <div className="hidden min-w-0 items-center gap-1 sm:flex">
                            <HeaderInstrument />
                            <HeaderCounselor />
                        </div>

                        {isLoading ? (
                            // Riserva lo spazio mentre l'identità arriva: niente layout shift.
                            <div className="hidden items-center gap-1 sm:flex" aria-hidden="true">
                                <span className="console-topbar-icon"><span className="block h-4 w-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /></span>
                                <span className="console-topbar-icon"><span className="block h-4 w-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /></span>
                            </div>
                        ) : (
                            <>
                                <MobileHeaderMenu
                                    items={secondaryItems}
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
                                        className="hidden sm:inline max-w-52 truncate px-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors font-medium"
                                    >
                                        {accountLabel}
                                    </Link>
                                )}
                                {accountLabel && !canOpenPersonalPage && (
                                    <span
                                        title={[identity?.username, identity?.email, identity?.groups.join(', ')].filter(Boolean).join(' - ')}
                                        className="hidden sm:inline max-w-52 truncate px-2 text-sm text-slate-500 font-medium"
                                    >
                                        {accountLabel}
                                    </span>
                                )}

                                {/* Navigazione secondaria: in linea su schermi >= sm; su mobile sta tutta nel menu. */}
                                {secondaryItems.length > 0 && (
                                    <div className="hidden items-center gap-1 sm:flex">
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

                                {secondaryItems.length > 0 && <span className={cn(SEPARATOR, 'hidden sm:block')} />}

                                {/* Accedi ad altre risorse: subito prima di Esci. */}
                                {showServices && (
                                    <div className="hidden sm:block">
                                        <Tooltip content={t('header.services')}>
                                            <a href={consoleUrl} className="console-topbar-icon" aria-label={t('header.services')} title={t('header.services')}>
                                                <LayoutGrid className="w-4 h-4" />
                                            </a>
                                        </Tooltip>
                                    </div>
                                )}

                                <div className="hidden sm:block">
                                    <Tooltip content={authLabel}>
                                        <a href={authHref} className="console-topbar-icon" aria-label={authLabel}>
                                            <AuthIcon className="w-4 h-4" />
                                        </a>
                                    </Tooltip>
                                </div>
                            </>
                        )}

                        <span className={cn(SEPARATOR, 'hidden sm:block')} />

                        {/* Riprendi la sessione interrotta (se presente). */}
                        <div className="hidden sm:block">
                            <HeaderResume />
                        </div>

                        {/* Set minimo sempre disponibile: feedback, tema, lingua. */}
                        <div className="hidden items-center gap-1 sm:flex">
                            <Tooltip content={t('nav.feedback')}>
                                <Link href="/questionario" className="console-topbar-icon" aria-label={t('nav.feedback')}>
                                    <ClipboardList className="w-4 h-4" />
                                </Link>
                            </Tooltip>
                            <ThemeToggle />
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
    label,
    accountLabel,
    authHref,
    authLabel,
    authIcon: AuthIcon,
    servicesHref,
    servicesLabel,
}: {
    items: SecondaryItem[];
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
    const hasResume = useSyncExternalStore(
        subscribeToResume,
        () => (getResume() ? '1' : null),
        () => null,
    );
    const currentLanguage = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const close = () => setOpen(false);
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
    const itemClass = 'flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700';

    return (
        <div ref={ref} className="relative sm:hidden">
            <button
                type="button"
                className="console-topbar-icon"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={label}
                onClick={() => setOpen((v) => !v)}
            >
                <MoreVertical className="w-4 h-4" />
            </button>
            {open && (
                <div role="menu" className="absolute right-0 top-full z-[60] mt-2 w-[min(88vw,18rem)] overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    {accountLabel && (
                        <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Account</div>
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
                            <a key={item.key} role="menuitem" href={item.href} className={itemClass} onClick={close}>
                                {inner}
                            </a>
                        ) : (
                            <Link key={item.key} role="menuitem" href={item.href} className={itemClass} onClick={close}>
                                {inner}
                            </Link>
                        );
                    })}
                    {hasResume && (
                        <Link role="menuitem" href="/?resume=1" className={itemClass} onClick={close}>
                            <RotateCcw className="h-4 w-4 shrink-0" />
                            <span className="truncate">{t('header.resume')}</span>
                        </Link>
                    )}
                    <Link role="menuitem" href="/questionario" className={itemClass} onClick={close}>
                        <ClipboardList className="h-4 w-4 shrink-0" />
                        <span className="truncate">{t('nav.feedback')}</span>
                    </Link>
                    {servicesHref && (
                        <a role="menuitem" href={servicesHref} className={itemClass} onClick={close}>
                            <LayoutGrid className="h-4 w-4 shrink-0" />
                            <span className="truncate">{servicesLabel}</span>
                        </a>
                    )}
                    <a role="menuitem" href={authHref} className={itemClass} onClick={close}>
                        <AuthIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{authLabel}</span>
                    </a>
                    <button type="button" role="menuitem" className={itemClass} onClick={toggleTheme}>
                        {dark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                        <span className="truncate">{dark ? t('theme.toLight') : t('theme.toDark')}</span>
                    </button>
                    <div className="border-t border-slate-100 p-2 dark:border-slate-700">
                        <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {t('nav.language')}: {currentLanguage.label}
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                            {LANGUAGES.map((language) => (
                                <button
                                    key={language.code}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        setLang(language.code);
                                        close();
                                    }}
                                    title={language.label}
                                    aria-label={language.label}
                                    className={cn(
                                        'flex h-9 items-center justify-center rounded-md transition-colors hover:bg-slate-50 dark:hover:bg-slate-700',
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
