'use client';
import Image, { type StaticImageData } from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { guideUIText } from '@/lib/i18n-guide-ui';
import { guideImages } from '@/lib/guide-images';
import { guideExtraImages, guideImagePins } from '@/lib/guide-extra-images';
import type { GuideTask } from '@/lib/guide-tasks';

export function GuideFigure({task, title}: {task: GuideTask; title: string}) {
    const {lang} = useI18n();
    const l = (key: Parameters<typeof guideUIText>[1]) => guideUIText(lang, key);
    const images: Record<string, StaticImageData> = {...guideImages[lang], ...guideExtraImages[lang]};
    const image = images[task.image];
    const crop = task.crop || [0, 0, 1, 1];
    const previewWidth = Math.min(672, image?.width || 672, image ? 360 * image.width * crop[2] / (image.height * crop[3]) : 672);
    const pin = task.id === 'resume' || task.id === 'repeat' ? guideImagePins[lang][task.id] : null;
    const [zoom, setZoom] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const close = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!zoom) return;
        const previous = document.body.style.overflow;
        const restoreFocus = trigger.current;
        document.body.style.overflow = 'hidden';
        close.current?.focus();
        const keyboard = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setZoom(false);
            if (event.key === 'Tab') {event.preventDefault();close.current?.focus();}
        };
        document.addEventListener('keydown', keyboard);
        return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', keyboard); restoreFocus?.focus(); };
    }, [zoom]);
    if (!image) return null;
    return <figure className="max-w-2xl">
        <button ref={trigger} aria-label={`${l('zoom')}: ${title}`} onClick={() => setZoom(true)}
            className="block w-full max-w-full cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left" style={{maxWidth: previewWidth}}>
            <span className="relative block overflow-hidden" style={{aspectRatio: `${image.width * crop[2]} / ${image.height * crop[3]}`}}>
                <Image src={image} alt={title} width={image.width} height={image.height} unoptimized
                    className="absolute max-w-none" style={{width: `${100 / crop[2]}%`, height: 'auto', left: `${-100 * crop[0] / crop[2]}%`, top: `${-100 * crop[1] / crop[3]}%`}} />
                {pin && <span aria-hidden="true" className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ochre-600 font-mono text-xs font-bold text-white ring-2 ring-white" style={{left: `${pin.x * 100}%`, top: `${pin.y * 100}%`}}>2</span>}
            </span>
        </button>
        <figcaption className="mt-2 text-xs text-slate-600">{l('imageHint')}</figcaption>
        {zoom && <div role="dialog" aria-modal="true" aria-label={title} onClick={() => setZoom(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4 sm:p-8">
            <button ref={close} aria-label={l('close')} onClick={() => setZoom(false)}
                className="absolute top-3 right-3 z-10 flex h-[48px] w-[48px] items-center justify-center rounded-full bg-white text-slate-900"><X className="h-6 w-6" aria-hidden="true" /></button>
            <div className="relative h-full w-full" onClick={event => event.stopPropagation()}><Image src={image} alt={title} fill unoptimized className="object-contain" /></div>
        </div>}
    </figure>;
}
