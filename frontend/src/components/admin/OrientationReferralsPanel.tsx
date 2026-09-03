'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, Plus, Trash2 } from 'lucide-react';

import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { type Institution } from '@/lib/referrals-api';

type Lang = 'it' | 'en' | 'es' | 'fr' | 'de' | 'sv';
const LANGS: Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];
const AUDIENCES = ['secondaria', 'universita', 'adulti'] as const;
const EVENT_KINDS = ['open-day', 'workshop', 'sportello', 'fiera', 'scadenza', 'webinar'] as const;

interface Need { code: string; label: string; }

interface Referral {
    id: number; slug: string; institution_id: number | null;
    role_label_i18n: Record<string, string>; person_name: string | null;
    needs: string[] | null; audience: string[] | null;
    contact_channel: Record<string, string> | null;
    what_for_i18n: Record<string, string> | null;
    how_to_reach_i18n: Record<string, string> | null;
    status: string; is_active: boolean; sort_order: number;
    // Avviso editoriale calcolato dal server (email fuori dal dominio
    // dell'istituto): non blocca nulla, ma l'admin deve vederlo.
    warning?: string;
}

interface EventRow {
    id: number; slug: string; institution_id: number | null; kind: string;
    title_i18n: Record<string, string>; summary_i18n: Record<string, string> | null;
    starts_at: string; ends_at: string; registration_deadline: string | null;
    page_url: string | null; location: string | null; is_online: boolean;
    needs: string[] | null; audience: string[] | null;
    status: string; is_active: boolean; sort_order: number;
}

