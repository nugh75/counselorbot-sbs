'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, LayoutGrid, LogIn, LogOut, ShieldCheck, User } from 'lucide-react';
import { VoiceReaderMenuEntry } from '@/components/voice-reader/VoiceReader';
import { loginHref } from '@/lib/auth';
import { LANGUAGES } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { useDisclosure } from '@/lib/use-disclosure';
import { cn } from '@/lib/utils';
import { FlagIcon } from './FlagIcon';
import { MotionToggle } from './MotionToggle';
import { ThemeToggle } from './ThemeToggle';

const ROW = 'flex min-h-control w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink-body hover:bg-surface-raised';

type Account = { label: string; detail: string | null; title: string } | null;

// Menu utente della barra desktop (P4): sotto il nome l'identificativo (non è
// un link: l'ingresso a /profilo è «Area studente»), i servizi ai4educ per
// ricercatori e admin, le preferenze, Esci in fondo. Per chi non ha fatto
// l'accesso lo stesso pannello si chiama «Preferenze». Tema, movimento e
// lingua cambiano sul posto: il pannello resta aperto e il focus non si sposta.
export function HeaderAccount({ account, servicesHref, servicesLabel, logoutHref }: {
    account: Account;
    servicesHref?: string;
    servicesLabel: string;
    logoutHref?: string;
}) {
    const { lang, t } = useI18n();
    const { open, containerRef, triggerRef, triggerProps, onBlur, close } = useDisclosure('account-panel');
    const currentLanguage = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

    return (
        <div className="relative min-w-0" ref={containerRef} onBlur={onBlur}>
            <button
                type="button"
                ref={triggerRef}
                {...triggerProps}
                className="console-topbar-action max-w-full"
                aria-label={account ? t('header.accountMenu').replace('{name}', account.label) : undefined}
                title={account?.title}
            >
                {account ? <User className="h-4 w-4 shrink-0" /> : <FlagIcon code={currentLanguage.code} className="h-4 w-6 shrink-0" />}
                <span className="min-w-16 max-w-28 truncate xl:max-w-40">{account ? account.label : t('header.preferences')}</span>
                <ChevronDown className="h-4 w-4 shrink-0" />
            </button>
            {open && (
                <div id="account-panel" className="header-panel absolute right-0 top-full z-[60] mt-2 max-h-[calc(100dvh-4.5rem)] w-72 overflow-y-auto rounded-control border border-line bg-surface py-1 shadow-pop">
                    <AccountItems
                        account={account}
                        servicesHref={servicesHref}
                        servicesLabel={servicesLabel}
                        logoutHref={logoutHref}
                        onNavigate={close}
                        getOpener={() => triggerRef.current}
                    />
                </div>
            )}
        </div>
    );
}

// Contenuto del menu utente, condiviso con il gruppo account del menu mobile
// (P5): stesse voci e stesso ordine a ogni larghezza. `signIn` è la riga
// «Accedi» del menu mobile, dove la barra non ha spazio per il pulsante.
export function AccountItems({ account, servicesHref, servicesLabel, logoutHref, onNavigate, getOpener, signIn }: {
    account: Account;
    servicesHref?: string;
    servicesLabel: string;
    logoutHref?: string;
    onNavigate: () => void;
    getOpener: () => HTMLElement | null;
    signIn?: ReactNode;
}) {
    const { lang, setLang, t } = useI18n();
    return (
        <>
            {account && (
                <div className="border-b border-line px-4 py-2">
                    <div className="truncate text-sm font-semibold text-ink" title={account.title}>{account.label}</div>
                    {account.detail && <div className="truncate text-xs text-ink-muted">{account.detail}</div>}
                </div>
            )}
            {servicesHref && (
                <a href={servicesHref} className={cn(ROW, 'border-b border-line')} onClick={onNavigate}>
                    <LayoutGrid className="h-4 w-4 shrink-0" />
                    <span className="truncate">{servicesLabel}</span>
                </a>
            )}
            <Link href="/privacy" className={cn(ROW, 'border-b border-line')} onClick={onNavigate}>
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span className="truncate">{t('privacy.title')}</span>
            </Link>
            <div role="group" aria-label={t('header.preferences')}>
                {account && (
                    <div className="px-4 pb-1 pt-2 text-2xs font-semibold text-ink-muted" aria-hidden="true">
                        {t('header.preferences')}
                    </div>
                )}
                <ThemeToggle labelled />
                <MotionToggle labelled />
                <VoiceReaderMenuEntry className={ROW} onActivate={onNavigate} getOpener={getOpener} />
                <div className="px-4 pb-1 pt-2 text-2xs font-semibold text-ink-muted" aria-hidden="true">
                    {t('nav.language')}
                </div>
                <div className="grid grid-cols-2 gap-1 px-2 pb-2">
                    {LANGUAGES.map((language) => (
                        <button
                            key={language.code}
                            type="button"
                            onClick={() => setLang(language.code)}
                            aria-pressed={language.code === lang}
                            lang={language.code}
                            className={cn(
                                'flex min-h-control items-center gap-2 rounded-control px-2 text-left text-sm text-ink-body transition-colors hover:bg-surface-raised',
                                language.code === lang && 'bg-brand-soft font-semibold ring-1 ring-brand-line',
                            )}
                        >
                            <FlagIcon code={language.code} className="h-4 w-6 shrink-0" />
                            <span className="truncate">{language.label}</span>
                        </button>
                    ))}
                </div>
            </div>
            {logoutHref && (
                <a href={logoutHref} className={cn(ROW, 'border-t border-line')} onClick={onNavigate}>
                    <LogOut className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t('header.signOut')}</span>
                </a>
            )}
            {signIn}
        </>
    );
}

// «Accedi» per chi non ha fatto l'accesso. In produzione ai4auth riporta alla
// pagina corrente (solo percorsi di questa app, vedi `createAuthUrls`); con il
// fornitore locale resta su /login e non lascia mai questo host.
// L'accesso amministrativo esplicito resta /login, che torna a /admin, o
// «Accedi» da /admin. `row` è la variante del menu mobile, in fondo come «Esci».
export function SignInLink({ pathname, row = false }: { pathname: string; row?: boolean }) {
    const { t } = useI18n();
    return (
        <a
            href={loginHref(pathname)}
            // La query (es. /admin?tab=logs) non passa da usePathname: si legge al click.
            onClick={(event) => { event.currentTarget.href = loginHref(`${location.pathname}${location.search}${location.hash}`); }}
            className={row ? cn(ROW, 'border-t border-line font-semibold text-link') : 'console-topbar-action shrink-0 font-semibold text-link'}
        >
            <LogIn className="h-4 w-4 shrink-0" />
            <span className={row ? 'truncate' : 'whitespace-nowrap'}>{t('header.signIn')}</span>
        </a>
    );
}
