'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Copy, FileText, Link2, MapPin, Pencil, Plus, QrCode, RefreshCw, Search, Trash2, Users, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useI18n } from '@/lib/i18n-context';

type LocaleCode = 'en' | 'es' | 'sv';

interface ResearchContact {
    id: number;
    code: string;
    name: string;
    email: string | null;
    institution: string | null;
    is_active: boolean;
}

interface PlanResearcher {
    id: number;
    research_contact_id: number | null;
    external_name: string | null;
    name: string;
    email: string | null;
    institution: string | null;
}

interface AdministrationPlan {
    id: number;
    code: string;
    title: string;
    instrument_code: string;
    locale: LocaleCode;
    scheduled_at: string | null;
    location: string | null;
    notes: string | null;
    status: string;
    created_at: string;
    updated_at: string | null;
    researchers: PlanResearcher[];
    responses_count: number;
}

type FormState = {
    title: string;
    instrument_code: string;
    locale: LocaleCode;
    scheduled_at: string;
    location: string;
    notes: string;
    status: string;
    contact_ids: number[];
    external_researchers: string;
};

const EMPTY: FormState = {
    title: '',
    instrument_code: 'QSA',
    locale: 'en',
    scheduled_at: '',
    location: '',
    notes: '',
    status: 'planned',
    contact_ids: [],
    external_researchers: '',
};

const LANDING_BASE = process.env.NEXT_PUBLIC_AI4AUTH_BASE || 'https://auth.ai4educ.org';
const INSTRUMENTS = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP'];
const LOCALES: { value: LocaleCode; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'sv', label: 'Svenska' },
];
const STATUSES = ['planned', 'active', 'completed', 'archived'];

