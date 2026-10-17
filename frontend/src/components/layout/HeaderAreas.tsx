'use client';

import Link from 'next/link';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { useDisclosure } from '@/lib/use-disclosure';
import type { HeaderLink, HeaderLinkKey } from '@/lib/header-navigation';

// Ingresso alle aree nella barra desktop (P4): con una sola area un link
// «Area studente»; con più aree un selettore «Area» che mostra l'area corrente
// e apre l'elenco filtrato per ruolo. Disclosure come gli altri pannelli.
export function HeaderAreas({ areas, current, icons }: { areas: HeaderLink[]; current: HeaderLinkKey | null; icons: Record<HeaderLinkKey, LucideIcon> }) {
    const { t } = useI18n();
    const { open, containerRef, triggerRef, triggerProps, onBlur, close } = useDisclosure('area-panel');

    if (areas.length === 0) return null;
    if (areas.length === 1) {
        const [area] = areas;
        const Icon = icons[area.key];
        return (
            <Link href={area.href} className="console-topbar-action" aria-current={area.key === current ? 'page' : undefined}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{t(area.labelKey)}</span>
            </Link>
        );
    }

    const currentArea = areas.find((area) => area.key === current);
    const Icon = currentArea ? icons[currentArea.key] : null;
    return (
        <div className="relative" ref={containerRef} onBlur={onBlur}>
            <button
                type="button"
                ref={triggerRef}
                {...triggerProps}
                className="console-topbar-action"
                data-current={currentArea ? 'true' : undefined}
            >
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                <span className="whitespace-nowrap">{currentArea ? t(currentArea.labelKey) : t('header.area')}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            </button>
            {open && (
                <div id="area-panel" className="header-panel absolute left-0 top-full z-[60] mt-2 w-64 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                    {areas.map((area) => {
                        const AreaIcon = icons[area.key];
                        return (
                            <Link
                                key={area.key}
                                href={area.href}
                                onClick={close}
                                aria-current={area.key === current ? 'page' : undefined}
                                className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                            >
                                <AreaIcon className="h-4 w-4 shrink-0" />
                                <span className="truncate">{t(area.labelKey)}</span>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
