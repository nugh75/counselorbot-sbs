'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cloud, LogIn, LogOut, Settings } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ai4authLoginUrl, AI4AUTH_LOGOUT_URL, AI4EDUC_PORTAL_URL, AI4EDUC_MANAGER_URL, getIdentity, type Identity } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';

export function Header() {
    const { t } = useI18n();
    const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);

    useEffect(() => {
        getIdentity().then(setIdentity);
    }, []);

    const accountLabel = identity?.name || identity?.email || identity?.username;
    // Console ai4educ: admin -> manager, tutti gli altri (incl. caricamento) -> portale.
    const consoleUrl = identity?.is_admin ? AI4EDUC_MANAGER_URL : AI4EDUC_PORTAL_URL;

    return (
        <header className="console-header fixed top-0 left-0 right-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <Cloud className="w-7 h-7 shrink-0 text-indigo-600" strokeWidth={1.8} />
                    <div className="min-w-0 leading-tight">
                        {/* Console ai4educ: portale per utenti, manager per admin. */}
                        <a href={consoleUrl} className="block font-bold text-sm sm:text-base text-slate-900 whitespace-nowrap hover:opacity-80 transition-opacity" aria-label="ai4educ console">
                            ai4educ console
                        </a>
                        {/* Anchor nativo: tornando alla home viene resettato il percorso a fasi. */}
                        <a href="/" className="block text-xs text-slate-500 whitespace-nowrap hover:text-slate-900 transition-colors" aria-label={t('nav.homeAria')}>
                            CounselorBot
                        </a>
                    </div>
                </div>

                <div className="ml-auto flex min-w-0 items-center gap-1">
                    {accountLabel && (
                        <span
                            title={[identity?.username, identity?.email, identity?.groups.join(', ')].filter(Boolean).join(' - ')}
                            className="hidden md:inline max-w-52 truncate text-sm text-slate-500 mr-1"
                        >
                            {accountLabel}
                        </span>
                    )}
                    {identity?.is_admin && (
                        <Link href="/admin" className="console-topbar-action" title={t('nav.admin')} aria-label={t('nav.admin')}>
                            <Settings className="w-4 h-4" />
                            <span className="hidden sm:inline">{t('nav.admin')}</span>
                        </Link>
                    )}
                    {identity !== undefined && !identity?.authenticated && (
                        <a href={ai4authLoginUrl('/admin')} className="console-topbar-action" title={t('nav.adminLogin')} aria-label={t('nav.adminLogin')}>
                            <LogIn className="w-4 h-4" />
                            <span className="hidden sm:inline">{t('nav.adminLogin')}</span>
                        </a>
                    )}
                    {identity?.authenticated && (
                        <a href={AI4AUTH_LOGOUT_URL} className="console-topbar-action" title={t('nav.logout')} aria-label={t('nav.logout')}>
                            <LogOut className="w-4 h-4" />
                            <span className="hidden sm:inline">{t('nav.logout')}</span>
                        </a>
                    )}
                    <LanguageSwitcher />
                </div>
            </div>
        </header>
    );
}
