'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { personalAreaDescription, personalAreaName, personalAreaText } from '@/lib/i18n-personal-area';
import { personalAreaGroups, personalAreaImages, type PersonalAreaSlug } from '@/lib/personal-area';

// First used by Orientamento. Editable pages need their exit guards before adoption.
export function PersonalAreaHeader({ slug }: { slug: PersonalAreaSlug }) {
    const { lang } = useI18n();
    const [open, setOpen] = useState(false);
    const wrapper = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    const panelId = useId();
    const l = (key: Parameters<typeof personalAreaText>[1]) => personalAreaText(lang, key);
    const control = 'inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 dark:hover:bg-slate-800';

    useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [slug]);
    useEffect(() => {
        if (!open) return;
        closeButton.current?.focus({ preventScroll: true });
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
                trigger.current?.focus({ preventScroll: true });
            }
        };
        const onPointer = (event: PointerEvent) => {
            if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onPointer);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('pointerdown', onPointer);
        };
    }, [open]);

    return (
        <header data-personal-area-header className="space-y-5">
            <div ref={wrapper} className="relative flex items-center justify-between gap-2" onBlur={event => {
                if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
            }}>
                <Link href="/profilo" className={control}><ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />{l('title')}</Link>
                <button ref={trigger} type="button" className={control} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
                    {l('goTo')}<ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                </button>
                {open && <nav id={panelId} aria-label={l('goTo')} onBlur={event => {
                    if (event.relatedTarget instanceof Node && event.relatedTarget !== trigger.current && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
                }} className="absolute inset-x-0 top-full z-40 mt-2 max-h-[min(65dvh,calc(100dvh-12rem),36rem)] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-3 shadow-xl sm:left-auto sm:w-96 dark:border-slate-700 dark:bg-slate-900">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h2 className="px-2 font-semibold">{l('goTo')}</h2>
                        <button ref={closeButton} type="button" className={control} onClick={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }}>
                            <X className="h-4 w-4" aria-hidden />{l('close')}
                        </button>
                    </div>
                    {personalAreaGroups.map(group => <section key={group.id} className="mb-4 last:mb-0">
                        <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{l(group.id)}</h3>
                        <ul className="space-y-1">
                            {group.slugs.map(destination => {
                                const content = <><Image src={personalAreaImages[destination]} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" /><span className="min-w-0">{personalAreaName(lang, destination)}{destination === slug && <span className="block text-xs font-normal text-slate-600 dark:text-slate-300">{l('currentPage')}</span>}</span></>;
                                const row = 'flex min-h-12 items-center gap-3 rounded-lg px-2 py-1 text-sm';
                                return <li key={destination}>{destination === slug
                                    ? <span aria-current="page" className={`${row} bg-slate-100 font-semibold dark:bg-slate-800`}>{content}</span>
                                    : <Link prefetch={false} href={`/profilo/${destination}`} className={`${row} hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-600 dark:hover:bg-slate-800`}>{content}</Link>}</li>;
                            })}
                        </ul>
                    </section>)}
                </nav>}
            </div>
            <div className="grid grid-cols-[4rem_1fr] items-center gap-x-4 gap-y-3 sm:grid-cols-[4.5rem_1fr]">
                <Image src={personalAreaImages[slug]} alt="" width={72} height={72} className="h-16 w-16 object-contain sm:row-span-2 sm:h-18 sm:w-18" />
                <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold tracking-tight focus:outline-none sm:self-end">{personalAreaName(lang, slug)}</h1>
                <p className="col-span-2 text-sm text-slate-600 sm:col-span-1 sm:self-start dark:text-slate-400">{personalAreaDescription(lang, slug)}</p>
            </div>
        </header>
    );
}
