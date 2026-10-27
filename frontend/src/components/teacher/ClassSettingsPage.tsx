'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Lock } from 'lucide-react';
import { apiFetch, getIdentity, getViewAsAccount } from '@/lib/auth';
import { defaultForumOptions, effectiveDefaultCounselor, filterClassCounselors, parseClassSettings, toggleCounselorIds, type ClassCounselor, type ClassSettings, type ClassTool, type ClassLockKind } from '@/lib/class-settings';
import type { ResponseFormat } from '@/lib/chat-preferences';
import { formatCategoryLabel } from '@/lib/i18n-counselor-identity';
import { CounselorDetailsDialog } from './CounselorDetailsDialog';
import { classSettingsText, classSettingsTexts } from '@/lib/i18n-class-settings';
import { instituteText } from '@/lib/i18n-teacher-institutes';
import { forumText } from '@/lib/i18n-forum';
import { useI18n } from '@/lib/i18n-context';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { StickyActions } from '@/components/ui/StickyActions';
import { ForumView } from '@/components/forum/ForumView';
import { TeacherForbidden, TeacherLoading } from './TeacherAccess';
import { ClassSettingLock } from './ClassSettingLock';
import { ClassSettingsAudit } from './ClassSettingsAudit';
import { ClassPathsTab } from './ClassPathsTab';
import { ClassOverviewTab } from './ClassOverviewTab';
import { ClassCouncilTab } from './ClassCouncilTab';
import { ClassNoticingTab } from './ClassNoticingTab';
import { PlanStudentsPanel } from '@/components/admin/PlanStudentsPanel';
import { useTeacherAccessState } from './useTeacherAccessState';
import { useTeacherResource } from './useTeacherResource';
import { parseClassGroups } from './class-group-types';
import { ADMIN_CLASSES_HREF } from '@/lib/admin-navigation';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { TeacherBreadcrumbs } from './TeacherBreadcrumbs';
import { ClassQuickSwitcher } from './ClassQuickSwitcher';
import { getClassBreadcrumbs, type TeacherBreadcrumbItem } from '@/lib/teacher-breadcrumbs';

type TextKey = keyof typeof classSettingsTexts;
const categories = ['assessment', 'guided', 'personal', 'support', 'forum'] as const;
const sameIds = (a: readonly (string | number)[], b: readonly (string | number)[]) =>
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

