'use client';

import { recommendationText } from '@/lib/i18n-recommendations';
import type { StudentRequest } from '@/lib/recommendations';

/** Open requests this step takes up: each «Riprendi» starts a turn dedicated to one of them. */
export function RevisitRequestsBar({ items, locale, disabled, onRevisit }: {
    items: StudentRequest[];
    locale: string;
    disabled: boolean;
    onRevisit: (item: StudentRequest) => void;
}) {
    if (!items.length) return null;
    return (
        <section aria-label={recommendationText('request.revisit.title', locale, { count: items.length })}
            className="border-t border-amber-100 bg-amber-50 px-3 py-2 sm:px-4" data-testid="revisit-requests">
            <h3 className="text-sm font-semibold text-amber-900">
                {recommendationText('request.revisit.title', locale, { count: items.length })}
            </h3>
            <p className="text-xs text-amber-800">{recommendationText('request.revisit.help', locale)}</p>
            <ul className="mt-1 space-y-1">
                {items.map(item => (
                    <li key={item.slug} className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words text-sm text-slate-800">{item.name}</span>
                        <button type="button" disabled={disabled} onClick={() => onRevisit(item)}
                            className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                            {recommendationText('request.revisit.action', locale)}
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
