'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Check, Copy, FileText, Link2, Mail, Pencil, Phone, Plus, QrCode, RefreshCw, Search, Trash2, User, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useI18n } from '@/lib/i18n-context';

type LocaleCode = 'en' | 'es' | 'sv';

// Testi della scheda PDF/QR consegnata allo studente: nella lingua del questionario
// (linkLocale), non in quella dell'interfaccia admin.
const HANDOUT_COPY: Record<LocaleCode, {
    title: string; intro: string; instrumentLabel: string; codeLabel: string; codeHint: string;
    linkLabel: string; stepsTitle: string; step1: string; step2: string; step3: string; step4: string; contactLabel: string;
}> = {
    en: {
        title: 'CounselorBot questionnaire',
        intro: 'Scan the QR code or open the link to start the questionnaire.',
        instrumentLabel: 'Instrument',
        codeLabel: 'Study code',
        codeHint: 'Enter this code in the "Study code" field when you start.',
        linkLabel: 'Link',
        stepsTitle: 'How to take part',
        step1: 'Scan the QR code with your phone camera, or open the link in a browser.',
        step2: 'If asked, choose your language.',
        step3: 'Enter the study code shown above in the "Study code" field.',
        step4: 'Answer all the questions honestly. There are no right or wrong answers.',
        contactLabel: 'Contact',
    },
    es: {
        title: 'Cuestionario de CounselorBot',
        intro: 'Escanea el código QR o abre el enlace para comenzar el cuestionario.',
        instrumentLabel: 'Instrumento',
        codeLabel: 'Study code',
        codeHint: 'Introduce este código en el campo "Study code" cuando empieces.',
        linkLabel: 'Enlace',
        stepsTitle: '¿Cómo participar?',
        step1: 'Escanea el código QR con la cámara de tu teléfono, o abre el enlace en un navegador.',
        step2: 'Si te lo piden, selecciona tu idioma.',
        step3: 'Introduce el código de estudio que se muestra arriba en el campo "Study code".',
        step4: 'Responde todas las preguntas con honestidad. No hay respuestas correctas o incorrectas.',
        contactLabel: 'Contacto',
    },
    sv: {
        title: 'CounselorBot frågeformulär',
        intro: 'Skanna QR-koden eller öppna länken för att påbörja frågeformuläret.',
        instrumentLabel: 'Instrument',
        codeLabel: 'Study code',
        codeHint: 'Ange denna kod i fältet "Study code" när du startar.',
        linkLabel: 'Länk',
        stepsTitle: 'Hur du deltar',
        step1: 'Skanna QR-koden med din telefonkamera, eller öppna länken i en webbläsare.',
        step2: 'Om det efterfrågas, välj ditt språk.',
        step3: 'Ange studie-koden som visas ovan i fältet "Study code".',
        step4: 'Svara på alla frågor ärligt. Det finns inga rätt eller fel svar.',
        contactLabel: 'Kontakt',
    },
};

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Miniatura QR generata client-side dal valore (link con codice studio).
function QrThumb({ value, size = 96 }: { value: string; size?: number }) {
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

interface ResearchContact {
    id: number;
    code: string;
    name: string;
    email: string | null;
    phone: string | null;
    institution: string | null;
    role: string | null;
    notes: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
}

type FormState = {
    name: string;
    email: string;
    phone: string;
    institution: string;
    role: string;
    notes: string;
    is_active: boolean;
};

const EMPTY: FormState = {
    name: '',
    email: '',
    phone: '',
    institution: '',
    role: '',
    notes: '',
    is_active: true,
};

// Host pubblico ai4auth che serve la landing /avvio (configurabile via env).
const LANDING_BASE = process.env.NEXT_PUBLIC_AI4AUTH_BASE || 'https://auth.ai4educ.org';

const INSTRUMENTS = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP'];
const LOCALES: { value: LocaleCode; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'sv', label: 'Svenska' },
];

