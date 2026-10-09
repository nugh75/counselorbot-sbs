'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import { defaultForumOptions, effectiveDefaultCounselor, filterClassCounselors, parseClassSettings, type ClassCounselor, type ClassSettings, type ClassTool } from '@/lib/class-settings';
import { formatCategoryLabel } from '@/lib/i18n-counselor-identity';
import { classSettingsText, classSettingsTexts } from '@/lib/i18n-class-settings';
import { forumText } from '@/lib/i18n-forum';
import { useI18n } from '@/lib/i18n-context';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { StickyActions } from '@/components/ui/StickyActions';
import { ForumView } from '@/components/forum/ForumView';
import { TeacherForbidden, TeacherLoading } from './TeacherAccess';
import { ClassPathsTab } from './ClassPathsTab';
import { useTeacherAccessState } from './useTeacherAccessState';
import { useTeacherResource } from './useTeacherResource';
import { parseClassGroups } from './class-group-types';

type TextKey = keyof typeof classSettingsTexts;
const categories = ['assessment', 'guided', 'personal', 'support', 'forum'] as const;
const sameIds = (a: readonly (string | number)[], b: readonly (string | number)[]) =>
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

function ClassCounselorsSection({ counselors, disabled, defaultId, busy, onToggle, onDefault }: {
    counselors: ClassCounselor[]; disabled: number[]; defaultId: number | null; busy: boolean;
    onToggle: (id: number, enabled: boolean) => void; onDefault: (id: number | null) => void;
}) {
    const { lang } = useI18n();
    const l = (key: TextKey) => classSettingsText(lang, key);
    const [category, setCategory] = useState('');
    const [query, setQuery] = useState('');
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
            <div role="radiogroup" aria-label={l('counselorDefault')} className="space-y-1">
                <label className="flex min-h-[44px] items-center gap-3 rounded-md p-2 text-sm text-slate-700">
                    <input type="radio" name="class-default-counselor" className="h-5 w-5 accent-indigo-600" checked={defaultId === null}
                        disabled={busy} onChange={() => onDefault(null)} />{l('counselorNoDefault')}
                </label>
                {rows.map(row => <div key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md p-2">
                    <label className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-sm text-slate-700">
                        <input type="checkbox" className="h-5 w-5 shrink-0 accent-indigo-600" aria-label={row.name}
                            checked={isEnabled(row)} disabled={busy || !row.admin_enabled}
                            aria-describedby={!row.admin_enabled ? `counselor-disabled-${row.id}` : undefined}
                            onChange={event => onToggle(row.id, event.target.checked)} />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {row.avatar_url && <img src={row.avatar_url} alt="" className="h-8 w-14 shrink-0 rounded object-cover" />}
                        <span className="min-w-0 break-words"><span className="font-medium">{row.name}</span>
                            {row.approach_categories.length > 0 && <span className="ml-2 text-xs text-slate-500">{row.approach_categories.map(item => formatCategoryLabel(item, lang)).join(' · ')}</span>}
                            {!row.admin_enabled && <span id={`counselor-disabled-${row.id}`} className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Lock className="h-4 w-4 shrink-0" aria-hidden />{l('platformDisabled')}</span>}
                        </span>
                    </label>
                    <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-600">
                        <input type="radio" name="class-default-counselor" className="h-5 w-5 accent-indigo-600"
                            aria-label={`${l('counselorDefault')}: ${row.name}`} checked={defaultId === row.id}
                            disabled={busy || !isEnabled(row)} onChange={() => onDefault(row.id)} />{l('counselorDefault')}
                    </label>
                </div>)}
            </div>
            {rows.length === 0 && <p className="text-sm text-slate-600">{l('counselorNoMatch')}</p>}
            <p className="text-sm text-slate-600">{l('counselorsPrivate')}</p>
        </section>
    </Card>;
}

