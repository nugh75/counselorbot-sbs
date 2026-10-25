'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { administrationStepText } from '@/lib/i18n-administration-steps';
import { fetchInstruments } from '@/lib/instruments-api';
import { ArrowDown, ArrowUp, ArrowLeft, Archive, ArchiveRestore, CheckCircle2, Circle, ExternalLink, Flag, Plus, Trash2, X } from 'lucide-react';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import type { ClassSettings, ClassTool } from '@/lib/class-settings';
import { parseClassPath, parseClassPaths, pathStepTools, type ClassPath, type ClassPathStep } from '@/lib/class-paths';
import { resolveStepPresentation } from '@/lib/class-path-presentation';
import { StepPresentationFields } from './StepPresentationFields';
import { plannedDayLocation, plannedDayText } from '@/lib/class-path-schedule';
import { resultsChatText } from '@/lib/i18n-results-chats';
import { pathStepKey, resultsSourcePayload } from '@/lib/results-deep-dive';
import { assignmentSaveError, assignmentStepInput, parsePathAssignments, selectablePathAssignments } from '@/lib/path-assignments';
import { pathAssignmentText } from '@/lib/i18n-path-assignments';
import type { AssignmentStepSummary } from '@/lib/class-paths';
import { AssignmentDialog } from './AssignmentButton';
import { forumSaveError, forumStepInput, pathForumTopics, selectablePathForumTopics, type PathForumTopic } from '@/lib/path-forum';
import { pathForumText } from '@/lib/i18n-path-forum';
import { classPathText, classPathsTexts } from '@/lib/i18n-class-paths';
import { classSettingsText, classSettingsTexts } from '@/lib/i18n-class-settings';
import { resolveClassPathToolName } from '@/lib/class-paths-tool-names';
import { useI18n } from '@/lib/i18n-context';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { StickyActions } from '@/components/ui/StickyActions';
import { ClassPathProgressPanel } from './ClassPathProgress';
import { TeacherForbidden, TeacherLoading } from './TeacherAccess';
import { useTeacherResource } from './useTeacherResource';
import { parseForumDiscussionLinks, parseForumList } from '@/lib/forum';
import { ForumDiscussionLinks } from '@/components/forum/ForumDiscussionLinks';
import { lifecycleRequest, parsePublicationProblems, publishRevision, unavailableAction, type PublicationProblem } from '@/lib/path-publication';
import { pathPublicationText, unavailableActionText } from '@/lib/i18n-path-publication';
import { pathTemplateText } from '@/lib/i18n-path-templates';
import { PathTemplateUpdate } from './PathTemplateUpdate';
import { PathResourceDialog } from './PathResourceDialog';
import { PathDiscussionEditor } from './PathDiscussionEditor';
import { StepKindPicker } from './StepKindPicker';
import { ClassMeetingsManager } from './ClassMeetingsManager';
import { classMeetingText } from '@/lib/i18n-class-meetings';
import { meetingWhen } from '@/lib/class-meetings';
import { stepKindText, type StepKindTextKey } from '@/lib/i18n-step-kinds';
import { ADMINISTRATION_QUESTIONNAIRES, guidedChatKeys, isLegacyQuestionnaireTool, isPersonalTool, type StepKind } from '@/lib/path-step-kinds';

type PathTextKey = keyof typeof classPathsTexts;
type SettingsTextKey = keyof typeof classSettingsTexts;

function toolLabel(toolKey: string, tools: ClassTool[], lang: string): string {
    const match = tools.find(t => t.key === toolKey);
    // Built-in guided paths have no catalog row: use the app's own name.
    if (!match) return resolveClassPathToolName(toolKey, lang);
    if (match.kind === 'personal' && match.key in classSettingsTexts) {
        return classSettingsText(lang, match.key as SettingsTextKey);
    }
    return match.label_i18n[lang] || match.label_i18n.en || match.label_i18n.it || match.key;
}

interface PathEditorProps {
    path: ClassPath;
    classSettings: ClassSettings;
    institutionId: number | null;
    onBack: () => void;
    onUpdated: (updated: ClassPath) => void;
    onDeleted: (deletedId: number) => void;
}

