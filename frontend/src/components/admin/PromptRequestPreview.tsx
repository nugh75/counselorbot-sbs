'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchCounselors, type PublicCounselor } from '@/lib/counselor';
import { useI18n } from '@/lib/i18n-context';

const labels = {
    it: ['Anteprima della richiesta', 'Valori dell’editor · l’anteprima non salva', 'Ingresso nello step', 'Risposta dello studente', 'Messaggio di prova', 'Nessuna sessione: punteggi e dati personali potrebbero mancare.', 'Aggiornamento in corso: il contenuto precedente non è aggiornato.', 'Anteprima non disponibile. Il contenuto precedente non è aggiornato.', 'Per componenti', 'Messaggi completi', 'Cerca nel testo', 'Copia richiesta', 'Copiato', 'Nessun contenuto incluso', 'Sistema', 'Messaggio corrente', 'Nessun counselor selezionato', 'Nessuna sessione', 'Simulazione: recuperi esterni e chiamate al modello non vengono eseguiti.', 'Configurazione del modello', 'Riduzione del contesto', 'Impossibile copiare: seleziona il testo manualmente.'],
    en: ['Request preview', 'Editor values · preview does not save', 'Step entry', 'Student reply', 'Test message', 'No session: scores and personal data may be missing.', 'Updating: previous content is out of date.', 'Preview unavailable. Previous content is out of date.', 'Components', 'Complete messages', 'Search text', 'Copy request', 'Copied', 'No content included', 'System', 'Current message', 'No counselor selected', 'No session', 'Simulation: external retrieval and model calls are not executed.', 'Model configuration', 'Context reduction', 'Cannot copy: select the text manually.'],
    es: ['Vista previa de la solicitud', 'Valores del editor · no se guardan', 'Inicio del paso', 'Respuesta del estudiante', 'Mensaje de prueba', 'Sin sesión: pueden faltar puntuaciones y datos personales.', 'Actualizando: el contenido anterior está desactualizado.', 'Vista previa no disponible. Contenido anterior desactualizado.', 'Componentes', 'Mensajes completos', 'Buscar texto', 'Copiar solicitud', 'Copiado', 'Sin contenido incluido', 'Sistema', 'Mensaje actual', 'Sin orientador', 'Sin sesión', 'Simulación: no se ejecutan búsquedas externas ni llamadas al modelo.', 'Configuración del modelo', 'Reducción del contexto', 'No se puede copiar: selecciona el texto manualmente.'],
    fr: ['Aperçu de la requête', 'Valeurs de l’éditeur · sans enregistrement', 'Début de l’étape', 'Réponse de l’élève', 'Message de test', 'Sans session : scores et données personnelles peuvent manquer.', 'Actualisation : le contenu précédent est obsolète.', 'Aperçu indisponible. Contenu précédent obsolète.', 'Composants', 'Messages complets', 'Rechercher', 'Copier la requête', 'Copié', 'Aucun contenu inclus', 'Système', 'Message actuel', 'Aucun conseiller', 'Aucune session', 'Simulation : aucune recherche externe ni appel au modèle.', 'Configuration du modèle', 'Réduction du contexte', 'Copie impossible : sélectionnez le texte manuellement.'],
    de: ['Anfragevorschau', 'Editorwerte · Vorschau speichert nicht', 'Schrittbeginn', 'Antwort des Lernenden', 'Testnachricht', 'Keine Sitzung: Bewertungen und persönliche Daten können fehlen.', 'Aktualisierung: vorheriger Inhalt ist veraltet.', 'Vorschau nicht verfügbar. Vorheriger Inhalt ist veraltet.', 'Bestandteile', 'Vollständige Nachrichten', 'Text suchen', 'Anfrage kopieren', 'Kopiert', 'Kein Inhalt enthalten', 'System', 'Aktuelle Nachricht', 'Kein Berater', 'Keine Sitzung', 'Simulation: keine externen Abfragen oder Modellaufrufe.', 'Modellkonfiguration', 'Kontextkürzung', 'Kopieren nicht möglich: Text manuell auswählen.'],
    sv: ['Förhandsvisning av begäran', 'Redigeringsvärden · sparas inte', 'Stegets början', 'Elevens svar', 'Testmeddelande', 'Ingen session: poäng och personuppgifter kan saknas.', 'Uppdaterar: föregående innehåll är inaktuellt.', 'Förhandsvisning saknas. Föregående innehåll är inaktuellt.', 'Delar', 'Fullständiga meddelanden', 'Sök text', 'Kopiera begäran', 'Kopierat', 'Inget innehåll inkluderat', 'System', 'Aktuellt meddelande', 'Ingen vägledare', 'Ingen session', 'Simulering: inga externa sökningar eller modellanrop utförs.', 'Modellkonfiguration', 'Kontextminskning', 'Kan inte kopiera: markera texten manuellt.'],
};