function ClassToolsEditor({ initial, onReload }: { initial: ClassSettings; onReload: () => void }) {
    const { lang } = useI18n();
    const l = (key: TextKey) => classSettingsText(lang, key);
    const [settings, setSettings] = useState(initial);
    const [disabled, setDisabled] = useState(initial.disabled_tool_keys);
    const [disabledCounselors, setDisabledCounselors] = useState(initial.disabled_counselor_ids);
    const [defaultCounselor, setDefaultCounselor] = useState(effectiveDefaultCounselor(initial));
    const [forum, setForum] = useState(initial.forum ?? defaultForumOptions);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<'saved' | 'error' | 'conflict' | 'invalid' | null>(null);
    const [forbidden, setForbidden] = useState(false);
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
        || forum.premoderation !== (settings.forum ?? defaultForumOptions).premoderation;
    useDraftGuard(dirty || busy, l('discard'), { blocked: busy });
    const tools = settings.tools.filter(tool => !tool.always_on);
    const isEnabled = (tool: ClassTool) => tool.admin_enabled && !disabled.includes(tool.key);
    const label = (tool: ClassTool) => tool.kind === 'personal' && tool.key in classSettingsTexts
        ? l(tool.key as TextKey) : tool.label_i18n[lang] || tool.label_i18n.en || tool.label_i18n.it || tool.key;
    const change = (rows: ClassTool[], enabled: boolean) => {
        if (pending.current) return;
        const editable = rows.filter(tool => tool.admin_enabled && !tool.always_on).map(tool => tool.key);
        setDisabled(previous => enabled ? previous.filter(key => !editable.includes(key)) : [...new Set([...previous, ...editable])].sort());
        if (notice === 'saved') setNotice(null);
    };
    const toggleCounselor = (id: number, enabled: boolean) => {
        if (pending.current) return;
        setDisabledCounselors(previous => enabled ? previous.filter(item => item !== id) : [...new Set([...previous, id])].sort((a, b) => a - b));
        // A disabled counselor cannot stay the class default.
        if (!enabled) setDefaultCounselor(current => current === id ? null : current);
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
                }),
            });
            if (!current()) return;
            if (account.current !== getViewAsAccount()?.username || response.status === 401 || response.status === 403) {
                setForbidden(true); return;
            }
            if (response.status === 409) { setNotice('conflict'); return; }
            if (response.status === 422) { setNotice('invalid'); return; }
            if (!response.ok) throw new Error('Save failed');
            const next = parseClassSettings(await response.json());
            if (next.group_id !== settings.group_id) throw new Error('Wrong class');
            if (current() && account.current === getViewAsAccount()?.username) {
                setSettings(next); setDisabled(next.disabled_tool_keys);
                setDisabledCounselors(next.disabled_counselor_ids); setDefaultCounselor(effectiveDefaultCounselor(next));
                setForum(next.forum ?? defaultForumOptions);
                setNotice('saved');
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
    if (forbidden) return <TeacherForbidden />;
    return <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800">{l('tools')}</h2>
            <p className="text-sm text-slate-600">{l('enabled')} {tools.filter(isEnabled).length} / {tools.length} <span className="font-mono">{`(r${settings.revision})`}</span></p>
        </div>
        <Callout>{l('staged')}</Callout>
        {categories.map(category => {
            const rows = tools.filter(tool => tool.category === category);
            if (!rows.length) return null;
            return <Card key={category}>
                <details open>
                    <summary className="min-h-[44px] cursor-pointer font-semibold text-slate-800">{l(category)}</summary>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <Button variant="secondary" disabled={busy || !rows.some(tool => tool.admin_enabled)} onClick={() => change(rows, true)}>{l('enableAll')}</Button>
                        <Button variant="secondary" disabled={busy || !rows.some(tool => tool.admin_enabled)} onClick={() => change(rows, false)}>{l('disableAll')}</Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {rows.map(tool => <label key={tool.key} className="flex min-h-[44px] min-w-0 items-start gap-3 rounded-md p-2 text-sm text-slate-700">
                            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-indigo-600" aria-label={label(tool)}
                                checked={isEnabled(tool)} disabled={busy || !tool.admin_enabled}
                                aria-describedby={!tool.admin_enabled ? `tool-disabled-${tool.key}` : undefined}
                                onChange={event => change([tool], event.target.checked)} />
                            <span className="min-w-0 break-words">{tool.kind === 'instrument' && label(tool) !== tool.key && <span className="mr-2 font-mono text-xs">{tool.key}</span>}{label(tool)}
                                {!tool.admin_enabled && <span id={`tool-disabled-${tool.key}`} className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Lock className="h-4 w-4 shrink-0" aria-hidden />{l('platformDisabled')}</span>}
                            </span>
                        </label>)}
                    </div>
                </details>
            </Card>;
        })}
        <p className="text-sm text-slate-600">{l('always')}: {settings.tools.filter(tool => tool.always_on).map(label).join(' · ')}</p>
        {settings.counselors.length > 0 && <ClassCounselorsSection counselors={settings.counselors} disabled={disabledCounselors}
            defaultId={defaultCounselor} busy={busy} onToggle={toggleCounselor} onDefault={chooseDefault} />}
        <Card>
            <h2 className="text-lg font-bold text-slate-800">{forumText(lang, 'options')}</h2>
            {(['students_can_open', 'premoderation'] as const).map(name => <label key={name} className="flex min-h-[44px] items-center gap-3 text-sm text-slate-700">
                <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={forum[name]} disabled={busy || forum[`${name}_locked`]}
                    onChange={event => { if (!pending.current) { setForum(previous => ({ ...previous, [name]: event.target.checked })); setNotice(null); } }} />
                {forumText(lang, name === 'students_can_open' ? 'studentsCanOpen' : 'premoderationOption')}
                {forum[`${name}_locked`] && <span className="flex items-center gap-1"><Lock className="h-4 w-4" aria-hidden />{forumText(lang, 'lockedOption')}</span>}
            </label>)}
        </Card>
        <StickyActions>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="min-w-0 flex-1 text-sm">
                    {notice && <p role={notice === 'saved' ? 'status' : 'alert'} className={notice === 'saved' ? 'text-emerald-700' : 'text-red-600'}>{l(notice)}</p>}
                    {dirty && <p className="text-slate-600">{l('dirty')}</p>}
                    {(notice === 'conflict' || notice === 'invalid') && <Button variant="secondary" disabled={busy} onClick={reload}>{l('reload')}</Button>}
                </div>
                <Button disabled={busy || !dirty || notice === 'conflict'} onClick={() => void save()}>{l(busy ? 'saving' : 'save')}</Button>
            </div>
        </StickyActions>
    </div>;
}

