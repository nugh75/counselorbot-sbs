'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    AlertTriangle,
    BarChart3,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Download,
    FileJson,
    Filter,
    Globe2,
    MessageSquare,
    RefreshCw,
    Search,
    ShieldCheck,
    SlidersHorizontal,
    SquareTerminal,
    ThumbsDown,
    ThumbsUp,
    Trash2,
    X,
} from 'lucide-react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useI18n } from '@/lib/i18n-context';

type LogDetails = Record<string, unknown>;

interface LogEntry {
    id: number;
    session_id: string;
    conversation_id?: string | null;
    action: string;
    timestamp: string;
    user_id?: number | null;
    username?: string | null;
    email?: string | null;
    anonymous_research_code?: string | null;
    provider?: string | null;
    model_name?: string | null;
    questionnaire_type?: string | null;
    phase?: string | null;
    mode?: string | null;
    response_id?: string | null;
    cost_usd?: number | null;
    helpful?: boolean | null;
    details?: LogDetails | string | null;
}

interface LogStats {
    total: number;
    distinct_sessions: number;
    distinct_conversations?: number;
    by_action: Record<string, number>;
    by_provider: Record<string, number>;
    by_questionnaire_type: Record<string, number>;
    turns_by_day: Array<{ date: string; turns: number }>;
    feedback: { rated: number; helpful: number; not_helpful: number };
    positive_feedback_pct: number;
}

interface RetentionStatus {
    retention_days: number;
    retention_enabled: boolean;
    total_logs: number;
    purgeable_logs: number;
    purge_cutoff?: string | null;
    oldest_log_timestamp?: string | null;
    age_buckets?: Record<string, number>;
}

interface PiiReport {
    redaction_enabled: boolean;
    scanned_logs: number;
    suspect_logs: number;
    by_type: Record<string, number>;
}

interface LogOptions {
    actions: string[];
    providers: string[];
    questionnaire_types: string[];
    usernames: string[];
    anonymous_research_codes: string[];
    conversation_ids: string[];
    models: string[];
    phases: string[];
    modes: string[];
}

interface MultiSelectFilterProps {
    label: string;
    options: string[];
    selected: string[];
    onChange: (next: string[]) => void;
    searchPlaceholder: string;
    selectedLabel: (n: number) => string;
    clearLabel: string;
    emptyLabel: string;
}

