export type DiagramType = 'flow' | 'relation' | 'cycle' | 'hierarchy';

// Tipo di relazione dell'arco: decide il tratto con cui il backend lo disegna.
export type DiagramEdgeKind = 'drives' | 'strengthens' | 'weakens' | 'feedback' | 'link';
export type DiagramIcon = 'book' | 'brain' | 'check' | 'clock' | 'compass' | 'heart' | 'idea' | 'question' | 'shield' | 'target';

export const DIAGRAM_EDGE_KINDS: DiagramEdgeKind[] = ['drives', 'strengthens', 'weakens', 'feedback', 'link'];
export const DIAGRAM_ICONS: DiagramIcon[] = ['book', 'brain', 'check', 'clock', 'compass', 'heart', 'idea', 'question', 'shield', 'target'];
const DIAGRAM_ICON_SET = new Set<string>(DIAGRAM_ICONS);

export interface DiagramNode {
    id: string;
    label: string;
    accent?: boolean;
    icon?: DiagramIcon;
}

export interface DiagramEdge {
    from: string;
    to: string;
    label?: string;
    kind?: DiagramEdgeKind;
}

export interface DiagramSpec {
    type: DiagramType;
    title: string;
    nodes: DiagramNode[];
    edges?: DiagramEdge[];
}

export type DiagramContentSegment =
    | { kind: 'markdown'; content: string }
    | { kind: 'diagram'; spec: DiagramSpec }
    | { kind: 'provider-error' };

const DIAGRAM_TYPES = new Set<DiagramType>(['flow', 'relation', 'cycle', 'hierarchy']);
const DIAGRAM_FENCE_RE = /```diagram\s*([\s\S]*?)```/gi;

function isDiagramSpec(value: unknown): value is DiagramSpec {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<DiagramSpec>;
    if (!DIAGRAM_TYPES.has(candidate.type as DiagramType)) return false;
    if (typeof candidate.title !== 'string' || !candidate.title.trim()) return false;
    if (!Array.isArray(candidate.nodes) || candidate.nodes.length < 2 || candidate.nodes.length > 8) return false;
    if (!candidate.nodes.every((node) => (
        node
        && typeof node === 'object'
        && typeof node.id === 'string'
        && Boolean(node.id.trim())
        && typeof node.label === 'string'
        && Boolean(node.label.trim())
    ))) return false;
    if (candidate.edges !== undefined && !Array.isArray(candidate.edges)) return false;
    return true;
}

// Uno spec puo' arrivare dal testo di un messaggio o dalla risposta di
// `/diagram/from-message`: la validazione e' la stessa, cambia solo l'involucro.
export function parseDiagramSpec(value: unknown): DiagramSpec | null {
    if (!isDiagramSpec(value)) return null;
    return {
        ...value,
        // Un nome icona inventato non deve rompere il diagramma: il backend
        // applica la stessa allowlist e il nodo resta leggibile senza icona.
        nodes: value.nodes.map((node) => ({
            ...node,
            icon: typeof node.icon === 'string' && DIAGRAM_ICON_SET.has(node.icon)
                ? node.icon as DiagramIcon
                : undefined,
        })),
    };
}

function parseDiagramJson(raw: string): DiagramSpec | null {
    try {
        return parseDiagramSpec(JSON.parse(raw));
    } catch {
        return null;
    }
}

function isProviderErrorJson(raw: string): boolean {
    try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object') return false;
        const candidate = value as { message?: unknown; error?: unknown };
        const detail = typeof candidate.message === 'string'
            ? candidate.message
            : typeof candidate.error === 'string' ? candidate.error : '';
        return /model tried to call unavailable tool|rate limit|too many requests/i.test(detail);
    } catch {
        return false;
    }
}

function findObjectEnd(text: string, start: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
        const character = text[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '"') inString = false;
            continue;
        }
        if (character === '"') inString = true;
        else if (character === '{') depth += 1;
        else if (character === '}') {
            depth -= 1;
            if (depth === 0) return index;
        }
    }
    return -1;
}

