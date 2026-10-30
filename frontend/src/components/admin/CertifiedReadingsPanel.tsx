'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, BadgeCheck, AlertTriangle, Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { ContentLanguageStatus } from './ContentLanguageStatus';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

type Lang = 'it' | 'en' | 'es' | 'fr' | 'de' | 'sv';
const LANGS: Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];
const KINDS = ['essay', 'fiction', 'film', 'documentary', 'series', 'article', 'podcast', 'video'] as const;
const AUDIENCES = ['secondaria', 'universita', 'adulti'] as const;
const INSTRUMENTS = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP', 'SAVICKAS'] as const;

interface Theme { code: string; label: string; factors: string[]; }

/** Provenienza della sinossi: senza URL la voce non puo' essere certificata. */
interface SynopsisSource {
    source?: string;
    url?: string;
    retrieved_at?: string;
    license?: string;
    approved_by?: string | null;
}

interface Reading {
    id: number;
    slug: string;
    kind: string;
    title: string;
    original_title: string | null;
    creators: string[] | null;
    year: number | null;
    publisher: string | null;
    identifiers: Record<string, string> | null;
    themes: string[] | null;
    factor_codes: string[] | null;
    questionnaire_types: string[] | null;
    audience: string[] | null;
    available_languages: string[] | null;
    summary_i18n: Record<string, string> | null;
    why_i18n: Record<string, string> | null;
    synopsis_i18n: Record<string, string> | null;
    synopsis_source: SynopsisSource | null;
    is_sensitive: boolean;
    content_warning: string | null;
    where_to_find: string | null;
    source_reference: string | null;
    certified_by: string | null;
    status: string;
    is_active: boolean;
    sort_order: number;
    verification: Record<string, unknown> | null;
}

type FormState = {
    slug: string; kind: string; title: string; original_title: string;
    creators: string; year: string; publisher: string; isbn: string; doi: string;
    themes: string[]; factor_codes: string; questionnaire_types: string[];
    audience: string[]; available_languages: string[];
    summary_i18n: Record<string, string>; why_i18n: Record<string, string>;
    synopsis_i18n: Record<string, string>; synopsis_source: SynopsisSource;
    is_sensitive: boolean; content_warning: string; where_to_find: string;
    source_reference: string; certified_by: string; status: string;
    is_active: boolean; sort_order: string;
};

const EMPTY: FormState = {
    slug: '', kind: 'essay', title: '', original_title: '',
    creators: '', year: '', publisher: '', isbn: '', doi: '',
    themes: [], factor_codes: '', questionnaire_types: [],
    audience: ['secondaria'], available_languages: ['it'],
    summary_i18n: {}, why_i18n: {},
    synopsis_i18n: {}, synopsis_source: {},
    is_sensitive: false, content_warning: '', where_to_find: '',
    source_reference: '', certified_by: '', status: 'draft',
    is_active: true, sort_order: '0',
};

const splitList = (value: string): string[] =>
    value.split(',').map((v) => v.trim()).filter(Boolean);

