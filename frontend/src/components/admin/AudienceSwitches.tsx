'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { notifyChatGPTChange } from '@/lib/chatgpt';
import { useI18n } from '@/lib/i18n-context';
import { personalAPIText } from '@/lib/i18n-personal-api';

type Switches = { teachers: boolean; students: boolean };
type Audiences = { api: Switches; chatgpt: Switches };

// Teachers use their own sources for their chats; students in the chats of their classes.
export function AudienceSwitches({ feature }: { feature: 'api' | 'chatgpt' }) {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof personalAPIText>[1]) => personalAPIText(lang, key);
    const [values, setValues] = useState<Switches | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        void apiFetch('/api/admin/personal-ai-audiences', { cache: 'no-store' })
            .then(async response => { if (response.ok) setValues(((await response.json()) as Audiences)[feature]); }).catch(() => setFailed(true));
    }, [feature]);
    if (!values) return failed ? <p role="alert" className="text-sm text-red-600">{l('error')}</p> : null;
    const save = async (next: Switches) => {
        const previous = values;
        setValues(next); setBusy(true); setFailed(false);
        try {
            const response = await apiFetch('/api/admin/personal-ai-audiences', {
                method: 'PUT', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CounselorBot' },
                body: JSON.stringify({ [feature]: next }),
            });
            if (!response.ok) throw new Error();
            setValues(((await response.json()) as Audiences)[feature]); notifyChatGPTChange();
        } catch { setValues(previous); setFailed(true); } finally { setBusy(false); }
    };
    const label = feature === 'api' ? { teachers: l('audienceTeachersApi'), students: l('audienceStudentsApi') }
        : { teachers: l('audienceTeachersChatgpt'), students: l('audienceStudentsChatgpt') };
    return <fieldset className="mt-3 space-y-1 rounded-lg border border-slate-200 p-3" data-testid={`audience-${feature}`} disabled={busy}>
        <legend className="px-1 text-sm font-semibold text-slate-800">{l('audienceTitle')}</legend>
        {(['teachers', 'students'] as const).map(audience => <label key={audience} className="flex min-h-11 items-center gap-3 text-sm text-slate-800">
            <input type="checkbox" checked={values[audience]} onChange={event => void save({ ...values, [audience]: event.target.checked })} />
            {label[audience]}
        </label>)}
        <p className="text-sm text-slate-600">{l('audienceHelp')}</p>
        {failed && <p role="alert" className="text-sm text-red-600">{l('error')}</p>}
    </fieldset>;
}
