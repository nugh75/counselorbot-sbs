'use client';

import { cloneElement, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Check, Play, Plus, RefreshCw, Save, Square, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { BackButton } from '@/components/ui/BackButton';
import { Callout } from '@/components/ui/Callout';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { cn } from '@/lib/utils';
import { promptLabCopy, type PromptLabCopy } from './prompt-lab-copy';
import { PromptExperimentContext, targetLabel, type PromptTarget } from './PromptExperimentContext';
import { promptLabContextCopy } from './prompt-lab-context-copy';
import { compareCandidate } from './prompt-lab-comparison';

// The backend owns eligibility and version checks; this panel presents the evidence.

const BASE = '/api/admin/prompt-experiments';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

const inputCls = 'h-9 w-full rounded-control border border-line bg-surface px-2 text-sm text-ink-body outline-none focus:border-focus';
const textareaCls = 'w-full rounded-control border border-line bg-surface px-2 py-2 text-sm text-ink-body outline-none focus:border-focus';

interface Preset {
    id: number;
    name: string;
    provider: string;
    model: string;
    temperature: number | null;
    max_tokens: number | null;
    disable_thinking: boolean;
}
interface LabOptions {
    enabled: boolean;
    reason: string | null;
    presets: Preset[];
    targets: PromptTarget[];
    languages: string[];
}
interface HistoryTurn { role: 'user' | 'assistant'; content: string; }
interface LabCase {
    id: string;
    group_id: string;
    split: 'development' | 'validation' | 'final';
    language: string;
    message: string;
    history: HistoryTurn[];
    expected: string;
}
interface Goal { text: string; criterion: string; }
interface Candidate { id: string; text: string; reason: string; expected: string; }
interface SnapshotPresets { designer: Preset; proposer: Preset | null; judge: Preset; tested: Preset[]; }
interface Snapshot { baseline: string; presets: SnapshotPresets; render_data?: { steps: PromptTarget[] }; [key: string]: unknown; }
interface LabRun {
    id: string;
    kind: 'prepare' | 'evaluate';
    state: string;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    heartbeat_at: string | null;
    cancel_requested: boolean;
    calls: number;
    error: string | null;
    manifest_hash: string;
    summary: unknown;
}
interface Metric { language?: string; preset_id: number; variant_id: string; split: string; passed: number; total: number; errors: number; }
interface Summary {
    eligibility: 'eligible' | 'not_eligible' | 'inconclusive' | 'not_applicable';
    selected_candidate_id: string | null;
    metrics: Metric[];
    reason: string;
    goals: unknown[];
    completed_calls: number;
}
interface Result {
    id: string;
    case_id: string;
    preset_id: number;
    variant_id: string;
    repetition: number;
    response: string;
    judgment: Record<string, unknown> | null;
    error: string | null;
    duration_s: number | null;
}
interface Decision { action: 'accept' | 'reject' | 'restore'; revision_id: string | null; }
interface Payload {
    title: string;
    purpose: 'verification' | 'improvement';
    target_key: string;
    goals: Goal[];
    languages: string[];
    designer_preset_id: number;
    proposer_preset_id: number | null;
    judge_preset_id: number;
    tested_preset_ids: number[];
    max_calls: number;
    max_minutes: number;
}
interface Experiment {
    id: string;
    title: string;
    purpose: 'verification' | 'improvement';
    target_key: string;
    state: string;
    created_at: string;
    payload: Payload;
    snapshot: Snapshot | null;
    cases: LabCase[];
    candidates: Candidate[];
    summary: Summary | null;
    error: string | null;
    runs: LabRun[];
    results: Result[];
    decision: Decision | null;
    manifest_hash?: string;
    approval_blockers?: string[];
}

interface GoalDraft { key: number; text: string; criterion: string; }

// L'errore del backend è {detail}: mai esporre segreti, mai inventare messaggi.
async function parseError(res: Response): Promise<Error> {
    try {
        const data = await res.json();
        if (data && typeof data.detail === 'string' && data.detail) return new Error(data.detail);
    } catch { /* corpo non JSON */ }
    return new Error(`HTTP ${res.status}`);
}

interface DiffLine { type: 'same' | 'del' | 'add'; text: string; }

// Diff riga-per-riga senza librerie: LCS su righe, sufficiente per i prompt.
function diffLines(before: string, after: string): DiffLine[] {
    const a = before.split('\n');
    const b = after.split('\n');
    if (a.length * b.length > 250000) return [...a.map((text): DiffLine => ({ type: 'del', text })), ...b.map((text): DiffLine => ({ type: 'add', text }))];
    const n = a.length;
    const m = b.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const out: DiffLine[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i++; }
        else { out.push({ type: 'add', text: b[j] }); j++; }
    }
    while (i < n) { out.push({ type: 'del', text: a[i] }); i++; }
    while (j < m) { out.push({ type: 'add', text: b[j] }); j++; }
    return out;
}

function fmtTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function L({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    const id = useId();
    return (
        <div className={cn('flex flex-col text-xs font-semibold text-ink-muted', className)}>
            <label htmlFor={id}>{label}</label>
            {isValidElement(children) ? cloneElement(children as ReactElement<{ id: string }>, { id }) : children}
        </div>
    );
}

function StateBadge({ value, map, kind }: { value: string; map: Record<string, string>; kind: 'state' | 'run' }) {
    const TONES: Record<string, string> = kind === 'state'
        ? {
            draft: 'bg-surface-raised text-ink-muted', ready: 'bg-info-soft text-info-ink', running: 'bg-brand-soft text-link',
            completed: 'bg-success-soft text-success', failed: 'bg-danger-soft text-danger-ink', cancelled: 'bg-surface-raised text-ink-muted',
            activated: 'bg-success-soft text-success', error: 'bg-danger-soft text-danger-ink',
        }
        : {
            queued: 'bg-surface-raised text-ink-muted', running: 'bg-brand-soft text-link', completed: 'bg-success-soft text-success',
            failed: 'bg-danger-soft text-danger-ink', cancelled: 'bg-surface-raised text-ink-muted', budget_exceeded: 'bg-warning-soft text-warning-ink',
            interrupted: 'bg-warning-soft text-warning-ink',
        };
    return (
        <span className={cn('inline-flex items-center rounded px-2 py-1 text-2xs font-semibold', TONES[value] ?? 'bg-surface-raised text-ink-muted')}>
            {map[value] ?? value}
        </span>
    );
}

// Confronto prima/dopo affiancato: righe rimosse a sinistra, aggiunte a destra,
// le altre allineate. Niente librerie di diff.
function PromptDiff({ baseline, candidate, C }: { baseline: string; candidate: string; C: PromptLabCopy }) {
    const lines = useMemo(() => diffLines(baseline, candidate), [baseline, candidate]);
    const lineCls = 'min-h-[1.4em]';
    return (
        <div>
            <div className="text-2xs font-semibold text-ink-muted">{C.promptDiffTitle}</div>
            <div className="mt-1 grid grid-cols-1 gap-2 lg:grid-cols-2">
                <div className="overflow-hidden rounded-control border border-line">
                    <div className="border-b border-line bg-surface-sunken px-2 py-1 text-2xs font-semibold text-ink-muted">{C.roles.baseline}</div>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-2 text-xs leading-relaxed text-ink-body">
                        {lines.map((l, i) => (l.type === 'add'
                            ? <div key={i} className={lineCls}>{' '}</div>
                            : <div key={i} className={cn(lineCls, l.type === 'del' && 'bg-danger-soft text-danger-ink')}>{l.text || ' '}</div>))}
                    </pre>
                </div>
                <div className="overflow-hidden rounded-control border border-line">
                    <div className="border-b border-line bg-surface-sunken px-2 py-1 text-2xs font-semibold text-ink-muted">{C.roles.candidate}</div>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-2 text-xs leading-relaxed text-ink-body">
                        {lines.map((l, i) => (l.type === 'del'
                            ? <div key={i} className={lineCls}>{' '}</div>
                            : <div key={i} className={cn(lineCls, l.type === 'add' && 'bg-success-soft text-success-ink')}>{l.text || ' '}</div>))}
                    </pre>
                </div>
            </div>
        </div>
    );
}

export function PromptExperimentsPanel() {
    const { lang } = useI18n();
    const C = useMemo(() => promptLabCopy(lang), [lang]);
    const contextCopy = promptLabContextCopy[lang];

    const [options, setOptions] = useState<LabOptions | null>(null);
    const [optionsError, setOptionsError] = useState<string | null>(null);
    const [experiments, setExperiments] = useState<Experiment[] | null>(null);
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<Experiment | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const [busy, setBusy] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const [casesDraft, setCasesDraft] = useState<LabCase[] | null>(null);
    const [casesDirty, setCasesDirty] = useState(false);
    const [casesReviewed, setCasesReviewed] = useState(false);
    const [savedAt, setSavedAt] = useState<number | null>(null);

    const [resultFilter, setResultFilter] = useState('all');
    const [resultRunId, setResultRunId] = useState('');
    const [decisionCandidate, setDecisionCandidate] = useState('');
    const [decisionNote, setDecisionNote] = useState('');
    const [restoreNote, setRestoreNote] = useState('');
    const [confirmAccept, setConfirmAccept] = useState(false);
    const [confirmReject, setConfirmReject] = useState(false);
    const [confirmRestore, setConfirmRestore] = useState(false);
    const [confirmRepeat, setConfirmRepeat] = useState(false);

    const [form, setForm] = useState({
        title: '', purpose: 'verification' as 'verification' | 'improvement', target_key: '',
        languages: ['it'], goals: [] as GoalDraft[], designer: '', proposer: '', judge: '',
        tested: [] as number[], max_calls: '240', max_minutes: '60',
    });
    const [formError, setFormError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const goalKey = useRef(2);

    const detailAbort = useRef<AbortController | null>(null);
    const listAbort = useRef<AbortController | null>(null);
    const optionsAbort = useRef<AbortController | null>(null);
    const detailInflight = useRef(false);
    const hasDetail = useRef(false);
    const casesDirtyRef = useRef(false);

    const loadOptions = useCallback(async () => {
        optionsAbort.current?.abort();
        const controller = new AbortController();
        optionsAbort.current = controller;
        try {
            const res = await apiFetch(`${BASE}/options`, { signal: controller.signal });
            if (res.status === 401 || res.status === 403) { window.location.href = '/'; return; }
            if (!res.ok) throw await parseError(res);
            const data = await res.json() as LabOptions;
            if (controller.signal.aborted) return;
            setOptions(data);
            setOptionsError(null);
            setForm((f) => ((f.designer || data.presets.length === 0) ? f : {
                ...f,
                designer: String(data.presets[0].id),
                judge: String(data.presets[0].id),
                target_key: f.target_key || (data.targets[0]?.id ?? ''),
                goals: f.goals.length > 0 ? f.goals : [{ key: 1, text: '', criterion: '' }],
            }));
        } catch (e) {
            if (!(e instanceof DOMException && e.name === 'AbortError')) setOptionsError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    const loadList = useCallback(async () => {
        listAbort.current?.abort();
        const controller = new AbortController();
        listAbort.current = controller;
        setListLoading(true);
        try {
            const res = await apiFetch(BASE, { signal: controller.signal });
            if (res.status === 401 || res.status === 403) { window.location.href = '/'; return; }
            if (!res.ok) throw await parseError(res);
            const data = await res.json() as Experiment[];
            if (controller.signal.aborted) return;
            setExperiments(data);
            setListError(null);
        } catch (e) {
            if (!(e instanceof DOMException && e.name === 'AbortError')) setListError(e instanceof Error ? e.message : String(e));
        } finally {
            if (!controller.signal.aborted) setListLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadOptions();
        void loadList();
        return () => {
            optionsAbort.current?.abort();
            listAbort.current?.abort();
            detailAbort.current?.abort();
        };
    }, [loadOptions, loadList]);

    const fetchDetail = useCallback(async (silent: boolean) => {
        if (!selectedId || detailInflight.current) return;
        detailInflight.current = true;
        detailAbort.current?.abort();
        const controller = new AbortController();
        detailAbort.current = controller;
        try {
            const res = await apiFetch(`${BASE}/${selectedId}${resultRunId ? `?result_run_id=${encodeURIComponent(resultRunId)}` : ''}`, { signal: controller.signal });
            if (res.status === 401 || res.status === 403) { window.location.href = '/'; return; }
            if (!res.ok) throw await parseError(res);
            const data = await res.json() as Experiment;
            if (controller.signal.aborted) return;
            hasDetail.current = true;
            setDetail(data);
            setDetailError(null);
            // Il polling non calpesta le modifiche non salvate ai casi.
            setCasesDraft((prev) => {
                if (prev === null || !casesDirtyRef.current) {
                    return data.cases.map((c) => ({ ...c, history: c.history.map((h) => ({ ...h })) }));
                }
                return prev;
            });
        } catch (e) {
            if (!(e instanceof DOMException && e.name === 'AbortError') && !silent) {
                setDetailError(e instanceof Error ? e.message : String(e));
            }
        } finally {
            detailInflight.current = false;
        }
    }, [selectedId, resultRunId]);

    // Ricaricamento iniziale e polling: ogni tick (3s) mentre c'è lavoro attivo.
    useEffect(() => { void fetchDetail(hasDetail.current); }, [fetchDetail, tick]);

    useEffect(() => {
        if (!selectedId || !detail) return;
        const isActive = detail.runs.some((r) => r.state === 'queued' || r.state === 'running') || detail.state === 'running';
        if (!isActive) return;
        const t = window.setTimeout(() => setTick((v) => v + 1), 3000);
        return () => window.clearTimeout(t);
    }, [selectedId, detail, tick]);

    const openDetail = (id: string) => {
        detailAbort.current?.abort();
        detailInflight.current = false;
        setSelectedId(id);
        hasDetail.current = false;
        setDetail(null);
        setDetailError(null);
        setCasesDraft(null);
        casesDirtyRef.current = false;
        setCasesDirty(false);
        setCasesReviewed(false);
        setSavedAt(null);
        setActionError(null);
        setResultFilter('all');
        setResultRunId('');
        setDecisionCandidate('');
        setDecisionNote('');
        setRestoreNote('');
        setConfirmAccept(false);
        setConfirmReject(false);
        setConfirmRestore(false);
        setConfirmRepeat(false);
        setTick((v) => v + 1);
    };

    const back = () => {
        detailAbort.current?.abort();
        detailInflight.current = false;
        setSelectedId(null);
        setDetail(null);
        setCasesDraft(null);
        void loadList();
    };

    const create = async () => {
        const goals = form.goals
            .filter((g) => g.text.trim() && g.criterion.trim())
            .map((g) => ({ text: g.text.trim(), criterion: g.criterion.trim() }));
        if (!form.title.trim() || !form.target_key || !form.designer || !form.judge
            || goals.length === 0 || goals.length !== form.goals.length || form.tested.length === 0 || form.languages.length === 0
            || (form.purpose === 'improvement' && !form.proposer)) {
            setFormError(C.createValidation);
            return;
        }
        setCreating(true);
        setFormError(null);
        try {
            const body = {
                title: form.title.trim(),
                purpose: form.purpose,
                target_key: form.target_key,
                goals,
                languages: form.languages,
                designer_preset_id: Number(form.designer),
                proposer_preset_id: form.purpose === 'improvement' && form.proposer ? Number(form.proposer) : null,
                judge_preset_id: Number(form.judge),
                tested_preset_ids: form.tested,
                max_calls: Math.max(1, Math.floor(Number(form.max_calls) || 240)),
                max_minutes: Math.max(1, Math.floor(Number(form.max_minutes) || 60)),
            };
            const res = await apiFetch(BASE, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
            if (res.status === 401 || res.status === 403) { window.location.assign('/'); return; }
            if (!res.ok) throw await parseError(res);
            const exp = await res.json() as Experiment;
            setShowForm(false);
            await loadList();
            openDetail(exp.id);
        } catch (e) {
            setFormError(e instanceof Error ? e.message : String(e));
        } finally {
            setCreating(false);
        }
    };

    // Mutazioni POST: una sola alla volta, il bottone resta disabilitato mentre
    // la richiesta è aperta, l'errore {detail} finisce nel callout di stato.
    const postAction = async (path: string, body: unknown, busyKey: string): Promise<boolean> => {
        setBusy(busyKey);
        setActionError(null);
        try {
            const res = await apiFetch(`${BASE}${path}`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
            if (res.status === 401 || res.status === 403) { window.location.href = '/'; return false; }
            if (!res.ok) throw await parseError(res);
            setTick((v) => v + 1);
            return true;
        } catch (e) {
            setActionError(e instanceof Error ? e.message : String(e));
            return false;
        } finally {
            setBusy(null);
        }
    };

    const prepare = () => { if (detail) void postAction(`/${detail.id}/prepare`, {}, 'prepare'); };
    const startEval = () => { if (detail) void postAction(`/${detail.id}/run`, { cases_reviewed: true }, 'run'); };
    const cancelWork = () => { if (detail) void postAction(`/${detail.id}/cancel`, {}, 'cancel'); };
    const decide = (action: 'accept' | 'reject') => {
        if (!detail) return;
        void postAction(`/${detail.id}/decision`, {
            action,
            candidate_id: action === 'accept' ? decisionCandidate : (decisionCandidate || null),
            expected_hash: detail.manifest_hash ?? '',
            note: decisionNote.trim(),
        }, 'decision');
    };
    const restore = () => {
        if (!detail) return;
        void postAction(`/${detail.id}/restore`, { note: restoreNote.trim(), expected_hash: detail.manifest_hash ?? '' }, 'restore');
    };

    const saveCases = async () => {
        if (!detail || !casesDraft) return;
        setBusy('saveCases');
        setActionError(null);
        try {
            const res = await apiFetch(`${BASE}/${detail.id}/cases`, {
                method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ cases: casesDraft }),
            });
            if (res.status === 401 || res.status === 403) { window.location.href = '/'; return; }
            if (!res.ok) throw await parseError(res);
            casesDirtyRef.current = false;
            setCasesDirty(false);
            setSavedAt(Date.now());
            setTick((v) => v + 1);
        } catch (e) {
            setActionError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(null);
        }
    };

    const updateCase = (idx: number, patch: Partial<LabCase>) => {
        setCasesReviewed(false);
        setCasesDraft((prev) => (prev ? prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)) : prev));
        casesDirtyRef.current = true;
        setCasesDirty(true);
    };

    const presetById = useCallback((id: number): Preset | undefined => {
        const snap = detail?.snapshot?.presets;
        if (snap) {
            const all = [snap.designer, snap.proposer, snap.judge, ...(snap.tested ?? [])]
                .filter((p): p is Preset => Boolean(p));
            return all.find((p) => p.id === id);
        }
        return options?.presets.find((p) => p.id === id);
    }, [options, detail]);

    const presetLabel = (id: number): string => {
        const p = presetById(id);
        return p ? `${p.name} · ${p.provider}/${p.model}` : String(id);
    };

    const variantLabel = (exp: Experiment, variantId: string): string => {
        if (variantId === 'baseline') return C.roles.baseline;
        const c = exp.candidates.find((x) => x.id === variantId);
        return c ? `${C.roles.candidate} · ${c.reason}` : variantId;
    };

    const startDisabledReason = (exp: Experiment): string | null => {
        if (exp.cases.length === 0) return C.needPrepare;
        if (!casesReviewed) return C.needReview;
        if (casesDirty) return C.unsavedCases;
        if (!(exp.payload.goals?.length)) return C.needGoals;
        if (!(exp.payload.tested_preset_ids?.length)) return C.needTested;
        return null;
    };

    function renderCreateForm() {
        if (!options) return null;
        const setField = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
        const setGoal = (key: number, patch: Partial<GoalDraft>) => setForm((f) => ({
            ...f, goals: f.goals.map((g) => (g.key === key ? { ...g, ...patch } : g)),
        }));
        const toggleLang = (code: string) => setForm((f) => ({
            ...f, languages: f.languages.includes(code) ? f.languages.filter((l) => l !== code) : [...f.languages, code],
        }));
        const toggleTested = (id: number) => setForm((f) => ({
            ...f, tested: f.tested.includes(id) ? f.tested.filter((t) => t !== id) : [...f.tested, id],
        }));
        return (
            <div className="space-y-4 rounded-lg border border-brand-line bg-brand-soft/40 p-4">
                <h3 className="text-sm font-semibold text-ink">{C.formTitle}</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <L label={C.experimentTitle} className="lg:col-span-2">
                        <input className={inputCls} value={form.title} placeholder={C.titlePlaceholder} onChange={(e) => setField({ title: e.target.value })} />
                    </L>
                    <L label={C.purpose}>
                        <select className={inputCls} value={form.purpose} onChange={(e) => setField({ purpose: e.target.value as 'verification' | 'improvement' })}>
                            <option value="verification">{C.purposes.verification}</option>
                            <option value="improvement">{C.purposes.improvement}</option>
                        </select>
                    </L>
                    <L label={C.target}>
                        <select className={inputCls} value={form.target_key} onChange={(e) => setField({ target_key: e.target.value })}>
                            {options.targets.map((t) => <option key={t.id} value={t.id}>{`QSA · ${targetLabel(t, lang)} (${t.id})`}</option>)}
                        </select>
                    </L>
                    <L label={C.designer}>
                        <select className={inputCls} value={form.designer} onChange={(e) => setField({ designer: e.target.value })}>
                            {options.presets.map((p) => <option key={p.id} value={String(p.id)}>{p.name} ({p.model})</option>)}
                        </select>
                    </L>
                    <L label={C.proposer}>
                        <select className={inputCls} disabled={form.purpose === 'verification'} value={form.proposer} onChange={(e) => setField({ proposer: e.target.value })}>
                            <option value="">{C.proposerNone}</option>
                            {options.presets.map((p) => <option key={p.id} value={String(p.id)}>{p.name} ({p.model})</option>)}
                        </select>
                    </L>
                    <L label={C.judge}>
                        <select className={inputCls} value={form.judge} onChange={(e) => setField({ judge: e.target.value })}>
                            {options.presets.map((p) => <option key={p.id} value={String(p.id)}>{p.name} ({p.model})</option>)}
                        </select>
                    </L>
                    <L label={C.maxCalls}>
                        <input className={inputCls} type="number" min={1} max={240} value={form.max_calls} onChange={(e) => setField({ max_calls: e.target.value })} />
                    </L>
                    <L label={C.maxMinutes}>
                        <input className={inputCls} type="number" min={1} max={60} value={form.max_minutes} onChange={(e) => setField({ max_minutes: e.target.value })} />
                    </L>
                </div>
                <PromptExperimentContext targetKey={form.target_key} steps={options.targets} frozen={false} lang={lang} />
                <fieldset>
                    <legend className="text-xs font-semibold text-ink-muted">{C.languages}</legend>
                    <div className="mt-1 flex flex-wrap gap-2">
                        {options.languages.map((code) => (
                            <label key={code} className="flex items-center gap-2 rounded-control border border-line bg-surface px-2 py-1 text-xs text-ink-body">
                                <input type="checkbox" checked={form.languages.includes(code)} onChange={() => toggleLang(code)} />
                                {code}
                            </label>
                        ))}
                    </div>
                </fieldset>
                <fieldset>
                    <legend className="text-xs font-semibold text-ink-muted">{C.tested}</legend>
                    <p className="text-2xs text-ink-muted">{C.testedHint}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                        {options.presets.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 rounded-control border border-line bg-surface px-2 py-1 text-xs text-ink-body">
                                <input type="checkbox" checked={form.tested.includes(p.id)} onChange={() => toggleTested(p.id)} />
                                {p.name} <span className="font-mono text-2xs text-ink-muted">{p.model}</span>
                            </label>
                        ))}
                    </div>
                </fieldset>
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-ink-muted">{C.goals}</span>
                        <Button variant="secondary" type="button" disabled={form.goals.length >= 6} onClick={() => setForm((f) => ({ ...f, goals: [...f.goals, { key: goalKey.current++, text: '', criterion: '' }] }))} className="text-xs">
                            <Plus className="h-4 w-4" />{C.addGoal}
                        </Button>
                    </div>
                    <p className="text-2xs text-ink-muted">{C.goalsHint}</p>
                    {form.goals.map((g) => (
                        <div key={g.key} className="grid gap-2 sm:grid-cols-2">
                            <input className={inputCls} value={g.text} placeholder={C.goalTextPlaceholder} aria-label={C.goalText} onChange={(e) => setGoal(g.key, { text: e.target.value })} />
                            <div className="flex gap-1">
                                <input className={inputCls} value={g.criterion} placeholder={C.goalCriterionPlaceholder} aria-label={C.goalCriterion} onChange={(e) => setGoal(g.key, { criterion: e.target.value })} />
                                <Button variant="secondary" type="button" disabled={form.goals.length <= 1} aria-label={C.removeGoal} onClick={() => setForm((f) => ({ ...f, goals: f.goals.filter((x) => x.key !== g.key) }))} className="w-control px-0 shrink-0">
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-4">
                        <Button size="sm" disabled={creating || !options.enabled} onClick={() => void create()}>{creating ? C.creating : C.create}</Button>
                        {form.purpose === 'verification' && <span className="text-2xs text-ink-muted">{C.purposeVerificationHint}</span>}
                        {form.purpose === 'improvement' && <span className="text-2xs text-ink-muted">{C.purposeImprovementHint}</span>}
                    </div>
                    {formError && <Callout variant="danger" title={C.error}>{formError}</Callout>}
                </div>
            </div>
        );
    }

    function renderList() {
        return (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-line text-xs text-ink-muted">
                        <tr>
                            <th className="px-4 py-2 font-semibold">{C.experimentTitle}</th>
                            <th className="px-4 py-2 font-semibold">{C.purpose}</th>
                            <th className="px-4 py-2 font-semibold">{C.target}</th>
                            <th className="px-4 py-2 font-semibold">{C.runState}</th>
                            <th className="px-4 py-2 font-semibold">{C.created}</th>
                            <th className="px-4 py-2 text-right font-semibold">{C.open}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {listLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">{C.loading}</td></tr>}
                        {listError && <tr><td colSpan={6} className="px-4 py-4"><Callout variant="danger" title={C.error}>{listError}</Callout></td></tr>}
                        {!listLoading && !listError && experiments !== null && experiments.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">{C.listEmpty}</td></tr>
                        )}
                        {(experiments ?? []).map((exp) => (
                            <tr key={exp.id}>
                                <td className="px-4 py-2 font-semibold text-ink">{exp.title}</td>
                                <td className="px-4 py-2 text-ink-muted">{C.purposes[exp.purpose] ?? exp.purpose}</td>
                                <td className="px-4 py-2 font-mono text-xs text-ink-muted">{experimentTargetLabel(exp)}</td>
                                <td className="px-4 py-2"><StateBadge value={exp.state} map={C.states} kind="state" /></td>
                                <td className="px-4 py-2 text-xs text-ink-muted">{fmtTime(exp.created_at)}</td>
                                <td className="px-4 py-2 text-right">
                                    {/* eslint-disable-next-line react-hooks/refs -- false positive: openDetail touches refs only when clicked, never during render */}
                                    <Button size="sm" variant="secondary" onClick={() => openDetail(exp.id)}>{C.open}</Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    function renderCases(exp: Experiment) {
        if (exp.cases.length === 0) {
            return (
                <div className="space-y-2 rounded-lg border border-line bg-surface p-4">
                    <h4 className="text-sm font-semibold text-ink">{C.casesTitle}</h4>
                    <Callout variant="info">{C.needPrepare}</Callout>
                </div>
            );
        }
        const draft = casesDraft ?? exp.cases;
        const frozen = exp.runs.some((r) => r.kind === 'evaluate' || r.state === 'queued' || r.state === 'running') || Boolean(exp.decision);
        return (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h4 className="text-sm font-semibold text-ink">{C.casesTitle} ({draft.length})</h4>
                        <p className="text-2xs text-ink-muted">{C.casesHint}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {savedAt !== null && !casesDirty && <span className="text-2xs font-semibold text-success">{C.savedCases}</span>}
                        <Button size="sm" variant="secondary" disabled={frozen || !casesDirty || busy !== null || !options?.enabled} onClick={() => void saveCases()}>
                            <Save className="h-4 w-4" />{C.saveCases}
                        </Button>
                    </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-ink-body">
                    <input type="checkbox" checked={casesReviewed} onChange={(e) => setCasesReviewed(e.target.checked)} />
                    {C.reviewedLabel}
                </label>
                <div className="space-y-4">
                    {draft.map((c, idx) => (
                        <div key={c.id} className="space-y-2 rounded-control border border-line p-4">
                            <div className="flex flex-wrap items-center gap-2 text-2xs text-ink-muted">
                                <span className="font-mono">{c.id}</span>
                                <span>{C.caseGroup}: <span className="font-mono">{c.group_id}</span></span>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <L label={C.caseSplit}>
                                    <select className={inputCls} disabled={frozen} value={c.split} onChange={(e) => updateCase(idx, { split: e.target.value as LabCase['split'] })}>
                                        <option value="development">{C.splits.development}</option>
                                        <option value="validation">{C.splits.validation}</option>
                                        <option value="final">{C.splits.final}</option>
                                    </select>
                                </L>
                                <L label={C.caseLanguage}>
                                    <select className={inputCls} disabled={frozen} value={c.language} onChange={(e) => updateCase(idx, { language: e.target.value })}>
                                        {(options?.languages ?? [c.language]).map((code) => <option key={code} value={code}>{code}</option>)}
                                    </select>
                                </L>
                            </div>
                            <L label={C.caseMessage}>
                                <textarea className={textareaCls} readOnly={frozen} rows={2} value={c.message} onChange={(e) => updateCase(idx, { message: e.target.value })} />
                            </L>
                            <L label={C.caseExpected}>
                                <textarea className={textareaCls} readOnly={frozen} rows={2} value={c.expected} onChange={(e) => updateCase(idx, { expected: e.target.value })} />
                            </L>
                            {c.history.length > 0 && (
                                <details>
                                    <summary className="cursor-pointer text-xs font-semibold text-ink-muted">{C.caseHistory} ({c.history.length})</summary>
                                    <div className="mt-2 space-y-2">
                                        {c.history.map((h, i) => (
                                            <div key={i} className="rounded-control bg-surface-sunken p-2">
                                                <span className={cn('rounded px-2 py-1 text-2xs font-semibold', h.role === 'user' ? 'bg-info-soft text-info-ink' : 'bg-brand-soft text-link')}>
                                                    {h.role === 'user' ? C.historyUser : C.historyAssistant}
                                                </span>
                                                <p className="mt-1 whitespace-pre-wrap break-words text-xs text-ink-body">{h.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    ))}
                </div>
                <Button size="sm" variant="secondary" disabled={frozen || !casesDirty || busy !== null || !options?.enabled} onClick={() => void saveCases()}>
                    <Save className="h-4 w-4" />{C.saveCases}
                </Button>
            </div>
        );
    }

    function experimentTargetLabel(exp: Experiment) {
        const step = exp.snapshot?.render_data?.steps.find((s) => s.id === exp.target_key);
        // Historical labels come from the snapshot, never today's options.
        return `QSA · ${step ? targetLabel(step, lang) : exp.target_key}`;
    }

    function renderProposalReport(exp: Experiment, candidate: Candidate) {
        const { pairs, incomplete } = compareCandidate(exp.summary?.metrics ?? [], candidate.id);
        const rows = (direction: string) => pairs.filter((p) => p.direction === direction).map(({ before, after }) => (
            <li key={`${after.preset_id}-${after.language}-${after.split}`}>
                {presetLabel(after.preset_id)} · {after.language ?? '—'} · {C.splits[after.split]}: {before.passed}/{before.total} → {after.passed}/{after.total}
            </li>
        ));
        const pros = rows('pro');
        return <section aria-label={contextCopy.report} className="space-y-4 rounded-control bg-surface-sunken p-4 text-sm text-ink-body">
            <h5 className="font-semibold">{contextCopy.report}</h5>
            <p><span className="font-semibold">{contextCopy.expected}:</span> {candidate.expected}</p>
            <p className="text-xs text-ink-muted">{contextCopy.evidence}</p>
            <div className="grid gap-4 md:grid-cols-2">
                <div><h6 className="font-semibold">{contextCopy.pros}</h6>
                    {pros.length ? <ul className="list-disc space-y-1 pl-4">{pros}</ul> : <p>{contextCopy.noPros}</p>}
                </div>
                <div><h6 className="font-semibold">{contextCopy.cons}</h6>
                    <ul className="list-disc space-y-1 pl-4">
                        {rows('con')}
                        {incomplete && <li>{contextCopy.noData}</li>}
                        <li>{contextCopy.synthetic}</li>
                        <li>{contextCopy.shared}</li>
                        {(exp.approval_blockers ?? []).map((b) => <li key={b}>{b}</li>)}
                    </ul>
                </div>
            </div>
            {rows('neutral').length > 0 && <details><summary className="cursor-pointer">{contextCopy.neutral}</summary><ul className="list-disc pl-4">{rows('neutral')}</ul></details>}
            <p><span className="font-semibold">{contextCopy.verdict}:</span> {exp.summary ? C.eligibility[exp.summary.eligibility] : contextCopy.noVerdict}</p>
            {exp.summary?.reason && <p>{exp.summary.reason}</p>}
        </section>;
    }

    function renderCandidates(exp: Experiment) {
        return (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
                <div>
                    <h4 className="text-sm font-semibold text-ink">{C.candidatesTitle} ({exp.candidates.length})</h4>
                    <p className="text-2xs text-ink-muted">{C.candidatesHint}</p>
                </div>
                {exp.candidates.map((c) => (
                    <div key={c.id} className="space-y-2 rounded-control border border-line p-4">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                            <span className="font-mono text-link">{c.id}</span>
                            <span><span className="font-semibold">{C.candidateReason}:</span> {c.reason}</span>
                        </div>
                        {renderProposalReport(exp, c)}
                        <PromptDiff baseline={exp.snapshot?.baseline ?? ''} candidate={c.text} C={C} />
                    </div>
                ))}
            </div>
        );
    }

    function renderSummary(exp: Experiment) {
        const s = exp.summary!;
        const selected = exp.candidates.find((c) => c.id === s.selected_candidate_id);
        return (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
                <h4 className="text-sm font-semibold text-ink">{C.summaryTitle}</h4>
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <StateBadge value={s.eligibility} map={C.eligibility} kind="state" />
                    <span>{C.selectedCandidate}: {selected ? `${selected.id} — ${selected.reason}` : '—'}</span>
                    <span>{C.completedCalls}: <span className="font-mono">{s.completed_calls}</span></span>
                </div>
                {s.reason && <p className="text-sm text-ink-body"><span className="font-semibold">{C.summaryReason}:</span> {s.reason}</p>}
                {s.goals && s.goals.length > 0 && (
                    <div>
                        <div className="text-xs font-semibold text-ink-muted">{C.summaryGoals}</div>
                        {(s.goals as { text: string; criterion: string; metrics: { preset_id: number; variant_id: string; split: string; ok: number; total: number }[] }[]).map((goal, index) => (
                            <div key={index} className="mt-2 rounded-control border border-line p-2 text-xs text-ink-body">
                                <p className="font-semibold">{goal.text}</p><p>{goal.criterion}</p>
                                {goal.metrics.map((metric, i) => <p key={i}>{presetLabel(metric.preset_id)} · {variantLabel(exp, metric.variant_id)} · {C.splits[metric.split]}: {metric.ok}/{metric.total}</p>)}
                            </div>
                        ))}
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-line text-2xs text-ink-muted">
                            <tr>
                                <th className="px-2 py-2 font-semibold">{C.metricPreset}</th>
                                <th className="px-2 py-2 font-semibold">{C.metricVariant}</th>
                                <th className="px-2 py-2 font-semibold">{C.metricSplit}</th>
                                <th className="px-2 py-2 text-right font-semibold">{C.metricPassed}</th>
                                <th className="px-2 py-2 text-right font-semibold">{C.metricTotal}</th>
                                <th className="px-2 py-2 text-right font-semibold">{C.metricErrors}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {s.metrics.map((m, i) => (
                                <tr key={i}>
                                    <td className="px-2 py-2 text-xs text-ink-body">{presetLabel(m.preset_id)}</td>
                                    <td className="px-2 py-2 font-mono text-xs text-ink-muted">{variantLabel(exp, m.variant_id)}</td>
                                    <td className="px-2 py-2 text-xs text-ink-muted">{C.splits[m.split] ?? m.split} {m.language}</td>
                                    <td className="px-2 py-2 text-right font-mono text-xs text-success">{m.passed}</td>
                                    <td className="px-2 py-2 text-right font-mono text-xs text-ink-body">{m.total}</td>
                                    <td className="px-2 py-2 text-right font-mono text-xs text-danger-ink">{m.errors}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    function renderResults(exp: Experiment) {
        const presetIds = Array.from(new Set(exp.results.map((r) => r.preset_id))).sort((a, b) => a - b);
        const byCase = new Map<string, Result[]>();
        for (const r of exp.results) {
            if (resultFilter !== 'all' && String(r.preset_id) !== resultFilter) continue;
            const list = byCase.get(r.case_id) ?? [];
            list.push(r);
            byCase.set(r.case_id, list);
        }
        const sortResults = (rs: Result[]): Result[] => [...rs].sort((a, b) => {
            const av = a.variant_id === 'baseline' ? 0 : 1;
            const bv = b.variant_id === 'baseline' ? 0 : 1;
            if (av !== bv) return av - bv;
            if (a.preset_id !== b.preset_id) return a.preset_id - b.preset_id;
            return a.repetition - b.repetition;
        });
        return (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-ink">{C.resultsTitle} ({exp.results.length})</h4>
                    <L label={C.runsTitle}><select className={inputCls} value={resultRunId} onChange={(e) => setResultRunId(e.target.value)}>
                        <option value="">{C.refresh}</option>
                        {exp.runs.filter((r) => r.kind === 'evaluate').map((r) => <option key={r.id} value={r.id}>{fmtTime(r.started_at ?? r.created_at)} · {C.runStates[r.state]}</option>)}
                    </select></L>
                    {presetIds.length > 1 && (
                        <label className="flex items-center gap-2 text-xs text-ink-muted">
                            {C.resultsFilter}
                            <select className={cn(inputCls, 'w-auto')} value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
                                <option value="all">{C.resultsAll}</option>
                                {presetIds.map((pid) => <option key={pid} value={String(pid)}>{presetLabel(pid)}</option>)}
                            </select>
                        </label>
                    )}
                </div>
                {exp.results.length === 0 ? (
                    <p className="text-sm text-ink-muted">{C.resultsNone}</p>
                ) : (
                    <div className="space-y-4">
                        {[...byCase.entries()].map(([caseId, rs]) => {
                            const c = exp.cases.find((x) => x.id === caseId);
                            return (
                                <div key={caseId} className="space-y-2 rounded-control border border-line p-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-xs text-ink-muted">{caseId}</span>
                                        <span className="truncate text-xs font-semibold text-ink-body">{c?.message}</span>
                                    </div>
                                    {c?.expected && <p className="text-xs text-ink-muted"><span className="font-semibold">{C.expectedLabel}:</span> {c.expected}</p>}
                                    <div className="space-y-2">
                                        {sortResults(rs).map((r) => (
                                            <div key={r.id} className="space-y-1 rounded-control bg-surface-sunken p-2">
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-muted">
                                                    <span className={cn('rounded px-2 py-1 font-semibold', r.variant_id === 'baseline' ? 'bg-line text-ink-body' : 'bg-brand-soft text-link')}>{variantLabel(exp, r.variant_id)}</span>
                                                    <span>{presetLabel(r.preset_id)}</span>
                                                    {r.repetition > 0 && <span>#{r.repetition}</span>}
                                                    {r.duration_s != null && <span>{new Intl.NumberFormat(lang, { style: 'unit', unit: 'second', unitDisplay: 'narrow', maximumFractionDigits: 1 }).format(r.duration_s)}</span>}
                                                    {r.error && <span className="font-semibold text-danger">{C.error}: {r.error}</span>}
                                                </div>
                                                {(r.response || r.judgment) && (
                                                    <>
                                                        {r.response && <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-ink">{r.response}</pre>}
                                                        {r.judgment && <pre className="whitespace-pre-wrap break-words rounded-control bg-surface p-2 text-xs text-ink-body">{JSON.stringify(r.judgment, null, 2)}</pre>}
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    function renderRuns(exp: Experiment) {
        return (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
                <h4 className="text-sm font-semibold text-ink">{C.runsTitle} ({exp.runs.length})</h4>
                {exp.runs.length === 0 ? (
                    <p className="text-sm text-ink-muted">{C.runsEmpty}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-line text-2xs text-ink-muted">
                                <tr>
                                    <th className="px-2 py-2 font-semibold">{C.runKind}</th>
                                    <th className="px-2 py-2 font-semibold">{C.runState}</th>
                                    <th className="px-2 py-2 font-semibold">{C.runCalls}</th>
                                    <th className="px-2 py-2 font-semibold">{C.runStarted}</th>
                                    <th className="px-2 py-2 font-semibold">{C.runFinished}</th>
                                    <th className="px-2 py-2 font-semibold">{C.error}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                                {exp.runs.map((run) => {
                                    const pct = exp.payload.max_calls > 0 ? Math.min(100, Math.round((run.calls / exp.payload.max_calls) * 100)) : 0;
                                    return (
                                        <tr key={run.id}>
                                            <td className="px-2 py-2 text-xs text-ink-muted">{C.runKinds[run.kind] ?? run.kind}</td>
                                            <td className="px-2 py-2">
                                                <span className="flex flex-wrap items-center gap-2">
                                                    <StateBadge value={run.state} map={C.runStates} kind="run" />
                                                    {run.cancel_requested && <span className="rounded bg-warning-soft px-2 py-1 text-2xs font-semibold text-warning-ink">{C.cancelRequested}</span>}
                                                </span>
                                            </td>
                                            <td className="px-2 py-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs text-ink-body">{run.calls}/{exp.payload.max_calls}</span>
                                                    <div className="h-1.5 w-16 overflow-hidden rounded bg-surface-raised">
                                                        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-2 py-2 text-xs text-ink-muted">{fmtTime(run.started_at)}</td>
                                            <td className="px-2 py-2 text-xs text-ink-muted">{fmtTime(run.finished_at)}</td>
                                            <td className="px-2 py-2 text-xs text-danger">{run.error ?? '—'}{Boolean(run.summary) && <details><summary className="cursor-pointer text-ink-muted">{C.summaryTitle}</summary><pre className="max-h-60 max-w-sm overflow-auto whitespace-pre-wrap break-words text-xs text-ink-body">{JSON.stringify(run.summary, null, 2)}</pre></details>}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    function renderDecision(exp: Experiment, acceptDisabled: boolean, acceptHint: string) {
        return (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
                <h4 className="text-sm font-semibold text-ink">{C.decisionTitle}</h4>
                {exp.decision ? (
                    <>
                        <Callout variant={exp.decision.action === 'accept' ? 'success' : 'info'}>
                            <p>{C.decisionRecorded}: <span className="font-semibold">{exp.decision.action === 'accept' ? C.accept : exp.decision.action === 'restore' ? C.restore : C.reject}</span></p>
                            {exp.decision.revision_id && <p className="font-mono text-xs">{exp.decision.revision_id}</p>}
                        </Callout>
                        {exp.decision.action === 'accept' && exp.state === 'activated' && (
                            <div className="flex flex-wrap items-center gap-2">
                                <input className={cn(inputCls, 'max-w-xs')} value={restoreNote} onChange={(e) => setRestoreNote(e.target.value)} placeholder={C.decisionNotePlaceholder} aria-label={C.decisionNote} />
                                {confirmRestore
                                    ? <ConfirmInline question={C.restoreConfirm} busy={busy === 'restore'} onConfirm={restore} onCancel={() => setConfirmRestore(false)} />
                                    : <Button size="sm" variant="danger" disabled={busy !== null || !restoreNote.trim()} onClick={() => setConfirmRestore(true)}>{C.restore}</Button>}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <L label={C.decisionNote}>
                            <textarea className={textareaCls} rows={2} value={decisionNote} placeholder={C.decisionNotePlaceholder} onChange={(e) => setDecisionNote(e.target.value)} />
                        </L>
                        <L label={C.decisionCandidate} className="sm:max-w-xs">
                            <select className={inputCls} value={decisionCandidate} onChange={(e) => setDecisionCandidate(e.target.value)}>
                                <option value="">—</option>
                                {exp.candidates.map((c) => <option key={c.id} value={c.id}>{c.id} — {c.reason}</option>)}
                            </select>
                        </L>
                        <div className="flex flex-wrap items-center gap-2">
                            {confirmAccept
                                ? <ConfirmInline question={C.acceptConfirm} busy={busy === 'decision'} onConfirm={() => decide('accept')} onCancel={() => setConfirmAccept(false)} />
                                : <Button size="sm" variant="success" disabled={acceptDisabled} onClick={() => setConfirmAccept(true)}><Check className="h-4 w-4" />{C.accept}</Button>}
                            {confirmReject
                                ? <ConfirmInline question={C.rejectConfirm} busy={busy === 'decision'} onConfirm={() => decide('reject')} onCancel={() => setConfirmReject(false)} />
                                : <Button size="sm" variant="danger" disabled={busy !== null || !decisionNote.trim() || exp.runs.some((r) => r.state === 'queued' || r.state === 'running') || !options?.enabled} onClick={() => setConfirmReject(true)}><X className="h-4 w-4" />{C.reject}</Button>}
                        </div>
                        {acceptDisabled && busy === null && <p className="text-xs text-ink-muted">{acceptHint}</p>}
                    </>
                )}
            </div>
        );
    }

    function renderDetail() {
        if (!detail) {
            return (
                <div className="rounded-lg border border-line bg-surface p-4">
                    {detailError ? <Callout variant="danger" title={C.error}>{detailError}</Callout> : <p className="text-sm text-ink-muted">{C.loading}</p>}
                </div>
            );
        }
        const exp = detail;
        const snap = exp.snapshot?.presets;
        const roles = [
            { label: C.roles.designer, preset: snap?.designer ?? presetById(exp.payload.designer_preset_id) },
            { label: C.roles.proposer, preset: exp.payload.proposer_preset_id != null ? (snap?.proposer ?? presetById(exp.payload.proposer_preset_id)) : null },
            { label: C.roles.judge, preset: snap?.judge ?? presetById(exp.payload.judge_preset_id) },
        ];
        const testedPresets = snap?.tested ?? exp.payload.tested_preset_ids.map((id) => presetById(id)).filter((p): p is Preset => Boolean(p));
        const isActive = exp.runs.some((r) => r.state === 'queued' || r.state === 'running') || exp.state === 'running';
        const startDisabled = startDisabledReason(exp);
        const blockers = exp.approval_blockers ?? [];
        const acceptDisabled = exp.purpose === 'verification' || blockers.length > 0 || !decisionCandidate || !exp.manifest_hash || !decisionNote.trim() || isActive || busy !== null || !options?.enabled;
        const acceptHint = exp.purpose === 'verification' ? C.verificationNoActivation
            : blockers.length > 0 ? C.blockersHint
                : !decisionCandidate ? C.noCandidate
                    : !exp.manifest_hash ? C.needHash : '';
        return (
            <div className="min-w-0 space-y-4">
                <div className="rounded-lg border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <BackButton variant="labelled" onClick={back} label={C.back} />
                            <h3 className="mt-2 text-lg font-semibold text-ink">{exp.title}</h3>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                                <StateBadge value={exp.state} map={C.states} kind="state" />
                                <span>{C.purposes[exp.purpose] ?? exp.purpose}</span>
                                <span className="text-xs">{experimentTargetLabel(exp)}</span>
                                <span className="text-xs">{C.created} {fmtTime(exp.created_at)}</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {exp.cases.length === 0 && (exp.state === 'draft' || exp.state === 'ready' || exp.state === 'failed') && !isActive && (
                                <Button size="sm" disabled={busy !== null || !options?.enabled} onClick={prepare}>{C.prepare}</Button>
                            )}
                            {!exp.runs.some((r) => r.kind === 'evaluate') && exp.cases.length > 0 && (exp.state === 'draft' || exp.state === 'ready' || exp.state === 'failed') && !isActive && (
                                <Button size="sm" disabled={startDisabled !== null || busy !== null || !options?.enabled} onClick={() => void startEval()}>
                                    <Play className="h-4 w-4" />{C.startEval}
                                </Button>
                            )}
                            {exp.purpose === 'verification' && !exp.decision && exp.runs.some((r) => r.kind === 'evaluate') && !isActive && (
                                confirmRepeat
                                    ? <ConfirmInline question={C.repeatConfirm} busy={busy === 'run'} onConfirm={() => void startEval()} onCancel={() => setConfirmRepeat(false)} />
                                    : <Button size="sm" variant="secondary" disabled={busy !== null || startDisabled !== null || !options?.enabled} onClick={() => setConfirmRepeat(true)}><RefreshCw className="h-4 w-4" />{C.repeat}</Button>
                            )}
                            {isActive && (
                                <Button size="sm" variant="danger" disabled={busy !== null || !options?.enabled} onClick={cancelWork}><Square className="h-4 w-4" />{C.cancel}</Button>
                            )}
                        </div>
                    </div>
                    {startDisabled !== null && !exp.runs.some((r) => r.kind === 'evaluate') && exp.cases.length > 0 && (exp.state === 'draft' || exp.state === 'ready' || exp.state === 'failed') && (
                        <p className="mt-2 text-xs text-ink-muted">{startDisabled}</p>
                    )}
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {roles.map((r) => (
                            <div key={r.label} className="rounded-control border border-line p-2">
                                <div className="text-2xs font-semibold text-ink-muted">{r.label}</div>
                                {r.preset ? (
                                    <>
                                        <div className="truncate text-sm font-semibold text-ink">{r.preset.name}</div>
                                        <div className="truncate font-mono text-2xs text-ink-muted">{r.preset.provider}/{r.preset.model}</div>
                                    </>
                                ) : <div className="text-sm text-ink-muted">—</div>}
                            </div>
                        ))}
                        <div className="rounded-control border border-line p-2">
                            <div className="text-2xs font-semibold text-ink-muted">{C.tested}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                                {testedPresets.map((p) => (
                                    <span key={p.id} className="rounded bg-brand-soft px-2 py-1 font-mono text-2xs text-link">{p.name}</span>
                                ))}
                                {testedPresets.length === 0 && <span className="text-sm text-ink-muted">—</span>}
                            </div>
                        </div>
                    </div>
                </div>

                <PromptExperimentContext targetKey={exp.target_key} steps={exp.snapshot?.render_data?.steps ?? []} baseline={exp.snapshot?.baseline} frozen lang={lang} />
                {actionError && <Callout variant="danger" title={C.error}>{actionError}</Callout>}
                {exp.error && <Callout variant="danger" title={C.error}>{exp.error}</Callout>}
                {blockers.length > 0 && (
                    <Callout variant={exp.purpose === 'verification' ? 'info' : 'warning'} title={C.blockersTitle}>
                        <ul className="list-disc pl-4">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                        <p className="mt-1">{C.blockersHint}</p>
                    </Callout>
                )}

                <details className="rounded-lg border border-line bg-surface p-4 text-xs text-ink-muted">
                    <summary className="cursor-pointer">{contextCopy.technical}</summary>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify({ manifest_hash: exp.manifest_hash, limits: exp.snapshot?.limits, model_digests: exp.snapshot?.model_digests }, null, 2)}</pre>
                </details>
                {exp.candidates.length > 0 && renderCandidates(exp)}
                {renderCases(exp)}
                {exp.summary && renderSummary(exp)}
                {renderResults(exp)}
                {renderRuns(exp)}
                {exp.summary && renderDecision(exp, acceptDisabled, acceptHint)}
            </div>
        );
    }

    return (
        <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-line bg-surface p-4">
                <div>
                    <h2 className="text-lg font-semibold text-ink">{C.title}</h2>
                    <p className="mt-2 max-w-3xl text-sm text-ink-body">{contextCopy.workflow}</p>
                    <p className="text-sm text-ink-muted">{C.subtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                    {selectedId === null && (
                        <Button variant="secondary" type="button" aria-label={C.refresh} onClick={() => void loadList()} className="w-control px-0">
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    )}
                    {selectedId === null && (
                        <Button size="sm" disabled={!options} onClick={() => setShowForm((v) => !v)}>
                            {showForm ? <><X className="h-4 w-4" />{C.cancel}</> : <><Plus className="h-4 w-4" />{C.newExperiment}</>}
                        </Button>
                    )}
                </div>
            </div>

            {optionsError && <Callout variant="danger" title={C.error}>{optionsError}</Callout>}
            {options && !options.enabled && (
                <Callout variant="warning" title={C.disabledTitle}>
                    <p>{C.disabledHint}</p>
                    {options.reason && <p className="mt-1"><span className="font-semibold">{C.reasonLabel}:</span> {options.reason}</p>}
                </Callout>
            )}

            {selectedId === null && showForm && renderCreateForm()}
            {selectedId === null ? renderList() : renderDetail()}
        </div>
    );
}
