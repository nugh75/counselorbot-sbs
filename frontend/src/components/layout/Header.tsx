'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { BookOpen, Bot, Compass, GraduationCap, LayoutGrid, Settings, User, type LucideIcon } from 'lucide-react';
import { ClassViewSwitcher } from './ClassViewSwitcher';
import { HeaderAccount, SignInLink } from './HeaderAccount';
import { HeaderAreas } from './HeaderAreas';
import { HeaderCounselor } from './HeaderCounselor';
import { HeaderInstrument } from './HeaderInstrument';
import { HeaderMenu } from './HeaderMenu';
import { HeaderResume } from './HeaderResume';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import { AI4AUTH_LOGOUT_URL, AI4EDUC_PORTAL_URL, AI4EDUC_MANAGER_URL, getIdentity, type Identity } from '@/lib/auth';
import { currentHeaderLink, headerNavigation, type HeaderLinkKey } from '@/lib/header-navigation';
import { useUserAccess } from '@/lib/use-user-access';
import { useI18n } from '@/lib/i18n-context';
import { useResumeEntries } from '@/lib/use-resume-entries';

const LINK_ICONS: Record<HeaderLinkKey, LucideIcon> = {
    instruments: LayoutGrid,
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
    const logoutHref = nav.authenticated ? AI4AUTH_LOGOUT_URL : undefined;

    // Barra desktop (P4): prima l'ingresso alle aree, poi gli strumenti di
    // supporto, con etichette visibili e mai tagliate. Se lo spazio manca si
    // accorciano vista classe, counselor e nome dell'account, a destra.
    const workInline = (
        <nav aria-label={t('header.navigation')} className="hidden shrink-0 items-center gap-1 lg:flex">
            <HeaderAreas areas={nav.links.filter(link => link.group === 'area')} current={current} icons={LINK_ICONS} />
            {nav.links.filter(link => link.group === 'support').map((link) => {
                const Icon = LINK_ICONS[link.key];
                return (
                    <Link
                        key={link.key}
                        href={link.href}
                        className="console-topbar-action shrink-0"
                        aria-current={link.key === current ? 'page' : undefined}
                        onClick={() => {
                            if (link.key === 'instruments' && pathname === '/') {
                                window.dispatchEvent(new CustomEvent('cb-navigate-home'));
                            }
                        }}
                    >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="whitespace-nowrap">{t(link.labelKey)}</span>
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
                                        logoutHref={logoutHref}
                                    />
                                    {!nav.authenticated && <SignInLink pathname={pathname} />}
                                </div>

                                <div className="lg:hidden">
                                    <HeaderMenu
                                        links={nav.links}
                                        current={current}
                                        pathname={pathname}
                                        resumeEntries={resumeEntries}
                                        authenticated={nav.authenticated}
                                        account={nav.account}
                                        access={access}
                                        classView={nav.classView}
                                        servicesHref={servicesHref}
                                        servicesLabel={t('header.services')}
                                        logoutHref={logoutHref}
                                        icons={LINK_ICONS}
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
