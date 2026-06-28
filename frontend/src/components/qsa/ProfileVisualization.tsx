'use client';

import { cn } from '@/lib/utils';
import { QuestionnaireConfig } from '@/lib/questionnaires';
import {
    ZTPIFactorCode,
    ZTPI_BTP_IDEAL,
    ZTPI_BTP_NEAR,
    analyzeZTPIScore,
    getZTPIAlignmentColorHex
} from '@/lib/ztpi-model';
import { useI18n } from '@/lib/i18n-context';

interface ProfileVisualizationProps {
    scores: Record<string, number>;
    questionnaire: QuestionnaireConfig;
}

// Color per prefix (label tradotta via i18n: profile.section.<X>)
const PREFIX_SECTION_COLOR: Record<string, string> = {
    C: 'text-indigo-700',
    A: 'text-indigo-700',
    T: 'text-indigo-700',
    S: 'text-purple-700',
    K: 'text-cyan-700',
    AD: 'text-green-700',
};

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function getInterpretation(
    code: string,
    score: number,
    invertedSet: Set<string>,
    questionnaireId: string,
    t: Translator
): { label: string; color: string; zone: 'low' | 'mid' | 'high' } {
    if (questionnaireId === 'ZTPI' && code.startsWith('T')) {
        const analysis = analyzeZTPIScore(code as ZTPIFactorCode, score);
        const color = getZTPIAlignmentColorHex(code as ZTPIFactorCode, score);
        if (analysis.zone === 'ideal') return { label: t('profile.legend.ztpiPositive'), color, zone: 'high' };
        if (analysis.zone === 'near') return { label: t('profile.legend.ztpiMid'), color, zone: 'mid' };
        return { label: t('profile.growth'), color, zone: 'low' };
    }

    const isInverted = invertedSet.has(code);

    let zone: 'low' | 'mid' | 'high';
    if (score <= 3) zone = 'low';
    else if (score <= 6) zone = 'mid';
    else zone = 'high';

    if (isInverted) {
        switch (zone) {
            case 'low': return { label: t('profile.strength'), color: '#22c55e', zone };
            case 'mid': return { label: t('profile.normal'), color: '#eab308', zone };
            case 'high': return { label: t('profile.growth'), color: '#ef4444', zone };
        }
    } else {
        switch (zone) {
            case 'low': return { label: t('profile.growth'), color: '#ef4444', zone };
            case 'mid': return { label: t('profile.adequate'), color: '#eab308', zone };
            case 'high': return { label: t('profile.strength'), color: '#22c55e', zone };
        }
    }
}

interface ScoreBarProps {
    questionnaireId: string;
    code: string;
    score: number;
    factorName: string;
    isInverted: boolean;
    interpretation: { label: string; color: string; zone: 'low' | 'mid' | 'high' };
}

interface ScoreSegment {
    start: number;
    end: number;
    backgroundColor: string;
    textColor: string;
}

function makeZTPISegments(code: ZTPIFactorCode): ScoreSegment[] {
    const near = ZTPI_BTP_NEAR[code];
    const ideal = ZTPI_BTP_IDEAL[code];
    const segments: ScoreSegment[] = [];

    const pushSegment = (start: number, end: number, backgroundColor: string, textColor: string) => {
        if (start > end) return;
        segments.push({ start, end, backgroundColor, textColor });
    };

    pushSegment(1, near.min - 1, 'rgba(239, 68, 68, 0.2)', '#dc2626');
    pushSegment(near.min, ideal.min - 1, 'rgba(234, 179, 8, 0.2)', '#ca8a04');
    pushSegment(ideal.min, ideal.max, 'rgba(34, 197, 94, 0.2)', '#16a34a');
    pushSegment(ideal.max + 1, near.max, 'rgba(234, 179, 8, 0.2)', '#ca8a04');
    pushSegment(near.max + 1, 9, 'rgba(239, 68, 68, 0.2)', '#dc2626');

    return segments;
}

