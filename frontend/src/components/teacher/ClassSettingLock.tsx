'use client';

import type { ClassItemLock } from '@/lib/class-settings';
import { classSettingsText } from '@/lib/i18n-class-settings';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';

export function ClassSettingLock({ item, label, disabled, admin, onChange }: {
    item: ClassItemLock & { admin_enabled: boolean }; label: string; disabled: boolean; admin: boolean;
    onChange: (state: boolean | null) => void;
}) {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof classSettingsText>[1]) => classSettingsText(lang, key);
    return <div className="space-y-1 text-xs text-slate-600">
        {(item.locked || item.changed_by_admin) && <p title={item.locked ? `${l('locked')} · ${item.locked_by ?? ''} · ${item.locked_at ? new Date(item.locked_at).toLocaleString(lang) : ''}` : undefined}>
            {l(item.locked ? 'locked' : 'changed')}{item.locked && ` · ${l(item.locked_enabled ? 'enabled' : 'disabled')}`}
        </p>}
        {admin && <div role="group" aria-label={`${l('adminEdit')}: ${label}`} className="flex flex-wrap gap-1">
            <Button variant="secondary" disabled={disabled || !item.admin_enabled || (item.locked && item.locked_enabled === true)} onClick={() => onChange(true)}>{l('lockOn')}</Button>
            <Button variant="secondary" disabled={disabled || (item.locked && item.locked_enabled === false)} onClick={() => onChange(false)}>{l('lockOff')}</Button>
            {item.locked && <Button variant="secondary" disabled={disabled} onClick={() => onChange(null)}>{l('unlock')}</Button>}
        </div>}
    </div>;
}