function MultiSelectFilter({
    label,
    options,
    selected,
    onChange,
    searchPlaceholder,
    selectedLabel,
    clearLabel,
    emptyLabel,
}: MultiSelectFilterProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onClick = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return needle ? options.filter((value) => value.toLowerCase().includes(needle)) : options;
    }, [options, query]);

    const toggle = (value: string) => {
        onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
    };

    const summary = selected.length === 0
        ? label
        : selected.length === 1
            ? selected[0]
            : selectedLabel(selected.length);

    return (
        <div ref={ref} className="relative min-w-0">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
            >
                <span className={`truncate ${selected.length === 0 ? 'text-slate-400' : ''}`}>{summary}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute z-20 mt-1 w-full min-w-[200px] rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={searchPlaceholder}
                        className="mb-2 h-8 w-full rounded border border-slate-200 px-2 text-sm outline-none focus:border-sky-400"
                        autoFocus
                    />
                    <div className="max-h-56 overflow-auto">
                        {filtered.length === 0 && (
                            <div className="px-2 py-3 text-center text-xs text-slate-400">{emptyLabel}</div>
                        )}
                        {filtered.map((value) => (
                            <label key={value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                                <input
                                    type="checkbox"
                                    checked={selected.includes(value)}
                                    onChange={() => toggle(value)}
                                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                />
                                <span className="truncate" title={value}>{value}</span>
                            </label>
                        ))}
                    </div>
                    {selected.length > 0 && (
                        <button
                            type="button"
                            onClick={() => onChange([])}
                            className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                            {clearLabel}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

const DEFAULT_ACTIONS = ['chat_message', 'site_chat', 'opencode_chat', 'chat_error'];
const DEFAULT_PROVIDERS = ['openai', 'anthropic', 'gemini', 'mistral', 'openrouter', 'ollama', 'llamacpp', 'opencode', 'unknown'];
const DEFAULT_QUESTIONNAIRES = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP', 'SAVICKAS', 'SITE', 'OPENCODE'];

function asObject(details: LogEntry['details']): LogDetails {
    if (!details) return {};
    if (typeof details === 'string') {
        try {
            const parsed = JSON.parse(details);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { raw: details };
        } catch {
            return { raw: details };
        }
    }
    return details;
}

function textValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
}

function firstText(details: LogDetails, keys: string[]): string {
    for (const key of keys) {
        const value = textValue(details[key]);
        if (value.trim()) return value;
    }
    return '';
}

function short(value: string, max = 96): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}...`;
}

function formatDate(value?: string | null): string {
    if (!value) return '-';
    try {
        return format(new Date(value), 'dd/MM/yyyy HH:mm');
    } catch {
        return value;
    }
}

function csvLabel(value: boolean | null | undefined): string {
    if (value === true) return 'positive';
    if (value === false) return 'negative';
    return '';
}

export function LogViewer() {
    const { t } = useI18n();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [expandedLog, setExpandedLog] = useState<number | null>(null);
    const [detailView, setDetailView] = useState<'human' | 'json'>('human');
    const [view, setView] = useState<'logs' | 'stats' | 'hygiene'>('logs');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [page, setPage] = useState(0);
    const [limit, setLimit] = useState(50);
    const [filters, setFilters] = useState({
        q: '',
        action: '',
        provider: '',
        questionnaire_type: '',
        username: '',
        anonymous_research_code: '',
        conversation_id: '',
        from_date: '',
        to_date: '',
        model: '',
        paid_only: '',
        cost_min: '',
        cost_max: '',
        feedback: '',
        phase: '',
        mode: '',
        has_pii: '',
    });
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [stats, setStats] = useState<LogStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [retention, setRetention] = useState<RetentionStatus | null>(null);
    const [piiReport, setPiiReport] = useState<PiiReport | null>(null);
    const [hygieneLoading, setHygieneLoading] = useState(false);
    const [hygieneMessage, setHygieneMessage] = useState('');
    const [selectedSession, setSelectedSession] = useState<string | null>(null);
    const [selectedSessionKind, setSelectedSessionKind] = useState<'session' | 'conversation'>('session');
    const [sessionLogs, setSessionLogs] = useState<LogEntry[]>([]);
    const [sessionLoading, setSessionLoading] = useState(false);
    const [options, setOptions] = useState<LogOptions>({
        actions: [],
        providers: [],
        questionnaire_types: [],
        usernames: [],
        anonymous_research_codes: [],
        conversation_ids: [],
        models: [],
        phases: [],
        modes: [],
    });

    const pageCount = Math.max(1, Math.ceil(total / limit));

    const setFilter = (key: keyof typeof filters, value: string) => {
        setPage(0);
        setFilters((current) => ({ ...current, [key]: value }));
    };

    const setMultiFilter = (key: keyof typeof filters, values: string[]) => {
        setFilter(key, values.join(','));
    };

    const usernameSelected = useMemo(
        () => (filters.username ? filters.username.split(',').filter(Boolean) : []),
        [filters.username],
    );
    const anonCodeSelected = useMemo(
        () => (filters.anonymous_research_code ? filters.anonymous_research_code.split(',').filter(Boolean) : []),
        [filters.anonymous_research_code],
    );
    const conversationSelected = useMemo(
        () => (filters.conversation_id ? filters.conversation_id.split(',').filter(Boolean) : []),
        [filters.conversation_id],
    );

    const buildParams = useCallback((withPaging: boolean) => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (!value.trim()) return;
            if (key === 'from_date') params.set(key, `${value}T00:00:00`);
            else if (key === 'to_date') params.set(key, `${value}T23:59:59`);
            else params.set(key, value.trim());
        });
        if (withPaging) {
            params.set('skip', String(page * limit));
            params.set('limit', String(limit));
        }
        return params;
    }, [filters, limit, page]);

    const handleAuthError = useCallback((res: Response) => {
        if (res.status === 401 || res.status === 403) {
            window.location.href = '/';
            return true;
        }
        return false;
    }, []);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = buildParams(true);
            const countParams = buildParams(false);
            const [logsRes, countRes] = await Promise.all([
                fetch(`/api/admin/logs?${params.toString()}`),
                fetch(`/api/admin/logs/count?${countParams.toString()}`),
            ]);
            if (handleAuthError(logsRes) || handleAuthError(countRes)) return;
            if (!logsRes.ok || !countRes.ok) throw new Error('logs fetch failed');
            const [logData, countData] = await Promise.all([logsRes.json(), countRes.json()]);
            setLogs(logData);
            setTotal(Number(countData.count || 0));
        } catch (error) {
            console.error('Failed to fetch logs', error);
        } finally {
            setLoading(false);
        }
    }, [buildParams, handleAuthError]);

    const fetchOptions = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/logs/options');
            if (handleAuthError(res)) return;
            if (!res.ok) throw new Error('options fetch failed');
            const data = await res.json();
            setOptions({
                actions: Array.isArray(data?.actions) ? data.actions : [],
                providers: Array.isArray(data?.providers) ? data.providers : [],
                questionnaire_types: Array.isArray(data?.questionnaire_types) ? data.questionnaire_types : [],
                usernames: Array.isArray(data?.usernames) ? data.usernames : [],
                anonymous_research_codes: Array.isArray(data?.anonymous_research_codes) ? data.anonymous_research_codes : [],
                conversation_ids: Array.isArray(data?.conversation_ids) ? data.conversation_ids : [],
                models: Array.isArray(data?.models) ? data.models : [],
                phases: Array.isArray(data?.phases) ? data.phases : [],
                modes: Array.isArray(data?.modes) ? data.modes : [],
            });
        } catch (error) {
            console.error('Failed to fetch log filter options', error);
        }
    }, [handleAuthError]);

    const fetchStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const params = buildParams(false);
            const res = await fetch(`/api/admin/logs/stats?${params.toString()}`);
            if (handleAuthError(res)) return;
            if (!res.ok) throw new Error('stats fetch failed');
            setStats(await res.json());
        } catch (error) {
            console.error('Failed to fetch log stats', error);
        } finally {
            setStatsLoading(false);
        }
    }, [buildParams, handleAuthError]);

    const fetchHygiene = useCallback(async () => {
        setHygieneLoading(true);
        try {
            const [retentionRes, piiRes] = await Promise.all([
                fetch('/api/admin/logs/retention-status'),
                fetch('/api/admin/logs/pii-report'),
            ]);
            if (handleAuthError(retentionRes) || handleAuthError(piiRes)) return;
            if (!retentionRes.ok || !piiRes.ok) throw new Error('hygiene fetch failed');
            const [retentionData, piiData] = await Promise.all([retentionRes.json(), piiRes.json()]);
            setRetention(retentionData);
            setPiiReport(piiData);
        } catch (error) {
            console.error('Failed to fetch data hygiene status', error);
        } finally {
            setHygieneLoading(false);
        }
    }, [handleAuthError]);

    useEffect(() => {
        if (view === 'logs') void fetchLogs();
        if (view === 'stats') void fetchStats();
        if (view === 'hygiene') void fetchHygiene();
    }, [fetchHygiene, fetchLogs, fetchStats, view]);

    useEffect(() => {
        void fetchOptions();
    }, [fetchOptions]);

    useEffect(() => {
        if (!autoRefresh) return;
        const id = window.setInterval(() => {
            if (view === 'logs') void fetchLogs();
            if (view === 'stats') void fetchStats();
            if (view === 'hygiene') void fetchHygiene();
        }, 30000);
        return () => window.clearInterval(id);
    }, [autoRefresh, fetchHygiene, fetchLogs, fetchStats, view]);

    const openSession = async (sessionId: string) => {
        setSelectedSession(sessionId);
        setSelectedSessionKind('session');
        setSessionLogs([]);
        setSessionLoading(true);
        try {
            const res = await fetch(`/api/admin/logs/session/${encodeURIComponent(sessionId)}`);
            if (handleAuthError(res)) return;
            if (!res.ok) throw new Error('session fetch failed');
            setSessionLogs(await res.json());
        } catch (error) {
            console.error('Failed to fetch session logs', error);
        } finally {
            setSessionLoading(false);
        }
    };

    const openConversation = async (conversationId: string) => {
        setSelectedSession(conversationId);
        setSelectedSessionKind('conversation');
        setSessionLogs([]);
        setSessionLoading(true);
        try {
            const res = await fetch(`/api/admin/logs/conversation/${encodeURIComponent(conversationId)}`);
            if (handleAuthError(res)) return;
            if (!res.ok) throw new Error('conversation fetch failed');
            setSessionLogs(await res.json());
        } catch (error) {
            console.error('Failed to fetch conversation logs', error);
        } finally {
            setSessionLoading(false);
        }
    };

    const deleteSelectedSession = async () => {
        if (!selectedSession) return;
        if (!window.confirm(t('admin.logs.deleteConfirm'))) return;
        const res = await fetch(`/api/admin/logs/session/${encodeURIComponent(selectedSession)}?confirm=true`, { method: 'DELETE' });
        if (handleAuthError(res)) return;
        setSelectedSession(null);
        setSessionLogs([]);
        await fetchLogs();
    };

    const exportLogs = (formatName: 'csv' | 'json') => {
        const params = buildParams(false);
        params.set('format', formatName);
        window.location.href = `/api/admin/logs/export?${params.toString()}`;
    };

    const runRetention = async () => {
        if (!window.confirm(t('admin.logs.retentionConfirm'))) return;
        setHygieneLoading(true);
        try {
            const res = await fetch('/api/admin/logs/retention-run?confirm=true', { method: 'POST' });
            if (handleAuthError(res)) return;
            const data = await res.json();
            setHygieneMessage(t('admin.logs.retentionDone').replace('{n}', String(data.deleted || 0)));
            await fetchHygiene();
        } catch (error) {
            console.error('Failed to run retention', error);
        } finally {
            setHygieneLoading(false);
        }
    };

    const resetFilters = () => {
        setPage(0);
        setFilters({
            q: '',
            action: '',
            provider: '',
            questionnaire_type: '',
            username: '',
            anonymous_research_code: '',
            conversation_id: '',
            from_date: '',
            to_date: '',
            model: '',
            paid_only: '',
            cost_min: '',
            cost_max: '',
            feedback: '',
            phase: '',
            mode: '',
            has_pii: '',
        });
    };

    const actionIcon = (action: string) => {
        if (action === 'chat_error') return <AlertTriangle className="h-4 w-4" />;
        if (action === 'site_chat') return <Globe2 className="h-4 w-4" />;
        if (action === 'opencode_chat') return <SquareTerminal className="h-4 w-4" />;
        return <MessageSquare className="h-4 w-4" />;
    };

    const actionClass = (action: string) => {
        if (action === 'chat_error') return 'bg-red-50 text-red-700 ring-red-100';
        if (action === 'site_chat') return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
        if (action === 'opencode_chat') return 'bg-violet-50 text-violet-700 ring-violet-100';
        return 'bg-sky-50 text-sky-700 ring-sky-100';
    };

    const renderFeedback = (value: boolean | null | undefined) => {
        if (value === true) return <ThumbsUp className="h-4 w-4 text-emerald-600" aria-label={t('admin.logs.feedbackPositive')} />;
        if (value === false) return <ThumbsDown className="h-4 w-4 text-red-600" aria-label={t('admin.logs.feedbackNegative')} />;
        return <span className="text-xs text-slate-400">-</span>;
    };

    const filterSummary = useMemo(() => {
        const active = Object.values(filters).filter((value) => value.trim()).length;
        return active ? t('admin.logs.activeFilters').replace('{n}', String(active)) : t('admin.logs.noFilters');
    }, [filters, t]);

    const actionOptions = useMemo(() => {
        const values = options.actions.length ? options.actions : DEFAULT_ACTIONS;
        return ['', ...Array.from(new Set(values)).sort()];
    }, [options.actions]);

    const providerOptions = useMemo(() => {
        const values = options.providers.length ? options.providers : DEFAULT_PROVIDERS;
        return ['', ...Array.from(new Set(values)).sort()];
    }, [options.providers]);

    const questionnaireOptions = useMemo(() => {
        const values = options.questionnaire_types.length ? options.questionnaire_types : DEFAULT_QUESTIONNAIRES;
        return ['', ...Array.from(new Set(values)).sort()];
    }, [options.questionnaire_types]);

    const modelOptions = useMemo(() => ['', ...Array.from(new Set(options.models)).sort()], [options.models]);
    const phaseOptions = useMemo(() => ['', ...Array.from(new Set(options.phases)).sort()], [options.phases]);
    const modeOptions = useMemo(() => ['', ...Array.from(new Set(options.modes)).sort()], [options.modes]);

    const renderLogPreview = (log: LogEntry) => {
        const details = asObject(log.details);
        const userText = firstText(details, ['user_input', 'effective_user_input', 'question']);
        const botText = firstText(details, ['bot_response', 'answer']);
        const preview = userText || botText || textValue(details.error) || JSON.stringify(details);
        return preview || '-';
    };

    const logConversationId = (log: LogEntry): string => {
        const details = asObject(log.details);
        return log.conversation_id || textValue(details.conversation_id) || log.session_id;
    };

    const detailBlock = (label: string, text: string, key?: string) => (
        <div key={key} className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
            <div className="prose prose-sm max-w-none break-words text-slate-700 prose-p:my-1 prose-pre:my-1 prose-pre:whitespace-pre-wrap prose-headings:my-1.5 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-table:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            </div>
        </div>
    );

    // Espande in modo leggibile qualsiasi valore annidato (oggetti/array) invece
    // di scaricarne il JSON grezzo: le stringhe mantengono i loro a-capo reali e
    // il markdown viene renderizzato. Evita virgolette, graffe e '\n' di escape.
    const renderDetailValue = (label: string, value: unknown, keyId: string): ReactNode => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') {
            return value.trim() ? detailBlock(label, value, keyId) : null;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return detailBlock(label, String(value), keyId);
        }
        if (Array.isArray(value)) {
            if (value.length === 0) return null;
            const allScalar = value.every((item) => item === null || typeof item !== 'object');
            if (allScalar) {
                const text = value.map(textValue).filter((s) => s.trim()).join('\n');
                return text ? detailBlock(label, text, keyId) : null;
            }
            const items = value
                .map((item, i) => renderDetailValue(`#${i + 1}`, item, `${keyId}.${i}`))
                .filter(Boolean);
            return items.length ? (
                <div key={keyId} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                    <div className="space-y-2 border-l-2 border-slate-200 pl-3">{items}</div>
                </div>
            ) : null;
        }
        const entries = Object.entries(value as Record<string, unknown>)
            .map(([k, v]) => renderDetailValue(k, v, `${keyId}.${k}`))
            .filter(Boolean);
        return entries.length ? (
            <div key={keyId} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                <div className="space-y-2 border-l-2 border-slate-200 pl-3">{entries}</div>
            </div>
        ) : null;
    };

    const renderHumanDetail = (log: LogEntry) => {
        const details = asObject(log.details);
        const userInput = firstText(details, ['user_input', 'question']);
        const effective = textValue(details.effective_user_input);
        const systemPrompt = textValue(details.system_prompt);
        const botResponse = firstText(details, ['bot_response', 'answer']);
        const error = textValue(details.error);
        const usage = (details.usage && typeof details.usage === 'object') ? details.usage as Record<string, unknown> : {};
        const sources = Array.isArray(details.sources) ? details.sources as string[] : [];
        const conversationId = logConversationId(log);
        const chips: { k: string; v: string }[] = [
            { k: t('admin.logs.conversationId'), v: conversationId || '-' },
            { k: t('admin.logs.sessionId'), v: log.session_id || '-' },
            { k: t('admin.logs.provider'), v: log.provider || textValue(details.provider) || '-' },
            { k: t('admin.logs.model'), v: log.model_name || textValue(details.model) || '-' },
            { k: t('admin.logs.questionnaire'), v: log.questionnaire_type || '-' },
            { k: t('admin.logs.phase'), v: log.phase || textValue(details.phase) || '-' },
            { k: t('admin.logs.mode'), v: log.mode || textValue(details.mode) || '-' },
            { k: t('admin.logs.cost'), v: typeof log.cost_usd === 'number' ? `$${log.cost_usd.toFixed(6)}` : '-' },
        ];
        const tokIn = textValue(usage.prompt_tokens) || textValue(usage.input_tokens);
        const tokOut = textValue(usage.completion_tokens) || textValue(usage.output_tokens);
        if (tokIn || tokOut) chips.push({ k: 'tok in/out', v: `${tokIn || '0'} / ${tokOut || '0'}` });
        const quality = textValue(details.quality);
        if (quality) chips.push({ k: t('admin.logs.d.quality'), v: quality });

        // Any remaining detail keys not already surfaced above — keeps the human
        // view complete relative to the raw JSON instead of silently dropping fields.
        const consumed = new Set([
            'user_input', 'question', 'effective_user_input', 'system_prompt',
            'bot_response', 'answer', 'error', 'usage', 'sources',
            'provider', 'model', 'phase', 'mode', 'quality',
            'cost_usd', 'estimated_cost_usd', 'model_name', 'anonymous_research_code',
            'conversation_id', 'session_id',
        ]);
        const otherNodes = Object.entries(details)
            .filter(([key]) => !consumed.has(key))
            .map(([key, value]) => renderDetailValue(key, value, key))
            .filter(Boolean);

        const hasContent = Boolean(userInput || botResponse || error || systemPrompt || effective)
            || sources.length > 0 || otherNodes.length > 0;
        return (
            <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                    {chips.map((c) => (
                        <span key={c.k} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                            <span className="font-semibold text-slate-400">{c.k}:</span> {c.v}
                        </span>
                    ))}
                </div>
                {userInput && detailBlock(t('admin.logs.d.userInput'), userInput)}
                {effective && effective !== userInput && detailBlock(t('admin.logs.d.effectiveInput'), effective)}
                {systemPrompt && detailBlock(t('admin.logs.d.systemPrompt'), systemPrompt)}
                {botResponse && detailBlock(t('admin.logs.d.botResponse'), botResponse)}
                {error && detailBlock(t('admin.logs.d.error'), error)}
                {sources.length > 0 && detailBlock(t('admin.logs.d.sources'), sources.join('\n'))}
                {otherNodes}
                {!hasContent && <div className="text-sm text-slate-400">{t('admin.logs.d.empty')}</div>}
            </div>
        );
    };

    const renderBreakdown = (title: string, data: Record<string, number> | undefined) => {
        const rows = Object.entries(data || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const max = Math.max(1, ...rows.map(([, count]) => count));
        return (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
                <div className="mt-3 space-y-2">
                    {rows.map(([key, count]) => (
                        <div key={key} className="grid grid-cols-[minmax(120px,1fr)_3fr_48px] items-center gap-3 text-xs">
                            <span className="truncate text-slate-600">{key}</span>
                            <span className="h-2 rounded-full bg-slate-100">
                                <span
                                    className="block h-2 rounded-full bg-sky-500"
                                    style={{ width: `${Math.max(6, (count / max) * 100)}%` }}
                                />
                            </span>
                            <span className="text-right font-mono text-slate-500">{count}</span>
                        </div>
                    ))}
                    {rows.length === 0 && <p className="text-sm text-slate-400">{t('admin.logs.empty')}</p>}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">{t('admin.logs.title')}</h3>
                    <p className="text-sm text-slate-500">{filterSummary}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setView('logs')}
                        className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${view === 'logs' ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                        <MessageSquare className="h-4 w-4" />
                        {t('admin.logs.tabLogs')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setView('stats')}
                        className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${view === 'stats' ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                        <BarChart3 className="h-4 w-4" />
                        {t('admin.logs.tabStats')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setView('hygiene')}
                        className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${view === 'hygiene' ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                        <ShieldCheck className="h-4 w-4" />
                        {t('admin.logs.tabHygiene')}
                    </button>
                    <button
                        type="button"
                        onClick={() => view === 'logs' ? void fetchLogs() : view === 'stats' ? void fetchStats() : void fetchHygiene()}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading || statsLoading || hygieneLoading ? 'animate-spin' : ''}`} />
                        {t('admin.logs.refresh')}
                    </button>
                </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="relative block">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            value={filters.q}
                            onChange={(event) => setFilter('q', event.target.value)}
                            placeholder={t('admin.logs.search')}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                        />
                    </label>
                    <select value={filters.action} onChange={(event) => setFilter('action', event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400">
                        {actionOptions.map((value) => <option key={value || 'all'} value={value}>{value || t('admin.logs.allActions')}</option>)}
                    </select>
                    <select value={filters.provider} onChange={(event) => setFilter('provider', event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400">
                        {providerOptions.map((value) => <option key={value || 'all'} value={value}>{value || t('admin.logs.allProviders')}</option>)}
                    </select>
                    <select value={filters.questionnaire_type} onChange={(event) => setFilter('questionnaire_type', event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400">
                        {questionnaireOptions.map((value) => <option key={value || 'all'} value={value}>{value || t('admin.logs.allQuestionnaires')}</option>)}
                    </select>
                    <MultiSelectFilter
                        label={t('admin.logs.allUsernames')}
                        options={options.usernames}
                        selected={usernameSelected}
                        onChange={(values) => setMultiFilter('username', values)}
                        searchPlaceholder={t('admin.logs.multiSelectSearch')}
                        selectedLabel={(n) => t('admin.logs.multiSelectSelected').replace('{n}', String(n))}
                        clearLabel={t('admin.logs.multiSelectClear')}
                        emptyLabel={t('admin.logs.multiSelectEmpty')}
                    />
                    <MultiSelectFilter
                        label={t('admin.logs.allAnonCodes')}
                        options={options.anonymous_research_codes}
                        selected={anonCodeSelected}
                        onChange={(values) => setMultiFilter('anonymous_research_code', values)}
                        searchPlaceholder={t('admin.logs.multiSelectSearch')}
                        selectedLabel={(n) => t('admin.logs.multiSelectSelected').replace('{n}', String(n))}
                        clearLabel={t('admin.logs.multiSelectClear')}
                        emptyLabel={t('admin.logs.multiSelectEmpty')}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <input type="date" value={filters.from_date} onChange={(event) => setFilter('from_date', event.target.value)} className="h-10 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-sky-400" />
                        <input type="date" value={filters.to_date} onChange={(event) => setFilter('to_date', event.target.value)} className="h-10 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-sky-400" />
                    </div>
                    <button
                        type="button"
                        onClick={resetFilters}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                        <Filter className="h-4 w-4" />
                        {t('admin.logs.reset')}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                    <SlidersHorizontal className="h-4 w-4" />
                    {t('admin.logs.moreFilters')}
                </button>
                {showAdvanced && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <MultiSelectFilter
                            label={t('admin.logs.allConversations')}
                            options={options.conversation_ids}
                            selected={conversationSelected}
                            onChange={(values) => setMultiFilter('conversation_id', values)}
                            searchPlaceholder={t('admin.logs.multiSelectSearch')}
                            selectedLabel={(n) => t('admin.logs.multiSelectSelected').replace('{n}', String(n))}
                            clearLabel={t('admin.logs.multiSelectClear')}
                            emptyLabel={t('admin.logs.multiSelectEmpty')}
                        />
                        <select value={filters.model} onChange={(event) => setFilter('model', event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400">
                            {modelOptions.map((value) => <option key={value || 'all'} value={value}>{value || t('admin.logs.allModels')}</option>)}
                        </select>
                        <select value={filters.phase} onChange={(event) => setFilter('phase', event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400">
                            {phaseOptions.map((value) => <option key={value || 'all'} value={value}>{value || t('admin.logs.allPhases')}</option>)}
                        </select>
                        <select value={filters.mode} onChange={(event) => setFilter('mode', event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400">
                            {modeOptions.map((value) => <option key={value || 'all'} value={value}>{value || t('admin.logs.allModes')}</option>)}
                        </select>
                        <select value={filters.feedback} onChange={(event) => setFilter('feedback', event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400">
                            <option value="">{t('admin.logs.feedbackAll')}</option>
                            <option value="helpful">{t('admin.logs.feedbackHelpful')}</option>
                            <option value="not_helpful">{t('admin.logs.feedbackNotHelpful')}</option>
                            <option value="unrated">{t('admin.logs.feedbackUnrated')}</option>
                        </select>
                        <input
                            type="number"
                            step="0.0001"
                            min="0"
                            value={filters.cost_min}
                            onChange={(event) => setFilter('cost_min', event.target.value)}
                            placeholder={t('admin.logs.costMin')}
                            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
                        />
                        <input
                            type="number"
                            step="0.0001"
                            min="0"
                            value={filters.cost_max}
                            onChange={(event) => setFilter('cost_max', event.target.value)}
                            placeholder={t('admin.logs.costMax')}
                            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
                        />
                        <label className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600">
                            <input
                                type="checkbox"
                                checked={filters.paid_only === 'true'}
                                onChange={(event) => setFilter('paid_only', event.target.checked ? 'true' : '')}
                                className="h-4 w-4"
                            />
                            {t('admin.logs.paidOnly')}
                        </label>
                        <label className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600">
                            <input
                                type="checkbox"
                                checked={filters.has_pii === 'true'}
                                onChange={(event) => setFilter('has_pii', event.target.checked ? 'true' : '')}
                                className="h-4 w-4"
                            />
                            {t('admin.logs.hasPii')}
                        </label>
                    </div>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(event) => setAutoRefresh(event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        {t('admin.logs.autoRefresh')}
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => exportLogs('csv')} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                            <Download className="h-4 w-4" />
                            CSV
                        </button>
                        <button type="button" onClick={() => exportLogs('json')} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                            <FileJson className="h-4 w-4" />
                            JSON
                        </button>
                    </div>
                </div>
            </div>

            {view === 'logs' && (
                <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-sm text-slate-500">
                        <span>{t('admin.logs.totalCount').replace('{n}', String(total))}</span>
                        <div className="flex items-center gap-2">
                            <select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(0); }} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">
                                {[25, 50, 100, 200].map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                            <button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 disabled:opacity-40">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="min-w-20 text-center text-xs text-slate-500">{page + 1} / {pageCount}</span>
                            <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 disabled:opacity-40">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    <div>
                        <table className="w-full table-fixed text-left text-sm">
                            <colgroup>
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '11%' }} />
                                <col style={{ width: '9%' }} />
                                <col style={{ width: '11%' }} />
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '5%' }} />
                                <col style={{ width: '9%' }} />
                                <col style={{ width: '17%' }} />
                            </colgroup>
                            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                <tr>
                                    <th className="px-2 py-2 font-semibold">{t('admin.logs.date')}</th>
                                    <th className="px-2 py-2 font-semibold">{t('admin.logs.conversation')}</th>
                                    <th className="px-2 py-2 font-semibold">{t('admin.logs.anonCode')}</th>
                                    <th className="px-2 py-2 font-semibold">{t('admin.logs.action')}</th>
                                    <th className="px-2 py-2 font-semibold">{t('admin.logs.provider')}</th>
                                    <th className="px-2 py-2 font-semibold">{t('admin.logs.model')}</th>
                                    <th className="px-2 py-2 font-semibold">{t('admin.logs.questionnaire')}</th>
                                    <th className="px-2 py-2 font-semibold">{t('admin.logs.feedback')}</th>
                                    <th className="px-2 py-2 font-semibold">{t('admin.logs.cost')}</th>
                                    <th className="px-2 py-2 font-semibold">{t('admin.logs.details')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {logs.map((log) => {
                                    const details = asObject(log.details);
                                    const conversationId = logConversationId(log);
                                    const anon = log.anonymous_research_code || textValue(details.anonymous_research_code) || '-';
                                    const modelName = log.model_name || textValue(details.model) || '-';
                                    const costText = typeof log.cost_usd === 'number' ? `$${log.cost_usd.toFixed(6)}` : (textValue(details.cost_usd) || textValue(details.estimated_cost_usd) || '-');
                                    const previewFull = renderLogPreview(log);
                                    return (
                                        <Fragment key={log.id}>
                                        <tr className="align-top hover:bg-slate-50">
                                            <td className="px-2 py-2 align-top text-xs text-slate-600"><div className="truncate" title={formatDate(log.timestamp)}>{formatDate(log.timestamp)}</div></td>
                                            <td className="px-2 py-2 align-top">
                                                <button type="button" onClick={() => void openConversation(conversationId)} title={conversationId} className="block w-full truncate text-left font-mono text-xs font-medium text-sky-700 hover:text-sky-900">
                                                    {short(conversationId, 18)}
                                                </button>
                                                <button type="button" onClick={() => void openSession(log.session_id)} title={log.session_id} className="block w-full truncate text-left font-mono text-[11px] text-slate-400 hover:text-slate-600">
                                                    {t('admin.logs.session')}: {short(log.session_id, 14)}
                                                </button>
                                                {log.username && <div className="truncate text-xs text-slate-400" title={log.username}>{log.username}</div>}
                                            </td>
                                            <td className="px-2 py-2 align-top font-mono text-xs text-slate-600"><div className="truncate" title={anon}>{anon}</div></td>
                                            <td className="px-2 py-2 align-top">
                                                <span title={log.action} className={`inline-flex w-full items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ring-1 ${actionClass(log.action)}`}>
                                                    <span className="shrink-0">{actionIcon(log.action)}</span>
                                                    <span className="truncate">{log.action}</span>
                                                </span>
                                            </td>
                                            <td className="px-2 py-2 align-top text-xs text-slate-600"><div className="truncate font-medium" title={log.provider || '-'}>{log.provider || '-'}</div></td>
                                            <td className="px-2 py-2 align-top text-xs text-slate-600"><div className="truncate" title={modelName}>{modelName}</div></td>
                                            <td className="px-2 py-2 align-top text-xs text-slate-600">
                                                <div className="truncate font-medium" title={log.questionnaire_type || '-'}>{log.questionnaire_type || '-'}</div>
                                                <div className="truncate text-slate-400" title={log.phase || log.mode || '-'}>{log.phase || log.mode || '-'}</div>
                                            </td>
                                            <td className="px-2 py-2 align-top">{renderFeedback(log.helpful)}</td>
                                            <td className="px-2 py-2 align-top font-mono text-xs text-slate-600"><div className="truncate" title={costText}>{costText}</div></td>
                                            <td className="px-2 py-2 align-top text-xs text-slate-600">
                                                <button type="button" onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)} title={previewFull} className="block w-full truncate text-left hover:text-slate-900">
                                                    {previewFull}
                                                </button>
                                            </td>
                                        </tr>
                                        {expandedLog === log.id && (
                                            <tr className="bg-slate-50/60">
                                                <td colSpan={10} className="px-4 pb-4">
                                                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                                                        <div className="mb-3 inline-flex rounded-md border border-slate-200 p-0.5">
                                                            <button type="button" onClick={() => setDetailView('human')} className={`rounded px-3 py-1 text-xs font-medium transition-colors ${detailView === 'human' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{t('admin.logs.viewHuman')}</button>
                                                            <button type="button" onClick={() => setDetailView('json')} className={`rounded px-3 py-1 text-xs font-medium transition-colors ${detailView === 'json' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{t('admin.logs.viewJson')}</button>
                                                        </div>
                                                        {detailView === 'human' ? renderHumanDetail(log) : (
                                                            <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                                                                {JSON.stringify(details, null, 2)}
                                                            </pre>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        </Fragment>
                                    );
                                })}
                                {logs.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={10} className="px-6 py-10 text-center text-slate-400">{t('admin.logs.empty')}</td>
                                    </tr>
                                )}
                                {loading && (
                                    <tr>
                                        <td colSpan={10} className="px-6 py-10 text-center text-slate-400">
                                            <RefreshCw className="mx-auto h-5 w-5 animate-spin" />
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {view === 'stats' && (
                <div className="space-y-4">
                    {statsLoading && <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400"><RefreshCw className="mx-auto h-5 w-5 animate-spin" /></div>}
                    {stats && !statsLoading && (
                        <>
                            <div className="grid gap-3 md:grid-cols-4">
                                <div className="rounded-lg border border-slate-200 bg-white p-4">
                                    <div className="text-xs uppercase text-slate-400">{t('admin.logs.statsTurns')}</div>
                                    <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.total}</div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-4">
                                    <div className="text-xs uppercase text-slate-400">{t('admin.logs.statsSessions')}</div>
                                    <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.distinct_sessions}</div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-4">
                                    <div className="text-xs uppercase text-slate-400">{t('admin.logs.statsRated')}</div>
                                    <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.feedback.rated}</div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-4">
                                    <div className="text-xs uppercase text-slate-400">{t('admin.logs.statsPositive')}</div>
                                    <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.positive_feedback_pct}%</div>
                                </div>
                            </div>
                            <div className="grid gap-4 lg:grid-cols-3">
                                {renderBreakdown(t('admin.logs.byAction'), stats.by_action)}
                                {renderBreakdown(t('admin.logs.byProvider'), stats.by_provider)}
                                {renderBreakdown(t('admin.logs.byQuestionnaire'), stats.by_questionnaire_type)}
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                                <h4 className="text-sm font-semibold text-slate-800">{t('admin.logs.turnsByDay')}</h4>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                    {stats.turns_by_day.slice(-12).map((item) => (
                                        <div key={item.date} className="rounded-md border border-slate-100 p-3">
                                            <div className="text-xs text-slate-400">{item.date.slice(0, 10)}</div>
                                            <div className="mt-1 text-lg font-semibold text-slate-800">{item.turns}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {view === 'hygiene' && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold text-slate-800">{t('admin.logs.retention')}</h4>
                            <button type="button" onClick={() => void runRetention()} className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
                                <Trash2 className="h-4 w-4" />
                                {t('admin.logs.runRetention')}
                            </button>
                        </div>
                        {hygieneLoading && <RefreshCw className="mt-6 h-5 w-5 animate-spin text-slate-400" />}
                        {retention && (
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div><dt className="text-slate-400">{t('admin.logs.retentionDays')}</dt><dd className="mt-1 font-semibold text-slate-800">{retention.retention_enabled ? retention.retention_days : t('admin.logs.disabled')}</dd></div>
                                <div><dt className="text-slate-400">{t('admin.logs.purgeable')}</dt><dd className="mt-1 font-semibold text-slate-800">{retention.purgeable_logs}</dd></div>
                                <div><dt className="text-slate-400">{t('admin.logs.totalLogs')}</dt><dd className="mt-1 font-semibold text-slate-800">{retention.total_logs}</dd></div>
                                <div><dt className="text-slate-400">{t('admin.logs.oldest')}</dt><dd className="mt-1 font-semibold text-slate-800">{formatDate(retention.oldest_log_timestamp)}</dd></div>
                            </dl>
                        )}
                        {retention?.age_buckets && (
                            <div className="mt-4 space-y-2">
                                {Object.entries(retention.age_buckets).map(([key, value]) => (
                                    <div key={key} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                                        <span className="text-slate-500">{key.replaceAll('_', ' ')}</span>
                                        <span className="font-mono text-slate-700">{value}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {hygieneMessage && <p className="mt-3 text-sm text-emerald-700">{hygieneMessage}</p>}
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <h4 className="text-sm font-semibold text-slate-800">{t('admin.logs.piiReport')}</h4>
                        {piiReport && (
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div><dt className="text-slate-400">{t('admin.logs.redaction')}</dt><dd className="mt-1 font-semibold text-slate-800">{piiReport.redaction_enabled ? t('admin.logs.enabled') : t('admin.logs.disabled')}</dd></div>
                                <div><dt className="text-slate-400">{t('admin.logs.scanned')}</dt><dd className="mt-1 font-semibold text-slate-800">{piiReport.scanned_logs}</dd></div>
                                <div><dt className="text-slate-400">{t('admin.logs.suspect')}</dt><dd className="mt-1 font-semibold text-slate-800">{piiReport.suspect_logs}</dd></div>
                                <div><dt className="text-slate-400">Email / Tel / CF</dt><dd className="mt-1 font-semibold text-slate-800">{piiReport.by_type.email || 0} / {piiReport.by_type.telefono || 0} / {piiReport.by_type.cf || 0}</dd></div>
                            </dl>
                        )}
                    </div>
                </div>
            )}

            {selectedSession && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                    <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                            <div>
                                <h4 className="font-semibold text-slate-900">{selectedSessionKind === 'conversation' ? t('admin.logs.conversation') : t('admin.logs.session')}</h4>
                                <p className="font-mono text-xs text-slate-500">{selectedSession}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {selectedSessionKind === 'session' && (
                                    <button type="button" onClick={() => void deleteSelectedSession()} className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
                                        <Trash2 className="h-4 w-4" />
                                        {t('admin.logs.deleteSession')}
                                    </button>
                                )}
                                <button type="button" onClick={() => setSelectedSession(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50 p-4">
                            {sessionLoading && <RefreshCw className="mx-auto h-5 w-5 animate-spin text-slate-400" />}
                            {!sessionLoading && sessionLogs.map((log) => {
                                const details = asObject(log.details);
                                const userText = firstText(details, ['user_input', 'effective_user_input', 'question']);
                                const botText = firstText(details, ['bot_response', 'answer']);
                                return (
                                    <div key={log.id} className="space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                                            <span>{formatDate(log.timestamp)} · {log.action} · {log.provider || '-'}/{log.model_name || '-'}</span>
                                            <span className="inline-flex items-center gap-1">{renderFeedback(log.helpful)} {csvLabel(log.helpful)}</span>
                                        </div>
                                        {userText && (
                                            <div className="flex justify-end">
                                                <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-lg bg-sky-600 px-4 py-3 text-sm leading-relaxed text-white">
                                                    {userText}
                                                </div>
                                            </div>
                                        )}
                                        {botText && (
                                            <div className="flex justify-start">
                                                <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800">
                                                    {botText}
                                                </div>
                                            </div>
                                        )}
                                        {!userText && !botText && (
                                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-white p-3 text-xs text-slate-700">
                                                {JSON.stringify(details, null, 2)}
                                            </pre>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
