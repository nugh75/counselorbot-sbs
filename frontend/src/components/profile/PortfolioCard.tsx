'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, ImagePlus, Loader2, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { getViewAsAccount } from '@/lib/auth';
import { toast } from '@/components/ui/Toast';

// In anteprima le <img> (non passano da fetch) devono puntare all'account di
// prova: il backend accetta l'impersonazione anche via query param view_as.
function imageQuerySuffix(): string {
    const account = getViewAsAccount();
    return account ? `?view_as=${account.username}` : '';
}

interface PortfolioImage { id: string; filename?: string | null }

interface PortfolioItem {
    id: number;
    title: string;
    description?: string | null;
    category?: string | null;
    item_date?: string | null;
    link?: string | null;
    images: PortfolioImage[];
    created_at: string;
    updated_at?: string | null;
}

interface EditForm {
    id: number | null;
    title: string;
    description: string;
    category: string;
    item_date: string;
    link: string;
    images: PortfolioImage[];
}

const EMPTY_FORM: EditForm = { id: null, title: '', description: '', category: '', item_date: '', link: '', images: [] };

function toForm(item: PortfolioItem): EditForm {
    return {
        id: item.id,
        title: item.title || '',
        description: item.description || '',
        category: item.category || '',
        item_date: item.item_date || '',
        link: item.link || '',
        images: item.images || [],
    };
}