function ClassDetail({ groupId }: { groupId: number }) {
    const { lang } = useI18n();
    const l = (key: TextKey) => classSettingsText(lang, key);
    const groups = useTeacherResource('/api/admin/groups', parseClassGroups);
    const settings = useTeacherResource(`/api/teacher/groups/${groupId}/settings`, parseClassSettings);
    const [tab, setTab] = useState<'overview' | 'toolsTab' | 'paths' | 'forum'>('overview');
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const group = groups.data?.find(row => row.id === groupId);
    if (groups.forbidden || settings.forbidden) return <TeacherForbidden />;
    if (groups.loading || settings.loading) return <TeacherLoading />;
    if (groups.failed || settings.failed || !group || !settings.data || settings.data.group_id !== groupId) return <Callout variant="danger">
        <p>{l('loadError')}</p>
        <Button variant="secondary" onClick={() => { void groups.reload(); void settings.reload(); }}>{l('reload')}</Button>
    </Callout>;
    const activeTabs = ['overview', 'toolsTab', 'paths', 'forum'] as const;
    return <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/docente/classi" className="inline-flex min-h-[44px] items-center gap-2 text-sm text-indigo-700"><ArrowLeft className="h-4 w-4" aria-hidden />{l('back')}</Link>
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
            <Card><p className="font-mono text-sm text-slate-600">{group.code}</p>
                {group.description && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{group.description}</p>}
                {group.methodologies && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{group.methodologies}</p>}
                <Link href="/docente/classi" className="mt-3 inline-flex min-h-[44px] items-center text-sm text-indigo-700">{l('back')}</Link>
            </Card>
        </div>
        <div id="class-panel-toolsTab" role="tabpanel" aria-labelledby="class-tab-toolsTab" hidden={tab !== 'toolsTab'} tabIndex={0}>
            <ClassToolsEditor initial={settings.data} onReload={() => { void settings.reload(); }} />
        </div>
        <div id="class-panel-paths" role="tabpanel" aria-labelledby="class-tab-paths" hidden={tab !== 'paths'} tabIndex={0}>
            <ClassPathsTab groupId={groupId} classSettings={settings.data} />
        </div>
        <div id="class-panel-forum" role="tabpanel" aria-labelledby="class-tab-forum" hidden={tab !== 'forum'} tabIndex={0}>
            <ForumView groupId={groupId} />
        </div>
    </div>;

}

export function ClassSettingsPage({ groupId }: { groupId: number }) {
    const { state } = useTeacherAccessState();
    if (state === 'loading') return <TeacherLoading />;
    if (state === 'forbidden') return <TeacherForbidden />;
    return <div className="min-h-screen bg-slate-50"><section className="page-wide px-4 py-8"><ClassDetail key={groupId} groupId={groupId} /></section></div>;
}