function ClassCounselorsSection({ counselors, disabled, defaultId, busy, onToggle, onToggleAll, onDefault, admin, lockDisabled, onLock }: {
    admin: boolean; lockDisabled: boolean; onLock: (kind: ClassLockKind, id: string, state: boolean | null) => void;
    counselors: ClassCounselor[]; disabled: number[]; defaultId: number | null; busy: boolean;
    onToggle: (id: number, enabled: boolean) => void;
    onToggleAll: (rows: ClassCounselor[], enabled: boolean) => void;
    onDefault: (id: number | null) => void;
}) {
    const { lang } = useI18n();
    const l = (key: TextKey) => classSettingsText(lang, key);
    const [category, setCategory] = useState('');
    const [query, setQuery] = useState('');
    const [details, setDetails] = useState<ClassCounselor | null>(null);
    const isEnabled = (row: ClassCounselor) => row.admin_enabled && !disabled.includes(row.id);
    const options = [...new Set(counselors.flatMap(row => row.approach_categories))].sort();
    const rows = filterClassCounselors(counselors, category, query);
    return <Card>
        <section aria-labelledby="class-counselors-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="class-counselors-heading" className="text-lg font-bold text-slate-800">{l('counselors')}</h2>
                <p className="text-sm text-slate-600">{l('enabled')} {counselors.filter(isEnabled).length} / {counselors.length}</p>
            </div>
            <p className="text-sm text-slate-600">{l('counselorDefaultHint')}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-1 text-sm text-slate-700">{l('counselorCategory')}
                    <select className="min-h-[44px] rounded-md border border-slate-300 bg-white px-2" value={category} onChange={event => setCategory(event.target.value)}>
                        <option value="">{l('counselorAllCategories')}</option>
                        {options.map(option => <option key={option} value={option}>{formatCategoryLabel(option, lang)}</option>)}
                    </select>
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-sm text-slate-700">{l('counselorSearch')}
                    <input type="search" className="min-h-[44px] rounded-md border border-slate-300 px-2" value={query} onChange={event => setQuery(event.target.value)} />
                </label>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy || !rows.some(row => row.admin_enabled && !row.locked)} onClick={() => onToggleAll(rows, true)}>{l('enableAll')}</Button>
                <Button variant="secondary" disabled={busy || !rows.some(row => row.admin_enabled && !row.locked)} onClick={() => onToggleAll(rows, false)}>{l('disableAll')}</Button>
            </div>
            <div role="radiogroup" aria-label={l('counselorDefault')} className="space-y-1">
                <label className="flex min-h-[44px] items-center gap-3 rounded-md p-2 text-sm text-slate-700">
                    <input type="radio" name="class-default-counselor" className="h-5 w-5 accent-indigo-600" checked={defaultId === null}
                        disabled={busy} onChange={() => onDefault(null)} />{l('counselorNoDefault')}
                </label>
                {rows.map(row => <div key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md p-2">
                    <label className="flex min-h-[44px] min-w-0 flex-[1_1_14rem] items-center gap-3 text-sm text-slate-700">
                        <input type="checkbox" className="h-5 w-5 shrink-0 accent-indigo-600" aria-label={row.name}
                            checked={isEnabled(row)} disabled={busy || !row.admin_enabled || row.locked} title={row.locked ? l('locked') : undefined}
                            aria-describedby={!row.admin_enabled ? `counselor-disabled-${row.id}` : undefined}
                            onChange={event => onToggle(row.id, event.target.checked)} />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {row.avatar_url && <img src={row.avatar_url} alt="" className="h-8 w-14 shrink-0 rounded object-cover" />}
                        <span className="min-w-0 break-words"><span className="font-medium">{row.name}</span>
                            {row.approach_categories.length > 0 && <span className="ml-2 text-xs text-slate-500">{row.approach_categories.map(item => formatCategoryLabel(item, lang)).join(' · ')}</span>}
                            {!row.admin_enabled && <span id={`counselor-disabled-${row.id}`} className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Lock className="h-4 w-4 shrink-0" aria-hidden />{l('platformDisabled')}</span>}
                        </span>
                    </label>
                    <Button type="button" variant="secondary" aria-label={`${l('counselorDetails')}: ${row.name}`} onClick={() => setDetails(row)}>{l('counselorDetails')}</Button>
                    <ClassSettingLock item={row} label={row.name} admin={admin} disabled={lockDisabled}
                        onChange={state => onLock('counselor', String(row.id), state)} />
                    <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-600">
                        <input type="radio" name="class-default-counselor" className="h-5 w-5 accent-indigo-600"
                            aria-label={`${l('counselorDefault')}: ${row.name}`} checked={defaultId === row.id}
                            disabled={busy || !isEnabled(row)} onChange={() => onDefault(row.id)} />{l('counselorDefault')}
                    </label>
                </div>)}
            </div>
            {rows.length === 0 && <p className="text-sm text-slate-600">{l('counselorNoMatch')}</p>}
            <p className="text-sm text-slate-600">{l('counselorsPrivate')}</p>
            {details && <CounselorDetailsDialog counselor={details} onClose={() => setDetails(null)} />}
        </section>
    </Card>;
}

