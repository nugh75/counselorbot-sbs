'use client';
import { useEffect, useRef } from 'react';

/** Protect an explicit-save draft across links, browser history and tab closing. */
export function useDraftGuard(dirty: boolean, message: string, { blocked = false, preserveFocus = false } = {}) {
    const messageRef = useRef(message);
    const blockedRef = useRef(blocked);
    const focusRef = useRef(preserveFocus);
    useEffect(() => { messageRef.current = message; }, [message]);
    useEffect(() => { blockedRef.current = blocked; }, [blocked]);
    useEffect(() => { focusRef.current = preserveFocus; }, [preserveFocus]);
    useEffect(() => {
        if (!dirty) return;
        const currentUrl = window.location.href;
        const currentState = window.history.state;
        let approved = '';
        let restoreFocus: (() => void) | undefined;
        const navigation = (window as Window & { navigation?: EventTarget }).navigation;
        const marker = crypto.randomUUID();
        // A same-page entry prevents the router from unmounting the form before
        // older browsers deliver popstate to this component.
        if (!navigation) window.history.pushState({ ...currentState, draftGuard: marker }, '', currentUrl);
        const leavesPage = (href: string) => {
            const from = new URL(currentUrl); const to = new URL(href, currentUrl);
            return from.origin !== to.origin || from.pathname !== to.pathname || from.search !== to.search;
        };
        const accept = (href: string) => {
            if (!leavesPage(href)) return true;
            // Opt-in for an explicit save that must finish before unmounting.
            if (blockedRef.current) return false;
            if (approved === href) return true;
            if (!window.confirm(messageRef.current)) return false;
            approved = href;
            return true;
        };
        const click = (event: MouseEvent) => {
            const restore = restoreFocus;
            restoreFocus = undefined;
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
            if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
            if (!accept(anchor.href)) {
                event.preventDefault(); event.stopImmediatePropagation(); restore?.();
            }
        };
        // Capture before a pointer focuses the link; keyboard activation keeps
        // focus on that link. Enabled only by forms that request this behavior.
        const pointer = (event: PointerEvent) => {
            restoreFocus = undefined;
            if (!focusRef.current || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
                || !(event.target instanceof Element) || !event.target.closest('a[href]')) return;
            const active = document.activeElement;
            if (!(active instanceof HTMLElement)) return;
            const text = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement ? active : null;
            const start = text?.selectionStart; const end = text?.selectionEnd; const direction = text?.selectionDirection;
            restoreFocus = () => {
                active.focus({ preventScroll: true });
                if (text && start != null && end != null) text.setSelectionRange(start, end, direction ?? undefined);
            };
        };
        const unload = (event: BeforeUnloadEvent) => {
            if (!approved) { event.preventDefault(); event.returnValue = ''; }
        };
        const navigate = (event: Event) => {
            const destination = (event as Event & { destination: { url: string } }).destination;
            if (event.cancelable && !accept(destination.url)) event.preventDefault();
        };
        // Also covers older browsers and non-cancelable same-document traversals.
        const pop = (event: PopStateEvent) => {
            if (!navigation && !approved && !leavesPage(window.location.href)) {
                event.stopImmediatePropagation();
                if (!blockedRef.current && window.confirm(messageRef.current)) { approved = '*'; window.history.back(); }
                else window.history.pushState({ ...currentState, draftGuard: marker }, '', currentUrl);
                return;
            }
            if (approved === '*' || accept(window.location.href)) return;
            event.stopImmediatePropagation();
            window.history.pushState(currentState, '', currentUrl);
        };
        window.addEventListener('click', click, true);
        window.addEventListener('pointerdown', pointer, true);
        window.addEventListener('beforeunload', unload);
        window.addEventListener('popstate', pop, true);
        navigation?.addEventListener('navigate', navigate);
        return () => {
            window.removeEventListener('click', click, true);
            window.removeEventListener('pointerdown', pointer, true);
            window.removeEventListener('beforeunload', unload);
            window.removeEventListener('popstate', pop, true);
            navigation?.removeEventListener('navigate', navigate);
            if (!navigation && window.history.state?.draftGuard === marker && window.location.href === currentUrl) window.history.back();
        };
    }, [dirty]);
}
