// Percorsi a intervista: si apre con un patto, nei passi di intervista e' la
// persona a decidere quando cambiare tema, si chiude con una sintesi. Il
// comportamento era cablato su SAVICKAS, ma QPCC e QAP aprono con lo stesso
// patto ("If you agree, write: I accept") e avanzano sullo stesso marcatore.

interface InterviewPath {
    agreementStepId: string;
    finalStepId: string;
}

const INTERVIEW_PATHS: Readonly<Record<string, InterviewPath>> = {
    SAVICKAS: { agreementStepId: 'savickas-patto', finalStepId: 'savickas-final' },
    QPCC: { agreementStepId: 'qpcc-intro', finalStepId: 'qpcc-sintesi' },
    QAP: { agreementStepId: 'qap-intro', finalStepId: 'qap-sintesi' },
    EVENTO_STUDIO: { agreementStepId: 'evstudio-patto', finalStepId: 'evstudio-final' },
    EVENTO_PROFESSIONALE: { agreementStepId: 'evprof-patto', finalStepId: 'evprof-final' },
    // Obiettivi: presentazione e accordo sono un unico passaggio iniziale.
    OBIETTIVO_STUDIO: { agreementStepId: 'obbstudio-intro', finalStepId: 'obbstudio-final' },
    OBIETTIVO_DOCENZA: { agreementStepId: 'obbdocenza-intro', finalStepId: 'obbdocenza-final' },
};

// Obiettivi: una fase si chiude da sola quando il modello la segnala su una
// risposta completata, senza chiedere alla persona di confermare il passaggio.
const SIGNAL_ADVANCE_PATHS = new Set(['OBIETTIVO_STUDIO', 'OBIETTIVO_DOCENZA']);

export function advancesOnSignal(questionnaireType: string): boolean {
    return SIGNAL_ADVANCE_PATHS.has(questionnaireType);
}

const QUESTIONS_PHASE_ID = 'questions';
const CONCLUSION_PHASE_ID = 'conclusion';

// Percorso completo Obiettivo: le fasi del percorso a undici passi vivono in
// sessioni e snapshot gia' salvati; si riprendono nella fase che le ha assorbite.
export function currentGoalPhase(questionnaireType: string, phase: string, phases: readonly string[]): string {
    if (!advancesOnSignal(questionnaireType) || phases.includes(phase) || !phases.length) return phase;
    const prefix = questionnaireType === 'OBIETTIVO_DOCENZA' ? 'obbdocenza' : 'obbstudio';
    const absorbed: Record<string, string> = {
        [`${prefix}-patto`]: `${prefix}-intro`,
        [`${prefix}-smart`]: `${prefix}-livello`,
        [`${prefix}-sfida`]: `${prefix}-livello`,
        [QUESTIONS_PHASE_ID]: phases[phases.length - 1],
        [CONCLUSION_PHASE_ID]: phases[phases.length - 1],
    };
    const target = absorbed[phase];
    return target && phases.includes(target) ? target : phase;
}

const AGREEMENT_ACCEPT_PATTERNS: Record<string, RegExp> = {
    it: /\baccetto\b/i,
    en: /\b(?:i\s+accept|accept|i\s+agree|agree)\b/i,
    es: /\b(?:acepto|estoy\s+de\s+acuerdo|de\s+acuerdo)\b/i,
    fr: /\b(?:j['’]\s*accepte|accepte|d['’]\s*accord)\b/i,
    de: /\b(?:ich\s+akzeptiere|akzeptiere|einverstanden)\b/i,
    sv: /\b(?:jag\s+accepterar|accepterar|godk[aä]nner)\b/i,
};

export interface QuickReplySpec {
    key: string;
    action: 'send' | 'advance';
    emphasis?: boolean;
}

export function isAgreementStep(questionnaireType: string, phase: string): boolean {
    return INTERVIEW_PATHS[questionnaireType]?.agreementStepId === phase;
}

