'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { administrationStepText } from '@/lib/i18n-administration-steps';
import { ArrowDown, ArrowUp, ArrowLeft, Archive, CheckCircle2, Circle, Plus, Trash2, X } from 'lucide-react';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import type { ClassSettings, ClassTool } from '@/lib/class-settings';
import { parseClassPath, parseClassPaths, pathStepTools, type ClassPath, type ClassPathStep } from '@/lib/class-paths';
import { classPathText, classPathsTexts } from '@/lib/i18n-class-paths';
import { classSettingsText, classSettingsTexts } from '@/lib/i18n-class-settings';
import { useI18n } from '@/lib/i18n-context';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { StickyActions } from '@/components/ui/StickyActions';
import { ClassPathProgressPanel } from './ClassPathProgress';
import { TeacherForbidden, TeacherLoading } from './TeacherAccess';
import { useTeacherResource } from './useTeacherResource';
import { parseForumDiscussionLinks } from '@/lib/forum';
import { ForumDiscussionLinks } from '@/components/forum/ForumDiscussionLinks';

type PathTextKey = keyof typeof classPathsTexts;
type SettingsTextKey = keyof typeof classSettingsTexts;

function toolLabel(toolKey: string, tools: ClassTool[], lang: string): string {
    const match = tools.find(t => t.key === toolKey);
    if (!match) return toolKey;
    if (match.kind === 'personal' && match.key in classSettingsTexts) {
        return classSettingsText(lang, match.key as SettingsTextKey);
    }
    return match.label_i18n[lang] || match.label_i18n.en || match.label_i18n.it || match.key;
}

interface PathEditorProps {
    path: ClassPath;
    classSettings: ClassSettings;
    onBack: () => void;
    onUpdated: (updated: ClassPath) => void;
    onDeleted: (deletedId: number) => void;
}

