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

interface ProfileVisualizationProps {
    scores: Record<string, number>;
    questionnaire: QuestionnaireConfig;
}

// Column header labels per prefix
const PREFIX_SECTION_LABEL: Record<string, { label: string; colorClass: string }> = {
    C: { label: 'Strategie Cognitive', colorClass: 'text-blue-700' },
    A: { label: 'Strategie Affettive', colorClass: 'text-purple-700' },
    T: { label: 'Prospettiva Temporale', colorClass: 'text-amber-700' },
};

function getInterpretation(
    code: string,
    score: number,
    invertedSet: Set<string>,
    questionnaireId: string
): { label: string; color: string; zone: 'low' | 'mid' | 'high' } {
    if (questionnaireId === 'ZTPI' && code.startsWith('T')) {
        const analysis = analyzeZTPIScore(code as ZTPIFactorCode, score);
        const color = getZTPIAlignmentColorHex(code as ZTPIFactorCode, score);
        if (analysis.zone === 'ideal') return { label: analysis.interpretation, color, zone: 'high' };
        if (analysis.zone === 'near') return { label: analysis.interpretation, color, zone: 'mid' };
        return { label: analysis.interpretation, color, zone: 'low' };
    }

    const isInverted = invertedSet.has(code);

    let zone: 'low' | 'mid' | 'high';
    if (score <= 3) zone = 'low';
    else if (score <= 6) zone = 'mid';
    else zone = 'high';

    if (isInverted) {
        switch (zone) {
            case 'low': return { label: 'Forza', color: '#22c55e', zone };
            case 'mid': return { label: 'Normale', color: '#eab308', zone };
            case 'high': return { label: 'Area di crescita', color: '#ef4444', zone };
        }
    } else {
        switch (zone) {
            case 'low': return { label: 'Area di crescita', color: '#ef4444', zone };
            case 'mid': return { label: 'Adeguato', color: '#eab308', zone };
            case 'high': return { label: 'Forza', color: '#22c55e', zone };
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
        <div className="flex items-center gap-3 py-2">
            <div className="w-32 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-700">{code}</span>
                    {isInverted && <span className="text-[10px] text-slate-400">↔</span>}
                </div>
                <div className="text-xs text-slate-500 truncate" title={factorName}>
                    {factorName}
                </div>
            </div>

            <div className="flex-1 relative">
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

            <div className="w-24 flex-shrink-0 text-right">
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
    const invertedSet = new Set(questionnaire.invertedFactors);
    const isZTPI = questionnaire.id === 'ZTPI';
    const positiveLegend = isZTPI ? 'In linea con il profilo equilibrato' : 'Forza';
    const midLegend = isZTPI ? 'Vicino al profilo equilibrato' : 'Adeguato/Normale';

    // Group factors by prefix
    const columns = questionnaire.factorPrefix.map(prefix => ({
        prefix,
        entries: Object.entries(scores)
            .filter(([k]) => k.startsWith(prefix))
            .sort(([a], [b]) => a.localeCompare(b)),
    }));

    const gridCols = columns.length === 1 ? '' : 'md:grid-cols-2';

    return (
        <div className="w-full glass-panel rounded-2xl p-6 space-y-6">
            <h3 className="text-lg font-semibold text-center text-slate-800">{questionnaire.fullName}</h3>

            {/* Legend */}
            <div className="flex justify-center gap-6 text-xs flex-wrap">
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
                    <span className="text-slate-600">Area di crescita</span>
                </div>
                {questionnaire.invertedFactors.length > 0 && (
                    <div className="flex items-center gap-1 text-slate-400">
                        <span>↔</span>
                        <span>= Scala invertita</span>
                    </div>
                )}
            </div>

            <div className={cn("grid gap-8", gridCols)}>
                {columns.map(({ prefix, entries }) => {
                    const section = PREFIX_SECTION_LABEL[prefix] || { label: `Fattori ${prefix}`, colorClass: 'text-slate-700' };
                    return (
                        <div key={prefix} className="space-y-1">
                            <h4 className={cn("text-sm font-semibold mb-3 pb-2 border-b border-slate-200", section.colorClass)}>
                                {section.label}
                            </h4>
                            {entries.map(([code, score]) => {
                                const factor = questionnaire.factors.find(f => f.code === code);
                                const isInverted = invertedSet.has(code);
                                const interpretation = getInterpretation(code, score, invertedSet, questionnaire.id);
                                return (
                                    <ScoreBar
                                        key={code}
                                        questionnaireId={questionnaire.id}
                                        code={code}
                                        score={score}
                                        factorName={factor?.name || code}
                                        isInverted={isInverted}
                                        interpretation={interpretation}
                                    />
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