function ClassPathEditor({ path, classSettings, institutionId, onBack, onUpdated, onDeleted }: PathEditorProps) {
    const { lang, t } = useI18n();
    const l = (key: PathTextKey) => classPathText(lang, key);
    const pub = (key: Parameters<typeof pathPublicationText>[1]) => pathPublicationText(lang, key);
    const discussions = useTeacherResource('/api/user/forum/links', parseForumDiscussionLinks);

    const [currentPath, setCurrentPath] = useState<ClassPath>(path);
    const [title, setTitle] = useState(path.title);
    const [description, setDescription] = useState(path.description || '');
    const [steps, setStepsState] = useState<ClassPathStep[]>(path.steps);
    const setSteps = (action: ClassPathStep[] | ((current: ClassPathStep[]) => ClassPathStep[])) => {
        setStepsState(current => (typeof action === 'function' ? action(current) : action).map(step =>
            step.id || step.client_key ? step : {...step, client_key: crypto.randomUUID()}));
    };
    const [administrations, setAdministrations] = useState<{id:number;title:string;code:string;locale:string;instrument_code:string;delivery_mode?:string}[]>([]);
    // Italian runs on the external site; other languages only where the app serves that instrument locale.
    const [servedLocales, setServedLocales] = useState<Record<string,string[]>>({});
    const [administrationLocale,setAdministrationLocale] = useState('it');
    const [administrationError,setAdministrationError] = useState(false);
    const [selectedAdministration,setSelectedAdministration] = useState('');
    const [administrationTitle,setAdministrationTitle] = useState('');
    const [administrationInstrument,setAdministrationInstrument] = useState('QSA');
    const r = (key: Parameters<typeof resultsChatText>[1]) => resultsChatText(lang, key);
    const a = (key: Parameters<typeof administrationStepText>[1]) => administrationStepText(lang,key);
    const loadAdministrations = async () => {
        try {
            const response = await apiFetch(`/api/teacher/groups/${path.group_id}/administrations`);
            if (!response.ok) throw new Error('administrations');
            setAdministrations(await response.json());setAdministrationError(false);
        } catch {setAdministrationError(true);}
    };
    useEffect(() => {void loadAdministrations();}, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        fetchInstruments().then(rows=>setServedLocales(Object.fromEntries(rows.map(row=>[row.code,row.available_locales]))))
            .catch(()=>setAdministrationError(true));
    }, []);
    const localeOptions = (code: string) => ['it', ...(servedLocales[code] || []).filter(locale=>locale!=='it')];
    const offered = (row: {locale:string;instrument_code:string}) => localeOptions(row.instrument_code).includes(row.locale);
    const createAdministration = async () => {
        if (busy || !administrationTitle.trim()) return;
        if (account.current !== getViewAsAccount()?.username) {setForbidden(true);return;}
        setBusy(true);
        try {
            const response = await apiFetch(`/api/teacher/groups/${path.group_id}/administrations`,{
                method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:administrationTitle.trim(),
                    instrument_code:administrationInstrument,locale:administrationLocale,status:'active'}),
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
        placeSteps([{position:0,step_type:'questionnaire_administration',
            administration_plan_id:target.id,tool_key:'',client_key:crypto.randomUUID(),auto_detect:true,can_self_mark:false,
            target_summary:{...target,institution_name:''}}]);
        setSelectedAdministration('');setNotice(null);
    };
    // Link a saved, new or pending questionnaire; resolve new IDs atomically on save.
    const [selectedAnalysisKey, setSelectedAnalysisKey] = useState('');
    // TF6: a whole-class goal assignment of this class, existing or created here.
    const p = (key: Parameters<typeof pathAssignmentText>[1]) => pathAssignmentText(lang, key);
    const [pathAssignments, setPathAssignments] = useState<AssignmentStepSummary[]>([]);
    const [assignmentLoadError, setAssignmentLoadError] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState('');
    const [creatingAssignment, setCreatingAssignment] = useState(false);
    const loadPathAssignments = async (select?: number) => {
        try {
            const response = await apiFetch(`/api/teacher/groups/${path.group_id}/path-assignments`);
            if (!response.ok) throw new Error('path assignments');
            setPathAssignments(parsePathAssignments(await response.json()));
            setAssignmentLoadError(false);
            if (select) setSelectedAssignment(String(select));
        } catch {setAssignmentLoadError(true);}
    };
    useEffect(() => {void loadPathAssignments();}, []); // eslint-disable-line react-hooks/exhaustive-deps
    const addAssignmentStep = () => {
        const target = pathAssignments.find(row => row.id === Number(selectedAssignment));
        if (!target) return;
        placeSteps([assignmentStepInput(target, 0)]);
        setSelectedAssignment(''); setNotice(null);
    };
    // TF7: an exact published discussion of this class, read from the forum API.
    const f = (key: Parameters<typeof pathForumText>[1]) => pathForumText(lang, key);
    const [forumTopics, setForumTopics] = useState<PathForumTopic[]>([]);
    const [forumLoadError, setForumLoadError] = useState(false);
    const [selectedTopic, setSelectedTopic] = useState('');
    const [discussionEditor, setDiscussionEditor] = useState<{topicId: number | null} | null>(null);
    const loadForumTopics = async (select?: number) => {
        try {
            const response = await apiFetch(`/api/groups/${path.group_id}/forum/topics?limit=100`);
            if (!response.ok) throw new Error('forum topics');
            setForumTopics(pathForumTopics(parseForumList(await response.json()).topics));
            setForumLoadError(false);
            if (select !== undefined) setSelectedTopic(steps.some(step => step.step_type === 'forum' && step.topic_id === select) ? '' : String(select));
        } catch {setForumLoadError(true);}
    };
    useEffect(() => {void loadForumTopics();}, []); // eslint-disable-line react-hooks/exhaustive-deps
    const addForumStep = () => {
        const target = selectablePathForumTopics(forumTopics, steps).find(row => row.id === Number(selectedTopic));
        if (!target) return;
        placeSteps([forumStepInput(target, path.group_id, 0)]);
        setSelectedTopic(''); setNotice(null);
    };
    const [selectedToolKey, setSelectedToolKey] = useState<string>('');
    // A saved plan reads as a summary: «Modifica» reopens the plan details or one step.
    const [editingPlan, setEditingPlan] = useState(path.steps.length === 0);
    const [openSteps, setOpenSteps] = useState<ClassPathStep[]>([]);
    // The step whose place the next added step takes, if any.
    const [replacing, setReplacing] = useState<number | null>(null);
    const addPanel = useRef<HTMLDivElement | null>(null);
    const placeSteps = (added: ClassPathStep[]) => {
        setSteps(current => {
            const at = replacing ?? current.length;
            const next = [...current.slice(0, at), ...added, ...current.slice(replacing === null ? at : at + 1)];
            return next.map((step, index) => step.position === index + 1 ? step : {...step, position: index + 1});
        });
        setReplacing(null);
    };

    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<'saved' | 'published' | 'conflict' | 'tool_disabled' | 'deep_dive_referenced' | 'deep_dive_invalid' | 'assignment_invalid' | 'forum_invalid' | 'blocked' | 'lifecycle_error' | 'error' | null>(null);
    // TF8: every step that blocks publication or restore, reported at once by the server.
    const [problems, setProblems] = useState<PublicationProblem[]>([]);
    // A blocked report names steps by their saved position: reload them to show each reason.
    const showBlocked = async (detail: unknown): Promise<boolean> => {
        const report = parsePublicationProblems(detail);
        if (!report) return false;
        setProblems(report);
        setNotice('blocked');
        try {
            const response = await apiFetch(`/api/teacher/paths/${currentPath.id}`);
            if (response.ok) {
                const next = parseClassPath(await response.json());
                setCurrentPath(next);
                setSteps(next.steps);
            }
        } catch {
            // The report above already names every step to fix.
        }
        return true;
    };
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
    // #173: one «+ Aggiungi passo» flow; the tool menu lists personal tools only.
    const k = (key: StepKindTextKey) => stepKindText(lang, key);
    const personalTools = enabledTools.filter(isPersonalTool);
    const chatKeys = guidedChatKeys(classSettings.tools);
    // Tools a step may use now: enabled catalog tools and built-in guided paths.
    const usableKeys = new Set([...enabledTools.map(t => t.key), ...chatKeys]);
    const [adding, setAdding] = useState(false);
    const [kind, setKind] = useState<StepKind | null>(null);
    const [selectedChatKey, setSelectedChatKey] = useState('');
    const closeAdd = () => {
        setAdding(false);
        setKind(null);
        setReplacing(null);
    };
    const chatReady = Boolean(selectedAnalysisKey || selectedChatKey);
    const addChat = () => {
        const chat: ClassPathStep = selectedAnalysisKey
            ? {position: 0, step_type: 'guided_results_chat', tool_key: selectedAnalysisKey,
                auto_detect: true, can_self_mark: false}
            : {position: 0, step_type: 'guided_chat', tool_key: selectedChatKey, auto_detect: true, can_self_mark: false};
        placeSteps([chat]);
        setSelectedAnalysisKey(''); setSelectedChatKey(''); setNotice(null);
    };

    const dirty =
        title !== currentPath.title ||
        description !== (currentPath.description || '') ||
        JSON.stringify(steps) !== JSON.stringify(currentPath.steps);

    useDraftGuard((dirty || busy) && !discussionEditor, l('discard'), { blocked: busy });

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

    const handleUpdateStep = (index: number, patch: Partial<Pick<ClassPathStep, 'title' | 'instructions' | 'due_date'>>) => {
        const previous = steps[index];
        const updated = {...previous, ...patch};
        setSteps(current => current.map((row, rowIndex) => rowIndex === index ? updated : row));
        // Open steps are tracked by object: keep the edited step open.
        setOpenSteps(current => current.map(row => (row === previous ? updated : row)));
        if (notice === 'saved' || notice === 'published') setNotice(null);
    };

    const handleRemoveStep = (index: number) => {
        const nextSteps = steps.filter((_, i) => i !== index);
        nextSteps.forEach((s, i) => {
            s.position = i + 1;
        });
        setSteps(nextSteps);
        if (notice === 'saved' || notice === 'published') setNotice(null);
    };

    const startReplace = (index: number) => {
        setReplacing(index);
        setKind(null);
        setAdding(true);
        window.setTimeout(() => addPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    };

    const handleAddStep = (toolKey: string) => {
        const tool = enabledTools.find(t => t.key === toolKey);
        if (!tool && !chatKeys.includes(toolKey)) return;

        // Auto-detect check: assessment, guided (built-in guided paths too), or personal auto-detect keys
        const auto = !tool || tool.category === 'assessment' || tool.category === 'guided' ||
            ['bussola', 'tavolo', 'goals', 'pqbl'].includes(tool.key.toLowerCase());

        const newStep: ClassPathStep = {
            position: steps.length + 1,
            tool_key: toolKey,
            title: null,
            instructions: null,
            due_date: null, scheduled_date: null,
            auto_detect: auto,
            can_self_mark: !auto,
        };
        placeSteps([newStep]);
        setSelectedToolKey('');
        setSelectedChatKey('');
        if (notice === 'saved' || notice === 'published') setNotice(null);
    };

    const handleSave = async (): Promise<ClassPath | boolean> => {
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
                mode: 'recommended',
                steps: steps.map(s => ({
                    id: s.id,
                    step_type: s.step_type || 'tool',
                    // Pending steps travel by id only: publication creates their targets.
                    ...(s.step_type === 'pending' ? {}
                        : s.step_type === 'questionnaire_administration'
                        ? {administration_plan_id:s.administration_plan_id}
                        : s.step_type === 'guided_results_chat' ? {...resultsSourcePayload(s, steps), ...(s.tool_key ? {tool_key: s.tool_key} : {})}
                            : s.step_type === 'assignment' ? {assignment_id:s.assignment_id}
                                : s.step_type === 'forum' ? {topic_id:s.topic_id}
                                    : s.step_type === 'meeting' ? {meeting_id:s.meeting_id} : {tool_key:s.tool_key}),
                    title: s.title ? s.title.trim() : null,
                    instructions: s.instructions ? s.instructions.trim() : null,
                    due_date: s.due_date || null,
                    scheduled_date: s.scheduled_date || null,
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
            if (response.status === 409 || response.status === 422) {
                // Deep-dive reference errors keep the draft editable; revision conflicts need a reload.
                const detail = (await response.json().catch(() => null))?.detail;
                if (!isCurrent()) return false;
                if (detail === 'results_step_referenced') setNotice('deep_dive_referenced');
                else if (['results_step_invalid', 'results_step_order', 'duplicate_results_chat'].includes(detail)) setNotice('deep_dive_invalid');
                else if (assignmentSaveError(detail)) setNotice('assignment_invalid');
                else if (forumSaveError(detail)) setNotice('forum_invalid');
                else setNotice(response.status === 409 ? 'conflict' : 'tool_disabled');
                return false;
            }
            if (!response.ok) throw new Error('Save failed');

            const next = parseClassPath(await response.json());
            setCurrentPath(next);
            setTitle(next.title);
            setDescription(next.description || '');
            setSteps(next.steps);
            setEditingPlan(false);
            setOpenSteps([]);
            setNotice('saved');
            onUpdated(next);
            return next;
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
        // A save just made bumps the revision: publish from the saved one, not this render's.
        let revision = currentPath.revision;
        if (dirty) {
            const saved = await handleSave();
            if (!saved) return;
            revision = publishRevision(revision, saved);
        }
        setBusy(true);
        setNotice(null);
        setProblems([]);
        try {
            const response = await apiFetch(`/api/teacher/paths/${currentPath.id}/publish`, lifecycleRequest(revision));
            if (response.ok) {
                const next = parseClassPath(await response.json());
                setCurrentPath(next);
                setNotice('published');
                onUpdated(next);
            } else if (response.status === 401 || response.status === 403) {
                setForbidden(true);
            } else {
                // Blocked steps are listed together; a stale revision needs a reload; the draft stays.
                const detail = (await response.json().catch(() => null))?.detail;
                if (await showBlocked(detail)) return;
                setNotice(response.status === 409 ? 'conflict' : assignmentSaveError(detail) ? 'assignment_invalid' : forumSaveError(detail) ? 'forum_invalid' : 'error');
            }
        } catch {
            setNotice('error');
        } finally {
            setBusy(false);
        }
    };

    const handleArchiveOrRestore = async () => {
        if (busy || dirty) return;
        setBusy(true);
        setNotice(null);
        setProblems([]);
        try {
            const action = currentPath.status === 'archived' ? 'restore' : 'archive';
            const response = await apiFetch(`/api/teacher/paths/${currentPath.id}/${action}`, lifecycleRequest(currentPath.revision));
            if (response.ok) {
                const updated = parseClassPath(await response.json());
                setCurrentPath(updated);
                setSteps(updated.steps);
                onUpdated(updated);
            } else if (response.status === 401 || response.status === 403) {
                setForbidden(true);
            } else {
                // Restore goes live through the same validation as publication.
                const detail = (await response.json().catch(() => null))?.detail;
                if (!(await showBlocked(detail))) setNotice(response.status === 409 ? 'conflict' : 'lifecycle_error');
            }
        } catch {
            setNotice('lifecycle_error');
        } finally {
            setBusy(false);
        }
    };

    const [templateNotice, setTemplateNotice] = useState<'savedAsTemplate' | 'saveAsTemplateBlocked' | 'error' | null>(null);
    const handleSaveAsTemplate = async () => {
        setBusy(true);
        setTemplateNotice(null);
        try {
            const response = await apiFetch(`/api/teacher/paths/${currentPath.id}/save-as-template`, {method: 'POST'});
            setTemplateNotice(response.ok ? 'savedAsTemplate' : response.status === 409 ? 'saveAsTemplateBlocked' : 'error');
        } catch {
            setTemplateNotice('error');
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
                <div className="flex flex-wrap items-center gap-2">
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

                    </span>
                    <Button variant="secondary" disabled={busy || dirty} onClick={() => void handleSaveAsTemplate()}>
                        {pathTemplateText(lang, 'saveAsTemplate')}
                    </Button>
                    <Button
                        variant="secondary"
                        className="w-11 px-0"
                        disabled={busy || dirty}
                        onClick={handleArchiveOrRestore}
                        aria-label={currentPath.status === 'archived' ? l('restore') : l('archive')}
                        title={currentPath.status === 'archived' ? l('restore') : l('archive')}
                    >
                        {currentPath.status === 'archived'
                            ? <ArchiveRestore className="h-4 w-4" aria-hidden />
                            : <Archive className="h-4 w-4" aria-hidden />}
                    </Button>
                    <Button
                        variant="secondary"
                        className="w-11 px-0 text-red-600"
                        disabled={busy}
                        onClick={handleDelete}
                        aria-label={l('deleteDraft')}
                        title={l('deleteDraft')}
                    >
                        <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                </div>
            </div>
            {currentPath.template_id != null && (
                <div className="flex flex-wrap items-start gap-2">
                    <PathTemplateUpdate
                        lang={lang}
                        pathId={currentPath.id}
                        revision={currentPath.revision}
                        disabled={busy || dirty}
                        onUpdated={next => {
                            setCurrentPath(next);
                            setSteps(next.steps);
                            onUpdated(next);
                        }}
                        onBlocked={showBlocked}
                    />
                </div>
            )}
            {templateNotice && (
                <p role={templateNotice === 'savedAsTemplate' ? 'status' : 'alert'}
                    className={`text-sm font-medium ${templateNotice === 'savedAsTemplate' ? 'text-emerald-700' : 'text-red-600'}`}>
                    {pathTemplateText(lang, templateNotice)}
                </p>
            )}

            {editingPlan ? (
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

                    <p className="text-sm text-slate-600">{t('piano.builder.independentSteps')}</p>
                    {currentPath.steps.length > 0 && (
                        <Button variant="secondary" onClick={() => setEditingPlan(false)}>{l('doneEditing')}</Button>
                    )}
                </Card>
            ) : (
                <Card className="flex flex-wrap items-start justify-between gap-3" data-testid="path-summary">
                    <div className="min-w-0 flex-1 space-y-1">
                        <h2 className="break-words text-lg font-semibold text-slate-800">{title}</h2>
                        {description && <p className="whitespace-pre-wrap text-sm text-slate-600">{description}</p>}
                        <p className="text-xs text-slate-500">{t('piano.builder.independentSteps')}</p>
                    </div>
                    <Button variant="secondary" disabled={busy} onClick={() => setEditingPlan(true)}>{l('editPlan')}</Button>
                </Card>
            )}

            <Card className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <h3 className="text-base font-semibold text-slate-800">
                        {`${l('stepsHeading')} (${steps.length})`}
                    </h3>
                    <p className="text-xs text-slate-500 md:max-w-xl">{l('scheduleHelp')}</p>
                </div>

                {steps.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-500">{l('noStepsYet')}</p>
                ) : (
                    <div className="space-y-3">
                        {steps.map((step, index) => {
                            const source = steps.find(row => (row.id !== undefined && row.id === step.results_step_id)
                                || (step.results_key !== undefined && pathStepKey(row) === step.results_key));
                            const pending = step.step_type === 'pending' ? step.pending_config : null;
                            const pendingSource = pending?.kind === 'guided_results_chat'
                                ? steps.find(row => row.id === pending.results_step_id) : undefined;
                            const name = pending
                                ? `${pathTemplateText(lang, 'pending')} · ${pending.kind === 'questionnaire_administration'
                                    ? `${a('administration')} · ${pending.instrument_code} ${(pending.locale || '').toUpperCase()}`
                                    : pending.kind === 'guided_results_chat'
                                        ? pending.tool_key ? `${r('analyzeQuestionnaire')} · ${pending.tool_key} · ${r('personalResults')}`
                                        : `${a('deepDive')} · ${a('deepDiveFrom')} #${pendingSource?.position ?? '?'}`
                                        : pending.kind === 'assignment' ? p('assignment') : `${f('forum')} · ${pending.title || ''}`}`
                                : step.step_type === 'questionnaire_administration'
                                ? `${a('administration')} · ${step.target_summary?.code || step.administration_plan_id}`
                                : step.step_type === 'guided_results_chat'
                                    ? step.tool_key ? `${r('analyzeQuestionnaire')} · ${step.tool_key} · ${r('personalResults')}`
                                    : `${a('deepDive')} · ${a('deepDiveFrom')} #${source?.position ?? '?'}`
                                    : step.step_type === 'assignment'
                                        ? `${p('assignment')} · ${step.assignment_summary?.title || `#${step.assignment_id}`}`
                                        : step.step_type === 'forum'
                                            ? `${f('forum')} · ${forumTopics.find(row => row.id === step.topic_id)?.title || `#${step.topic_id}`}${step.forum_summary?.locked ? ` · ${f('locked')}` : ''}`
                                            : step.step_type === 'meeting'
                                            ? `${classMeetingText(lang, 'meeting')} · ${step.meeting_summary ? `${step.meeting_summary.title} · ${step.meeting_summary.kind === 'individual' ? classMeetingText(lang, 'individual') : meetingWhen(step.meeting_summary, lang)}` : `#${step.meeting_id}`}`
                                            : step.step_type === 'guided_chat'
                                            ? `${k('guidedChat')} · ${toolLabel(step.tool_key, classSettings.tools, lang)}`
                                            : toolLabel(step.tool_key, classSettings.tools, lang);
                            // The title and the date are overrides: show the object's own values until the teacher asks for one.
                            const presentation = resolveStepPresentation(lang, step, {
                                toolName: key => toolLabel(key, classSettings.tools, lang),
                                ...(step.step_type === 'pending' ? {fallbackTitle: name} : {}),
                            });
                            // Students see this step as not available: say so here too.
                            const unavailable = (['tool', 'guided_chat'].includes(step.step_type ?? 'tool') && !usableKeys.has(step.tool_key))
                                // A saved assignment step loses its summary once revoked or otherwise unavailable.
                                || (step.step_type === 'assignment' && step.id !== undefined && !step.assignment_summary)
                                // Likewise a saved forum step whose discussion was hidden or whose forum is off.
                                || (step.step_type === 'forum' && step.id !== undefined && !step.forum_summary)
                                // And a saved meeting step whose meeting was cancelled.
                                || (step.step_type === 'meeting' && step.id !== undefined && !step.meeting_summary);
                            // The server reason of a saved step says what to fix; a local check covers unsaved tools.
                            const action = pending ? null : unavailableAction(step.availability_reason || (unavailable ? 'tool_disabled_for_class' : null));
                            const plannedDay = plannedDayText(step, lang);
                            const plannedLocation = plannedDayLocation(step);
                            const isChat = step.step_type === 'guided_chat' || step.step_type === 'guided_results_chat';
                            const isQuestionnaire = step.step_type === 'questionnaire_administration';
                            const isMeeting = step.step_type === 'meeting';
                            const meetingDate = step.meeting_summary ? meetingWhen(step.meeting_summary, lang) : null;
                            // A step not saved yet is always open; a saved one opens with «Modifica».
                            const open = step.id === undefined || openSteps.includes(step);
                            return (
                                <div
                                    key={step.id ? `step-${step.id}` : `new-step-${step.client_key}`}
                                    data-testid="path-step-card"
                                    className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 md:flex-row md:items-start"
                                >
                                    <div className="flex items-center gap-3 md:w-48">
                                        <span className="font-mono text-sm font-bold text-slate-500">{`#${step.position}`}</span>

                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-sm font-semibold text-slate-800">{name}</p>
                                            {!step.auto_detect && (
                                                <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                                                    <Flag className="h-3 w-3" aria-hidden />
                                                    {l('selfMarkBadge')}
                                                </span>
                                            )}
                                            {action && (
                                                <>
                                                    <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                                                        {l('notAvailable')}
                                                    </span>
                                                    <p className="mt-1 text-xs text-slate-600">{unavailableActionText(lang, action)}</p>
                                                </>
                                            )}
                                            {pending && <p className="mt-1 text-xs text-slate-600">{pathTemplateText(lang, 'pendingHelp')}</p>}
                                            {isLegacyQuestionnaireTool(step) && <p className="mt-1 text-xs text-slate-600">{k('legacyQuestionnaire')}</p>}
                                            {step.step_type === 'forum' && step.topic_id && (
                                                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDiscussionEditor({topicId: step.topic_id!})}>
                                                    {t('piano.builder.editDiscussion')}
                                                </Button>
                                            )}
                                            {step.step_type === 'questionnaire_administration' && step.administration_plan_id && (
                                                // Classroom and research views edit the same administration row.
                                                <Link href={`/docente/somministrazioni#plan-${step.administration_plan_id}`}
                                                    className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-indigo-700">
                                                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />{pub('openResearchView')}
                                                </Link>
                                            )}
                                        </div>
                                    </div>

                                    <div className="min-w-0 flex-1 space-y-2">
                                        <ForumDiscussionLinks links={discussions.forbidden || discussions.failed ? [] : discussions.data?.links || []}
                                            kind="path_step" targetId={step.id ?? 0} />
                                        {open ? (
                                            <StepPresentationFields
                                                presentation={presentation}
                                                step={step}
                                                update={patch => handleUpdateStep(index, patch)}
                                            />
                                        ) : <>
                                            <p className="break-words text-sm text-slate-800">{presentation.title}</p>
                                            {presentation.note && <p className="whitespace-pre-wrap text-xs text-slate-600">{presentation.note}</p>}
                                        </>}
                                    </div>

                                    <div className="space-y-2 md:w-52">
                                        {isMeeting ? (
                                            <div>
                                                <p className="text-[11px] font-medium text-slate-500">{l('meetingDate')}</p>
                                                <p className="text-xs text-slate-700">{meetingDate || '—'}</p>
                                            </div>
                                        ) : (
                                            <>
                                                {isQuestionnaire && (
                                                    <div>
                                                        <p className="text-[11px] font-medium text-slate-500">{l('plannedDayFromPlan')}</p>
                                                        <p className="text-xs text-slate-700">{plannedDay || l('plannedDayNotSet')}</p>
                                                        {plannedLocation && <p className="text-xs text-slate-500">{plannedLocation}</p>}
                                                    </div>
                                                )}
                                                {!open && <>
                                                    {isChat && plannedDay && <p className="text-xs text-slate-700">{`${l('plannedDay')}: ${plannedDay}`}</p>}
                                                    {presentation.showDueDate && presentation.dueDate && <p className="text-xs text-slate-700">{`${l('dueHeader')}: ${new Date(`${presentation.dueDate}T12:00:00`).toLocaleDateString(lang, { dateStyle: 'medium' })}`}</p>}
                                                </>}
                                                {open && isChat && (
                                                    <label className="block text-[11px] font-medium text-slate-500">
                                                        {l('plannedDayOptional')}
                                                        <input
                                                            type="date"
                                                            value={step.scheduled_date || ''}
                                                            onChange={e => {
                                                                const next = [...steps];
                                                                next[index].scheduled_date = e.target.value || null;
                                                                setSteps(next);
                                                                if (notice === 'saved' || notice === 'published') setNotice(null);
                                                            }}
                                                            aria-label={`${name} ${l('plannedDay')}`}
                                                            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
                                                        />
                                                    </label>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center justify-end gap-1 md:w-40">
                                        {!open && <Button variant="secondary" size="sm" disabled={busy}
                                            onClick={() => setOpenSteps(current => [...current, step])}
                                            aria-label={`${l('editStep')} #${step.position}`}>{l('editStep')}</Button>}
                                        {open && step.id !== undefined && <Button variant="secondary" size="sm"
                                            onClick={() => setOpenSteps(current => current.filter(row => row !== step))}>{l('doneEditing')}</Button>}
                                        <Button variant="secondary" size="sm" disabled={busy || replacing === index}
                                            onClick={() => startReplace(index)}
                                            aria-label={`${l('replaceStep')} #${step.position}`}>{l('replaceStep')}</Button>
                                        {open && <>
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
                                        </>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div ref={addPanel} className="mt-4 scroll-mt-24 space-y-3 border-t border-slate-100 pt-3" data-testid="add-step">
                    {!adding ? (
                        <Button variant="secondary" disabled={busy} onClick={() => setAdding(true)}>{k('addStep')}</Button>
                    ) : (
                        <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            {replacing !== null && steps[replacing] && <div role="status" className="space-y-1">
                                <p className="text-sm font-semibold text-slate-800">{`${l('replacingStep')} #${steps[replacing].position}`}</p>
                                <p className="text-xs text-slate-600">{l('replaceHelp')}</p>
                            </div>}
                            <StepKindPicker lang={lang} value={kind} onChange={setKind} />
                            {kind === 'questionnaire' && <div className="space-y-3">
                            <Link href="/docente/somministrazioni" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-indigo-700 hover:underline">
                                <ExternalLink className="h-4 w-4" aria-hidden />{a('research')}</Link>
                            {institutionId == null && <Callout variant="warning">{pub('noInstitute')}{' '}
                                <Link href="/docente/istituti" className="font-semibold text-indigo-700 underline">{pub('goToInstitutes')}</Link></Callout>}
                            {administrationError && <Callout variant="danger">{a('error')} <Button variant="secondary" onClick={()=>void loadAdministrations()}>{a('retry')}</Button></Callout>}
                            <div className="flex flex-wrap items-end gap-2">
                                <label className="block w-full text-sm sm:w-auto">{a('existing')}<select value={selectedAdministration} onChange={event=>setSelectedAdministration(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto">
                                    <option value="">{a('choose')}</option>
                                    {administrations.filter(offered).map(row=><option key={row.id} value={row.id}>{row.code} · {row.title} · {row.locale.toUpperCase()}</option>)}
                                </select></label>
                                <Button variant="secondary" disabled={busy || !selectedAdministration} onClick={() => {addAdministrationStep();closeAdd();}}><Plus className="h-4 w-4" aria-hidden />{l('addStep')}</Button>
                            </div>
                            <h4 className="text-sm font-semibold">{a('createNew')}</h4>
                            <div className="flex flex-wrap items-end gap-2">
                                <label className="block w-full text-sm sm:w-auto">{a('title')}<input value={administrationTitle} onChange={event=>setAdministrationTitle(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto" /></label>
                                <label className="block w-full text-sm sm:w-auto">{a('instrument')}<select value={administrationInstrument} onChange={event=>{setAdministrationInstrument(event.target.value);setAdministrationLocale('it');}} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto">
                                    {['QSA','QSAr','ZTPI','QPCS','QPCC','QAP'].map(code=><option key={code}>{code}</option>)}
                                </select></label>
                                <label className="block w-full text-sm sm:w-auto">{a('locale')}<select value={administrationLocale} onChange={event=>setAdministrationLocale(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto">
                                    {localeOptions(administrationInstrument).map(locale=><option key={locale} value={locale}>{locale.toUpperCase()}</option>)}
                                </select></label>
                                <Button disabled={busy || !administrationTitle.trim()} onClick={()=>void createAdministration()}>{a('create')}</Button>
                            </div>
                            <details className="text-sm text-slate-600">
                                <summary className="cursor-pointer font-medium text-slate-700">{a('howDone')}</summary>
                                <p className="mt-1">{a('rule')}</p>
                                <p className="mt-1">{a('teacherInAppGuide')}</p>
                            </details>
                            </div>}
                            {kind === 'guided_chat' && <div className="space-y-3">
                                <h4 className="text-sm font-semibold">{r('personalResults')}</h4>
                                <label className="block text-sm">{r('analyzeQuestionnaire')}<select value={selectedAnalysisKey}
                                    onChange={event => {setSelectedAnalysisKey(event.target.value);if (event.target.value) {setSelectedChatKey('');}}}
                                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto">
                                    <option value="">{r('chooseQuestionnaire')}</option>
                                    {enabledTools.filter(tool => ADMINISTRATION_QUESTIONNAIRES.includes(tool.key)).map(tool => <option key={tool.key} value={tool.key}>{`${r('analyzeQuestionnaire')} · ${tool.key}`}</option>)}
                                </select></label>
                                <p className="text-sm text-slate-600">{r('personalResultsHelp')}</p>
                                <h4 className="text-sm font-semibold">{k('chatStandalone')}</h4>
                                {chatKeys.length === 0 ? <p className="text-sm text-slate-600">{k('noChats')}</p> : (
                                    <label className="block w-full text-sm sm:w-auto"><span className="sr-only">{k('chatStandalone')}</span><select value={selectedChatKey} onChange={event=>{setSelectedChatKey(event.target.value);if (event.target.value) {setSelectedAnalysisKey('');}}} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto">
                                        <option value="">{k('chooseGuidedPath')}</option>
                                        {chatKeys.map(key => <option key={key} value={key}>{toolLabel(key, classSettings.tools, lang)}</option>)}
                                    </select></label>
                                )}
                                <Button variant="secondary" disabled={busy || !chatReady} onClick={() => {addChat();closeAdd();}}><Plus className="h-4 w-4" aria-hidden />{l('addStep')}</Button>
                            </div>}
                            {kind === 'activity' && <div className="space-y-3">
                            {assignmentLoadError && <Callout variant="danger">{p('loadError')} <Button variant="secondary" onClick={()=>void loadPathAssignments()}>{p('retry')}</Button></Callout>}
                            {!assignmentLoadError && !pathAssignments.length && <p className="text-sm text-slate-600">{p('empty')}</p>}
                            <div className="flex flex-wrap gap-2">
                                <label className="block w-full text-sm sm:w-auto">{p('choose')}<select value={selectedAssignment} onChange={event=>setSelectedAssignment(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto">
                                    <option value="">{p('choose')}</option>
                                    {selectablePathAssignments(pathAssignments, steps).map(row=><option key={row.id} value={row.id}>{row.attachments.length ? `${row.title} · ${row.attachments.map(item=>item.title).join(', ')}` : row.title}</option>)}
                                </select></label>
                                <Button variant="secondary" disabled={busy || !selectedAssignment} onClick={() => {addAssignmentStep();closeAdd();}}><Plus className="h-4 w-4" aria-hidden />{l('addStep')}</Button>
                                <Button variant="secondary" disabled={busy} onClick={()=>setCreatingAssignment(true)}>{p('create')}</Button>
                            </div>
                            <details className="text-sm text-slate-600">
                                <summary className="cursor-pointer font-medium text-slate-700">{a('howDone')}</summary>
                                <p className="mt-1">{p('rule')}</p>
                            </details>
                            {creatingAssignment && createPortal(<AssignmentDialog classId={path.group_id} close={()=>setCreatingAssignment(false)}
                                saved={created=>void loadPathAssignments(created.id)} />, document.body)}
                            </div>}
                            {kind === 'tool' && <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-3">
                                    <select
                                        value={selectedToolKey}
                                        onChange={e => setSelectedToolKey(e.target.value)}
                                        aria-label={l('chooseTool')}
                                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-600 focus:outline-none"
                                    >
                                        <option value="">{l('chooseTool')}</option>
                                        {personalTools.map(t => (
                                            <option key={t.key} value={t.key}>
                                                {toolLabel(t.key, classSettings.tools, lang)}
                                            </option>
                                        ))}
                                    </select>
                                    <Button variant="secondary" disabled={busy || !selectedToolKey} onClick={() => {handleAddStep(selectedToolKey);closeAdd();}}>
                                        <Plus className="h-4 w-4" aria-hidden />
                                        {l('addStep')}
                                    </Button>
                                </div>
                                <p className="text-sm text-slate-600">{k('toolHelp')}</p>
                            </div>}
                            {kind === 'meeting' && <ClassMeetingsManager lang={lang} groupId={path.group_id} addLabel={l('addStep')}
                                usedIds={steps.flatMap(step => step.step_type === 'meeting' && step.meeting_id ? [step.meeting_id] : [])}
                                onAdd={meeting => {
                                    placeSteps([{position: 0, step_type: 'meeting', meeting_id: meeting.id,
                                        meeting_summary: meeting, tool_key: '', auto_detect: true, can_self_mark: false, title: null,
                                        instructions: null, due_date: null, scheduled_date: null}]);
                                    setNotice(null);
                                    closeAdd();
                                }} />}
                            {kind === 'discussion' && <div className="space-y-3">
                            {forumLoadError && <Callout variant="danger">{f('loadError')} <Button variant="secondary" onClick={()=>void loadForumTopics()}>{f('retry')}</Button></Callout>}
                            {!forumLoadError && !forumTopics.length && <p className="text-sm text-slate-600">{f('empty')}</p>}
                            <div className="flex flex-wrap gap-2">
                                <label className="block w-full text-sm sm:w-auto">{f('choose')}<select value={selectedTopic} onChange={event=>setSelectedTopic(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto">
                                    <option value="">{f('choose')}</option>
                                    {selectablePathForumTopics(forumTopics, steps).map(row=><option key={row.id} value={row.id}>{row.locked ? `${row.title} · ${f('locked')}` : row.title}</option>)}
                                </select></label>
                                <Button variant="secondary" disabled={busy || !selectedTopic} onClick={() => {addForumStep();closeAdd();}}><Plus className="h-4 w-4" aria-hidden />{l('addStep')}</Button>
                                <Button variant="secondary" disabled={busy} onClick={() => setDiscussionEditor({topicId: null})}>{t('piano.builder.createDiscussion')}</Button>
                                <Button variant="secondary" disabled={busy || !selectedTopic} onClick={() => setDiscussionEditor({topicId: Number(selectedTopic)})}>{t('piano.builder.editDiscussion')}</Button>
                            </div>
                            <details className="text-sm text-slate-600">
                                <summary className="cursor-pointer font-medium text-slate-700">{a('howDone')}</summary>
                                <p className="mt-1">{f('rule')}</p>
                            </details>
                            </div>}
                            <Button variant="ghost" disabled={busy} onClick={closeAdd}>{replacing !== null ? l('cancelReplace') : k('close')}</Button>
                        </div>
                    )}
                </div>

                {/* Explains the self-mark badge only when a step shows it; the tool form says which tools are offered. */}
                {steps.some(step => !step.auto_detect) && <p className="flex items-center gap-1 text-xs text-slate-500"><Flag className="h-3 w-3 shrink-0" aria-hidden />{l('selfMarkHelp')}</p>}
            </Card>

            {currentPath.published_at && (
                <ClassPathProgressPanel
                    pathId={currentPath.id}
                    toolName={key => toolLabel(key, classSettings.tools, lang)}
                />
            )}

            {discussionEditor && <PathResourceDialog title={t(discussionEditor.topicId === null ? 'piano.builder.createDiscussion' : 'piano.builder.editDiscussion')}
                planDirty={dirty} onClose={() => setDiscussionEditor(null)}>
                {({onDraft, close}) => <PathDiscussionEditor groupId={path.group_id} topicId={discussionEditor.topicId}
                    onDraft={onDraft} onCancel={close} onSaved={id => {setDiscussionEditor(null); void loadForumTopics(id);}} />}
            </PathResourceDialog>}

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
                        {notice === 'assignment_invalid' && (
                            <p role="alert" className="text-red-600 font-medium">{p('invalid')}</p>
                        )}
                        {notice === 'forum_invalid' && (
                            <p role="alert" className="text-red-600 font-medium">{f('invalid')}</p>
                        )}
                        {(notice === 'deep_dive_referenced' || notice === 'deep_dive_invalid') && (
                            <p role="alert" className="text-red-600 font-medium">
                                {a(notice === 'deep_dive_referenced' ? 'deepDiveReferenced' : 'deepDiveInvalid')}
                            </p>
                        )}
                        {notice === 'blocked' && (
                            <div role="alert" className="text-red-600">
                                <p className="font-medium">{pub('blocked')}</p>
                                <ul className="mt-1 list-disc pl-5">
                                    {problems.map(row => {
                                        const action = unavailableAction(row.reason);
                                        return <li key={`${row.step_id}-${row.reason}`}>{`#${row.position} · ${action ? unavailableActionText(lang, action) : row.reason}`}</li>;
                                    })}
                                </ul>
                            </div>
                        )}
                        {notice === 'lifecycle_error' && (
                            <p role="alert" className="text-red-600 font-medium">{pub('lifecycleError')}</p>
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
                        <Button disabled={busy || notice === 'conflict'} onClick={() => void handlePublish()}>
                            {busy ? l('publishing') : l('publish')}
                        </Button>
                    </div>
                </div>
            </StickyActions>
        </div>
    );
}

export function ClassPathsTab({ groupId, classSettings, institutionId = null }: { groupId: number; classSettings: ClassSettings; institutionId?: number | null }) {
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
                institutionId={institutionId}
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
                                        {`${p.status === 'published' ? l('publishedBadge') : l('draftBadge')} · ${p.steps_count} ${l(p.steps_count === 1 ? 'stepCountOne' : 'stepsCount')}`}
                                    </p>
                                </div>
                            </div>
                            <Button variant="secondary" className="ml-8 sm:ml-0" onClick={() => setSelectedPathId(p.id)}>
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
                                                    {`${l('archivedBadge')} · ${p.steps_count} ${l(p.steps_count === 1 ? 'stepCountOne' : 'stepsCount')}`}
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
