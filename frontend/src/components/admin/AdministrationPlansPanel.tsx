'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ArrowRightLeft, CalendarDays, Check, Copy, FileText, Link2, MapPin, Pencil, Plus, QrCode, RefreshCw, Search, Trash2, Users, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch, getAuthUrls } from '@/lib/auth';
import { replacePlan, changePlanArchive, parsePlanInstitutionOptions, planIdFromHash, planInstitutionField, type PlanInstitutionOption } from '@/lib/administration-plans';
import Link from 'next/link';
import { credentialText, type CredentialTextKey } from '@/lib/i18n-institution-credentials';
import { PlanStudentsPanel } from './PlanStudentsPanel';
import { Button } from '@/components/ui/Button';
import { ConfirmInline } from '@/components/ui/ConfirmInline';

type LocaleCode = 'it' | 'en' | 'es' | 'sv';

interface ResearchContact {
    id: number;
    code: string;
    name: string;
    email: string | null;
    institution: string | null;
    is_active: boolean;
}

interface PlanResearcher {
    id: number;
    research_contact_id: number | null;
    external_name: string | null;
    name: string;
    email: string | null;
    institution: string | null;
}

interface AdministrationPlan {
    id: number;
    code: string;
    title: string;
    instrument_code: string;
    group_id: number | null;
    group_name: string | null;
    locale: LocaleCode;
    school_level: string | null;
    scheduled_at: string | null;
    location: string | null;
    institution_id: number | null;
    institution_name: string | null;
    institution_code: string | null;
    institution_credentials_configured: boolean;
    institution_link_state: 'linked' | 'unlinked' | 'needs_reconciliation';
    reconciliation_reason: string | null;
    legacy_institution_code: string | null;
    revision: number;
    notes: string | null;
    status: string;
    created_at: string;
    updated_at: string | null;
    researchers: PlanResearcher[];
    responses_count: number;
}

type FormState = {
    title: string;
    instrument_code: string;
    group_id: string;
    locale: LocaleCode;
    school_level: string;
    scheduled_at: string;
    location: string;
    institution_id: string;
    confirm_reconciliation: boolean;
    notes: string;
    status: string;
    contact_ids: number[];
    external_researchers: string;
};

const EMPTY: FormState = {
    title: '',
    instrument_code: 'QSA',
    group_id: '',
    locale: 'en',
    school_level: '',
    scheduled_at: '',
    location: '',
    institution_id: '',
    confirm_reconciliation: false,
    notes: '',
    status: 'planned',
    contact_ids: [],
    external_researchers: '',
};

const INSTRUMENTS = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP'];
const LOCALES: { value: LocaleCode; label: string }[] = [
    { value: 'it', label: 'Italiano (competenzestrategiche.it)' },
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'sv', label: 'Svenska' },
];
const STATUSES = ['planned', 'active', 'completed', 'archived'];

