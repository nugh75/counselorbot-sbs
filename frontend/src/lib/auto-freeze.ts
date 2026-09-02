// Autosalvataggio delle sessioni guidate: lo snapshot finisce sul server a fine
// turno, così uscire dallo strumento — tasto indietro, logo dell'header, tab
// chiusa, crash — non dipende più dal gesto manuale del fiocco di neve.

export interface AutoFreezeState {
    sessionId: string;
    messageCount: number;
    isLoading: boolean;
    completed: boolean;
}

// Attesa dopo l'ultimo cambiamento: durante lo streaming i messaggi cambiano a
// ogni token, e non serve una scrittura per token.
export const AUTO_FREEZE_DELAY_MS = 1500;

export function shouldAutoFreeze({ sessionId, messageCount, isLoading, completed }: AutoFreezeState): boolean {
    if (!sessionId) return false;
    // Il percorso concluso cancella il proprio snapshot: ricrearlo lascerebbe
    // una voce "Riprendi" che riporta a una chat già chiusa.
    if (completed) return false;
    // Stato a metà: si salva quando la risposta è finita.
    if (isLoading) return false;
    // Il solo messaggio introduttivo non è una sessione da riprendere.
    return messageCount > 1;
}

// Firma dello stato salvabile: evita di riscrivere lo stesso snapshot quando il
// componente si ridisegna senza che sia cambiato nulla di congelabile.
export function autoFreezeSignature(input: {
    messages: { content: string }[];
    currentPhase: string;
    responseLength: string;
}): string {
    const last = input.messages[input.messages.length - 1];
    return [
        input.messages.length,
        input.currentPhase,
        input.responseLength,
        last ? last.content.length : 0,
    ].join('|');
}
