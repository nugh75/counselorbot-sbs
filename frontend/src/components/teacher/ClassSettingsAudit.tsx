'use client';

import { useI18n } from '@/lib/i18n-context';
import { classSettingsText } from '@/lib/i18n-class-settings';
import type { ClassSettings } from '@/lib/class-settings';
import { useTeacherResource } from './useTeacherResource';
import { TeacherForbidden, TeacherLoading } from './TeacherAccess';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';

interface AuditRow {
    id: number; actor_username: string; actor_display_name: string | null;
    actor_role: string; action: 'setting_change' | 'lock' | 'unlock';
    target_kind: string; target_id: string; old_value: unknown; new_value: unknown;
    reason: string | null; created_at: string;
}
function parseAudit(data: unknown): AuditRow[] {
    if (!Array.isArray(data) || !data.every(row => row && Number.isInteger(row.id)
        && ['setting_change', 'lock', 'unlock'].includes(row.action) && typeof row.target_id === 'string')) throw new Error('Invalid audit log');
    return data;
}

export function ClassSettingsAudit({ settings }: { settings: ClassSettings }) {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof classSettingsText>[1]) => classSettingsText(lang, key);
    const resource = useTeacherResource(`/api/teacher/groups/${settings.group_id}/settings/audit-log`, parseAudit);
    const valueText = (value: unknown): string => {
        if (value === null) return '—';
        if (typeof value === 'number') return settings.counselors.find(row => row.id === value)?.name ?? String(value);
        if (typeof value === 'object' && value) {
            const row = value as { enabled?: boolean; value?: boolean; locked?: boolean };
            return l((row.enabled ?? row.value) ? 'enabled' : 'disabled') + (row.locked ? ` · ${l('locked')}` : '');
        }
        return String(value);
    };
    const targetText = (row: AuditRow) => {
        if (row.target_kind === 'counselor') return settings.counselors.find(item => String(item.id) === row.target_id)?.name ?? row.target_id;
        if (row.target_kind === 'settings_bulk') return l('counselorDefault');
        if (row.target_kind === 'forum_option') return l(row.target_id === 'premoderation' ? 'premoderation' : 'studentsCanOpen');
        const tool = settings.tools.find(item => item.key === row.target_id);
        return tool?.label_i18n[lang] || tool?.label_i18n.en || row.target_id;
    };
    if (resource.forbidden) return <TeacherForbidden />;
    if (resource.loading) return <TeacherLoading />;
    if (resource.failed) return <Callout variant="danger">{l('loadError')} <Button onClick={() => void resource.reload()}>{l('reload')}</Button></Callout>;
    return <section className="space-y-3" aria-label={l('audit')}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-slate-800">{l('audit')}</h2>
            <Button variant="secondary" onClick={() => void resource.reload()}>{l('reload')}</Button></div>
        {!resource.data?.length && <p className="text-sm text-slate-600">{l('auditEmpty')}</p>}
        {resource.data?.map(row => <Card key={row.id}><div className="break-words text-sm text-slate-700">
            <p className="font-semibold">{targetText(row)} · {l(row.action)}</p>
            <p>{valueText(row.old_value)} → {valueText(row.new_value)}</p>
            <p>{row.actor_display_name || row.actor_username} ({row.actor_username}) · <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString(lang)}</time></p>
            {row.reason && <p className="mt-2 whitespace-pre-wrap">{row.reason}</p>}
        </div></Card>)}
    </section>;
}
