export type DiagramType = 'flow' | 'relation' | 'cycle' | 'hierarchy';

export interface DiagramNode {
    id: string;
    label: string;
    accent?: boolean;
}

export interface DiagramEdge {
    from: string;
    to: string;
    label?: string;
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

function parseDiagramJson(raw: string): DiagramSpec | null {
    try {
        const value: unknown = JSON.parse(raw);
        return isDiagramSpec(value) ? value : null;
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

export function splitDiagramContent(content: string): DiagramContentSegment[] {
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
            if (segment.kind === 'markdown') return segment.content;
            if (segment.kind === 'provider-error') return '';
            return `${segment.spec.title}. ${segment.spec.nodes.map((node) => node.label).join('. ')}.`;
        })
        .join('\n\n')
        .trim();
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