function ClassPathEditor({ path, classSettings, onBack, onUpdated, onDeleted }: PathEditorProps) {
    const { lang } = useI18n();
    const l = (key: PathTextKey) => classPathText(lang, key);
    const discussions = useTeacherResource('/api/user/forum/links', parseForumDiscussionLinks);

    const [currentPath, setCurrentPath] = useState<ClassPath>(path);
    const [title, setTitle] = useState(path.title);
    const [description, setDescription] = useState(path.description || '');
    const [mode, setMode] = useState<'recommended' | 'strict'>(path.mode);
    const [steps, setSteps] = useState<ClassPathStep[]>(path.steps);
    const [administrations, setAdministrations] = useState<{id:number;title:string;code:string;locale:string;instrument_code:string}[]>([]);
    const [administrationError,setAdministrationError] = useState(false);
    const [selectedAdministration,setSelectedAdministration] = useState('');
    const [administrationTitle,setAdministrationTitle] = useState('');
    const [administrationInstrument,setAdministrationInstrument] = useState('QSA');
    const a = (key: Parameters<typeof administrationStepText>[1]) => administrationStepText(lang,key);
    const loadAdministrations = async () => {
        try {
            const response = await apiFetch(`/api/teacher/groups/${path.group_id}/administrations`);
            if (!response.ok) throw new Error('administrations');
            setAdministrations(await response.json());setAdministrationError(false);
        } catch {setAdministrationError(true);}
    };
    useEffect(() => {void loadAdministrations();}, []); // eslint-disable-line react-hooks/exhaustive-deps
    const createAdministration = async () => {
        if (busy || !administrationTitle.trim()) return;
        if (account.current !== getViewAsAccount()?.username) {setForbidden(true);return;}
        setBusy(true);
        try {
            const response = await apiFetch(`/api/teacher/groups/${path.group_id}/administrations`,{
                method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:administrationTitle.trim(),
                    instrument_code:administrationInstrument,locale:'it',status:'active'}),
            });
            if (!response.ok) throw new Error('create administration');
            const created = await response.json();
            setAdministrations(current=>[created,...current]);setSelectedAdministration(String(created.id));
            setAdministrationTitle('');setAdministrationError(false);
        } catch {setAdministrationError(true);} finally {setBusy(false);}
    };
    const addAdministrationStep = () => {
        const target=administrations.find(row=>row.id===Number(selectedAdministration));
        if (!target) return;
        setSteps(current=>[...current,{position:current.length+1,step_type:'questionnaire_administration',
            administration_plan_id:target.id,tool_key:'',auto_detect:true,can_self_mark:false,
            target_summary:{...target,institution_name:''}}]);
        setSelectedAdministration('');setNotice(null);
    };
    const [selectedToolKey, setSelectedToolKey] = useState<string>('');

    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<'saved' | 'published' | 'conflict' | 'tool_disabled' | 'error' | null>(null);
    const [forbidden, setForbidden] = useState(false);

    const mounted = useRef(false);
    const account = useRef(getViewAsAccount()?.username);
    const pending = useRef<AbortController | null>(null);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            pending.current?.abort();
        };
    }, []);

    // Enabled tools for this class
    const enabledTools = pathStepTools(classSettings.tools);

    const dirty =
        title !== currentPath.title ||
        description !== (currentPath.description || '') ||
        mode !== currentPath.mode ||
        JSON.stringify(steps) !== JSON.stringify(currentPath.steps);

    useDraftGuard(dirty || busy, l('discard'), { blocked: busy });

    const handleMoveStep = (index: number, delta: number) => {
        const nextIndex = index + delta;
        if (nextIndex < 0 || nextIndex >= steps.length) return;
        const nextSteps = [...steps];
        const temp = nextSteps[index];
        nextSteps[index] = nextSteps[nextIndex];
        nextSteps[nextIndex] = temp;
        // update positions
        nextSteps.forEach((s, i) => {
            s.position = i + 1;
        });
        setSteps(nextSteps);
        if (notice === 'saved') setNotice(null);
    };

    const handleRemoveStep = (index: number) => {
        const nextSteps = steps.filter((_, i) => i !== index);
        nextSteps.forEach((s, i) => {
            s.position = i + 1;
        });
        setSteps(nextSteps);
        if (notice === 'saved' || notice === 'published') setNotice(null);
    };

    const handleAddStep = () => {
        if (!selectedToolKey) return;
        const tool = enabledTools.find(t => t.key === selectedToolKey);
        if (!tool) return;

        // Auto-detect check: assessment, guided, or personal auto-detect keys
        const auto = tool.category === 'assessment' || tool.category === 'guided' ||
            ['bussola', 'tavolo', 'goals', 'pqbl'].includes(tool.key.toLowerCase());

        const newStep: ClassPathStep = {
            position: steps.length + 1,
            tool_key: tool.key,
            title: null,
            instructions: null,
            due_date: null,
            auto_detect: auto,
            can_self_mark: !auto,
        };
        setSteps([...steps, newStep]);
        setSelectedToolKey('');
        if (notice === 'saved' || notice === 'published') setNotice(null);
    };

    const handleSave = async (): Promise<boolean> => {
        if (pending.current || notice === 'conflict') return false;
        if (!dirty) return true;
        if (account.current !== getViewAsAccount()?.username) {
            setForbidden(true);
            return false;
        }

        const controller = new AbortController();
        pending.current = controller;
        setBusy(true);
        setNotice(null);

        const isCurrent = () => mounted.current && !controller.signal.aborted;

        try {
            const payload = {
                revision: currentPath.revision,
                title: title.trim(),
                description: description.trim() || null,
                mode,
                steps: steps.map(s => ({
                    id: s.id,
                    step_type: s.step_type || 'tool',
                    ...(s.step_type === 'questionnaire_administration'
                        ? {administration_plan_id:s.administration_plan_id} : {tool_key:s.tool_key}),
                    title: s.title ? s.title.trim() : null,
                    instructions: s.instructions ? s.instructions.trim() : null,
                    due_date: s.due_date || null,
                })),
            };

            const response = await apiFetch(`/api/teacher/paths/${currentPath.id}`, {
                method: 'PUT',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!isCurrent()) return false;
            if (response.status === 401 || response.status === 403) {
                setForbidden(true);
                return false;
            }
            if (response.status === 409) {
                setNotice('conflict');
                return false;
            }
            if (response.status === 422) {
                setNotice('tool_disabled');
                return false;
            }
            if (!response.ok) throw new Error('Save failed');

            const next = parseClassPath(await response.json());
            setCurrentPath(next);
            setTitle(next.title);
            setDescription(next.description || '');
            setMode(next.mode);
            setSteps(next.steps);
            setNotice('saved');
            onUpdated(next);
            return true;
        } catch {
            if (isCurrent()) setNotice('error');
            return false;
        } finally {
            if (isCurrent()) {
                pending.current = null;
                setBusy(false);
            }
        }
    };

    const handlePublish = async () => {
        if (busy || notice === 'conflict') return;
        if (dirty) {
            const ok = await handleSave();
            if (!ok) return;
        }
        setBusy(true);
        setNotice(null);
        try {
            const response = await apiFetch(`/api/teacher/paths/${currentPath.id}/publish`, {
                method: 'POST',
            });
            if (response.ok) {
                const next = parseClassPath(await response.json());
                setCurrentPath(next);
                setNotice('published');
                onUpdated(next);
            } else if (response.status === 401 || response.status === 403) {
                setForbidden(true);
            } else {
                setNotice('error');
            }
        } catch {
            setNotice('error');
        } finally {
            setBusy(false);
        }
    };

    const handleArchiveOrRestore = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const action = currentPath.status === 'archived' ? 'restore' : 'archive';
            const response = await apiFetch(`/api/teacher/paths/${currentPath.id}/${action}`, {
                method: 'POST',
            });
            if (response.ok) {
                const updated = parseClassPath(await response.json());
                setCurrentPath(updated);
                onUpdated(updated);
            }
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(l('confirmDelete'))) return;
        setBusy(true);
        try {
            const response = await apiFetch(`/api/teacher/paths/${currentPath.id}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                onDeleted(currentPath.id);
            }
        } finally {
            setBusy(false);
        }
    };

    if (forbidden) return <TeacherForbidden />;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    {l('backToList')}
                </button>
                <div className="flex items-center gap-2">
                    <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            currentPath.status === 'published'
                                ? 'bg-emerald-100 text-emerald-800'
                                : currentPath.status === 'archived'
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-amber-100 text-amber-800'
                        }`}
                    >
                        {currentPath.status === 'published'
                            ? l('publishedBadge')
                            : currentPath.status === 'archived'
                            ? l('archivedBadge')
                            : l('draftBadge')}
                        {' '}
                        <span className="font-mono text-xs">{`(r${currentPath.revision})`}</span>

                    </span>
                    <Button variant="secondary" disabled={busy} onClick={handleArchiveOrRestore}>
                        {currentPath.status === 'archived' ? l('restore') : l('archive')}
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={handleDelete}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                        {l('deleteDraft')}
                    </Button>
                </div>
            </div>

            <Card className="space-y-4">
                <div>
                    <label htmlFor="path-title" className="block text-sm font-semibold text-slate-800">
                        {l('titleLabel')}
                    </label>
                    <input
                        id="path-title"
                        type="text"
                        value={title}
                        onChange={e => {
                            setTitle(e.target.value);
                            if (notice === 'saved' || notice === 'published') setNotice(null);
                        }}
                        placeholder={l('titlePlaceholder')}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-600 focus:outline-none"
                    />
                </div>

                <div>
                    <label htmlFor="path-description" className="block text-sm font-semibold text-slate-800">
                        {l('descriptionLabel')}
                    </label>
                    <textarea
                        id="path-description"
                        rows={2}
                        value={description}
                        onChange={e => {
                            setDescription(e.target.value);
                            if (notice === 'saved' || notice === 'published') setNotice(null);
                        }}
                        placeholder={l('descriptionPlaceholder')}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-600 focus:outline-none"
                    />
                </div>

                <div>
                    <span className="block text-sm font-semibold text-slate-800">{l('orderLabel')}</span>
                    <div className="mt-2 space-y-2">
                        <label className="flex items-start gap-2 text-sm text-slate-700">
                            <input
                                type="radio"
                                name="path-mode"
                                value="recommended"
                                checked={mode === 'recommended'}
                                onChange={() => {
                                    setMode('recommended');
                                    if (notice === 'saved' || notice === 'published') setNotice(null);
                                }}
                                className="mt-1 h-4 w-4 accent-indigo-600"
                            />
                            <span>{l('orderRecommended')}</span>
                        </label>
                        <label className="flex items-start gap-2 text-sm text-slate-700">
                            <input
                                type="radio"
                                name="path-mode"
                                value="strict"
                                checked={mode === 'strict'}
                                onChange={() => {
                                    setMode('strict');
                                    if (notice === 'saved' || notice === 'published') setNotice(null);
                                }}
                                className="mt-1 h-4 w-4 accent-indigo-600"
                            />
                            <span>{l('orderStrict')}</span>
                        </label>
                    </div>
                </div>
            </Card>

            <Card className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <h3 className="text-base font-semibold text-slate-800">
                        {`${l('pathsTitle')} (${steps.length} ${l('stepsCount')})`}
                    </h3>
                </div>

                {steps.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-500">{l('noStepsYet')}</p>
                ) : (
                    <div className="space-y-3">
                        {steps.map((step, index) => {
                            const name = step.step_type === 'questionnaire_administration'
                                ? `${a('administration')} · ${step.target_summary?.code || step.administration_plan_id}`
                                : toolLabel(step.tool_key, classSettings.tools, lang);
                            // Students see this step as not available: say so here too.
                            const unavailable = !enabledTools.some(t => t.key === step.tool_key);
                            return (
                                <div
                                    key={step.id ? `step-${step.id}` : `new-step-${index}`}
                                    data-testid="path-step-card"
                                    className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 md:flex-row md:items-center"
                                >
                                    <div className="flex items-center gap-3 md:w-48">
                                        <span className="font-mono text-sm font-bold text-slate-500">{`#${step.position}`}</span>

                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-sm font-semibold text-slate-800">{name}</p>
                                            {!step.auto_detect && (
                                                <span className="mt-0.5 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                                                    {l('selfMarkBadge')}
                                                </span>
                                            )}
                                            {unavailable && (
                                                <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                                                    {l('notAvailable')}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="min-w-0 flex-1 space-y-2">
                                        <ForumDiscussionLinks links={discussions.forbidden || discussions.failed ? [] : discussions.data?.links || []}
                                            kind="path_step" targetId={step.id ?? 0} />
                                        <input
                                            type="text"
                                            value={step.title || ''}
                                            onChange={e => {
                                                const next = [...steps];
                                                next[index].title = e.target.value;
                                                setSteps(next);
                                                if (notice === 'saved' || notice === 'published') setNotice(null);
                                            }}
                                            placeholder={l('stepTitlePlaceholder')}
                                            className="block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
                                        />
                                        <input
                                            type="text"
                                            value={step.instructions || ''}
                                            onChange={e => {
                                                const next = [...steps];
                                                next[index].instructions = e.target.value;
                                                setSteps(next);
                                                if (notice === 'saved' || notice === 'published') setNotice(null);
                                            }}
                                            placeholder={l('stepInstructionsPlaceholder')}
                                            className="block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
                                        />
                                    </div>

                                    <div className="flex items-center gap-2 md:w-36">
                                        <input
                                            type="date"
                                            value={step.due_date || ''}
                                            onChange={e => {
                                                const next = [...steps];
                                                next[index].due_date = e.target.value || null;
                                                setSteps(next);
                                                if (notice === 'saved' || notice === 'published') setNotice(null);
                                            }}
                                            aria-label={`${name} ${l('dueHeader')}`}
                                            className="block w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
                                        />
                                    </div>

                                    <div className="flex items-center justify-end gap-1 md:w-28">
                                        <button
                                            type="button"
                                            disabled={busy || index === 0}
                                            onClick={() => handleMoveStep(index, -1)}
                                            title={l('moveUp')}
                                            aria-label={`${l('moveUp')} #${step.position}`}
                                            className="flex h-9 w-9 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                                        >
                                            <ArrowUp className="h-4 w-4" aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy || index === steps.length - 1}
                                            onClick={() => handleMoveStep(index, 1)}
                                            title={l('moveDown')}
                                            aria-label={`${l('moveDown')} #${step.position}`}
                                            className="flex h-9 w-9 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                                        >
                                            <ArrowDown className="h-4 w-4" aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => handleRemoveStep(index)}
                                            title={l('removeStep')}
                                            aria-label={`${l('removeStep')} #${step.position}`}
                                            className="flex h-9 w-9 items-center justify-center rounded border border-slate-200 text-red-600 hover:bg-red-50 disabled:opacity-30"
                                        >
                                            <X className="h-4 w-4" aria-hidden />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                    <h3 className="font-semibold">{a('administration')}</h3>
                    <Link href="/docente/somministrazioni" className="text-indigo-700 underline">{a('research')}</Link>
                    {administrationError && <Callout variant="danger">{a('error')} <Button variant="secondary" onClick={()=>void loadAdministrations()}>{a('retry')}</Button></Callout>}
                    <div className="flex flex-wrap gap-2">
                        <label>{a('choose')}<select value={selectedAdministration} onChange={event=>setSelectedAdministration(event.target.value)} className="ml-2 rounded border p-2">
                            <option value="">{a('choose')}</option>
                            {administrations.filter(row=>row.locale==='it').map(row=><option key={row.id} value={row.id}>{row.code} · {row.title}</option>)}
                        </select></label>
                        <Button variant="secondary" disabled={busy || !selectedAdministration} onClick={addAdministrationStep}>{l('addStep')}</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <label>{a('title')}<input value={administrationTitle} onChange={event=>setAdministrationTitle(event.target.value)} className="ml-2 rounded border p-2" /></label>
                        <label>{a('instrument')}<select value={administrationInstrument} onChange={event=>setAdministrationInstrument(event.target.value)} className="ml-2 rounded border p-2">
                            {['QSA','QSAr','ZTPI','QPCS','QPCC','QAP'].map(code=><option key={code}>{code}</option>)}
                        </select></label>
                        <Button disabled={busy || !administrationTitle.trim()} onClick={()=>void createAdministration()}>{a('create')}</Button>
                    </div><p className="text-sm text-slate-600">{a('rule')}</p>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
                    <select
                        value={selectedToolKey}
                        onChange={e => setSelectedToolKey(e.target.value)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-600 focus:outline-none"
                    >
                        <option value="">{l('chooseTool')}</option>
                        {enabledTools.map(t => (
                            <option key={t.key} value={t.key}>
                                {toolLabel(t.key, classSettings.tools, lang)}
                            </option>
                        ))}
                    </select>
                    <Button variant="secondary" disabled={busy || !selectedToolKey} onClick={handleAddStep}>
                        <Plus className="h-4 w-4" aria-hidden />
                        {l('addStep')}
                    </Button>
                </div>

                <p className="text-xs text-slate-500">{l('selfMarkHelp')}</p>
                <p className="text-xs text-slate-400">{l('onlyEnabledHelp')}</p>
            </Card>

            {currentPath.published_at && (
                <ClassPathProgressPanel
                    pathId={currentPath.id}
                    toolName={key => toolLabel(key, classSettings.tools, lang)}
                />
            )}

            <StickyActions>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="min-w-0 flex-1 text-sm">
                        {notice === 'saved' && (
                            <p role="status" className="text-emerald-700 font-medium">
                                {l('saved')}
                            </p>
                        )}
                        {notice === 'published' && (
                            <p role="status" className="text-emerald-700 font-medium">
                                {l('publishedSuccess')}
                            </p>
                        )}
                        {notice === 'conflict' && (
                            <p role="alert" className="text-red-600 font-medium">
                                {l('conflictNotice')}
                            </p>
                        )}
                        {notice === 'tool_disabled' && (
                            <p role="alert" className="text-red-600 font-medium">
                                {l('toolDisabledNotice')}
                            </p>
                        )}
                        {notice === 'error' && (
                            <p role="alert" className="text-red-600 font-medium">
                                {l('genericError')}
                            </p>
                        )}
                        {dirty && !notice && <p className="text-slate-600">{l('dirty')}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                        {notice === 'conflict' && (
                            <Button variant="secondary" disabled={busy} onClick={onBack}>
                                {l('reload')}
                            </Button>
                        )}
                        <Button variant="secondary" disabled={busy || !dirty || notice === 'conflict'} onClick={() => void handleSave()}>
                            {busy ? l('saving') : l('saveDraft')}
                        </Button>
                        <Button variant="accent" disabled={busy || notice === 'conflict'} onClick={() => void handlePublish()}>
                            {busy ? l('publishing') : l('publish')}
                        </Button>
                    </div>
                </div>
            </StickyActions>
        </div>
    );
}

export function ClassPathsTab({ groupId, classSettings }: { groupId: number; classSettings: ClassSettings }) {
    const { lang } = useI18n();
    const l = (key: PathTextKey) => classPathText(lang, key);

    const pathsResource = useTeacherResource(`/api/teacher/groups/${groupId}/paths`, parseClassPaths);
    const [selectedPathId, setSelectedPathId] = useState<number | null>(null);
    const [creating, setCreating] = useState(false);
    const [archivedOpen, setArchivedOpen] = useState(false);

    if (pathsResource.forbidden) return <TeacherForbidden />;
    if (pathsResource.loading) return <TeacherLoading />;
    if (pathsResource.failed || !pathsResource.data) {
        return (
            <Callout variant="danger">
                <p>{l('genericError')}</p>
                <Button variant="secondary" onClick={() => void pathsResource.reload()}>
                    {l('reload')}
                </Button>
            </Callout>
        );
    }

    const paths = pathsResource.data;
    const activePaths = paths.filter(p => p.status !== 'archived');
    const archivedPaths = paths.filter(p => p.status === 'archived');

    const selectedPath = selectedPathId ? paths.find(p => p.id === selectedPathId) : null;

    const handleCreateNewDraft = async () => {
        if (creating) return;
        setCreating(true);
        try {
            const response = await apiFetch(`/api/teacher/groups/${groupId}/paths`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: l('titlePlaceholder'),
                    mode: 'recommended',
                }),
            });
            if (response.ok) {
                const created = parseClassPath(await response.json());
                await pathsResource.reload();
                setSelectedPathId(created.id);
            }
        } finally {
            setCreating(false);
        }
    };

    if (selectedPath) {
        return (
            <ClassPathEditor
                key={`editor-${selectedPath.id}`}
                path={selectedPath}
                classSettings={classSettings}
                onBack={() => {
                    setSelectedPathId(null);
                    void pathsResource.reload();
                }}
                onUpdated={() => {
                    // Local state in editor is already updated; do not reload pathsResource
                    // here to avoid setting loading=true which unmounts the editor.
                }}
                onDeleted={() => {
                    setSelectedPathId(null);
                    void pathsResource.reload();
                }}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-800">{l('pathsTitle')}</h2>
                <Button onClick={() => void handleCreateNewDraft()} disabled={creating}>
                    <Plus className="h-4 w-4" aria-hidden />
                    {l('newPath')}
                </Button>
            </div>

            {activePaths.length === 0 && archivedPaths.length === 0 ? (
                <Card>
                    <p className="py-8 text-center text-sm text-slate-500">{l('emptyPaths')}</p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {activePaths.map(p => (
                        <Card key={p.id} className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                {p.status === 'published' ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden />
                                ) : (
                                    <Circle className="h-5 w-5 text-amber-500 shrink-0" aria-hidden />
                                )}
                                <div>
                                    <h3 className="text-base font-semibold text-slate-800">{p.title}</h3>
                                    <p className="text-xs text-slate-500">
                                        {`${p.status === 'published' ? l('publishedBadge') : l('draftBadge')} · ${p.steps_count} ${l('stepsCount')} · ${p.mode === 'strict' ? l('orderStrict') : l('orderRecommended')}`}
                                    </p>
                                </div>
                            </div>
                            <Button variant="secondary" onClick={() => setSelectedPathId(p.id)}>
                                {l('open')}
                            </Button>
                        </Card>
                    ))}

                    {archivedPaths.length > 0 && (
                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={() => setArchivedOpen(!archivedOpen)}
                                className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-800"
                            >
                                <Archive className="h-4 w-4" aria-hidden />
                                <span>{`${l('archivedSection')} (${archivedPaths.length})`}</span>
                            </button>

                            {archivedOpen && (
                                <div className="mt-3 space-y-2 pl-4 border-l-2 border-slate-200">
                                    {archivedPaths.map(p => (
                                        <Card key={p.id} className="flex flex-wrap items-center justify-between gap-4 bg-slate-50">
                                            <div>
                                                <h3 className="text-sm font-semibold text-slate-700">{p.title}</h3>
                                                <p className="text-xs text-slate-400">
                                                    {`${l('archivedBadge')} · ${p.steps_count} ${l('stepsCount')}`}
                                                </p>

                                            </div>
                                            <Button variant="secondary" onClick={() => setSelectedPathId(p.id)}>
                                                {l('open')}
                                            </Button>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