function ScoreBar({ questionnaireId, code, score, factorName, isInverted, interpretation }: ScoreBarProps) {
    const markerPosition = ((score - 1) / 8) * 100;
    const isZTPI = questionnaireId === 'ZTPI' && code.startsWith('T');
    const ztpiCode = code as ZTPIFactorCode;
    const ztpiSegments = isZTPI ? makeZTPISegments(ztpiCode) : [];

    return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 py-2 sm:flex sm:items-center sm:gap-3 sm:py-1">
            <div className="col-start-1 row-start-1 min-w-0 sm:w-44 sm:flex-shrink-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-700">{code}</span>
                    {isInverted && <span className="text-[10px] text-slate-400">↔</span>}
                </div>
                <div className="text-xs text-slate-500 leading-tight break-words" title={factorName}>
                    {factorName}
                </div>
            </div>

            <div className="relative col-span-2 row-start-2 min-w-0 sm:flex-1">
                {isZTPI ? (
                    <div className="flex h-6 rounded-md overflow-hidden border border-slate-200">
                        {ztpiSegments.map((segment, idx) => {
                            const slots = segment.end - segment.start + 1;
                            const width = `${(slots / 9) * 100}%`;
                            const label = segment.start === segment.end ? `${segment.start}` : `${segment.start}-${segment.end}`;
                            return (
                                <div
                                    key={`${segment.start}-${segment.end}`}
                                    className={cn(
                                        "flex items-center justify-center text-[10px] font-medium",
                                        idx > 0 && "border-l border-slate-200"
                                    )}
                                    style={{
                                        width,
                                        backgroundColor: segment.backgroundColor,
                                        color: segment.textColor,
                                    }}
                                >
                                    {label}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex h-6 rounded-md overflow-hidden border border-slate-200">
                        {/* Zone 1-3 */}
                        <div
                            className="w-1/3 flex items-center justify-center text-[10px] font-medium"
                            style={{
                                backgroundColor: isInverted ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                color: isInverted ? '#16a34a' : '#dc2626'
                            }}
                        >
                            1-3
                        </div>
                        {/* Zone 4-6 */}
                        <div
                            className="w-1/3 flex items-center justify-center text-[10px] font-medium border-x border-slate-200"
                            style={{ backgroundColor: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04' }}
                        >
                            4-6
                        </div>
                        {/* Zone 7-9 */}
                        <div
                            className="w-1/3 flex items-center justify-center text-[10px] font-medium"
                            style={{
                                backgroundColor: isInverted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                                color: isInverted ? '#dc2626' : '#16a34a'
                            }}
                        >
                            7-9
                        </div>
                    </div>
                )}

                <div
                    className="absolute top-0 h-6 w-1 rounded-full shadow-md transition-all"
                    style={{
                        left: `calc(${markerPosition}% - 2px)`,
                        backgroundColor: interpretation.color,
                        boxShadow: `0 0 8px ${interpretation.color}`
                    }}
                />
            </div>

            <div className="col-start-2 row-start-1 w-24 flex-shrink-0 text-right">
                <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{
                        backgroundColor: `${interpretation.color}20`,
                        color: interpretation.color
                    }}
                >
                    {score}
                </span>
                <div className="text-[10px] text-slate-500 mt-0.5">
                    {interpretation.label}
                </div>
            </div>
        </div>
    );
}

export function ProfileVisualization({ scores, questionnaire }: ProfileVisualizationProps) {
    const { t, tf } = useI18n();
    const invertedSet = new Set(questionnaire.invertedFactors);
    const isZTPI = questionnaire.id === 'ZTPI';
    const positiveLegend = isZTPI ? t('profile.legend.ztpiPositive') : t('profile.strength');
    const midLegend = isZTPI ? t('profile.legend.ztpiMid') : t('profile.legend.midDefault');
    const isActiveQ = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP'].includes(questionnaire.id);
    const fullName = isActiveQ ? t(`q.${questionnaire.id}.fullName`) : questionnaire.fullName;

    // Group factors by prefix
    const columns = questionnaire.factorPrefix.map(prefix => ({
        prefix,
        entries: Object.entries(scores)
            .filter(([k]) => k.startsWith(prefix))
            .sort(([a], [b]) => a.localeCompare(b)),
    }));

    const gridCols = columns.length === 1 ? '' : 'md:grid-cols-2';

    // Sintesi: classifica ogni fattore come forza / crescita e prende i primi 3.
    // ZTPI usa la zona (ideal=forza, far=crescita); gli altri usano soglie 7/3,
    // ribaltate per i fattori invertiti. rank = "quanto forte" per ordinare.
    type Ranked = { code: string; name: string; score: number; rank: number };
    const strengths: Ranked[] = [];
    const growth: Ranked[] = [];
    for (const [code, score] of Object.entries(scores)) {
        const factor = questionnaire.factors.find((f) => f.code === code);
        const name = tf(`factor.${code}.name`, factor?.name || code);
        const inverted = invertedSet.has(code);
        let isStrength: boolean;
        let isGrowth: boolean;
        let rank: number;
        if (isZTPI && code.startsWith('T')) {
            const zone = getInterpretation(code, score, invertedSet, questionnaire.id, t).zone;
            isStrength = zone === 'high';
            isGrowth = zone === 'low';
            rank = score;
        } else {
            isStrength = inverted ? score <= 3 : score >= 7;
            isGrowth = inverted ? score >= 7 : score <= 3;
            rank = inverted ? 10 - score : score;
        }
        if (isStrength) strengths.push({ code, name, score, rank });
        else if (isGrowth) growth.push({ code, name, score, rank });
    }
    strengths.sort((a, b) => b.rank - a.rank);
    growth.sort((a, b) => a.rank - b.rank);
    const topStrengths = strengths.slice(0, 3);
    const topGrowth = growth.slice(0, 3);
    const hasSummary = topStrengths.length > 0 || topGrowth.length > 0;

    const renderChips = (items: Ranked[], tone: 'strength' | 'growth') => (
        <div className="flex flex-wrap gap-1.5">
            {items.map((it) => (
                <span
                    key={it.code}
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                        tone === 'strength'
                            ? 'border-green-200 bg-green-50 text-green-800'
                            : 'border-amber-200 bg-amber-50 text-amber-800',
                    )}
                    title={it.name}
                >
                    <span className="font-mono font-bold">{it.code}</span>
                    <span className="max-w-[8.5rem] truncate font-medium">{it.name}</span>
                    <span className="rounded-full bg-white/70 px-1.5 font-bold">{it.score}</span>
                </span>
            ))}
        </div>
    );

    return (
        <div className="w-full glass-panel p-4 space-y-3">
            <h3 className="text-base font-semibold text-center text-slate-800">{fullName}</h3>

            {/* Sintesi: il messaggio in 3 secondi prima del dettaglio barre. */}
            {hasSummary && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3 animate-fade-in-up">
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-green-700">
                                {t('profile.summary.strengths')}
                            </div>
                            {topStrengths.length > 0
                                ? renderChips(topStrengths, 'strength')
                                : <p className="text-xs text-slate-400">{t('profile.summary.balanced')}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
                                {t('profile.summary.growth')}
                            </div>
                            {topGrowth.length > 0
                                ? renderChips(topGrowth, 'growth')
                                : <p className="text-xs text-slate-400">{t('profile.summary.balanced')}</p>}
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-400 text-center pt-0.5">{t('profile.summary.note')}</p>
                </div>
            )}

            <div className={cn("grid gap-x-8 gap-y-2", gridCols)}>
                {columns.map(({ prefix, entries }) => {
                    const sectionColor = PREFIX_SECTION_COLOR[prefix] || 'text-slate-700';
                    const sectionLabel = PREFIX_SECTION_COLOR[prefix] ? t(`profile.section.${prefix}`) : `${prefix}`;
                    return (
                        <div key={prefix} className="space-y-0.5">
                            <h4 className={cn("text-sm font-semibold mb-1 pb-1 border-b border-slate-200", sectionColor)}>
                                {sectionLabel}
                            </h4>
                            {entries.map(([code, score]) => {
                                const factor = questionnaire.factors.find(f => f.code === code);
                                const isInverted = invertedSet.has(code);
                                const interpretation = getInterpretation(code, score, invertedSet, questionnaire.id, t);
                                return (
                                    <ScoreBar
                                        key={code}
                                        questionnaireId={questionnaire.id}
                                        code={code}
                                        score={score}
                                        factorName={tf(`factor.${code}.name`, factor?.name || code)}
                                        isInverted={isInverted}
                                        interpretation={interpretation}
                                    />
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            {/* Legenda, in basso */}
            <div className="flex justify-center gap-4 text-xs flex-wrap pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-slate-600">{positiveLegend}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <span className="text-slate-600">{midLegend}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-slate-600">{t('profile.growth')}</span>
                </div>
                {questionnaire.invertedFactors.length > 0 && (
                    <div className="flex items-center gap-1 text-slate-400">
                        <span>↔</span>
                        <span>= {t('profile.invertedScale')}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