function ClassToolsEditor({ initial, onReload, admin }: { initial: ClassSettings; onReload: () => void; admin: boolean }) {
    const { lang } = useI18n();
    const l = (key: TextKey) => classSettingsText(lang, key);
    const [settings, setSettings] = useState(initial);
    const [disabled, setDisabled] = useState(initial.disabled_tool_keys);
    const [disabledCounselors, setDisabledCounselors] = useState(initial.disabled_counselor_ids);
    const [defaultCounselor, setDefaultCounselor] = useState(effectiveDefaultCounselor(initial));
    const [forum, setForum] = useState(initial.forum ?? defaultForumOptions);
    const [personalAI, setPersonalAI] = useState(initial.students_personal_ai ?? true);
    const [responseFormat, setResponseFormat] = useState<ResponseFormat | null>(initial.response_format ?? null);
    const [responseLength, setResponseLength] = useState<"short" | "medium" | "long" | null>(initial.response_length ?? null);
    const [responseReasoning, setResponseReasoning] = useState<"off" | "standard" | "deep" | null>(initial.response_reasoning ?? null);
    const [allowFmt, setAllowFmt] = useState<boolean>(initial.allow_student_response_format ?? true);
    const [allowLen, setAllowLen] = useState<boolean>(initial.allow_student_response_length ?? true);
    const [allowRsn, setAllowRsn] = useState<boolean>(initial.allow_student_response_reasoning ?? true);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<'saved' | 'error' | 'conflict' | 'invalid' | 'lockedError' | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [reason, setReason] = useState('');
    const pending = useRef<AbortController | null>(null);
    const mounted = useRef(false);
    const account = useRef(getViewAsAccount()?.username);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; pending.current?.abort(); };
    }, []);
    const dirty = !sameIds(disabled, settings.disabled_tool_keys)
        || !sameIds(disabledCounselors, settings.disabled_counselor_ids)
        || defaultCounselor !== effectiveDefaultCounselor(settings)
        || forum.students_can_open !== (settings.forum ?? defaultForumOptions).students_can_open
        || forum.premoderation !== (settings.forum ?? defaultForumOptions).premoderation
        || personalAI !== (settings.students_personal_ai ?? true)
        || responseFormat !== (settings.response_format ?? null)
        || responseLength !== (settings.response_length ?? null)
        || responseReasoning !== (settings.response_reasoning ?? null)
        || allowFmt !== (settings.allow_student_response_format ?? true)
        || allowLen !== (settings.allow_student_response_length ?? true)
        || allowRsn !== (settings.allow_student_response_reasoning ?? true);
    useDraftGuard(dirty || busy, l('discard'), { blocked: busy });
    const tools = settings.tools.filter(tool => !tool.always_on);
    const isEnabled = (tool: ClassTool) => tool.admin_enabled && !disabled.includes(tool.key);
    const label = (tool: ClassTool) => tool.kind === 'personal' && tool.key in classSettingsTexts
        ? l(tool.key as TextKey) : tool.label_i18n[lang] || tool.label_i18n.en || tool.label_i18n.it || tool.key;
    const change = (rows: ClassTool[], enabled: boolean) => {
        if (pending.current) return;
        const editable = rows.filter(tool => tool.admin_enabled && !tool.always_on && !tool.locked).map(tool => tool.key);
        setDisabled(previous => enabled ? previous.filter(key => !editable.includes(key)) : [...new Set([...previous, ...editable])].sort());
        if (notice === 'saved') setNotice(null);
    };
    const toggleCounselor = (id: number, enabled: boolean) => {
        if (pending.current) return;
        setDisabledCounselors(previous => toggleCounselorIds(previous, [id], enabled));
        // A disabled counselor cannot stay the class default.
        if (!enabled) setDefaultCounselor(current => current === id ? null : current);
        if (notice === 'saved') setNotice(null);
    };
    const toggleAllCounselors = (rows: ClassCounselor[], enabled: boolean) => {
        if (pending.current) return;
        const editableIds = rows.filter(row => row.admin_enabled && !row.locked).map(row => row.id);
        if (editableIds.length === 0) return;
        setDisabledCounselors(previous => toggleCounselorIds(previous, editableIds, enabled));
        if (!enabled) {
            setDefaultCounselor(current => current !== null && editableIds.includes(current) ? null : current);
        }
        if (notice === 'saved') setNotice(null);
    };
    const chooseDefault = (id: number | null) => {
        if (pending.current) return;
        setDefaultCounselor(id);
        if (notice === 'saved') setNotice(null);
    };
    const reload = () => {
        if (!busy && (!dirty || window.confirm(l('discard')))) onReload();
    };
    const save = async () => {
        if (pending.current || !dirty || notice === 'conflict') return;
        if (account.current !== getViewAsAccount()?.username) { setForbidden(true); return; }
        const controller = new AbortController();
        pending.current = controller;
        setBusy(true); setNotice(null);
        const current = () => mounted.current && !controller.signal.aborted;
        try {
            const response = await apiFetch(`/api/teacher/groups/${settings.group_id}/settings`, {
                method: 'PUT', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    revision: settings.revision, disabled_tool_keys: disabled,
                    disabled_counselor_ids: disabledCounselors, default_counselor_id: defaultCounselor,
                    forum: { students_can_open: forum.students_can_open, premoderation: forum.premoderation },
                    students_personal_ai: personalAI,
                    response_format: responseFormat,
                    response_length: responseLength,
                    response_reasoning: responseReasoning,
                    allow_student_response_format: allowFmt,
                    allow_student_response_length: allowLen,
                    allow_student_response_reasoning: allowRsn,
                    ...(reason.trim() ? { reason: reason.trim() } : {}),
                }),
            });
            if (!current()) return;
            if (account.current !== getViewAsAccount()?.username || response.status === 401 || response.status === 403) {
                setForbidden(true); return;
            }
            if (response.status === 409) { setNotice('conflict'); return; }
            if (response.status === 422) { const body = await response.json(); setNotice(body.detail === 'item_locked_by_admin' ? 'lockedError' : 'invalid'); return; }
            if (!response.ok) throw new Error('Save failed');
            const next = parseClassSettings(await response.json());
            if (next.group_id !== settings.group_id) throw new Error('Wrong class');
            if (current() && account.current === getViewAsAccount()?.username) {
                setSettings(next); setDisabled(next.disabled_tool_keys);
                setDisabledCounselors(next.disabled_counselor_ids); setDefaultCounselor(effectiveDefaultCounselor(next));
                setForum(next.forum ?? defaultForumOptions); setPersonalAI(next.students_personal_ai ?? true);
                setResponseFormat(next.response_format ?? null);
                setResponseLength(next.response_length ?? null);
                setResponseReasoning(next.response_reasoning ?? null);
                setAllowFmt(next.allow_student_response_format ?? true);
                setAllowLen(next.allow_student_response_length ?? true);
                setAllowRsn(next.allow_student_response_reasoning ?? true);
                setNotice('saved'); setReason('');
            }
        } catch {
            if (current()) setNotice('error');
        } finally {
            if (current()) {
                if (account.current !== getViewAsAccount()?.username) setForbidden(true);
                pending.current = null; setBusy(false);
            }
        }
    };
    const changeLock = async (kind: ClassLockKind, id: string, state: boolean | null) => {
        if (pending.current || dirty || !admin) return;
        if (account.current !== getViewAsAccount()?.username) { setForbidden(true); return; }
        const controller = new AbortController();
        pending.current = controller; setBusy(true); setNotice(null);
        try {
            const response = await apiFetch(`/api/admin/groups/${settings.group_id}/settings/${state === null ? 'unlock' : 'lock'}`, {
                method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_kind: kind, target_id: id, ...(state === null ? {} : { state }), ...(reason.trim() ? { reason: reason.trim() } : {}) }),
            });
            if (!mounted.current || controller.signal.aborted) return;
            if (account.current !== getViewAsAccount()?.username || [401, 403].includes(response.status)) { setForbidden(true); return; }
            if (!response.ok) { setNotice(response.status === 422 ? 'invalid' : 'error'); return; }
            onReload();
        } catch { if (mounted.current && !controller.signal.aborted) setNotice('error'); }
        finally { if (mounted.current && !controller.signal.aborted) { pending.current = null; setBusy(false); } }
    };
    if (forbidden) return <TeacherForbidden />;
    return <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800">{l('tools')}</h2>
            <p className="text-sm text-slate-600">{l('enabled')} {tools.filter(isEnabled).length} / {tools.length} <span className="font-mono">{`(r${settings.revision})`}</span></p>
        </div>
        <Callout>{l('staged')}</Callout>
        {admin && <Callout>{l('adminHint')}</Callout>}
        {admin && <label className="flex flex-col gap-1 text-sm text-slate-700">{l('reason')}
            <input maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} className="min-h-[44px] rounded-md border border-slate-300 px-3" />
        </label>}
        {categories.map(category => {
            const rows = tools.filter(tool => tool.category === category);
            if (!rows.length) return null;
            return <Card key={category}>
                <details open>
                    <summary className="min-h-[44px] cursor-pointer font-semibold text-slate-800">{l(category)}</summary>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <Button variant="secondary" disabled={busy || !rows.some(tool => tool.admin_enabled && !tool.locked)} onClick={() => change(rows, true)}>{l('enableAll')}</Button>
                        <Button variant="secondary" disabled={busy || !rows.some(tool => tool.admin_enabled && !tool.locked)} onClick={() => change(rows, false)}>{l('disableAll')}</Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {rows.map(tool => <div key={tool.key} className="min-w-0 space-y-1 rounded-md p-2 text-sm text-slate-700">
                            <label className="flex min-h-[44px] min-w-0 items-start gap-3">
                            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-indigo-600" aria-label={label(tool)}
                                checked={isEnabled(tool)} disabled={busy || !tool.admin_enabled || tool.locked} title={tool.locked ? l('locked') : undefined}
                                aria-describedby={!tool.admin_enabled ? `tool-disabled-${tool.key}` : undefined}
                                onChange={event => change([tool], event.target.checked)} />
                            <span className="min-w-0 break-words">{tool.kind === 'instrument' && label(tool) !== tool.key && <span className="mr-2 font-mono text-xs">{tool.key}</span>}{label(tool)}
                                {!tool.admin_enabled && <span id={`tool-disabled-${tool.key}`} className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Lock className="h-4 w-4 shrink-0" aria-hidden />{l('platformDisabled')}</span>}
                            </span>
                            </label>
                            <ClassSettingLock item={tool} label={label(tool)} admin={admin} disabled={busy || dirty}
                                onChange={state => void changeLock('tool', tool.key, state)} />
                        </div>)}
                    </div>
                </details>
            </Card>;
        })}
        <p className="text-sm text-slate-600">{l('always')}: {settings.tools.filter(tool => tool.always_on).map(label).join(' · ')}</p>
        {settings.counselors.length > 0 && <ClassCounselorsSection counselors={settings.counselors} disabled={disabledCounselors}
            defaultId={defaultCounselor} busy={busy} admin={admin} lockDisabled={busy || dirty} onLock={(kind, id, state) => void changeLock(kind, id, state)} onToggle={toggleCounselor} onToggleAll={toggleAllCounselors} onDefault={chooseDefault} />}
        <Card>
            <h2 className="text-lg font-bold text-slate-800">{l('personalAITitle')}</h2>
            <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate-700">
                <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={personalAI} disabled={busy}
                    onChange={event => { if (!pending.current) { setPersonalAI(event.target.checked); setNotice(null); } }} />
                {l('personalAIToggle')}
            </label>
            <p className="text-sm text-slate-600">{l('personalAIHelp')}</p>
        </Card>
        <Card>
            <h2 className="text-lg font-bold text-slate-800">Formato e lunghezza risposte</h2>
            <p className="text-sm text-slate-600">Impostazione del docente per la classe: se valorizzata, sostituisce la scelta dello studente in chat.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-1 text-sm text-slate-700">Formato
                    <select className="min-h-[44px] rounded-md border border-slate-300 bg-white px-2" value={responseFormat ?? ''} disabled={busy}
                        onChange={event => { if (!pending.current) { setResponseFormat((event.target.value || null) as ResponseFormat | null); setNotice(null); } }}>
                        <option value="">Predefinito studente</option>
                        <option value="standard">Discorsivo</option>
                        <option value="bullets">Per punti</option>
                        <option value="table">Tabella</option>
                    </select>
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-sm text-slate-700">Lunghezza
                    <select className="min-h-[44px] rounded-md border border-slate-300 bg-white px-2" value={responseLength ?? ''} disabled={busy}
                        onChange={event => { if (!pending.current) { setResponseLength((event.target.value || null) as "short" | "medium" | "long" | null); setNotice(null); } }}>
                        <option value="">Predefinito studente</option>
                        <option value="short">Breve</option>
                        <option value="medium">Media</option>
                        <option value="long">Lunga</option>
                    </select>
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-sm text-slate-700">Ragionamento
                    <select className="min-h-[44px] rounded-md border border-slate-300 bg-white px-2" value={responseReasoning ?? ''} disabled={busy}
                        onChange={event => { if (!pending.current) { setResponseReasoning((event.target.value || null) as "off" | "standard" | "deep" | null); setNotice(null); } }}>
                        <option value="">Predefinito studente</option>
                        <option value="off">Off</option>
                        <option value="standard">Standard</option>
                        <option value="deep">Deep</option>
                    </select>
                </label>
            </div>
            <div className="space-y-2">
                <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate-700">
                    <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={allowFmt} disabled={busy}
                        onChange={event => { if (!pending.current) { setAllowFmt(event.target.checked); setNotice(null); } }} />
                    Studente può modificare il formato
                </label>
                <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate-700">
                    <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={allowLen} disabled={busy}
                        onChange={event => { if (!pending.current) { setAllowLen(event.target.checked); setNotice(null); } }} />
                    Studente può modificare la lunghezza
                </label>
                <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate-700">
                    <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={allowRsn} disabled={busy}
                        onChange={event => { if (!pending.current) { setAllowRsn(event.target.checked); setNotice(null); } }} />
                    Studente può modificare il ragionamento
                </label>
            </div>
        </Card>
        <Card>
            <h2 className="text-lg font-bold text-slate-800">{forumText(lang, 'options')}</h2>
            {(['students_can_open', 'premoderation'] as const).map(name => {
                const title = forumText(lang, name === 'students_can_open' ? 'studentsCanOpen' : 'premoderationOption');
                const metadata = forum[`${name}_lock`];
                return <div key={name} className="mb-3 space-y-1">
                    <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate-700">
                        <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={forum[name]} disabled={busy || forum[`${name}_locked`]}
                            onChange={event => { if (!pending.current) { setForum(previous => ({ ...previous, [name]: event.target.checked })); setNotice(null); } }} />
                        {title}
                        {forum[`${name}_locked`] && <span className="flex items-center gap-1"><Lock className="h-4 w-4" aria-hidden />{forumText(lang, 'lockedOption')}</span>}
                    </label>
                    <ClassSettingLock label={title} admin={admin} disabled={busy || dirty}
                        item={{ admin_enabled: true, locked: forum[`${name}_locked`], locked_enabled: metadata?.value,
                            locked_by: metadata?.locked_by, locked_at: metadata?.locked_at, changed_by_admin: forum[`${name}_changed_by_admin`] }}
                        onChange={state => void changeLock('forum_option', name, state)} />
                </div>;
            })}
        </Card>
        <StickyActions>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="min-w-0 flex-1 text-sm">
                    {notice && <p role={notice === 'saved' ? 'status' : 'alert'} className={notice === 'saved' ? 'text-emerald-700' : 'text-red-600'}>{l(notice)}</p>}
                    {dirty && <p className="text-slate-600">{l('dirty')}</p>}
                    {(notice === 'conflict' || notice === 'invalid' || notice === 'lockedError') && <Button variant="secondary" disabled={busy} onClick={reload}>{l('reload')}</Button>}
                </div>
                <Button disabled={busy || !dirty || notice === 'conflict'} onClick={() => void save()}>{l(busy ? 'saving' : 'save')}</Button>
            </div>
        </StickyActions>
    </div>;
}

