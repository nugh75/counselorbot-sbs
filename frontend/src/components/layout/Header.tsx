'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, ClipboardList, LayoutGrid, LogIn, LogOut, MoreVertical, Settings, User, type LucideIcon } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { HeaderCounselor } from './HeaderCounselor';
import { ThemeToggle } from './ThemeToggle';
import { Tooltip, TooltipProvider } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import { ai4authLoginUrl, AI4AUTH_LOGOUT_URL, AI4EDUC_PORTAL_URL, AI4EDUC_MANAGER_URL, getIdentity, type Identity } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { canUsePersonalPage, canUseResearchConsole, canUseTeacherAssistant } from '@/lib/roles';

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
    const canOpenTeacherAssistant = canUseTeacherAssistant(identity);
    const canOpenResearchConsole = canUseResearchConsole(identity);
    const canOpenPersonalPage = canUsePersonalPage(identity);

    const isLoading = identity === undefined;
    const isAuthenticated = !!identity?.authenticated;

    // Azioni di navigazione secondarie: in linea da `sm`, raccolte in un menu su mobile.
    const secondaryItems: SecondaryItem[] = [];
    if (isAuthenticated && (canOpenTeacherAssistant || canOpenResearchConsole)) {
        secondaryItems.push({ key: 'services', href: consoleUrl, external: true, icon: LayoutGrid, label: t('header.services') });
    }
    if (canOpenTeacherAssistant) {
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
                <div className="page-wide px-4 sm:px-6 h-full flex items-center gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <AxisMark className="h-8 w-8 shrink-0" />
                        {/* CounselorBot e' il brand principale: titolo grande -> home. */}
                        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                        <a href="/" className="font-display block text-lg sm:text-2xl font-bold text-slate-900 whitespace-nowrap hover:opacity-80 transition-opacity leading-none" aria-label={t('nav.homeAria')}>
                            CounselorBot
                        </a>
                    </div>

                    <div className="ml-auto flex min-w-0 items-center gap-1">
                        {/* Counselor selezionato: chip compatto, cliccabile per cambiarlo. */}
                        <HeaderCounselor />

                        {isLoading ? (
                            // Riserva lo spazio mentre l'identità arriva: niente layout shift.
                            <div className="flex items-center gap-1" aria-hidden="true">
                                <span className="console-topbar-icon"><span className="block h-4 w-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /></span>
                                <span className="console-topbar-icon"><span className="block h-4 w-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /></span>
                            </div>
                        ) : (
                            <>
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

                                {/* Navigazione secondaria: in linea su schermi >= sm. */}
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

                                {/* Navigazione secondaria: menu compatto su mobile. */}
                                {secondaryItems.length > 0 && (
                                    <OverflowMenu items={secondaryItems} label={t('header.menu')} className="sm:hidden" />
                                )}

                                {secondaryItems.length > 0 && <span className={cn(SEPARATOR, 'hidden sm:block')} />}

                                {isAuthenticated ? (
                                    <Tooltip content={t('nav.logout')}>
                                        <a href={AI4AUTH_LOGOUT_URL} className="console-topbar-icon" aria-label={t('nav.logout')}>
                                            <LogOut className="w-4 h-4" />
                                        </a>
                                    </Tooltip>
                                ) : (
                                    <Tooltip content={t('nav.adminLogin')}>
                                        <a href={ai4authLoginUrl('/admin')} className="console-topbar-icon" aria-label={t('nav.adminLogin')}>
                                            <LogIn className="w-4 h-4" />
                                        </a>
                                    </Tooltip>
                                )}
                            </>
                        )}

                        <span className={SEPARATOR} />

                        {/* Set minimo sempre disponibile: feedback, tema, lingua. */}
                        <Tooltip content={t('nav.feedback')}>
                            <Link href="/questionario" className="console-topbar-icon" aria-label={t('nav.feedback')}>
                                <ClipboardList className="w-4 h-4" />
                            </Link>
                        </Tooltip>
                        <ThemeToggle />
                        <LanguageSwitcher />
                    </div>
                </div>
            </header>
        </TooltipProvider>
    );
}

// Mark del brand: il PROFILO è l'artefatto centrale dello strumento. Glifo radar
// — assi + poligono tracciato in petrol, centro "sei qui" in ocra. Sostituisce
// l'icona Bot generica con qualcosa che parla del sottostante (profili a più assi).
function AxisMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
            <g stroke="#155e63" strokeWidth="1" opacity="0.3">
                <line x1="16" y1="16" x2="16" y2="5" />
                <line x1="16" y1="16" x2="25.5" y2="10.5" />
                <line x1="16" y1="16" x2="25.5" y2="21.5" />
                <line x1="16" y1="16" x2="16" y2="27" />
                <line x1="16" y1="16" x2="6.5" y2="21.5" />
                <line x1="16" y1="16" x2="6.5" y2="10.5" />
            </g>
            <polygon
                points="16,7.2 20.8,13.3 24.6,21 16,22.6 7.9,20.7 11.7,13.5"
                fill="#155e63"
                fillOpacity="0.12"
                stroke="#155e63"
                strokeWidth="1.5"
                strokeLinejoin="round"
            />
            <circle cx="16" cy="16" r="1.7" fill="#c9711f" />
        </svg>
    );
}

function OverflowMenu({ items, label, className }: { items: SecondaryItem[]; label: string; className?: string }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

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

    const itemClass = 'flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700';

    return (
        <div ref={ref} className={cn('relative', className)}>
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
                <div role="menu" className="absolute right-0 top-full mt-1 min-w-44 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    {items.map((item) => {
                        const Icon = item.icon;
                        const inner = (
                            <>
                                <Icon className="w-4 h-4 shrink-0" />
                                <span className="truncate">{item.label}</span>
                            </>
                        );
                        return item.external ? (
                            <a key={item.key} role="menuitem" href={item.href} className={itemClass} onClick={() => setOpen(false)}>
                                {inner}
                            </a>
                        ) : (
                            <Link key={item.key} role="menuitem" href={item.href} className={itemClass} onClick={() => setOpen(false)}>
                                {inner}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
