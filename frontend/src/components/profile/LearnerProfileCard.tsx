'use client';

// Open learner model: lo studente vede, modifica e cancella il proprio
// profilo auto-dichiarato. Append-only lato server: ogni salvataggio è una
// revisione, lo storico mostra il cambiamento nel tempo.

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { History, Trash2, Check, Pencil, X } from 'lucide-react';

export interface LearnerProfileData {
    context?: string;
    goal?: string;
    main_difficulty?: string;
    tried?: string;
    notes?: string;
    gender?: string;
    age?: string;
    school_class?: string;
    school_year?: string;
}

interface Revision {
    id: number;
    data: LearnerProfileData;
    source: string;
    session_id?: string | null;
    created_at: string;
}

type Variant = 'edit' | 'review' | 'update';

const FIELDS: { key: keyof LearnerProfileData; labelKey: string; multiline?: boolean; type?: 'number' }[] = [
    { key: 'age', labelKey: 'lp.field.age', type: 'number' },
    { key: 'gender', labelKey: 'lp.field.gender' },
    { key: 'school_class', labelKey: 'lp.field.schoolClass' },
    { key: 'school_year', labelKey: 'lp.field.schoolYear' },
    { key: 'context', labelKey: 'lp.field.context' },
    { key: 'goal', labelKey: 'lp.field.goal' },
    { key: 'main_difficulty', labelKey: 'lp.field.difficulty' },
    { key: 'tried', labelKey: 'lp.field.tried', multiline: true },
    { key: 'notes', labelKey: 'lp.field.notes', multiline: true },
];

interface Props {
    variant: Variant;
    sessionId?: string;
    onDone?: () => void;
    requireInitial?: boolean;
    // Chiamato quando la card non ha nulla da mostrare (non autenticato / errore /
    // dismessa): permette al parent di saltare in automatico la schermata profilo.
    onUnavailable?: () => void;
}

