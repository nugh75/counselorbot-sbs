'use client';

import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { DiagramSpec } from '@/lib/diagram-content';
import { diagramReadingWidth, focusDiagramNode, revealUpTo, svgAspectRatio, tagDiagramSvg } from '@/lib/diagram-svg';

export type DiagramPosition = { x: number; y: number };
const clampZoom = (zoom: number) => Math.max(0.25, Math.min(4, zoom));

/** One viewport for the card and the dialog; the parent retains its camera. */
export function DiagramViewport({ markup, spec, zoom, setZoom, reading, step, selected, onSelect,
    fullscreen, positionRef, reset, motion, label }: {
    markup: string; spec: DiagramSpec; zoom: number; setZoom: (zoom: number) => void;
    reading: boolean; step: number | null; selected: string | null;
    onSelect: (id: string | null) => void; fullscreen: boolean;
    positionRef: RefObject<DiagramPosition>; reset: number; motion: boolean; label: string;
}) {
    const viewport = useRef<HTMLDivElement>(null);
    const host = useRef<HTMLDivElement>(null);
    // Keep React from reinstalling the SVG and erasing its interactive attributes on resize.
    const innerHtml = useMemo(() => ({ __html: markup }), [markup]);
    const [size, setSize] = useState({ width: 320, height: 320 });
    const ratio = svgAspectRatio(markup) ?? 1;
    const fit = Math.min(Math.max(1, size.width - 24), Math.max(1, size.height - 24) * ratio);
    const width = (reading ? Math.max(fit, diagramReadingWidth(markup)) : fit) * zoom;
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
    const pinch = useRef<{ distance: number; zoom: number; nextZoom: number; x: number; y: number;
        originX: number; originY: number; width: number; height: number } | null>(null);
    const suppressClick = useRef(false);

    useLayoutEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const observer = new ResizeObserver(() => setSize(previous =>
            previous.width === element.clientWidth && previous.height === element.clientHeight
                ? previous : { width: element.clientWidth, height: element.clientHeight }));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useLayoutEffect(() => {
        const svg = host.current?.querySelector('svg');
        if (!svg) return;
        svg.setAttribute('role', 'group');
        svg.setAttribute('aria-label', spec.title);
        tagDiagramSvg(svg, spec);
        revealUpTo(svg, step);
        focusDiagramNode(svg, selected);
        for (const node of svg.querySelectorAll('.dg-node')) {
            node.classList.toggle('dg-current', step !== null && Number(node.getAttribute('data-dg-step')) === step);
        }
    }, [markup, spec, step, selected]);

    useLayoutEffect(() => {
        const element = viewport.current;
        if (!element) return;
        element.scrollLeft = positionRef.current.x * element.scrollWidth - element.clientWidth / 2;
        element.scrollTop = positionRef.current.y * element.scrollHeight - element.clientHeight / 2;
    }, [width, size.height, positionRef, reset]);

    useLayoutEffect(() => {
        const element = viewport.current;
        const current = selected
            ? [...(host.current?.querySelectorAll('.dg-node') ?? [])].find(node => node.getAttribute('data-node') === selected)
            : host.current?.querySelector(`.dg-node[data-dg-step="${step}"]`);
        if ((!selected && step === null) || !element || !current) return;
        const bounds = current.getBoundingClientRect();
        const frame = element.getBoundingClientRect();
        element.scrollLeft += bounds.left + bounds.width / 2 - frame.left - element.clientWidth / 2;
        element.scrollTop += bounds.top + bounds.height / 2 - frame.top - element.clientHeight / 2;
    }, [step, selected, markup, size.width, size.height]);

    const remember = () => {
        const element = viewport.current;
        if (!element || pinch.current) return;
        positionRef.current = {
            x: (element.scrollLeft + element.clientWidth / 2) / element.scrollWidth,
            y: (element.scrollTop + element.clientHeight / 2) / element.scrollHeight,
        };
    };

    const start = (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || (event.pointerType === 'touch' && !fullscreen)) return;
        suppressClick.current = false;
        const element = event.currentTarget;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        drag.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop, moved: false };
        if (pointers.current.size === 2 && host.current) {
            const [a, b] = [...pointers.current.values()];
            const bounds = host.current.getBoundingClientRect();
            const x = (a.x + b.x) / 2;
            const y = (a.y + b.y) / 2;
            pinch.current = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom,
                nextZoom: zoom, x, y, originX: x - bounds.left, originY: y - bounds.top,
                width: bounds.width, height: bounds.height };
            host.current.style.transformOrigin = `${x - bounds.left}px ${y - bounds.top}px`;
            for (const id of pointers.current.keys()) element.setPointerCapture(id);
            suppressClick.current = true;
        }
    };

    const move = (event: PointerEvent<HTMLDivElement>) => {
        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const gesture = pinch.current;
        if (gesture && host.current && pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            gesture.nextZoom = clampZoom(gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance);
            // Preview on the compositor; commit layout once when the fingers lift.
            host.current.style.transform = `translate(${(a.x + b.x) / 2 - gesture.x}px, ${(a.y + b.y) / 2 - gesture.y}px) scale(${gesture.nextZoom / gesture.zoom})`;
            return;
        }
        const pan = drag.current;
        if (!pan) return;
        if (Math.hypot(event.clientX - pan.x, event.clientY - pan.y) > 4) {
            pan.moved = true;
            suppressClick.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.scrollLeft = pan.left - (event.clientX - pan.x);
            event.currentTarget.scrollTop = pan.top - (event.clientY - pan.y);
        }
    };

    const end = (event: PointerEvent<HTMLDivElement>) => {
        const gesture = pinch.current;
        if (gesture && host.current) {
            if (event.type !== 'pointercancel') {
                const points = [...pointers.current.values()];
                const bounds = event.currentTarget.getBoundingClientRect();
                const midX = points.reduce((sum, point) => sum + point.x, 0) / points.length - bounds.left;
                const midY = points.reduce((sum, point) => sum + point.y, 0) / points.length - bounds.top;
                const scale = gesture.nextZoom / gesture.zoom;
                positionRef.current = {
                    x: (gesture.originX + (size.width / 2 - midX) / scale) / gesture.width,
                    y: (gesture.originY + (size.height / 2 - midY) / scale) / gesture.height,
                };
                setZoom(gesture.nextZoom);
            }
            host.current.style.transform = '';
            host.current.style.transformOrigin = '';
        }
        for (const id of pointers.current.keys()) {
            if (event.currentTarget.hasPointerCapture(id)) event.currentTarget.releasePointerCapture(id);
        }
        pointers.current.clear();
        pinch.current = null;
        drag.current = null;
    };

    return <div ref={viewport} role="region" aria-label={label} tabIndex={0}
        data-diagram-viewport data-reading={reading}
        className={`dg-fit flex w-full min-w-0 overflow-auto p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${fullscreen ? 'min-h-40 flex-1' : 'h-[clamp(16rem,52dvh,30rem)]'} ${reading || zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ touchAction: fullscreen ? 'none' : 'auto' }}
        onScroll={remember} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
        onClickCapture={event => { if (suppressClick.current) { event.stopPropagation(); suppressClick.current = false; } }}
        onClick={event => {
            const node = (event.target as Element).closest('.dg-node');
            if (node && !node.classList.contains('dg-hidden')) {
                const id = node.getAttribute('data-node');
                onSelect(id === selected ? null : id);
            }
        }}
        onKeyDown={event => {
            if (event.key === 'Escape' && selected) { event.stopPropagation(); onSelect(null); return; }
            const node = (event.target as Element).closest('.dg-node');
            if (!node) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const id = node.getAttribute('data-node');
                onSelect(id === selected ? null : id);
            } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const nodes = [...(host.current?.querySelectorAll<SVGElement>('.dg-node:not(.dg-hidden)') ?? [])];
                const index = nodes.indexOf(node as SVGElement);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1
                    : Math.max(0, Math.min(nodes.length - 1, index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1)));
                nodes[next]?.focus();
            }
        }}>
        <div ref={host} className={`dg-svg shrink-0 ${motion ? 'dg-motion-enabled' : 'dg-motion-static'}`}
            style={{ width }} dangerouslySetInnerHTML={innerHtml} />
    </div>;
}
