import type { Lang } from './i18n';

export const DEFAULT_VOICES: Record<Lang, string> = {
    it: 'it-IT-IsabellaNeural', en: 'en-US-AriaNeural', es: 'es-ES-ElviraNeural',
    fr: 'fr-FR-DeniseNeural', de: 'de-DE-KatjaNeural', sv: 'sv-SE-SofieNeural',
};
export const PIPER_VOICES: Record<Lang, string> = {
    it: 'it_IT-paola-medium', en: 'en_US-lessac-medium', es: 'es_ES-davefx-medium',
    fr: 'fr_FR-siwis-medium', de: 'de_DE-thorsten-medium', sv: 'sv_SE-nst-medium',
};

export type ReadingBlock = { text: string; range: Range };
export const VOICE_EXCLUDED = 'script, style, svg, button, input, textarea, select, nav, pre, [role="status"], [aria-live], [aria-hidden="true"], [hidden], [inert], [contenteditable], [data-voice-ignore], .sr-only';

// Retain ranges in the original DOM: no duplicated transcript or replacement
// of React text nodes. A selection starts at its word, including inside links
// or emphasis. Page reading excludes chat logs; an explicit message may read one.
export function pageReadingSource(root: HTMLElement, start?: Range): { text: string; blocks: ReadingBlock[] } {
    const excluded = VOICE_EXCLUDED + (root.hasAttribute('data-voice-source') ? '' : ', [role="log"]');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const blocks: ReadingBlock[] = [];
    let block: Element | null = null;
    let range: Range | null = null;
    let text = '';
    const flush = () => {
        const clean = text.replace(/[ \t]+/g, ' ').trim();
        if (range && clean) blocks.push({ text: clean, range });
        text = ''; range = null;
    };
    let node;
    while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        const value = node.textContent ?? '';
        if (!parent || !value || parent.closest(excluded) || !parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        if (start && start.comparePoint(node, value.length) < 0) continue;
        const offset = start?.startContainer === node ? start.startOffset : 0;
        const nextBlock = parent.closest('p, li, h1, h2, h3, h4, h5, h6, tr, dt, dd, blockquote, section, article, div');
        if (nextBlock !== block) flush();
        block = nextBlock;
        const parts = value.slice(offset).split(/(\n\s*\n)/);
        let cursor = offset;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i % 2) flush();
            else if (part) {
                if (!range) { range = document.createRange(); range.setStart(node, cursor); }
                range.setEnd(node, cursor + part.length);
                text += part;
            }
            cursor += part.length;
        }
    }
    flush();
    return { text: blocks.map(b => b.text).join('\n\n'), blocks };
}

export function highlightReadingBlock(block: ReadingBlock): () => void {
    const node = block.range.commonAncestorContainer;
    const element = node instanceof HTMLElement ? node : node.parentElement;
    if (!element?.isConnected) return () => {};
    element.setAttribute('data-voice-active', 'true');
    if (typeof Highlight !== 'undefined' && CSS.highlights) CSS.highlights.set('voice-reading', new Highlight(block.range));
    else element.classList.add('voice-reading-fallback');
    return () => {
        element.removeAttribute('data-voice-active');
        element.classList.remove('voice-reading-fallback');
        if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.delete('voice-reading');
    };
}
