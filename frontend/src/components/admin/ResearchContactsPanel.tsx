'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Check, Copy, Link2, Mail, Pencil, Phone, Plus, RefreshCw, Trash2, User, X } from 'lucide-react';

type LocaleCode = 'en' | 'es' | 'sv';

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

const INSTRUMENTS = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP'];
const LOCALES: { value: LocaleCode; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Espanol' },
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
    const [contacts, setContacts] = useState<ResearchContact[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [message, setMessage] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [origin, setOrigin] = useState('');
    const [linkInstrument, setLinkInstrument] = useState('QSA');
    const [linkLocale, setLinkLocale] = useState<LocaleCode>('en');

    useEffect(() => {
        setOrigin(window.location.origin);
    }, []);

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
            setMessage('Errore nel caricamento dei contatti ricercatori.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const activeCount = useMemo(() => contacts.filter((contact) => contact.is_active).length, [contacts]);

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
            setMessage('Inserisci almeno il nome del ricercatore.');
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
            setMessage('Errore nel salvataggio del contatto.');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (contact: ResearchContact) => {
        if (!window.confirm(`Eliminare il contatto di ${contact.name}?`)) return;
        setMessage('');
        try {
            const res = await fetch(`/api/admin/research-contacts/${contact.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('delete failed');
            await refresh();
        } catch (e) {
            console.error('Failed to delete research contact', e);
            setMessage("Errore durante l'eliminazione del contatto.");
        }
    };

    const collectionUrl = (contact: ResearchContact) => {
        const base = origin || '';
        return `${base}/somministrazione/${linkInstrument}/${linkLocale}?study=${encodeURIComponent(contact.code)}`;
    };

    const cardText = (contact: ResearchContact) => {
        const rows = [
            'Scheda somministrazione CounselorBot',
            `Ricercatore: ${contact.name}`,
            contact.institution ? `Ente: ${contact.institution}` : null,
            contact.email ? `Email: ${contact.email}` : null,
            contact.phone ? `Telefono: ${contact.phone}` : null,
            `Codice studio: ${contact.code}`,
            `Link: ${collectionUrl(contact)}`,
            'Usare questo codice nel campo Study code quando il questionario viene compilato.',
        ];
        return rows.filter(Boolean).join('\n');
    };

    const copy = async (key: string, text: string) => {
        if (!navigator.clipboard) {
            setMessage('Copia non disponibile in questo browser.');
            return;
        }
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600);
    };

    const inputCls = 'mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400';

    const renderForm = () => (
        <section className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <label className="text-xs font-semibold uppercase text-slate-500">
                    Nome ricercatore
                    <input className={inputCls} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                    Email
                    <input className={inputCls} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                    Telefono
                    <input className={inputCls} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                    Ente / istituzione
                    <input className={inputCls} value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} />
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                    Ruolo
                    <input className={inputCls} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} />
                </label>
                <label className="flex items-center gap-2 pt-6 text-sm font-medium text-slate-700">
                    <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
                    Contatto attivo
                </label>
            </div>
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                Note operative
                <textarea
                    className="mt-1 min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400"
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    placeholder="Gruppo, sede, vincoli di somministrazione o promemoria interni."
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
                    Salva
                </button>
                <button
                    type="button"
                    onClick={cancel}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                    <X className="h-4 w-4" />
                    Annulla
                </button>
            </div>
        </section>
    );

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Contatti ricercatori</h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500">
                            Referenti che somministrano i questionari sperimentali. Ogni scheda ha un codice studio da usare nella compilazione.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void refresh()}
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            Aggiorna
                        </button>
                        {editingId === null && (
                            <button
                                type="button"
                                onClick={startNew}
                                className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
                            >
                                <Plus className="h-4 w-4" />
                                Nuovo contatto
                            </button>
                        )}
                    </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-500">Contatti</p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">{contacts.length}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-500">Attivi</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-700">{activeCount}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase text-slate-500">Uso del codice</p>
                        <p className="mt-1 text-sm font-medium text-slate-700">Campo Study code / parametro study nel link</p>
                    </div>
                </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Link2 className="h-4 w-4 text-indigo-600" />
                    Link rapido per le schede
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold uppercase text-slate-500">
                        Strumento
                        <select className={inputCls} value={linkInstrument} onChange={(event) => setLinkInstrument(event.target.value)}>
                            {INSTRUMENTS.map((instrument) => <option key={instrument} value={instrument}>{instrument}</option>)}
                        </select>
                    </label>
                    <label className="text-xs font-semibold uppercase text-slate-500">
                        Lingua
                        <select className={inputCls} value={linkLocale} onChange={(event) => setLinkLocale(event.target.value as LocaleCode)}>
                            {LOCALES.map((locale) => <option key={locale.value} value={locale.value}>{locale.label}</option>)}
                        </select>
                    </label>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                    Il link viene generato per ogni scheda con il parametro <span className="font-mono">study=CODICE</span>. Se si usa un link diverso, far inserire manualmente lo stesso codice nel campo Study code.
                </p>
            </section>

            {editingId === 'new' && renderForm()}
            {message && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}

            <div className="grid gap-4 xl:grid-cols-2">
                {loading && (
                    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400 xl:col-span-2">
                        Caricamento...
                    </section>
                )}
                {!loading && contacts.length === 0 && editingId !== 'new' && (
                    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400 xl:col-span-2">
                        Nessun contatto ricercatore. Crea la prima scheda.
                    </section>
                )}
                {contacts.map((contact) => (
                    editingId === contact.id ? (
                        <div key={contact.id} className="xl:col-span-2">{renderForm()}</div>
                    ) : (
                        <section key={contact.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-base font-bold text-slate-900">{contact.name}</h3>
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${contact.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {contact.is_active ? 'Attivo' : 'Disattivato'}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-400">Creato il {formatDate(contact.created_at)}</p>
                                </div>
                                <div className="flex gap-1">
                                    <button type="button" onClick={() => startEdit(contact)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Modifica">
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button type="button" onClick={() => void remove(contact)} className="rounded-md p-2 text-red-500 hover:bg-red-50" title="Elimina">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 rounded-md border border-indigo-200 bg-indigo-50 p-3">
                                <p className="text-xs font-semibold uppercase text-indigo-700">Codice somministrazione</p>
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
                                        Codice
                                    </button>
                                </div>
                                <p className="mt-2 text-xs text-indigo-900">
                                    Da far usare nel campo Study code durante la compilazione del questionario.
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
                                <p className="text-xs font-semibold uppercase text-slate-500">Link con codice</p>
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                    <input readOnly value={collectionUrl(contact)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-700" />
                                    <button
                                        type="button"
                                        onClick={() => void copy(`link-${contact.id}`, collectionUrl(contact))}
                                        className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                        {copiedKey === `link-${contact.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        Link
                                    </button>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => void copy(`card-${contact.id}`, cardText(contact))}
                                className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                {copiedKey === `card-${contact.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                Copia scheda
                            </button>
                        </section>
                    )
                ))}
            </div>
        </div>
    );
}
