'use client';

// Textarea che cresce con il contenuto (parte da minRows, si espande fino a
// maxRows, poi scrolla). Usata nel taccuino e nell'input della chat.

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    value: string;
    minRows?: number;
    maxRows?: number;
}

export function AutoGrowTextarea({ value, minRows = 1, maxRows = 8, style, ...rest }: Props) {
    const ref = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        const cs = window.getComputedStyle(el);
        const lineHeight = parseFloat(cs.lineHeight) || 20;
        const extra = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
            + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
        const maxH = lineHeight * maxRows + extra;
        const next = Math.min(el.scrollHeight, maxH);
        el.style.height = `${next}px`;
        el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
    }, [value, maxRows]);

    return (
        <textarea
            ref={ref}
            value={value}
            rows={minRows}
            style={{ resize: 'none', ...style }}
            {...rest}
        />
    );
}
