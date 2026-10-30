'use client';

// Il catalogo d'immagini del tavolo, lato amministrazione. Il caricamento e'
// un set: le immagini e il file CSV che le accompagna, con nome e utilizzo per
// ognuna. Un'immagine senza riga nel CSV entra lo stesso e resta segnalata
// qui, perche' il nome e l'utilizzo si completano dopo e non si perdono.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Save, Trash2, Upload } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { parseAdminTavoloImages, type AdminTavoloImage as AdminImage } from '@/lib/tavolo-images';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { Button } from '@/components/ui/Button';

interface UploadResult {
    created: number;
    unlisted: string[];
}

export function TavoloImagesPanel() {
    const { t } = useI18n();
    const [images, setImages] = useState<AdminImage[] | null>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<UploadResult | null>(null);
    const [error, setError] = useState('');
    const [drafts, setDrafts] = useState<Record<string, { name: string; usage: string }>>({});
    const [savedId, setSavedId] = useState('');
    const imageInput = useRef<HTMLInputElement>(null);
    const csvInput = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        setError('');
        try {
            const response = await fetch('/api/admin/tavolo-images');
            if (response.status === 401 || response.status === 403) { window.location.href = '/'; return; }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            setImages(parseAdminTavoloImages(await response.json()));
        } catch {
            setError(t('admin.tavoloImages.error.load'));
            setImages([]);
        }
    }, [t]);

    useEffect(() => { void load(); }, [load]);

    const upload = async () => {
        if (!files.length || !csvFile) return;
        setUploading(true); setError(''); setResult(null);
        try {
            const form = new FormData();
            files.forEach((file) => form.append('files', file));
            form.append('csv_file', csvFile);
            const response = await fetch('/api/admin/tavolo-images', { method: 'POST', body: form });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const body = await response.json() as UploadResult;
            setResult(body);
            setFiles([]); setCsvFile(null);
            if (imageInput.current) imageInput.current.value = '';
            if (csvInput.current) csvInput.current.value = '';
            await load();
        } catch {
            setError(t('admin.tavoloImages.error.upload'));
        } finally {
            setUploading(false);
        }
    };

    const patchDraft = (id: string, change: Partial<{ name: string; usage: string }>) =>
        setDrafts((previous) => ({ ...previous, [id]: { ...previous[id], ...change } }));

    const save = async (image: AdminImage) => {
        const draft = drafts[image.id];
        if (!draft) return;
        const response = await fetch(`/api/admin/tavolo-images/${encodeURIComponent(image.id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
        });
        if (response.ok) {
            setSavedId(image.id);
            await load();
        } else {
            setError(t('admin.tavoloImages.error.upload'));
        }
    };

    const [confirmDelete, setConfirmDelete] = useState<string | number | null>(null);
    const remove = async (image: AdminImage) => {
        const response = await fetch(`/api/admin/tavolo-images/${encodeURIComponent(image.id)}`, { method: 'DELETE' });
        if (response.ok) await load();
        else setError(t('admin.tavoloImages.error.load'));
    };

    if (images === null) return <div className="rounded-card border border-line bg-surface shadow-card p-6 text-sm text-ink-muted">{t('admin.tavoloImages.loading')}</div>;

    return (
        <div className="rounded-card border border-line bg-surface shadow-card space-y-4 p-6">
            <div className="flex items-start gap-4">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft">
                    <ImageIcon className="h-5 w-5 text-brand" aria-hidden="true" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-ink">{t('admin.tavoloImages.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm text-ink-muted">{t('admin.tavoloImages.subtitle')}</p>
                </div>
            </div>

            <fieldset className="rounded-control border border-line bg-surface p-4">
                <legend className="px-1 text-sm font-semibold text-ink">{t('admin.tavoloImages.upload')}</legend>
                <div className="mt-4 space-y-4">
                    <label className="block text-sm text-ink-body">
                        {t('admin.tavoloImages.imagesLabel')}
                        <input ref={imageInput} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                            className="mt-1 block w-full text-sm" />
                    </label>
                    <label className="block text-sm text-ink-body">
                        {t('admin.tavoloImages.csvLabel')}
                        <input ref={csvInput} type="file" accept=".csv,text/csv"
                            onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
                            className="mt-1 block w-full text-sm" />
                        <span className="mt-1 block text-xs text-ink-muted">{t('admin.tavoloImages.csvHint')}</span>
                    </label>
                    <Button type="button" onClick={() => void upload()} disabled={uploading || !files.length || !csvFile}>
                        <Upload className="h-4 w-4" aria-hidden="true" />{t('admin.tavoloImages.upload')}
                    </Button>
                </div>
                {result && (
                    <div className="mt-4 space-y-2 text-sm">
                        <p className="text-success">{t('admin.tavoloImages.created').replace('{n}', String(result.created))}</p>
                        {result.unlisted.length > 0 && (
                            <p className="rounded-control border border-warning-line bg-warning-soft p-4 text-warning-ink">
                                {t('admin.tavoloImages.unlisted').replace('{names}', result.unlisted.join(', '))}
                            </p>
                        )}
                    </div>
                )}
                {error && <p role="alert" className="mt-4 text-sm text-danger-ink">{error}</p>}
            </fieldset>

            {images.length === 0 ? (
                <p className="text-sm text-ink-muted">{t('admin.tavoloImages.empty')}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-line text-left text-xs text-ink-muted">
                                <th className="py-2 pr-4" aria-hidden="true"></th>
                                <th className="py-2 pr-4">{t('admin.tavoloImages.field.name')}</th>
                                <th className="py-2 pr-4">{t('admin.tavoloImages.field.usage')}</th>
                                <th className="py-2 pr-4">{t('admin.tavoloImages.field.file')}</th>
                                <th className="py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {images.map((image) => {
                                const draft = drafts[image.id] ?? { name: image.name, usage: image.usage };
                                const dirty = draft.name !== image.name || draft.usage !== image.usage;
                                return (
                                    <tr key={image.id} className="border-b border-line align-top">
                                        <td className="py-2 pr-4">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={image.url} alt="" width={48} height={48}
                                                className="h-12 w-12 rounded-control border border-line object-cover" />
                                        </td>
                                        <td className="py-2 pr-4">
                                            <input value={draft.name} maxLength={120}
                                                onChange={(event) => patchDraft(image.id, { name: event.target.value })}
                                                aria-label={`${t('admin.tavoloImages.field.name')} ${image.original_name}`}
                                                className="w-44 rounded-control border border-line px-2 py-1" />
                                        </td>
                                        <td className="py-2 pr-4">
                                            <input value={draft.usage} maxLength={2000}
                                                onChange={(event) => patchDraft(image.id, { usage: event.target.value })}
                                                aria-label={`${t('admin.tavoloImages.field.usage')} ${image.original_name}`}
                                                className="w-72 rounded-control border border-line px-2 py-1" />
                                        </td>
                                        <td className="py-2 pr-4 text-xs text-ink-muted">
                                            {image.original_name}
                                            <span className="block text-ink-muted">{image.created_by}</span>
                                        </td>
                                        <td className="py-2">
                                            <div className="flex items-center gap-2">
                                                <button type="button" onClick={() => void save(image)} disabled={!dirty}
                                                    className="min-h-control inline-flex items-center gap-1 rounded-control border border-line px-2 py-1 text-xs text-ink-body hover:bg-surface-sunken disabled:opacity-40">
                                                    <Save className="h-3.5 w-3.5" aria-hidden="true" />{t('admin.tavoloImages.save')}
                                                </button>
                                                {savedId === image.id && <span className="text-xs text-success">{t('admin.tavoloImages.saved')}</span>}
                                                {confirmDelete === image.id
                                                    ? <ConfirmInline question={`${t('admin.tavoloImages.delete')}: ${image.name}?`} onConfirm={() => { setConfirmDelete(null); void remove(image); }} onCancel={() => setConfirmDelete(null)} />
                                                    : <button type="button" onClick={() => setConfirmDelete(image.id)}
                                                          aria-label={`${t('admin.tavoloImages.delete')} ${image.name}`}
                                                          className="inline-flex min-h-control min-w-control items-center justify-center rounded-control border border-line p-2 text-ink-muted hover:bg-danger-soft hover:text-danger">
                                                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                      </button>}
                                            </div>
                                        </td>
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
