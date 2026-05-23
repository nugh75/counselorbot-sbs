'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogIn, LogOut, Settings } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ai4authLoginUrl, AI4AUTH_LOGOUT_URL, getIdentity, type Identity } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';

export function Header() {
    const { t } = useI18n();
    const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);

    useEffect(() => {
        getIdentity().then(setIdentity);
    }, []);

    const accountLabel = identity?.name || identity?.email || identity?.username;

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
            <div className="console-topbar">
                <div className="container mx-auto px-4 h-full flex items-center justify-end gap-1">
                    {accountLabel && (
                        <span
                            title={[identity?.username, identity?.email, identity?.groups.join(', ')].filter(Boolean).join(' - ')}
                            className="hidden sm:inline max-w-52 truncate text-xs text-slate-500 mr-1"
                        >
                            {accountLabel}
                        </span>
                    )}
                    {identity?.is_admin && (
                        <Link href="/admin" className="console-topbar-action">
                            <Settings className="w-4 h-4" />
                            {t('nav.admin')}
                        </Link>
                    )}
                    {identity !== undefined && !identity?.authenticated && (
                        <a href={ai4authLoginUrl('/admin')} className="console-topbar-action">
                            <LogIn className="w-4 h-4" />
                            {t('nav.adminLogin')}
                        </a>
                    )}
                    {identity?.authenticated && (
                        <a href={AI4AUTH_LOGOUT_URL} className="console-topbar-action">
                            <LogOut className="w-4 h-4" />
                            {t('nav.logout')}
                        </a>
                    )}
                </div>
            </div>
            <div className="container mx-auto px-4 h-16 flex items-center">
                {/* Anchor nativo (non next/link): forza reload → reset dello stato a fasi della home */}
                <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity" aria-label={t('nav.homeAria')}>
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                    </div>
                    <span className="font-bold text-xl tracking-tight text-slate-800">
                        CounselorBot
                    </span>
                </a>
                <div className="ml-auto">
                    <LanguageSwitcher />
                </div>
            </div>
        </header>
    );
}