function appendMarkdown(segments: DiagramContentSegment[], content: string) {
    if (!content) return;
    const previous = segments.at(-1);
    if (previous?.kind === 'markdown') previous.content += content;
    else segments.push({ kind: 'markdown', content });
}

function splitBareDiagrams(text: string): DiagramContentSegment[] {
    const segments: DiagramContentSegment[] = [];
    let searchCursor = 0;
    let emittedCursor = 0;

    while (searchCursor < text.length) {
        const start = text.indexOf('{', searchCursor);
        if (start < 0) break;
        const end = findObjectEnd(text, start);
        if (end < 0) break;
        const rawObject = text.slice(start, end + 1);
        const spec = parseDiagramJson(rawObject);
        if (!spec) {
            if (isProviderErrorJson(rawObject)) {
                appendMarkdown(segments, text.slice(emittedCursor, start));
                segments.push({ kind: 'provider-error' });
                emittedCursor = end + 1;
                searchCursor = end + 1;
                continue;
            }
            searchCursor = start + 1;
            continue;
        }
        appendMarkdown(segments, text.slice(emittedCursor, start));
        segments.push({ kind: 'diagram', spec });
        emittedCursor = end + 1;
        searchCursor = end + 1;
    }

    appendMarkdown(segments, text.slice(emittedCursor));
    return segments;
}

// La patch della mappa di Idea non e' un messaggio: il server la fonde nella
// mappa e la toglie dal testo salvato. Durante lo streaming, pero', il blocco
// arriva al browser mentre si scrive, e anche non chiuso: qui sparisce.
const IDEA_PATCH_FENCE_RE = /```idea\s*[\s\S]*?(?:```|$)/gi;

export function stripIdeaPatches(content: string): string {
    return content.replace(IDEA_PATCH_FENCE_RE, '');
}

export function splitDiagramContent(rawContent: string): DiagramContentSegment[] {
    const content = stripIdeaPatches(rawContent);
    const segments: DiagramContentSegment[] = [];
    let cursor = 0;

    for (const match of content.matchAll(DIAGRAM_FENCE_RE)) {
        const start = match.index ?? 0;
        for (const segment of splitBareDiagrams(content.slice(cursor, start))) {
            if (segment.kind === 'markdown') appendMarkdown(segments, segment.content);
            else segments.push(segment);
        }

        const spec = parseDiagramJson(match[1]);
        if (spec) segments.push({ kind: 'diagram', spec });
        else appendMarkdown(segments, match[0]);
        cursor = start + match[0].length;
    }

    for (const segment of splitBareDiagrams(content.slice(cursor))) {
        if (segment.kind === 'markdown') appendMarkdown(segments, segment.content);
        else segments.push(segment);
    }
    return segments.length ? segments : [{ kind: 'markdown', content }];
}

export function diagramContentForSpeech(content: string): string {
    return splitDiagramContent(content)
        .map((segment) => {
            if (segment.kind === 'markdown') return segment.content.trim();
            return '';
        })
        .filter(Boolean)
        .join('\n\n')
        .trim();
}

export function diagramEdgeKinds(spec: DiagramSpec): DiagramEdgeKind[] {
    const used = new Set<DiagramEdgeKind>(
        (spec.edges ?? []).map((edge) => edge.kind ?? 'drives'),
    );
    return used.size > 1 ? DIAGRAM_EDGE_KINDS.filter((kind) => used.has(kind)) : [];
}

export function completeDiagramEdges(spec: DiagramSpec): DiagramSpec {
    if (spec.edges?.length) return spec;

    const edges: DiagramEdge[] = [];
    if (spec.type === 'hierarchy') {
        for (const node of spec.nodes.slice(1)) edges.push({ from: spec.nodes[0].id, to: node.id });
    } else {
        for (let index = 0; index < spec.nodes.length - 1; index += 1) {
            edges.push({ from: spec.nodes[index].id, to: spec.nodes[index + 1].id });
        }
        if (spec.type === 'cycle') {
            edges.push({ from: spec.nodes.at(-1)!.id, to: spec.nodes[0].id });
        }
    }
    return { ...spec, edges };
}
