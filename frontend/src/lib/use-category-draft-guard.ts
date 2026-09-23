'use client';
import { useEffect, useRef } from 'react';

/** Protect this editor's explicit-save draft across links and browser history. */
export function useCategoryDraftGuard(dirty: boolean, message: string) {
    const messageRef = useRef(message);
    useEffect(() => { messageRef.current = message; }, [message]);
    useEffect(() => {
        if (!dirty) return;
        const currentUrl = window.location.href;
        const currentState = window.history.state;
        let approved = '';
        const navigation = (window as Window & { navigation?: EventTarget }).navigation;
        const marker = crypto.randomUUID();
        // A same-page entry prevents the router from unmounting the form before
        // older browsers deliver popstate to this component.
        if (!navigation) window.history.pushState({ ...currentState, categoryDraftGuard: marker }, '', currentUrl);
        const leavesPage = (href: string) => {
            const from = new URL(currentUrl); const to = new URL(href, currentUrl);
            return from.origin !== to.origin || from.pathname !== to.pathname || from.search !== to.search;
        };
        const accept = (href: string) => {
            if (!leavesPage(href) || approved === href) return true;
            if (!window.confirm(messageRef.current)) return false;
            approved = href;
            return true;
        };
        const click = (event: MouseEvent) => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
            if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
            if (!accept(anchor.href)) { event.preventDefault(); event.stopImmediatePropagation(); }
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
                if (window.confirm(messageRef.current)) { approved = '*'; window.history.back(); }
                else window.history.pushState({ ...currentState, categoryDraftGuard: marker }, '', currentUrl);
                return;
            }
            if (approved === '*' || accept(window.location.href)) return;
            event.stopImmediatePropagation();
            window.history.pushState(currentState, '', currentUrl);
        };
        window.addEventListener('click', click, true);
        window.addEventListener('beforeunload', unload);
        window.addEventListener('popstate', pop, true);
        navigation?.addEventListener('navigate', navigate);
        return () => {
            window.removeEventListener('click', click, true);
            window.removeEventListener('beforeunload', unload);
            window.removeEventListener('popstate', pop, true);
            navigation?.removeEventListener('navigate', navigate);
            if (!navigation && window.history.state?.categoryDraftGuard === marker && window.location.href === currentUrl) window.history.back();
        };
    }, [dirty]);
}