function optional(value: string) {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function ResearchContactsPanel() {
    const { t } = useI18n();
    const [contacts, setContacts] = useState<ResearchContact[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [message, setMessage] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [linkInstrument, setLinkInstrument] = useState('QSA');
    const [linkLocale, setLinkLocale] = useState<LocaleCode>('en');
    const [query, setQuery] = useState('');

    const refresh = useCallback(async () => {
        setLoading(true);
        setMessage('');
        try {
            const res = await fetch('/api/admin/research-contacts');
            if (res.status === 401 || res.status === 403) {
                window.location.href = '/';
                return;
            }
            if (!res.ok) throw new Error('load failed');
            setContacts(await res.json());
        } catch (e) {
            console.error('Failed to load research contacts', e);
            setMessage(t('admin.rc.error.load'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const activeCount = useMemo(() => contacts.filter((contact) => contact.is_active).length, [contacts]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return contacts;
        return contacts.filter((c) => [c.name, c.email, c.code, c.institution, c.role]
            .some((v) => (v || '').toLowerCase().includes(q)));
    }, [contacts, query]);

    const startNew = () => {
        setForm(EMPTY);
        setEditingId('new');
        setMessage('');
    };

    const startEdit = (contact: ResearchContact) => {
        setForm({
            name: contact.name,
            email: contact.email || '',
            phone: contact.phone || '',
            institution: contact.institution || '',
            role: contact.role || '',
            notes: contact.notes || '',
            is_active: contact.is_active,
        });
        setEditingId(contact.id);
        setMessage('');
    };

    const cancel = () => {
        setEditingId(null);
        setForm(EMPTY);
        setMessage('');
    };

    const save = async () => {
        if (!form.name.trim()) {
            setMessage(t('admin.rc.error.nameRequired'));
            return;
        }
        setSaving(true);
        setMessage('');
        try {
            const body = {
                name: form.name.trim(),
                email: optional(form.email),
                phone: optional(form.phone),
                institution: optional(form.institution),
                role: optional(form.role),
                notes: optional(form.notes),
                is_active: form.is_active,
            };
            const url = editingId === 'new' ? '/api/admin/research-contacts' : `/api/admin/research-contacts/${editingId}`;
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
            console.error('Failed to save research contact', e);
            setMessage(t('admin.rc.error.save'));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (contact: ResearchContact) => {
        if (!window.confirm(t('admin.rc.confirmDelete', { name: contact.name }))) return;
        setMessage('');
        try {
            const res = await fetch(`/api/admin/research-contacts/${contact.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('delete failed');
            await refresh();
        } catch (e) {
            console.error('Failed to delete research contact', e);
            setMessage(t('admin.rc.error.delete'));
        }
    };

    // Link da condividere con gli studenti: la landing pubblica su ai4auth
    // (spiegazioni + login + servizi), che poi rimanda al questionario.
    const collectionUrl = (contact: ResearchContact) => {
        const q = new URLSearchParams({
            study: contact.code,
            instrument: linkInstrument,
            locale: linkLocale,
        });
        if (contact.name) q.set('rname', contact.name);
        if (contact.email) q.set('remail', contact.email);
        if (contact.institution) q.set('rinst', contact.institution);
        return `${LANDING_BASE}/avvio?${q.toString()}`;
    };

    const cardText = (contact: ResearchContact) => {
        const rows = [
            t('admin.rc.cardText.title'),
            `${t('admin.rc.cardText.researcher')}: ${contact.name}`,
            contact.institution ? `${t('admin.rc.cardText.institution')}: ${contact.institution}` : null,
            contact.email ? `${t('admin.rc.cardText.email')}: ${contact.email}` : null,
            contact.phone ? `${t('admin.rc.cardText.phone')}: ${contact.phone}` : null,
            `${t('admin.rc.cardText.studyCode')}: ${contact.code}`,
            `${t('admin.rc.cardText.link')}: ${collectionUrl(contact)}`,
            t('admin.rc.cardText.hint'),
        ];
        return rows.filter(Boolean).join('\n');
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

    const downloadQr = async (contact: ResearchContact) => {
        try {
            const dataUrl = await QRCode.toDataURL(collectionUrl(contact), { width: 1024, margin: 1 });
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `qr-${contact.code}-${linkInstrument}-${linkLocale}.png`;
            a.click();
        } catch (e) {
            console.error('QR generation failed', e);
            setMessage(t('admin.rc.error.qr'));
        }
    };

    const openHandoutPdf = async (contact: ResearchContact) => {
        const url = collectionUrl(contact);
        const h = HANDOUT_COPY[linkLocale];
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
        const contactLine = [contact.name, contact.institution, contact.email, contact.phone]
            .filter(Boolean).map((v) => escapeHtml(String(v))).join(' · ');
        const html = `<!doctype html><html lang="${linkLocale}"><head><meta charset="utf-8">
<title>${escapeHtml(h.title)} – ${escapeHtml(contact.code)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:0;padding:32px}
  .sheet{max-width:640px;margin:0 auto}
  .badge{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#4338ca;background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:3px 10px}
  h1{font-size:24px;margin:14px 0 4px} .intro{color:#475569;margin:0 0 20px}
  .row{display:flex;gap:24px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:18px}
  .qr{width:180px;height:180px} .meta{flex:1;min-width:0}
  .label{font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-top:10px}
  .code{font-size:30px;font-weight:800;letter-spacing:.08em;color:#3730a3;margin:2px 0}
  .hint{font-size:13px;color:#475569;margin:2px 0 0}
  .link{font-family:monospace;font-size:12px;word-break:break-all;color:#334155}
  ol{margin:8px 0 0;padding-left:20px;line-height:1.6} li{margin-bottom:4px}
  .contact{margin-top:20px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px}
  @media print{body{padding:0}.row{break-inside:avoid}}
</style></head><body><div class="sheet">
  <span class="badge">${escapeHtml(linkInstrument)} · ${escapeHtml(linkLocale.toUpperCase())}</span>
  <h1>${escapeHtml(h.title)}</h1>
  <p class="intro">${escapeHtml(h.intro)}</p>
  <div class="row">
    <img class="qr" src="${qrDataUrl}" alt="QR">
    <div class="meta">
      <div class="label">${escapeHtml(h.codeLabel)}</div>
      <div class="code">${escapeHtml(contact.code)}</div>
      <div class="hint">${escapeHtml(h.codeHint)}</div>
      <div class="label">${escapeHtml(h.linkLabel)}</div>
      <div class="link">${escapeHtml(url)}</div>
    </div>
  </div>
  <strong>${escapeHtml(h.stepsTitle)}</strong>
  <ol><li>${escapeHtml(h.step1)}</li><li>${escapeHtml(h.step2)}</li><li>${escapeHtml(h.step3)}</li><li>${escapeHtml(h.step4)}</li></ol>
  ${contactLine ? `<div class="contact">${escapeHtml(h.contactLabel)}: ${contactLine}</div>` : ''}
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
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <label className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.rc.form.name')}
                    <input className={inputCls} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.rc.form.email')}
                    <input className={inputCls} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.rc.form.phone')}
                    <input className={inputCls} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.rc.form.institution')}
                    <input className={inputCls} value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} />
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.rc.form.role')}
                    <input className={inputCls} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} />
                </label>
                <label className="flex items-center gap-2 pt-6 text-sm font-medium text-slate-700">
                    <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
                    {t('admin.rc.form.active')}
                </label>
            </div>
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                {t('admin.rc.form.notes')}
                <textarea
                    className="mt-1 min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400"
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    placeholder={t('admin.rc.form.notesPlaceholder')}
                />
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    <Check className="h-4 w-4" />
                    {t('admin.rc.save')}
                </button>
                <button
                    type="button"
                    onClick={cancel}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                    <X className="h-4 w-4" />
                    {t('admin.rc.cancel')}
                </button>
            </div>
        </section>
    );

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">{t('admin.rc.title')}</h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500">
                            {t('admin.rc.subtitle')}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void refresh()}
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            {t('admin.rc.refresh')}
                        </button>
                        {editingId === null && (
                            <button
                                type="button"
                                onClick={startNew}
                                className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
                            >
                                <Plus className="h-4 w-4" />
                                {t('admin.rc.new')}
                            </button>
                        )}
                    </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.rc.stats.total')}</p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">{contacts.length}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.rc.stats.active')}</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-700">{activeCount}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.rc.stats.codeUse')}</p>
                        <p className="mt-1 text-sm font-medium text-slate-700">{t('admin.rc.stats.codeUseValue')}</p>
                    </div>
                </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Link2 className="h-4 w-4 text-indigo-600" />
                    {t('admin.rc.quickLink.title')}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold uppercase text-slate-500">
                        {t('admin.rc.quickLink.instrument')}
                        <select className={inputCls} value={linkInstrument} onChange={(event) => setLinkInstrument(event.target.value)}>
                            {INSTRUMENTS.map((instrument) => <option key={instrument} value={instrument}>{instrument}</option>)}
                        </select>
                    </label>
                    <label className="text-xs font-semibold uppercase text-slate-500">
                        {t('admin.rc.quickLink.language')}
                        <select className={inputCls} value={linkLocale} onChange={(event) => setLinkLocale(event.target.value as LocaleCode)}>
                            {LOCALES.map((locale) => <option key={locale.value} value={locale.value}>{locale.label}</option>)}
                        </select>
                    </label>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                    {t('admin.rc.quickLink.hintBefore')} <span className="font-mono">study=CODICE</span>{t('admin.rc.quickLink.hintAfter')}
                </p>
            </section>

            {editingId === 'new' && renderForm()}
            {message && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}

            {!loading && contacts.length > 0 && (
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('admin.rc.searchPlaceholder')}
                        className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
                    />
                </div>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
                {loading && (
                    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400 xl:col-span-2">
                        {t('admin.rc.loading')}
                    </section>
                )}
                {!loading && contacts.length === 0 && editingId !== 'new' && (
                    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400 xl:col-span-2">
                        {t('admin.rc.empty')}
                    </section>
                )}
                {!loading && contacts.length > 0 && filtered.length === 0 && (
                    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400 xl:col-span-2">
                        {t('admin.rc.noResults')}
                    </section>
                )}
                {filtered.map((contact) => (
                    editingId === contact.id ? (
                        <div key={contact.id} className="xl:col-span-2">{renderForm()}</div>
                    ) : (
                        <section key={contact.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-base font-bold text-slate-900">{contact.name}</h3>
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${contact.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {contact.is_active ? t('admin.rc.status.active') : t('admin.rc.status.inactive')}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-400">{t('admin.rc.createdOn')} {formatDate(contact.created_at)}</p>
                                </div>
                                <div className="flex gap-1">
                                    <button type="button" onClick={() => startEdit(contact)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title={t('admin.rc.action.edit')}>
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button type="button" onClick={() => void remove(contact)} className="rounded-md p-2 text-red-500 hover:bg-red-50" title={t('admin.rc.action.delete')}>
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 rounded-md border border-indigo-200 bg-indigo-50 p-3">
                                <p className="text-xs font-semibold uppercase text-indigo-700">{t('admin.rc.card.codeLabel')}</p>
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <code className="w-full rounded-md border border-indigo-200 bg-white px-3 py-2 text-lg font-bold tracking-wide text-indigo-900">
                                        {contact.code}
                                    </code>
                                    <button
                                        type="button"
                                        onClick={() => void copy(`code-${contact.id}`, contact.code)}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-indigo-200 bg-white px-3 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
                                    >
                                        {copiedKey === `code-${contact.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        {t('admin.rc.action.code')}
                                    </button>
                                </div>
                                <p className="mt-2 text-xs text-indigo-900">
                                    {t('admin.rc.card.codeHint')}
                                </p>
                            </div>

                            <div className="mt-4 grid gap-2 text-sm text-slate-600">
                                {contact.role && (
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-slate-400" />
                                        {contact.role}
                                    </div>
                                )}
                                {contact.institution && (
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-4 w-4 text-slate-400" />
                                        {contact.institution}
                                    </div>
                                )}
                                {contact.email && (
                                    <div className="flex items-center gap-2">
                                        <Mail className="h-4 w-4 text-slate-400" />
                                        <a className="text-indigo-700 hover:text-indigo-900" href={`mailto:${contact.email}`}>{contact.email}</a>
                                    </div>
                                )}
                                {contact.phone && (
                                    <div className="flex items-center gap-2">
                                        <Phone className="h-4 w-4 text-slate-400" />
                                        {contact.phone}
                                    </div>
                                )}
                            </div>

                            {contact.notes && (
                                <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
                                    {contact.notes}
                                </p>
                            )}

                            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-start gap-3">
                                    <QrThumb value={collectionUrl(contact)} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.rc.card.linkLabel')} · {t('admin.rc.qrLabel')}</p>
                                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                            <input readOnly value={collectionUrl(contact)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-700" />
                                            <button
                                                type="button"
                                                onClick={() => void copy(`link-${contact.id}`, collectionUrl(contact))}
                                                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                            >
                                                {copiedKey === `link-${contact.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                                {t('admin.rc.action.link')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => void copy(`card-${contact.id}`, cardText(contact))}
                                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    {copiedKey === `card-${contact.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    {t('admin.rc.action.copyCard')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void downloadQr(contact)}
                                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    <QrCode className="h-4 w-4" />
                                    {t('admin.rc.action.qr')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void openHandoutPdf(contact)}
                                    className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
                                >
                                    <FileText className="h-4 w-4" />
                                    {t('admin.rc.action.pdf')}
                                </button>
                            </div>
                        </section>
                    )
                ))}
            </div>
        </div>
    );
}
