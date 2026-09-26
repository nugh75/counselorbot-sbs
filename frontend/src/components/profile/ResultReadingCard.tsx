'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { goalApi, type GoalGroup, type PersonalGoal } from '@/lib/goals';
import { toast } from '@/components/ui/Toast';
import { readingText } from '@/lib/i18n-reading';
import { FactorMultiSelect } from '@/components/profile/FactorMultiSelect';
import { GoalDialog, type DialogTarget } from '@/components/goals/GoalDialog';

type ReadingRow = {
    session_id: string;
    questionnaire_type: string;
    strengths: string[];
    growth_areas: string[];
    note: string;
    updated_at?: string | null;
    goal_ids: number[];
};

/**
 * «La mia lettura» di una compilazione (lotto C1): sostituisce la parte
 * riflessiva del libretto con forza, aree da far crescere, una nota e il
 * ponte «→ Rendi obiettivo» verso l'origine `reading` (GoalDialog, B3).
 * Le aree resa obiettivo restano le salvate: la bozza non crea ponti.
 */
export function ResultReadingCard({ sessionId, questionnaireType, scores }: {
    sessionId: string;
    questionnaireType: string;
    scores: Record<string, number> | null;
}) {
    const { lang, t } = useI18n();
    const l = (key: Parameters<typeof readingText>[1]) => readingText(lang, key);
    const [strengths, setStrengths] = useState<string[]>(['']);
    const [growthAreas, setGrowthAreas] = useState<string[]>(['']);
    const [note, setNote] = useState('');
    const [savedReading, setSavedReading] = useState<ReadingRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [goals, setGoals] = useState<PersonalGoal[]>([]);
    const [groups, setGroups] = useState<GoalGroup[]>([]);
    const [target, setTarget] = useState<DialogTarget | null>(null);
    const [dialogSaved, setDialogSaved] = useState(false);

    const loadReading = useCallback(async () => {
        const res = await apiFetch(`/api/user/readings?session_id=${encodeURIComponent(sessionId)}`);
        if (!res.ok) throw new Error('Load failed');
        const data: ReadingRow | null = await res.json();
        const row = data ?? { session_id: sessionId, questionnaire_type: questionnaireType, strengths: [], growth_areas: [], note: '', updated_at: null, goal_ids: [] };
        return row;
    }, [sessionId, questionnaireType]);

    useEffect(() => {
        let active = true;
        setLoading(true);
        loadReading()
            .then((row) => {
                if (!active) return;
                setSavedReading(row);
                setStrengths(row.strengths.length > 0 ? row.strengths : ['']);
                setGrowthAreas(row.growth_areas.length > 0 ? row.growth_areas : ['']);
                setNote(row.note);
            })
            .catch((e) => { console.error('Failed to load reading', e); if (active) toast.error(t('toast.error')); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [loadReading, t]);

    // goals/groups servono al GoalDialog: stesso carico di GoalsPanel, al mount.
    useEffect(() => {
        let active = true;
        goalApi<PersonalGoal[]>('/user/goals').then((rows) => { if (active) setGoals(rows); }).catch(() => { if (active) setGoals([]); });
        goalApi<GoalGroup[]>('/user/goal-groups').then((rows) => { if (active) setGroups(rows); }).catch(() => { if (active) setGroups([]); });
        return () => { active = false; };
    }, []);

    const save = async () => {
        setSaving(true);
        try {
            const res = await apiFetch(`/api/user/readings/${sessionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ strengths, growth_areas: growthAreas, note }),
            });
            if (!res.ok) throw new Error('Save failed');
            const row: ReadingRow = await res.json();
            setSavedReading(row);
            setStrengths(row.strengths.length > 0 ? row.strengths : ['']);
            setGrowthAreas(row.growth_areas.length > 0 ? row.growth_areas : ['']);
            setNote(row.note);
            toast.success(l('saved'));
        } catch (e) {
            console.error('Failed to save reading', e);
            toast.error(t('toast.error'));
        } finally {
            setSaving(false);
        }
    };

    const refreshReading = useCallback(() => {
        loadReading()
            .then((row) => {
                setSavedReading(row);
                setStrengths(row.strengths.length > 0 ? row.strengths : ['']);
                setGrowthAreas(row.growth_areas.length > 0 ? row.growth_areas : ['']);
                setNote(row.note);
            })
            .catch(() => { /* the current view stays; the next save syncs the list */ });
    }, [loadReading]);

    const reloadGoals = useCallback(() => {
        goalApi<PersonalGoal[]>('/user/goals').then((rows) => setGoals(rows)).catch(() => setGoals([]));
    }, []);

    const closeDialog = () => { setTarget(null); setDialogSaved(false); };

    const savedGrowthAreas = savedReading?.growth_areas ?? [];
    void scores; // riservato al PDF «Percorso dell'obiettivo» (D1): la card accetta i punteggi della compilazione

    return (
        <div className="glass-panel p-5 space-y-5">
            <h2 className="text-lg font-bold text-slate-800">{l('title')}</h2>
            {loading ? (
                <div className="text-sm text-slate-500">{t('booklet.loading')}</div>
            ) : (
                <>
                    <div className="grid gap-3 md:grid-cols-2">
                        <FactorMultiSelect
                            label={l('strengths')}
                            value={strengths}
                            onChange={setStrengths}
                            questionnaireType={questionnaireType}
                        />
                        <FactorMultiSelect
                            label={l('growth')}
                            value={growthAreas}
                            onChange={setGrowthAreas}
                            questionnaireType={questionnaireType}
                        />
                    </div>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l('note')}</span>
                        <textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={3}
                            maxLength={2000}
                            className="mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                    </label>
                    <div className="flex justify-end border-t border-slate-200 pt-4">
                        <Button type="button" onClick={() => void save()} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" aria-hidden />}
                            {l('save')}
                        </Button>
                    </div>
                    {savedGrowthAreas.length > 0 && (
                        <ul className="space-y-2">
                            {savedGrowthAreas.map((area, index) => (
                                <li key={index} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-2">
                                    <span className="min-w-0 flex-1 break-words text-sm text-slate-700">{area || `#${index + 1}`}</span>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => { setDialogSaved(false); setTarget({ kind: 'create', origin: { kind: 'reading', target_id: sessionId }, prefill: { motivation: savedReading?.note } }); }}
                                    >
                                        {l('toGoal')}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {(savedReading?.goal_ids.length ?? 0) > 0 && (
                        <section className="space-y-2">
                            <h3 className="text-sm font-bold text-slate-700">{l('born')}</h3>
                            <ul className="space-y-1">
                                {(savedReading?.goal_ids ?? []).map((id) => (
                                    <li key={id}>
                                        <Link className="text-indigo-700 underline" href={`/profilo/obiettivi?goal=${id}`}>
                                            {goals.find((goal) => goal.id === id)?.title ?? `#${id}`}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </>
            )}
            {target && <GoalDialog target={target} goals={goals} groups={groups} saved={dialogSaved}
                onTarget={next => { setDialogSaved(false); setTarget(next); }} onClose={closeDialog}
                onReload={reloadGoals}
                onSaved={row => { setGoals(previous => previous.map(goal => goal.id === row.id ? row : goal)); setDialogSaved(true); }}
                onCreated={row => { setGoals(previous => [row, ...previous]); setDialogSaved(true); closeDialog(); refreshReading(); }}
                onDeleted={() => { closeDialog(); refreshReading(); reloadGoals(); }} />}
        </div>
    );
}
