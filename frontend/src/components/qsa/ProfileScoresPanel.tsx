'use client';

// Punteggi del profilo nella barra laterale delle chat (guidata e libera):
// barre colorate raggruppate per prefisso, con il nome localizzato del fattore.
import { BarChart3 } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { ZTPIFactorCode, getZTPIAlignmentColorClass } from '@/lib/ztpi-model';
import { factorTranslationKey, getQuestionnaire } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';

// --- Sidebar section labels per prefix ---

const SIDEBAR_PREFIXES = new Set(['C', 'A', 'T', 'S', 'K', 'AD']);

// --- Color helpers for sidebar compact bars ---

function getScoreColor(
    code: string,
    score: number,
    invertedSet: Set<string>,
    questionnaireType: string
): string {
    if (questionnaireType === 'QPCC' && code === 'M2') return 'bg-slate-500';
    if (questionnaireType === 'ZTPI' && code.startsWith('T')) {
        return getZTPIAlignmentColorClass(code as ZTPIFactorCode, score);
    }

    const isInverted = invertedSet.has(code);
    if (score <= 3) return isInverted ? 'bg-green-500' : 'bg-red-500';
    if (score <= 6) return 'bg-yellow-500';
    return isInverted ? 'bg-red-500' : 'bg-green-500';
}

function CompactScoreBar({
    code,
    factorName,
    score,
    invertedSet,
    questionnaireType,
}: {
    code: string;
    factorName: string;
    score: number;
    invertedSet: Set<string>;
    questionnaireType: string;
}) {
    const color = getScoreColor(code, score, invertedSet, questionnaireType);
    const width = (score / 9) * 100;

    return (
        <div className="space-y-1">
            {/* Il nome dice qualcosa a chi legge, la sigla no: resta nel title,
                per chi confronta la pastiglia col profilo o col PDF. */}
            <div className="text-2xs leading-tight text-slate-600 break-words" title={`${code} (${factorName})`}>
                <span className="font-semibold">{factorName}</span>
            </div>
            <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${width}%` }} />
                </div>
                <span className="w-4 text-2xs font-semibold text-slate-600">{score}</span>
            </div>
        </div>
    );
}

/** Fattori del profilo raggruppati per prefisso, come li mostra la barra laterale. */
export function useScoreGroups(questionnaireType: string, scores: Record<string, number>) {
    const { t } = useI18n();
    return useMemo(() => {
        const questionnaire = getQuestionnaire(questionnaireType);
        if (!questionnaire) return [];
        return questionnaire.factorPrefix.map(prefix => ({
            prefix,
            label: questionnaire.id === 'QPCC' ? t(`dimension.QPCC.${prefix}`) : SIDEBAR_PREFIXES.has(prefix) ? t(`sidebar.${prefix}`) : prefix,
            entries: Object.entries(scores)
                .filter(([k]) => k.startsWith(prefix))
                .sort(([a], [b]) => a.localeCompare(b)),
        }));
    }, [scores, questionnaireType, t]);
}

export function ProfileScoresPanel({ questionnaireType, groups, hidden }: {
    questionnaireType: string;
    groups: ReturnType<typeof useScoreGroups>;
    hidden?: boolean;
}) {
    const { t, tf } = useI18n();
    const questionnaire = useMemo(() => getQuestionnaire(questionnaireType), [questionnaireType]);
    const invertedSet = useMemo(() => new Set(questionnaire?.invertedFactors || []), [questionnaire]);
    if (!groups.some(group => group.entries.length > 0)) return null;
    return (
        <Card variant="flat" hidden={hidden} className="overflow-hidden py-0">
            <div id="guided-scores-panel" className="space-y-3 p-4">
                <div className="hidden items-center gap-2 text-sm font-semibold text-slate-700 lg:flex">
                    <BarChart3 className="w-4 h-4" />
                    {t('guided.scores')}
                </div>

                {groups.map((group, idx) => (
                    <div key={group.prefix} className={cn("space-y-1.5", idx > 0 && "pt-2 border-t border-slate-100")}>
                        <div className="text-2xs font-medium text-ink">{group.label}</div>
                        {group.entries.map(([code, score]) => (
                            <CompactScoreBar
                                key={code}
                                code={code}
                                factorName={tf(
                                    factorTranslationKey(questionnaireType, code, 'name'),
                                    questionnaire?.factors?.find((factor) => factor.code === code)?.name || code,
                                )}
                                score={score}
                                invertedSet={invertedSet}
                                questionnaireType={questionnaireType}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </Card>
    );
}
