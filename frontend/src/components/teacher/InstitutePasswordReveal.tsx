'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { credentialText } from '@/lib/i18n-institution-credentials';
import { parseInstitutePassword } from '@/lib/institution-credentials';
import type { TeacherInstitute } from '@/lib/teacher-institutes';
import { Button } from '@/components/ui/Button';

// The password is the class access code, not a personal secret. It stays masked
// until a member teacher explicitly asks for the decrypted display copy.
export function InstitutePasswordReveal({ institute, onForbidden }: {
    institute: TeacherInstitute;
    onForbidden: () => void;
}) {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof credentialText>[1]) => credentialText(lang, key);
    const [password, setPassword] = useState<string | null>(null);
    const [visible, setVisible] = useState(false);
    const [missing, setMissing] = useState(false);
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);
    const pending = useRef<AbortController | null>(null);
    const account = useRef(getViewAsAccount()?.username);
    useEffect(() => () => { pending.current?.abort(); }, []);
    useEffect(() => {
        // A saved replacement (or metadata edit) invalidates any revealed copy.
        setPassword(null);
        setVisible(false);
        setMissing(false);
        setError(false);
    }, [institute.revision]);

    const toggle = async () => {
        if (visible) {
            setVisible(false);
            setPassword(null);
            return;
        }
        if (pending.current) return;
        if (account.current !== getViewAsAccount()?.username) {
            onForbidden();
            return;
        }
        const controller = new AbortController();
        pending.current = controller;
        setBusy(true);
        setError(false);
        setMissing(false);
        try {
            const response = await apiFetch(`/api/teacher/institutions/${institute.id}/password`, {
                cache: 'no-store',
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            if (account.current !== getViewAsAccount()?.username || [401, 403].includes(response.status)) {
                onForbidden();
                return;
            }
            if (!response.ok) {
                setError(true);
                return;
            }
            const result = parseInstitutePassword(await response.json());
            setPassword(result.password);
            setVisible(result.password !== null);
            setMissing(result.password === null);
        } catch {
            if (!controller.signal.aborted) setError(true);
        } finally {
            if (!controller.signal.aborted) {
                setBusy(false);
                pending.current = null;
            }
        }
    };

    return <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        <span className="text-slate-600">{l('passwordLabel')}:</span>
        {visible && password !== null
            ? <span className="select-all whitespace-pre-wrap break-all font-mono text-slate-900">{password}</span>
            : <span className="font-mono tracking-widest text-slate-500" aria-hidden="true">••••••••</span>}
        <Button type="button" variant="secondary" size="sm" disabled={busy}
                aria-pressed={visible} onClick={() => void toggle()}>
            {visible ? l('hidePassword') : l('showPassword')}
        </Button>
        {missing && <p className="text-xs text-amber-700">{l('passwordUnavailable')}</p>}
        {error && <p className="text-xs text-red-700" role="alert">{l('revealError')}</p>}
    </div>;
}
