'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Languages, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { PromptHistory } from '@/components/admin/PromptHistory';
import { LANGUAGES } from '@/lib/i18n';
import { CounselorCover } from '@/components/questionnaire/CounselorCover';
import { CounselorCoverModal } from '@/components/admin/CounselorCoverModal';
import type { PublicCounselor } from '@/lib/counselor';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { Button } from '@/components/ui/Button';

const QTYPES = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'EVENTO_STUDIO', 'EVENTO_PROFESSIONALE', 'OBIETTIVO_STUDIO', 'OBIETTIVO_DOCENZA', 'QPCS', 'QPCC', 'QAP', 'IDEA'];

const AVAILABLE_VOICES_BY_LOCALE = {
    it: [
        { value: 'it-IT-IsabellaNeural', label: 'Isabella (Femminile / Female)' },
        { value: 'it-IT-ElsaNeural', label: 'Elsa (Femminile / Female)' },
        { value: 'it-IT-DiegoNeural', label: 'Diego (Maschile / Male)' },
        { value: 'it-IT-GianniNeural', label: 'Gianni (Maschile / Male)' },
    ],
    en: [
        { value: 'en-US-AriaNeural', label: 'Aria (Female)' },
        { value: 'en-US-JennyNeural', label: 'Jenny (Female)' },
        { value: 'en-US-MichelleNeural', label: 'Michelle (Female)' },
        { value: 'en-US-GuyNeural', label: 'Guy (Male)' },
        { value: 'en-US-AndrewNeural', label: 'Andrew (Male)' },
        { value: 'en-US-BrianNeural', label: 'Brian (Male)' },
    ],
    es: [
        { value: 'es-ES-ElviraNeural', label: 'Elvira (Femenino / Female)' },
        { value: 'es-ES-LauraNeural', label: 'Laura (Femenino / Female)' },
        { value: 'es-ES-AlvaroNeural', label: 'Alvaro (Masculino / Male)' },
        { value: 'es-ES-ArnauNeural', label: 'Arnau (Masculino / Male)' },
    ],
    fr: [
        { value: 'fr-FR-DeniseNeural', label: 'Denise (Féminin / Female)' },
        { value: 'fr-FR-EloiseNeural', label: 'Eloise (Féminin / Female)' },
        { value: 'fr-FR-HenriNeural', label: 'Henri (Masculin / Male)' },
        { value: 'fr-FR-AlainNeural', label: 'Alain (Masculin / Male)' },
    ],
    de: [
        { value: 'de-DE-KatjaNeural', label: 'Katja (Weiblich / Female)' },
        { value: 'de-DE-AmalaNeural', label: 'Amala (Weiblich / Female)' },
        { value: 'de-DE-ConradNeural', label: 'Conrad (Männlich / Male)' },
        { value: 'de-DE-KillianNeural', label: 'Killian (Männlich / Male)' },
    ],
    sv: [
        { value: 'sv-SE-SofieNeural', label: 'Sofie (Kvinna / Female)' },
        { value: 'sv-SE-HilleviNeural', label: 'Hillevi (Kvinna / Female)' },
        { value: 'sv-SE-MattiasNeural', label: 'Mattias (Man / Male)' },
        { value: 'sv-SE-GustafNeural', label: 'Gustaf (Man / Male)' },
    ]
};

interface Preset { id: number; name: string; provider: string; model: string; }

interface Counselor {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    description_i18n: Record<string, string> | null;
    voice_mapping: Record<string, string> | null;
    persona: string | null;
    avatar: string | null;
    approach_categories?: string[] | null;
    preset_id: number | null;
    questionnaire_types: string[] | null;
    language: string[];
    sort_order: number;
    is_active: boolean;
    show_in_assistant: boolean;
    assistant_audience: string | null;
    provider: string | null;
    model: string | null;
}

type FormState = {
    slug: string; name: string; description: string; description_i18n: Record<string, string>;
    voice_mapping: Record<string, string>;
    persona: string; avatar: string;
    preset_id: string; questionnaire_types: string[]; language: string[]; sort_order: string; is_active: boolean; show_in_assistant: boolean; assistant_audience: string;
};

