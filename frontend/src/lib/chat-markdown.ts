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

function normalizeProse(text: string): string {
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
        if (!hidden) result += match[0];
        cursor = start + match[0].length;
    }
    return result + normalizeProse(text.slice(cursor));
}
