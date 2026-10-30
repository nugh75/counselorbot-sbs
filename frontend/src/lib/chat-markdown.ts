// Model output may contain private metadata in a mislabeled JSON fence.
// Keep ordinary code and JSON examples intact; only the known private shape is hidden.
function privateRecommendations(raw: string): boolean {
    try {
        let value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        if (Object.keys(value).length === 1 && 'recommendations' in value) value = value.recommendations;
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const entries = Object.entries(value);
        return entries.length > 0
            && entries.every(([key, item]) => ['reading', 'strategy', 'notes'].includes(key) && Array.isArray(item))
            && ('notes' in value || ('reading' in value && 'strategy' in value));
    } catch { return false; }
}

// Some models wrap the reply in {"answer", "recommendations"}, in either key order:
// only the answer is visible. Objects with other keys are ordinary JSON.
function envelopeAnswer(raw: string): string | null {
    try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const answer = (value as { answer?: unknown }).answer;
        return typeof answer === 'string' && Object.keys(value).every(key => key === 'answer' || key === 'recommendations')
            ? answer : null;
    } catch { return null; }
}

function jsonObjectEnd(text: string, start: number): number {
    let depth = 0, inString = false, escaped = false;
    for (let index = start; index < text.length; index++) {
        const char = text[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
        } else if (char === '"') inString = true;
        else if (char === '{') depth++;
        else if (char === '}' && --depth === 0) return index + 1;
    }
    return -1;
}

function unwrapEnvelopes(text: string): string {
    let result = '';
    let cursor = 0;
    for (const match of text.matchAll(/\{\s*"(?:answer|recommendations)"\s*:/g)) {
        const start = match.index ?? 0;
        const end = start < cursor ? -1 : jsonObjectEnd(text, start);
        const answer = end < 0 ? null : envelopeAnswer(text.slice(start, end));
        if (answer === null) continue;
        const before = text.slice(cursor, start);
        // The same reply often precedes its envelope: keep it once.
        result += before.trimEnd().endsWith(answer.trim()) ? before.trimEnd() : before + answer;
        cursor = end;
    }
    return result + text.slice(cursor);
}

function normalizeProse(text: string): string {
    text = unwrapEnvelopes(text);
    const prose = text.split(/(`+[^`]*`+)/g).map((part, index) => index % 2 ? part : part.replace(/<\/?small(?:\s[^>]*)?>/gi, '')).join('');
    return prose.split('\n').map(line => {
        const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
        if (cells.length < 2 || !cells.every(cell => /^\s*:?-{3,}:?\s*$/.test(cell))) return line;
        return `| ${cells.map(cell => `${cell.trim().startsWith(':') ? ':' : ''}---${cell.trim().endsWith(':') ? ':' : ''}`).join(' | ')} |`;
    }).join('\n');
}

export function normalizeChatMarkdown(text: string): string {
    const blocks = /```([^\n`]*)\n([\s\S]*?)(```|$)|<recommendations(?:\s[^>]*)?>[\s\S]*?(?:<\/recommendations\s*>|$)/gi;
    let cursor = 0;
    let result = '';
    for (const match of text.matchAll(blocks)) {
        const start = match.index ?? 0;
        result += normalizeProse(text.slice(cursor, start));
        const language = match[1]?.trim().toLowerCase();
        const hidden = match[0].toLowerCase().startsWith('<recommendations') || language === 'recommendations'
            || (language === 'json' && (!match[3] || privateRecommendations(match[2])));
        const answer = language === 'json' && match[3] ? envelopeAnswer(match[2]) : null;
        if (answer !== null) result += answer;
        else if (!hidden) result += match[0];
        cursor = start + match[0].length;
    }
    return result + normalizeProse(text.slice(cursor));
}
