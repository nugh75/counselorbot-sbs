'use client';

import Link from 'next/link';
import { ResumeEntry } from '@/components/layout/ResumeEntry';
import { ResumeLoadError } from '@/components/layout/ResumeLoadError';
import { RotateCcw } from 'lucide-react';
import { LOCAL_RESUME_HREF, PQBL_RESUME_HREF, resumeHref, type ResumeEntries } from '@/lib/use-resume-entries';
import { resumeLabel } from '@/lib/resume-label';
import { useI18n } from '@/lib/i18n-context';
import { useDisclosure } from '@/lib/use-disclosure';
import { Tooltip } from '@/components/ui/Tooltip';

const ROW = 'block truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50';

// Pulsante "Riprendi" nell'header: compare quando c'è una sessione congelata
// sul server (ripresa da qualsiasi dispositivo) o una chat interrotta salvata
// localmente. Le voci arrivano dall'header, che le condivide col menu mobile.
export function HeaderResume({ entries }: { entries: ResumeEntries }) {
    const { t } = useI18n();
    const { open, containerRef, triggerRef, triggerProps, onBlur, close } = useDisclosure('resume-panel');

    if (entries.count === 0 && !entries.error) return null;

    // Resume apre sempre l'elenco: l'interazione resta prevedibile sia con una
    // sola sessione, sia quando convivono più snapshot e una chat locale. È un
    // elenco di link e pulsanti (disclosure), non un menu ARIA: si scorre con Tab.
    return (
        <div className="relative" ref={containerRef} onBlur={onBlur}>
            <Tooltip content={t('frozen.resumeTitle')}>
                <button
                    type="button"
                    ref={triggerRef}
                    {...triggerProps}
                    className="console-topbar-icon"
                    aria-label={t('frozen.resumeTitle')}
                >
                    <RotateCcw className="h-4 w-4" />
                </button>
            </Tooltip>

            {open && (
                <div
                    id="resume-panel"
                    className="header-panel absolute right-0 mt-1 w-56 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg z-[60]"
                >
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100">
                        {t('frozen.resumeTitle')}
                    </div>
                    <ResumeList entries={entries} onNavigate={close} />
                </div>
            )}
        </div>
    );
}

// Righe dell'elenco «Riprendi», condivise dal pannello della barra e dal
// sotto-pannello del menu mobile (P5): errore con Riprova, sessioni congelate,
// chat locale interrotta, pQBL. Ogni riga ha la sua cancellazione confermata.
export function ResumeList({ entries, onNavigate }: { entries: ResumeEntries; onNavigate: () => void }) {
    const { t, tf } = useI18n();
    const { frozen, localResume, pqbl } = entries;
    // Ricarica invece di navigare: la home legge lo snapshot dai query param al mount.
    const resumeWithReload = (href: string) => {
        window.location.assign(href);
    };
    return (
        <>
            <ResumeLoadError entries={entries} />
            {frozen.map((row) => (
                <ResumeEntry key={row.session_id} deletable={!row.path_id} target={{ kind: 'session', sessionId: row.session_id }} label={resumeLabel(row.questionnaire_type, row.label, tf)}>
                    <Link
                        href={resumeHref(row)}
                        onClick={(event) => {
                            event.preventDefault();
                            onNavigate();
                            resumeWithReload(resumeHref(row));
                        }}
                        className={ROW}
                    >
                        {resumeLabel(row.questionnaire_type, row.label, tf)}
                    </Link>
                </ResumeEntry>
            ))}
            {localResume && (
                <ResumeEntry target={{ kind: 'session', sessionId: localResume.sessionId }} label={`${t('header.resume')} · ${resumeLabel(localResume.instrument, null, tf)}`}>
                    <Link
                        href={LOCAL_RESUME_HREF}
                        onClick={(event) => {
                            event.preventDefault();
                            onNavigate();
                            resumeWithReload(LOCAL_RESUME_HREF);
                        }}
                        className={`${ROW} border-t border-slate-100`}
                    >
                        {t('header.resume')} · {resumeLabel(localResume.instrument, null, tf)}
                    </Link>
                </ResumeEntry>
            )}
            {pqbl && (
                <ResumeEntry target={{ kind: 'pqbl' }} label={`${t('header.resume')} · ${t('pqbl.card.title')}`}>
                    <Link href={PQBL_RESUME_HREF} onClick={onNavigate} className={`${ROW} border-t border-slate-100`}>
                        {t('header.resume')} · {t('pqbl.card.title')}
                    </Link>
                </ResumeEntry>
            )}
        </>
    );
}
