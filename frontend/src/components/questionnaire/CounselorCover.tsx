'use client';

import React, { useId, useState } from 'react';
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
 * o fallisce il caricamento. Riproduce l'atmosfera della categoria di approccio
 * primaria del counselor con palette armonica e pattern geometrici eleganti.
 */
function ProceduralCoverFallback({
    counselor,
    uniqueId,
    lang,
}: {
    counselor: PublicCounselor;
    uniqueId: string;
    lang: string;
}) {
    const slug = counselor.slug || counselor.name || String(counselor.id);
    const hash = getDeterministicHash(slug);
    const subtleRot = (hash % 20) - 10;

    // Categoria primaria tra quelle note o prima specificata
    const knownCategories = ['filosofo', 'psicologo', 'tutor', 'docente', 'ricercatore', 'orientatore'];
    const matchedCategory = counselor.approach_categories?.find((cat) =>
        knownCategories.includes(cat.toLowerCase().trim())
    )?.toLowerCase().trim();
    const primaryCategory = matchedCategory || counselor.approach_categories?.[0]?.toLowerCase().trim() || 'orientatore';

    // Iniziali del nome per il monogramma (max 2 lettere)
    const initials = counselor.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() || '')
        .join('');

    // Configurazioni stilistiche in base alla categoria
    switch (primaryCategory) {
        case 'filosofo': {
            const gradId = `grad-filo-${uniqueId}`;
            return (
                <svg
                    viewBox="0 0 320 180"
                    width="100%"
                    height="100%"
                    preserveAspectRatio="xMidYMid slice"
                    className="h-full w-full select-none"
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#0f172a" />
                            <stop offset="60%" stopColor="#1e1b4b" />
                            <stop offset="100%" stopColor="#0d9488" />
                        </linearGradient>
                    </defs>
                    <rect width="320" height="180" fill={`url(#${gradId})`} />
                    {/* Meridiani e archi maieutici */}
                    <circle cx="240" cy="90" r="70" fill="none" stroke="#14b8a6" strokeWidth="1" strokeOpacity="0.35" />
                    <circle cx="240" cy="90" r="50" fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeOpacity="0.4" strokeDasharray="3 3" />
                    <circle cx="240" cy="90" r="30" fill="none" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.25" />
                    <ellipse cx="240" cy="90" rx="70" ry="24" fill="none" stroke="#14b8a6" strokeWidth="1" strokeOpacity="0.3" transform={`rotate(${-25 + subtleRot} 240 90)`} />
                    <ellipse cx="240" cy="90" rx="70" ry="24" fill="none" stroke="#f59e0b" strokeWidth="1" strokeOpacity="0.25" transform={`rotate(${25 + subtleRot} 240 90)`} />
                    {/* Astro dorato */}
                    <circle cx="240" cy="90" r="7" fill="#f59e0b" />
                    <circle cx="240" cy="90" r="14" fill="#fbbf24" fillOpacity="0.25" />

                    {/* Monogramma ed etichetta */}
                    <g transform="translate(36, 90)">
                        <circle cx="0" cy="0" r="26" fill="#0f172a" fillOpacity="0.75" stroke="#14b8a6" strokeWidth="1.5" strokeOpacity="0.6" />
                        <text x="0" y="7" textAnchor="middle" fill="#ffffff" fontSize="20" fontFamily="sans-serif" fontWeight="700">
                            {initials}
                        </text>
                    </g>
                    <g transform="translate(20, 150)">
                        <rect x="0" y="0" width="105" height="18" rx="9" fill="#0f172a" fillOpacity="0.75" stroke="#14b8a6" strokeWidth="1" strokeOpacity="0.4" />
                        <text x="52" y="12" textAnchor="middle" fill="#5eead4" fontSize="9.5" fontFamily="sans-serif" fontWeight="600" letterSpacing="0.5">
                            {formatCategoryLabel('filosofo', lang).toUpperCase()}
                        </text>
                    </g>
                </svg>
            );
        }

        case 'psicologo': {
            const gradId = `grad-psi-${uniqueId}`;
            return (
                <svg
                    viewBox="0 0 320 180"
                    width="100%"
                    height="100%"
                    preserveAspectRatio="xMidYMid slice"
                    className="h-full w-full select-none"
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#042f2e" />
                            <stop offset="50%" stopColor="#115e59" />
                            <stop offset="100%" stopColor="#134e4a" />
                        </linearGradient>
                    </defs>
                    <rect width="320" height="180" fill={`url(#${gradId})`} />
                    {/* Onde armoniche di calma e ascolto */}
                    <path d="M120 180 C 170 120, 220 140, 320 110 L 320 180 Z" fill="#0f766e" fillOpacity="0.35" />
                    <path d="M140 180 C 190 100, 250 120, 320 80 L 320 180 Z" fill="#14b8a6" fillOpacity="0.25" />
                    <path d="M160 180 C 210 80, 270 100, 320 60 L 320 180 Z" fill="#2dd4bf" fillOpacity="0.15" />
                    {/* Cerchi concentrici sull'acqua */}
                    <circle cx="235" cy="75" r="42" fill="none" stroke="#99f6e4" strokeWidth="1" strokeOpacity="0.4" />
                    <circle cx="235" cy="75" r="26" fill="none" stroke="#fef08a" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="4 2" />
                    <circle cx="235" cy="75" r="8" fill="#fef08a" fillOpacity="0.8" />

                    {/* Monogramma ed etichetta */}
                    <g transform="translate(36, 90)">
                        <circle cx="0" cy="0" r="26" fill="#042f2e" fillOpacity="0.75" stroke="#2dd4bf" strokeWidth="1.5" strokeOpacity="0.6" />
                        <text x="0" y="7" textAnchor="middle" fill="#ffffff" fontSize="20" fontFamily="sans-serif" fontWeight="700">
                            {initials}
                        </text>
                    </g>
                    <g transform="translate(20, 150)">
                        <rect x="0" y="0" width="105" height="18" rx="9" fill="#042f2e" fillOpacity="0.75" stroke="#2dd4bf" strokeWidth="1" strokeOpacity="0.4" />
                        <text x="52" y="12" textAnchor="middle" fill="#99f6e4" fontSize="9.5" fontFamily="sans-serif" fontWeight="600" letterSpacing="0.5">
                            {formatCategoryLabel('psicologo', lang).toUpperCase()}
                        </text>
                    </g>
                </svg>
            );
        }

        case 'tutor': {
            const gradId = `grad-tutor-${uniqueId}`;
            return (
                <svg
                    viewBox="0 0 320 180"
                    width="100%"
                    height="100%"
                    preserveAspectRatio="xMidYMid slice"
                    className="h-full w-full select-none"
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#0f172a" />
                            <stop offset="55%" stopColor="#1e293b" />
                            <stop offset="100%" stopColor="#334155" />
                        </linearGradient>
                    </defs>
                    <rect width="320" height="180" fill={`url(#${gradId})`} />
                    {/* Vettori e frecce dinamiche di progresso e concretezza */}
                    <path d="M150 180 L 250 40 L 265 40 L 165 180 Z" fill="#f97316" fillOpacity="0.25" />
                    <path d="M180 180 L 275 50 L 290 50 L 195 180 Z" fill="#fbbf24" fillOpacity="0.3" />
                    <path d="M220 180 L 305 60 L 315 60 L 230 180 Z" fill="#38bdf8" fillOpacity="0.2" />
                    {/* Freccia di slancio */}
                    <polyline points="230,85 275,45 275,75" fill="none" stroke="#f97316" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="190" y1="125" x2="275" y2="45" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />

                    {/* Monogramma ed etichetta */}
                    <g transform="translate(36, 90)">
                        <circle cx="0" cy="0" r="26" fill="#0f172a" fillOpacity="0.75" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.7" />
                        <text x="0" y="7" textAnchor="middle" fill="#ffffff" fontSize="20" fontFamily="sans-serif" fontWeight="700">
                            {initials}
                        </text>
                    </g>
                    <g transform="translate(20, 150)">
                        <rect x="0" y="0" width="85" height="18" rx="9" fill="#0f172a" fillOpacity="0.75" stroke="#f97316" strokeWidth="1" strokeOpacity="0.5" />
                        <text x="42" y="12" textAnchor="middle" fill="#fdba74" fontSize="9.5" fontFamily="sans-serif" fontWeight="600" letterSpacing="0.5">
                            {formatCategoryLabel('tutor', lang).toUpperCase()}
                        </text>
                    </g>
                </svg>
            );
        }

        case 'docente': {
            const gradId = `grad-doc-${uniqueId}`;
            return (
                <svg
                    viewBox="0 0 320 180"
                    width="100%"
                    height="100%"
                    preserveAspectRatio="xMidYMid slice"
                    className="h-full w-full select-none"
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#1e1b4b" />
                            <stop offset="60%" stopColor="#312e81" />
                            <stop offset="100%" stopColor="#4338ca" />
                        </linearGradient>
                    </defs>
                    <rect width="320" height="180" fill={`url(#${gradId})`} />
                    {/* Griglia modulare e rigore strutturato */}
                    <g stroke="#818cf8" strokeWidth="1" strokeOpacity="0.25">
                        <line x1="160" y1="30" x2="300" y2="30" />
                        <line x1="160" y1="65" x2="300" y2="65" />
                        <line x1="160" y1="100" x2="300" y2="100" />
                        <line x1="160" y1="135" x2="300" y2="135" />
                        <line x1="180" y1="20" x2="180" y2="150" strokeDasharray="3 3" />
                        <line x1="230" y1="20" x2="230" y2="150" strokeDasharray="3 3" />
                        <line x1="280" y1="20" x2="280" y2="150" strokeDasharray="3 3" />
                    </g>
                    {/* Blocchi isometrici */}
                    <rect x="200" y="45" width="40" height="35" rx="3" fill="#6366f1" fillOpacity="0.45" stroke="#a5b4fc" strokeWidth="1" />
                    <rect x="235" y="70" width="45" height="35" rx="3" fill="#06b6d4" fillOpacity="0.4" stroke="#67e8f9" strokeWidth="1" />

                    {/* Monogramma ed etichetta */}
                    <g transform="translate(36, 90)">
                        <circle cx="0" cy="0" r="26" fill="#1e1b4b" fillOpacity="0.8" stroke="#818cf8" strokeWidth="1.5" strokeOpacity="0.7" />
                        <text x="0" y="7" textAnchor="middle" fill="#ffffff" fontSize="20" fontFamily="sans-serif" fontWeight="700">
                            {initials}
                        </text>
                    </g>
                    <g transform="translate(20, 150)">
                        <rect x="0" y="0" width="95" height="18" rx="9" fill="#1e1b4b" fillOpacity="0.8" stroke="#818cf8" strokeWidth="1" strokeOpacity="0.5" />
                        <text x="47" y="12" textAnchor="middle" fill="#c7d2fe" fontSize="9.5" fontFamily="sans-serif" fontWeight="600" letterSpacing="0.5">
                            {formatCategoryLabel('docente', lang).toUpperCase()}
                        </text>
                    </g>
                </svg>
            );
        }

        case 'ricercatore': {
            const gradId = `grad-ric-${uniqueId}`;
            return (
                <svg
                    viewBox="0 0 320 180"
                    width="100%"
                    height="100%"
                    preserveAspectRatio="xMidYMid slice"
                    className="h-full w-full select-none"
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#090d16" />
                            <stop offset="60%" stopColor="#1e1b4b" />
                            <stop offset="100%" stopColor="#312e81" />
                        </linearGradient>
                    </defs>
                    <rect width="320" height="180" fill={`url(#${gradId})`} />
                    {/* Costellazione e rete di nodi e dati */}
                    <g stroke="#a5b4fc" strokeWidth="1" strokeOpacity="0.4">
                        <line x1="180" y1="110" x2="225" y2="60" />
                        <line x1="225" y1="60" x2="275" y2="85" />
                        <line x1="225" y1="60" x2="255" y2="130" />
                        <line x1="180" y1="110" x2="255" y2="130" />
                        <line x1="275" y1="85" x2="295" y2="45" />
                    </g>
                    <circle cx="180" cy="110" r="5" fill="#6366f1" />
                    <circle cx="225" cy="60" r="6" fill="#fbbf24" />
                    <circle cx="275" cy="85" r="5" fill="#38bdf8" />
                    <circle cx="255" cy="130" r="4.5" fill="#818cf8" />
                    <circle cx="295" cy="45" r="4" fill="#f59e0b" />

                    {/* Monogramma ed etichetta */}
                    <g transform="translate(36, 90)">
                        <circle cx="0" cy="0" r="26" fill="#090d16" fillOpacity="0.85" stroke="#a5b4fc" strokeWidth="1.5" strokeOpacity="0.7" />
                        <text x="0" y="7" textAnchor="middle" fill="#ffffff" fontSize="20" fontFamily="sans-serif" fontWeight="700">
                            {initials}
                        </text>
                    </g>
                    <g transform="translate(20, 150)">
                        <rect x="0" y="0" width="115" height="18" rx="9" fill="#090d16" fillOpacity="0.85" stroke="#a5b4fc" strokeWidth="1" strokeOpacity="0.5" />
                        <text x="57" y="12" textAnchor="middle" fill="#e0e7ff" fontSize="9.5" fontFamily="sans-serif" fontWeight="600" letterSpacing="0.5">
                            {formatCategoryLabel('ricercatore', lang).toUpperCase()}
                        </text>
                    </g>
                </svg>
            );
        }

        case 'orientatore':
        default: {
            const gradId = `grad-ori-${uniqueId}`;
            return (
                <svg
                    viewBox="0 0 320 180"
                    width="100%"
                    height="100%"
                    preserveAspectRatio="xMidYMid slice"
                    className="h-full w-full select-none"
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#042f2e" />
                            <stop offset="50%" stopColor="#0f766e" />
                            <stop offset="100%" stopColor="#115e59" />
                        </linearGradient>
                    </defs>
                    <rect width="320" height="180" fill={`url(#${gradId})`} />
                    {/* Rosa dei venti / Stella polare di orientamento */}
                    <circle cx="240" cy="90" r="56" fill="none" stroke="#2dd4bf" strokeWidth="1" strokeOpacity="0.3" />
                    <circle cx="240" cy="90" r="38" fill="none" stroke="#fbbf24" strokeWidth="1" strokeOpacity="0.35" strokeDasharray="4 3" />
                    {/* Aghi della bussola */}
                    <polygon points="240,42 245,85 240,90 235,85" fill="#f59e0b" />
                    <polygon points="240,138 245,95 240,90 235,95" fill="#f8fafc" fillOpacity="0.75" />
                    <polygon points="192,90 235,95 240,90 235,85" fill="#f8fafc" fillOpacity="0.75" />
                    <polygon points="288,90 245,95 240,90 245,85" fill="#f8fafc" fillOpacity="0.75" />
                    <circle cx="240" cy="90" r="4.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1" />

                    {/* Monogramma ed etichetta */}
                    <g transform="translate(36, 90)">
                        <circle cx="0" cy="0" r="26" fill="#042f2e" fillOpacity="0.8" stroke="#2dd4bf" strokeWidth="1.5" strokeOpacity="0.7" />
                        <text x="0" y="7" textAnchor="middle" fill="#ffffff" fontSize="20" fontFamily="sans-serif" fontWeight="700">
                            {initials}
                        </text>
                    </g>
                    <g transform="translate(20, 150)">
                        <rect x="0" y="0" width="115" height="18" rx="9" fill="#042f2e" fillOpacity="0.8" stroke="#2dd4bf" strokeWidth="1" strokeOpacity="0.5" />
                        <text x="57" y="12" textAnchor="middle" fill="#99f6e4" fontSize="9.5" fontFamily="sans-serif" fontWeight="600" letterSpacing="0.5">
                            {formatCategoryLabel('orientatore', lang).toUpperCase()}
                        </text>
                    </g>
                </svg>
            );
        }
    }
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
    const uniqueId = useId().replace(/[^a-zA-Z0-9_-]/g, '');

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
            className={`group relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-slate-200/80 bg-slate-100 shadow-xs ${heightClass} ${className}`}
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
                <ProceduralCoverFallback counselor={counselor} uniqueId={uniqueId} lang={lang} />
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
                            className="inline-flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-0.5 text-2xs font-semibold text-white shadow-sm backdrop-blur-xs transition-colors hover:bg-black/90 border border-white/20"
                            title={t('counselor.cover.videoWatch')}
                        >
                            <Play className="h-2.5 w-2.5 fill-white text-white" />
                            <span>{t('counselor.cover.videoBadge')}</span>
                        </a>
                    ) : (
                        <span
                            className="inline-flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-0.5 text-2xs font-semibold text-white shadow-sm backdrop-blur-xs border border-white/20"
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