function optional(value: string) {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDateTime(value: string | null) {
    if (!value) return '';
    return new Date(value).toLocaleString('it-IT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function toDateTimeLocal(value: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toApiDateTime(value: string) {
    return value ? new Date(value).toISOString() : null;
}

function QrThumb({ value, size = 88 }: { value: string; size?: number }) {
    const [src, setSrc] = useState('');
    useEffect(() => {
        let active = true;
        QRCode.toDataURL(value, { width: size * 2, margin: 1 })
            .then((url) => { if (active) setSrc(url); })
            .catch(() => { if (active) setSrc(''); });
        return () => { active = false; };
    }, [value, size]);
    if (!src) return <div style={{ width: size, height: size }} className="shrink-0 rounded-control border border-line bg-surface-sunken" />;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="QR" width={size} height={size} className="shrink-0 rounded-control border border-line bg-surface" />;
}

const PLAN_ERRORS: Record<string, CredentialTextKey> = {
    administration_revision_conflict: 'revisionConflict',
    institution_link_forbidden: 'linkForbidden',
    administration_institution_mismatch: 'reason_class_institution_mismatch',
    institution_inactive: 'reason_institution_inactive',
};

export function AdministrationPlansPanel({ classHref, classLinkLabel }: { classHref?: (groupId: number) => string; classLinkLabel?: string } = {}) {
    const { t, lang } = useI18n();
    const c = (key: CredentialTextKey) => credentialText(lang, key);
    const [plans, setPlans] = useState<AdministrationPlan[]>([]);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [contacts, setContacts] = useState<ResearchContact[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [message, setMessage] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [replacementCode, setReplacementCode] = useState('');
    const [replacementSource, setReplacementSource] = useState<AdministrationPlan | null>(null);
    const replacingPlan = replacementSource ? plans.find(plan => plan.id === replacementSource.id) ?? replacementSource : null;

    const refresh = useCallback(async () => {
        setLoading(true);
        setMessage('');
        setReplacementCode('');
        try {
            const [plansRes, contactsRes] = await Promise.all([
                apiFetch('/api/admin/administration-plans'),
                apiFetch('/api/admin/research-contacts'),
            ]);
            if (plansRes.status === 401 || plansRes.status === 403) {
                window.location.href = '/';
                return;
            }
            if (!plansRes.ok) throw new Error('plans load failed');
            setPlans(await plansRes.json());
            // Se l'endpoint non e' accessibile (rete o permessi), il pannello resta
            // usabile con la lista contatti vuota (solo external_name liberi).
            setContacts(contactsRes.ok ? await contactsRes.json() : []);
        } catch (e) {
            console.error('Failed to load administration plans', e);
            setMessage(t('admin.ap.error.load'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // A classroom link (#plan-<id>) opens the same plan here once the list is loaded.
    const [focusedPlanId, setFocusedPlanId] = useState<number | null>(null);
    useEffect(() => {
        if (loading || typeof window === 'undefined') return;
        const id = planIdFromHash(window.location.hash);
        const node = id ? document.getElementById(`plan-${id}`) : null;
        if (!node) return;
        setFocusedPlanId(id);
        node.scrollIntoView({ block: 'start' });
        node.focus();
    }, [loading]);

    const filteredPlans = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return plans;
        return plans.filter((plan) => [
            plan.title,
            plan.code,
            plan.instrument_code,
            plan.locale,
            plan.location || '',
            plan.researchers.map((researcher) => researcher.name).join(' '),
        ].some((value) => value.toLowerCase().includes(q)));
    }, [plans, query]);

    const activeContacts = useMemo(
        () => contacts.filter((contact) => contact.is_active),
        [contacts],
    );

    const stats = useMemo(() => ({
        total: plans.length,
        active: plans.filter((plan) => plan.status === 'active' || plan.status === 'planned').length,
        responses: plans.reduce((sum, plan) => sum + plan.responses_count, 0),
    }), [plans]);

    const collectionUrl = (plan: AdministrationPlan) => {
        const q = new URLSearchParams({
            study: plan.code,
            instrument: plan.instrument_code,
            locale: plan.locale,
            school_level: plan.school_level ?? '',
        });
        return `${getAuthUrls().authBase}/avvio?${q.toString()}`;
    };

    // Classi del docente/admin: agganciabili al piano (gli inviti vivono sulla classe).
    const [groups, setGroups] = useState<{ id: number; name: string; code: string }[]>([]);
    useEffect(() => {
        apiFetch('/api/admin/groups')
            .then((res) => (res.ok ? res.json() : []))
            .then((payload) => setGroups(Array.isArray(payload) ? payload : []))
            .catch(() => { /* select classi vuoto */ });
    }, []);

    // Institutes the actor may link (all active for administrators, memberships otherwise).
    const [institutes, setInstitutes] = useState<PlanInstitutionOption[] | null>(null);
    const [institutesFailed, setInstitutesFailed] = useState(false);
    useEffect(() => {
        apiFetch('/api/admin/administration-plans/institution-options')
            .then(async (res) => {
                if (!res.ok) throw new Error('institution options failed');
                setInstitutes(parsePlanInstitutionOptions(await res.json()));
            })
            .catch(() => setInstitutesFailed(true));
    }, []);

    const [studentsOpenId, setStudentsOpenId] = useState<number | null>(null);

    const startNew = () => {
        setReplacementSource(null);
        setReplacementCode('');
        setForm(EMPTY);
        setEditingId('new');
        setMessage('');
    };

    const startEdit = (plan: AdministrationPlan) => {
        setReplacementSource(null);
        setReplacementCode('');
        setForm({
            title: plan.title,
            instrument_code: plan.instrument_code,
            group_id: plan.group_id ? String(plan.group_id) : '',
            locale: plan.locale,
            school_level: plan.school_level ?? '',
            scheduled_at: toDateTimeLocal(plan.scheduled_at),
            location: plan.location || '',
            institution_id: plan.institution_id ? String(plan.institution_id) : '',
            confirm_reconciliation: false,
            notes: plan.notes || '',
            status: plan.status,
            contact_ids: plan.researchers
                .map((researcher) => researcher.research_contact_id)
                .filter((id): id is number => typeof id === 'number'),
            external_researchers: plan.researchers
                .filter((researcher) => !researcher.research_contact_id && researcher.external_name)
                .map((researcher) => researcher.external_name)
                .join('\n'),
        });
        setEditingId(plan.id);
        setMessage('');
    };

    const startReplacement = (plan: AdministrationPlan) => {
        startEdit(plan);
        setEditingId('new');
        setReplacementSource(plan);
        setForm(previous => ({...previous, status: 'active', scheduled_at: ''}));
        window.scrollTo({top: 0, behavior: 'smooth'});
    };

    const cancel = () => {
        setReplacementSource(null);
        setEditingId(null);
        setForm(EMPTY);
        setMessage('');
    };

    const toggleContact = (contactId: number) => {
        setForm((previous) => ({
            ...previous,
            contact_ids: previous.contact_ids.includes(contactId)
                ? previous.contact_ids.filter((id) => id !== contactId)
                : [...previous.contact_ids, contactId],
        }));
    };

    const editingPlan = typeof editingId === 'number' ? plans.find((plan) => plan.id === editingId) ?? null : null;

    const save = async () => {
        if (!form.title.trim()) {
            setMessage(t('admin.ap.error.titleRequired'));
            return;
        }
        if (editingPlan && form.status !== editingPlan.status && (form.status === 'archived' || editingPlan.status === 'archived')
            && !window.confirm(t(form.status === 'archived' ? 'admin.ap.confirmArchive' : 'admin.ap.confirmRestore', { title: editingPlan.title }))) return;
        setSaving(true);
        setMessage('');
        const external = form.external_researchers
            .split('\n')
            .map((row) => row.trim())
            .filter(Boolean);
        const body = {
            title: form.title.trim(),
            instrument_code: form.instrument_code,
            group_id: form.group_id ? Number(form.group_id) : null,
            locale: form.locale,
            school_level: form.school_level || null,
            scheduled_at: toApiDateTime(form.scheduled_at),
            location: optional(form.location),
            ...planInstitutionField(form.institution_id, editingPlan, form.confirm_reconciliation),
            ...(editingPlan ? { revision: editingPlan.revision } : {}),
            notes: optional(form.notes),
            status: form.status,
            researchers: [
                ...form.contact_ids.map((id) => ({ research_contact_id: id })),
                ...external.map((name) => ({ external_name: name })),
            ],
        };
        try {
            const url = editingId === 'new' ? '/api/admin/administration-plans' : `/api/admin/administration-plans/${editingId}`;
            const method = editingId === 'new' ? 'POST' : 'PUT';
            const res = replacingPlan
                ? await replacePlan(replacingPlan, body, () => window.confirm(t('admin.ap.confirmReplace', {title: replacingPlan.title})), apiFetch)
                : await apiFetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            if (!res) return;
            if (!res.ok) {
                // Keep the draft in the form: 409/403/422 are recoverable without retyping.
                const detail = (await res.json().catch(() => null))?.detail;
                const key = typeof detail === 'string' ? PLAN_ERRORS[detail] : undefined;
                if (key) { setMessage(c(key)); return; }
                if (detail === 'administration_has_results_replace_required') { setMessage(t('admin.ap.error.usedPlan')); return; }
                if (detail === 'administration_already_archived') { setMessage(t('admin.ap.error.alreadyArchived')); return; }
                throw new Error(`plan save failed: ${res.status}`);
            }
            const replacement = replacingPlan ? await res.json() : null;
            cancel();
            await refresh();
            if (replacement) setReplacementCode(replacement.code);
        } catch (e) {
            console.error('Failed to save administration plan', e);
            setMessage(t('admin.ap.error.save'));
        } finally {
            setSaving(false);
        }
    };

    const archive = async (plan: AdministrationPlan) => {
        if (saving) return;
        setSaving(true);
        setMessage('');
        try {
            const outcome = await changePlanArchive(plan,
                () => window.confirm(t(plan.status === 'archived' ? 'admin.ap.confirmRestore' : 'admin.ap.confirmArchive', { title: plan.title })),
                apiFetch);
            if (outcome === 'conflict') setMessage(c('revisionConflict'));
            if (outcome === 'saved') { cancel(); await refresh(); }
        } catch { setMessage(t('admin.ap.error.archive')); }
        finally { setSaving(false); }
    };

    const archiveButton = (plan: AdministrationPlan) => (
        <Button variant="secondary" type="button" disabled={saving} onClick={() => void archive(plan)}
           >
            {plan.status === 'archived' ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {t(plan.status === 'archived' ? 'admin.ap.action.restore' : 'admin.ap.action.archive')}
        </Button>
    );

    const remove = async (plan: AdministrationPlan) => {
        setConfirmDeleteId(null);
        setMessage('');
        try {
            const res = await apiFetch(`/api/admin/administration-plans/${plan.id}`, { method: 'DELETE' });
            if (res.status === 409) {
                setMessage(t('admin.ap.error.deleteHasResponses'));
                return;
            }
            if (!res.ok) throw new Error('delete failed');
            await refresh();
        } catch (e) {
            console.error('Failed to delete administration plan', e);
            setMessage(t('admin.ap.error.delete'));
        }
    };

    const copy = async (key: string, text: string) => {
        if (!navigator.clipboard) {
            setMessage(t('admin.rc.error.clipboard'));
            return;
        }
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600);
    };

    const downloadQr = async (plan: AdministrationPlan) => {
        try {
            const dataUrl = await QRCode.toDataURL(collectionUrl(plan), { width: 1024, margin: 1 });
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `qr-${plan.code}-${plan.instrument_code}-${plan.locale}.png`;
            a.click();
        } catch (e) {
            console.error('QR generation failed', e);
            setMessage(t('admin.rc.error.qr'));
        }
    };

    const openHandoutPdf = async (plan: AdministrationPlan) => {
        const url = collectionUrl(plan);
        let qrDataUrl = '';
        try {
            qrDataUrl = await QRCode.toDataURL(url, { width: 1024, margin: 1 });
        } catch (e) {
            console.error('QR generation failed', e);
            setMessage(t('admin.rc.error.qr'));
            return;
        }
        const win = window.open('', '_blank');
        if (!win) {
            setMessage(t('admin.rc.error.popup'));
            return;
        }
        const researcherLine = plan.researchers.map((researcher) => researcher.name).filter(Boolean).join(' · ');
        const html = `<!doctype html><html lang="${plan.locale}"><head><meta charset="utf-8">
<title>${escapeHtml(t('admin.ap.pdf.title'))} - ${escapeHtml(plan.code)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:0;padding:32px}
  .sheet{max-width:680px;margin:0 auto}
  .badge{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#124e52;background:#e9f2f2;border:1px solid #a0cccd;border-radius:999px;padding:3px 10px}
  h1{font-size:24px;margin:14px 0 4px}.intro{color:#475569;margin:0 0 20px}
  .row{display:flex;gap:24px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:18px}
  .qr{width:180px;height:180px}.meta{flex:1;min-width:0}
  .label{font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-top:10px}
  .code{font-size:30px;font-weight:800;letter-spacing:.08em;color:#155e63;margin:2px 0}
  .value{font-size:14px;color:#334155;margin:2px 0}.link{font-family:monospace;font-size:12px;word-break:break-all;color:#334155}
  .note{margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:12px;color:#64748b}
  @media print{body{padding:0}.row{break-inside:avoid}}
</style></head><body><div class="sheet">
  <span class="badge">${escapeHtml(plan.instrument_code)} · ${escapeHtml(plan.locale.toUpperCase())}</span>
  <h1>${escapeHtml(plan.title)}</h1>
  <p class="intro">${escapeHtml(t('admin.ap.pdf.intro'))}</p>
  <div class="row">
    <img class="qr" src="${qrDataUrl}" alt="QR">
    <div class="meta">
      <div class="label">${escapeHtml(t('admin.ap.code'))}</div>
      <div class="code">${escapeHtml(plan.code)}</div>
      ${plan.scheduled_at ? `<div class="label">${escapeHtml(t('admin.ap.date'))}</div><div class="value">${escapeHtml(formatDateTime(plan.scheduled_at))}</div>` : ''}
      ${plan.location ? `<div class="label">${escapeHtml(t('admin.ap.location'))}</div><div class="value">${escapeHtml(plan.location)}</div>` : ''}
      <div class="label">${escapeHtml(t('admin.rc.cardText.link'))}</div>
      <div class="link">${escapeHtml(url)}</div>
    </div>
  </div>
  ${researcherLine ? `<div class="note"><strong>${escapeHtml(t('admin.ap.researchers'))}:</strong> ${escapeHtml(researcherLine)}</div>` : ''}
  ${plan.notes ? `<div class="note"><strong>${escapeHtml(t('admin.ap.notes'))}:</strong> ${escapeHtml(plan.notes)}</div>` : ''}
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`;
        win.document.open();
        win.document.write(html);
        win.document.close();
    };

    const inputCls = 'mt-1 h-9 w-full rounded-control border border-line-strong bg-surface px-4 text-sm text-ink outline-none focus:border-brand';

    const renderForm = () => (
        <section className="rounded-lg border border-brand-line bg-brand-soft/40 p-4">
            <div className="space-y-4">
                {replacingPlan && <p role="status" className="rounded-control border border-warning-line bg-warning-soft p-4 text-sm text-warning-ink">{t('admin.ap.replaceHint', {title: replacingPlan.title})}</p>}
                <label className="block text-xs font-semibold text-ink-muted">
                    {t('admin.ap.form.title')}
                    <input
                        className={inputCls}
                        value={form.title}
                        onChange={(event) => setForm({ ...form, title: event.target.value })}
                    />
                </label>

                <section className="rounded-control border border-line bg-surface p-4">
                    <h3 className="text-xs font-semibold text-ink-muted">{t('admin.ap.section.details')}</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <label className="text-xs font-semibold text-ink-muted">
                            {t('admin.ap.instrument')}
                            <select className={inputCls} value={form.instrument_code} onChange={(event) => setForm({ ...form, instrument_code: event.target.value })}>
                                {INSTRUMENTS.map((instrument) => <option key={instrument} value={instrument}>{instrument}</option>)}
                            </select>
                        </label>
                        <label className="text-xs font-semibold text-ink-muted">
                            {t('admin.ap.class')}
                            <select className={inputCls} disabled={Boolean(replacingPlan?.group_id)} value={form.group_id} onChange={(event) => setForm({ ...form, group_id: event.target.value })}>
                                <option value="">{t('admin.ap.noClass')}</option>
                                {groups.map((group) => <option key={group.id} value={String(group.id)}>{group.name} ({group.code})</option>)}
                            </select>
                        </label>
                        <label className="text-xs font-semibold text-ink-muted">
                            {t('admin.ap.language')}
                            <select className={inputCls} value={form.locale} onChange={(event) => setForm({ ...form, locale: event.target.value as LocaleCode })}>
                                {LOCALES.map((locale) => <option key={locale.value} value={locale.value}>{locale.label}</option>)}
                            </select>
                        </label>
                        <label className="text-xs font-semibold text-ink-muted">
                            {t('admin.readings.audience')}
                            <select className={inputCls} value={form.school_level}
                                onChange={(event) => setForm({ ...form, school_level: event.target.value })}>
                                <option value="">—</option>
                                <option value="secondaria">{t('admin.readings.levelSecondaria')}</option>
                                <option value="universita">{t('admin.readings.levelUniversita')}</option>
                                <option value="adulti">{t('admin.readings.levelAdulti')}</option>
                            </select>
                        </label>
                        <label className="text-xs font-semibold text-ink-muted">
                            {t('admin.ap.status')}
                            <select className={inputCls} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                                {STATUSES.filter(status => !replacingPlan || status === 'planned' || status === 'active').map((status) => <option key={status} value={status}>{t(`admin.ap.status.${status}`)}</option>)}
                            </select>
                        </label>
                    </div>
                </section>

                <section className="rounded-control border border-line bg-surface p-4">
                    <h3 className="text-xs font-semibold text-ink-muted">{t('admin.ap.section.schedule')}</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <label className="text-xs font-semibold text-ink-muted">
                            {t('admin.ap.date')}
                            <input className={inputCls} type="datetime-local" value={form.scheduled_at} onChange={(event) => setForm({ ...form, scheduled_at: event.target.value })} />
                        </label>
                        <label className="text-xs font-semibold text-ink-muted">
                            {t('admin.ap.location')}
                            <input className={inputCls} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
                        </label>
                    </div>
                </section>

                <section className="rounded-control border border-line bg-surface p-4">
                    <h3 className="text-xs font-semibold text-ink-muted">{c('planInstitute')}</h3>
                    <p className="text-xs text-ink-muted mt-2">{c('planInstituteHelp')}</p>
                    {editingPlan?.institution_link_state === 'needs_reconciliation' && (
                        <div role="status" className="mt-4 rounded-control border border-warning-line bg-warning-soft p-2 text-xs text-warning-ink">
                            <p className="font-semibold">{c('needsReconciliation')}</p>
                            {editingPlan.reconciliation_reason && <p>{c(`reason_${editingPlan.reconciliation_reason}` as CredentialTextKey)}</p>}
                            {editingPlan.legacy_institution_code && <p>{c('legacyCode')}: <span className="font-mono">{editingPlan.legacy_institution_code}</span></p>}
                        </div>
                    )}
                    <label className="mt-4 block text-xs font-semibold text-ink-muted">
                        {c('planInstitute')}
                        <select className={inputCls} value={form.institution_id} disabled={Boolean(replacingPlan?.group_id) || (institutes === null && !institutesFailed)}
                            onChange={(event) => setForm({ ...form, institution_id: event.target.value })}>
                            <option value="">{c('noInstitute')}</option>
                            {editingPlan?.institution_id && !institutes?.some((row) => row.id === editingPlan.institution_id) && (
                                <option value={String(editingPlan.institution_id)}>{editingPlan.institution_name ?? `#${editingPlan.institution_id}`}</option>
                            )}
                            {institutes?.map((row) => (
                                <option key={row.id} value={String(row.id)}>
                                    {row.name}{row.institution_code ? ` (${row.institution_code})` : ''}{row.credentials_configured ? '' : ` — ${c('credentialsMissing')}`}
                                </option>
                            ))}
                        </select>
                    </label>
                    {institutesFailed && <p role="alert" className="mt-2 text-xs text-danger">{c('institutesLoadError')}</p>}
                    {editingPlan?.institution_link_state === 'needs_reconciliation' && (
                        <label className="mt-2 flex items-start gap-2 text-sm text-ink-body">
                            <input type="checkbox" checked={form.confirm_reconciliation}
                                onChange={(event) => setForm({ ...form, confirm_reconciliation: event.target.checked })} />
                            {c('confirmReconciliation')}
                        </label>
                    )}
                </section>
                <section className="rounded-control border border-line bg-surface p-4">
                    <h3 className="text-xs font-semibold text-ink-muted">{t('admin.ap.section.researchers')}</h3>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <section>
                            <p className="text-xs font-semibold text-ink-muted">{t('admin.ap.contacts')}</p>
                            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
                                {activeContacts.map((contact) => (
                                    <label key={contact.id} className="flex items-start gap-2 rounded-control px-2 py-2 text-sm text-ink-body hover:bg-surface-sunken">
                                        <input
                                            type="checkbox"
                                            checked={form.contact_ids.includes(contact.id)}
                                            onChange={() => toggleContact(contact.id)}
                                            className="mt-1 accent-brand"
                                        />
                                        <span>
                                            <span className="font-semibold">{contact.name}</span>
                                            <span className="block text-xs text-ink-muted">
                                                {[contact.institution, contact.email, contact.code].filter(Boolean).join(' · ')}
                                            </span>
                                        </span>
                                    </label>
                                ))}
                                {activeContacts.length === 0 && <p className="text-sm text-ink-muted">{t('admin.ap.noContacts')}</p>}
                            </div>
                        </section>
                        <label className="block text-xs font-semibold text-ink-muted">
                            {t('admin.ap.externalResearchers')}
                            <textarea
                                className="mt-1 min-h-[160px] w-full rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink outline-none focus:border-brand"
                                value={form.external_researchers}
                                onChange={(event) => setForm({ ...form, external_researchers: event.target.value })}
                                placeholder={t('admin.ap.externalResearchersPlaceholder')}
                            />
                        </label>
                    </div>
                </section>

                <section className="rounded-control border border-line bg-surface p-4">
                    <h3 className="text-xs font-semibold text-ink-muted">{t('admin.ap.section.notes')}</h3>
                    <label className="mt-4 block text-xs font-semibold text-ink-muted">
                        {t('admin.ap.notes')}
                        <textarea
                            className="mt-1 min-h-[80px] w-full rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink outline-none focus:border-brand"
                            value={form.notes}
                            onChange={(event) => setForm({ ...form, notes: event.target.value })}
                        />
                    </label>
                </section>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                {editingPlan && archiveButton(editingPlan)}
                <Button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                >
                    <Check className="h-4 w-4" />
                    {t(replacingPlan ? 'admin.ap.action.confirmReplace' : 'admin.ap.save')}
                </Button>
                <Button variant="secondary"
                    type="button"
                    onClick={cancel}
                >
                    <X className="h-4 w-4" />
                    {t('admin.ap.cancel')}
                </Button>
            </div>
        </section>
    );

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-ink">{t('admin.ap.title')}</h2>
                        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t('admin.ap.subtitle')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary"
                            type="button"
                            onClick={() => void refresh()}
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            {t('admin.ap.refresh')}
                        </Button>
                        {editingId === null && (
                            <Button
                                type="button"
                                onClick={startNew}
                            >
                                <Plus className="h-4 w-4" />
                                {t('admin.ap.new')}
                            </Button>
                        )}
                    </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-control border border-line bg-surface-sunken p-4">
                        <p className="text-xs font-semibold text-ink-muted">{t('admin.ap.stats.total')}</p>
                        <p className="mt-1 text-2xl font-semibold text-ink">{stats.total}</p>
                    </div>
                    <div className="rounded-control border border-line bg-surface-sunken p-4">
                        <p className="text-xs font-semibold text-ink-muted">{t('admin.ap.stats.active')}</p>
                        <p className="mt-1 text-2xl font-semibold text-success">{stats.active}</p>
                    </div>
                    <div className="rounded-control border border-line bg-surface-sunken p-4">
                        <p className="text-xs font-semibold text-ink-muted">{t('admin.ap.stats.responses')}</p>
                        <p className="mt-1 text-2xl font-semibold text-link">{stats.responses}</p>
                    </div>
                </div>
            </section>

            {editingId === 'new' && renderForm()}
            {replacementCode && <p role="status" className="rounded-control border border-success-line bg-success-soft px-4 py-2 text-sm text-success-ink">{t('admin.ap.replaced', {code: replacementCode})}</p>}
            {message && <p role="alert" className="rounded-control border border-danger-line bg-danger-soft px-4 py-2 text-sm text-danger">{message}</p>}

            {!loading && plans.length > 0 && (
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('admin.ap.searchPlaceholder')}
                        className="h-control w-full rounded-control border border-line-strong bg-surface pl-8 pr-4 text-sm text-ink outline-none focus:border-brand"
                    />
                </div>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
                {loading && (
                    <section className="rounded-lg border border-line bg-surface p-8 text-center text-ink-muted xl:col-span-2">
                        {t('admin.ap.loading')}
                    </section>
                )}
                {!loading && plans.length === 0 && editingId !== 'new' && (
                    <section className="rounded-lg border border-line bg-surface p-8 text-center text-ink-muted xl:col-span-2">
                        {t('admin.ap.empty')}
                    </section>
                )}
                {!loading && plans.length > 0 && filteredPlans.length === 0 && (
                    <section className="rounded-lg border border-line bg-surface p-8 text-center text-ink-muted xl:col-span-2">
                        {t('admin.ap.noResults')}
                    </section>
                )}
                {filteredPlans.map((plan) => (
                    editingId === plan.id ? (
                        <div key={plan.id} className="xl:col-span-2">{renderForm()}</div>
                    ) : (
                        <section key={plan.id} id={`plan-${plan.id}`} tabIndex={-1}
                            className={`rounded-lg border bg-surface p-4 shadow-card ${focusedPlanId === plan.id ? 'border-brand-line ring-2 ring-brand-line' : 'border-line'}`}>
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-base font-semibold text-ink">{plan.title}</h3>
                                        <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-semibold text-link">
                                            {plan.instrument_code} · {plan.locale.toUpperCase()}
                                        </span>
                                        <span className="rounded-full bg-surface-raised px-2 py-1 text-xs font-semibold text-ink-muted">
                                            {t(`admin.ap.status.${plan.status}`)}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-ink-muted">{t('admin.ap.createdOn')} {formatDateTime(plan.created_at)}</p>
                                    <p className="mt-1 text-xs text-ink-muted">
                                        {c('planInstitute')}: {plan.institution_name
                                            ? <span className="font-semibold">{plan.institution_name}{plan.institution_code ? ` (${plan.institution_code})` : ''}{plan.institution_credentials_configured ? '' : ` — ${c('credentialsMissing')}`}</span>
                                            : c('noInstitute')}
                                    </p>
                                    {plan.institution_link_state === 'needs_reconciliation' && (
                                        <span className="mt-1 inline-flex rounded-full bg-warning-soft px-2 py-1 text-xs font-semibold text-warning-ink">{c('needsReconciliation')}</span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {archiveButton(plan)}
                                    {plan.status !== 'archived' && <Button variant="secondary" type="button" disabled={saving} onClick={() => startReplacement(plan)}
                                        className="border-brand-line text-link hover:bg-brand-soft">
                                        <ArrowRightLeft className="h-4 w-4" />{t('admin.ap.action.replace')}
                                    </Button>}
                                    <button type="button" onClick={() => startEdit(plan)} className="inline-flex items-center justify-center min-h-control min-w-control rounded-control p-2 text-ink-muted hover:bg-surface-raised hover:text-ink" title={t('admin.ap.action.edit')}>
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    {confirmDeleteId === plan.id ? (
                                        <ConfirmInline
                                            question={t('admin.ap.confirmDelete', { title: plan.title })}
                                            onConfirm={() => void remove(plan)}
                                            onCancel={() => setConfirmDeleteId(null)}
                                        />
                                    ) : (
                                        <button type="button" onClick={() => setConfirmDeleteId(plan.id)} className="inline-flex items-center justify-center min-h-control min-w-control rounded-control p-2 text-danger hover:bg-danger-soft" title={t('admin.ap.action.delete')}>
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="mt-4 rounded-control border border-brand-line bg-brand-soft p-4">
                                <p className="text-xs font-semibold text-link">{t('admin.ap.code')}</p>
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <code className="w-full rounded-control border border-brand-line bg-surface px-4 py-2 text-lg font-semibold text-link">
                                        {plan.code}
                                    </code>
                                    <Button variant="secondary"
                                        type="button"
                                        onClick={() => void copy(`code-${plan.id}`, plan.code)}
                                        className="border-brand-line text-link hover:bg-brand-soft"
                                    >
                                        {copiedKey === `code-${plan.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        {t('admin.rc.action.code')}
                                    </Button>
                                </div>
                                <p className="mt-2 text-xs text-link">{t('admin.ap.codeHint')}</p>
                            </div>

                            <div className="mt-4 grid gap-2 text-sm text-ink-muted">
                                {plan.scheduled_at && (
                                    <div className="flex items-center gap-2">
                                        <CalendarDays className="h-4 w-4 text-ink-muted" />
                                        {formatDateTime(plan.scheduled_at)}
                                    </div>
                                )}
                                {plan.location && (
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-ink-muted" />
                                        {plan.location}
                                    </div>
                                )}
                                {plan.researchers.length > 0 && (
                                    <div className="flex items-start gap-2">
                                        <Users className="mt-1 h-4 w-4 text-ink-muted" />
                                        <span>{plan.researchers.map((researcher) => researcher.name).join(', ')}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-ink-muted" />
                                    {t('admin.ap.responses')}: {plan.responses_count}
                                </div>
                            </div>

                            {plan.notes && (
                                <p className="mt-4 rounded-control border border-line bg-surface-sunken p-4 text-sm leading-relaxed text-ink-muted">
                                    {plan.notes}
                                </p>
                            )}

                            <div className="mt-4 rounded-control border border-line bg-surface-sunken p-4">
                                <div className="flex items-start gap-4">
                                    <QrThumb value={collectionUrl(plan)} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold text-ink-muted">{t('admin.ap.linkLabel')} · {t('admin.rc.qrLabel')}</p>
                                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                            <input readOnly value={collectionUrl(plan)} className="w-full rounded-control border border-line-strong bg-surface px-4 py-2 font-mono text-xs text-ink-body" />
                                            <Button variant="secondary"
                                                type="button"
                                                onClick={() => void copy(`link-${plan.id}`, collectionUrl(plan))}
                                            >
                                                {copiedKey === `link-${plan.id}` ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                                                {t('admin.rc.action.link')}
                                            </Button>
                                        </div>
                                        {plan.group_name && (
                                            <p className="mt-2 text-xs text-ink-muted">
                                                {t('admin.ap.class')}: <span className="font-semibold">{plan.group_name}</span>
                                                {classHref && plan.group_id != null && classLinkLabel && (
                                                    // Research and classroom views manage the same plan row.
                                                    <Link href={classHref(plan.group_id)} className="ml-2 inline-flex min-h-control items-center font-semibold text-link underline">
                                                        {classLinkLabel}
                                                    </Link>
                                                )}
                                            </p>
                                        )}
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <Button variant="secondary"
                                                type="button"
                                                onClick={() => setStudentsOpenId(studentsOpenId === plan.id ? null : plan.id)}
                                            >
                                                <Users className="h-4 w-4" />
                                                {t('admin.ap.students')}
                                            </Button>
                                            <Button variant="secondary"
                                                type="button"
                                                onClick={() => void downloadQr(plan)}
                                            >
                                                <QrCode className="h-4 w-4" />
                                                {t('admin.rc.action.qr')}
                                            </Button>
                                            <Button variant="secondary"
                                                type="button"
                                                onClick={() => void openHandoutPdf(plan)}
                                            >
                                                <FileText className="h-4 w-4" />
                                                {t('admin.rc.action.pdf')}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {studentsOpenId === plan.id && <PlanStudentsPanel base={`/api/admin/administration-plans/${plan.id}`} />}
                        </section>
                    )
                ))}
            </div>
        </div>
    );
}
