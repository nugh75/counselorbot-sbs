'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

// The conversation starts below the page controls, whose height changes with
// viewport width and language. Share the remaining height with either chat UI.
export function ChatViewport({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const viewport = window.visualViewport;
        let frame = 0;
        const measure = () => {
            // offsetTop ignores the entrance animation's temporary transform.
            let top = 0;
            for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
            const visibleTop = Math.max(0, top - (viewport?.pageTop ?? window.scrollY));
            element.style.setProperty('--chat-h', `max(0px, calc(${viewport?.height ?? window.innerHeight}px - ${visibleTop}px - 0.75rem - env(safe-area-inset-bottom, 0px)))`);
            // The existing layout keeps mobile navigation outside the chat;
            // ChatWorkspace includes it inside. Reserve space only for the former.
            const navigation = element.querySelector<HTMLElement>('.order-2.lg\\:hidden');
            const navigationHeight = navigation?.offsetParent
                ? navigation.offsetHeight + (parseFloat(getComputedStyle(navigation.parentElement!).rowGap) || 0)
                : 0;
            element.style.setProperty('--chat-mobile-h', `calc(var(--chat-h) - ${navigationHeight}px)`);
        };
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        };
        measure();
        const observer = new ResizeObserver(schedule);
        observer.observe(element.parentElement ?? element);
        window.addEventListener('resize', schedule);
        viewport?.addEventListener('resize', schedule);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener('resize', schedule);
            viewport?.removeEventListener('resize', schedule);
        };
    }, []);

    return <div ref={ref} className="chat-viewport min-w-0">{children}</div>;
}
