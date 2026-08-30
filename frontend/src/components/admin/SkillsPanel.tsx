'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Play } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

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
    instructionsEn: string; conditions: string; handler: string; handlerParams: string;
    routing: string; slot: string; maxChars: string; sortOrder: string;
    isActive: boolean; status: string;
};

const EMPTY: FormState = {
    slug: '', name: '', description: '',
    instructionsEn: '', conditions: '{}', handler: '', handlerParams: '{}',
    routing: 'optional', slot: 'knowledge', maxChars: '1400', sortOrder: '0',
    isActive: true, status: 'draft',
};

const INSTRUMENTS = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP', 'SAVICKAS'];

const TEXTS = {
    it: {
        title: 'Skill della chat', newSkill: 'Nuova skill', name: 'Nome', description: 'Descrizione (la legge il router)',
        instructions: 'Istruzioni (inglese, Markdown)', conditions: 'Condizioni (JSON)', params: 'Parametri handler (JSON)', none: '(nessuno)',
        status: 'Stato', save: 'Salva', cancel: 'Annulla', bindings: 'Agganci per strumento', allSteps: 'tutti gli step',
        preview: 'Anteprima', step: 'Step', wildcard: 'Nessuno / wildcard', message: 'Messaggio dello studente', scores: 'Punteggi',
        run: 'Esegui', intent: 'Intenzione rilevata:', noIntent: '(nessuna)', invalidJson: 'Condizioni o parametri: JSON non valido',
        saveError: 'Salvataggio fallito', deleteError: 'Eliminazione fallita', bindingError: 'Salvataggio agganci fallito', previewError: 'Anteprima fallita',
        engineOn: 'Motore skill attivo per {instrument}.', engineOff: 'Anteprima simulata: il motore skill non è attivo per {instrument}.',
        edit: 'Modifica skill', delete: 'Elimina skill', slug: 'Slug', handler: 'Handler', routing: 'Instradamento', slot: 'Posizione',
        optional: 'opzionale', primary: 'primaria (una per turno)', support: 'supporto', always: 'sempre',
        knowledge: 'conoscenza', section: 'sezione', directiveTail: 'direttiva finale', draft: 'bozza', published: 'pubblicata',
    },
    en: {
        title: 'Chat skills', newSkill: 'New skill', name: 'Name', description: 'Description (read by the router)',
        instructions: 'Instructions (English, Markdown)', conditions: 'Conditions (JSON)', params: 'Handler parameters (JSON)', none: '(none)',
        status: 'Status', save: 'Save', cancel: 'Cancel', bindings: 'Instrument bindings', allSteps: 'all steps',
        preview: 'Preview', step: 'Step', wildcard: 'None / wildcard', message: 'Student message', scores: 'Scores',
        run: 'Run', intent: 'Detected intent:', noIntent: '(none)', invalidJson: 'Conditions or parameters: invalid JSON',
        saveError: 'Save failed', deleteError: 'Delete failed', bindingError: 'Binding save failed', previewError: 'Preview failed',
        engineOn: 'Skill engine active for {instrument}.', engineOff: 'Simulated preview: the skill engine is not active for {instrument}.',
        edit: 'Edit skill', delete: 'Delete skill', slug: 'Slug', handler: 'Handler', routing: 'Routing', slot: 'Slot',
        optional: 'optional', primary: 'primary (one per turn)', support: 'support', always: 'always',
        knowledge: 'knowledge', section: 'section', directiveTail: 'directive tail', draft: 'draft', published: 'published',
    },
    es: {
        title: 'Skills del chat', newSkill: 'Nueva skill', name: 'Nombre', description: 'Descripción (la lee el router)',
        instructions: 'Instrucciones (inglés, Markdown)', conditions: 'Condiciones (JSON)', params: 'Parámetros del handler (JSON)', none: '(ninguno)',
        status: 'Estado', save: 'Guardar', cancel: 'Cancelar', bindings: 'Vínculos por instrumento', allSteps: 'todos los pasos',
        preview: 'Vista previa', step: 'Paso', wildcard: 'Ninguno / comodín', message: 'Mensaje del estudiante', scores: 'Puntuaciones',
        run: 'Ejecutar', intent: 'Intención detectada:', noIntent: '(ninguna)', invalidJson: 'Condiciones o parámetros: JSON no válido',
        saveError: 'No se pudo guardar', deleteError: 'No se pudo eliminar', bindingError: 'No se pudieron guardar los vínculos', previewError: 'La vista previa ha fallado',
        engineOn: 'Motor de skills activo para {instrument}.', engineOff: 'Vista previa simulada: el motor de skills no está activo para {instrument}.',
        edit: 'Editar skill', delete: 'Eliminar skill', slug: 'Slug', handler: 'Handler', routing: 'Enrutamiento', slot: 'Posición',
        optional: 'opcional', primary: 'primaria (una por turno)', support: 'soporte', always: 'siempre',
        knowledge: 'conocimiento', section: 'sección', directiveTail: 'directiva final', draft: 'borrador', published: 'publicada',
    },
    fr: {
        title: 'Skills du chat', newSkill: 'Nouvelle skill', name: 'Nom', description: 'Description (lue par le routeur)',
        instructions: 'Instructions (anglais, Markdown)', conditions: 'Conditions (JSON)', params: 'Paramètres du handler (JSON)', none: '(aucun)',
        status: 'État', save: 'Enregistrer', cancel: 'Annuler', bindings: 'Associations par instrument', allSteps: 'toutes les étapes',
        preview: 'Aperçu', step: 'Étape', wildcard: 'Aucun / joker', message: 'Message de l’étudiant', scores: 'Scores',
        run: 'Exécuter', intent: 'Intention détectée :', noIntent: '(aucune)', invalidJson: 'Conditions ou paramètres : JSON non valide',
        saveError: 'Échec de l’enregistrement', deleteError: 'Échec de la suppression', bindingError: 'Échec de l’enregistrement des associations', previewError: 'Échec de l’aperçu',
        engineOn: 'Moteur de skills actif pour {instrument}.', engineOff: 'Aperçu simulé : le moteur de skills n’est pas actif pour {instrument}.',
        edit: 'Modifier la skill', delete: 'Supprimer la skill', slug: 'Slug', handler: 'Handler', routing: 'Routage', slot: 'Emplacement',
        optional: 'facultative', primary: 'principale (une par tour)', support: 'assistance', always: 'toujours',
        knowledge: 'connaissances', section: 'section', directiveTail: 'directive finale', draft: 'brouillon', published: 'publiée',
    },
    de: {
        title: 'Chat-Skills', newSkill: 'Neue Skill', name: 'Name', description: 'Beschreibung (wird vom Router gelesen)',
        instructions: 'Anweisungen (Englisch, Markdown)', conditions: 'Bedingungen (JSON)', params: 'Handler-Parameter (JSON)', none: '(keiner)',
        status: 'Status', save: 'Speichern', cancel: 'Abbrechen', bindings: 'Instrumentzuordnungen', allSteps: 'alle Schritte',
        preview: 'Vorschau', step: 'Schritt', wildcard: 'Keiner / Platzhalter', message: 'Nachricht der lernenden Person', scores: 'Werte',
        run: 'Ausführen', intent: 'Erkannte Absicht:', noIntent: '(keine)', invalidJson: 'Bedingungen oder Parameter: ungültiges JSON',
        saveError: 'Speichern fehlgeschlagen', deleteError: 'Löschen fehlgeschlagen', bindingError: 'Speichern der Zuordnungen fehlgeschlagen', previewError: 'Vorschau fehlgeschlagen',
        engineOn: 'Skill-Engine für {instrument} aktiv.', engineOff: 'Simulierte Vorschau: Die Skill-Engine ist für {instrument} nicht aktiv.',
        edit: 'Skill bearbeiten', delete: 'Skill löschen', slug: 'Slug', handler: 'Handler', routing: 'Routing', slot: 'Position',
        optional: 'optional', primary: 'primär (eine pro Durchgang)', support: 'unterstützend', always: 'immer',
        knowledge: 'Wissen', section: 'Abschnitt', directiveTail: 'abschließende Anweisung', draft: 'Entwurf', published: 'veröffentlicht',
    },
    sv: {
        title: 'Chatt-skills', newSkill: 'Ny skill', name: 'Namn', description: 'Beskrivning (läses av routern)',
        instructions: 'Instruktioner (engelska, Markdown)', conditions: 'Villkor (JSON)', params: 'Handlerparametrar (JSON)', none: '(ingen)',
        status: 'Status', save: 'Spara', cancel: 'Avbryt', bindings: 'Instrumentkopplingar', allSteps: 'alla steg',
        preview: 'Förhandsvisning', step: 'Steg', wildcard: 'Ingen / jokertecken', message: 'Studentens meddelande', scores: 'Poäng',
        run: 'Kör', intent: 'Identifierad avsikt:', noIntent: '(ingen)', invalidJson: 'Villkor eller parametrar: ogiltig JSON',
        saveError: 'Det gick inte att spara', deleteError: 'Det gick inte att ta bort', bindingError: 'Det gick inte att spara kopplingarna', previewError: 'Förhandsvisningen misslyckades',
        engineOn: 'Skillmotorn är aktiv för {instrument}.', engineOff: 'Simulerad förhandsvisning: skillmotorn är inte aktiv för {instrument}.',
        edit: 'Redigera skill', delete: 'Ta bort skill', slug: 'Slug', handler: 'Handler', routing: 'Routing', slot: 'Placering',
        optional: 'valfri', primary: 'primär (en per tur)', support: 'stöd', always: 'alltid',
        knowledge: 'kunskap', section: 'avsnitt', directiveTail: 'avslutande direktiv', draft: 'utkast', published: 'publicerad',
    },
};

