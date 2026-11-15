'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, FolderOpen, ImagePlus, Maximize2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import { toast } from '@/components/ui/Toast';
import { PortfolioTimelineLinks } from './PortfolioTimelineLinks';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { goalApi, GoalError, type PersonalGoal } from '@/lib/goals';
import { goalText } from '@/lib/i18n-goals';
import { Card } from '@/components/ui/Card';
import { Button, Spinner } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Dialog, DialogBody } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';

// In anteprima le <img> (non passano da fetch) devono puntare all'account di
// prova: il backend accetta l'impersonazione anche via query param view_as.
function imageQuerySuffix(): string {
    const account = getViewAsAccount();
    return account ? `?view_as=${account.username}` : '';
}

function evidenceMap(rows: PersonalGoal[]): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const goal of rows) {
        for (const link of goal.links) {
            if (link.kind === 'portfolio' && link.role === 'evidence') {
                (map[link.target_id] ??= []).push(goal.title);
            }
        }
    }
    return map;
}

interface PortfolioImage { id: string; filename?: string | null }

interface LightboxImage { src: string; alt: string }

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
    // F03 (lotto 1B): il caricamento fallito non è “nessun lavoro”.
    const [loadError, setLoadError] = useState(false);
    const [form, setForm] = useState<EditForm | null>(null);
    // F02 (lotto 1A): la X non cancella una bozza in silenzio.
    const [confirmingClose, setConfirmingClose] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    // Conferma di eliminazione in linea, al posto della finestra nativa.
    const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
    const [lightbox, setLightbox] = useState<LightboxImage | null>(null);
    // Chip «prova di: {titolo}» (C2) e righe obiettivo per il ponte dal contenuto (3A):
    // un solo /user/goals, mappato per target_id con le revisioni aggiornate.
    const [evidenceOf, setEvidenceOf] = useState<Record<string, string[]>>({});
    const [goals, setGoals] = useState<PersonalGoal[]>([]);
    // F13 (lotto 3A): «Collega a un obiettivo» anche dal contenuto. Un obiettivo
    // per volta, inline come ConfirmInline; il contratto di revisione resta quello
    // delle altre scritture obiettivo (409 → pannello riapribile con dati freschi).
    const [goalLinkFor, setGoalLinkFor] = useState<number | null>(null);
    const [goalChoice, setGoalChoice] = useState('');
    const [goalLinkBusy, setGoalLinkBusy] = useState(false);
    const [goalLinkError, setGoalLinkError] = useState('');
    useEffect(() => {
        let active = true;
        goalApi<PersonalGoal[]>('/user/goals').then((rows) => {
            if (!active) return;
            setGoals(rows);
            setEvidenceOf(evidenceMap(rows));
        }).catch(() => { if (active) { setEvidenceOf({}); setGoals([]); } });
        return () => { active = false; };
    }, []);
    useEffect(() => {
        if (window.location.hash.startsWith('#portfolio-')) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'center' });
    }, [items]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const params = new URLSearchParams();
            if (q.trim()) params.set('q', q.trim());
            if (categoryFilter) params.set('category', categoryFilter);
            const [itemsRes, catsRes] = await Promise.all([
                apiFetch(`/api/user/portfolio?${params.toString()}`),
                apiFetch('/api/user/portfolio/categories'),
            ]);
            // F03: su errore si conservano i lavori già mostrati invece di svuotare.
            if (!itemsRes.ok || !catsRes.ok) throw new Error('portfolio load failed');
            setItems(await itemsRes.json());
            setCategories(await catsRes.json());
        } catch (e) {
            console.error('Failed to load portfolio', e);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [q, categoryFilter]);

    useEffect(() => { void load(); }, [load]);

    const openImage = (image: LightboxImage) => setLightbox(image);

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
            const res = await apiFetch(
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
            toast.success(t('portfolio.saved'));
        } catch (e) {
            console.error('Failed to save portfolio item', e);
            toast.error(t('toast.error'));
        } finally {
            setSaving(false);
        }
    };

    const deleteItem = async (id: number) => {
        setConfirmingDelete(null);
        try {
            const res = await apiFetch(`/api/user/portfolio/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            if (form?.id === id) setForm(null);
            await load();
            toast.success(t('portfolio.deleted'));
        } catch (e) {
            console.error('Failed to delete portfolio item', e);
            toast.error(t('toast.error'));
        }
    };

    const linkToGoal = async (itemId: number) => {
        const goal = goals.find(row => row.id === Number(goalChoice));
        if (!goal) return;
        setGoalLinkBusy(true); setGoalLinkError('');
        try {
            const updated = await goalApi<PersonalGoal>(`/user/goals/${goal.id}/links`, 'POST',
                { kind: 'portfolio', target_id: String(itemId), role: 'evidence', revision: goal.revision });
            setGoals(previous => previous.map(row => row.id === updated.id ? updated : row));
            setEvidenceOf(previous => ({ ...previous, [itemId]: [...(previous[itemId] ?? []), updated.title] }));
            setGoalLinkFor(null); setGoalChoice('');
        } catch (e) {
            // 409: l'obiettivo è cambiato (revisione vecchia) — ricaricare le righe
            // risolve il prossimo tentativo senza dover uscire dalla pagina.
            if (e instanceof GoalError && e.status === 409) {
                setGoalLinkError(t('portfolio.linkConflict'));
                goalApi<PersonalGoal[]>('/user/goals').then(setGoals).catch(() => {});
            } else {
                setGoalLinkError(t('toast.error'));
            }
        } finally { setGoalLinkBusy(false); }
    };

    const uploadImage = async (file: File) => {
        if (!form?.id) return;
        setUploading(true);
        try {
            const data = new FormData();
            data.append('file', file);
            const res = await apiFetch(`/api/user/portfolio/${form.id}/images`, { method: 'POST', body: data });
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
            const res = await apiFetch(`/api/user/portfolio/${form.id}/images/${imageId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            const saved: PortfolioItem = await res.json();
            setForm(toForm(saved));
            await load();
        } catch (e) {
            console.error('Failed to delete image', e);
            toast.error(t('toast.error'));
        }
    };

    return (
        <Card as="section" variant="flat" className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-ink">
                        {t('portfolio.title')}
                    </h2>
                    <p className="mt-1 text-sm text-ink-muted">
                        {t('portfolio.subtitle')}
                    </p>
                </div>
                <Button
                    type="button"
                    onClick={() => setForm({ ...EMPTY_FORM })}>
                    <Plus className="h-4 w-4" />
                    {t('portfolio.new')}
                </Button>
            </div>

            {/* Ricerca + filtro categoria */}
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.4fr)]">
                <Field label={t('portfolio.search')}>
                    <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('portfolio.searchPlaceholder')} />
                </Field>
                <Field label={t('portfolio.category')}>
                    <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                        <option value="">{t('portfolio.all')}</option>
                        {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </Select>
                </Field>
            </div>

            {/* Form crea/modifica */}
            {form && (
                <div className="space-y-4 border-t border-line-strong pt-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-ink">{form.id ? t('portfolio.editTitle') : t('portfolio.newTitle')}</h3>
                        {confirmingClose ? <ConfirmInline question={t('portfolio.discardConfirm')} onConfirm={() => { setConfirmingClose(false); setForm(null); }} onCancel={() => setConfirmingClose(false)} /> : <button type="button" onClick={() => { const original = form.id ? items.find(item => item.id === form.id) : null; const dirty = Boolean(original ? original.title !== form.title || original.description !== form.description || original.category !== form.category || (original.item_date || '') !== form.item_date || original.link !== form.link : form.title.trim() || form.description.trim() || form.category.trim() || form.item_date || form.link); if (dirty) setConfirmingClose(true); else setForm(null); }} className="-my-2 inline-flex min-h-control min-w-control items-center justify-center text-ink-muted hover:text-ink" aria-label={t('common.close')}>
                            <X className="h-4 w-4" />
                        </button>}
                    </div>
                    <Field label={t('portfolio.field.title')}>
                        <Input value={form.title} onChange={(event) => setField('title', event.target.value)} />
                    </Field>
                    <Field label={t('portfolio.field.description')}>
                        <Textarea value={form.description} onChange={(event) => setField('description', event.target.value)} rows={3} className="resize-y" />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Field label={t('portfolio.field.category')}>
                            <Input value={form.category} onChange={(event) => setField('category', event.target.value)} placeholder={t('portfolio.field.categoryPlaceholder')} />
                        </Field>
                        <Field label={t('portfolio.field.date')}>
                            <Input type="date" value={form.item_date} onChange={(event) => setField('item_date', event.target.value)} />
                        </Field>
                        <Field label={t('portfolio.field.link')}>
                            <Input value={form.link} onChange={(event) => setField('link', event.target.value)} placeholder="https://" />
                        </Field>
                    </div>

                    {/* Immagini */}
                    <div className="space-y-2">
                        <span className="text-xs font-semibold text-ink-muted">{t('portfolio.images')}</span>
                        {!form.id ? (
                            <p className="text-xs text-ink-muted">{t('portfolio.saveFirst')}</p>
                        ) : (
                            <div className="flex flex-wrap gap-4">
                                {form.images.map((img) => (
                                    <div key={img.id} className="relative h-24 w-24 overflow-hidden rounded-card border border-line">
                                        <button
                                            type="button"
                                            onClick={() => openImage({
                                                src: `/api/user/portfolio/${form.id}/images/${img.id}${imageQuerySuffix()}`,
                                                alt: img.filename || t('portfolio.imageAlt'),
                                            })}
                                            className="group h-full w-full focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                                            aria-label={t('portfolio.openImage')}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={`/api/user/portfolio/${form.id}/images/${img.id}${imageQuerySuffix()}`} alt={img.filename || t('portfolio.imageAlt')} className="h-full w-full object-cover" />
                                            <span className="absolute inset-0 flex items-center justify-center bg-transparent text-ink-on-brand opacity-0 transition group-hover:bg-backdrop group-hover:opacity-100 group-focus-visible:bg-backdrop group-focus-visible:opacity-100">
                                                <Maximize2 className="h-5 w-5" aria-hidden="true" />
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void deleteImage(img.id)}
                                            className="absolute right-1 top-1 rounded-control bg-surface/90 p-1 text-danger hover:bg-surface"
                                            aria-label={t('portfolio.removeImage')}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-control border border-line-strong text-ink-muted hover:bg-surface-sunken disabled:opacity-50"
                                >
                                    {uploading ? <Spinner className="h-5 w-5" /> : <ImagePlus className="h-5 w-5" />}
                                    <span className="text-2xs font-semibold">{t('portfolio.addImage')}</span>
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

                    <Button
                        type="button"
                        onClick={() => void saveItem()}
                        disabled={saving || !form.title.trim()}>
                        {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                        {t('portfolio.save')}
                    </Button>
                </div>
            )}

            {/* Elenco lavori */}
            {loading ? (
                <div className="text-sm text-ink-muted">{t('portfolio.loading')}</div>
            ) : loadError ? (
                <Callout variant="danger">
                    <p>{t('portfolio.loadError')}</p>
                    <Button type="button" variant="secondary" className="mt-2" onClick={() => void load()}>{t('lp.retry')}</Button>
                </Callout>
            ) : items.length === 0 ? (
                <p className="text-sm text-ink-muted">
                    {q || categoryFilter ? t('portfolio.emptyFound') : t('portfolio.emptyYet')}
                </p>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((item) => (
                        <article key={item.id} id={`portfolio-${item.id}`} className="flex flex-col border-b border-line pb-4">
                            {item.images[0] ? (
                                <button
                                    type="button"
                                    onClick={() => openImage({
                                        src: `/api/user/portfolio/${item.id}/images/${item.images[0].id}${imageQuerySuffix()}`,
                                        alt: item.title,
                                    })}
                                    className="group relative h-32 w-full overflow-hidden rounded-control focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                                    aria-label={t('portfolio.openImage')}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={`/api/user/portfolio/${item.id}/images/${item.images[0].id}${imageQuerySuffix()}`} alt={item.title} className="h-full w-full object-cover" />
                                    <span className="absolute inset-0 flex items-center justify-center bg-transparent text-ink-on-brand opacity-0 transition group-hover:bg-backdrop group-hover:opacity-100 group-focus-visible:bg-backdrop group-focus-visible:opacity-100">
                                        <Maximize2 className="h-6 w-6" aria-hidden="true" />
                                    </span>
                                </button>
                            ) : (
                                <div className="flex h-32 w-full items-center justify-center rounded-control bg-surface-sunken text-ink-muted">
                                    <FolderOpen className="h-8 w-8" />
                                </div>
                            )}
                            <div className="flex flex-1 flex-col gap-1 pt-3">
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
                                    <div className="flex shrink-0 gap-1">
                                        <button type="button" onClick={() => setForm(toForm(item))} className="tap-icon rounded-control text-ink-muted hover:bg-surface-sunken hover:text-link" aria-label={t('portfolio.edit')}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button type="button" onClick={() => setConfirmingDelete(item.id)} className="tap-icon rounded-control text-ink-muted hover:bg-danger-soft hover:text-danger" aria-label={t('portfolio.delete')}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                                {confirmingDelete === item.id && (
                                    <ConfirmInline
                                        question={t('portfolio.confirmDelete')}
                                        onConfirm={() => void deleteItem(item.id)}
                                        onCancel={() => setConfirmingDelete(null)}
                                    />
                                )}
                                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                                    {item.category && <StatusBadge tone="info">{item.category}</StatusBadge>}
                                    {item.item_date && <span>{new Date(item.item_date).toLocaleDateString(lang)}</span>}
                                </div>
                                {(evidenceOf[String(item.id)] ?? []).length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        {(evidenceOf[String(item.id)] ?? []).map((title, index) => (
                                            <StatusBadge key={index} tone="success">
                                                {t('portfolio.evidenceOf', { title })}
                                            </StatusBadge>
                                        ))}
                                    </div>
                                )}
                                <div>
                                    <button type="button" onClick={() => { setGoalLinkFor(previous => previous === item.id ? null : item.id); setGoalChoice(''); setGoalLinkError(''); }}
                                        className="inline-flex min-h-control items-center gap-1 rounded-control px-2 text-xs font-semibold text-link underline hover:text-link "
                                        aria-expanded={goalLinkFor === item.id}>
                                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />{t('portfolio.linkToGoal')}
                                    </button>
                                    {goalLinkFor === item.id && (
                                        <div className="mt-2 space-y-2 border-t border-line pt-3">
                                            <Field label={goalText(lang, 'title')}>
                                                <Select value={goalChoice} onChange={e => setGoalChoice(e.target.value)}>
                                                    <option value="">—</option>
                                                    {goals.filter(row => row.status === 'active').map(row => <option key={row.id} value={row.id}>{row.title.slice(0, 120)}</option>)}
                                                </Select>
                                            </Field>
                                            {goalLinkError && <p role="alert" className="text-xs text-danger-ink">{goalLinkError}</p>}
                                            <div className="flex gap-2">
                                                <Button type="button" disabled={!goalChoice || goalLinkBusy} onClick={() => void linkToGoal(item.id)}>{t('portfolio.linkConfirm')}</Button>
                                                <Button type="button" variant="ghost" onClick={() => { setGoalLinkFor(null); setGoalChoice(''); setGoalLinkError(''); }}>{t('common.cancel')}</Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {item.description && <p className="mt-1 line-clamp-3 text-xs text-ink-muted">{item.description}</p>}
                                <PortfolioTimelineLinks itemId={item.id} description={item.description} locale={lang} />
                                {item.link && (
                                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="mt-auto pt-1 text-xs font-semibold text-link hover:underline">
                                        {t('portfolio.open')}
                                    </a>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            )}
            {lightbox && (
                <Dialog title={lightbox.alt} closeLabel={t('common.close')} onClose={() => setLightbox(null)} width="lg">
                    <DialogBody className="flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={lightbox.src} alt={lightbox.alt} className="block max-h-[70vh] max-w-full object-contain" />
                    </DialogBody>
                </Dialog>
            )}
        </Card>
    );
}
