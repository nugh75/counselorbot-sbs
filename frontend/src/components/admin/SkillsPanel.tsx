'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Play } from 'lucide-react';

interface Skill {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    instructions_i18n: Record<string, string> | null;
    conditions: Record<string, unknown> | null;
    handler: string | null;
    handler_params: Record<string, unknown> | null;
    routing: string;
    slot: string;
    max_chars: number;
    sort_order: number;
    is_active: boolean;
    status: string;
}

interface StepSkillEntry {
    questionnaire_type: string;
    step_id: string;
    skill_id: number;
    sort_order: number;
    enabled: boolean;
    override_params: Record<string, unknown> | null;
}

interface GuidedStep {
    id: string;
    label: string;
}

type FormState = {
    slug: string; name: string; description: string;
    instructionsIt: string; conditions: string; handler: string; handlerParams: string;
    routing: string; slot: string; maxChars: string; sortOrder: string;
    isActive: boolean; status: string;
};

const EMPTY: FormState = {
    slug: '', name: '', description: '',
    instructionsIt: '', conditions: '{}', handler: '', handlerParams: '{}',
    routing: 'optional', slot: 'knowledge', maxChars: '1400', sortOrder: '0',
    isActive: true, status: 'draft',
};

const INSTRUMENTS = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP', 'SAVICKAS'];