export function PortfolioCard() {
    const { t, lang } = useI18n();
    const [items, setItems] = useState<PortfolioItem[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [q, setQ] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState<EditForm | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (q.trim()) params.set('q', q.trim());
            if (categoryFilter) params.set('category', categoryFilter);
            const [itemsRes, catsRes] = await Promise.all([
                fetch(`/api/user/portfolio?${params.toString()}`),
                fetch('/api/user/portfolio/categories'),
            ]);
            setItems(itemsRes.ok ? await itemsRes.json() : []);
            setCategories(catsRes.ok ? await catsRes.json() : []);
        } catch (e) {
            console.error('Failed to load portfolio', e);
        } finally {
            setLoading(false);
        }
    }, [q, categoryFilter]);

    useEffect(() => { void load(); }, [load]);

    const setField = (key: keyof EditForm, value: string) => {
        setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    };

    const saveItem = async () => {
        if (!form || !form.title.trim()) return;
        setSaving(true);
        try {
            const body = {
                title: form.title,
                description: form.description,
                category: form.category,
                item_date: form.item_date,
                link: form.link,
            };
            const res = await fetch(
                form.id ? `/api/user/portfolio/${form.id}` : '/api/user/portfolio',
                {
                    method: form.id ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                },
            );
            if (!res.ok) throw new Error('Save failed');
            const saved: PortfolioItem = await res.json();
            setForm(toForm(saved));
            await load();
            toast.success('Lavoro salvato.');
        } catch (e) {
            console.error('Failed to save portfolio item', e);
            toast.error(t('toast.error'));
        } finally {
            setSaving(false);
        }
    };

    const deleteItem = async (id: number) => {
        if (!window.confirm('Eliminare questo lavoro?')) return;
        try {
            const res = await fetch(`/api/user/portfolio/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            if (form?.id === id) setForm(null);
            await load();
            toast.success('Lavoro eliminato.');
        } catch (e) {
            console.error('Failed to delete portfolio item', e);
            toast.error(t('toast.error'));
        }
    };

    const uploadImage = async (file: File) => {
        if (!form?.id) return;
        setUploading(true);
        try {
            const data = new FormData();
            data.append('file', file);
            const res = await fetch(`/api/user/portfolio/${form.id}/images`, { method: 'POST', body: data });
            if (!res.ok) throw new Error('Upload failed');
            const saved: PortfolioItem = await res.json();
            setForm(toForm(saved));
            await load();
        } catch (e) {
            console.error('Failed to upload image', e);
            toast.error(t('toast.error'));
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const deleteImage = async (imageId: string) => {
        if (!form?.id) return;
        try {
            const res = await fetch(`/api/user/portfolio/${form.id}/images/${imageId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            const saved: PortfolioItem = await res.json();
            setForm(toForm(saved));
            await load();
        } catch (e) {
            console.error('Failed to delete image', e);
            toast.error(t('toast.error'));
        }
    };

    const inputClass = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';

    return (
        <section className="glass-panel p-5 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <FolderOpen className="h-5 w-5 text-indigo-600" />
                        Portfolio
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Raccogli i tuoi lavori: titolo, descrizione, categoria, data e immagini. Cerca per ritrovarli.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setForm({ ...EMPTY_FORM })}
                    className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                    <Plus className="h-4 w-4" />
                    Nuovo lavoro
                </button>
            </div>

            {/* Ricerca + filtro categoria */}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.4fr)]">
                <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cerca</span>
                    <div className="mt-1 flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
                        <Search className="h-4 w-4 text-slate-400" />
                        <input
                            value={q}
                            onChange={(event) => setQ(event.target.value)}
                            placeholder="Titolo, descrizione o categoria"
                            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        />
                    </div>
                </label>
                <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categoria</span>
                    <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={`${inputClass} bg-white`}>
                        <option value="">Tutte</option>
                        {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                </label>
            </div>

            {/* Form crea/modifica */}
            {form && (
                <div className="rounded-xl border border-indigo-100 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-800">{form.id ? 'Modifica lavoro' : 'Nuovo lavoro'}</h3>
                        <button type="button" onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600" aria-label="Chiudi">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Titolo</span>
                        <input value={form.title} onChange={(event) => setField('title', event.target.value)} className={inputClass} />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Descrizione</span>
                        <textarea value={form.description} onChange={(event) => setField('description', event.target.value)} rows={3} className={`${inputClass} resize-y`} />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categoria</span>
                            <input value={form.category} onChange={(event) => setField('category', event.target.value)} className={inputClass} placeholder="es. Scrittura, STEM" />
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data</span>
                            <input type="date" value={form.item_date} onChange={(event) => setField('item_date', event.target.value)} className={inputClass} />
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Link (opzionale)</span>
                            <input value={form.link} onChange={(event) => setField('link', event.target.value)} className={inputClass} placeholder="https://" />
                        </label>
                    </div>

                    {/* Immagini */}
                    <div className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Immagini</span>
                        {!form.id ? (
                            <p className="text-xs text-slate-400">Salva il lavoro per poter aggiungere immagini.</p>
                        ) : (
                            <div className="flex flex-wrap gap-3">
                                {form.images.map((img) => (
                                    <div key={img.id} className="relative h-24 w-24 overflow-hidden rounded-lg border border-slate-200">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`/api/user/portfolio/${form.id}/images/${img.id}${imageQuerySuffix()}`} alt={img.filename || 'immagine'} className="h-full w-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => void deleteImage(img.id)}
                                            className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-rose-500 hover:bg-white"
                                            aria-label="Rimuovi immagine"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:bg-slate-50 disabled:opacity-50"
                                >
                                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                                    <span className="text-[10px] font-semibold">Aggiungi</span>
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    className="hidden"
                                    onChange={(event) => { const f = event.target.files?.[0]; if (f) void uploadImage(f); }}
                                />
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => void saveItem()}
                        disabled={saving || !form.title.trim()}
                        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salva
                    </button>
                </div>
            )}

            {/* Elenco lavori */}
            {loading ? (
                <div className="text-sm text-slate-400">Caricamento portfolio...</div>
            ) : items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Nessun lavoro {q || categoryFilter ? 'trovato' : 'ancora'}. Aggiungine uno con &ldquo;Nuovo lavoro&rdquo;.
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((item) => (
                        <article key={item.id} className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
                            {item.images[0] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={`/api/user/portfolio/${item.id}/images/${item.images[0].id}${imageQuerySuffix()}`} alt={item.title} className="h-32 w-full object-cover" />
                            ) : (
                                <div className="flex h-32 w-full items-center justify-center bg-slate-50 text-slate-300">
                                    <FolderOpen className="h-8 w-8" />
                                </div>
                            )}
                            <div className="flex flex-1 flex-col gap-1 p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="text-sm font-bold text-slate-800">{item.title}</h3>
                                    <div className="flex shrink-0 gap-1">
                                        <button type="button" onClick={() => setForm(toForm(item))} className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-indigo-600" aria-label="Modifica">
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button type="button" onClick={() => void deleteItem(item.id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Elimina">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                                    {item.category && <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-600">{item.category}</span>}
                                    {item.item_date && <span>{new Date(item.item_date).toLocaleDateString(lang)}</span>}
                                </div>
                                {item.description && <p className="mt-1 line-clamp-3 text-xs text-slate-500">{item.description}</p>}
                                {item.link && (
                                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="mt-auto pt-1 text-xs font-semibold text-indigo-600 hover:underline">
                                        Apri il lavoro
                                    </a>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}
