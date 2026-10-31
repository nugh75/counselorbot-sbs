'use client';

// Open learner model: lo studente vede, modifica e cancella il proprio
// profilo auto-dichiarato. Append-only lato server: ogni salvataggio è una
// revisione, lo storico mostra il cambiamento nel tempo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch, getIdentity, withViewAsHeaders } from '@/lib/auth';
import { notebookAutosave, type NotebookAutosave, type NotebookData, type NotebookRevision, type SaveStatus } from '@/lib/notebook-autosave';
import { AlertCircle, ArrowRight, History, Pencil, Trash2, X } from 'lucide-react';
import { PencilButton } from '@/components/ui/PencilButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { BackButton } from '@/components/ui/BackButton';
import { AutoGrowTextarea } from '@/components/ui/AutoGrowTextarea';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { INSTITUTION_NOT_LISTED, fetchInstitutions, type Institution } from '@/lib/referrals-api';
import { goalApi, type GoalGroup, type PersonalGoal } from '@/lib/goals';
import { GoalDialog, type DialogTarget } from '@/components/goals/GoalDialog';

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
    { key: 'values', labelKey: 'lp.field.values', multiline: true },
    { key: 'goal', labelKey: 'lp.field.goal' },
    { key: 'main_difficulty', labelKey: 'lp.field.difficulty' },
    { key: 'strengths', labelKey: 'lp.field.strengths', multiline: true },
    { key: 'weaknesses', labelKey: 'lp.field.weaknesses', multiline: true },
    { key: 'notes', labelKey: 'lp.field.notes', multiline: true },
];
// `goal` resta nello storico per non perdere le revisioni precedenti, ma non è
// più una seconda casella da compilare nel Taccuino: gli obiettivi correnti
// vivono nella tabella dedicata dell'Area personale.
const CURRENT_FIELDS = FIELDS.filter((field) => field.key !== 'goal');

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

// Stesso limite per campo di LearnerProfileSave nel backend.
const NOTES_MAX_CHARS = 600;

