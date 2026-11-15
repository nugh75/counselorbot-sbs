import { ILLUSTRATION_VIEWBOX, toolIllustration } from '@/lib/tool-illustrations';

/** Decorative illustration for a tool or area entry; falls back to the category illustration for unknown tools. */
export default function ToolIllustration({ id, category, className }: { id: string; category?: string; className?: string }) {
    return (
        <svg
            viewBox={ILLUSTRATION_VIEWBOX}
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="var(--i-out)"
            strokeWidth={2.5}
            strokeLinejoin="miter"
            strokeLinecap="butt"
            className={className}
            dangerouslySetInnerHTML={{ __html: toolIllustration(id, category) }}
        />
    );
}
