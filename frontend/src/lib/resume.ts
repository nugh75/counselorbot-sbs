// Sessione in corso da riprendere: persiste l'ultima chat aperta (strumento,
// sessione, modalità, counselor) per il pulsante "Riprendi" nell'header, così
// dopo essere andati su altre sezioni si torna dove si era interrotto.

export interface ResumePoint {
    instrument: string;
    sessionId: string;
    experience: 'standard' | 'opencode';
    counselorId: number | null;
}

const KEY = 'counselorbot_resume';
const EVENT = 'counselorbot-resume-change';

export function getResume(): ResumePoint | null {
    if (typeof window === 'undefined') return null;
    try {
        const v = window.localStorage.getItem(KEY);
        return v ? (JSON.parse(v) as ResumePoint) : null;
    } catch {
        return null;
    }
}

export function setResume(point: ResumePoint | null): void {
    if (typeof window === 'undefined') return;
    if (!point) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(point));
    window.dispatchEvent(new Event(EVENT));
}

export function subscribeToResume(onChange: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('storage', onChange);
    window.addEventListener(EVENT, onChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(EVENT, onChange);
    };
}