function optional(value: string) {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDateTime(value: string | null) {
    if (!value) return '';
    return new Date(value).toLocaleString('it-IT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function toDateTimeLocal(value: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toApiDateTime(value: string) {
    return value ? new Date(value).toISOString() : null;
}

function QrThumb({ value, size = 88 }: { value: string; size?: number }) {
    const [src, setSrc] = useState('');
    useEffect(() => {
        let active = true;
        QRCode.toDataURL(value, { width: size * 2, margin: 1 })
            .then((url) => { if (active) setSrc(url); })
            .catch(() => { if (active) setSrc(''); });
        return () => { active = false; };
    }, [value, size]);
    if (!src) return <div style={{ width: size, height: size }} className="shrink-0 rounded-md border border-slate-200 bg-slate-50" />;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="QR" width={size} height={size} className="shrink-0 rounded-md border border-slate-200 bg-white" />;
}

export function AdministrationPlansPanel() {
    const { t } = useI18n();
    const [plans, setPlans] = useState<AdministrationPlan[]>([]);
    const [contacts, setContacts] = useState<ResearchContact[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [message, setMessage] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [query, setQuery] = useState('');

    const refresh = useCallback(async () => {
        setLoading(true);
        setMessage('');
        try {
            const [plansRes, contactsRes] = await Promise.all([
                fetch('/api/admin/administration-plans'),
                fetch('/api/admin/research-contacts'),
            ]);
            if (plansRes.status === 401 || plansRes.status === 403) {
                window.location.href = '/';
                return;
            }
            if (!plansRes.ok) throw new Error('plans load failed');
            if (!contactsRes.ok) throw new Error('contacts load failed');
            setPlans(await plansRes.json());
            setContacts(await contactsRes.json());
        } catch (e) {
            console.error('Failed to load administration plans', e);
            setMessage(t('admin.ap.error.load'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const filteredPlans = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return plans;
        return plans.filter((plan) => [
            plan.title,
            plan.code,
            plan.instrument_code,
            plan.locale,
            plan.location || '',
            plan.researchers.map((researcher) => researcher.name).join(' '),
        ].some((value) => value.toLowerCase().includes(q)));
    }, [plans, query]);

    const activeContacts = useMemo(
        () => contacts.filter((contact) => contact.is_active),
        [contacts],
    );

    const stats = useMemo(() => ({
        total: plans.length,
        active: plans.filter((plan) => plan.status === 'active' || plan.status === 'planned').length,
        responses: plans.reduce((sum, plan) => sum + plan.responses_count, 0),
    }), [plans]);

    const collectionUrl = (plan: AdministrationPlan) => {
        const q = new URLSearchParams({
            study: plan.code,
            instrument: plan.instrument_code,
            locale: plan.locale,
        });
        return `${LANDING_BASE}/avvio?${q.toString()}`;
    };

    const startNew = () => {
        setForm(EMPTY);
        setEditingId('new');
        setMessage('');
    };

    const startEdit = (plan: AdministrationPlan) => {
        setForm({
            title: plan.title,
            instrument_code: plan.instrument_code,
            locale: plan.locale,
            scheduled_at: toDateTimeLocal(plan.scheduled_at),
            location: plan.location || '',
            notes: plan.notes || '',
            status: plan.status,
            contact_ids: plan.researchers
                .map((researcher) => researcher.research_contact_id)
                .filter((id): id is number => typeof id === 'number'),
            external_researchers: plan.researchers
                .filter((researcher) => !researcher.research_contact_id && researcher.external_name)
                .map((researcher) => researcher.external_name)
                .join('\n'),
        });
        setEditingId(plan.id);
        setMessage('');
    };

    const cancel = () => {
        setEditingId(null);
        setForm(EMPTY);
        setMessage('');
    };

    const toggleContact = (contactId: number) => {
        setForm((previous) => ({
            ...previous,
            contact_ids: previous.contact_ids.includes(contactId)
                ? previous.contact_ids.filter((id) => id !== contactId)
                : [...previous.contact_ids, contactId],
        }));
    };

    const save = async () => {
        if (!form.title.trim()) {
            setMessage(t('admin.ap.error.titleRequired'));
            return;
        }
        setSaving(true);
        setMessage('');
        const external = form.external_researchers
            .split('\n')
            .map((row) => row.trim())
            .filter(Boolean);
        const body = {
            title: form.title.trim(),
            instrument_code: form.instrument_code,
            locale: form.locale,
            scheduled_at: toApiDateTime(form.scheduled_at),
            location: optional(form.location),
            notes: optional(form.notes),
            status: form.status,
            researchers: [
                ...form.contact_ids.map((id) => ({ research_contact_id: id })),
                ...external.map((name) => ({ external_name: name })),
            ],
        };
        try {
            const url = editingId === 'new' ? '/api/admin/administration-plans' : `/api/admin/administration-plans/${editingId}`;
            const method = editingId === 'new' ? 'POST' : 'PUT';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(await res.text());
            cancel();
            await refresh();
        } catch (e) {
            console.error('Failed to save administration plan', e);
            setMessage(t('admin.ap.error.save'));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (plan: AdministrationPlan) => {
        if (!window.confirm(t('admin.ap.confirmDelete', { title: plan.title }))) return;
        setMessage('');
        try {
            const res = await fetch(`/api/admin/administration-plans/${plan.id}`, { method: 'DELETE' });
            if (res.status === 409) {
                setMessage(t('admin.ap.error.deleteHasResponses'));
                return;
            }
            if (!res.ok) throw new Error('delete failed');
            await refresh();
        } catch (e) {
            console.error('Failed to delete administration plan', e);
            setMessage(t('admin.ap.error.delete'));
        }
    };

    const copy = async (key: string, text: string) => {
        if (!navigator.clipboard) {
            setMessage(t('admin.rc.error.clipboard'));
            return;
        }
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600);
    };

    const downloadQr = async (plan: AdministrationPlan) => {
        try {
            const dataUrl = await QRCode.toDataURL(collectionUrl(plan), { width: 1024, margin: 1 });
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `qr-${plan.code}-${plan.instrument_code}-${plan.locale}.png`;
            a.click();
        } catch (e) {
            console.error('QR generation failed', e);
            setMessage(t('admin.rc.error.qr'));
        }
    };

    const openHandoutPdf = async (plan: AdministrationPlan) => {
        const url = collectionUrl(plan);
        let qrDataUrl = '';
        try {
            qrDataUrl = await QRCode.toDataURL(url, { width: 1024, margin: 1 });
        } catch (e) {
            console.error('QR generation failed', e);
            setMessage(t('admin.rc.error.qr'));
            return;
        }
        const win = window.open('', '_blank');
        if (!win) {
            setMessage(t('admin.rc.error.popup'));
            return;
        }
        const researcherLine = plan.researchers.map((researcher) => researcher.name).filter(Boolean).join(' · ');
        const html = `<!doctype html><html lang="${plan.locale}"><head><meta charset="utf-8">
<title>${escapeHtml(t('admin.ap.pdf.title'))} - ${escapeHtml(plan.code)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:0;padding:32px}
  .sheet{max-width:680px;margin:0 auto}
  .badge{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#4338ca;background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:3px 10px}
  h1{font-size:24px;margin:14px 0 4px}.intro{color:#475569;margin:0 0 20px}
  .row{display:flex;gap:24px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:18px}
  .qr{width:180px;height:180px}.meta{flex:1;min-width:0}
  .label{font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-top:10px}
  .code{font-size:30px;font-weight:800;letter-spacing:.08em;color:#3730a3;margin:2px 0}
  .value{font-size:14px;color:#334155;margin:2px 0}.link{font-family:monospace;font-size:12px;word-break:break-all;color:#334155}
  .note{margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:12px;color:#64748b}
  @media print{body{padding:0}.row{break-inside:avoid}}
</style></head><body><div class="sheet">
  <span class="badge">${escapeHtml(plan.instrument_code)} · ${escapeHtml(plan.locale.toUpperCase())}</span>
  <h1>${escapeHtml(plan.title)}</h1>
  <p class="intro">${escapeHtml(t('admin.ap.pdf.intro'))}</p>
  <div class="row">
    <img class="qr" src="${qrDataUrl}" alt="QR">
    <div class="meta">
      <div class="label">${escapeHtml(t('admin.ap.code'))}</div>
      <div class="code">${escapeHtml(plan.code)}</div>
      ${plan.scheduled_at ? `<div class="label">${escapeHtml(t('admin.ap.date'))}</div><div class="value">${escapeHtml(formatDateTime(plan.scheduled_at))}</div>` : ''}
      ${plan.location ? `<div class="label">${escapeHtml(t('admin.ap.location'))}</div><div class="value">${escapeHtml(plan.location)}</div>` : ''}
      <div class="label">${escapeHtml(t('admin.rc.cardText.link'))}</div>
      <div class="link">${escapeHtml(url)}</div>
    </div>
  </div>
  ${researcherLine ? `<div class="note"><strong>${escapeHtml(t('admin.ap.researchers'))}:</strong> ${escapeHtml(researcherLine)}</div>` : ''}
  ${plan.notes ? `<div class="note"><strong>${escapeHtml(t('admin.ap.notes'))}:</strong> ${escapeHtml(plan.notes)}</div>` : ''}
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`;
        win.document.open();
        win.document.write(html);
        win.document.close();
    };

    const inputCls = 'mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400';

    const renderForm = () => (
        <section className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="space-y-4">
                <label className="block text-xs font-semibold uppercase text-slate-500">
                    {t('admin.ap.form.title')}
                    <input
                        className={inputCls}
                        value={form.title}
                        onChange={(event) => setForm({ ...form, title: event.target.value })}
                    />
                </label>

                <section className="rounded-md border border-slate-200 bg-white p-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('admin.ap.section.details')}</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <label className="text-xs font-semibold uppercase text-slate-500">
                            {t('admin.ap.instrument')}
                            <select className={inputCls} value={form.instrument_code} onChange={(event) => setForm({ ...form, instrument_code: event.target.value })}>
                                {INSTRUMENTS.map((instrument) => <option key={instrument} value={instrument}>{instrument}</option>)}
                            </select>
                        </label>
                        <label className="text-xs font-semibold uppercase text-slate-500">
                            {t('admin.ap.language')}
                            <select className={inputCls} value={form.locale} onChange={(event) => setForm({ ...form, locale: event.target.value as LocaleCode })}>
                                {LOCALES.map((locale) => <option key={locale.value} value={locale.value}>{locale.label}</option>)}
                            </select>
                        </label>
                        <label className="text-xs font-semibold uppercase text-slate-500">
                            {t('admin.ap.status')}
                            <select className={inputCls} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                                {STATUSES.map((status) => <option key={status} value={status}>{t(`admin.ap.status.${status}`)}</option>)}
                            </select>
                        </label>
                    </div>
                </section>

                <section className="rounded-md border border-slate-200 bg-white p-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('admin.ap.section.schedule')}</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <label className="text-xs font-semibold uppercase text-slate-500">
                            {t('admin.ap.date')}
                            <input className={inputCls} type="datetime-local" value={form.scheduled_at} onChange={(event) => setForm({ ...form, scheduled_at: event.target.value })} />
                        </label>
                        <label className="text-xs font-semibold uppercase text-slate-500">
                            {t('admin.ap.location')}
                            <input className={inputCls} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
                        </label>
                    </div>
                </section>

                <section className="rounded-md border border-slate-200 bg-white p-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('admin.ap.section.researchers')}</h3>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        <section>
                            <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.ap.contacts')}</p>
                            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
                                {activeContacts.map((contact) => (
                                    <label key={contact.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                                        <input
                                            type="checkbox"
                                            checked={form.contact_ids.includes(contact.id)}
                                            onChange={() => toggleContact(contact.id)}
                                            className="mt-1 accent-indigo-600"
                                        />
                                        <span>
                                            <span className="font-medium">{contact.name}</span>
                                            <span className="block text-xs text-slate-400">
                                                {[contact.institution, contact.email, contact.code].filter(Boolean).join(' · ')}
                                            </span>
                                        </span>
                                    </label>
                                ))}
                                {activeContacts.length === 0 && <p className="text-sm text-slate-400">{t('admin.ap.noContacts')}</p>}
                            </div>
                        </section>
                        <label className="block text-xs font-semibold uppercase text-slate-500">
                            {t('admin.ap.externalResearchers')}
                            <textarea
                                className="mt-1 min-h-[160px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400"
                                value={form.external_researchers}
                                onChange={(event) => setForm({ ...form, external_researchers: event.target.value })}
                                placeholder={t('admin.ap.externalResearchersPlaceholder')}
                            />
                        </label>
                    </div>
                </section>

                <section className="rounded-md border border-slate-200 bg-white p-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('admin.ap.section.notes')}</h3>
                    <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                        {t('admin.ap.notes')}
                        <textarea
                            className="mt-1 min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400"
                            value={form.notes}
                            onChange={(event) => setForm({ ...form, notes: event.target.value })}
                        />
                    </label>
                </section>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    <Check className="h-4 w-4" />
                    {t('admin.ap.save')}
                </button>
                <button
                    type="button"
                    onClick={cancel}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                    <X className="h-4 w-4" />
                    {t('admin.ap.cancel')}
                </button>
            </div>
        </section>
    );

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">{t('admin.ap.title')}</h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500">{t('admin.ap.subtitle')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void refresh()}
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            {t('admin.ap.refresh')}
                        </button>
                        {editingId === null && (
                            <button
                                type="button"
                                onClick={startNew}
                                className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
                            >
                                <Plus className="h-4 w-4" />
                                {t('admin.ap.new')}
                            </button>
                        )}
                    </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.ap.stats.total')}</p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.ap.stats.active')}</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.active}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.ap.stats.responses')}</p>
                        <p className="mt-1 text-2xl font-bold text-indigo-700">{stats.responses}</p>
                    </div>
                </div>
            </section>

            {editingId === 'new' && renderForm()}
            {message && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}

            {!loading && plans.length > 0 && (
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('admin.ap.searchPlaceholder')}
                        className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
                    />
                </div>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
                {loading && (
                    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400 xl:col-span-2">
                        {t('admin.ap.loading')}
                    </section>
                )}
                {!loading && plans.length === 0 && editingId !== 'new' && (
                    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400 xl:col-span-2">
                        {t('admin.ap.empty')}
                    </section>
                )}
                {!loading && plans.length > 0 && filteredPlans.length === 0 && (
                    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400 xl:col-span-2">
                        {t('admin.ap.noResults')}
                    </section>
                )}
                {filteredPlans.map((plan) => (
                    editingId === plan.id ? (
                        <div key={plan.id} className="xl:col-span-2">{renderForm()}</div>
                    ) : (
                        <section key={plan.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-base font-bold text-slate-900">{plan.title}</h3>
                                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                            {plan.instrument_code} · {plan.locale.toUpperCase()}
                                        </span>
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                            {t(`admin.ap.status.${plan.status}`)}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-400">{t('admin.ap.createdOn')} {formatDateTime(plan.created_at)}</p>
                                </div>
                                <div className="flex gap-1">
                                    <button type="button" onClick={() => startEdit(plan)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title={t('admin.ap.action.edit')}>
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button type="button" onClick={() => void remove(plan)} className="rounded-md p-2 text-red-500 hover:bg-red-50" title={t('admin.ap.action.delete')}>
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 rounded-md border border-indigo-200 bg-indigo-50 p-3">
                                <p className="text-xs font-semibold uppercase text-indigo-700">{t('admin.ap.code')}</p>
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <code className="w-full rounded-md border border-indigo-200 bg-white px-3 py-2 text-lg font-bold tracking-wide text-indigo-900">
                                        {plan.code}
                                    </code>
                                    <button
                                        type="button"
                                        onClick={() => void copy(`code-${plan.id}`, plan.code)}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-indigo-200 bg-white px-3 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
                                    >
                                        {copiedKey === `code-${plan.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        {t('admin.rc.action.code')}
                                    </button>
                                </div>
                                <p className="mt-2 text-xs text-indigo-900">{t('admin.ap.codeHint')}</p>
                            </div>

                            <div className="mt-4 grid gap-2 text-sm text-slate-600">
                                {plan.scheduled_at && (
                                    <div className="flex items-center gap-2">
                                        <CalendarDays className="h-4 w-4 text-slate-400" />
                                        {formatDateTime(plan.scheduled_at)}
                                    </div>
                                )}
                                {plan.location && (
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-slate-400" />
                                        {plan.location}
                                    </div>
                                )}
                                {plan.researchers.length > 0 && (
                                    <div className="flex items-start gap-2">
                                        <Users className="mt-0.5 h-4 w-4 text-slate-400" />
                                        <span>{plan.researchers.map((researcher) => researcher.name).join(', ')}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-slate-400" />
                                    {t('admin.ap.responses')}: {plan.responses_count}
                                </div>
                            </div>

                            {plan.notes && (
                                <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
                                    {plan.notes}
                                </p>
                            )}

                            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-start gap-3">
                                    <QrThumb value={collectionUrl(plan)} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.ap.linkLabel')} · {t('admin.rc.qrLabel')}</p>
                                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                            <input readOnly value={collectionUrl(plan)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-700" />
                                            <button
                                                type="button"
                                                onClick={() => void copy(`link-${plan.id}`, collectionUrl(plan))}
                                                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                            >
                                                {copiedKey === `link-${plan.id}` ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                                                {t('admin.rc.action.link')}
                                            </button>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void downloadQr(plan)}
                                                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                            >
                                                <QrCode className="h-4 w-4" />
                                                {t('admin.rc.action.qr')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void openHandoutPdf(plan)}
                                                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                            >
                                                <FileText className="h-4 w-4" />
                                                {t('admin.rc.action.pdf')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )
                ))}
            </div>
        </div>
    );
}