// `adminRoute`: aperta da /admin/classi/{id}. Un admin che è anche docente può
// aprire la stessa classe da /docente/classi/{id}: «indietro» torna da dove è venuto.
function ClassDetail({ groupId, admin, adminRoute }: { groupId: number; admin: boolean; adminRoute: boolean }) {
    const { lang } = useI18n();
    const l = (key: TextKey) => classSettingsText(lang, key);
    const groups = useTeacherResource('/api/admin/groups', parseClassGroups);
    const settings = useTeacherResource(`/api/teacher/groups/${groupId}/settings`, parseClassSettings);
    const [tab, setTab] = useState<'overview' | 'students' | 'paths' | 'forum' | 'audit' | 'toolsTab' | 'council' | 'noticing'>(() => {
        const raw = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
        return ({
            students: 'students',
            results: 'students',
            tools: 'toolsTab',
            toolsTab: 'toolsTab',
            paths: 'paths',
            forum: 'forum',
            audit: 'audit',
            council: 'council',
            noticing: 'noticing',
        } as const)[raw as 'students'] ?? 'overview';
    });
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const group = groups.data?.find(row => row.id === groupId);
    if (groups.forbidden || settings.forbidden) return <TeacherForbidden />;
    if (groups.loading || settings.loading) return <TeacherLoading />;
    if (groups.failed || settings.failed || !group || !settings.data || settings.data.group_id !== groupId) return <Callout variant="danger">
        <p>{l('loadError')}</p>
        <Button variant="secondary" onClick={() => { void groups.reload(); void settings.reload(); }}>{l('reload')}</Button>
    </Callout>;
    const activeTabs = ['overview', 'students', 'noticing', 'paths', 'forum', 'council', 'audit', 'toolsTab'] as const;
    const breadcrumbItems = getClassBreadcrumbs(group.name, groupId, tab, lang, adminRoute);
    return <div className="space-y-5">
        <TeacherBreadcrumbs
            items={breadcrumbItems}
            extra={<ClassQuickSwitcher currentGroupId={groupId} groups={groups.data} currentTab={tab} basePath={adminRoute ? '/admin/classi' : '/docente/classi'} />}
        />
        <header className="flex flex-wrap items-center justify-between gap-3">
            <Link href={adminRoute ? ADMIN_CLASSES_HREF : "/docente/classi"} className="inline-flex min-h-[44px] items-center gap-2 text-sm text-indigo-700 hover:text-indigo-800 font-medium"><ArrowLeft className="h-4 w-4" aria-hidden />{l('back')}</Link>
            <div><h1 className="break-words text-2xl font-bold text-slate-800">{group.name}</h1><p className="text-sm text-slate-600">{group.members_count} {l('members')}{group.school && ` · ${group.school}`}</p></div>
        </header>
        <div role="tablist" aria-label={group.name} className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
            {activeTabs.map((key, index) => <button key={key} ref={node => { tabRefs.current[index] = node; }}
                id={`class-tab-${key}`} type="button" role="tab" aria-selected={tab === key} aria-controls={`class-panel-${key}`}
                tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)}
                onKeyDown={event => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? activeTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + activeTabs.length) % activeTabs.length;
                    setTab(activeTabs[next]); tabRefs.current[next]?.focus();
                }} className={`min-h-[44px] rounded-md px-4 text-sm font-semibold ${tab === key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>{l(key)}</button>)}
        </div>
        <div id="class-panel-overview" role="tabpanel" aria-labelledby="class-tab-overview" hidden={tab !== 'overview'} tabIndex={0}>
            {tab === 'overview' && (
                <ClassOverviewTab
                    group={group}
                    settings={settings.data}
                    onReload={() => { void groups.reload(); void settings.reload(); }}
                    onSelectTab={(newTab) => setTab(newTab)}
                    admin={admin}
                    adminRoute={adminRoute}
                />
            )}
        </div>
        <div id="class-panel-students" role="tabpanel" aria-labelledby="class-tab-students" hidden={tab !== 'students'} tabIndex={0}>
            {tab === 'students' && <PlanStudentsPanel base={`/api/admin/groups/${groupId}`} withNotes />}
        </div>
        <div id="class-panel-noticing" role="tabpanel" aria-labelledby="class-tab-noticing" hidden={tab !== 'noticing'} tabIndex={0}>
            {tab === 'noticing' && <ClassNoticingTab groupId={groupId} />}
        </div>
        <div id="class-panel-paths" role="tabpanel" aria-labelledby="class-tab-paths" hidden={tab !== 'paths'} tabIndex={0}>
            <ClassPathsTab groupId={groupId} classSettings={settings.data} institutionId={group.institution_id ?? null} />
        </div>
        <div id="class-panel-forum" role="tabpanel" aria-labelledby="class-tab-forum" hidden={tab !== 'forum'} tabIndex={0}>
            <ForumView groupId={groupId} />
        </div>
        <div id="class-panel-council" role="tabpanel" aria-labelledby="class-tab-council" hidden={tab !== 'council'} tabIndex={0}>
            {tab === 'council' && <ClassCouncilTab groupId={groupId} />}
        </div>
        <div id="class-panel-audit" role="tabpanel" aria-labelledby="class-tab-audit" hidden={tab !== 'audit'} tabIndex={0}>
            {tab === 'audit' && <ClassSettingsAudit key={settings.data.revision} settings={settings.data} />}
        </div>
        <div id="class-panel-toolsTab" role="tabpanel" aria-labelledby="class-tab-toolsTab" hidden={tab !== 'toolsTab'} tabIndex={0}>
            <ClassToolsEditor admin={admin} initial={settings.data} onReload={() => { void settings.reload(); }} />
        </div>
    </div>;

}

export function ClassSettingsPage({ groupId, adminOnly = false }: { groupId: number; adminOnly?: boolean }) {
    const { state } = useTeacherAccessState();
    const [admin, setAdmin] = useState<boolean | null>(null);
    useEffect(() => { let active = true; void getIdentity().then(identity => { if (active) setAdmin(identity?.is_admin === true); }); return () => { active = false; }; }, []);
    if (state === 'loading' || admin === null) return <TeacherLoading />;
    if (state === 'forbidden' || (adminOnly && !admin)) return <TeacherForbidden />;
    return <div className="min-h-screen bg-slate-50"><section className="page-wide px-4 py-8"><ClassDetail key={groupId} groupId={groupId} admin={admin} adminRoute={adminOnly} /></section></div>;
}
