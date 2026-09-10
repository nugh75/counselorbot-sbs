// Client del tavolo. Il vocabolario delle connessioni e' lo stesso di
// backend/tavolo.py: la famiglia si deriva dal verbo, non si dichiara, e forza
// e incertezza restano modificatori invece di moltiplicare i tipi.

import { apiFetch } from '@/lib/auth';

export type TavoloFamily = 'argument' | 'cause' | 'time' | 'part';
export type TavoloRel =
    | 'supports' | 'contradicts' | 'assumes' | 'needs-evidence'
    | 'causes' | 'hinders' | 'feeds-back'
    | 'then' | 'blocks' | 'if'
    | 'part-of' | 'example-of';
export type TavoloForm = 'concept' | 'action' | 'decision' | 'outcome';
export type TavoloState = 'live' | 'pending' | 'dropped';
export type TavoloBy = 'person' | 'model';

export const REL_FAMILY: Record<TavoloRel, TavoloFamily> = {
    supports: 'argument', contradicts: 'argument', assumes: 'argument', 'needs-evidence': 'argument',
    causes: 'cause', hinders: 'cause', 'feeds-back': 'cause',
    then: 'time', blocks: 'time', if: 'time',
    'part-of': 'part', 'example-of': 'part',
};

export const FAMILIES: TavoloFamily[] = ['argument', 'cause', 'time', 'part'];

export const RELS_BY_FAMILY: Record<TavoloFamily, TavoloRel[]> = {
    argument: ['supports', 'contradicts', 'assumes', 'needs-evidence'],
    cause: ['causes', 'hinders', 'feeds-back'],
    time: ['then', 'blocks', 'if'],
    part: ['part-of', 'example-of'],
};

// Il colore e' il canale della famiglia: quattro tinte si distinguono a colpo
// d'occhio, tredici no. Petrolio e' il colore del marchio, esposto dalla scala
// indigo rimappata; ocra vuol dire movimento, come nel resto dell'app.
export const FAMILY_STROKE: Record<TavoloFamily, string> = {
    argument: 'var(--color-indigo-600)',
    cause: 'var(--color-slate-500)',
    time: 'var(--color-ochre-600)',
    part: 'var(--color-slate-300)',
};

export const INTENTS = ['what-is-missing', 'organize', 'connect', 'continue'] as const;
export type TavoloIntent = typeof INTENTS[number];

export interface TavoloNodeData {
    id: string;
    label: string;
    form: TavoloForm;
    icon?: string | null;
    // Il pezzo che conta: uno solo per tavolo, come nei diagrammi.
    accent?: boolean;
    by: TavoloBy;
    state: TavoloState;
    x: number;
    y: number;
}

export interface TavoloEdgeData {
    from: string;
    to: string;
    rel: TavoloRel;
    label?: string | null;
    strength: number;
    hypothesis: boolean;
    // Vale anche dall'altra parte: due punte invece di una.
    reciprocal?: boolean;
    by: TavoloBy;
    state: TavoloState;
}

export interface TavoloGraph {
    title: string;
    nodes: TavoloNodeData[];
    edges: TavoloEdgeData[];
}

export interface TavoloView {
    id: string;
    title: string | null;
    saved: boolean;
    origin_session_id: string | null;
    origin_instrument: string | null;
    index: number;
    graph: TavoloGraph;
    rendition: string | null;
    has_capture: boolean;
    note?: string | null;
}

export interface TavoloSummary {
    id: string;
    title: string | null;
    origin_instrument: string | null;
    has_capture: boolean;
    saved_at: string | null;
}

export const familyOf = (rel: TavoloRel): TavoloFamily => REL_FAMILY[rel];

export const edgeKey = (edge: TavoloEdgeData): string => `${edge.from}->${edge.to}`;

/** Cio' che conta come contenuto: le proposte in sospeso non sono ancora del tavolo. */
export function liveGraph(graph: TavoloGraph): TavoloGraph {
    const nodes = graph.nodes.filter((node) => node.state === 'live');
    const alive = new Set(nodes.map((node) => node.id));
    return {
        title: graph.title,
        nodes,
        edges: graph.edges.filter((edge) => edge.state === 'live' && alive.has(edge.from) && alive.has(edge.to)),
    };
}

export const pendingIds = (graph: TavoloGraph): string[] => [
    ...graph.nodes.filter((node) => node.state === 'pending').map((node) => node.id),
    ...graph.edges.filter((edge) => edge.state === 'pending').map(edgeKey),
];

async function json<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { detail?: string };
        const error = new Error(data.detail || `HTTP ${response.status}`);
        (error as Error & { status?: number }).status = response.status;
        throw error;
    }
    return response.json() as Promise<T>;
}

const post = (path: string, body: unknown) => apiFetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export const createTavolo = (body: {
    session_id?: string; instrument?: string; title?: string; lang?: string;
    counselor_id?: number;
    // I due semi, esclusivi: la mappa di Idea arriva come contenuto, il testo
    // di una chat come proposta da accettare pezzo per pezzo.
    idea_map?: unknown; source_text?: string;
}) => post('/api/tavolo', body).then((response) => json<TavoloView>(response));

export const fetchTavolo = (id: string) =>
    apiFetch(`/api/tavolo/${encodeURIComponent(id)}`).then((response) => json<TavoloView>(response));

export const listTavoli = () =>
    apiFetch('/api/tavolo').then((response) => json<TavoloSummary[]>(response));

// Se la funzione e' spenta gli endpoint rispondono 404, e i bottoni devono
// sparire invece di portare a un vicolo cieco. Non c'e' un canale per i flag
// verso il browser, quindi lo si chiede all'elenco: la promessa e' memorizzata
// qui perche' il bottone compare una volta per messaggio, e senza questa cache
// una conversazione lunga farebbe una richiesta per bolla.
let probe: Promise<boolean> | null = null;
export function tavoloEnabled(): Promise<boolean> {
    probe ??= apiFetch('/api/tavolo').then((response) => response.ok).catch(() => false);
    return probe;
}

export const writeTavolo = (id: string, graph: TavoloGraph, baseIndex: number) =>
    apiFetch(`/api/tavolo/${encodeURIComponent(id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph, base_index: baseIndex }),
    }).then((response) => json<TavoloView>(response));

export const settleTavolo = (id: string, ids: string[], action: 'accept' | 'reject', baseIndex: number) =>
    post(`/api/tavolo/${encodeURIComponent(id)}/settle`, { ids, action, base_index: baseIndex })
        .then((response) => json<TavoloView>(response));

export const suggestTavolo = (id: string, body: {
    intent: TavoloIntent; counselor_id?: number; lang: string; base_index: number;
}) => post(`/api/tavolo/${encodeURIComponent(id)}/suggest`, body).then((response) => json<TavoloView>(response));

export const saveTavolo = (id: string, title: string, lang: string) =>
    post(`/api/tavolo/${encodeURIComponent(id)}/save`, { title, lang })
        .then((response) => json<TavoloView>(response));

/** La cattura e' facoltativa: se fallisce, il tavolo resta salvato con la sua resa a parole. */
export async function uploadCapture(id: string, png: Blob): Promise<boolean> {
    const form = new FormData();
    form.append('file', png, `${id}.png`);
    const response = await apiFetch(`/api/tavolo/${encodeURIComponent(id)}/capture`, {
        method: 'POST', body: form,
    });
    return response.ok;
}