const explanations = {
    it: ['Scrivi un messaggio di prova per simulare la risposta dello studente.', 'Nessun modello configurato: puoi comunque esaminare i prompt.', 'Le fonti esterne non vengono recuperate in questa anteprima.', 'Capacità del modello non configurata: la riduzione del contesto non è verificabile.', 'Dettagli tecnici', 'Incluso nella simulazione', 'Escluso', 'Dato assente', 'Recupero non eseguito', 'Componenti prima della riduzione. La vista Messaggi completi mostra il risultato della riduzione simulata.'],
    en: ['Enter a test message to simulate a student reply.', 'No model configured: you can still inspect prompts.', 'External sources are not retrieved in this preview.', 'Model capacity not configured: context reduction cannot be verified.', 'Technical details', 'Included in simulation', 'Excluded', 'Data missing', 'Retrieval not performed', 'Components before reduction. Complete messages shows the result of simulated reduction.'],
    es: ['Escribe un mensaje de prueba para simular la respuesta.', 'Sin modelo configurado: puedes examinar los prompts.', 'No se recuperan fuentes externas en esta vista previa.', 'Capacidad sin configurar: no se puede verificar la reducción.', 'Detalles técnicos', 'Incluido en la simulación', 'Excluido', 'Dato ausente', 'Búsqueda no realizada', 'Componentes antes de la reducción. Mensajes completos muestra la reducción simulada.'],
    fr: ['Saisissez un message de test pour simuler la réponse.', 'Aucun modèle configuré : vous pouvez examiner les prompts.', 'Les sources externes ne sont pas récupérées dans cet aperçu.', 'Capacité non configurée : réduction non vérifiable.', 'Détails techniques', 'Inclus dans la simulation', 'Exclu', 'Donnée absente', 'Recherche non effectuée', 'Composants avant réduction. Messages complets affiche la réduction simulée.'],
    de: ['Testnachricht eingeben, um eine Antwort zu simulieren.', 'Kein Modell konfiguriert: Prompts können geprüft werden.', 'Externe Quellen werden in dieser Vorschau nicht abgerufen.', 'Modellkapazität nicht konfiguriert: Kürzung nicht überprüfbar.', 'Technische Details', 'In der Simulation enthalten', 'Ausgeschlossen', 'Daten fehlen', 'Abruf nicht durchgeführt', 'Bestandteile vor Kürzung. Vollständige Nachrichten zeigt die simulierte Kürzung.'],
    sv: ['Skriv ett testmeddelande för att simulera elevens svar.', 'Ingen modell konfigurerad: du kan granska prompterna.', 'Externa källor hämtas inte i förhandsvisningen.', 'Modellkapacitet saknas: kontextminskning kan inte verifieras.', 'Tekniska detaljer', 'Ingår i simuleringen', 'Uteslutet', 'Data saknas', 'Hämtning ej utförd', 'Delar före minskning. Fullständiga meddelanden visar den simulerade minskningen.'],
};

function hasContent(value: unknown): boolean {
    if (typeof value === 'string') return !!value.trim();
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return value !== null && value !== undefined && value !== false;
}

type Preview = {
    envelope?: { system_prompt_final: string; full_message: string; history: { role: string; content: string }[] };
    components?: Record<string, unknown>;
    component_flags?: Record<string, boolean>;
    component_origins?: Record<string, string>;
    knowledge?: { context?: string };
    resolved?: { provider?: string; model?: string; context_budget?: Record<string, unknown> };
    warnings?: { code: string; message: string }[];
    transport?: { endpoint: string; authentication: string; body: Record<string, unknown>; unsupported_parameters: string[] } | null;
};

