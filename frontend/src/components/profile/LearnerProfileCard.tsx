'use client';

// Open learner model: lo studente vede, modifica e cancella il proprio
// profilo auto-dichiarato. Append-only lato server: ogni salvataggio è una
// revisione, lo storico mostra il cambiamento nel tempo.

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { History, Trash2, Pencil, X } from 'lucide-react';
import { PencilButton } from '@/components/ui/PencilButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { BackButton } from '@/components/ui/BackButton';
import { AutoGrowTextarea } from '@/components/ui/AutoGrowTextarea';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export interface LearnerProfileData {
    context?: string;
    goal?: string;
    main_difficulty?: string;
    strengths?: string;
    weaknesses?: string;
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

interface NotebookSuggestion {
    status: 'pending' | 'insufficient_evidence' | 'ready';
    user_turns: number;
    min_user_turns: number;
    data: LearnerProfileData;
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
    { key: 'strengths', labelKey: 'lp.field.strengths', multiline: true },
    { key: 'weaknesses', labelKey: 'lp.field.weaknesses', multiline: true },
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
    // Rende la "prima riga" uniforme alle altre fasi di selezione
    // (BackButton freccia sinistra + matita + freccia destra). Se omesso, la
    // riga superiore non mostra il back.
    onBack?: () => void;
    // Nella chat libera mostra l'intera card soltanto quando il backend ha una
    // proposta basata su evidenze sufficienti; nessun invito generico anticipato.
    suggestionOnly?: boolean;
}

export function LearnerProfileCard({ variant, sessionId, onDone, requireInitial = false, onUnavailable, onBack, suggestionOnly = false }: Props) {
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
    const [suggestion, setSuggestion] = useState<NotebookSuggestion | null>(null);
    const [suggestionHandled, setSuggestionHandled] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await apiFetch('/api/user/learner-profile');
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

    useEffect(() => {
        if (variant !== 'update' || !sessionId) return;
        let cancelled = false;
        void apiFetch(`/api/user/learner-profile/suggestion?session_id=${encodeURIComponent(sessionId)}`)
            .then(async (res) => {
                if (!cancelled && res.ok) setSuggestion(await res.json());
            })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, [sessionId, variant]);

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
            const res = await apiFetch('/api/user/learner-profile', {
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
            const res = await apiFetch('/api/user/learner-profile/history');
            if (res.ok) setHistory(await res.json());
        }
        setShowHistory(true);
    };

    const deleteAll = async () => {
        await apiFetch('/api/user/learner-profile', { method: 'DELETE' });
        setProfile(null);
        setForm({});
        setHistory(null);
        setShowHistory(false);
        setConfirmDelete(false);
    };

    const useSuggestion = () => {
        if (suggestion?.status !== 'ready') return;
        setForm((current) => ({ ...current, ...suggestion.data }));
        setEditing(true);
        setSuggestionHandled(true);
    };

    if (hidden || dismissed || loading) return null;
    if (suggestionOnly && (suggestion?.status !== 'ready' || (suggestionHandled && !editing))) return null;
    // Revisione a inizio sessione: se non c'è ancora un profilo si propone
    // l'intake, se c'è si chiede conferma rapida (un click se nulla è cambiato).
    const isIntake = !profile;
    // Il taccuino compare sia come passo del percorso (la Bussola lo apre quando
    // scegli uno strumento, la home come intake prima del primo) sia come card
    // della pagina personale. Solo nel primo caso e' una fase di una sequenza, e
    // deve avere la stessa "prima riga" di comandi di tutte le altre.
    const inFlow = variant === 'review' || variant === 'update';
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
                        {f.type === 'number' ? (
                            <input
                                type="number"
                                value={form[f.key] || ''}
                                maxLength={600}
                                onChange={(e) => {
                                    setValidationError('');
                                    setForm((prev) => ({ ...prev, [f.key]: e.target.value }));
                                }}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                        ) : (
                            <AutoGrowTextarea
                                value={form[f.key] || ''}
                                maxLength={600}
                                minRows={f.multiline ? 2 : 1}
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
            {/* Nel percorso i comandi stanno in cima, fuori dalla Card: qui in fondo
                resta solo il caso della pagina personale, dove il taccuino non e'
                un passo di una sequenza. */}
            {!inFlow && (
                <div className="flex items-center gap-3 pt-1">
                    <Button
                        onClick={() => void save(saveSource)}
                        disabled={saving}
                    >
                        {t('lp.save')}
                    </Button>
                    {variant === 'edit' && editing && (
                        <Button variant="ghost" onClick={() => { setEditing(false); setForm(profile?.data ?? {}); }} aria-label={t('lp.skip')}>
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                    {saved && <span className="text-sm text-emerald-600">{t('lp.saved')}</span>}
                </div>
            )}
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

    // Il riepilogo di un taccuino gia' scritto ha comandi propri (conferma +
    // matita); in tutti gli altri stati del percorso si sta compilando il modulo.
    const showSummaryRow = variant === 'review' && !isIntake && !editing;

    const title = variant === 'update' ? t('lp.updateTitle')
        : variant === 'review' && !isIntake ? t('lp.reviewTitle')
        : t('lp.title');

    return (
        <div className="space-y-4">
            {/* "Prima riga" uniforme a tutte le altre fasi: pulsanti fuori dal */}
            {/* frame del taccuino (BackButton + PencilButton + ForwardButton). */}
            {showSummaryRow && (
                <div className="flex items-center gap-3">
                    {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
                    <ForwardButton
                        onClick={() => void save('session_start')}
                        disabled={saving}
                        label={t('lp.confirm')}
                    />
                    <PencilButton
                        onClick={() => setEditing(true)}
                        label={t('lp.edit')}
                    />
                    {saved && <span className="text-sm text-emerald-600">{t('lp.saved')}</span>}
                </div>
            )}
            {inFlow && !showSummaryRow && (
                <div className="flex flex-wrap items-center gap-3">
                    {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
                    <ForwardButton
                        onClick={() => void save(saveSource)}
                        disabled={saving}
                        label={t('lp.save')}
                    />
                    {!(requireInitial && isIntake) && (
                        <Button variant="ghost" onClick={() => setDismissed(true)}>
                            {t('lp.skip')}
                        </Button>
                    )}
                    {saved && <span className="text-sm text-emerald-600">{t('lp.saved')}</span>}
                </div>
            )}
            <Card className="p-5 space-y-4">
            {variant !== 'edit' && !suggestionOnly && (
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-800">{title}</h3>
                </div>
            )}
            {!suggestionOnly && (
                <p className="text-sm leading-relaxed text-slate-500">
                    {isIntake ? t('lp.intro') : t('lp.reviewIntro')}
                </p>
            )}

            {suggestion?.status === 'ready' && !suggestionHandled && (
                <section className="rounded-xl border border-ochre-200 bg-ochre-50 p-4" aria-label={t('lp.suggestion.title')}>
                    <div className="flex items-start gap-3">
                        <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-ochre-500" />
                        <div className="min-w-0 flex-1">
                            <h4 className="font-display text-base font-semibold text-slate-900">{t('lp.suggestion.title')}</h4>
                            <p className="mt-1 text-sm leading-relaxed text-slate-600">{t('lp.suggestion.intro')}</p>
                            <dl className="mt-3 space-y-2">
                                {(['goal', 'main_difficulty', 'notes'] as const).map((key) => {
                                    const value = suggestion.data[key]?.trim();
                                    const labelKey = key === 'goal' ? 'lp.field.goal'
                                        : key === 'main_difficulty' ? 'lp.field.difficulty'
                                        : 'lp.field.notes';
                                    return value ? (
                                        <div key={key}>
                                            <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t(labelKey)}</dt>
                                            <dd className="mt-0.5 text-sm text-slate-800">{value}</dd>
                                        </div>
                                    ) : null;
                                })}
                            </dl>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button size="sm" onClick={useSuggestion}>{t('lp.suggestion.use')}</Button>
                                <Button size="sm" variant="ghost" onClick={() => setSuggestionHandled(true)}>{t('lp.skip')}</Button>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {suggestionOnly && !editing ? null : variant === 'review' && !isIntake && !editing ? (
                <div className="space-y-3">
                    {summaryUi}
                </div>
            ) : variant === 'edit' && !isIntake && !editing ? (
                <div className="space-y-3">
                    {summaryUi}
                    <div className="flex flex-wrap items-center gap-3">
                        <Button
                            variant="secondary"
                            onClick={() => setEditing(true)}
                        >
                            <Pencil className="w-4 h-4" /> {t('lp.edit')}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => void loadHistory()}
                        >
                            <History className="w-4 h-4" /> {t('lp.history')}
                        </Button>
                        {confirmDelete ? (
                            <span className="inline-flex items-center gap-2 text-sm">
                                <span className="text-red-600">{t('lp.deleteConfirm')}</span>
                                <Button size="sm" variant="danger" onClick={() => void deleteAll()}>{t('lp.delete')}</Button>
                                <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>{t('lp.skip')}</Button>
                            </span>
                        ) : (
                            <Button
                                variant="ghost"
                                onClick={() => setConfirmDelete(true)}
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                                <Trash2 className="w-4 h-4" /> {t('lp.delete')}
                            </Button>
                        )}
                        {saved && <span className="text-sm text-emerald-600">{t('lp.saved')}</span>}
                    </div>
                    {showHistory && (
                        <div className="border-t border-slate-200 pt-3 space-y-3">
                            {!history?.length && <p className="text-sm text-slate-500">{t('lp.historyEmpty')}</p>}
                            {history?.map((rev) => (
                                <div key={rev.id} className="text-sm">
                                    <div className="text-xs text-slate-500">
                                        {new Date(rev.created_at).toLocaleDateString()} · {rev.source}
                                    </div>
                                    <ul className="ml-3 mt-0.5 space-y-0.5 text-slate-600">
                                        {FIELDS.map((f) => {
                                            const value = (rev.data?.[f.key] || '').trim();
                                            return value ? <li key={f.key}><span className="text-slate-500">{t(f.labelKey)}:</span> {value}</li> : null;
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
            </Card>
        </div>
    );
}
