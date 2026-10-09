'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { credentialText, type CredentialTextKey } from '@/lib/i18n-institution-credentials';
import { instituteText } from '@/lib/i18n-teacher-institutes';
import { credentialDraftError, credentialPayload } from '@/lib/institution-credentials';
import { parseTeacherInstitute, type TeacherInstitute } from '@/lib/teacher-institutes';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { TeacherForbidden } from './TeacherAccess';

const input = 'w-full min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm';

// Write-only: the password is never prefilled, read back or kept after a successful save.
export function InstituteCredentialsEditor({ institute, onSaved, onCancel }: { institute: TeacherInstitute; onSaved: () => void; onCancel: () => void }) {
    const { lang } = useI18n();
    const l = (key: CredentialTextKey) => credentialText(lang, key);
    const [code, setCode] = useState(institute.institution_code ?? '');
    const [password, setPassword] = useState('');
    const [notice, setNotice] = useState<CredentialTextKey | null>(null);
    const [busy, setBusy] = useState(false);
    const [forbidden, setForbidden] = useState(false);
    const pending = useRef<AbortController | null>(null);
    const account = useRef(getViewAsAccount()?.username);
    useEffect(() => () => { pending.current?.abort(); }, []);
    const dirty = password !== '' || code !== (institute.institution_code ?? '');
    useDraftGuard(dirty, instituteText(lang, 'discard'), { blocked: busy });
    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (pending.current) return;
        const invalid = credentialDraftError(code, password);
        if (invalid) { setNotice(invalid === 'code' ? 'invalidCode' : 'invalidPassword'); return; }
        if (account.current !== getViewAsAccount()?.username) { setForbidden(true); return; }
        const controller = new AbortController();
        pending.current = controller;
        setBusy(true); setNotice(null);
        try {
            const response = await apiFetch(`/api/teacher/institutions/${institute.id}/credentials`, {
                method: 'PUT', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentialPayload(code, password, institute.revision)),
            });
            if (controller.signal.aborted) return;
            if (account.current !== getViewAsAccount()?.username || [401, 403].includes(response.status)) { setForbidden(true); return; }
            if (response.status === 409) {
                const detail = (await response.json().catch(() => null))?.detail;
                setNotice(detail === 'institution_code_conflict' ? 'codeConflict' : 'conflict');
                return;
            }
            if (response.status === 422) { setNotice('invalidPassword'); return; }
            if (!response.ok) { setNotice('error'); return; }
            parseTeacherInstitute(await response.json());
            setPassword('');
            onSaved();
        } catch { if (!controller.signal.aborted) setNotice('error'); }
        finally { if (!controller.signal.aborted) { setBusy(false); pending.current = null; } }
    };
    if (forbidden) return <TeacherForbidden />;
    return <form onSubmit={event => void save(event)} className="mt-3 space-y-3" aria-label={l(institute.credentials_configured ? 'replaceCredentials' : 'setCredentials')}>
        <p className="text-sm text-slate-600">{l('writeOnly')}</p>
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">{l('code')}<input className={input} required maxLength={50} autoComplete="off" value={code} onChange={event => setCode(event.target.value)} /></label>
            <label className="space-y-1 text-sm">{l('password')}<input type="password" className={input} required autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        </fieldset>
        {notice && <Callout variant="danger"><p role="alert">{l(notice)}</p></Callout>}
        <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !code.trim() || !password}>{l('saveCredentials')}</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => { setPassword(''); onCancel(); }}>{instituteText(lang, 'cancel')}</Button>
        </div>
    </form>;
}

