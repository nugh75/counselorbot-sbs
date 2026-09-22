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
    OBIETTIVO_STUDIO: { agreementStepId: 'obbstudio-patto', finalStepId: 'obbstudio-final' },
    OBIETTIVO_DOCENZA: { agreementStepId: 'obbdocenza-patto', finalStepId: 'obbdocenza-final' },
};

const QUESTIONS_PHASE_ID = 'questions';

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
// persona quando passare all'area successiva.
export function autoAdvancesOnGenerate(questionnaireType: string, stepId: string): boolean {
    const path = INTERVIEW_PATHS[questionnaireType];
    if (path) return stepId === path.finalStepId;
    return questionnaireType !== 'QPCS';
}

// Una risposta fatta del solo marcatore e' la risposta alla richiesta della
// persona di andare avanti (il contesto del percorso chiede proprio quella): li'
// ha gia' deciso lei, e fermarsi lascerebbe il turno senza risposta.
export function userDecidesAdvance(questionnaireType: string, phase: string, visibleReply: string): boolean {
    if (!visibleReply.trim()) return false;
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
