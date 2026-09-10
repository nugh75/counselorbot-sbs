import type { Lang } from './i18n';

export const DEFAULT_VOICES: Record<Lang, string> = {
    it: 'it-IT-IsabellaNeural', en: 'en-US-AriaNeural', es: 'es-ES-ElviraNeural',
    fr: 'fr-FR-DeniseNeural', de: 'de-DE-KatjaNeural', sv: 'sv-SE-SofieNeural',
};
export const PIPER_VOICES: Record<Lang, string> = {
    it: 'it_IT-paola-medium', en: 'en_US-lessac-medium', es: 'es_ES-davefx-medium',
    fr: 'fr_FR-siwis-medium', de: 'de_DE-thorsten-medium', sv: 'sv_SE-nst-medium',
};

// Read a snapshot of the visible page. Form drafts, navigation, hidden panels,
// live logs and controls do not become speech input. Chats have explicit buttons.
export function pageReadingText(root: HTMLElement): string {
    const excluded = 'script, style, svg, button, input, textarea, select, nav, pre, [role="log"], [role="status"], [aria-live], [aria-hidden="true"], [hidden], [inert], [contenteditable], [data-voice-ignore], .sr-only';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const lines: string[] = [];
    let block: Element | null = null;
    let node;
    while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        const text = node.textContent;
        if (!parent || !text?.trim() || parent.closest(excluded) || !parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        const nextBlock = parent.closest('p, li, h1, h2, h3, h4, h5, h6, tr, dt, dd, blockquote, section, article, div');
        if (nextBlock !== block && lines.length) lines.push('\n\n');
        lines.push(text);
        block = nextBlock;
    }
    return lines.join('').replace(/[ \t]+/g, ' ').trim();
}
