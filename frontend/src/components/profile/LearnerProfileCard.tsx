'use client';

// Open learner model: lo studente vede, modifica e cancella il proprio
// profilo auto-dichiarato. Append-only lato server: ogni salvataggio è una
// revisione, lo storico mostra il cambiamento nel tempo.

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch, getIdentity, withViewAsHeaders } from '@/lib/auth';
import { notebookAutosave, type NotebookAutosave, type NotebookData, type NotebookRevision, type SaveStatus } from '@/lib/notebook-autosave';
import { History, Trash2, Pencil, X } from 'lucide-react';
import { PencilButton } from '@/components/ui/PencilButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { BackButton } from '@/components/ui/BackButton';
import { AutoGrowTextarea } from '@/components/ui/AutoGrowTextarea';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { INSTITUTION_NOT_LISTED, fetchInstitutions, type Institution } from '@/lib/referrals-api';

export type LearnerProfileData = NotebookData;
type Revision = NotebookRevision;

interface NotebookSuggestion {
    status: 'pending' | 'insufficient_evidence' | 'ready';
    user_turns: number;
    min_user_turns: number;
    data: LearnerProfileData;
}

type Variant = 'edit' | 'review' | 'update';

const FIELDS: {
    key: keyof LearnerProfileData;
    labelKey: string;
    multiline?: boolean;
    type?: 'number' | 'select';
}[] = [
    { key: 'age', labelKey: 'lp.field.age', type: 'number' },
    { key: 'gender', labelKey: 'lp.field.gender' },
    { key: 'school_class', labelKey: 'lp.field.schoolClass' },
    { key: 'school_year', labelKey: 'lp.field.schoolYear' },
    { key: 'institution_slug', labelKey: 'lp.field.institution', type: 'select' },
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
    const autosave = useRef<NotebookAutosave | null>(null);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [dismissed, setDismissed] = useState(false);
    const [history, setHistory] = useState<Revision[] | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [institutions, setInstitutions] = useState<Institution[]>([]);

    // L'elenco serve solo al select: un errore di rete non deve impedire di
    // salvare il resto del taccuino, quindi si degrada a lista vuota.
    useEffect(() => {
        let alive = true;
        fetchInstitutions()
            .then((rows) => { if (alive) setInstitutions(rows); })
            .catch(() => { if (alive) setInstitutions([]); });
        return () => { alive = false; };
    }, []);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [validationError, setValidationError] = useState('');
    const [suggestion, setSuggestion] = useState<NotebookSuggestion | null>(null);
    const [suggestionHandled, setSuggestionHandled] = useState(false);

    useEffect(() => {
        let active = true;
        let queue: NotebookAutosave | null = null;
        let unsubscribe: (() => void) | undefined;
        const flush = () => { void queue?.flush(); };
        void (async () => {
            try {
                const [identity, res] = await Promise.all([getIdentity(), apiFetch('/api/user/learner-profile')]);
                if (!active) return;
                if (!identity?.authenticated || !res.ok) { setHidden(true); return; }
                const rev: Revision | null = await res.json();
                if (!active) return;
                const saveHeaders = withViewAsHeaders({ 'Content-Type': 'application/json' });
                queue = notebookAutosave(identity.username, rev, async payload => {
                    const response = await fetch('/api/user/learner-profile', {
                        method: 'POST', keepalive: true,
                        headers: saveHeaders,
                        body: JSON.stringify({ ...payload.data, source: payload.source, session_id: payload.session_id }),
                    });
                    if (!response.ok) throw new Error('Notebook save failed');
                    return await response.json() as Revision;
                }, {
                    getItem: key => window.localStorage.getItem(key),
                    setItem: (key, value) => window.localStorage.setItem(key, value),
                    removeItem: key => window.localStorage.removeItem(key),
                });
                autosave.current = queue;
                const current = queue;
                unsubscribe = queue.subscribe(() => {
                    if (!active) return;
                    setSaveStatus(current.status);
                    setSaving(current.status === 'saving');
                    setSaved(current.status === 'saved');
                    setProfile(current.revision);
                    setHistory(null);
                });
                setProfile(queue.revision);
                setForm(queue.data);
                if (queue.pending) setEditing(true);
                setSaveStatus(queue.status);
                if (queue.pending) flush();
            } catch {
                if (active) setHidden(true);
            } finally {
                if (active) setLoading(false);
            }
        })();
        window.addEventListener('pagehide', flush);
        window.addEventListener('online', flush);
        return () => {
            active = false;
            unsubscribe?.();
            flush();
            window.removeEventListener('pagehide', flush);
            window.removeEventListener('online', flush);
        };
    }, []);

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
        if (requireInitial && !Object.values(form).some((value) => (value || '').trim())) {
            setValidationError(t('lp.required'));
            return;
        }
        setValidationError('');
        const queue = autosave.current;
        if (!queue) return;
        queue.update(form, source, sessionId);
        if (!await queue.flush()) return;
        setEditing(false);
        if (variant !== 'edit') setTimeout(() => setDismissed(true), 1200);
        onDone?.();
    };

    const changeForm = (next: LearnerProfileData) => {
        setValidationError('');
        setForm(next);
        setEditing(true);
        autosave.current?.update(next, variant === 'update' ? 'session_end' : (profile ? 'manual' : 'intake'), sessionId);
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
        await autosave.current?.flush();
        const res = await apiFetch('/api/user/learner-profile', { method: 'DELETE' });
        if (!res.ok) { setValidationError(t('setup.error')); return; }
        autosave.current?.reset();
        setProfile(null);
        setForm({});
        setHistory(null);
        setShowHistory(false);
        setConfirmDelete(false);
    };

    const useSuggestion = () => {
        if (suggestion?.status !== 'ready') return;
        changeForm({ ...form, ...suggestion.data });
        setEditing(true);
        setSuggestionHandled(true);
    };

    if (hidden || dismissed || loading) return null;
    if (suggestionOnly && (suggestion?.status !== 'ready' || (suggestionHandled && !editing))) return null;
    // Revisione a inizio sessione: se non c'è ancora un profilo si propone
    // l'intake, se c'è si chiede conferma rapida (un click se nulla è cambiato).
    const isIntake = !profile || (requireInitial && !Object.values(profile.data).some(value => String(value || '').trim()));
    // Il taccuino compare sia come passo del percorso (la Bussola lo apre quando
    // scegli uno strumento, la home come intake prima del primo) sia come card
    // della pagina personale. Solo nel primo caso e' una fase di una sequenza, e
    // deve avere la stessa "prima riga" di comandi di tutte le altre.
    const inFlow = variant === 'review' || variant === 'update';
    const saveSource = variant === 'update' ? 'session_end'
        : variant === 'review' ? (isIntake ? 'intake' : 'session_start')
        : (isIntake ? 'intake' : 'manual');

    const filledEntries = FIELDS
        .map((f) => {
            const raw = (profile?.data?.[f.key] || '').trim();
            if (f.key !== 'institution_slug') return { ...f, value: raw };
            // Lo slug e' una chiave, non una cosa da mostrare a una persona.
            if (raw === INSTITUTION_NOT_LISTED) return { ...f, value: t('lp.institution.notListed') };
            const match = institutions.find((i) => i.slug === raw);
            return { ...f, value: match ? match.name : '' };
        })
        .filter((f) => f.value);

    const formUi = (
        <div className="space-y-4">
            <div className="space-y-3">
                {FIELDS.map((f) => (
                    <label key={f.key} className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t(f.labelKey)}</span>
                        {f.type === 'select' ? (
                            <select
                                value={form[f.key] || ''}
                                onChange={(e) => {
                                    changeForm({ ...form, [f.key]: e.target.value });
                                }}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                                <option value="">{t('lp.institution.choose')}</option>
                                {institutions.map((institution) => (
                                    <option key={institution.slug} value={institution.slug}>
                                        {institution.name}
                                    </option>
                                ))}
                                {/* Un campo libero riporterebbe dentro il match fragile
                                    che l'anagrafica esiste per evitare: chi non si trova
                                    in elenco lo dichiara, e vede le sole righe nazionali. */}
                                <option value={INSTITUTION_NOT_LISTED}>{t('lp.institution.notListed')}</option>
                            </select>
                        ) : f.type === 'number' ? (
                            <input
                                type="number"
                                value={form[f.key] || ''}
                                maxLength={600}
                                onChange={(e) => {
                                    changeForm({ ...form, [f.key]: e.target.value });
                                }}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                        ) : (
                            <AutoGrowTextarea
                                value={form[f.key] || ''}
                                maxLength={600}
                                minRows={f.multiline ? 2 : 1}
                                onChange={(e) => {
                                    changeForm({ ...form, [f.key]: e.target.value });
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
                        <Button variant="ghost" onClick={() => void save(saveSource)} aria-label={t('common.close')}>
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
            <div role="status" aria-live="polite" className="text-sm text-slate-600">
                {(saveStatus === 'pending' || saveStatus === 'saving') && t('lp.autosaving')}
                {saveStatus === 'error' && <><span>{t('lp.autosaveError')}</span> <Button size="sm" onClick={() => void autosave.current?.flush()}>{t('setup.retry')}</Button></>}
            </div>
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
