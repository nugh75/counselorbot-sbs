import type { Identity } from './auth';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { canUseTeacherAssistant } from './roles.ts';

export function homeLandingHref(identity: Identity, search: URLSearchParams, hash: string): string {
    const area = canUseTeacherAssistant(identity) ? '/docente' : '/profilo';
    const params = new URLSearchParams(search);
    params.delete('view');
    const query = params.toString();
    const anchor = area === '/profilo' && hash === '#home-catalog-section' ? '#profile-instrument-catalog' : hash;
    return `${area}${query ? `?${query}` : ''}${anchor}`;
}

export function hasHomeToolEntry(params: URLSearchParams): boolean {
    return Boolean(params.get('start') || params.get('q') || params.get('frozen')
        || params.get('resume') || (params.get('session_id') && params.get('instrument')));
}

export function instrumentStartHref(id: string, fromStudent = false): string {
    return `/?start=${encodeURIComponent(id)}${fromStudent ? '&from=student' : ''}`;
}