export function CertifiedReadingsPanel() {
    const { t } = useI18n();
    const [readings, setReadings] = useState<Reading[]>([]);
    const [themes, setThemes] = useState<Theme[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [lang, setLang] = useState<Lang>('it');
    const [saving, setSaving] = useState(false);
    const [verifyingId, setVerifyingId] = useState<number | null>(null);
    const [fetchingSynopsis, setFetchingSynopsis] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/certified-readings');
            if (res.status === 401 || res.status === 403) { window.location.href = '/'; return; }
            if (res.ok) setReadings(await res.json());
        } catch (e) {
            console.error('Failed to load certified readings', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
        void (async () => {
            try {
                const res = await fetch('/api/admin/reading-themes');
                if (res.ok) setThemes(await res.json());
            } catch (e) {
                console.error('Failed to load reading themes', e);
            }
        })();
    }, [refresh]);

    const startNew = () => { setForm(EMPTY); setEditingId('new'); setError(null); };

    const startEdit = (row: Reading) => {
        setForm({
            slug: row.slug, kind: row.kind, title: row.title,
            original_title: row.original_title ?? '',
            creators: (row.creators ?? []).join(', '),
            year: row.year ? String(row.year) : '',
            publisher: row.publisher ?? '',
            isbn: row.identifiers?.isbn ?? '',
            doi: row.identifiers?.doi ?? '',
            themes: row.themes ?? [],
            factor_codes: (row.factor_codes ?? []).join(', '),
            questionnaire_types: row.questionnaire_types ?? [],
            audience: row.audience ?? [],
            available_languages: row.available_languages ?? [],
            summary_i18n: row.summary_i18n ?? {},
            why_i18n: row.why_i18n ?? {},
            synopsis_i18n: row.synopsis_i18n ?? {},
            synopsis_source: row.synopsis_source ?? {},
            is_sensitive: row.is_sensitive,
            content_warning: row.content_warning ?? '',
            where_to_find: row.where_to_find ?? '',
            source_reference: row.source_reference ?? '',
            certified_by: row.certified_by ?? '',
            status: row.status,
            is_active: row.is_active,
            sort_order: String(row.sort_order),
        });
        setEditingId(row.id);
        setError(null);
    };

    const cancel = () => { setEditingId(null); setForm(EMPTY); setError(null); };

    const toggle = (list: string[], value: string): string[] =>
        list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

    const buildBody = () => {
        const identifiers: Record<string, string> = {};
        if (form.isbn.trim()) identifiers.isbn = form.isbn.trim();
        if (form.doi.trim()) identifiers.doi = form.doi.trim();
        return {
            slug: form.slug.trim(),
            kind: form.kind,
            title: form.title.trim(),
            original_title: form.original_title.trim() || null,
            creators: splitList(form.creators),
            year: form.year.trim() ? Number(form.year) : null,
            publisher: form.publisher.trim() || null,
            identifiers: Object.keys(identifiers).length ? identifiers : null,
            themes: form.themes,
            factor_codes: splitList(form.factor_codes).map((c) => c.toUpperCase()),
            questionnaire_types: form.questionnaire_types,
            audience: form.audience,
            available_languages: form.available_languages,
            summary_i18n: form.summary_i18n,
            why_i18n: form.why_i18n,
            synopsis_i18n: form.synopsis_i18n,
            synopsis_source: Object.keys(form.synopsis_source).length ? form.synopsis_source : null,
            is_sensitive: form.is_sensitive,
            content_warning: form.content_warning.trim() || null,
            where_to_find: form.where_to_find.trim() || null,
            source_reference: form.source_reference.trim() || null,
            certified_by: form.certified_by.trim() || null,
            status: form.status,
            is_active: form.is_active,
            sort_order: Number(form.sort_order) || 0,
        };
    };

    const save = async () => {
        if (!form.slug.trim() || !form.title.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const isNew = editingId === 'new';
            const res = await fetch(
                isNew ? '/api/admin/certified-readings' : `/api/admin/certified-readings/${editingId}`,
                { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody()) },
            );
            if (!res.ok) {
                const detail = await res.json().catch(() => null);
                setError(detail?.detail ?? t('admin.readings.error.save'));
                return;
            }
            cancel();
            await refresh();
        } catch (e) {
            console.error('Failed to save reading', e);
            setError(t('admin.readings.error.save'));
        } finally {
            setSaving(false);
        }
    };

    const verify = async (id: number) => {
        setVerifyingId(id);
        try {
            const res = await fetch(`/api/admin/certified-readings/${id}/verify`, { method: 'POST' });
            if (res.ok) await refresh();
        } catch (e) {
            console.error('Failed to verify reading', e);
        } finally {
            setVerifyingId(null);
        }
    };

    /** Chiede una bozza di sinossi alle fonti; non salva nulla: l'admin approva a mano. */
    const fetchSynopsis = async () => {
        if (typeof editingId !== 'number') return;
        setFetchingSynopsis(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/certified-readings/${editingId}/synopsis-draft?lang=${lang}`, { method: 'POST' });
            const payload = await res.json().catch(() => null);
            if (!res.ok || !payload?.text) {
                setError(payload?.detail ?? t('admin.readings.synopsisNotFound'));
                return;
            }
            // La fonte decide la lingua: Wikipedia segue quella chiesta, i
            // cataloghi bibliografici rispondono in inglese comunque.
            const found: string = payload.language || lang;
            setForm((prev) => ({
                ...prev,
                synopsis_i18n: { ...prev.synopsis_i18n, [found]: payload.text },
                synopsis_source: {
                    source: payload.source, url: payload.url,
                    retrieved_at: payload.retrieved_at, license: payload.license,
                    approved_by: null,
                },
            }));
            if (found !== lang) setLang(found as Lang);
        } catch (e) {
            console.error('Failed to fetch synopsis draft', e);
            setError(t('admin.readings.synopsisNotFound'));
        } finally {
            setFetchingSynopsis(false);
        }
    };

    const [confirmDelete, setConfirmDelete] = useState<string | number | null>(null);
    const remove = async (id: number) => {
        try {
            const res = await fetch(`/api/admin/certified-readings/${id}`, { method: 'DELETE' });
            if (res.ok) await refresh();
        } catch (e) {
            console.error('Failed to delete reading', e);
        }
    };

    const verificationBadge = (row: Reading) => {
        const match = row.verification?.match as boolean | null | undefined;
        if (row.verification == null) {
            return <span className="text-xs text-ink-muted">{t('admin.readings.neverChecked')}</span>;
        }
        if (match === true) {
            return <span className="inline-flex items-center gap-1 text-xs text-success"><BadgeCheck className="h-3.5 w-3.5" />{t('admin.readings.verified')}</span>;
        }
        if (match === false) {
            return <span className="inline-flex items-center gap-1 text-xs text-danger"><AlertTriangle className="h-3.5 w-3.5" />{t('admin.readings.notFound')}</span>;
        }
        return <span className="text-xs text-warning">{t('admin.readings.manualCheck')}</span>;
    };

    const inputCls = 'h-9 w-full rounded-control border border-line bg-surface px-2 text-sm text-ink-body outline-none focus:border-focus';
    const areaCls = 'min-h-[70px] w-full rounded-control border border-line bg-surface px-2 py-1 text-sm text-ink-body outline-none focus:border-focus';
    const chip = (active: boolean) =>
        `min-h-control rounded-control border px-2 py-1 text-xs font-semibold ${active ? 'border-brand-line bg-brand-soft text-link' : 'border-line bg-surface text-ink-muted'}`;

    const renderForm = () => (
        <div className="rounded-lg border border-brand-line bg-brand-soft/40 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.slug')}
                    <input className={inputCls} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="dweck-mindset" />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.kind')}
                    <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                        {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.status')}
                    <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        <option value="draft">{t('admin.readings.draft')}</option>
                        <option value="certified">{t('admin.readings.certified')}</option>
                    </select>
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.order')}
                    <input className={inputCls} type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col text-xs font-semibold text-ink-muted lg:col-span-2">{t('admin.readings.title.field')}
                    <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted lg:col-span-2">{t('admin.readings.originalTitle')}
                    <input className={inputCls} value={form.original_title} onChange={(e) => setForm({ ...form, original_title: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted lg:col-span-2">{t('admin.readings.creators')}
                    <input className={inputCls} value={form.creators} onChange={(e) => setForm({ ...form, creators: e.target.value })} placeholder="Carol S. Dweck" />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.year')}
                    <input className={inputCls} type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.publisher')}
                    <input className={inputCls} value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.isbn')}
                    <input className={inputCls} value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.doi')}
                    <input className={inputCls} value={form.doi} onChange={(e) => setForm({ ...form, doi: e.target.value })} placeholder="10.1177/..." />
                </label>
            </div>

            {/* Temi: e' la chiave con cui la voce raggiunge una conversazione */}
            <div className="mt-4">
                <div className="mb-1 text-xs font-semibold text-ink-muted">{t('admin.readings.themes')}</div>
                <div className="flex flex-wrap gap-1">
                    {themes.map((theme) => (
                        <button key={theme.code} type="button" className={chip(form.themes.includes(theme.code))}
                            onClick={() => setForm({ ...form, themes: toggle(form.themes, theme.code) })}>
                            {theme.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.factors')}
                    <input className={inputCls} value={form.factor_codes} onChange={(e) => setForm({ ...form, factor_codes: e.target.value })} placeholder="A1, S1" />
                </label>
                <div className="text-xs font-semibold text-ink-muted">{t('admin.readings.instruments')}
                    <div className="mt-1 flex flex-wrap gap-1">
                        {INSTRUMENTS.map((code) => (
                            <button key={code} type="button" className={chip(form.questionnaire_types.includes(code))}
                                onClick={() => setForm({ ...form, questionnaire_types: toggle(form.questionnaire_types, code) })}>{code}</button>
                        ))}
                    </div>
                </div>
                <div className="text-xs font-semibold text-ink-muted">{t('admin.readings.audience')}
                    <div className="mt-1 flex flex-wrap gap-1">
                        {AUDIENCES.map((code) => (
                            <button key={code} type="button" className={chip(form.audience.includes(code))}
                                onClick={() => setForm({ ...form, audience: toggle(form.audience, code) })}>{code}</button>
                        ))}
                    </div>
                </div>
                <div className="text-xs font-semibold text-ink-muted">{t('admin.readings.languages')}
                    <div className="mt-1 flex flex-wrap gap-1">
                        {LANGS.map((code) => (
                            <button key={code} type="button" className={chip(form.available_languages.includes(code))}
                                onClick={() => setForm({ ...form, available_languages: toggle(form.available_languages, code) })}>{code.toUpperCase()}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Testi per lingua */}
            <div className="mt-4 flex gap-1">
                {LANGS.map((l) => (
                    <button key={l} type="button" onClick={() => setLang(l)} className={chip(lang === l)}>{l.toUpperCase()}</button>
                ))}
            </div>
            {editingId !== 'new' && (
                <ContentLanguageStatus
                    contentType="certified_reading"
                    contentKey={form.slug}
                    locale={lang}
                />
            )}
            <div className="mt-2 space-y-4">
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.summary')}
                    <textarea className={areaCls} value={form.summary_i18n[lang] ?? ''}
                        onChange={(e) => setForm({ ...form, summary_i18n: { ...form.summary_i18n, [lang]: e.target.value } })} />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.why')}
                    <textarea className={areaCls} value={form.why_i18n[lang] ?? ''}
                        onChange={(e) => setForm({ ...form, why_i18n: { ...form.why_i18n, [lang]: e.target.value } })} />
                </label>
            </div>

            {/* Sinossi: di cosa parla l'opera. Viene da una fonte, e la fonte si dichiara. */}
            <div className="mt-4 rounded-control border border-line bg-surface/70 p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-semibold text-ink-muted">{t('admin.readings.synopsis')}</div>
                    {typeof editingId === 'number' && (
                        <button type="button" onClick={() => void fetchSynopsis()} disabled={fetchingSynopsis}
                            className="inline-flex min-h-control items-center gap-1 rounded-control border border-line bg-surface px-2 text-2xs font-semibold text-ink-muted hover:bg-surface-sunken disabled:opacity-50">
                            <Search className="h-3.5 w-3.5" />{t('admin.readings.synopsisFetch')}
                        </button>
                    )}
                </div>
                <p className="mt-1 text-2xs text-ink-muted">{t('admin.readings.synopsisHint')}</p>
                <textarea className={`${areaCls} mt-2`} value={form.synopsis_i18n[lang] ?? ''}
                    onChange={(e) => setForm({ ...form, synopsis_i18n: { ...form.synopsis_i18n, [lang]: e.target.value } })} />
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.synopsisSource')}
                        <input className={inputCls} value={form.synopsis_source.source ?? ''}
                            onChange={(e) => setForm({ ...form, synopsis_source: { ...form.synopsis_source, source: e.target.value } })} />
                    </label>
                    <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.synopsisUrl')}
                        <input className={inputCls} value={form.synopsis_source.url ?? ''}
                            onChange={(e) => setForm({ ...form, synopsis_source: { ...form.synopsis_source, url: e.target.value } })} />
                    </label>
                </div>
                {form.synopsis_source.retrieved_at && (
                    <p className="mt-1 text-2xs text-ink-muted">
                        {t('admin.readings.synopsisRetrieved')}: {form.synopsis_source.retrieved_at}
                        {form.synopsis_source.license ? ` — ${form.synopsis_source.license}` : ''}
                    </p>
                )}
            </div>

            {/* Materiale sensibile */}
            <div className="mt-4 rounded-control border border-warning-line bg-warning-soft/60 p-4">
                <label className="flex items-center gap-2 text-xs font-semibold text-warning-ink">
                    <input type="checkbox" checked={form.is_sensitive} onChange={(e) => setForm({ ...form, is_sensitive: e.target.checked })} />
                    {t('admin.readings.sensitive')}
                </label>
                <p className="mt-1 text-2xs text-warning-ink">{t('admin.readings.sensitiveHint')}</p>
                {form.is_sensitive && (
                    <label className="mt-2 flex flex-col text-xs font-semibold text-warning-ink">{t('admin.readings.warning')}
                        <textarea className={areaCls} value={form.content_warning} onChange={(e) => setForm({ ...form, content_warning: e.target.value })} />
                    </label>
                )}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.whereToFind')}
                    <textarea className={areaCls} value={form.where_to_find} onChange={(e) => setForm({ ...form, where_to_find: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.source')}
                    <textarea className={areaCls} value={form.source_reference} onChange={(e) => setForm({ ...form, source_reference: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.readings.certifiedBy')}
                    <input className={inputCls} value={form.certified_by} onChange={(e) => setForm({ ...form, certified_by: e.target.value })} />
                </label>
                <label className="flex items-center gap-2 self-end text-xs font-semibold text-ink-muted">
                    <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                    {t('admin.readings.active')}
                </label>
            </div>

            {error && <Callout variant="danger" className="mt-4">{error}</Callout>}

            <div className="mt-4 flex gap-2">
                <Button type="button" disabled={saving || !form.slug.trim() || !form.title.trim()} onClick={() => void save()}>
                    <Check className="h-4 w-4" />{t('admin.readings.save')}
                </Button>
                <Button variant="secondary" type="button" onClick={cancel}>
                    <X className="h-4 w-4" />{t('admin.readings.cancel')}
                </Button>
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-ink">{t('admin.readings.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm text-ink-muted">{t('admin.readings.subtitle')}</p>
                </div>
                <Button type="button" onClick={startNew}
                    className="shrink-0">
                    <Plus className="h-4 w-4" />{t('admin.readings.new')}
                </Button>
            </div>

            {editingId === 'new' && renderForm()}

            {loading ? (
                <p className="text-sm text-ink-muted">…</p>
            ) : readings.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-muted">{t('admin.readings.empty')}</p>
            ) : (
                <ul className="space-y-2">
                    {readings.map((row) => (
                        <li key={row.id} className="rounded-lg border border-line bg-surface p-4">
                            {editingId === row.id ? renderForm() : (
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded bg-surface-raised px-2 py-1 text-2xs font-semibold text-ink-muted">{row.kind}</span>
                                            <span className="font-semibold text-ink">{row.title}</span>
                                            {row.year && <span className="text-xs text-ink-muted">{row.year}</span>}
                                            <span className={`rounded px-2 py-1 text-2xs font-semibold ${row.status === 'certified' ? 'bg-success-soft text-success' : 'bg-surface-raised text-ink-muted'}`}>
                                                {row.status === 'certified' ? t('admin.readings.certified') : t('admin.readings.draft')}
                                            </span>
                                            {row.is_sensitive && <AlertTriangle className="h-4 w-4 text-warning" aria-label={t('admin.readings.sensitive')} />}
                                        </div>
                                        <div className="mt-1 text-xs text-ink-muted">{(row.creators ?? []).join(', ')}</div>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {(row.themes ?? []).map((code) => (
                                                <span key={code} className="rounded bg-brand-soft px-2 py-1 text-2xs text-link">
                                                    {themes.find((th) => th.code === code)?.label ?? code}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="mt-1">{verificationBadge(row)}</div>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-1">
                                        <button type="button" onClick={() => void verify(row.id)} disabled={verifyingId === row.id}
                                            title={t('admin.readings.verify')} aria-label={t('admin.readings.verify')}
                                            className="inline-flex min-h-control min-w-control items-center justify-center rounded-control border border-line p-2 text-ink-muted hover:bg-surface-sunken disabled:opacity-50">
                                            <Search className="h-4 w-4" />
                                        </button>
                                        <button type="button" onClick={() => startEdit(row)} aria-label={t('admin.readings.edit')}
                                            className="inline-flex min-h-control min-w-control items-center justify-center rounded-control border border-line p-2 text-ink-muted hover:bg-surface-sunken">
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        {confirmDelete === row.id
                                            ? <ConfirmInline question={t('admin.readings.confirmDelete')} onConfirm={() => { setConfirmDelete(null); void remove(row.id); }} onCancel={() => setConfirmDelete(null)} />
                                            : <button type="button" onClick={() => setConfirmDelete(row.id)} aria-label={t('admin.readings.delete')}
                                                  className="inline-flex min-h-control min-w-control items-center justify-center rounded-control border border-line p-2 text-danger hover:bg-danger-soft">
                                                  <Trash2 className="h-4 w-4" />
                                              </button>}
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