export function PromptRequestPreview({ step, configs, results, language = 'it', selectedSession, selectedCounselor, onSession, onCounselor, onLanguage, componentFlags, componentFlagsDirty, componentLabels, savedStep, savedConfigs, hideContextControls }: {
    step: { id: string; prompt: string; questionnaire_type: string; system_prompt_mode: string };
    configs: { key: string; value: string }[];
    results: { session_id: string; username?: string | null }[];
    savedStep?: { id: string; prompt: string; questionnaire_type: string; system_prompt_mode: string };
    savedConfigs?: { key: string; value: string }[];
    hideContextControls?: boolean;
    language?: string;
    selectedSession?: string; selectedCounselor?: number | '';
    onSession?: (value: string) => void; onCounselor?: (value: number | '') => void; onLanguage?: (value: string) => void;
    componentFlagsDirty?: boolean;
    componentFlags?: Record<string, unknown>; componentLabels?: Record<string, string>;
}) {
    const rootRef = useRef<HTMLElement>(null);
    const { lang, t } = useI18n();
    const l = labels[lang as keyof typeof labels] || labels.en;
    const languageLabel = { it: 'Lingua', en: 'Language', es: 'Idioma', fr: 'Langue', de: 'Sprache', sv: 'Språk' }[lang] || 'Language';
    const e = explanations[lang as keyof typeof explanations] || explanations.en;
    const [showSaved, setShowSaved] = useState(false);
    const displayedStep = showSaved && savedStep ? savedStep : step;
    const displayedConfigs = showSaved && savedConfigs ? savedConfigs : configs;
    const hasDraft = savedStep && savedConfigs && (componentFlagsDirty || step.prompt !== savedStep.prompt || step.system_prompt_mode !== savedStep.system_prompt_mode || configs.some(c => (c.key.startsWith('prompt_') || c.key.startsWith('directive_')) && c.value !== (savedConfigs.find(s => s.key === c.key)?.value || '')));
    const stateLabels = { it: ['Modifiche non salvate', 'Configurazione salvata', 'Mostra configurazione salvata'], en: ['Unsaved changes', 'Saved configuration', 'Show saved configuration'], es: ['Cambios sin guardar', 'Configuración guardada', 'Mostrar configuración guardada'], fr: ['Modifications non enregistrées', 'Configuration enregistrée', 'Afficher la configuration enregistrée'], de: ['Ungespeicherte Änderungen', 'Gespeicherte Konfiguration', 'Gespeicherte Konfiguration anzeigen'], sv: ['Osparade ändringar', 'Sparad konfiguration', 'Visa sparad konfiguration'] }[lang] || ['Unsaved changes', 'Saved configuration', 'Show saved configuration'];
    const [localSession, setSession] = useState('');
    const session = selectedSession ?? localSession;
    const [localLanguage, setLanguage] = useState(language);
    const effectiveLanguage = onLanguage ? language : localLanguage;
    const [localCounselor, setCounselor] = useState('');
    const counselor = selectedCounselor === undefined ? localCounselor : String(selectedCounselor);
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);
    const [reply, setReply] = useState(false);
    const [message, setMessage] = useState('');
    const [view, setView] = useState('components');
    const [search, setSearch] = useState('');
    const [copyStatus, setCopyStatus] = useState('');
    const [state, setState] = useState<{ key: string; data?: Preview; error?: boolean }>({ key: '' });
    useEffect(() => { fetchCounselors().then(setCounselors).catch(() => setCounselors([])); }, []);
    useEffect(() => {
        let restore: (() => void)[] = [];
        const after = () => { restore.forEach(fn => fn()); restore = []; };
        const before = () => {
            after();
            const root = rootRef.current?.parentElement?.closest('.prompt-workspace') || rootRef.current;
            root?.querySelectorAll<HTMLDetailsElement>('details').forEach(detail => {
                const wasOpen = detail.open; detail.open = true;
                restore.push(() => { detail.open = wasOpen; });
            });
            root?.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(area => {
                if (area.nextElementSibling?.classList.contains('prompt-print-value')) return;
                const pre = document.createElement('pre'); pre.className = 'prompt-print-value'; pre.textContent = area.value;
                area.after(pre); restore.push(() => pre.remove());
            });
        };
        window.addEventListener('beforeprint', before); window.addEventListener('afterprint', after);
        return () => { after(); window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
    }, []);
    const request = JSON.stringify({
        questionnaire_type: displayedStep.questionnaire_type, language: effectiveLanguage, phase: displayedStep.id,
        mode: reply ? (displayedStep.questionnaire_type === 'QSA' && ['factor', 'second-level'].includes(displayedStep.system_prompt_mode) ? 'factor-qa' : displayedStep.questionnaire_type === 'QSAr' && ['qsar-factor', 'qsar-second-level'].includes(displayedStep.system_prompt_mode) ? 'qsar-factor-qa' : displayedStep.questionnaire_type === 'SAVICKAS' ? 'savickas-interview' : displayedStep.system_prompt_mode) : displayedStep.system_prompt_mode,
        step_mode_override: displayedStep.system_prompt_mode,
        message: reply ? message : displayedStep.prompt, use_phase_prompt: !reply,
        session_id: session || undefined, counselor_id: counselor ? Number(counselor) : undefined,
        include_history: true, include_knowledge: true, component_flags: showSaved ? undefined : componentFlags,
        config_overrides: Object.fromEntries(displayedConfigs.filter(c => c.key.startsWith('prompt_') || c.key.startsWith('directive_')).map(c => [c.key, c.value])),
    });
    const needsMessage = reply && !message.trim();
    useEffect(() => {
        if (needsMessage) return;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const response = await fetch('/api/admin/prompt-audit/dry-run', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request, signal: controller.signal,
                });
                if (!response.ok) throw new Error('preview');
                const data: Preview = await response.json();
                if (!controller.signal.aborted) setState({ key: request, data });
            } catch {
                if (!controller.signal.aborted) setState(previous => ({ key: request, data: previous.data, error: true }));
            }
        }, 350);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [request, needsMessage]);
    const loading = !needsMessage && state.key !== request;
    const data = needsMessage ? undefined : state.data;
    const envelope = data?.envelope;
    const messages = envelope ? [{ role: 'system', content: envelope.system_prompt_final }, ...envelope.history, { role: 'user', content: envelope.full_message }] : [];
    const text = JSON.stringify(data?.transport || messages, null, 2);
    const blocks: [string, unknown][] = view === 'messages'
        ? messages.map((m, i) => [`${i + 1}. ${m.role === 'system' ? l[14] : m.role} ${i === messages.length - 1 ? `· ${l[15]}` : ''}`, m.content])
        : Object.entries({ ...data?.components, knowledge: data?.knowledge?.context || '' });
    return <section ref={rootRef} aria-label={l[0]} className="prompt-workspace prompt-request-preview space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-4 xl:sticky xl:top-4">
        <h4 className="font-semibold text-indigo-800">{l[0]}</h4>
        <p className="text-xs text-slate-600">{l[1]}</p>
        {savedStep && savedConfigs && <><p className="text-xs font-semibold">{!showSaved && hasDraft ? stateLabels[0] : stateLabels[1]}</p><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showSaved} onChange={e => setShowSaved(e.target.checked)} />{stateLabels[2]}</label></>}
        <div className="grid gap-2 sm:grid-cols-2">
            {!hideContextControls && <select aria-label={l[17]} value={session} onChange={e => onSession ? onSession(e.target.value) : setSession(e.target.value)} className="rounded border bg-white p-2 text-sm"><option value="">{l[17]}</option>{results.map(r => <option key={r.session_id} value={r.session_id}>{r.username} · {r.session_id}</option>)}</select>}
            {!hideContextControls && <select aria-label={l[16]} value={counselor} onChange={e => onCounselor ? onCounselor(e.target.value ? Number(e.target.value) : '') : setCounselor(e.target.value)} className="rounded border bg-white p-2 text-sm"><option value="">{l[16]}</option>{counselors.filter(c => !c.questionnaire_types?.length || c.questionnaire_types.includes(step.questionnaire_type)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
            <select aria-label={l[2]} value={reply ? 'reply' : 'entry'} onChange={e => setReply(e.target.value === 'reply')} className="rounded border bg-white p-2 text-sm"><option value="entry">{l[2]}</option><option value="reply">{l[3]}</option></select>
            {!hideContextControls && <select aria-label={languageLabel} value={effectiveLanguage} onChange={e => onLanguage ? onLanguage(e.target.value) : setLanguage(e.target.value)} className="rounded border bg-white p-2 text-sm">{[['it', 'Italiano'], ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['sv', 'Svenska']].map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select>}
        </div>
        {reply && <textarea aria-label={l[4]} placeholder={l[4]} value={message} onChange={e => setMessage(e.target.value)} className="min-h-24 w-full rounded border bg-white p-2 text-sm" />}
        {!session && <p className="text-xs text-slate-600">{l[5]}</p>}
        <p className="text-xs text-slate-600">{l[18]}</p>
        <div role="status" className="text-xs text-amber-800">{needsMessage ? e[0] : loading ? l[6] : state.error ? l[7] : ''}</div>
        {data?.resolved && <p className="text-xs">{!data.resolved.model || data.resolved.model === 'unknown' || !data.resolved.provider || data.resolved.provider === 'unknown' ? e[1] : `${l[19]}: ${data.resolved.provider} · ${data.resolved.model}`}</p>}
        {data?.warnings?.some(w => w.code === 'retrieval_not_replayed') && <p className="text-xs text-slate-600">{e[2]}</p>}
        {data?.warnings?.some(w => w.code === 'unknown_context_capacity') && <p className="text-xs text-amber-800">{e[3]}</p>}
        {!!data?.warnings?.length && <details className="text-xs"><summary>{e[4]}</summary>{data.warnings.map(w => <p key={w.code} className="mt-2 break-words">{w.code}: {w.message}</p>)}</details>}
        <div className="flex flex-wrap gap-2">
            {['components', 'messages'].map((v, i) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded border px-3 py-2 text-xs ${view === v ? 'bg-indigo-600 text-white' : 'bg-white'}`}>{l[8 + i]}</button>)}
            <button type="button" disabled={!envelope || loading || state.error} onClick={async () => { try { await navigator.clipboard.writeText(text); setCopyStatus(l[12]); } catch { setCopyStatus(l[21]); } }} className="rounded border bg-white px-3 py-2 text-xs disabled:opacity-50">{l[11]}</button>
        </div>
        <p role="status" className="text-xs">{copyStatus}</p>
        <input aria-label={l[10]} placeholder={l[10]} value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded border bg-white p-2 text-sm" />
        {view === 'components' && <p className="text-xs text-slate-600">{e[9]}</p>}
        <div className="max-h-[65vh] space-y-2 overflow-auto" aria-busy={loading}>
            {blocks.filter(([key, value]) => `${key} ${typeof value === 'string' ? value : JSON.stringify(value)}`.toLowerCase().includes(search.toLowerCase())).map(([key, value]) => <details key={key} open={view === 'messages' || !!search} className="rounded border bg-white p-3"><summary className="cursor-pointer break-words text-xs font-semibold">{componentLabels?.[key] || key}{view === 'components' && <span className="ml-2 font-normal text-slate-500">{data?.component_flags?.[key] === false ? e[6] : key === 'knowledge' && data?.warnings?.some(w => w.code === 'retrieval_not_replayed') ? e[8] : hasContent(value) ? e[5] : e[7]}</span>}</summary>{view === 'components' && data?.component_origins?.[key] && <p className="mt-1 break-words font-mono text-[11px] text-slate-500">{data.component_origins[key]}</p>}<pre className="mt-2 whitespace-pre-wrap break-words text-xs">{value ? typeof value === 'string' ? value : JSON.stringify(value, null, 2) : l[13]}</pre></details>)}
        </div>
        {data?.transport && <details className="text-xs"><summary>{t('chatgpt.preview.title')}</summary><p className="mt-2">{t('chatgpt.preview.help')}</p><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(data.transport, null, 2)}</pre></details>}
        {data?.resolved?.context_budget && <details className="text-xs"><summary>{l[20]}</summary><pre className="whitespace-pre-wrap">{JSON.stringify(data.resolved.context_budget, null, 2)}</pre></details>}
    </section>;
}

export function GuidedStepPromptPreview(props: React.ComponentProps<typeof PromptRequestPreview>) {
    const [open, setOpen] = useState(false);
    const { lang } = useI18n();
    const label = (labels[lang as keyof typeof labels] || labels.en)[0];
    return <div><button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="rounded border border-indigo-200 px-3 py-2 text-sm text-indigo-700">{label}</button>{open && <PromptRequestPreview {...props} />}</div>;
}
