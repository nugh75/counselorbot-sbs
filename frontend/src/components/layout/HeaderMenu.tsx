'use client';

import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, Menu, RotateCcw, type LucideIcon } from 'lucide-react';
import { getSelectedInstrumentId, subscribeToInstrument } from '@/lib/instrument';
import { useI18n } from '@/lib/i18n-context';
import { useDisclosure } from '@/lib/use-disclosure';
import type { HeaderLink, HeaderLinkKey } from '@/lib/header-navigation';
import type { ResumeEntries } from '@/lib/use-resume-entries';
import type { UserAccess } from '@/lib/user-access';
import { cn } from '@/lib/utils';
import { AccountItems, SignInLink } from './HeaderAccount';
import { ClassViewSwitcher } from './ClassViewSwitcher';
import { HeaderCounselor } from './HeaderCounselor';
import { HeaderInstrument } from './HeaderInstrument';
import { ResumeList } from './HeaderResume';

const ROW = 'flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100';

// Menu sotto 1024 px (P5): un pulsante «Menu» con etichetta e un pannello che
// si apre sotto la barra, a tutta larghezza sul telefono. Disclosure come gli
// altri pannelli dell'header (non un drawer modale): Tab lo attraversa, Escape
// lo chiude e riporta il focus al pulsante. Gruppi titolati nell'ordine
// navigazione (aree) → supporto → conversazione → account e preferenze; le
// riprese stanno in un sotto-pannello chiuso, così lingua ed Esci non sono mai
// dopo N sessioni. Le voci dell'account sono quelle del menu desktop.
export function HeaderMenu({ links, current, pathname, resumeEntries, authenticated, account, access, classView, servicesHref, servicesLabel, logoutHref, icons }: {
    links: HeaderLink[];
    current: HeaderLinkKey | null;
    pathname: string;
    resumeEntries: ResumeEntries;
    authenticated: boolean;
    account: { label: string; detail: string | null; title: string } | null;
    access: UserAccess | null;
    classView: boolean;
    servicesHref?: string;
    servicesLabel: string;
    logoutHref?: string;
    icons: Record<HeaderLinkKey, LucideIcon>;
}) {
    const { t } = useI18n();
    // L'id resta `mobile-menu`: lo cercano il dialog counselor e i test.
    const { open, containerRef, triggerRef, triggerProps, onBlur, close, closeToTrigger } = useDisclosure('mobile-menu');
    const [resumeOpen, setResumeOpen] = useState(false);
    // Chiude anche quando la pagina cambia senza passare dal menu (indietro).
    const [openedOn, setOpenedOn] = useState(pathname);
    if (openedOn !== pathname) {
        setOpenedOn(pathname);
        if (open) close();
    }
    const instrument = useSyncExternalStore(subscribeToInstrument, getSelectedInstrumentId, () => null);
    const resumeVisible = resumeEntries.count > 0 || resumeEntries.error;
    const areas = links.filter((link) => link.group === 'area');
    const support = links.filter((link) => link.group === 'support');

    const renderLink = (link: HeaderLink) => {
        const Icon = icons[link.key];
        return (
            <Link
                key={link.key}
                href={link.href}
                className={ROW}
                aria-current={link.key === current ? 'page' : undefined}
                onClick={(event) => {
                    closeToTrigger();
                    if (link.key === 'presentation' && pathname === '/' && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                        event.preventDefault();
                        window.dispatchEvent(new CustomEvent('cb-navigate-intro'));
                    }
                    if (link.key === 'instruments' && pathname === '/') {
                        window.dispatchEvent(new CustomEvent('cb-navigate-home'));
                    }
                }}
            >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{t(link.labelKey)}</span>
            </Link>
        );
    };

    return (
        // Senza `relative`: il pannello si posiziona sulla barra fissa, sotto di essa.
        <div ref={containerRef} onBlur={onBlur}>
            <button type="button" ref={triggerRef} {...triggerProps} className="console-topbar-action min-h-[44px] font-semibold">
                <Menu className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>{t('header.menu')}</span>
            </button>
            {open && (
                <div
                    id="mobile-menu"
                    className="header-panel absolute inset-x-0 top-full z-[60] max-h-[calc(100dvh-4rem)] divide-y divide-slate-100 overflow-y-auto overscroll-contain border-b border-slate-200 bg-white shadow-lg sm:left-auto sm:right-3 sm:mt-2 sm:max-h-[calc(100dvh-4.5rem)] sm:w-96 sm:rounded-md sm:border dark:divide-slate-700 dark:border-slate-700"
                >
                    {classView && <ClassViewSwitcher access={access} labelled className="px-3 py-2" />}
                    <nav aria-label={t('header.menuNavigation')} className="divide-y divide-slate-100 dark:divide-slate-700">
                        {areas.length > 0 && <MenuGroup title={t('header.area')}>{areas.map(renderLink)}</MenuGroup>}
                        <MenuGroup title={t('header.support')}>{support.map(renderLink)}</MenuGroup>
                    </nav>
                    {(instrument || authenticated || resumeVisible) && (
                        <MenuGroup title={t('header.conversation')}>
                            {instrument && <div className="px-3 py-1"><HeaderInstrument /></div>}
                            {authenticated && <HeaderCounselor inline onNavigate={close} />}
                            {resumeVisible && (
                                <>
                                    <button
                                        type="button"
                                        className={ROW}
                                        aria-expanded={resumeOpen}
                                        aria-controls="mobile-resume"
                                        aria-label={t('frozen.resumeTitle')}
                                        onClick={() => setResumeOpen((value) => !value)}
                                    >
                                        <RotateCcw className="h-4 w-4 shrink-0" />
                                        <span className="min-w-0 flex-1 truncate">{t('frozen.resumeTitle')}</span>
                                        {resumeEntries.count > 0 && (
                                            <span className="rounded-full bg-slate-100 px-2 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200" aria-hidden="true">
                                                {resumeEntries.count}
                                            </span>
                                        )}
                                        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', resumeOpen && 'rotate-180')} />
                                    </button>
                                    {resumeOpen && (
                                        <div id="mobile-resume" className="ml-4 border-l border-slate-100 dark:border-slate-700">
                                            <ResumeList entries={resumeEntries} onNavigate={close} />
                                        </div>
                                    )}
                                </>
                            )}
                        </MenuGroup>
                    )}
                    <MenuGroup title={account ? t('header.account') : t('header.preferences')}>
                        <AccountItems
                            account={account}
                            servicesHref={servicesHref}
                            servicesLabel={servicesLabel}
                            logoutHref={logoutHref}
                            onNavigate={close}
                            getOpener={() => triggerRef.current}
                            signIn={authenticated ? undefined : <SignInLink pathname={pathname} row />}
                        />
                    </MenuGroup>
                </div>
            )}
        </div>
    );
}

function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
    const id = useId();
    return (
        <div role="group" aria-labelledby={id} className="py-1">
            <div id={id} className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
            {children}
        </div>
    );
}