export function SkillsPanel() {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [handlers, setHandlers] = useState<string[]>([]);
    const [instrument, setInstrument] = useState('QSA');
    const [stepMap, setStepMap] = useState<StepSkillEntry[]>([]);
    const [guidedSteps, setGuidedSteps] = useState<GuidedStep[]>([]);
    const [previewStep, setPreviewStep] = useState('');
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [error, setError] = useState('');
    const [previewMessage, setPreviewMessage] = useState('');
    const [previewScores, setPreviewScores] = useState('C6: 8/9');
    const [preview, setPreview] = useState<{
        engine_enabled: boolean;
        intent: string;
        blocks: Record<string, string[]>;
        trace: Record<string, unknown>[];
    } | null>(null);

    const load = async () => {
        const [sr, hr] = await Promise.all([
            fetch('/api/admin/skills'),
            fetch('/api/admin/skills/handlers'),
        ]);
        if (sr.ok) setSkills(await sr.json());
        if (hr.ok) setHandlers((await hr.json()).handlers ?? []);
    };

    useEffect(() => {
        let cancelled = false;
        void Promise.all([
            fetch('/api/admin/skills'),
            fetch('/api/admin/skills/handlers'),
        ]).then(async ([skillsResponse, handlersResponse]) => {
            if (cancelled) return;
            if (skillsResponse.ok) setSkills(await skillsResponse.json());
            if (handlersResponse.ok) setHandlers((await handlersResponse.json()).handlers ?? []);
        });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        void Promise.all([
            fetch(`/api/admin/skills/step-map?questionnaire_type=${encodeURIComponent(instrument)}`),
            fetch(`/api/qsa/guided-ui-texts?questionnaire_type=${encodeURIComponent(instrument)}&lang=it`),
        ]).then(async ([mapResponse, stepsResponse]) => {
            if (cancelled) return;
            if (mapResponse.ok) setStepMap((await mapResponse.json()).entries ?? []);
            if (stepsResponse.ok) setGuidedSteps((await stepsResponse.json()).guided_steps ?? []);
        });
        return () => { cancelled = true; };
    }, [instrument]);

    const startEdit = (skill: Skill) => {
        setEditingId(skill.id);
        setError('');
        setForm({
            slug: skill.slug, name: skill.name, description: skill.description ?? '',
            instructionsIt: skill.instructions_i18n?.it ?? '',
            conditions: JSON.stringify(skill.conditions ?? {}, null, 2),
            handler: skill.handler ?? '',
            handlerParams: JSON.stringify(skill.handler_params ?? {}, null, 2),
            routing: skill.routing, slot: skill.slot,
            maxChars: String(skill.max_chars), sortOrder: String(skill.sort_order),
            isActive: skill.is_active, status: skill.status,
        });
    };

    const save = async () => {
        let conditions: unknown;
        let handlerParams: unknown;
        try {
            conditions = JSON.parse(form.conditions || '{}');
            handlerParams = JSON.parse(form.handlerParams || '{}');
        } catch {
            setError('Condizioni o parametri: JSON non valido');
            return;
        }
        const existingSkill = typeof editingId === 'number'
            ? skills.find((skill) => skill.id === editingId)
            : undefined;
        const instructionsI18n = { ...(existingSkill?.instructions_i18n ?? {}) };
        if (form.instructionsIt) instructionsI18n.it = form.instructionsIt;
        else delete instructionsI18n.it;
        const body = {
            slug: form.slug.trim(), name: form.name.trim(), description: form.description,
            instructions_i18n: instructionsI18n,
            conditions, handler: form.handler || null, handler_params: handlerParams,
            routing: form.routing, slot: form.slot,
            max_chars: Number(form.maxChars) || 1400, sort_order: Number(form.sortOrder) || 0,
            is_active: form.isActive, status: form.status,
        };
        const isNew = editingId === 'new';
        const res = await fetch(isNew ? '/api/admin/skills' : `/api/admin/skills/${editingId}`, {
            method: isNew ? 'POST' : 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            setError((await res.json()).detail ?? 'Salvataggio fallito');
            return;
        }
        setEditingId(null);
        setForm(EMPTY);
        setError('');
        load();
    };

    const remove = async (id: number) => {
        const res = await fetch(`/api/admin/skills/${id}`, { method: 'DELETE' });
        if (!res.ok) setError((await res.json()).detail ?? 'Eliminazione fallita');
        load();
    };

    const toggleBinding = async (skillId: number) => {
        const existing = stepMap.find((e) => e.skill_id === skillId && e.step_id === '*');
        const entries = existing
            ? stepMap.map((e) => (e === existing ? { ...e, enabled: !e.enabled } : e))
            : [...stepMap, { questionnaire_type: instrument, step_id: '*', skill_id: skillId, sort_order: 0, enabled: true, override_params: null }];
        const res = await fetch('/api/admin/skills/step-map', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questionnaire_type: instrument, entries }),
        });
        if (res.ok) setStepMap((await res.json()).entries ?? []);
        else setError((await res.json()).detail ?? 'Salvataggio agganci fallito');
    };

    const runPreview = async () => {
        const res = await fetch('/api/admin/skills/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                questionnaire_type: instrument,
                step_id: previewStep || null,
                language: 'it',
                scores_context: previewScores, message: previewMessage,
            }),
        });
        if (res.ok) setPreview(await res.json());
        else setError((await res.json()).detail ?? 'Preview fallita');
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Skill della chat</h2>
                <button
                    onClick={() => { setEditingId('new'); setForm(EMPTY); setError(''); }}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                >
                    <Plus className="h-4 w-4" /> Nuova skill
                </button>
            </div>

            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            {editingId !== null && (
                <div className="space-y-3 rounded-lg border p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm">Slug
                            <input className="mt-1 w-full rounded border px-2 py-1" value={form.slug}
                                onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                        </label>
                        <label className="text-sm">Nome
                            <input className="mt-1 w-full rounded border px-2 py-1" value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        </label>
                    </div>
                    <label className="block text-sm">Descrizione (la legge il router)
                        <textarea className="mt-1 w-full rounded border px-2 py-1" rows={2} value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </label>
                    <label className="block text-sm">Istruzioni (IT, Markdown)
                        <textarea className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" rows={5} value={form.instructionsIt}
                            onChange={(e) => setForm({ ...form, instructionsIt: e.target.value })} />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm">Condizioni (JSON)
                            <textarea className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" rows={6} value={form.conditions}
                                onChange={(e) => setForm({ ...form, conditions: e.target.value })} />
                        </label>
                        <label className="text-sm">Parametri handler (JSON)
                            <textarea className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" rows={6} value={form.handlerParams}
                                onChange={(e) => setForm({ ...form, handlerParams: e.target.value })} />
                        </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                        <label className="text-sm">Handler
                            <select className="mt-1 w-full rounded border px-2 py-1" value={form.handler}
                                onChange={(e) => setForm({ ...form, handler: e.target.value })}>
                                <option value="">(nessuno)</option>
                                {handlers.map((h) => <option key={h} value={h}>{h}</option>)}
                            </select>
                        </label>
                        <label className="text-sm">Routing
                            <select className="mt-1 w-full rounded border px-2 py-1" value={form.routing}
                                onChange={(e) => setForm({ ...form, routing: e.target.value })}>
                                <option value="optional">optional</option>
                                <option value="primary">primary (una per turno)</option>
                                <option value="support">support</option>
                                <option value="always">always</option>
                            </select>
                        </label>
                        <label className="text-sm">Slot
                            <select className="mt-1 w-full rounded border px-2 py-1" value={form.slot}
                                onChange={(e) => setForm({ ...form, slot: e.target.value })}>
                                <option value="knowledge">knowledge</option>
                                <option value="section">section</option>
                                <option value="directive_tail">directive_tail</option>
                            </select>
                        </label>
                        <label className="text-sm">Stato
                            <select className="mt-1 w-full rounded border px-2 py-1" value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}>
                                <option value="draft">draft</option>
                                <option value="published">published</option>
                            </select>
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={save} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                            <Check className="h-4 w-4" /> Salva
                        </button>
                        <button onClick={() => { setEditingId(null); setError(''); }} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                            <X className="h-4 w-4" /> Annulla
                        </button>
                    </div>
                </div>
            )}

            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left">
                        <th className="py-2">Slug</th><th>Handler</th><th>Routing</th><th>Slot</th><th>Stato</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    {skills.map((skill) => (
                        <tr key={skill.id} className="border-b">
                            <td className="py-2">{skill.slug}</td>
                            <td>{skill.handler ?? '—'}</td>
                            <td>{skill.routing}</td>
                            <td>{skill.slot}</td>
                            <td>{skill.status}</td>
                            <td className="text-right">
                                <button onClick={() => startEdit(skill)} className="mr-2 p-1"><Pencil className="h-4 w-4" /></button>
                                <button onClick={() => remove(skill.id)} className="p-1"><Trash2 className="h-4 w-4" /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-3">
                    <h3 className="font-medium">Agganci per strumento</h3>
                    <select className="rounded border px-2 py-1 text-sm" value={instrument} onChange={(e) => {
                        setInstrument(e.target.value);
                        setPreviewStep('');
                    }}>
                        {INSTRUMENTS.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                </div>
                <ul className="space-y-1 text-sm">
                    {skills.map((skill) => {
                        const entry = stepMap.find((e) => e.skill_id === skill.id && e.step_id === '*');
                        return (
                            <li key={skill.id} className="flex items-center gap-2">
                                <input type="checkbox" checked={Boolean(entry?.enabled)} onChange={() => toggleBinding(skill.id)} />
                                <span>{skill.slug}</span>
                                <span className="text-muted-foreground">tutti gli step</span>
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">Preview</h3>
                <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-sm">Step
                        <select className="mt-1 w-full rounded border px-2 py-1" value={previewStep}
                            onChange={(e) => setPreviewStep(e.target.value)}>
                            <option value="">Nessuno / wildcard</option>
                            {guidedSteps.map((step) => <option key={step.id} value={step.id}>{step.label}</option>)}
                        </select>
                    </label>
                    <label className="text-sm">Messaggio dello studente
                        <input className="mt-1 w-full rounded border px-2 py-1" value={previewMessage}
                            onChange={(e) => setPreviewMessage(e.target.value)} />
                    </label>
                    <label className="text-sm">Punteggi
                        <input className="mt-1 w-full rounded border px-2 py-1" value={previewScores}
                            onChange={(e) => setPreviewScores(e.target.value)} />
                    </label>
                </div>
                <button onClick={runPreview} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Play className="h-4 w-4" /> Esegui
                </button>
                {preview && (
                    <div className="space-y-2">
                        <p className={`rounded px-3 py-2 text-sm ${preview.engine_enabled ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
                            {preview.engine_enabled
                                ? `Motore skill attivo per ${instrument}.`
                                : `Anteprima simulata: il motore skill non è attivo per ${instrument}.`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Intenzione rilevata: <span className="font-mono">{preview.intent || '(nessuna)'}</span>
                        </p>
                        <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(preview.trace, null, 2)}</pre>
                        {Object.entries(preview.blocks).map(([slot, blocks]) => (
                            <div key={slot}>
                                <p className="text-xs font-medium uppercase text-muted-foreground">{slot}</p>
                                <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{blocks.join('\n\n')}</pre>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