export function acceptsAgreement(questionnaireType: string, phase: string, locale: string, text: string): boolean {
    if (!isAgreementStep(questionnaireType, phase)) return false;
    return (AGREEMENT_ACCEPT_PATTERNS[locale] || AGREEMENT_ACCEPT_PATTERNS.it).test(text);
}

export function stepInstructionsMessage(questionnaireType: string, stepPrompt: string | undefined, locale: string, userMessage: string): string {
    if (!INTERVIEW_PATHS[questionnaireType] || !stepPrompt) return userMessage;
    return `CURRENT STEP INTERNAL INSTRUCTIONS (use them only as guidance; answer the student in language "${locale}"):\n${stepPrompt}\n\nSTUDENT ANSWER:\n${userMessage}`;
}

// QPCS non e' un percorso a intervista (nessun patto), ma anche li' decide la
// persona quando passare all'area successiva. Negli Obiettivi avanza da sola
// solo l'apertura di «Rendiamo l'obiettivo preciso» che trova l'obiettivo gia'
// preciso; la sintesi e' l'ultima fase.
export function autoAdvancesOnGenerate(questionnaireType: string, stepId: string): boolean {
    if (advancesOnSignal(questionnaireType)) return stepId.endsWith('-livello');
    const path = INTERVIEW_PATHS[questionnaireType];
    if (path) return stepId === path.finalStepId;
    return questionnaireType !== 'QPCS';
}

// Una risposta fatta del solo marcatore e' la risposta alla richiesta della
// persona di andare avanti (il contesto del percorso chiede proprio quella): li'
// ha gia' deciso lei, e fermarsi lascerebbe il turno senza risposta.
export function userDecidesAdvance(questionnaireType: string, phase: string, visibleReply: string): boolean {
    if (!visibleReply.trim() || advancesOnSignal(questionnaireType)) return false;
    const path = INTERVIEW_PATHS[questionnaireType];
    if (path) return phase !== path.finalStepId;
    return questionnaireType === 'QPCS';
}

export function interviewQuickReplies(
    questionnaireType: string,
    phase: string,
    state: { analysisStep: boolean; suggestion: boolean; userMessages: number },
): QuickReplySpec[] {
    if (!INTERVIEW_PATHS[questionnaireType]) return [];
    if (isAgreementStep(questionnaireType, phase)) {
        return [{ key: 'guided.qr.accept', action: 'send', emphasis: true }];
    }
    if (!state.analysisStep) return [];
    const replies: QuickReplySpec[] = [
        { key: 'guided.qr.rephrase', action: 'send' },
        { key: 'guided.qr.reflect', action: 'send' },
    ];
    if (state.suggestion || state.userMessages > 0) {
        replies.push({ key: 'guided.qr.readyNext', action: 'advance' });
    }
    return replies;
}

// Solo i passi di intervista e la sintesi aspettano la persona. Presentazione,
// lettura del profilo e domande finali tengono il pulsante sempre visibile:
// chi ha letto il profilo deve poter passare subito alle aree.
export function advanceButtons(
    questionnaireType: string,
    phase: string,
    stepMode: string | undefined,
    state: { conclusion: boolean; suggestion: boolean; userMessages: number },
): { standard: boolean; interview: boolean } {
    if (state.conclusion) return { standard: false, interview: false };
    // Obiettivi: l'accordo si da' con il pulsante dedicato, non si salta.
    if (advancesOnSignal(questionnaireType) && isAgreementStep(questionnaireType, phase)) {
        return { standard: false, interview: false };
    }
    const waitsForPerson = Boolean(INTERVIEW_PATHS[questionnaireType])
        && Boolean(stepMode && (stepMode.endsWith('-interview') || stepMode.endsWith('-summary')));
    if (!waitsForPerson) return { standard: true, interview: false };
    const interview = !isAgreementStep(questionnaireType, phase)
        && (state.suggestion || state.userMessages >= 3);
    return { standard: false, interview };
}

export function advanceLabelKey(questionnaireType: string, phase: string): string {
    if (phase === QUESTIONS_PHASE_ID) return 'guided.concludeSession';
    return INTERVIEW_PATHS[questionnaireType] ? 'guided.nextTopic' : 'guided.nextStep';
}
