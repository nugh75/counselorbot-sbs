import type { Identity } from './auth';

const TEACHER_MARKERS = ['docent', 'insegnant', 'teacher', 'educator', 'professor', 'faculty', 'staff'];
const RESEARCH_MARKERS = ['ricerc', 'research', 'researcher'];

function hasGroupMarker(identity: Identity | null | undefined, markers: string[]): boolean {
    const groups = identity?.groups || [];
    return groups.some((group) => {
        const normalized = group.toLowerCase();
        return markers.some((marker) => normalized.includes(marker));
    });
}

export function isTeacher(identity: Identity | null | undefined): boolean {
    return hasGroupMarker(identity, TEACHER_MARKERS);
}

// Institutes are managed from the teacher area by teachers and administrators.
export function canManageInstitutes(identity: Identity | null | undefined): boolean {
    return Boolean(identity?.is_admin || isTeacher(identity));
}

export function isResearcher(identity: Identity | null | undefined): boolean {
    return Boolean(identity?.is_researcher || hasGroupMarker(identity, RESEARCH_MARKERS));
}

export function canUseTeacherAssistant(identity: Identity | null | undefined): boolean {
    return Boolean(identity?.authenticated && (identity.is_admin || isTeacher(identity) || isResearcher(identity)));
}

export function canUseAssistant(identity: Identity | null | undefined): boolean {
    return Boolean(identity?.authenticated);
}

export function canUseResearchConsole(identity: Identity | null | undefined): boolean {
    return Boolean(identity?.authenticated && (identity.is_admin || isResearcher(identity)));
}

// Area studente (/profilo): ogni account autenticato, docenti, ricercatori e
// admin compresi, perché un docente può essere studente di un altro docente.
export function canUsePersonalPage(identity: Identity | null | undefined): boolean {
    return Boolean(identity?.authenticated);
}
