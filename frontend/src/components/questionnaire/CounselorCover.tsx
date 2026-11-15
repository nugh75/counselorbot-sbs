'use client';

import React, { useState } from 'react';
import { Play } from 'lucide-react';
import type { PublicCounselor } from '@/lib/counselor';
import { useI18n } from '@/lib/i18n-context';
import { formatCategoryLabel } from '@/lib/i18n-counselor-identity';

export interface CounselorCoverProps {
    src?: string | null;
    alt: string;
    counselor: PublicCounselor;
    className?: string;
    compact?: boolean;
    videoUrl?: string | null;
}

/**
 * Calcola un hash intero deterministico da una stringa per garantire
 * coerenza di colori e geometrie nel fallback procedurale.
 */
function getDeterministicHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

/**
 * Fallback vettoriale procedurale SVG generato quando l'asset statico manca
 * o fallisce il caricamento. Disegno piatto con la stessa grammatica di
 * `ui/ToolIllustration` (tratto `--i-out`, campiture `--i-*`, che hanno il
 * valore scuro): un motivo per la categoria di approccio primaria, il
 * monogramma e l'etichetta della categoria.
 */
const CATEGORY_MOTIFS: Record<string, (rot: number) => React.ReactNode> = {
    // Archi maieutici: sfera, orbita e astro.
    filosofo: (rot) => <>
        <circle cx="240" cy="90" r="56" fill="var(--i-paper)" />
        <ellipse cx="240" cy="90" rx="70" ry="22" transform={`rotate(${-20 + rot} 240 90)`} />
        <circle cx="240" cy="90" r="30" fill="var(--i-sky)" />
        <circle cx="240" cy="90" r="10" fill="var(--i-yellow)" />
    </>,
    // Onde di ascolto e cerchi sull'acqua.
    psicologo: () => <>
        <circle cx="236" cy="72" r="40" fill="var(--i-paper)" />
        <circle cx="236" cy="72" r="24" fill="var(--i-sky)" />
        <circle cx="236" cy="72" r="8" fill="var(--i-yellow)" />
        <path d="M150 180c40-50 90-30 170-60v60z" fill="var(--i-teal)" />
        <path d="M190 180c30-30 70-20 130-34" stroke="var(--i-paper)" />
    </>,
    // Gradini e freccia di slancio.
    tutor: () => <>
        <rect x="170" y="120" width="40" height="40" rx="2" fill="var(--i-paper)" />
        <rect x="210" y="90" width="40" height="70" rx="2" fill="var(--i-sky)" />
        <rect x="250" y="60" width="40" height="100" rx="2" fill="var(--i-teal)" />
        <path d="M176 104l80-74" strokeWidth="4" />
        <path d="M232 28h26v26" fill="var(--i-orange)" />
    </>,
    // Lavagna con righe e bersaglio.
    docente: () => <>
        <rect x="160" y="30" width="110" height="80" rx="2" fill="var(--i-teal2)" />
        <path d="M178 54h50M178 74h70" stroke="var(--i-paper)" />
        <path d="M196 110l-12 44M234 110l12 44" />
        <circle cx="282" cy="120" r="24" fill="var(--i-paper)" />
        <circle cx="282" cy="120" r="12" fill="var(--i-yellow)" />
        <circle cx="282" cy="120" r="4" fill="var(--i-orange)" />
    </>,
    // Rete di nodi e dati.
    ricercatore: () => <>
        <path d="M180 110l45-50 50 25M225 60l30 70M180 110l75 20M275 85l20-40" />
        <circle cx="180" cy="110" r="10" fill="var(--i-teal)" />
        <circle cx="225" cy="60" r="12" fill="var(--i-yellow)" />
        <circle cx="275" cy="85" r="10" fill="var(--i-sky)" />
        <circle cx="255" cy="130" r="9" fill="var(--i-paper)" />
        <circle cx="295" cy="45" r="8" fill="var(--i-orange)" />
    </>,
    // Bussola: ago nord-est in ocra, coda in petrol.
    orientatore: (rot) => <>
        <circle cx="240" cy="90" r="56" fill="var(--i-paper)" />
        <path d="M240 38v8M240 134v8M188 90h8M284 90h8" />
        <g transform={`rotate(${35 + rot} 240 90)`}>
            <path d="M240 46l9 44h-18z" fill="var(--i-orange)" />
            <path d="M240 134l9-44h-18z" fill="var(--i-teal2)" />
        </g>
        <circle cx="240" cy="90" r="5" fill="var(--i-paper)" />
    </>,
};