function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function OrientationReferralsPanel() {
    const { t } = useI18n();
    const [tab, setTab] = useState<'people' | 'events'>('people');
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [needs, setNeeds] = useState<Need[]>([]);
    const [referrals, setReferrals] = useState<Referral[]>([]);
    const [events, setEvents] = useState<EventRow[]>([]);
    const [institutionFilter, setInstitutionFilter] = useState<string>('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setError('');
        try {
            const [i, n, r, e] = await Promise.all([
                apiFetch('/admin/institutions').then((res) => res.json()),
                apiFetch('/admin/referral-needs').then((res) => res.json()),
                apiFetch('/admin/orientation-referrals').then((res) => res.json()),
                apiFetch('/admin/orientation-events').then((res) => res.json()),
            ]);
            setInstitutions(i); setNeeds(n); setReferrals(r); setEvents(e);
        } catch {
            setError(t('admin.referrals.loadError'));
        }
    }, [t]);

    // Falso positivo della regola: è il normale caricamento al mount, identico
    // al pattern usato in tutto il pannello admin (es. ToolBriefsPanel).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void load(); }, [load]);

    // Il messaggio del server è la spiegazione del guard di certificazione:
    // mostrarlo com'è dice all'admin che cosa manca, un "errore" generico no.
    const save = async (path: string, method: 'POST' | 'PUT', body: unknown) => {
        const res = await apiFetch(path, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const detail = await res.json().catch(() => ({}));
            setError(typeof detail.detail === 'string' ? detail.detail : `HTTP ${res.status}`);
            return false;
        }
        await load();
        return true;
    };

    const remove = async (path: string) => {
        const res = await apiFetch(path, { method: 'DELETE' });
        if (res.ok) await load();
    };

    const matchesFilter = (institutionId: number | null) =>
        !institutionFilter || String(institutionId ?? '') === institutionFilter;

    const institutionName = (id: number | null) =>
        id === null ? t('admin.referrals.national') : (institutions.find((i) => i.id === id)?.name ?? '—');

    return (
        <div className="space-y-4">
            {error && (
                <p className="flex items-center gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    <AlertTriangle className="h-4 w-4" /> {error}
                </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-1 rounded-md bg-slate-100 p-1">
                    {(['people', 'events'] as const).map((id) => (
                        <button key={id} type="button" onClick={() => setTab(id)}
                                className={`rounded px-3 py-1 text-sm ${tab === id ? 'bg-white shadow-sm' : 'text-slate-600'}`}>
                            {t(id === 'people' ? 'admin.referrals.people' : 'admin.referrals.events')}
                        </button>
                    ))}
                </div>
                <select value={institutionFilter} onChange={(e) => setInstitutionFilter(e.target.value)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                    <option value="">{t('admin.referrals.allInstitutions')}</option>
                    {institutions.map((i) => <option key={i.id} value={String(i.id)}>{i.name}</option>)}
                </select>
            </div>

            {tab === 'people' ? (
                <ReferralList
                    rows={referrals.filter((r) => matchesFilter(r.institution_id))}
                    institutions={institutions} needs={needs}
                    institutionName={institutionName}
                    onSave={(id, body) => save(
                        id ? `/admin/orientation-referrals/${id}` : '/admin/orientation-referrals',
                        id ? 'PUT' : 'POST', body)}
                    onDelete={(id) => remove(`/admin/orientation-referrals/${id}`)}
                />
            ) : (
                <EventList
                    rows={events.filter((e) => matchesFilter(e.institution_id))}
                    institutions={institutions} needs={needs}
                    institutionName={institutionName}
                    onSave={(id, body) => save(
                        id ? `/admin/orientation-events/${id}` : '/admin/orientation-events',
                        id ? 'PUT' : 'POST', body)}
                    onDelete={(id) => remove(`/admin/orientation-events/${id}`)}
                />
            )}
        </div>
    );
}

function Chips({ values, selected, labelOf, onToggle }: {
    values: string[]; selected: string[];
    labelOf: (v: string) => string; onToggle: (v: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-1">
            {values.map((value) => (
                <button key={value} type="button" onClick={() => onToggle(value)}
                        className={`rounded-full px-2 py-0.5 text-xs ${
                            selected.includes(value) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {labelOf(value)}
                </button>
            ))}
        </div>
    );
}

/** Un campo per lingua: il contratto i18n del catalogo è un dizionario, non
 *  una colonna, e l'admin deve vedere quali lingue ha davvero compilato. */
function I18nFields({ label, value, onChange }: {
    label: string; value: Record<string, string>;
    onChange: (next: Record<string, string>) => void;
}) {
    return (
        <div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</p>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {LANGS.map((lang) => (
                    <label key={lang} className="flex items-center gap-2">
                        <span className="w-6 text-xs uppercase text-slate-400">{lang}</span>
                        <input value={value[lang] || ''}
                               onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
                               className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                    </label>
                ))}
            </div>
        </div>
    );
}

function SharedFields({ form, setForm, institutions, needs }: {
    form: Record<string, unknown>;
    setForm: (next: Record<string, unknown>) => void;
    institutions: Institution[]; needs: Need[];
}) {
    const { t } = useI18n();
    const selectedNeeds = (form.needs as string[]) || [];
    const selectedAudience = (form.audience as string[]) || [];
    return (
        <>
            <label className="block">
                {/* "slug" è un token tecnico dello schema, uguale in ogni lingua: vedi allowedVisibleText in check-i18n.mjs */}
                <span className="text-xs uppercase text-slate-500">slug</span>
                <input value={(form.slug as string) || ''}
                       onChange={(e) => setForm({ ...form, slug: e.target.value })}
                       className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
            </label>
            <label className="block">
                <span className="text-xs uppercase text-slate-500">{t('admin.referrals.field.institution')}</span>
                <select value={form.institution_id === null ? '' : String(form.institution_id)}
                        onChange={(e) => setForm({
                            ...form,
                            institution_id: e.target.value ? Number(e.target.value) : null,
                        })}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
                    <option value="">{t('admin.referrals.national')}</option>
                    {institutions.map((i) => <option key={i.id} value={String(i.id)}>{i.name}</option>)}
                </select>
            </label>
            <div>
                <p className="text-xs uppercase text-slate-500">{t('admin.referrals.field.needs')}</p>
                <Chips values={needs.map((n) => n.code)} selected={selectedNeeds}
                       labelOf={(c) => needs.find((n) => n.code === c)?.label ?? c}
                       onToggle={(c) => setForm({ ...form, needs: toggle(selectedNeeds, c) })} />
            </div>
            <div>
                <p className="text-xs uppercase text-slate-500">{t('admin.referrals.field.audience')}</p>
                <Chips values={[...AUDIENCES]} selected={selectedAudience} labelOf={(a) => a}
                       onToggle={(a) => setForm({ ...form, audience: toggle(selectedAudience, a) })} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
                {/* "draft"/"certified" sono i valori letterali dello stato salvati dal backend, uguali in ogni lingua */}
                <select value={(form.status as string) || 'draft'}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                    <option value="draft">draft</option>
                    <option value="certified">certified</option>
                </select>
                <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={Boolean(form.is_active)}
                           onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                    {t('admin.referrals.field.active')}
                </label>
                <label className="flex items-center gap-1 text-sm">
                    {t('admin.referrals.field.order')}
                    <input type="number" value={Number(form.sort_order) || 0}
                           onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                           className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm" />
                </label>
            </div>
        </>
    );
}

const EMPTY_REFERRAL = {
    slug: '', institution_id: null, role_label_i18n: {}, person_name: '',
    needs: [], audience: [], contact_channel: {}, what_for_i18n: {}, how_to_reach_i18n: {},
    status: 'draft', is_active: true, sort_order: 0,
};

function ReferralList({ rows, institutions, needs, institutionName, onSave, onDelete }: {
    rows: Referral[];
    institutions: Institution[]; needs: Need[];
    institutionName: (id: number | null) => string;
    onSave: (id: number | null, body: unknown) => Promise<boolean>;
    onDelete: (id: number) => void;
}) {
    const { t } = useI18n();
    const [editing, setEditing] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<Record<string, unknown>>(EMPTY_REFERRAL);

    const open = (row?: Referral) => {
        setEditing(row ? row.id : 'new');
        setForm(row ? { ...row } : { ...EMPTY_REFERRAL });
    };

    const channel = (form.contact_channel as Record<string, string>) || {};
    const setChannel = (key: string, value: string) =>
        setForm({ ...form, contact_channel: { ...channel, [key]: value } });

    return (
        <div className="space-y-3">
            <button type="button" onClick={() => open()}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-sm text-white">
                <Plus className="h-4 w-4" /> {t('admin.referrals.newPerson')}
            </button>

            {rows.map((row) => (
                <article key={row.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        {row.status === 'certified' && <BadgeCheck className="h-4 w-4 text-emerald-600" />}
                        <span className="text-sm font-semibold text-slate-800">
                            {row.role_label_i18n.it || row.role_label_i18n.en || row.slug}
                        </span>
                        <span className="text-xs text-slate-500">{institutionName(row.institution_id)}</span>
                        <button type="button" onClick={() => open(row)} className="text-xs text-indigo-600">{t('admin.referrals.edit')}</button>
                        <button type="button" onClick={() => onDelete(row.id)} className="text-xs text-rose-600">
                            <Trash2 className="h-3 w-3" />
                        </button>
                    </div>
                    {row.warning && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                            <AlertTriangle className="h-3 w-3" /> {row.warning}
                        </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">{(row.needs || []).join(' · ')}</p>
                </article>
            ))}

            {editing !== null && (
                <form className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3"
                      onSubmit={async (e) => {
                          e.preventDefault();
                          const id = editing === 'new' ? null : editing;
                          if (await onSave(id, form)) setEditing(null);
                      }}>
                    <SharedFields form={form} setForm={setForm} institutions={institutions} needs={needs} />
                    <I18nFields label="ruolo o ufficio"
                                value={(form.role_label_i18n as Record<string, string>) || {}}
                                onChange={(v) => setForm({ ...form, role_label_i18n: v })} />
                    <I18nFields label="cosa puoi chiedere"
                                value={(form.what_for_i18n as Record<string, string>) || {}}
                                onChange={(v) => setForm({ ...form, what_for_i18n: v })} />
                    <I18nFields label="come raggiungerla"
                                value={(form.how_to_reach_i18n as Record<string, string>) || {}}
                                onChange={(v) => setForm({ ...form, how_to_reach_i18n: v })} />
                    <label className="block">
                        <span className="text-xs uppercase text-slate-500">{t('admin.referrals.field.personName')}</span>
                        <input value={(form.person_name as string) || ''}
                               onChange={(e) => setForm({ ...form, person_name: e.target.value })}
                               className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {(['email', 'hours', 'location', 'page_url'] as const).map((key) => (
                            <label key={key} className="block">
                                <span className="text-xs uppercase text-slate-500">{key}</span>
                                <input value={channel[key] || ''} onChange={(e) => setChannel(key, e.target.value)}
                                       className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                            </label>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="rounded-md bg-indigo-600 px-3 py-1 text-sm text-white">{t('admin.referrals.save')}</button>
                        <button type="button" onClick={() => setEditing(null)} className="text-sm text-slate-600">{t('admin.referrals.cancel')}</button>
                    </div>
                </form>
            )}
        </div>
    );
}

const EMPTY_EVENT = {
    slug: '', institution_id: null, kind: 'open-day', title_i18n: {}, summary_i18n: {},
    starts_at: '', ends_at: '', registration_deadline: '', page_url: '', location: '',
    is_online: false, needs: [], audience: [], status: 'draft', is_active: true, sort_order: 0,
};

function EventList({ rows, institutions, needs, institutionName, onSave, onDelete }: {
    rows: EventRow[]; institutions: Institution[]; needs: Need[];
    institutionName: (id: number | null) => string;
    onSave: (id: number | null, body: unknown) => Promise<boolean>;
    onDelete: (id: number) => void;
}) {
    const { t } = useI18n();
    const [editing, setEditing] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<Record<string, unknown>>(EMPTY_EVENT);

    const open = (row?: EventRow) => {
        setEditing(row ? row.id : 'new');
        // `datetime-local` vuole i primi 16 caratteri ISO senza fuso.
        setForm(row ? {
            ...row,
            starts_at: (row.starts_at || '').slice(0, 16),
            ends_at: (row.ends_at || '').slice(0, 16),
            registration_deadline: (row.registration_deadline || '').slice(0, 16),
        } : { ...EMPTY_EVENT });
    };

    return (
        <div className="space-y-3">
            <button type="button" onClick={() => open()}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-sm text-white">
                <Plus className="h-4 w-4" /> {t('admin.referrals.newEvent')}
            </button>

            {rows.map((row) => (
                <article key={row.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        {row.status === 'certified' && <BadgeCheck className="h-4 w-4 text-emerald-600" />}
                        <span className="text-sm font-semibold text-slate-800">
                            {row.title_i18n.it || row.title_i18n.en || row.slug}
                        </span>
                        <span className="text-xs text-slate-500">
                            {row.starts_at.slice(0, 10)} · {institutionName(row.institution_id)}
                        </span>
                        <button type="button" onClick={() => open(row)} className="text-xs text-indigo-600">{t('admin.referrals.edit')}</button>
                        <button type="button" onClick={() => onDelete(row.id)} className="text-xs text-rose-600">
                            <Trash2 className="h-3 w-3" />
                        </button>
                    </div>
                </article>
            ))}

            {editing !== null && (
                <form className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3"
                      onSubmit={async (e) => {
                          e.preventDefault();
                          const id = editing === 'new' ? null : editing;
                          const body = {
                              ...form,
                              registration_deadline: form.registration_deadline || null,
                          };
                          if (await onSave(id, body)) setEditing(null);
                      }}>
                    <SharedFields form={form} setForm={setForm} institutions={institutions} needs={needs} />
                    <label className="block">
                        <span className="text-xs uppercase text-slate-500">{t('admin.referrals.field.kind')}</span>
                        <select value={(form.kind as string) || 'open-day'}
                                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
                            {EVENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                    </label>
                    <I18nFields label="titolo" value={(form.title_i18n as Record<string, string>) || {}}
                                onChange={(v) => setForm({ ...form, title_i18n: v })} />
                    <I18nFields label="descrizione" value={(form.summary_i18n as Record<string, string>) || {}}
                                onChange={(v) => setForm({ ...form, summary_i18n: v })} />
                    <div className="grid gap-2 sm:grid-cols-3">
                        {(['starts_at', 'ends_at', 'registration_deadline'] as const).map((key) => (
                            <label key={key} className="block">
                                <span className="text-xs uppercase text-slate-500">{key}</span>
                                <input type="datetime-local" value={(form[key] as string) || ''}
                                       onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                                       className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                            </label>
                        ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {/* "page_url" è il nome del campo dello schema, uguale in ogni lingua: vedi allowedVisibleText in check-i18n.mjs */}
                        <label className="block">
                            <span className="text-xs uppercase text-slate-500">page_url</span>
                            <input value={(form.page_url as string) || ''}
                                   onChange={(e) => setForm({ ...form, page_url: e.target.value })}
                                   className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                        </label>
                        <label className="block">
                            <span className="text-xs uppercase text-slate-500">{t('admin.referrals.field.location')}</span>
                            <input value={(form.location as string) || ''}
                                   onChange={(e) => setForm({ ...form, location: e.target.value })}
                                   className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                        </label>
                    </div>
                    {/* "online" è il valore booleano dello schema, uguale in ogni lingua: vedi allowedVisibleText in check-i18n.mjs */}
                    <label className="flex items-center gap-1 text-sm">
                        <input type="checkbox" checked={Boolean(form.is_online)}
                               onChange={(e) => setForm({ ...form, is_online: e.target.checked })} />
                        online
                    </label>
                    <div className="flex gap-2">
                        <button type="submit" className="rounded-md bg-indigo-600 px-3 py-1 text-sm text-white">{t('admin.referrals.save')}</button>
                        <button type="button" onClick={() => setEditing(null)} className="text-sm text-slate-600">{t('admin.referrals.cancel')}</button>
                    </div>
                </form>
            )}
        </div>
    );
}
