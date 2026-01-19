'use client';

import { QSAFactorCode, QSA_FACTORS } from '@/lib/qsa-model';

interface ProfileVisualizationProps {
    scores: Record<QSAFactorCode, number>;
}

// Factors with inverted interpretation (low score = good)
const INVERTED_FACTORS: QSAFactorCode[] = ['C3', 'C6', 'A1', 'A4', 'A5', 'A7'];

// Determine interpretation and color for a score
function getInterpretation(code: QSAFactorCode, score: number): { label: string; color: string; zone: 'low' | 'mid' | 'high' } {
    const isInverted = INVERTED_FACTORS.includes(code);

    let zone: 'low' | 'mid' | 'high';
    if (score <= 3) zone = 'low';
    else if (score <= 6) zone = 'mid';
    else zone = 'high';

    // For normal factors: low=bad(red), mid=neutral(yellow), high=good(green)
    // For inverted factors: low=good(green), mid=neutral(yellow), high=bad(red)
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
    code: QSAFactorCode;
    score: number;
}

function ScoreBar({ code, score }: ScoreBarProps) {
    const factor = QSA_FACTORS[code];
    const interpretation = getInterpretation(code, score);
    const isInverted = INVERTED_FACTORS.includes(code);

    // Calculate position of the marker (percentage from 0-100)
    const markerPosition = ((score - 1) / 8) * 100;

    return (
        <div className="flex items-center gap-3 py-2">
            {/* Factor code and name */}
            <div className="w-32 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-700">{code}</span>
                    {isInverted && <span className="text-[10px] text-slate-400">↔</span>}
                </div>
                <div className="text-xs text-slate-500 truncate" title={factor.name}>
                    {factor.name}
                </div>
            </div>

            {/* Bar container */}
            <div className="flex-1 relative">
                {/* Three-zone background */}
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

                {/* Score marker */}
                <div
                    className="absolute top-0 h-6 w-1 rounded-full shadow-md transition-all"
                    style={{
                        left: `calc(${markerPosition}% - 2px)`,
                        backgroundColor: interpretation.color,
                        boxShadow: `0 0 8px ${interpretation.color}`
                    }}
                />
            </div>

            {/* Score value and interpretation */}
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

export function ProfileVisualization({ scores }: ProfileVisualizationProps) {
    const cognitiveFactors = Object.entries(scores)
        .filter(([k]) => k.startsWith('C'))
        .sort(([a], [b]) => a.localeCompare(b)) as [QSAFactorCode, number][];

    const affectiveFactors = Object.entries(scores)
        .filter(([k]) => k.startsWith('A'))
        .sort(([a], [b]) => a.localeCompare(b)) as [QSAFactorCode, number][];

    return (
        <div className="w-full glass-panel rounded-2xl p-6 space-y-6">
            <h3 className="text-lg font-semibold text-center text-slate-800">Profilo Strategie di Apprendimento</h3>

            {/* Legend */}
            <div className="flex justify-center gap-6 text-xs">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-slate-600">Forza</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <span className="text-slate-600">Adeguato/Normale</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-slate-600">Area di crescita</span>
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                    <span>↔</span>
                    <span>= Scala invertita</span>
                </div>
            </div>

            {/* Two columns */}
            <div className="grid md:grid-cols-2 gap-8">
                {/* Cognitive Strategies */}
                <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-blue-700 mb-3 pb-2 border-b border-slate-200">
                        Strategie Cognitive
                    </h4>
                    {cognitiveFactors.map(([code, score]) => (
                        <ScoreBar key={code} code={code} score={score} />
                    ))}
                </div>

                {/* Affective Strategies */}
                <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-purple-700 mb-3 pb-2 border-b border-slate-200">
                        Strategie Affettive
                    </h4>
                    {affectiveFactors.map(([code, score]) => (
                        <ScoreBar key={code} code={code} score={score} />
                    ))}
                </div>
            </div>
        </div>
    );
}