function ProceduralCoverFallback({
    counselor,
    lang,
}: {
    counselor: PublicCounselor;
    lang: string;
}) {
    const slug = counselor.slug || counselor.name || String(counselor.id);
    const subtleRot = (getDeterministicHash(slug) % 20) - 10;

    // Categoria primaria tra quelle note o prima specificata
    const matchedCategory = counselor.approach_categories?.find((cat) =>
        Object.hasOwn(CATEGORY_MOTIFS, cat.toLowerCase().trim())
    )?.toLowerCase().trim();
    const primaryCategory = matchedCategory || counselor.approach_categories?.[0]?.toLowerCase().trim() || 'orientatore';
    const motif = CATEGORY_MOTIFS[primaryCategory] ?? CATEGORY_MOTIFS.orientatore;

    // Iniziali del nome per il monogramma (max 2 lettere)
    const initials = counselor.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() || '')
        .join('');

    return (
        <svg
            viewBox="0 0 320 180"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid slice"
            className="h-full w-full select-none"
            aria-hidden="true"
            fill="none"
            stroke="var(--i-out)"
            strokeWidth={2.5}
            strokeLinejoin="miter"
            strokeLinecap="butt"
        >
            <rect width="320" height="180" fill="var(--i-cream)" stroke="none" />
            {motif(subtleRot)}
            <circle cx="64" cy="82" r="32" fill="var(--i-paper)" />
            <text x="64" y="90" textAnchor="middle" fill="var(--i-out)" stroke="none" fontSize="22" fontFamily="sans-serif" fontWeight="600">
                {initials}
            </text>
            <text x="64" y="148" textAnchor="middle" fill="var(--i-out)" stroke="none" fontSize="13" fontFamily="sans-serif">
                {formatCategoryLabel(primaryCategory, lang)}
            </text>
        </svg>
    );
}

/**
 * Componente copertina rettangolare 16:9 YouTube-style per i counselor.
 * Include gestione automatica del fallimento (fallback vettoriale deterministico)
 * e badge play discreto in caso di disponibilità video.
 */
export function CounselorCover({
    src,
    alt,
    counselor,
    className = '',
    compact = false,
    videoUrl,
}: CounselorCoverProps) {
    const { t, lang } = useI18n();
    const [hasError, setHasError] = useState(false);
    const [prevSrc, setPrevSrc] = useState(src);

    // Reset dello stato di errore se src cambia
    if (prevSrc !== src) {
        setPrevSrc(src);
        setHasError(false);
    }

    const effectiveVideoUrl = videoUrl || (counselor as unknown as { video_url?: string | null })?.video_url;
    const hasVideo = Boolean(effectiveVideoUrl);
    const hasImage = Boolean(src && !hasError);

    const heightClass = compact
        ? 'max-h-20 sm:max-h-24'
        : '';

    return (
        <div
            className={`group relative aspect-[16/9] w-full overflow-hidden rounded-control border border-line bg-surface-raised ${heightClass} ${className}`}
        >
            {hasImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={src!}
                    alt={alt}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    onError={() => setHasError(true)}
                />
            ) : (
                <ProceduralCoverFallback counselor={counselor} lang={lang} />
            )}

            {/* Badge Play discreto per predisposizione video YouTube */}
            {hasVideo && (
                <div className="absolute bottom-2 left-2 z-10">
                    {effectiveVideoUrl && (effectiveVideoUrl.startsWith('http://') || effectiveVideoUrl.startsWith('https://')) ? (
                        <a
                            href={effectiveVideoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex min-h-control items-center gap-2 rounded-control bg-black/70 px-2 py-1 text-2xs font-semibold text-white transition-colors hover:bg-black/90 border border-white/20"
                            title={t('counselor.cover.videoWatch')}
                        >
                            <Play className="h-2.5 w-2.5 fill-white text-white" />
                            <span>{t('counselor.cover.videoBadge')}</span>
                        </a>
                    ) : (
                        <span
                            className="inline-flex items-center gap-2 rounded-control bg-black/70 px-2 py-1 text-2xs font-semibold text-white border border-white/20"
                            title={t('counselor.cover.videoAvailable')}
                        >
                            <Play className="h-2.5 w-2.5 fill-white text-white" />
                            <span>{t('counselor.cover.videoBadge')}</span>
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
