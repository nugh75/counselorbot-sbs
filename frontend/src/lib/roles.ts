import type { Identity } from './auth';

const TEACHER_MARKERS = ['docente', 'teacher', 'educator', 'professor', 'faculty', 'staff'];
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

export function isResearcher(identity: Identity | null | undefined): boolean {
    return Boolean(identity?.is_researcher || hasGroupMarker(identity, RESEARCH_MARKERS));
}

export function canUseTeacherAssistant(identity: Identity | null | undefined): boolean {
    return Boolean(identity?.authenticated && (identity.is_admin || isTeacher(identity) || isResearcher(identity)));
}

export function canUseResearchConsole(identity: Identity | null | undefined): boolean {
    return Boolean(identity?.authenticated && (identity.is_admin || isResearcher(identity)));
}
