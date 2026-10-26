'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound, Loader2, LogIn, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { localPairingText, type LocalPairingTextKey } from '@/lib/i18n-local-pairing';
import { formatPersonalCode, type PairedStudent, type RecoveredStudent } from '@/lib/local-pairing';

type SessionResult = {
    pseudonym: string;
    status: 'active' | 'pending';
    personalCode?: string;
};

export default function JoinPage() {
    const router = useRouter();
    const { lang } = useI18n();
    const l = (key: LocalPairingTextKey, vars?: Record<string, string | number>) => localPairingText(lang, key, vars);
    const [classKey, setClassKey] = useState('');
    const [keyFromLink, setKeyFromLink] = useState(false);
    const [pseudonym, setPseudonym] = useState('');
    const [deviceLabel, setDeviceLabel] = useState('');
    const [personalCode, setPersonalCode] = useState('');
    const [busy, setBusy] = useState<'pair' | 'recover' | null>(null);
    const [error, setError] = useState('');
    const [result, setResult] = useState<SessionResult | null>(null);
    const [codeSaved, setCodeSaved] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let current = true;
        const key = new URLSearchParams(window.location.hash.slice(1)).get('k');
        if (key) {
            setClassKey(key);
            setKeyFromLink(true);
            // La chiave resta nel frammento e non deve finire nella cronologia del browser.
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        }
        void apiFetch('/api/auth/me').then(async response => {
            if (!response.ok) return;
            const identity = await response.json() as {
                authenticated?: boolean;
                auth_provider?: string;
                groups?: string[];
                name?: string;
            };
            if (current && identity.authenticated && identity.auth_provider === 'local' && identity.groups?.includes('studenti')) {
                setResult({ pseudonym: identity.name || '', status: 'active' });
            }
        }).catch(() => {
            // L'accesso resta disponibile anche se il controllo della sessione fallisce.
        });
        return () => { current = false; };
    }, []);

    const responseError = async (response: Response, recovery: boolean) => {
        if (response.status === 429) {
            const seconds = Number(response.headers.get('Retry-After')) || 60;
            return l('rateLimited', { seconds });
        }
        if (response.status === 400) return l('invalidPayload');
        if (response.status === 401) return l(recovery ? 'invalidPersonalCode' : 'invalidClassCode');
        return l('networkError');
    };

    const handlePair = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy) return;
        setBusy('pair');
        setError('');
        try {
            const response = await apiFetch('/api/local-auth/pair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key: classKey,
                    pseudonym,
                    device_label: deviceLabel.trim() || undefined,
                }),
            });
            if (!response.ok) {
                setError(await responseError(response, false));
                return;
            }
            const student = await response.json() as PairedStudent;
            setResult({ pseudonym: student.pseudonym, status: student.status, personalCode: student.personal_code });
            setClassKey('');
            setPersonalCode('');
        } catch {
            setError(l('networkError'));
        } finally {
            setBusy(null);
        }
    };

    const handleRecover = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy) return;
        setBusy('recover');
        setError('');
        try {
            const response = await apiFetch('/api/local-auth/recover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ personal_code: personalCode, device_label: deviceLabel.trim() || undefined }),
            });
            if (!response.ok) {
                setError(await responseError(response, true));
                return;
            }
            const student = await response.json() as RecoveredStudent;
            let status: SessionResult['status'] = 'active';
            const identityResponse = await apiFetch('/api/auth/me').catch(() => null);
            if (identityResponse?.ok) {
                const identity = await identityResponse.json() as { authenticated?: boolean };
                if (!identity.authenticated) status = 'pending';
            }
            setResult({ pseudonym: student.pseudonym, status });
            setPersonalCode('');
        } catch {
            setError(l('networkError'));
        } finally {
            setBusy(null);
        }
    };

    const copyCode = async () => {
        if (!result?.personalCode || !navigator.clipboard) return;
        try {
            await navigator.clipboard.writeText(formatPersonalCode(result.personalCode));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            // Il campo resta selezionabile anche senza permesso degli appunti.
        }
    };

    if (result) {
        const active = result.status === 'active';
        return (
            <main id="contenuto" className="page-narrow space-y-6 py-8">
                <PageHeader
                    title={l(active ? 'activeTitle' : 'pendingTitle')}
                    subtitle={l(active ? 'activeBody' : 'pendingBody', { pseudonym: result.pseudonym })}
                    icon={active
                        ? <UserRoundCheck className="h-7 w-7 text-indigo-600" aria-hidden />
                        : <ShieldCheck className="h-7 w-7 text-amber-700" aria-hidden />}
                />
                <Callout variant={active ? 'success' : 'warning'} title={l(active ? 'activeTitle' : 'pendingTitle')}>
                    {l(active ? 'activeBody' : 'pendingBody', { pseudonym: result.pseudonym })}
                </Callout>
                {result.personalCode && (
                    <Card>
                        <section aria-labelledby="personal-code-heading" className="space-y-4">
                            <div>
                                <h2 id="personal-code-heading" className="text-lg font-bold text-slate-800">{l('personalCodeTitle')}</h2>
                                <p className="mt-1 text-sm text-slate-600">{l('personalCodeHint')}</p>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <label htmlFor="paired-personal-code" className="sr-only">{l('personalCodeLabel')}</label>
                                <input
                                    id="paired-personal-code"
                                    readOnly
                                    value={formatPersonalCode(result.personalCode)}
                                    onFocus={event => event.target.select()}
                                    className="min-h-11 min-w-0 flex-1 rounded-md border border-indigo-200 bg-indigo-50 px-3 text-center font-mono text-xl font-bold tracking-widest text-indigo-950"
                                />
                                <Button type="button" variant="secondary" onClick={() => void copyCode()}>
                                    {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                                    {l(copied ? 'copied' : 'copy')}
                                </Button>
                            </div>
                            <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={codeSaved}
                                    onChange={event => setCodeSaved(event.target.checked)}
                                    className="h-4 w-4 rounded-xs border-slate-300 text-indigo-600"
                                />
                                {l('savedCode')}
                            </label>
                        </section>
                    </Card>
                )}
                <Button
                    type="button"
                    variant="accent"
                    disabled={Boolean(result.personalCode) && !codeSaved}
                    onClick={() => active ? router.replace('/') : window.location.reload()}
                >
                    {l(active ? 'continue' : 'refresh')}
                </Button>
            </main>
        );
    }

    return (
        <main id="contenuto" className="page-narrow space-y-6 py-8">
            <PageHeader
                title={l('pageTitle')}
                subtitle={l('pageSubtitle')}
                icon={<KeyRound className="h-7 w-7 text-indigo-600" aria-hidden />}
            />
            {!keyFromLink && <Callout variant="info">{l('missingKey')}</Callout>}
            {error && <Callout variant="danger">{error}</Callout>}

            <Card>
                <form onSubmit={event => void handlePair(event)} className="space-y-4" aria-labelledby="pair-heading">
                    <div>
                        <h2 id="pair-heading" className="text-lg font-bold text-slate-800">{l('pairTitle')}</h2>
                        <p className="mt-1 text-sm text-slate-600">{l('pairHint')}</p>
                    </div>
                    <label htmlFor="class-pairing-key" className="block text-sm font-semibold text-slate-700">
                        {l('classKeyLabel')}
                        <input
                            id="class-pairing-key"
                            required
                            maxLength={128}
                            value={classKey}
                            onChange={event => setClassKey(event.target.value)}
                            placeholder={l('classKeyPlaceholder')}
                            autoComplete="off"
                            spellCheck={false}
                            aria-describedby={keyFromLink ? 'class-key-origin' : undefined}
                            className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                        />
                    </label>
                    {keyFromLink && <p id="class-key-origin" className="text-xs text-slate-500">{l('keyFromLink')}</p>}
                    <label htmlFor="pair-pseudonym" className="block text-sm font-semibold text-slate-700">
                        {l('pseudonymLabel')}
                        <input
                            id="pair-pseudonym"
                            required
                            maxLength={40}
                            value={pseudonym}
                            onChange={event => setPseudonym(event.target.value)}
                            placeholder={l('pseudonymPlaceholder')}
                            autoComplete="off"
                            className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                        />
                    </label>
                    <label htmlFor="pair-device-label" className="block text-sm font-semibold text-slate-700">
                        {l('deviceLabel')}
                        <input
                            id="pair-device-label"
                            maxLength={80}
                            value={deviceLabel}
                            onChange={event => setDeviceLabel(event.target.value)}
                            placeholder={l('devicePlaceholder')}
                            autoComplete="off"
                            className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
                        />
                    </label>
                    <Button type="submit" variant="accent" disabled={busy !== null || !classKey.trim() || !pseudonym.trim()}>
                        {busy === 'pair' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}
                        {l(busy === 'pair' ? 'pairBusy' : 'pairSubmit')}
                    </Button>
                </form>
            </Card>

            <Card>
                <form onSubmit={event => void handleRecover(event)} className="space-y-4" aria-labelledby="recover-heading">
                    <div>
                        <h2 id="recover-heading" className="text-lg font-bold text-slate-800">{l('recoverTitle')}</h2>
                        <p className="mt-1 text-sm text-slate-600">{l('recoverHint')}</p>
                    </div>
                    <label htmlFor="recovery-personal-code" className="block text-sm font-semibold text-slate-700">
                        {l('personalCodeLabel')}
                        <input
                            id="recovery-personal-code"
                            required
                            maxLength={64}
                            value={personalCode}
                            onChange={event => setPersonalCode(event.target.value)}
                            placeholder={l('personalCodePlaceholder')}
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-lg uppercase tracking-widest text-slate-900"
                        />
                    </label>
                    <Button type="submit" variant="secondary" disabled={busy !== null || !personalCode.trim()}>
                        {busy === 'recover' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        {l(busy === 'recover' ? 'recoverBusy' : 'recoverSubmit')}
                    </Button>
                </form>
            </Card>
        </main>
    );
}
