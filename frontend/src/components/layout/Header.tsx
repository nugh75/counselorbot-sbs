'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, LayoutGrid, LogIn, LogOut, Settings, User } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { HeaderCounselor } from './HeaderCounselor';
import { ThemeToggle } from './ThemeToggle';
import { ai4authLoginUrl, AI4AUTH_LOGOUT_URL, AI4EDUC_PORTAL_URL, AI4EDUC_MANAGER_URL, getIdentity, type Identity } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { canUseResearchConsole, canUseTeacherAssistant } from '@/lib/roles';

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

    return (
        <header className="console-header fixed top-0 left-0 right-0 z-50">
            <div className="page-wide px-4 sm:px-6 h-full flex items-center gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <Bot className="w-8 h-8 shrink-0 text-indigo-600" strokeWidth={1.8} />
                    {/* CounselorBot e' il brand principale: titolo grande -> home. */}
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a href="/" className="block text-lg sm:text-2xl font-bold text-slate-900 whitespace-nowrap hover:opacity-80 transition-opacity leading-none" aria-label={t('nav.homeAria')}>
                        CounselorBot
                    </a>
                </div>

                <div className="ml-auto flex min-w-0 items-center gap-1">
                    {/* Counselor selezionato: chip compatto, cliccabile per cambiarlo. */}
                    <HeaderCounselor />
                    {identity?.authenticated && (canOpenTeacherAssistant || canOpenResearchConsole) && (
                        <a href={consoleUrl} className="console-topbar-icon" title="Servizi piattaforma ai4educ" aria-label="Servizi piattaforma ai4educ">
                            <LayoutGrid className="w-4 h-4" />
                        </a>
                    )}
                    {canOpenTeacherAssistant && (
                        <Link href="/assistente" className="console-topbar-icon" title="Assistente docente" aria-label="Assistente docente">
                            <Bot className="w-4 h-4" />
                        </Link>
                    )}
                    {accountLabel && (
                        <Link
                            href="/profilo"
                            title={[identity?.username, identity?.email, identity?.groups.join(', ')].filter(Boolean).join(' - ')}
                            className="hidden sm:inline max-w-52 truncate px-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors font-medium"
                        >
                            {accountLabel}
                        </Link>
                    )}
                    {identity?.authenticated && (
                        <Link href="/profilo" className="console-topbar-icon" title={t('profile.nav')} aria-label={t('profile.nav')}>
                            <User className="w-4 h-4" />
                        </Link>
                    )}
                    {canOpenResearchConsole && (
                        <Link href="/admin" className="console-topbar-icon" title={t('nav.admin')} aria-label={t('nav.admin')}>
                            <Settings className="w-4 h-4" />
                        </Link>
                    )}
                    {identity !== undefined && !identity?.authenticated && (
                        <a href={ai4authLoginUrl('/admin')} className="console-topbar-icon" title={t('nav.adminLogin')} aria-label={t('nav.adminLogin')}>
                            <LogIn className="w-4 h-4" />
                        </a>
                    )}
                    {identity?.authenticated && (
                        <a href={AI4AUTH_LOGOUT_URL} className="console-topbar-icon" title={t('nav.logout')} aria-label={t('nav.logout')}>
                            <LogOut className="w-4 h-4" />
                        </a>
                    )}
                    <ThemeToggle />
                    <LanguageSwitcher />
                </div>
            </div>
        </header>
    );
}