const EMPTY: FormState = {
    slug: '', name: '', description: '', description_i18n: {}, voice_mapping: {}, persona: '', avatar: '',
    preset_id: '', questionnaire_types: [], language: ['*'], sort_order: '0', is_active: true, show_in_assistant: false, assistant_audience: '',
};

export function CounselorsPanel() {
    const { t, lang: uiLang } = useI18n();
    const [counselors, setCounselors] = useState<Counselor[]>([]);
    const [presets, setPresets] = useState<Preset[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [saving, setSaving] = useState(false);
    const [tLang, setTLang] = useState(uiLang);
    const [coverModalOpen, setCoverModalOpen] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [cr, pr] = await Promise.all([
                fetch('/api/admin/counselors'),
                fetch('/api/admin/presets'),
            ]);
            if (cr.status === 401 || cr.status === 403) { window.location.href = '/'; return; }
            if (cr.ok) setCounselors(await cr.json());
            if (pr.ok) setPresets(await pr.json());
        } catch (e) {
            console.error('Failed to load counselors', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const startNew = () => { setForm(EMPTY); setTLang(uiLang); setEditingId('new'); };
    const startEdit = (c: Counselor) => {
        setForm({
            slug: c.slug, name: c.name, description: c.description || '',
            description_i18n: c.description_i18n || {},
            voice_mapping: c.voice_mapping || {},
            persona: c.persona || '',
            avatar: c.avatar || '', preset_id: c.preset_id != null ? String(c.preset_id) : '',
            questionnaire_types: c.questionnaire_types || [], language: Array.isArray(c.language) ? c.language : ['*'],
            sort_order: String(c.sort_order ?? 0), is_active: c.is_active, show_in_assistant: c.show_in_assistant || false,
            assistant_audience: c.assistant_audience || '',
        });
        setTLang(uiLang);
        setEditingId(c.id);
    };
    const cancel = () => { setEditingId(null); setForm(EMPTY); };

    const toggleQ = (q: string) => setForm((f) => ({
        ...f,
        questionnaire_types: f.questionnaire_types.includes(q)
            ? f.questionnaire_types.filter((x) => x !== q)
            : [...f.questionnaire_types, q],
    }));

    const toggleLang = (code: string) => setForm((f) => {
        if (code === '*') return { ...f, language: ['*'] };
        const filtered = f.language.filter((x) => x !== '*');
        const next = filtered.includes(code)
            ? filtered.filter((x) => x !== code)
            : [...filtered, code];
        return { ...f, language: next.length === 0 ? ['*'] : next };
    });

    // Current description for the active translation language tab
    const descForLang = (code: string) => code === 'it' ? form.description : (form.description_i18n[code] || '');

    const setDescForLang = (code: string, value: string) => {
        if (code === 'it') {
            setForm((f) => ({ ...f, description: value }));
        } else {
            setForm((f) => ({ ...f, description_i18n: { ...f.description_i18n, [code]: value } }));
        }
    };

    const translate = async () => {
        if (!form.description.trim()) return;
        setSaving(true);
        try {
            // First save to get an ID (for new counselors), then call translate
            const body = buildBody();
            const url = editingId === 'new' ? '/api/admin/counselors' : `/api/admin/counselors/${editingId}`;
            const method = editingId === 'new' ? 'POST' : 'PUT';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error('save failed');
            const saved: Counselor = await res.json();
            if (editingId === 'new') setEditingId(saved.id);
            // Now trigger auto-translate
            const tres = await fetch(`/api/admin/counselors/${saved.id}/translate`, { method: 'POST' });
            if (!tres.ok) throw new Error('translate failed');
            const translated: Counselor = await tres.json();
            setForm((f) => ({
                ...f,
                description_i18n: translated.description_i18n || {},
            }));
        } catch (e) {
            console.error('Translate failed', e);
        } finally {
            setSaving(false);
        }
    };

    const buildBody = () => ({
        slug: form.slug.trim(), name: form.name.trim(),
        description: form.description.trim() || null,
        description_i18n: Object.keys(form.description_i18n).length > 0 ? form.description_i18n : null,
        voice_mapping: Object.keys(form.voice_mapping).length > 0 ? form.voice_mapping : null,
        persona: form.persona.trim() || null,
        avatar: form.avatar.trim() || null,
        preset_id: form.preset_id === '' ? null : Number(form.preset_id),
        questionnaire_types: form.questionnaire_types,
        language: form.language, sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active, show_in_assistant: form.show_in_assistant,
        assistant_audience: form.assistant_audience || null,
    });

    const save = async () => {
        if (!form.slug.trim() || !form.name.trim()) return;
        setSaving(true);
        try {
            const url = editingId === 'new' ? '/api/admin/counselors' : `/api/admin/counselors/${editingId}`;
            const method = editingId === 'new' ? 'POST' : 'PUT';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody()) });
            if (!res.ok) throw new Error('save failed');
            cancel();
            await refresh();
        } catch (e) {
            console.error('Failed to save counselor', e);
        } finally {
            setSaving(false);
        }
    };

    const [confirmDelete, setConfirmDelete] = useState<string | number | null>(null);
    const remove = async (id: number) => {
        try {
            const res = await fetch(`/api/admin/counselors/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('delete failed');
            await refresh();
        } catch (e) {
            console.error('Failed to delete counselor', e);
        }
    };

    const inputCls = 'h-9 w-full rounded-control border border-line bg-surface px-2 text-sm text-ink-body outline-none focus:border-focus';

    const renderForm = () => {
        const previewCounselor: PublicCounselor = {
            id: typeof editingId === 'number' ? editingId : 0,
            slug: form.slug || 'counselor',
            name: form.name || 'Counselor',
            description: form.description || null,
            approach_categories: editingId !== 'new' && editingId !== null
                ? counselors.find((c) => c.id === editingId)?.approach_categories || []
                : [],
            avatar: form.avatar.trim() || null,
            avatar_url: form.avatar.trim() || null,
            language: form.language,
            is_active: form.is_active,
        };

        return (
            <div className="rounded-lg border border-brand-line bg-brand-soft/40 p-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.counselors.slug')}
                        <input className={inputCls} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="marco" />
                    </label>
                    <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.counselors.name')}
                        <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </label>
                    <div className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
                        <div className="flex items-center justify-between">
                            <span>{t('admin.counselors.avatar')}</span>
                            <button
                                type="button"
                                onClick={() => setCoverModalOpen(true)}
                                className="min-h-control inline-flex items-center gap-1 text-2xs font-semibold text-brand hover:text-link transition"
                            >
                                <Sparkles className="h-3 w-3 text-warning" aria-hidden />
                                <span>{t('admin.counselors.coverButton')}</span>
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative aspect-[16/9] h-9 shrink-0 overflow-hidden rounded-control border border-line bg-surface-raised shadow-card">
                                <CounselorCover
                                    counselor={previewCounselor}
                                    src={form.avatar.trim() || null}
                                    alt={form.name || 'Counselor'}
                                    compact
                                />
                            </div>
                            <input className={inputCls} value={form.avatar} onChange={(e) => setForm({ ...form, avatar: e.target.value })} placeholder="https://..." />
                        </div>
                    </div>
                    <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.counselors.preset')}
                    <select className={inputCls} value={form.preset_id} onChange={(e) => setForm({ ...form, preset_id: e.target.value })}>
                        <option value="">{t('admin.counselors.noPreset')}</option>
                        {presets.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.provider}/{p.model})</option>)}
                    </select>
                </label>
                <div className="col-span-full">
                    <div className="mb-1 text-xs font-semibold text-ink-muted">{t('admin.counselors.language')}</div>
                    <div className="flex flex-wrap gap-2">
                        <button key="*" type="button" onClick={() => toggleLang('*')} className={`min-h-control rounded-control border px-2 py-1 text-xs font-semibold ${form.language.includes('*') ? 'border-brand-line bg-brand-soft text-link' : 'border-line bg-surface text-ink-muted'}`}>{t('admin.counselors.allLanguages')}</button>
                        {LANGUAGES.map((l) => (
                            <button key={l.code} type="button" onClick={() => toggleLang(l.code)} className={`min-h-control rounded-control border px-2 py-1 text-xs font-semibold ${form.language.includes(l.code) ? 'border-brand-line bg-brand-soft text-link' : 'border-line bg-surface text-ink-muted'}`}>{l.label}</button>
                        ))}
                    </div>
                </div>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">{t('admin.counselors.order')}
                    <input className={inputCls} type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                </label>
            </div>

            {/* Translation language tabs + description */}
            <div className="mt-4">
                <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold text-ink-muted">{t('admin.counselors.description')}</span>
                    <button type="button" disabled={saving} onClick={() => void translate()} title={t('admin.counselors.translateHint') || 'Traduci via Ollama'} className="min-h-control inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-1 text-2xs font-semibold text-ink-muted hover:bg-surface-sunken disabled:opacity-50">
                        <Languages className="h-3 w-3" /> {t('admin.counselors.translate') || 'Traduci'}
                    </button>
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                    {LANGUAGES.map((l) => (
                        <button
                            key={l.code}
                            type="button"
                            onClick={() => setTLang(l.code)}
                            className={`min-h-control rounded-control border px-2 py-1 text-2xs font-semibold ${
                                tLang === l.code
                                    ? 'border-brand-line bg-brand-soft text-link'
                                    : 'border-line bg-surface text-ink-muted'
                            }`}
                        >
                            {l.label}
                        </button>
                    ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col text-xs font-semibold text-ink-muted">
                        {t('admin.counselors.descriptionLabel') || 'Descrizione'}
                        <input
                            className={inputCls}
                            value={descForLang(tLang)}
                            onChange={(e) => setDescForLang(tLang, e.target.value)}
                            placeholder={t('admin.counselors.descPlaceholder', { lang: tLang })}
                        />
                    </label>
                    <label className="flex flex-col text-xs font-semibold text-ink-muted">
                        {t('admin.counselors.voice') || 'Voce edge-tts'}
                        <select
                            className={inputCls}
                            value={form.voice_mapping[tLang] || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                setForm((f) => ({
                                    ...f,
                                    voice_mapping: { ...f.voice_mapping, [tLang]: val }
                                }));
                            }}
                        >
                            <option value="">{t('admin.counselors.defaultVoice') || 'Voce predefinita'}</option>
                            {(AVAILABLE_VOICES_BY_LOCALE[tLang as keyof typeof AVAILABLE_VOICES_BY_LOCALE] || []).map((v) => (
                                <option key={v.value} value={v.value}>{v.label}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <label className="mt-4 flex flex-col text-xs font-semibold text-ink-muted">{t('admin.counselors.persona')}
                <textarea className="min-h-[90px] w-full rounded-control border border-line bg-surface px-2 py-1 text-sm text-ink-body outline-none focus:border-focus" value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })} />
            </label>
            {typeof editingId === 'number' && (
                <PromptHistory
                    scope="counselor_persona"
                    targetKey={String(editingId)}
                    currentValue={form.persona}
                    onRestored={(value) => { setForm((f) => ({ ...f, persona: value })); void refresh(); }}
                />
            )}
            <div className="mt-4">
                <div className="mb-1 text-xs font-semibold text-ink-muted">{t('admin.counselors.questionnaires')}</div>
                <div className="flex flex-wrap gap-2">
                    {QTYPES.map((q) => (
                        <button key={q} type="button" onClick={() => toggleQ(q)} className={`min-h-control rounded-control border px-2 py-1 text-xs font-semibold ${form.questionnaire_types.includes(q) ? 'border-brand-line bg-brand-soft text-link' : 'border-line bg-surface text-ink-muted'}`}>{q}</button>
                    ))}
                </div>
            </div>
            <div className="mt-4 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-ink-muted">
                    <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                    {t('admin.counselors.active')}
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-muted">
                    <input type="checkbox" checked={form.show_in_assistant} onChange={(e) => setForm({ ...form, show_in_assistant: e.target.checked })} />
                    {t('admin.counselors.showInAssistant') || 'Mostra in assistente'}
                </label>
                {form.show_in_assistant && (
                    <label className="flex items-center gap-2 text-sm text-ink-muted">
                        <span className="text-xs text-ink-muted">
                            {t('admin.counselors.assistantAudience') || 'Visibile a:'}
                        </span>
                        <select className="h-8 rounded-control border border-line bg-surface px-2 text-xs text-ink-body" value={form.assistant_audience} onChange={(e) => setForm({ ...form, assistant_audience: e.target.value })}>
                            <option value="">{t('admin.counselors.bothAudiences') || 'Entrambi'}</option>
                            <option value="studente">{t('audience.studente') || 'Studente'}</option>
                            <option value="docente">{t('audience.docente') || 'Docente'}</option>
                        </select>
                    </label>
                )}
                <Button type="button" disabled={saving} onClick={() => void save()}>
                    <Check className="h-4 w-4" />{t('admin.counselors.save')}
                </Button>
                <Button variant="secondary" type="button" onClick={cancel}>
                    <X className="h-4 w-4" />{t('admin.counselors.cancel')}
                </Button>
            </div>
        </div>
    );
};

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-line bg-surface p-4">
                <div>
                    <h2 className="text-lg font-semibold text-ink">{t('admin.counselors.title')}</h2>
                    <p className="text-sm text-ink-muted">{t('admin.counselors.subtitle')}</p>
                </div>
                {editingId === null && (
                    <Button type="button" onClick={startNew}>
                        <Plus className="h-4 w-4" />{t('admin.counselors.add')}
                    </Button>
                )}
            </div>

            {editingId === 'new' && renderForm()}

            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-line text-xs text-ink-muted">
                        <tr>
                            <th className="px-4 py-2 font-semibold">{t('admin.counselors.name')}</th>
                            <th className="px-4 py-2 font-semibold">{t('admin.counselors.preset')}</th>
                            <th className="px-4 py-2 font-semibold">{t('admin.counselors.questionnaires')}</th>
                            <th className="px-4 py-2 font-semibold">{t('admin.counselors.active')}</th>
                            <th className="px-4 py-2 text-right font-semibold">{t('admin.counselors.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">…</td></tr>}
                        {!loading && counselors.length === 0 && editingId !== 'new' && (
                            <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">{t('admin.counselors.empty')}</td></tr>
                        )}
                        {counselors.map((c) => (
                            editingId === c.id ? (
                                <tr key={c.id}><td colSpan={5} className="px-4 py-4">{renderForm()}</td></tr>
                            ) : (
                                <tr key={c.id}>
                                    <td className="px-4 py-2 font-semibold text-ink">
                                        {c.name}
                                        <span className="ml-2 font-mono text-xs text-ink-muted">{c.slug}</span>
                                    </td>
                                    <td className="px-4 py-2 text-xs text-ink-muted">{c.provider ? `${c.provider}/${c.model}` : '-'}</td>
                                    <td className="px-4 py-2 text-xs text-ink-muted">{(c.questionnaire_types || []).join(', ') || '-'}</td>
                                    <td className="px-4 py-2">{c.is_active ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-ink-muted" />}</td>
                                    <td className="px-4 py-2">
                                        <div className="flex justify-end gap-1">
                                            <button type="button" onClick={() => startEdit(c)} className="inline-flex min-h-control min-w-control items-center justify-center rounded p-2 text-ink-muted hover:bg-surface-raised hover:text-ink"><Pencil className="h-4 w-4" /></button>
                                            {confirmDelete === c.id
                                                ? <ConfirmInline question={t('admin.counselors.confirmDelete')} onConfirm={() => { setConfirmDelete(null); void remove(c.id); }} onCancel={() => setConfirmDelete(null)} />
                                                : <button type="button" onClick={() => setConfirmDelete(c.id)} className="inline-flex min-h-control min-w-control items-center justify-center rounded p-2 text-danger hover:bg-danger-soft"><Trash2 className="h-4 w-4" /></button>}
                                        </div>
                                    </td>
                                </tr>
                            )
                        ))}
                    </tbody>
                </table>
            </div>

            {coverModalOpen && (
                <CounselorCoverModal
                    open={coverModalOpen}
                    onClose={() => setCoverModalOpen(false)}
                    counselorId={editingId}
                    counselorName={form.name}
                    counselorSlug={form.slug}
                    description={form.description}
                    persona={form.persona}
                    currentAvatar={form.avatar.trim() || null}
                    approachCategories={
                        editingId !== 'new' && editingId !== null
                            ? counselors.find((c) => c.id === editingId)?.approach_categories || []
                            : []
                    }
                    onAvatarSaved={(newAvatarUrl) => {
                        setForm((prev) => ({ ...prev, avatar: newAvatarUrl }));
                        if (editingId !== 'new' && editingId !== null) {
                            void refresh();
                        }
                    }}
                />
            )}
        </div>
    );
}