export function LearnerProfileCard({ variant, sessionId, onDone, requireInitial = false, onUnavailable, onBack, suggestionOnly = false }: Props) {
    const { t } = useI18n();
    const [hidden, setHidden] = useState(false);
    const [loading, setLoading] = useState(true);
    // F03 (audit Area personale, lotto 1B): un 503 o un errore di rete non fa
    // sparire il taccuino — mostra l'errore con Riprova invece di nasconderlo.
    const [loadFailed, setLoadFailed] = useState(false);
    const [loadAttempt, setLoadAttempt] = useState(0);
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

    // Ponte «Rendi obiettivo la difficoltà» (C2): solo nella pagina personale
    // (variant 'edit'), non nel percorso guidato di intake/revisione.
    const showGoalBridge = variant === 'edit';
    const noteAppliedRef = useRef(false);
    const [goals, setGoals] = useState<PersonalGoal[]>([]);
    const [goalGroups, setGoalGroups] = useState<GoalGroup[]>([]);
    const [goalTarget, setGoalTarget] = useState<DialogTarget | null>(null);
    const [goalDialogSaved, setGoalDialogSaved] = useState(false);

    // goals/groups servono al GoalDialog: stesso carico di ResultReadingCard (C1).
    useEffect(() => {
        if (!showGoalBridge) return;
        let active = true;
        goalApi<PersonalGoal[]>('/user/goals').then((rows) => { if (active) setGoals(rows); }).catch(() => { if (active) setGoals([]); });
        goalApi<GoalGroup[]>('/user/goal-groups').then((rows) => { if (active) setGoalGroups(rows); }).catch(() => { if (active) setGoalGroups([]); });
        return () => { active = false; };
    }, [showGoalBridge]);

    const reloadGoals = useCallback(() => {
        goalApi<PersonalGoal[]>('/user/goals').then((rows) => setGoals(rows)).catch(() => setGoals([]));
    }, []);
    const closeGoalDialog = () => { setGoalTarget(null); setGoalDialogSaved(false); };
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
                if (!identity?.authenticated) { setHidden(true); return; }
                if (!res.ok) {
                    // Un errore del server non è “nessun taccuino”: resta visibile con Riprova.
                    if (res.status >= 500) { setLoadFailed(true); return; }
                    setHidden(true); return;
                }
                const rev: Revision | null = await res.json();
                if (!active) return;
                const saveHeaders = withViewAsHeaders({ 'Content-Type': 'application/json' });
                queue = notebookAutosave(identity.username, rev, async payload => {
                    const response = await fetch('/api/user/learner-profile', {
                        method: 'POST', keepalive: true,
                        headers: saveHeaders,
                        body: JSON.stringify({
                            ...payload.data,
                            source: payload.source,
                            session_id: payload.session_id,
                            save_mode: payload.save_mode,
                        }),
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
                    setSaved(current.status === 'saved' && current.lastSavedMode === 'manual');
                    setProfile(current.revision);
                    setHistory(null);
                });
                setProfile(queue.revision);
                setForm(queue.data);
                if (queue.pending) setEditing(true);
                setSaveStatus(queue.status);
                if (queue.pending) flush();
            } catch {
                if (active) setLoadFailed(true);
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
    }, [loadAttempt]);

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
        if (!await queue.commit(form, source, sessionId)) return;
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

    // Il Bilancio (B4) rimanda qui con `?note=`: la nota si accoda alle note
    // esistenti e la bozza risulta modificata, come un salvataggio normale.
    // Letto da `window.location` (non `useSearchParams`) per non richiedere un
    // confine Suspense sulla pagina, che monta questa card senza uno.
    // Applicata una volta, la nota esce dall'URL: ricaricare la pagina non la riaccoda.
    // Se con le note esistenti supera il limite del campo, resta nell'URL e non si scrive nulla.
    useEffect(() => {
        if (loading || noteAppliedRef.current || typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        const note = url.searchParams.get('note');
        if (!note) return;
        noteAppliedRef.current = true;
        const notes = [form.notes, note].filter(Boolean).join('\n\n');
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot `?note=` hand-off from the URL, consumed with replaceState once the profile has loaded
        if (notes.length > NOTES_MAX_CHARS) { setValidationError(t('lp.noteTooLong')); return; }
        changeForm({ ...form, notes });
        url.searchParams.delete('note');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading]);

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
        const notebookSuggestion = { ...suggestion.data };
        delete notebookSuggestion.goal;
        changeForm({ ...form, ...notebookSuggestion });
        setEditing(true);
        setSuggestionHandled(true);
    };

    if (hidden || dismissed || loading) return null;
    if (loadFailed) return <Card role="alert" className="space-y-4 p-6">
        <p className="text-sm text-danger-ink">{t('lp.loadError')}</p>
        <button type="button" onClick={() => { setLoadFailed(false); setLoading(true); setLoadAttempt(n => n + 1); }}
            className="min-h-control rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink-body hover:bg-surface-sunken">{t('lp.retry')}</button>
    </Card>;
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

    const filledEntries = CURRENT_FIELDS
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
            <div className="space-y-4">
                {CURRENT_FIELDS.map((f) => (
                    <label key={f.key} className="block">
                        <span className="text-xs font-semibold text-ink-muted">{t(f.labelKey)}</span>
                        {f.type === 'select' ? (
                            <select
                                value={form[f.key] || ''}
                                onChange={(e) => {
                                    changeForm({ ...form, [f.key]: e.target.value });
                                }}
                                className="mt-1 w-full rounded-control border border-line-strong px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
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
                                className="mt-1 w-full rounded-control border border-line-strong px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
                            />
                        ) : (
                            <AutoGrowTextarea
                                value={form[f.key] || ''}
                                maxLength={600}
                                minRows={f.multiline ? 2 : 1}
                                onChange={(e) => {
                                    changeForm({ ...form, [f.key]: e.target.value });
                                }}
                                className="mt-1 w-full rounded-control border border-line-strong px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
                            />
                        )}
                    </label>
                ))}
            </div>
            {/* Nel percorso i comandi restano anche in cima, fuori dalla Card,
                per la "prima riga" uniforme alle altre fasi; il Salva in coda
                evita di risalire tutto il modulo dopo la compilazione. */}
            <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4">
                {inFlow ? (
                    <ForwardButton
                        onClick={() => void save(saveSource)}
                        disabled={saving}
                        label={t('lp.save')}
                    />
                ) : (
                    <Button
                        onClick={() => void save(saveSource)}
                        disabled={saving}
                    >
                        {t('lp.save')}
                    </Button>
                )}
                {variant === 'edit' && editing && (
                    <Button variant="ghost" onClick={() => void save(saveSource)} aria-label={t('common.close')}>
                        <X className="w-4 h-4" />
                    </Button>
                )}
                {saved && <span className="text-sm text-success">{t('lp.saved')}</span>}
            </div>
            {validationError && <p className="text-sm text-danger">{validationError}</p>}
        </div>
    );

    const summaryUi = (
        <div className="space-y-4">
            {filledEntries.map((f) => (
                <div key={f.key} className="rounded-lg border border-line bg-surface-sunken/60 p-4">
                    <div className="text-xs font-semibold text-ink-muted">{t(f.labelKey)}</div>
                    <p className="mt-1 text-sm leading-relaxed text-ink">{f.value}</p>
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
                <div className="flex items-center gap-4">
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
                    {saved && <span className="text-sm text-success">{t('lp.saved')}</span>}
                </div>
            )}
            {inFlow && !showSummaryRow && (
                <div className="flex flex-wrap items-center gap-4">
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
                    {saved && <span className="text-sm text-success">{t('lp.saved')}</span>}
                </div>
            )}
            {saveStatus === 'error' && (
                <div role="alert" data-testid="notebook-autosave-status">
                    <span className="inline-flex items-center gap-2">
                        <span className="inline-flex" title={t('lp.autosaveError')} aria-label={t('lp.autosaveError')}>
                            <AlertCircle className="h-4 w-4 text-danger" aria-hidden="true" />
                        </span>
                        <Button size="sm" onClick={() => void autosave.current?.flush()}>{t('setup.retry')}</Button>
                    </span>
                </div>
            )}
            <Card className="p-6 space-y-4">
            {variant !== 'edit' && !suggestionOnly && (
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-ink">{title}</h3>
                </div>
            )}
            {!suggestionOnly && (
                <p className="text-sm leading-relaxed text-ink-muted">
                    {isIntake ? t('lp.intro') : t('lp.reviewIntro')}
                </p>
            )}

            {suggestion?.status === 'ready' && !suggestionHandled && (
                <section className="rounded-card border border-ochre-200 bg-ochre-50 p-4" aria-label={t('lp.suggestion.title')}>
                    <div className="flex items-start gap-4">
                        <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-move" />
                        <div className="min-w-0 flex-1">
                            <h4 className="font-display text-base font-semibold text-ink">{t('lp.suggestion.title')}</h4>
                            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('lp.suggestion.intro')}</p>
                            <dl className="mt-4 space-y-2">
                                {(['main_difficulty', 'notes'] as const).map((key) => {
                                    const value = suggestion.data[key]?.trim();
                                    const labelKey = key === 'main_difficulty' ? 'lp.field.difficulty'
                                        : 'lp.field.notes';
                                    return value ? (
                                        <div key={key}>
                                            <dt className="text-xs font-semibold text-ink-muted">{t(labelKey)}</dt>
                                            <dd className="mt-1 text-sm text-ink">{value}</dd>
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
                <div className="space-y-4">
                    {summaryUi}
                </div>
            ) : variant === 'edit' && !isIntake && !editing ? (
                <div className="space-y-4">
                    {summaryUi}
                    <div className="flex flex-wrap items-center gap-4">
                        <Button
                            variant="secondary"
                            className="w-control px-0"
                            onClick={() => setEditing(true)}
                            aria-label={t('lp.edit')}
                            title={t('lp.edit')}
                        >
                            <Pencil className="w-4 h-4" aria-hidden />
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => void loadHistory()}
                        >
                            <History className="w-4 h-4" /> {t('lp.history')}
                        </Button>
                        {confirmDelete ? (
                            <span className="inline-flex items-center gap-2 text-sm">
                                <span className="text-danger">{t('lp.deleteConfirm')}</span>
                                <Button size="sm" variant="danger" onClick={() => void deleteAll()}>{t('lp.delete')}</Button>
                                <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>{t('lp.skip')}</Button>
                            </span>
                        ) : (
                            <Button
                                variant="ghost"
                                onClick={() => setConfirmDelete(true)}
                                className="w-control px-0 text-danger hover:bg-danger-soft hover:text-danger-ink"
                                aria-label={t('lp.delete')}
                                title={t('lp.delete')}
                            >
                                <Trash2 className="w-4 h-4" aria-hidden />
                            </Button>
                        )}
                        {saved && <span className="text-sm text-success">{t('lp.saved')}</span>}
                    </div>
                    {showHistory && (
                        <div className="border-t border-line pt-4 space-y-4">
                            {!history?.length && <p className="text-sm text-ink-muted">{t('lp.historyEmpty')}</p>}
                            {history?.map((rev) => (
                                <div key={rev.id} className="text-sm">
                                    <div className="text-xs text-ink-muted">
                                        {new Date(rev.created_at).toLocaleDateString()} · {rev.source}
                                    </div>
                                    <ul className="ml-4 mt-1 space-y-1 text-ink-muted">
                                        {FIELDS.map((f) => {
                                            const value = (rev.data?.[f.key] || '').trim();
                                            return value ? <li key={f.key}><span className="text-ink-muted">{t(f.labelKey)}:</span> {value}</li> : null;
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
            {showGoalBridge && !suggestionOnly && (form.main_difficulty || '').trim() && (
                <div className="border-t border-line pt-4">
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setGoalDialogSaved(false);
                            setGoalTarget({ kind: 'create', origin: { kind: 'notebook', target_id: 'current' }, prefill: { motivation: form.values } });
                        }}
                    >
                        <ArrowRight className="h-4 w-4" aria-hidden />
                        {t('lp.bridge.difficultyToGoal')}
                    </Button>
                </div>
            )}
            </Card>
            {goalTarget && (
                <GoalDialog
                    target={goalTarget}
                    goals={goals}
                    groups={goalGroups}
                    saved={goalDialogSaved}
                    onTarget={(next) => { setGoalDialogSaved(false); setGoalTarget(next); }}
                    onClose={closeGoalDialog}
                    onReload={reloadGoals}
                    onSaved={(row) => { setGoals((previous) => previous.map((goal) => goal.id === row.id ? row : goal)); setGoalDialogSaved(true); }}
                    onCreated={(row) => { setGoals((previous) => [row, ...previous]); setGoalDialogSaved(true); closeGoalDialog(); }}
                    onDeleted={() => { closeGoalDialog(); reloadGoals(); }}
                />
            )}
        </div>
    );
}