function format(text: string, instrument: string) {
    return text.replace('{instrument}', instrument);
}

export function SkillsPanel() {
    const { lang } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
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
            fetch(`/api/qsa/guided-ui-texts?questionnaire_type=${encodeURIComponent(instrument)}&lang=${encodeURIComponent(lang)}`),
        ]).then(async ([mapResponse, stepsResponse]) => {
            if (cancelled) return;
            if (mapResponse.ok) setStepMap((await mapResponse.json()).entries ?? []);
            if (stepsResponse.ok) setGuidedSteps((await stepsResponse.json()).guided_steps ?? []);
        });
        return () => { cancelled = true; };
    }, [instrument, lang]);

    const startEdit = (skill: Skill) => {
        setEditingId(skill.id);
        setError('');
        setForm({
            slug: skill.slug, name: skill.name, description: skill.description ?? '',
            instructionsEn: skill.instructions_i18n?.en ?? '',
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
            setError(texts.invalidJson);
            return;
        }
        const instructionsI18n = form.instructionsEn ? { en: form.instructionsEn } : {};
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
            setError((await res.json()).detail ?? texts.saveError);
            return;
        }
        setEditingId(null);
        setForm(EMPTY);
        setError('');
        load();
    };

    const remove = async (id: number) => {
        const res = await fetch(`/api/admin/skills/${id}`, { method: 'DELETE' });
        if (!res.ok) setError((await res.json()).detail ?? texts.deleteError);
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
        else setError((await res.json()).detail ?? texts.bindingError);
    };

    const runPreview = async () => {
        const res = await fetch('/api/admin/skills/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                questionnaire_type: instrument,
                step_id: previewStep || null,
                language: lang,
                scores_context: previewScores, message: previewMessage,
            }),
        });
        if (res.ok) setPreview(await res.json());
        else setError((await res.json()).detail ?? texts.previewError);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{texts.title}</h2>
                <button
                    onClick={() => { setEditingId('new'); setForm(EMPTY); setError(''); }}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                >
                    <Plus className="h-4 w-4" /> {texts.newSkill}
                </button>
            </div>

            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            {editingId !== null && (
                <div className="space-y-3 rounded-lg border p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm">{texts.slug}
                            <input className="mt-1 w-full rounded border px-2 py-1" value={form.slug}
                                onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                        </label>
                        <label className="text-sm">{texts.name}
                            <input className="mt-1 w-full rounded border px-2 py-1" value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        </label>
                    </div>
                    <label className="block text-sm">{texts.description}
                        <textarea className="mt-1 w-full rounded border px-2 py-1" rows={2} value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </label>
                    <label className="block text-sm">{texts.instructions}
                        <textarea className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" rows={5} value={form.instructionsEn}
                            onChange={(e) => setForm({ ...form, instructionsEn: e.target.value })} />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm">{texts.conditions}
                            <textarea className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" rows={6} value={form.conditions}
                                onChange={(e) => setForm({ ...form, conditions: e.target.value })} />
                        </label>
                        <label className="text-sm">{texts.params}
                            <textarea className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" rows={6} value={form.handlerParams}
                                onChange={(e) => setForm({ ...form, handlerParams: e.target.value })} />
                        </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                        <label className="text-sm">{texts.handler}
                            <select className="mt-1 w-full rounded border px-2 py-1" value={form.handler}
                                onChange={(e) => setForm({ ...form, handler: e.target.value })}>
                                <option value="">{texts.none}</option>
                                {handlers.map((h) => <option key={h} value={h}>{h}</option>)}
                            </select>
                        </label>
                        <label className="text-sm">{texts.routing}
                            <select className="mt-1 w-full rounded border px-2 py-1" value={form.routing}
                                onChange={(e) => setForm({ ...form, routing: e.target.value })}>
                                <option value="optional">{texts.optional}</option>
                                <option value="primary">{texts.primary}</option>
                                <option value="support">{texts.support}</option>
                                <option value="always">{texts.always}</option>
                            </select>
                        </label>
                        <label className="text-sm">{texts.slot}
                            <select className="mt-1 w-full rounded border px-2 py-1" value={form.slot}
                                onChange={(e) => setForm({ ...form, slot: e.target.value })}>
                                <option value="knowledge">{texts.knowledge}</option>
                                <option value="section">{texts.section}</option>
                                <option value="directive_tail">{texts.directiveTail}</option>
                            </select>
                        </label>
                        <label className="text-sm">{texts.status}
                            <select className="mt-1 w-full rounded border px-2 py-1" value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}>
                                <option value="draft">{texts.draft}</option>
                                <option value="published">{texts.published}</option>
                            </select>
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={save} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                            <Check className="h-4 w-4" /> {texts.save}
                        </button>
                        <button onClick={() => { setEditingId(null); setError(''); }} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                            <X className="h-4 w-4" /> {texts.cancel}
                        </button>
                    </div>
                </div>
            )}

            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left">
                        <th className="py-2">{texts.slug}</th><th>{texts.handler}</th><th>{texts.routing}</th><th>{texts.slot}</th><th>{texts.status}</th><th></th>
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
                                <button onClick={() => startEdit(skill)} className="mr-2 p-1" aria-label={texts.edit}><Pencil className="h-4 w-4" /></button>
                                <button onClick={() => remove(skill.id)} className="p-1" aria-label={texts.delete}><Trash2 className="h-4 w-4" /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-3">
                    <h3 className="font-medium">{texts.bindings}</h3>
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
                                <span className="text-muted-foreground">{texts.allSteps}</span>
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">{texts.preview}</h3>
                <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-sm">{texts.step}
                        <select className="mt-1 w-full rounded border px-2 py-1" value={previewStep}
                            onChange={(e) => setPreviewStep(e.target.value)}>
                            <option value="">{texts.wildcard}</option>
                            {guidedSteps.map((step) => <option key={step.id} value={step.id}>{step.label}</option>)}
                        </select>
                    </label>
                    <label className="text-sm">{texts.message}
                        <input className="mt-1 w-full rounded border px-2 py-1" value={previewMessage}
                            onChange={(e) => setPreviewMessage(e.target.value)} />
                    </label>
                    <label className="text-sm">{texts.scores}
                        <input className="mt-1 w-full rounded border px-2 py-1" value={previewScores}
                            onChange={(e) => setPreviewScores(e.target.value)} />
                    </label>
                </div>
                <button onClick={runPreview} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Play className="h-4 w-4" /> {texts.run}
                </button>
                {preview && (
                    <div className="space-y-2">
                        <p className={`rounded px-3 py-2 text-sm ${preview.engine_enabled ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
                            {preview.engine_enabled
                                ? format(texts.engineOn, instrument)
                                : format(texts.engineOff, instrument)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {texts.intent} <span className="font-mono">{preview.intent || texts.noIntent}</span>
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
