'use client';

// Repertorio di prove di un taccuino di prova: i profili di questionario dello
// studente simulato, inseriti a mano, generati o arrivati da una chat in prova.
// Non sono Compilazioni del docente: vivono solo nel taccuino.

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';
import { practiceNotebookText } from '@/lib/i18n-practice-notebooks';
import { QUESTIONNAIRES, type QuestionnaireType } from '@/lib/questionnaires';
import { ScoreInputForm } from '@/components/qsa/ScoreInputForm';
import { PRACTICE_RESULT_TYPES, generatePracticeScores, practiceResultChatHref, type PracticeResult } from '@/lib/practice-notebooks';
import { practiceNotebookApi } from '@/lib/practice-notebooks-api';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { learningText } from '@/lib/i18n-assignment-work';

const secondary = 'min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

type Draft = { id?: number; type: QuestionnaireType; scores?: Record<string, number>; generated: boolean; version: number };

export function PracticeRepertoire({ notebookId }: { notebookId: number }) {
    const { lang, t } = useI18n();
    const l = (key: Parameters<typeof practiceNotebookText>[1]) => practiceNotebookText(lang, key);
    const [results, setResults] = useState<PracticeResult[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [dirty, setDirty] = useState(false);
    const [saved, setSaved] = useState(false);
    useDraftGuard(dirty || busy, learningText(lang, 'leaveDraft'), { blocked: busy, preserveFocus: true });
    const cancel = () => {
        if (busy || (dirty && !window.confirm(learningText(lang, 'leaveDraft')))) return;
        setDraft(null);
        setDirty(false);
    };

    const instrumentName = (id: string) => {
        const localized = t(`q.${id}.name`);
        return localized === `q.${id}.name` ? QUESTIONNAIRES[id as QuestionnaireType]?.name ?? id : localized;
    };

    const load = useCallback(async () => {
        setFailed(false);
        try {
            setResults(await practiceNotebookApi.results(notebookId));
        } catch {
            setFailed(true);
        }
    }, [notebookId]);
    useEffect(() => { void load(); }, [load]);

    const act = async (action: () => Promise<unknown>) => {
        if (busy) return false;
        setBusy(true);
        setError('');
        try {
            await action();
            await load();
            return true;
        } catch {
            setError(l('error'));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const generate = () => {
        setDirty(true);
        setDraft((current) => current && {
        ...current,
        scores: generatePracticeScores(QUESTIONNAIRES[current.type].factors.map((factor) => factor.code)),
        generated: true,
        version: current.version + 1,
        });
    };

    const save = async (scores: Record<string, number>) => {
        if (!draft) return;
        const ok = await act(() => draft.id !== undefined
            ? practiceNotebookApi.updateResult(notebookId, draft.id, scores)
            : practiceNotebookApi.addResult(notebookId, {
            questionnaire_type: draft.type, scores, source: draft.generated ? 'generated' : 'manual',
        }));
        if (ok) { setDraft(null); setDirty(false); setSaved(true); }
    };

    const sourceLabel = (source: PracticeResult['source']) =>
        l(source === 'generated' ? 'sourceGenerated' : source === 'chat' ? 'sourceChat' : 'sourceManual');

    return (
        <section data-practice-repertoire className="space-y-2 border-t border-slate-200 pt-3">
            <h3 className="text-sm font-semibold text-slate-700">{l('repertoire')}</h3>
            <p className="text-xs text-slate-500">{l('repertoireHint')}</p>
            {failed && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-red-600">
                <p>{l('profilesError')}</p>
                <button type="button" onClick={() => void load()} className={secondary}>{l('retry')}</button>
            </div>}
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            {saved && <p role="status" className="text-xs text-emerald-700">{l('saved')}</p>}
            {results !== null && !results.length && <p className="text-xs text-slate-500">{l('noProfiles')}</p>}
            <ul className="space-y-2">
                {(results ?? []).map((result) => (
                    <li key={result.id} data-practice-result={result.id} className="rounded-md border border-slate-200 p-2 text-sm">
                        <p className="font-semibold text-slate-800">
                            {instrumentName(result.questionnaire_type)}
                            <span className="ml-2 text-xs font-normal text-slate-500">
                                {result.created_at ? new Date(result.created_at).toLocaleDateString(lang) : ''} · {sourceLabel(result.source)}
                            </span>
                        </p>
                        <p className="mt-1 break-words font-mono text-xs text-slate-600">
                            {Object.entries(result.scores).map(([code, value]) => `${code} ${value}`).join(' · ')}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                        {!draft && <>
                            <Link href={practiceResultChatHref(result)} className="inline-flex min-h-11 items-center rounded-md bg-ochre-600 px-3 text-sm font-semibold text-white hover:bg-ochre-700">{l('startChat')}</Link>
                            <button type="button" disabled={busy} className={secondary} onClick={() => {
                                setDraft({ id: result.id, type: result.questionnaire_type as QuestionnaireType, scores: result.scores, generated: false, version: 0 });
                                setDirty(false); setSaved(false); setError('');
                            }}>{l('edit')}</button>
                        </>}
                        <button type="button" disabled={busy || draft !== null} className={secondary}
                            onClick={() => { if (window.confirm(l('confirmRemoveProfile'))) void act(() => practiceNotebookApi.removeResult(notebookId, result.id)); }}>
                            {l('remove')}
                        </button>
                        </div>
                    </li>
                ))}
            </ul>
            {draft ? (
                <div data-practice-result-editor className="space-y-3 rounded-md border border-indigo-200 p-3">
                    <label className="block text-xs font-semibold text-slate-600">
                        {l('instrument')}
                        <select value={draft.type} disabled={busy || draft.id !== undefined}
                            onChange={(event) => {
                                const nextType = event.target.value as QuestionnaireType;
                                if (dirty && !window.confirm(learningText(lang, 'leaveDraft'))) {
                                    event.target.value = draft.type;
                                    return;
                                }
                                setDraft({ type: nextType, generated: false, version: draft.version + 1 });
                                setDirty(false);
                            }}
                            className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-2 text-sm">
                            {PRACTICE_RESULT_TYPES.map((id) => <option key={id} value={id}>{instrumentName(id)}</option>)}
                        </select>
                    </label>
                    <div>
                        <button type="button" disabled={busy} onClick={generate} className={secondary}>{l('generate')}</button>
                        <p className="mt-1 text-xs text-slate-500">{l('generateHint')}</p>
                    </div>
                    <p className="text-xs text-slate-500">{l('explicitSave')}</p>
                    <fieldset disabled={busy} className="min-w-0">
                    <ScoreInputForm key={`${draft.type}-${draft.version}`} questionnaire={QUESTIONNAIRES[draft.type]}
                        initialScores={draft.scores} persistDraft={false} formId={`practice-score-form-${notebookId}`}
                        submitAction="save" submitLabel={l('save')} cancelLabel={l('cancel')} submitDisabled={busy} onDraftChange={() => { setDirty(true); setSaved(false); }}
                        onSubmit={(scores) => void save(scores)} onBack={cancel} />
                    </fieldset>
                </div>
            ) : (
                <button type="button" disabled={busy || results === null} onClick={() => { setDraft({ type: 'QSA', generated: false, version: 0 }); setSaved(false); setError(''); }}
                    className={`${secondary} inline-flex items-center gap-2`}>
                    <Plus className="h-4 w-4" aria-hidden="true" />{l('addProfile')}
                </button>
            )}
        </section>
    );
}
