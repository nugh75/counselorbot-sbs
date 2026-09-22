'use client';

// Il catalogo d'immagini del tavolo, lato amministrazione. Il caricamento e'
// un set: le immagini e il file CSV che le accompagna, con nome e utilizzo per
// ognuna. Un'immagine senza riga nel CSV entra lo stesso e resta segnalata
// qui, perche' il nome e l'utilizzo si completano dopo e non si perdono.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Save, Trash2, Upload } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

interface AdminImage {
    id: string;
    name: string;
    usage: string;
    original_name: string;
    created_by: string;
    url: string;
}

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
            setImages(await response.json() as AdminImage[]);
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

    const remove = async (image: AdminImage) => {
        if (!window.confirm(`${t('admin.tavoloImages.delete')}: ${image.name}?`)) return;
        const response = await fetch(`/api/admin/tavolo-images/${encodeURIComponent(image.id)}`, { method: 'DELETE' });
        if (response.ok) await load();
        else setError(t('admin.tavoloImages.error.load'));
    };

    if (images === null) return <div className="glass-panel p-6 text-sm text-slate-500">{t('admin.tavoloImages.loading')}</div>;

    return (
        <div className="glass-panel space-y-5 p-6">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-50">
                    <ImageIcon className="h-5 w-5 text-indigo-600" aria-hidden="true" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">{t('admin.tavoloImages.title')}</h2>
                    <p className="mt-1 max-w-3xl text-sm text-slate-500">{t('admin.tavoloImages.subtitle')}</p>
                </div>
            </div>

            <fieldset className="rounded-md border border-slate-200 bg-white p-4">
                <legend className="px-1 text-sm font-semibold text-slate-900">{t('admin.tavoloImages.upload')}</legend>
                <div className="mt-3 space-y-3">
                    <label className="block text-sm text-slate-700">
                        {t('admin.tavoloImages.imagesLabel')}
                        <input ref={imageInput} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                            className="mt-1 block w-full text-sm" />
                    </label>
                    <label className="block text-sm text-slate-700">
                        {t('admin.tavoloImages.csvLabel')}
                        <input ref={csvInput} type="file" accept=".csv,text/csv"
                            onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
                            className="mt-1 block w-full text-sm" />
                        <span className="mt-1 block text-xs text-slate-500">{t('admin.tavoloImages.csvHint')}</span>
                    </label>
                    <button type="button" onClick={() => void upload()} disabled={uploading || !files.length || !csvFile}
                        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        <Upload className="h-4 w-4" aria-hidden="true" />{t('admin.tavoloImages.upload')}
                    </button>
                </div>
                {result && (
                    <div className="mt-3 space-y-2 text-sm">
                        <p className="text-emerald-700">{t('admin.tavoloImages.created').replace('{n}', String(result.created))}</p>
                        {result.unlisted.length > 0 && (
                            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                                {t('admin.tavoloImages.unlisted').replace('{names}', result.unlisted.join(', '))}
                            </p>
                        )}
                    </div>
                )}
                {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            </fieldset>

            {images.length === 0 ? (
                <p className="text-sm text-slate-500">{t('admin.tavoloImages.empty')}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
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
                                    <tr key={image.id} className="border-b border-slate-100 align-top">
                                        <td className="py-2 pr-4">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={image.url} alt="" width={48} height={48}
                                                className="h-12 w-12 rounded-md border border-slate-200 object-cover" />
                                        </td>
                                        <td className="py-2 pr-4">
                                            <input value={draft.name} maxLength={120}
                                                onChange={(event) => patchDraft(image.id, { name: event.target.value })}
                                                aria-label={`${t('admin.tavoloImages.field.name')} ${image.original_name}`}
                                                className="w-44 rounded-md border border-slate-200 px-2 py-1" />
                                        </td>
                                        <td className="py-2 pr-4">
                                            <input value={draft.usage} maxLength={2000}
                                                onChange={(event) => patchDraft(image.id, { usage: event.target.value })}
                                                aria-label={`${t('admin.tavoloImages.field.usage')} ${image.original_name}`}
                                                className="w-72 rounded-md border border-slate-200 px-2 py-1" />
                                        </td>
                                        <td className="py-2 pr-4 text-xs text-slate-500">
                                            {image.original_name}
                                            <span className="block text-slate-400">{image.created_by}</span>
                                        </td>
                                        <td className="py-2">
                                            <div className="flex items-center gap-2">
                                                <button type="button" onClick={() => void save(image)} disabled={!dirty}
                                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                                                    <Save className="h-3.5 w-3.5" aria-hidden="true" />{t('admin.tavoloImages.save')}
                                                </button>
                                                {savedId === image.id && <span className="text-xs text-emerald-700">{t('admin.tavoloImages.saved')}</span>}
                                                <button type="button" onClick={() => void remove(image)}
                                                    aria-label={`${t('admin.tavoloImages.delete')} ${image.name}`}
                                                    className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600">
                                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                </button>
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