export function LearnerProfileCard({ variant, sessionId, onDone, requireInitial = false, onUnavailable }: Props) {
    const { t } = useI18n();
    const [hidden, setHidden] = useState(false);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<Revision | null>(null);
    const [form, setForm] = useState<LearnerProfileData>({});
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [history, setHistory] = useState<Revision[] | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [validationError, setValidationError] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/user/learner-profile');
            if (res.status === 401) { setHidden(true); return; }
            if (!res.ok) { setHidden(true); return; }
            const rev: Revision | null = await res.json();
            setProfile(rev);
            setForm(rev?.data ?? {});
        } catch {
            setHidden(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    // Avvisa il parent quando non c'è nulla da rivedere (così salta la schermata).
    useEffect(() => {
        if (hidden || dismissed) onUnavailable?.();
    }, [hidden, dismissed, onUnavailable]);

    const save = async (source: string) => {
        if (requireInitial && !profile && !Object.values(form).some((value) => (value || '').trim())) {
            setValidationError(t('lp.required'));
            return;
        }
        setValidationError('');
        setSaving(true);
        try {
            const res = await fetch('/api/user/learner-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, source, session_id: sessionId || null }),
            });
            if (res.ok) {
                const rev: Revision = await res.json();
                setProfile(rev);
                setForm(rev.data);
                setSaved(true);
                setEditing(false);
                setHistory(null);
                if (variant !== 'edit') {
                    setTimeout(() => setDismissed(true), 1200);
                }
                onDone?.();
            }
        } finally {
            setSaving(false);
        }
    };

    const loadHistory = async () => {
        if (showHistory) { setShowHistory(false); return; }
        if (history === null) {
            const res = await fetch('/api/user/learner-profile/history');
            if (res.ok) setHistory(await res.json());
        }
        setShowHistory(true);
    };

    const deleteAll = async () => {
        await fetch('/api/user/learner-profile', { method: 'DELETE' });
        setProfile(null);
        setForm({});
        setHistory(null);
        setShowHistory(false);
        setConfirmDelete(false);
    };

    if (hidden || dismissed || loading) return null;
    // Revisione a inizio sessione: se non c'è ancora un profilo si propone
    // l'intake, se c'è si chiede conferma rapida (un click se nulla è cambiato).
    const isIntake = !profile;
    const saveSource = variant === 'update' ? 'session_end'
        : variant === 'review' ? (isIntake ? 'intake' : 'session_start')
        : (isIntake ? 'intake' : 'manual');

    const filledEntries = FIELDS
        .map((f) => ({ ...f, value: (profile?.data?.[f.key] || '').trim() }))
        .filter((f) => f.value);

    const formUi = (
        <div className="space-y-4">
            <div className="space-y-3">
                {FIELDS.map((f) => (
                    <label key={f.key} className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t(f.labelKey)}</span>
                        {f.multiline ? (
                            <textarea
                                value={form[f.key] || ''}
                                maxLength={600}
                                rows={2}
                                onChange={(e) => {
                                    setValidationError('');
                                    setForm((prev) => ({ ...prev, [f.key]: e.target.value }));
                                }}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                        ) : (
                            <input
                                type={f.type ?? 'text'}
                                value={form[f.key] || ''}
                                maxLength={600}
                                onChange={(e) => {
                                    setValidationError('');
                                    setForm((prev) => ({ ...prev, [f.key]: e.target.value }));
                                }}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                        )}
                    </label>
                ))}
            </div>
            <div className="flex items-center gap-3 pt-1">
                <button
                    onClick={() => void save(saveSource)}
                    disabled={saving}
                    className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                    {t('lp.save')}
                </button>
                {variant !== 'edit' && !(requireInitial && isIntake) && (
                    <button onClick={() => setDismissed(true)} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">
                        {t('lp.skip')}
                    </button>
                )}
                {variant === 'edit' && editing && (
                    <button onClick={() => { setEditing(false); setForm(profile?.data ?? {}); }} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">
                        <X className="w-4 h-4" />
                    </button>
                )}
                {saved && <span className="text-sm text-emerald-600">{t('lp.saved')}</span>}
            </div>
            {validationError && <p className="text-sm text-red-600">{validationError}</p>}
        </div>
    );

    const summaryUi = (
        <div className="space-y-3">
            {filledEntries.map((f) => (
                <div key={f.key} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t(f.labelKey)}</div>
                    <p className="mt-1 text-sm leading-relaxed text-slate-800">{f.value}</p>
                </div>
            ))}
        </div>
    );

    const title = variant === 'update' ? t('lp.updateTitle')
        : variant === 'review' && !isIntake ? t('lp.reviewTitle')
        : t('lp.title');

    return (
        <div className="glass-panel p-5 space-y-4">
            {variant !== 'edit' && (
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-800">{title}</h3>
                </div>
            )}
            <p className="text-sm leading-relaxed text-slate-500">
                {isIntake ? t('lp.intro') : t('lp.reviewIntro')}
            </p>

            {variant === 'review' && !isIntake && !editing ? (
                <div className="space-y-3">
                    {summaryUi}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => void save('session_start')}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                        >
                            <Check className="w-4 h-4" /> {t('lp.confirm')}
                        </button>
                        <button
                            onClick={() => setEditing(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-800"
                        >
                            <Pencil className="w-4 h-4" /> {t('lp.edit')}
                        </button>
                    </div>
                </div>
            ) : variant === 'edit' && !isIntake && !editing ? (
                <div className="space-y-3">
                    {summaryUi}
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => setEditing(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                        >
                            <Pencil className="w-4 h-4" /> {t('lp.edit')}
                        </button>
                        <button
                            onClick={() => void loadHistory()}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                        >
                            <History className="w-4 h-4" /> {t('lp.history')}
                        </button>
                        {confirmDelete ? (
                            <span className="inline-flex items-center gap-2 text-sm">
                                <span className="text-red-600">{t('lp.deleteConfirm')}</span>
                                <button onClick={() => void deleteAll()} className="px-2 py-1 rounded bg-red-600 text-white text-xs">{t('lp.delete')}</button>
                                <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded border text-xs">{t('lp.skip')}</button>
                            </span>
                        ) : (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-500 hover:text-red-700"
                            >
                                <Trash2 className="w-4 h-4" /> {t('lp.delete')}
                            </button>
                        )}
                        {saved && <span className="text-sm text-emerald-600">{t('lp.saved')}</span>}
                    </div>
                    {showHistory && (
                        <div className="border-t border-slate-200 pt-3 space-y-3">
                            {!history?.length && <p className="text-sm text-slate-400">{t('lp.historyEmpty')}</p>}
                            {history?.map((rev) => (
                                <div key={rev.id} className="text-sm">
                                    <div className="text-xs text-slate-400">
                                        {new Date(rev.created_at).toLocaleDateString()} · {rev.source}
                                    </div>
                                    <ul className="ml-3 mt-0.5 space-y-0.5 text-slate-600">
                                        {FIELDS.map((f) => {
                                            const value = (rev.data?.[f.key] || '').trim();
                                            return value ? <li key={f.key}><span className="text-slate-400">{t(f.labelKey)}:</span> {value}</li> : null;
                                        })}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                formUi
            )}
        </div>
    );
}
