'use client';

import { useId } from 'react';
import type { Lang } from '@/lib/i18n';

type Props = {
    code: Lang;
    className?: string;
};

/**
 * Inline SVG flags — render identically on every OS/browser (emoji flags are
 * unreliable: Windows shows two boxed letters and some fonts bleed adjacent
 * glyphs, which looked like overlapping flags in the language switcher).
 */
export function FlagIcon({ code, className = 'h-4 w-6' }: Props) {
    const common = `inline-block overflow-hidden rounded-[2px] ring-1 ring-black/10 ${className}`;

    switch (code) {
        case 'it':
            return (
                <svg viewBox="0 0 3 2" className={common} preserveAspectRatio="none" aria-hidden>
                    <rect width="3" height="2" fill="#fff" />
                    <rect width="1" height="2" fill="#009246" />
                    <rect x="2" width="1" height="2" fill="#ce2b37" />
                </svg>
            );
        case 'fr':
            return (
                <svg viewBox="0 0 3 2" className={common} preserveAspectRatio="none" aria-hidden>
                    <rect width="3" height="2" fill="#fff" />
                    <rect width="1" height="2" fill="#0055a4" />
                    <rect x="2" width="1" height="2" fill="#ef4135" />
                </svg>
            );
        case 'de':
            return (
                <svg viewBox="0 0 3 3" className={common} preserveAspectRatio="none" aria-hidden>
                    <rect width="3" height="3" fill="#ffce00" />
                    <rect width="3" height="2" fill="#d00" />
                    <rect width="3" height="1" fill="#000" />
                </svg>
            );
        case 'es':
            return (
                <svg viewBox="0 0 3 2" className={common} preserveAspectRatio="none" aria-hidden>
                    <rect width="3" height="2" fill="#aa151b" />
                    <rect y="0.5" width="3" height="1" fill="#f1bf00" />
                </svg>
            );
        case 'sv':
            return (
                <svg viewBox="0 0 16 10" className={common} preserveAspectRatio="none" aria-hidden>
                    <rect width="16" height="10" fill="#006aa7" />
                    <rect x="5" width="2" height="10" fill="#fecc00" />
                    <rect y="4" width="16" height="2" fill="#fecc00" />
                </svg>
            );
        case 'en':
        default:
            return <UnionJack className={common} />;
    }
}

function UnionJack({ className }: { className: string }) {
    const uid = useId().replace(/:/g, '');
    const clipS = `uj-s-${uid}`;
    const clipT = `uj-t-${uid}`;
    return (
        <svg viewBox="0 0 60 30" className={className} preserveAspectRatio="none" aria-hidden>
            <clipPath id={clipS}>
                <path d="M0,0 v30 h60 v-30 z" />
            </clipPath>
            <clipPath id={clipT}>
                <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
            </clipPath>
            <g clipPath={`url(#${clipS})`}>
                <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
                <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
                <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${clipT})`} stroke="#c8102e" strokeWidth="4" />
                <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
                <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
            </g>
        </svg>
    );
}
