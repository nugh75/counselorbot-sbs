import Image from 'next/image';
import { ILLUSTRATION_VIEWBOX, toolIllustration } from '@/lib/tool-illustrations';

/** Decorative tool illustration; falls back to the category image for unknown tools. */
export default function ToolIllustration({ id, category, className }: { id: string; category?: string; className?: string }) {
    const source = toolIllustration(id, category);
    if (source.kind === 'image') {
        return <Image src={source.src} alt="" aria-hidden="true" width={96} height={96} className={className} />;
    }
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
            dangerouslySetInnerHTML={{ __html: source.body }}
        />
    );
}
